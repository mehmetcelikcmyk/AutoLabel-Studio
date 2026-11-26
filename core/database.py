import json
import threading
import urllib.request as _urllib_req
import urllib.error as _urllib_err
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional
from core.config import TOKEN_LIFETIME_DAYS, load_settings

_USERS_LOCK = threading.Lock()
_R2_CLIENT_LOCK = threading.Lock()  # R2 client cache için thread-safe kilit


def require_cloudflare_d1() -> Dict[str, Any]:
    """Return validated D1 configuration; never silently use local persistence."""
    settings = load_settings()
    required = ("cloudflare_api_token", "cloudflare_account_id", "cloudflare_database_id")
    if not all(settings.get(key) for key in required):
        raise RuntimeError("Cloudflare D1 is required but not fully configured.")
    return settings

def cf_d1_query(sql: str, params: Optional[List[Any]] = None) -> Optional[List[Dict[str, Any]]]:
    """Execute SQL query on Cloudflare D1 SQL Database with automatic retry and resilient timeout."""
    settings = require_cloudflare_d1()
    token = settings.get("cloudflare_api_token")
    account_id = settings.get("cloudflare_account_id")
    db_id = settings.get("cloudflare_database_id")
    url = f"https://api.cloudflare.com/client/v4/accounts/{account_id}/d1/database/{db_id}/query"
    payload = {"sql": sql}
    if params:
        payload["params"] = params

    max_attempts = 2
    for attempt in range(1, max_attempts + 1):
        try:
            req = _urllib_req.Request(
                url,
                data=json.dumps(payload).encode("utf-8"),
                headers={
                    "Authorization": f"Bearer {token}",
                    "Content-Type": "application/json"
                }
            )
            with _urllib_req.urlopen(req, timeout=6) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                if data.get("success") and data.get("result"):
                    return data["result"][0].get("results", [])
                errors = data.get("errors", [])
                print(f"[D1 Query Error] SQL: {sql} | Errors: {errors}")
                raise RuntimeError(f"Cloudflare D1 query error: {errors}")
        except _urllib_err.HTTPError as he:
            body = ""
            try:
                body = he.read().decode("utf-8", errors="ignore")
            except Exception:
                pass
            if attempt < max_attempts and he.code in (500, 502, 503, 504):
                import time
                time.sleep(0.35 * attempt)
                continue
            print(f"[D1 HTTPError {he.code}] {body} | SQL: {sql}")
            raise RuntimeError(f"Cloudflare D1 HTTP {he.code}: {body}") from he
        except Exception as e:
            if attempt < max_attempts:
                import time
                time.sleep(0.5)
                continue
            print(f"[D1 Request Failed] {e} | SQL: {sql}")
            raise RuntimeError(f"Cloudflare D1 request failed: {e}") from e
    raise RuntimeError("Cloudflare D1 returned an invalid response.")

_r2_client_cache = None
_r2_client_cache_key = None

def _get_r2_client(account_id: str, access_key: str, secret_key: str):
    global _r2_client_cache, _r2_client_cache_key
    current_key = (account_id, access_key, secret_key)
    with _R2_CLIENT_LOCK:  # Thread-safe double-checked locking
        if _r2_client_cache is not None and _r2_client_cache_key == current_key:
            return _r2_client_cache
        try:
            import boto3
            from botocore.config import Config
            cfg = Config(
                signature_version="s3v4",
                connect_timeout=5,
                read_timeout=15,
                retries={"max_attempts": 2, "mode": "standard"}
            )
            client = boto3.client(
                "s3",
                endpoint_url=f"https://{account_id}.r2.cloudflarestorage.com",
                aws_access_key_id=access_key,
                aws_secret_access_key=secret_key,
                region_name="auto",
                config=cfg,
            )
            _r2_client_cache = client
            _r2_client_cache_key = current_key
            return client
        except Exception:
            return None

def cf_r2_upload(file_bytes: bytes, object_key: str, content_type: str = "image/jpeg") -> bool:
    """Store binary data privately in R2 through its S3-compatible API. Gracefully returns False if not configured."""
    if not file_bytes or len(file_bytes) > 25 * 1024 * 1024:
        return False
    try:
        settings = load_settings()
        account_id = settings.get("cloudflare_account_id", "")
        bucket = settings.get("cloudflare_r2_bucket", "")
        access_key = settings.get("cloudflare_r2_access_key_id", "")
        secret_key = settings.get("cloudflare_r2_secret_access_key", "")
        if not all((account_id, bucket, access_key, secret_key)):
            return False
        safe_key = "/".join(part for part in object_key.split("/") if part and part not in (".", ".."))
        if not safe_key or ".." in safe_key:
            return False
        
        client = _get_r2_client(account_id, access_key, secret_key)
        if not client:
            return False

        client.put_object(
            Bucket=bucket,
            Key=safe_key,
            Body=file_bytes,
            ContentType=content_type,
            ServerSideEncryption="AES256",
        )
        return True
    except Exception:
        return False

