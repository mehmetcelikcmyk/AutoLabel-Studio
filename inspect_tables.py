import sys, os
sys.path.insert(0, os.path.abspath("."))
from core.database import cf_d1_query

tables = cf_d1_query("SELECT name FROM sqlite_master WHERE type='table'")
print("Mevcut D1 Tabloları:", [t.get('name') for t in (tables or [])])

rows = cf_d1_query("SELECT user_id, created_at, expires_at, revoked_at FROM sessions ORDER BY created_at DESC LIMIT 5")
print("\nSon sessions:")
for r in (rows or []):
    print(r)
