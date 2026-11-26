import sys, json
sys.path.insert(0, '.')
from api.teams import _load_team_tasks

tasks = _load_team_tasks()
print(f"Total tasks: {len(tasks)}")
for t in tasks:
    print(f"Task ID: {t.get('id')}, Category: {t.get('category')}, Assigned To: '{t.get('assigned_to')}', Status: {t.get('status')}, Images: {len(t.get('images', []))}")