def cf_r2_generate_presigned_put_url(object_key: str, content_type: str = "image/jpeg", expires_in: int = 900) -> Optional[str]:
    """Doğrudan istemciden Cloudflare R2'ye yükleme (Direct-to-R2) için imzalı S3 PUT URL'i üretir."""
    try:
        settings = load_settings()
        account_id = settings.get("cloudflare_account_id", "")
        bucket = settings.get("cloudflare_r2_bucket", "")
        access_key = settings.get("cloudflare_r2_access_key_id", "")
        secret_key = settings.get("cloudflare_r2_secret_access_key", "")
        if not all((account_id, bucket, access_key, secret_key)):
            return None
        safe_key = "/".join(part for part in object_key.split("/") if part and part not in (".", ".."))
        if not safe_key or ".." in safe_key:
            return None
        client = _get_r2_client(account_id, access_key, secret_key)
        if not client:
            return None
        url = client.generate_presigned_url(
            ClientMethod="put_object",
            Params={
                "Bucket": bucket,
                "Key": safe_key,
                "ContentType": content_type
            },
            ExpiresIn=expires_in
        )
        return url
    except Exception as e:
        print(f"[R2 Presigned PUT Error] {e}")
        return None

def cf_r2_generate_presigned_get_url(object_key: str, expires_in: int = 3600) -> Optional[str]:
    """Cloudflare R2 nesnesini güvenli okumak için imzalı S3 GET URL'i üretir."""
    try:
        settings = load_settings()
        account_id = settings.get("cloudflare_account_id", "")
        bucket = settings.get("cloudflare_r2_bucket", "")
        access_key = settings.get("cloudflare_r2_access_key_id", "")
        secret_key = settings.get("cloudflare_r2_secret_access_key", "")
        if not all((account_id, bucket, access_key, secret_key)):
            return None
        safe_key = "/".join(part for part in object_key.split("/") if part and part not in (".", ".."))
        if not safe_key or ".." in safe_key:
            return None
        client = _get_r2_client(account_id, access_key, secret_key)
        if not client:
            return None
        url = client.generate_presigned_url(
            ClientMethod="get_object",
            Params={
                "Bucket": bucket,
                "Key": safe_key
            },
            ExpiresIn=expires_in
        )
        return url
    except Exception as e:
        print(f"[R2 Presigned GET Error] {e}")
        return None

def cf_r2_get_object(object_key: str) -> Optional[bytes]:
    """Fetch binary data from Cloudflare R2."""
    try:
        settings = load_settings()
        account_id = settings.get("cloudflare_account_id", "")
        bucket = settings.get("cloudflare_r2_bucket", "")
        access_key = settings.get("cloudflare_r2_access_key_id", "")
        secret_key = settings.get("cloudflare_r2_secret_access_key", "")
        if not all((account_id, bucket, access_key, secret_key)):
            return None
        safe_key = "/".join(part for part in object_key.split("/") if part and part not in (".", ".."))
        if not safe_key or ".." in safe_key:
            return None
        client = _get_r2_client(account_id, access_key, secret_key)
        if not client:
            return None
        resp = client.get_object(Bucket=bucket, Key=safe_key)
        return resp["Body"].read()
    except Exception:
        return None

def cf_r2_delete_object(object_key: str) -> bool:
    """Delete an object from Cloudflare R2."""
    try:
        settings = load_settings()
        account_id = settings.get("cloudflare_account_id", "")
        bucket = settings.get("cloudflare_r2_bucket", "")
        access_key = settings.get("cloudflare_r2_access_key_id", "")
        secret_key = settings.get("cloudflare_r2_secret_access_key", "")
        if not all((account_id, bucket, access_key, secret_key)):
            return False
        safe_key = "/".join(part for part in object_key.split("/") if part and part not in (".", ".."))
        if not safe_key or ".." in safe_key:
            return False
        client = _get_r2_client(account_id, access_key, secret_key)
        if not client:
            return False
        client.delete_object(Bucket=bucket, Key=safe_key)
        return True
    except Exception:
        return False


