import re
import json
import random
import secrets
import uuid
import urllib.parse
import urllib.request as _urllib_req
from datetime import datetime, timedelta, timezone
from typing import Optional, Dict, Any

from fastapi import APIRouter, HTTPException, Header, Request
from fastapi.responses import JSONResponse, RedirectResponse
from pydantic import BaseModel, Field

from core.config import load_settings
from core.database import (
    cf_d1_query,
    load_users,
    save_users,
    is_token_valid
)
from core.security import (
    hash_password,
    verify_password,
    make_token,
    hash_session_token,
    token_expires,
    token_absolute_expires,
    find_user_by_email,
    get_current_user,
    is_admin_user,
    require_admin,
    check_rate_limit,
    record_failed_attempt,
    clear_login_attempts,
    get_client_ip
)
from core.email import send_smtp_generic

router = APIRouter(tags=["Auth"])

# ─────────────────────────────────────────────────────────────────────────────
# PYDANTIC MODELS
# ─────────────────────────────────────────────────────────────────────────────
EMAIL_REGEX = r"^[^@\s]+@[^@\s]+\.[^@\s]+$"

class RegisterRequest(BaseModel):
    email: str = Field(..., pattern=EMAIL_REGEX, max_length=150)
    display_name: str = Field(..., min_length=1, max_length=100)
    # Model düzeyinde 8 karakter zorunlu — endpoint içindeki tekrarlı kontrol kaldırıldı
    password: str = Field(..., min_length=8, max_length=128)

class LoginRequest(BaseModel):
    email: str = Field(..., pattern=EMAIL_REGEX, max_length=150)
    password: str = Field(..., min_length=1, max_length=128)

class ForgotPasswordRequest(BaseModel):
    email: str = Field(..., pattern=EMAIL_REGEX, max_length=150)

class ResetPasswordRequest(BaseModel):
    email: str = Field(..., pattern=EMAIL_REGEX, max_length=150)
    code: str = Field(..., min_length=4, max_length=16)
    new_password: str = Field(..., min_length=8, max_length=128)

class AdminChangePasswordRequest(BaseModel):
    email: str = Field(..., pattern=EMAIL_REGEX, max_length=150)
    new_password: str = Field(..., min_length=8, max_length=128)

class GoogleSettingsRequest(BaseModel):
    google_client_id: str = Field(..., max_length=256)
    google_client_secret: str = Field(..., max_length=256)




