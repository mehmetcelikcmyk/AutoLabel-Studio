import json
import time
import secrets
import hashlib
import hmac
import threading
from datetime import datetime, timedelta, timezone
from typing import Dict, Any, Optional
from fastapi import HTTPException
from core.config import TOKEN_LIFETIME_DAYS, SLIDING_SESSION_MINUTES, TOKEN_LIFETIME_HOURS
from core.database import cf_d1_query, load_users, save_users, is_token_valid

_LOGIN_ATTEMPTS: Dict[str, list] = {}
_LOGIN_LOCK = threading.Lock()
MAX_LOGIN_ATTEMPTS = 10
LOGIN_WINDOW_SECS = 600

_PROJ_PERM_CACHE: Dict[str, Any] = {}
_PROJ_PERM_LOCK = threading.Lock()

_SESSION_TOUCH_CACHE: Dict[str, float] = {}
_SESSION_TOUCH_LOCK = threading.Lock()

_OWNER_ROLES = {"admin", "owner", "captain"}

def get_client_ip(request) -> str:
    """Cloudflare (CF-Connecting-IP) ve reverse proxy başlıklarını güvenli şekilde çözümler."""
    if not request:
        return "unknown"
    headers = getattr(request, "headers", {})
    # Cloudflare proxy
    cf_ip = headers.get("cf-connecting-ip")
    if cf_ip:
        return cf_ip.strip()
    # Standart reverse proxy
    real_ip = headers.get("x-real-ip")
    if real_ip:
        return real_ip.strip()
    forwarded = headers.get("x-forwarded-for")
    if forwarded:
        # İlk IP gerçek istemcidir
        return forwarded.split(",")[0].strip()
    if getattr(request, "client", None) and getattr(request.client, "host", None):
        return request.client.host
    return "unknown"

def check_rate_limit(ip: str):
    """Check if IP has exceeded the max allowed failed attempts in window."""
    now = time.time()
    with _LOGIN_LOCK:
        attempts = _LOGIN_ATTEMPTS.get(ip, [])
        attempts = [t for t in attempts if now - t < LOGIN_WINDOW_SECS]
        _LOGIN_ATTEMPTS[ip] = attempts
        if len(attempts) >= MAX_LOGIN_ATTEMPTS:
            raise HTTPException(
                status_code=429,
                detail=f"Çok fazla başarısız deneme. {LOGIN_WINDOW_SECS // 60} dakika sonra tekrar deneyin."
            )

def record_failed_attempt(ip: str):
    """Record a failed login attempt for rate limiting."""
    now = time.time()
    with _LOGIN_LOCK:
        attempts = _LOGIN_ATTEMPTS.get(ip, [])
        attempts = [t for t in attempts if now - t < LOGIN_WINDOW_SECS]
        attempts.append(now)
        _LOGIN_ATTEMPTS[ip] = attempts

def clear_login_attempts(ip: str):
    """Clear failed attempts upon successful login."""
    with _LOGIN_LOCK:
        _LOGIN_ATTEMPTS.pop(ip, None)

def hash_password(password: str, salt: str) -> str:
    try:
        dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 260_000)
        return dk.hex()
    except Exception:
        return hashlib.sha256(f"{salt}{password}".encode()).hexdigest()

def verify_password(password: str, salt: str, stored_hash: str) -> bool:
    new_hash_val = hash_password(password, salt)
    if hmac.compare_digest(new_hash_val, stored_hash):
        return True
    old_hash_val = hashlib.sha256(f"{salt}{password}".encode()).hexdigest()
    return hmac.compare_digest(old_hash_val, stored_hash)

def make_token() -> str:
    return secrets.token_urlsafe(48)