def cf_r2_delete_prefix(prefix: str) -> int:
    """Delete all objects in Cloudflare R2 under the given prefix using 1000-key batch deletes."""
    deleted_total = 0
    try:
        settings = load_settings()
        account_id = settings.get("cloudflare_account_id", "")
        bucket = settings.get("cloudflare_r2_bucket", "")
        access_key = settings.get("cloudflare_r2_access_key_id", "")
        secret_key = settings.get("cloudflare_r2_secret_access_key", "")
        if not all((account_id, bucket, access_key, secret_key)):
            return 0
        safe_prefix = "/".join(part for part in prefix.split("/") if part and part not in (".", ".."))
        if not safe_prefix or ".." in safe_prefix:
            return 0
        safe_prefix = safe_prefix.rstrip("/") + "/"
        client = _get_r2_client(account_id, access_key, secret_key)
        if not client:
            return 0
        paginator = client.get_paginator("list_objects_v2")
        for page in paginator.paginate(Bucket=bucket, Prefix=safe_prefix):
            contents = page.get("Contents", [])
            if not contents:
                continue
            keys = [{"Key": obj["Key"]} for obj in contents if obj.get("Key")]
            for i in range(0, len(keys), 1000):
                chunk = keys[i:i + 1000]
                client.delete_objects(Bucket=bucket, Delete={"Objects": chunk, "Quiet": True})
                deleted_total += len(chunk)
        return deleted_total
    except Exception as e:
        print(f"[R2 Delete Prefix Warning] {prefix}: {e}")
        return deleted_total

def cf_r2_list_objects(prefix: str = "", limit: int = 2000) -> List[Dict[str, Any]]:
    """Cloudflare R2 bucket'ındaki objeleri listeler."""
    try:
        settings = load_settings()
        account_id = settings.get("cloudflare_account_id", "")
        bucket = settings.get("cloudflare_r2_bucket", "")
        access_key = settings.get("cloudflare_r2_access_key_id", "")
        secret_key = settings.get("cloudflare_r2_secret_access_key", "")
        if not all((account_id, bucket, access_key, secret_key)):
            return []
        # Yeniden kullan — ayrı bir client oluşturmak yerine singleton cache'i kullan
        client = _get_r2_client(account_id, access_key, secret_key)
        if not client:
            return []
        paginator = client.get_paginator("list_objects_v2")
        page_iterator = paginator.paginate(
            Bucket=bucket,
            Prefix=prefix,
            PaginationConfig={"MaxItems": limit, "PageSize": 1000}
        )
        objects = []
        for page in page_iterator:
            for item in page.get("Contents", []):
                objects.append({
                    "key": item["Key"],
                    "size": item["Size"],
                    "last_modified": item["LastModified"].isoformat() if "LastModified" in item else None
                })
        return objects
    except Exception as err:
        return []

def is_token_valid(expires_at: str) -> bool:
    try:
        exp = datetime.fromisoformat(expires_at)
        if exp.tzinfo is None:
            exp = exp.replace(tzinfo=timezone.utc)
        return datetime.now(timezone.utc) < exp
    except Exception:
        return False

def load_users() -> Dict[str, Any]:
    """
    Kullanıcı verilerini doğrudan Cloudflare D1 bulut veritabanından çeker.
    Hassas kullanıcı profilleri asla yerelde saklanmaz.
    """
    with _USERS_LOCK:
        users = cf_d1_query("SELECT id, email, display_name, password_hash, salt, auth_provider, avatar_url, role, created_at FROM users")
        return {"users": users or [], "sessions": {}}

def save_users(data: Dict[str, Any]):
    """
    Kullanıcı verileri tamamen Cloudflare D1 üzerinde tutulduğu için
    yerel diske kullanıcı kaydı yapmaz; kullanıcı verilerinin gizliliğini korur.
    """
    pass

def cf_d1_save_batches(project_id: str, batches_data: list) -> bool:
    """Save project batches JSON directly to Cloudflare D1 SQL database."""
    try:
        cf_d1_query(
            "CREATE TABLE IF NOT EXISTS project_batches (project_id TEXT PRIMARY KEY, batches_json TEXT NOT NULL, updated_at TEXT NOT NULL)"
        )
        now_iso = datetime.now(timezone.utc).isoformat()
        b_str = json.dumps(batches_data, ensure_ascii=False)
        cf_d1_query(
            "INSERT INTO project_batches (project_id, batches_json, updated_at) VALUES (?, ?, ?) "
            "ON CONFLICT(project_id) DO UPDATE SET batches_json = excluded.batches_json, updated_at = excluded.updated_at",
            [project_id, b_str, now_iso]
        )
        return True
    except Exception as e:
        print(f"[D1 Batches Save Warning]: {e}")
        return False

def cf_d1_load_batches(project_id: str) -> Optional[list]:
    """Load project batches JSON directly from Cloudflare D1 SQL database."""
    try:
        rows = cf_d1_query("SELECT batches_json FROM project_batches WHERE project_id = ? LIMIT 1", [project_id])
        if rows and len(rows) > 0:
            return json.loads(rows[0]["batches_json"])
    except Exception:
        pass
    return None
