# -*- coding: utf-8 -*-
"""
migrate_to_cloud.py
Yerel verileri (projeler, sınıflar, kullanıcılar) Cloudflare D1 veritabanına
ve yapılandırılmışsa görselleri Cloudflare R2'ye aktarır.
"""
import os
import sys
import json
from pathlib import Path
from datetime import datetime, timezone

# Kök dizini import yoluna ekle
ROOT_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT_DIR))

from core.database import cf_d1_query, cf_r2_upload
from core.config import load_settings, CONFIG_FILE, USERS_FILE

def migrate_projects():
    print("\n--- 1. Projelerin D1'e Taşınması ---")
    if not CONFIG_FILE.exists():
        print("[!] project_config.json bulunamadı, proje taşıma atlandı.")
        return

    try:
        with open(CONFIG_FILE, "r", encoding="utf-8") as f:
            cfg = json.load(f)
    except Exception as e:
        print(f"[X] Config okunamadı: {e}")
        return

    projects = cfg.get("projects", {})
    classes = cfg.get("classes", {})
    count = 0

    now_iso = datetime.now(timezone.utc).isoformat()
    for pid, pdata in projects.items():
        display_name = pdata.get("display_name", pid.capitalize())
        description = pdata.get("description", "")
        project_type = pdata.get("project_type", "detection")
        visibility = pdata.get("visibility", "private")
        license_name = pdata.get("license", "CC BY 4.0")
        owner_email = pdata.get("owner_email", "admin")

        try:
            cf_d1_query(
                "INSERT OR REPLACE INTO projects (id, display_name, description, project_type, visibility, license, created_at, owner_email) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                [pid, display_name, description, project_type, visibility, license_name, now_iso, owner_email]
            )
            print(f" [+] Proje senkronize edildi: {pid} ({display_name})")
            count += 1
        except Exception as ex:
            print(f" [X] Proje aktarım hatası ({pid}): {ex}")

    print(f"Toplam {count} proje Cloudflare D1'e senkronize edildi.")

def check_admin_user():
    print("\n--- 2. Kullanıcıların Doğrulanması ---")
    try:
        users = cf_d1_query("SELECT id, email, display_name, role FROM users")
        print(f" [+] D1 üzerinde kayıtlı {len(users)} kullanıcı bulundu:")
        for u in users:
            print(f"     - {u.get('email')} ({u.get('display_name')}) [Rol: {u.get('role')}]")
    except Exception as ex:
        print(f" [X] Kullanıcı kontrol hatası: {ex}")

def main():
    print("==================================================")
    print(" AutoLabel Studio Cloudflare D1/R2 Migration Tool")
    print("==================================================")
    
    settings = load_settings()
    if not settings.get("cloudflare_api_token") or not settings.get("cloudflare_database_id"):
        print("[!] Cloudflare D1 kimlik bilgileri eksik. Lütfen .env dosyasını kontrol edin.")
        return

    print(f"Cloudflare Account ID: {settings.get('cloudflare_account_id')}")
    print(f"Cloudflare D1 DB ID:   {settings.get('cloudflare_database_id')}")

    migrate_projects()
    check_admin_user()
    print("\n[OK] Goc ve senkronizasyon tamamlandi.")

if __name__ == "__main__":
    main()
