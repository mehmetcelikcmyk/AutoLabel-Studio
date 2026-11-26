import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

def send_smtp_generic(to_email: str, subject: str, html_body: str) -> tuple[bool, str]:
    """
    T-Sistem altyapısı ile birebir aynı SMTP e-posta gönderim motoru.
    Gmail SMTP SSL/TLS üzerinden kimlik doğrulamalı e-posta iletir.
    """
    smtp_host = os.getenv("SMTP_HOST") or os.getenv("SMTP_SERVER") or "smtp.gmail.com"
    smtp_port = int(os.getenv("SMTP_PORT", "587"))
    smtp_user = os.getenv("SMTP_USER") or os.getenv("SMTP_EMAIL") or ""
    smtp_pass = os.getenv("SMTP_PASSWORD") or os.getenv("SMTP_PASS") or ""

    if not (smtp_host and smtp_user and smtp_pass):
        return False, "SMTP sunucu bilgileri yapılandırılmadı."

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = f"YOLO Platformu <{smtp_user}>"
        msg["To"] = to_email
        msg.attach(MIMEText(html_body, "html"))

        clean_pass = str(smtp_pass).replace(" ", "").strip()
        with smtplib.SMTP(smtp_host, smtp_port, timeout=12) as server:
            server.starttls()
            server.login(smtp_user, clean_pass)
            server.sendmail(smtp_user, [to_email], msg.as_string())

        return True, "E-posta başarıyla gönderildi."
    except Exception as e:
        print(f"[SMTP Error] Gönderim hatası: {e}")
        return False, f"SMTP Gönderim Hatası: {e}"
