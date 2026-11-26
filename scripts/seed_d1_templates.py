# -*- coding: utf-8 -*-
"""
Seed the 49 templates from scripts/generate_templates.py into Cloudflare D1 explore_templates table.
"""
import sys
import json
from datetime import datetime

sys.path.insert(0, '.')
from core.database import cf_d1_query
from scripts.generate_templates import templates

def seed_templates():
    print(f"Total templates to seed: {len(templates)}")
    now_iso = datetime.now().isoformat()
    
    success_count = 0
    for t in templates:
        tid = t["tmpl"]
        cat = t["cat"]
        title = t["title"]
        desc = t.get("desc", "")
        banner_cls = t.get("banner", "")
        pill_text = t.get("pill", "")
        badge_title = t.get("badge", "")
        badge_cls = t.get("badge_cls", "")
        task_type = t.get("type", "Nesne Tespiti")
        model = t.get("hint", "")
        
        # Format classes
        cls_list = []
        for c in t.get("classes", []):
            if isinstance(c, (list, tuple)):
                cls_list.append({"name": c[0], "color": c[1]})
            elif isinstance(c, dict):
                cls_list.append(c)
        classes_json = json.dumps(cls_list, ensure_ascii=False)
        
        sql = """
        INSERT OR REPLACE INTO explore_templates 
        (id, category, title, description, banner_cls, pill_text, badge_title, badge_cls, task_type, recommended_model, classes_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """
        params = [tid, cat, title, desc, banner_cls, pill_text, badge_title, badge_cls, task_type, model, classes_json, now_iso]
        res = cf_d1_query(sql, params)
        if res is not None:
            success_count += 1
            print(f"[OK] Seeded: {tid}")
        else:
            print(f"[ERR] Failed: {tid}")
            
    print(f"\nDone. Successfully seeded {success_count}/{len(templates)} templates into Cloudflare D1.")

if __name__ == "__main__":
    seed_templates()