def hash_session_token(token: str) -> str:
    """D1 only receives a one-way token digest, never a bearer credential."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()

def token_expires(minutes: Optional[int] = None) -> str:
    """Token için son kullanma tarihi üretir (Sliding Session için varsayılan: SLIDING_SESSION_MINUTES)."""
    mins = minutes if minutes is not None else SLIDING_SESSION_MINUTES
    return (datetime.now(timezone.utc) + timedelta(minutes=mins)).isoformat()


def token_absolute_expires() -> str:
    return (datetime.now(timezone.utc) + timedelta(hours=TOKEN_LIFETIME_HOURS)).isoformat()

def find_user_by_email(users_data: Dict, email: str) -> Optional[Dict]:
    email_lower = email.strip().lower()
    if not users_data:
        users_data = load_users()
    for u in users_data.get("users", []):
        if u.get("email", "").lower() == email_lower:
            return u

    d1_res = cf_d1_query(
        "SELECT id, email, display_name, password_hash, salt, role, auth_provider, avatar_url, created_at FROM users WHERE LOWER(email) = ? LIMIT 1",
        [email_lower]
    )
    if d1_res and len(d1_res) > 0:
        return d1_res[0]
    return None

def get_current_user(authorization: Optional[str]) -> Optional[Dict]:
    """
    Oturumu doğrular ve Sliding Session mantığıyla
    kullanıcı aktif olduğu sürece token süresini otomatik uzatır.
    Sessions ve users tablosunu tek JOIN sorgusuyla alarak D1 çağrı sayısını ve gecikmeyi düşürür.
    """
    if not authorization or not isinstance(authorization, str):
        return None
    raw_auth = authorization.strip()
    token = raw_auth[7:].strip() if raw_auth.startswith("Bearer ") else raw_auth
    if not token:
        return None

    # 1. ÖNCE doğrudan Cloudflare D1'den canlı oturumu ve kullanıcıyı tek sorguda kontrol et
    try:
        query = (
            "SELECT s.token_hash, s.expires_at, s.absolute_expires_at, "
            "u.id, u.email, u.display_name, u.avatar_url, u.role, u.auth_provider "
            "FROM sessions s JOIN users u ON s.user_id = u.id "
            "WHERE s.token_hash = ? AND s.revoked_at IS NULL LIMIT 1"
        )
        d1_rows = cf_d1_query(query, [hash_session_token(token)])
        if d1_rows and len(d1_rows) > 0:
            sess_user = d1_rows[0]
            if is_token_valid(sess_user.get("expires_at", "")) and is_token_valid(sess_user.get("absolute_expires_at", "")):
                # SLIDING SESSION: Süreyi yalnızca belirli aralıklarla (en az 5 dakikada bir) güncelle
                token_h = hash_session_token(token)
                now_ts = time.time()
                should_touch = False
                with _SESSION_TOUCH_LOCK:
                    last_touch = _SESSION_TOUCH_CACHE.get(token_h, 0.0)
                    if now_ts - last_touch > 300.0:  # 5 dakika throttle: her eşzamanlı istekte D1'e UPDATE yazma
                        _SESSION_TOUCH_CACHE[token_h] = now_ts
                        should_touch = True

                if should_touch:
                    new_expires = token_expires(SLIDING_SESSION_MINUTES)
                    absolute = datetime.fromisoformat(sess_user["absolute_expires_at"])
                    sliding = datetime.fromisoformat(new_expires)
                    if sliding > absolute:
                        new_expires = absolute.isoformat()
                    try:
                        cf_d1_query("UPDATE sessions SET expires_at = ? WHERE token_hash = ?", [new_expires, token_h])
                    except Exception:
                        pass

                return {
                    "id": sess_user.get("id"),
                    "email": sess_user.get("email"),
                    "display_name": sess_user.get("display_name") or (sess_user.get("email", "").split("@")[0] if sess_user.get("email") else "User"),
                    "avatar_url": sess_user.get("avatar_url", ""),
                    "role": sess_user.get("role") or "user",
                    "auth_provider": sess_user.get("auth_provider") or "local"
                }
            else:
                # Süresi dolmuş oturumu anında D1'den temizle
                cf_d1_query("UPDATE sessions SET revoked_at = ? WHERE token_hash = ?", [datetime.now(timezone.utc).isoformat(), hash_session_token(token)])
                return None
    except Exception as e:
        print(f"[D1 Auth Check Warning] {e}")

    return None

def is_admin_user(user: Optional[Dict], email: Optional[str] = None) -> bool:
    """Doğrudan Cloudflare D1 SQL veritabanından kullanıcının admin olup olmadığını sorgular."""
    if not user and not email:
        return False
    u_email = (email or (user.get("email") if user else "")).strip().lower()
    if not u_email:
        return False

    if user and user.get("role") == "admin":
        return True

    try:
        d1_res = cf_d1_query("SELECT role FROM users WHERE LOWER(email) = ? LIMIT 1", [u_email])
        if d1_res and len(d1_res) > 0:
            db_role = (d1_res[0].get("role") or "").strip().lower()
            if db_role == "admin":
                if user is not None:
                    user["role"] = db_role
                return True
    except Exception as e:
        print(f"[is_admin_user D1 Error] {e}")

    return False

def require_admin(authorization: Optional[str]) -> Dict[str, Any]:
    user = get_current_user(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Yetkilendirme gerekli.")
    email = user.get("email", "").lower()
    if not is_admin_user(user, email):
        raise HTTPException(status_code=403, detail="Bu işlem için yönetici (Admin) yetkisi gereklidir.")
    return user

def user_can_access_project(project: Dict, user_email: Optional[str], user_role: Optional[str] = None) -> bool:
    # 1. Public visibility check (herkese acik projeler misafir erisimine uygundur)
    if project.get("visibility") == "public":
        return True
    if not user_email:
        return False
    clean_email = user_email.strip().lower()
    if is_admin_user({"role": user_role, "email": clean_email}, clean_email):
        return True
    # 2. Owner check
    proj_owner = (project.get("owner_email") or "").strip().lower()
    if proj_owner and proj_owner == clean_email:
        return True
    # 3. Team member check if project_members exists
    try:
        rows = cf_d1_query(
            "SELECT pm.role FROM project_members pm JOIN users u ON u.id = pm.user_id "
            "WHERE pm.project_id = ? AND LOWER(u.email) = ? LIMIT 1",
            [project.get("id"), clean_email],
        )
        return bool(rows)
    except Exception:
        return False

def get_project_role(category: str, user_email: str) -> str:
    """
    Kullanıcının belirli bir projede sahip olduğu rolü döndürür.
    Olası değerler: 'admin', 'owner', 'captain', 'member', 'annotator', 'none'
    """
    if not user_email:
        return "none"
    clean_email = user_email.strip().lower()
    clean_cat = category.strip()

    # 1. Admin kontrolü
    try:
        d1_res = cf_d1_query("SELECT role FROM users WHERE LOWER(email) = ? LIMIT 1", [clean_email])
        if d1_res and (d1_res[0].get("role") or "").strip().lower() == "admin":
            return "admin"
    except Exception:
        pass

    # 2. D1'de proje sahibi kontrolü
    try:
        proj_rows = cf_d1_query(
            "SELECT owner_email FROM projects WHERE id = ? LIMIT 1",
            [clean_cat],
        )
        if proj_rows:
            owner = (proj_rows[0].get("owner_email") or "").strip().lower()
            if owner == clean_email:
                return "owner"
    except Exception:
        pass

    # 3. Yerel config'de proje sahibi kontrolü
    try:
        from core.config import CONFIG_FILE
        if CONFIG_FILE.exists():
            with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                cfg = json.load(f)
            pinfo = cfg.get("projects", {}).get(clean_cat, {})
            p_owner = (pinfo.get("owner_email") or "").strip().lower()
            if p_owner and p_owner == clean_email:
                return "owner"
    except Exception:
        pass

    # 4. Takım rolü kontrolü (Cloudflare D1 üzerinden)
    try:
        from api.teams import _load_teams
        t_data = _load_teams()
        for team in t_data.get("teams", []):
            team_projects = [p.strip().lower() for p in team.get("projects", [])]
            if clean_cat.lower() in team_projects:
                captain = (team.get("captain") or "").strip().lower()
                if captain == clean_email:
                    return "captain"
                for m in team.get("members", []):
                    m_email = (m.get("email") or m.get("username") or "").strip().lower()
                    if m_email == clean_email:
                        return m.get("role") or "member"
    except Exception:
        pass

    # 5. D1 project_members kontrolü
    try:
        rows = cf_d1_query(
            "SELECT pm.role FROM project_members pm JOIN users u ON u.id = pm.user_id "
            "WHERE pm.project_id = ? AND LOWER(u.email) = ? LIMIT 1",
            [clean_cat, clean_email],
        )
        if rows:
            return rows[0].get("role") or "member"
    except Exception:
        pass

    return "none"


def check_project_permission(
    category: str,
    authorization: Optional[str] = None,
    require_edit: bool = False,
    require_owner: bool = False,
    query_token: Optional[str] = None
) -> Dict:
    """
    Proje erişim yetkisini kontrol eder ve kullanıcı bilgisini döndürür.

    - require_edit=False → Yalnızca okuma erişimi yeterlidir.
    - require_edit=True  → Proje üyesi olmak yeterlidir (annotator dahil).
    - require_owner=True → Yalnızca admin, proje sahibi (owner) veya takım kaptanı (captain) erişebilir.
    """
    auth_header = authorization if isinstance(authorization, str) else None
    if not auth_header and query_token and isinstance(query_token, str):
        auth_header = f"Bearer {query_token}"

    user = get_current_user(auth_header)
    clean_cat = category.strip()

    user_email = user.get("email", "").strip().lower() if user else None

    if user and is_admin_user(user, user_email):
        # Admin her şeye erişebilir
        user["project_role"] = "admin"
        return user

    # 1. Check local project_config.json first for instant zero-latency response
    try:
        from core.config import CONFIG_FILE, APP_ENV
        if CONFIG_FILE.exists():
            with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                cfg = json.load(f)
            projects_dict = cfg.get("projects", {})
            if clean_cat in projects_dict:
                pinfo = projects_dict[clean_cat]
                p_owner = (pinfo.get("owner_email") or "").strip().lower()
                if user_email and p_owner == user_email:
                    if user:
                        user["project_role"] = "owner"
                    return user
                if pinfo.get("visibility") == "public" and not require_owner and not require_edit:
                    result = user or {"role": "viewer", "email": "public_viewer"}
                    result["project_role"] = "viewer"
                    return result
                if APP_ENV != "production" and not require_owner and not require_edit:
                    result = user or {"role": "viewer", "email": "local_viewer"}
                    result["project_role"] = "viewer"
                    return result
    except Exception:
        pass

    # 2. Check projects table in Cloudflare D1 with in-memory cache
    try:
        now_ts = time.time()
        proj = None
        with _PROJ_PERM_LOCK:
            cached = _PROJ_PERM_CACHE.get(clean_cat)
            if cached and (now_ts - cached["ts"] < 60):
                proj = cached["data"]

        if proj is None:
            proj_rows = cf_d1_query(
                "SELECT id, owner_email, visibility FROM projects WHERE id = ? LIMIT 1",
                [clean_cat],
            )
            if proj_rows:
                proj = proj_rows[0]
                with _PROJ_PERM_LOCK:
                    _PROJ_PERM_CACHE[clean_cat] = {"data": proj, "ts": now_ts}

        if proj:
            owner = (proj.get("owner_email") or "").strip().lower()
            if user_email and owner == user_email:
                if user:
                    user["project_role"] = "owner"
                return user
            if proj.get("visibility") == "public" and not require_owner and not require_edit:
                result = user or {"role": "viewer", "email": "public_viewer"}
                result["project_role"] = "viewer"
                return result
    except Exception:
        pass

    # 2.5 Check team membership & project assignment (Cloudflare D1 üzerinden)
    try:
        from api.teams import _load_teams
        if user_email:
            t_data = _load_teams()
            for team in t_data.get("teams", []):
                team_projects = [p.strip().lower() for p in team.get("projects", [])]
                if clean_cat.lower() in team_projects:
                    members = team.get("members", [])
                    captain = (team.get("captain") or "").strip().lower()
                    is_captain = (captain == user_email)
                    is_member = False
                    member_project_role = "annotator"
                    for m in members:
                        m_email = (m.get("email") or "").strip().lower()
                        m_user  = (m.get("username") or "").strip().lower()
                        # Yalnızca doğrulanmış e-posta eşleşmesine izin ver (display_name taklit edilebilir)
                        matches = (
                            (m_email and user_email and m_email == user_email) or
                            (m_user  and user_email and m_user  == user_email)
                        )
                        if matches:
                            is_member = True
                            member_project_role = m.get("role") or "annotator"
                            break

                    if is_captain or is_member:
                        # Proje rolünü belirle
                        if is_captain:
                            project_role = "captain"
                        else:
                            project_role = member_project_role

                        # require_owner kontrolü
                        if require_owner and project_role not in _OWNER_ROLES:
                            raise HTTPException(
                                status_code=403,
                                detail="Bu işlem yalnızca proje sahibi veya takım kaptanı tarafından yapılabilir."
                            )

                        result = user or {"role": project_role, "email": user_email}
                        result["project_role"] = project_role
                        return result
    except HTTPException:
        raise
    except Exception:
        pass

    if not user:
        raise HTTPException(status_code=401, detail="Oturum açmanız gerekmektedir.")

    # 3. Check shared team membership (project_members) if available
    try:
        rows = cf_d1_query(
            "SELECT pm.role FROM project_members pm WHERE pm.project_id = ? AND pm.user_id = ? LIMIT 1",
            [clean_cat, user.get("id")],
        )
        if rows:
            pm_role = rows[0].get("role") or "member"
            if require_owner and pm_role not in _OWNER_ROLES:
                raise HTTPException(
                    status_code=403,
                    detail="Bu işlem yalnızca proje sahibi veya takım kaptanı tarafından yapılabilir."
                )
            if not require_edit or pm_role in ("owner", "manager", "reviewer", "annotator", "captain", "member"):
                user["project_role"] = pm_role
                return user
    except HTTPException:
        raise
    except Exception:
        pass

    raise HTTPException(status_code=403, detail="Bu projeye erişim yetkiniz bulunmamaktadır.")