def _send_password_reset_email(to_email: str, code: str) -> tuple[bool, str]:
    """Kullanıcıya şık HTML formatında şifre sıfırlama doğrulama kodu gönderir."""
    subject = f"YOLO Editor — Şifre Sıfırlama Kodunuz: {code}"
    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #090d16; color: #f8fafc; margin: 0; padding: 30px; }}
        .card {{ max-width: 480px; margin: 0 auto; background: #0f172a; border: 1px solid rgba(255,255,255,0.12); border-radius: 16px; padding: 32px; box-shadow: 0 20px 40px rgba(0,0,0,0.5); }}
        .logo {{ font-size: 1.25rem; font-weight: 800; color: #38bdf8; margin-bottom: 20px; letter-spacing: -0.02em; }}
        h1 {{ font-size: 1.3rem; color: #f8fafc; margin-top: 0; }}
        p {{ font-size: 0.92rem; color: #94a3b8; line-height: 1.6; margin: 12px 0; }}
        .code-box {{ background: rgba(56,189,248,0.1); border: 2px dashed #38bdf8; border-radius: 12px; padding: 18px 24px; text-align: center; margin: 24px 0; }}
        .code-text {{ font-size: 2.1rem; font-weight: 800; letter-spacing: 6px; color: #38bdf8; font-family: 'JetBrains Mono', monospace, Courier; }}
        .expiry {{ font-size: 0.8rem; color: #f59e0b; margin-top: 6px; font-weight: 500; }}
        .warning {{ font-size: 0.8rem; color: #94a3b8; background: rgba(255,255,255,0.03); padding: 12px; border-radius: 8px; border-left: 3px solid #38bdf8; }}
        .footer {{ margin-top: 24px; border-top: 1px solid rgba(255,255,255,0.08); padding-top: 16px; font-size: 0.75rem; color: #475569; text-align: center; }}
      </style>
    </head>
    <body>
      <div class="card">
        <div class="logo">⚡ YOLO<span style="color:#3b82f6;">Editor</span></div>
        <h1>Şifre Sıfırlama Talebi</h1>
        <p>Hesabınız için bir şifre sıfırlama talebinde bulunuldu. Şifrenizi yenilemek için aşağıdaki 6 haneli güvenlik kodunu kullanabilirsiniz:</p>
        
        <div class="code-box">
          <div class="code-text">{code}</div>
          <div class="expiry">⏱ Bu kod 15 dakika boyunca geçerlidir.</div>
        </div>

        <p class="warning">🔒 Bu işlemi siz talep etmediyseniz lütfen bu e-postayı dikkate almayınız. Şifreniz siz yeni bir şifre belirleyene kadar güvenle korunacaktır.</p>

        <div class="footer">
          © YOLO Editor Platformu · Otomatik Güvenlik Bildirimi
        </div>
      </div>
    </body>
    </html>
    """
    return send_smtp_generic(to_email, subject, html_content)


@router.post("/api/auth/register")
def auth_register(req: RegisterRequest, request: Request):
    """Register a new user with email + password with Cloudflare-aware rate limiting."""
    client_ip = get_client_ip(request)
    check_rate_limit(client_ip)

    email = req.email.strip().lower()
    if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", email):
        record_failed_attempt(client_ip)
        raise HTTPException(status_code=400, detail="Geçersiz e-posta adresi.")
    # min_length=8 Pydantic modelde enforce edildiği için burada tekrar kontrol gerekmez
    if not req.display_name.strip():
        record_failed_attempt(client_ip)
        raise HTTPException(status_code=400, detail="Ad Soyad boş olamaz.")

    users_data = load_users()
    existing = find_user_by_email(users_data, email)
    if existing:
        record_failed_attempt(client_ip)
        raise HTTPException(
            status_code=409,
            detail="Bu e-posta adresiyle zaten bir kayıt mevcut. Lütfen giriş yapın."
        )

    salt = secrets.token_hex(16)
    new_user = {
        "id": str(uuid.uuid4()),
        "email": email,
        "display_name": req.display_name.strip(),
        "password_hash": hash_password(req.password, salt),
        "salt": salt,
        "auth_provider": "local",
        "avatar_url": f"https://ui-avatars.com/api/?name={urllib.parse.quote(req.display_name)}&background=3b82f6&color=fff&size=128",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "reset_code": None,
        "reset_expires": None,
    }
    token = make_token()
    token_exp = token_expires()

    # D1 is authoritative.  Do not return a usable token unless both records
    # have been persisted successfully.
    try:
        cf_d1_query(
            "INSERT INTO users (email, display_name, password_hash, salt, auth_provider, avatar_url, created_at, updated_at, role) VALUES (?, ?, ?, ?, 'local', ?, ?, ?, 'user')",
            [new_user["email"], new_user["display_name"], new_user["password_hash"], new_user["salt"], new_user["avatar_url"], new_user["created_at"], new_user["created_at"]]
        )
        d1_user = cf_d1_query("SELECT id FROM users WHERE LOWER(email) = ? LIMIT 1", [email])
        if not d1_user or not d1_user[0].get("id"):
            raise RuntimeError("Kullanıcı kimliği D1 üzerinden alınamadı")
        user_db_id = d1_user[0]["id"]
        cf_d1_query(
            "INSERT INTO sessions (token_hash, user_id, created_at, expires_at, absolute_expires_at) VALUES (?, ?, ?, ?, ?)",
            [hash_session_token(token), user_db_id, new_user["created_at"], token_exp, token_absolute_expires()]
        )
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail="Kayıt servisi geçici olarak kullanılamıyor.") from e

    clear_login_attempts(client_ip)
    return {
        "status": "ok",
        "token": token,
        "user": {
            "email": email,
            "display_name": new_user["display_name"],
            "avatar_url": new_user["avatar_url"],
        }
    }


@router.post("/api/auth/login")
def auth_login(req: LoginRequest, request: Request):
    """Login with email + password with Cloudflare-aware IP rate limiting."""
    client_ip = get_client_ip(request)
    check_rate_limit(client_ip)
    email = req.email.strip().lower()
    users_data = load_users()
    user = find_user_by_email(users_data, email)

    if not user:
        record_failed_attempt(client_ip)
        raise HTTPException(status_code=401, detail="Bu e-posta adresiyle kayıtlı hesap bulunamadı.")

    has_password = bool(user.get("password_hash") and user.get("salt"))

    if user.get("auth_provider") == "google" and not has_password:
        record_failed_attempt(client_ip)
        raise HTTPException(
            status_code=400,
            detail="Bu hesap Google ile oluşturulmuştur ve henüz bir şifre belirlenmemiştir. Lütfen 'Google ile Giriş Yap' seçeneğini kullanın veya 'Şifremi Unuttum' ile şifre oluşturun."
        )

    if not has_password or not verify_password(req.password, user.get("salt", ""), user.get("password_hash", "")):
        record_failed_attempt(client_ip)
        raise HTTPException(status_code=401, detail="Şifre hatalı. Lütfen tekrar deneyin.")

    # Başarılı girişte IP deneme sayacını sıfırla
    clear_login_attempts(client_ip)

    # 1. SINGLE-SESSION ENFORCEMENT & INSTANT REVOCATION:
    cf_d1_query("UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL", [datetime.now(timezone.utc).isoformat(), user["id"]])

    # 2. Yeni Sliding Token üret (Varsayılan 60 dk, işlem yaptıkça otomatik kayar)
    token = make_token()
    expires_at = token_expires()

    cf_d1_query(
        "INSERT INTO sessions (token_hash, user_id, created_at, expires_at, absolute_expires_at) VALUES (?, ?, ?, ?, ?)",
        [hash_session_token(token), user["id"], datetime.now(timezone.utc).isoformat(), expires_at, token_absolute_expires()]
    )

    is_admin = is_admin_user(user, email)
    return {
        "status": "ok",
        "token": token,
        "user": {
            "email": email,
            "display_name": user.get("display_name", email.split("@")[0]),
            "avatar_url": user.get("avatar_url", ""),
            "role": "admin" if is_admin else user.get("role", "user"),
            "is_admin": is_admin
        }
    }


@router.post("/api/auth/refresh")
def auth_refresh(authorization: Optional[str] = Header(None)):
    """Aktif geçerli token'ın süresini uzatır ve güncel kullanıcı verisini döner."""
    user = get_current_user(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Oturum süresi dolmuş veya geçersiz.")
    
    email = user.get("email", "").lower()
    is_admin = is_admin_user(user, email)
    
    # Mevcut token'ı al
    raw_auth = authorization.strip()
    token = raw_auth[7:].strip() if raw_auth.startswith("Bearer ") else raw_auth
    
    return {
        "status": "ok",
        "token": token,
        "user": {
            "email": user.get("email", ""),
            "display_name": user.get("display_name", ""),
            "avatar_url": user.get("avatar_url", ""),
            "role": "admin" if is_admin else user.get("role", "user"),
            "is_admin": is_admin
        }
    }


@router.post("/api/auth/logout")
def auth_logout(authorization: Optional[str] = Header(None)):
    """Invalidate the current session token."""
    if not authorization or not authorization.startswith("Bearer "):
        return {"status": "ok"}
    token = authorization[7:]
    cf_d1_query("UPDATE sessions SET revoked_at = ? WHERE token_hash = ?", [datetime.now(timezone.utc).isoformat(), hash_session_token(token)])
    return {"status": "ok"}


@router.get("/api/auth/me")
def auth_me(authorization: Optional[str] = Header(None)):
    """Return current authenticated user info including admin role."""
    user = get_current_user(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Oturum geçersiz veya süresi dolmuş.")
    email = user.get("email", "").lower()
    is_admin = is_admin_user(user, email)
    return {
        "status": "ok",
        "user": {
            "email": user.get("email", ""),
            "display_name": user.get("display_name", ""),
            "avatar_url": user.get("avatar_url", ""),
            "auth_provider": user.get("auth_provider", "local"),
            "role": "admin" if is_admin else user.get("role", "user"),
            "is_admin": is_admin
        }
    }


@router.post("/api/auth/forgot-password")
def auth_forgot(req: ForgotPasswordRequest, request: Request):
    """Generate a 6-digit cryptographically secure reset code and email it."""
    check_rate_limit(request.client.host if request.client else "unknown")
    email = req.email.strip().lower()

    try:
        user = find_user_by_email(None, email)
    except RuntimeError as e:
        if "not fully configured" in str(e) or "D1" in str(e):
            raise HTTPException(
                status_code=503,
                detail="Veritabanı servisi henüz yapılandırılmamış. Lütfen sistem yöneticisiyle iletişime geçin."
            )
        raise HTTPException(status_code=500, detail="Sunucu hatası.")

    if not user:
        return {"status": "ok", "message": "Eğer bu e-posta kayıtlıysa sıfırlama kodu gönderildi."}

    # Kriptografik olarak güvenli 6 haneli rastgele kod üret
    code = f"{secrets.randbelow(900000) + 100000}"
    expires = (datetime.now(timezone.utc) + timedelta(minutes=15)).isoformat()

    try:
        # Doğrudan Cloudflare D1 veritabanına mühürle
        cf_d1_query(
            "UPDATE users SET reset_code = ?, reset_expires = ? WHERE LOWER(email) = ?",
            [code, expires, email]
        )
    except RuntimeError as e:
        raise HTTPException(
            status_code=503,
            detail="Veritabanı servisi geçici olarak kullanılamıyor. Lütfen daha sonra tekrar deneyin."
        )

    email_ok, _ = _send_password_reset_email(email, code)

    # GÜVENLİK DÜZELTMESİ: reset_code asla API cevabında istemciye gönderilmez!
    return {
        "status": "ok",
        "message": "Sıfırlama kodu e-posta adresinize gönderildi. Lütfen gelen kutunuzu (ve spam klasörünü) kontrol edin.",
        "email_sent": email_ok
    }


@router.post("/api/auth/reset-password")
def auth_reset(req: ResetPasswordRequest, request: Request):
    """Verify reset code from Cloudflare D1 and set new password."""
    check_rate_limit(request.client.host if request.client else "unknown")
    email = req.email.strip().lower()
    if len(req.new_password) < 8:
        raise HTTPException(status_code=400, detail="Yeni şifre en az 8 karakter olmalıdır.")

    try:
        # 1. Cloudflare D1'den sıfırlama kodunu doğrula (Cloud-authoritative)
        rows = cf_d1_query("SELECT reset_code, reset_expires FROM users WHERE LOWER(email) = ?", [email])
    except RuntimeError as e:
        raise HTTPException(
            status_code=503,
            detail="Veritabanı servisi geçici olarak kullanılamıyor. Lütfen daha sonra tekrar deneyin."
        )

    if not rows or len(rows) == 0:
        raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı.")

    db_code = rows[0].get("reset_code")
    db_expires = rows[0].get("reset_expires", "")
    if not db_code or db_code != req.code.strip():
        raise HTTPException(status_code=400, detail="Sıfırlama kodu hatalı.")

    if not is_token_valid(db_expires):
        raise HTTPException(status_code=400, detail="Sıfırlama kodunun süresi dolmuştur. Lütfen tekrar isteyin.")

    salt = secrets.token_hex(16)
    new_hash = hash_password(req.new_password, salt)

    try:
        # Cloudflare D1 üzerinde şifreyi güncelle ve tüm oturumları anında iptal et
        cf_d1_query(
            "UPDATE users SET password_hash = ?, salt = ?, reset_code = NULL, reset_expires = NULL WHERE LOWER(email) = ?",
            [new_hash, salt, email]
        )
        # sessions tablosunda email kolonu yok; user_id üzerinden oturumları kapat
        cf_d1_query(
            "UPDATE sessions SET revoked_at = ? WHERE user_id = (SELECT id FROM users WHERE LOWER(email) = ?) AND revoked_at IS NULL",
            [datetime.now(timezone.utc).isoformat(), email]
        )
    except RuntimeError as e:
        raise HTTPException(
            status_code=503,
            detail="Veritabanı servisi geçici olarak kullanılamıyor. Lütfen daha sonra tekrar deneyin."
        )

    return {"status": "ok", "message": "Şifreniz başarıyla güncellendi. Giriş yapabilirsiniz."}


@router.post("/api/admin/users/change-password")
def admin_change_password(req: AdminChangePasswordRequest, authorization: Optional[str] = Header(None)):
    """Yöneticinin (Admin) herhangi bir kullanıcının şifresini doğrudan değiştirmesini sağlar."""
    require_admin(authorization)

    target_email = req.email.strip().lower()
    if len(req.new_password) < 8:
        raise HTTPException(status_code=400, detail="Yeni şifre en az 8 karakter olmalıdır.")

    users_data = load_users()
    user = find_user_by_email(users_data, target_email)
    if not user:
        raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı.")

    salt = secrets.token_hex(16)
    new_hash = hash_password(req.new_password, salt)

    # Cloudflare D1'de şifreyi güncelle ve oturumları anında sonlandır
    try:
        cf_d1_query(
            "UPDATE users SET password_hash = ?, salt = ?, reset_code = NULL, reset_expires = NULL WHERE LOWER(email) = ?",
            [new_hash, salt, target_email]
        )
        # sessions tablosunda email kolonu yok; user_id subquery ile çöz
        cf_d1_query(
            "UPDATE sessions SET revoked_at = ? WHERE user_id = (SELECT id FROM users WHERE LOWER(email) = ?) AND revoked_at IS NULL",
            [datetime.now(timezone.utc).isoformat(), target_email]
        )
    except Exception as e:
        print(f"[D1 Admin Change Password Warning] {e}")

    return {"status": "ok", "message": f"{target_email} kullanıcısının şifresi başarıyla güncellendi."}


@router.get("/api/auth/google")
def auth_google(request: Request):
    """Redirect user to Google OAuth login page."""
    settings = load_settings()
    client_id = settings.get("google_client_id")
    if not client_id:
        return JSONResponse(status_code=400, content={
            "detail": "Google OAuth yapılandırılmamış.",
            "message": "Google OAuth henüz yapılandırılmamış. Ayarlar > Google OAuth bölümünden Client ID girin."
        })

    import os
    explicit_redirect = os.getenv("GOOGLE_REDIRECT_URI", "").strip()
    if explicit_redirect:
        redirect_uri = explicit_redirect
    else:
        proto = request.headers.get("x-forwarded-proto", request.url.scheme)
        host = request.headers.get("x-public-host") or request.headers.get("x-forwarded-host") or request.headers.get("host", f"localhost:{request.url.port or 8000}")
        if "127.0.0.1" in host:
            host = host.replace("127.0.0.1", "localhost")
        redirect_uri = f"{proto}://{host}/api/auth/google/callback"

    params = urllib.parse.urlencode({
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": "openid email profile",
        "access_type": "offline",
        "prompt": "select_account",
    })
    return RedirectResponse(f"https://accounts.google.com/o/oauth2/v2/auth?{params}")


@router.get("/api/auth/google/callback")
def auth_google_callback(request: Request, code: Optional[str] = None, error: Optional[str] = None):
    """Handle Google OAuth callback, create or login user."""
    if error or not code:
        return RedirectResponse("/?auth_error=google_denied")

    settings = load_settings()
    client_id = settings.get("google_client_id", "")
    client_secret = settings.get("google_client_secret", "")

    import os
    explicit_redirect = os.getenv("GOOGLE_REDIRECT_URI", "").strip()
    if explicit_redirect:
        redirect_uri = explicit_redirect
    else:
        proto = request.headers.get("x-forwarded-proto", request.url.scheme)
        host = request.headers.get("x-public-host") or request.headers.get("x-forwarded-host") or request.headers.get("host", f"localhost:{request.url.port or 8000}")
        if "127.0.0.1" in host:
            host = host.replace("127.0.0.1", "localhost")
        redirect_uri = f"{proto}://{host}/api/auth/google/callback"

    try:
        token_data = urllib.parse.urlencode({
            "code": code,
            "client_id": client_id,
            "client_secret": client_secret,
            "redirect_uri": redirect_uri,
            "grant_type": "authorization_code",
        }).encode()
        req = _urllib_req.Request("https://oauth2.googleapis.com/token", data=token_data)
        with _urllib_req.urlopen(req, timeout=10) as resp:
            token_resp = json.loads(resp.read())
        access_token = token_resp.get("access_token", "")

        user_req = _urllib_req.Request(
            "https://www.googleapis.com/oauth2/v2/userinfo",
            headers={"Authorization": f"Bearer {access_token}"}
        )
        with _urllib_req.urlopen(user_req, timeout=10) as resp:
            guser = json.loads(resp.read())

        email = guser.get("email", "").lower()
        display_name = guser.get("name", email.split("@")[0])
        avatar_url = guser.get("picture", "")

        if not email:
            return RedirectResponse("/?auth_error=google_no_email")

        users_data = load_users()
        existing = find_user_by_email(users_data, email)

        if existing:
            if not existing.get("display_name") or existing.get("display_name") == email.split("@")[0]:
                existing["display_name"] = display_name
            if avatar_url:
                existing["avatar_url"] = avatar_url
            if not existing.get("auth_provider") or existing.get("auth_provider") == "local":
                existing["auth_provider"] = "google"
        else:
            users_data["users"].append({
                "email": email,
                "display_name": display_name,
                "password_hash": "",
                "salt": "",
                "auth_provider": "google",
                "avatar_url": avatar_url,
                "created_at": datetime.now(timezone.utc).isoformat(),
                "reset_code": None,
                "reset_expires": None,
            })

        # Local cache users.json senkronizasyonu
        try:
            save_users(users_data)
        except Exception:
            pass

        # Single-session cleanup for Google user — sessions'ta email kolonu yok, user_id subquery kullan
        try:
            cf_d1_query(
                "UPDATE sessions SET revoked_at = ? WHERE user_id = (SELECT id FROM users WHERE LOWER(email) = ?) AND revoked_at IS NULL",
                [datetime.now(timezone.utc).isoformat(), email]
            )
        except Exception:
            pass

        token = make_token()
        expires_at = token_expires()
        user_id = None

        # Cloudflare D1 üzerinde kullanıcı kaydı/güncellemesi yap (Mevcut rolü koruyarak)
        # KRİTİK: Bu blok artık sessizce yutulmaz — D1 hatası session kayıt hatasına dönüşür.
        try:
            now_iso = datetime.now(timezone.utc).isoformat()
            d1_existing = cf_d1_query("SELECT id, role FROM users WHERE LOWER(email) = ? LIMIT 1", [email])
            if d1_existing and len(d1_existing) > 0:
                user_id = d1_existing[0]["id"]
                cf_d1_query(
                    "UPDATE users SET display_name = ?, avatar_url = ?, auth_provider = 'google', updated_at = ? WHERE LOWER(email) = ?",
                    [display_name, avatar_url, now_iso, email]
                )
            else:
                cf_d1_query(
                    "INSERT INTO users (email, display_name, password_hash, salt, auth_provider, avatar_url, created_at, updated_at, role) VALUES (?, ?, '', '', 'google', ?, ?, ?, 'user')",
                    [email, display_name, avatar_url, now_iso, now_iso]
                )
                d1_created = cf_d1_query("SELECT id FROM users WHERE LOWER(email) = ? LIMIT 1", [email])
                if not d1_created or not d1_created[0].get("id"):
                    raise RuntimeError("Yeni Google kullanıcısının kimliği D1 üzerinden alınamadı")
                user_id = d1_created[0]["id"]
        except Exception as e:
            # Kullanıcı kaydı/güncellemesi başarısız — geçersiz token göndermek yerine hata döndür.
            print(f"[Google OAuth D1 User Sync Error] {e}")
            return RedirectResponse("/?auth_error=google_session_failed")

        # Oturum kaydı — D1 sessions tablosuna ekle.
        # Bu da zorunlu: başarısız olursa token geçersiz olacağından login döngüsü oluşur.
        try:
            cf_d1_query(
                "INSERT INTO sessions (token_hash, user_id, created_at, expires_at, absolute_expires_at) VALUES (?, ?, ?, ?, ?)",
                [hash_session_token(token), user_id, now_iso, expires_at, token_absolute_expires()]
            )
        except Exception as e:
            print(f"[Google OAuth D1 Session Insert Error] {e}")
            return RedirectResponse("/?auth_error=google_session_failed")

        # GÜVENLİK: Token URL query string'de (Referrer/access log'a yazılır) değil,
        # hash fragment'te (#) iletilir — sunucuya hiç gitmez, tarayıcı geçmişinde sadece fragment kalır.
        # Frontend, window.location.hash okuyarak token'ı alır.
        # auth=google yerine login_success=1 kullanılarak login modalı açılma çakışması önlenir.
        return RedirectResponse(f"/?login_success=1#google_token={token}&display_name={urllib.parse.quote(display_name)}")

    except Exception as ex:
        print(f"[Google OAuth Error] {ex}")
        return RedirectResponse("/?auth_error=google_failed")


@router.post("/api/auth/google-settings")
def save_google_settings(req: GoogleSettingsRequest, authorization: Optional[str] = Header(None)):
    """Secrets are deployment configuration, never mutable through the web API."""
    require_admin(authorization)
    raise HTTPException(
        status_code=405,
        detail="OAuth sırları yalnızca Cloudflare Secrets/ortam değişkenleriyle yönetilir."
    )


@router.get("/api/auth/google-settings")
def get_google_settings(authorization: Optional[str] = Header(None)):
    require_admin(authorization)
    settings = load_settings()
    return {
        "configured": bool(settings.get("google_client_id")),
        # Client IDs/secrets are not returned to browser clients.
    }


@router.get("/api/users/search")
def api_search_users(q: str = "", limit: int = 20, authorization: Optional[str] = Header(None)):
    user = get_current_user(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Oturum açmanız gerekmektedir.")
    limit = max(1, min(limit, 20))
    term = q.strip()
    users = []

    try:
        if term:
            sql = "SELECT id, email, display_name, avatar_url, created_at FROM users WHERE email LIKE ? OR display_name LIKE ? ORDER BY id DESC LIMIT ?"
            params = [f"%{term}%", f"%{term}%", limit]
        else:
            sql = "SELECT id, email, display_name, avatar_url, created_at FROM users ORDER BY id DESC LIMIT ?"
            params = [limit]

        d1_res = cf_d1_query(sql, params)
        if d1_res is not None:
            for row in d1_res:
                users.append({
                    "id": row.get("id"),
                    "email": row.get("email"),
                    "display_name": row.get("display_name") or row.get("email", "").split("@")[0],
                    "avatar_url": row.get("avatar_url") or "",
                    "created_at": row.get("created_at") or ""
                })
            return {"status": "ok", "users": users, "source": "cloudflare_d1"}
    except Exception as e:
        print(f"[User Search D1 Warning] {e}")

    users_data = load_users()
    all_users = users_data.get("users", [])
    if term:
        filtered = [u for u in all_users if term.lower() in u.get("email", "").lower() or term.lower() in u.get("display_name", "").lower()]
    else:
        filtered = all_users

    for u in filtered[:limit]:
        users.append({
            "id": u.get("id"),
            "email": u.get("email"),
            "display_name": u.get("display_name") or u.get("email", "").split("@")[0],
            "avatar_url": u.get("avatar_url") or "",
            "created_at": u.get("created_at") or ""
        })

    return {"status": "ok", "users": users, "source": "local_fallback"}
