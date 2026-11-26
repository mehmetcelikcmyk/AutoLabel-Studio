import sys
import os
import json

sys.path.insert(0, os.getcwd())
from core.database import cf_d1_query

print("1. Cloudflare D1 teams tablosu temizleniyor...")
res = cf_d1_query("DELETE FROM teams")
print("D1 Sonucu:", res)

print("2. Cloudflare D1 team_tasks tablosu kontrol ediliyor...")
res_tasks = cf_d1_query("DELETE FROM team_tasks")
print("D1 Task Sonucu:", res_tasks)

print("3. Yerel teams.json sıfırlanıyor...")
with open("teams.json", "w", encoding="utf-8") as f:
    json.dump({"teams": []}, f, indent=2)
print("Yerel teams.json sıfırlandı.")

remaining = cf_d1_query("SELECT * FROM teams")
print(f"Cloudflare D1 Kalan Takım Sayısı: {len(remaining) if remaining else 0}")
