# -*- coding: utf-8 -*-
"""
Generates rich demo images and YOLO-format labels for the explore templates.
Each category gets realistic demo annotations with coordinates and class IDs.
"""
import sys
import json
from datetime import datetime

sys.path.insert(0, '.')
from core.database import cf_d1_query
from scripts.generate_templates import templates

# Curated high quality royalty-free image URLs for categories
CATEGORY_IMAGES = {
    "safety": [
        {
            "image_url": "https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=700&auto=format&fit=crop&q=80",
            "title": "İnşaat Sahası Çalışanları & İskele",
            "boxes": [
                {"class_name": "baret", "color": "#f59e0b", "x": 0.32, "y": 0.22, "w": 0.12, "h": 0.14},
                {"class_name": "yelek", "color": "#10b981", "x": 0.30, "y": 0.36, "w": 0.20, "h": 0.32},
                {"class_name": "kisi", "color": "#3b82f6", "x": 0.28, "y": 0.20, "w": 0.24, "h": 0.70},
                {"class_name": "baret", "color": "#f59e0b", "x": 0.65, "y": 0.30, "w": 0.11, "h": 0.12},
                {"class_name": "yelek", "color": "#10b981", "x": 0.62, "y": 0.42, "w": 0.18, "h": 0.28}
            ]
        },
        {
            "image_url": "https://images.unsplash.com/photo-1581092335397-9583fe92d232?w=700&auto=format&fit=crop&q=80",
            "title": "Kaynak ve Koruyucu Siperlik Denetimi",
            "boxes": [
                {"class_name": "alev", "color": "#ef4444", "x": 0.48, "y": 0.52, "w": 0.14, "h": 0.16},
                {"class_name": "duman", "color": "#64748b", "x": 0.45, "y": 0.38, "w": 0.22, "h": 0.24},
                {"class_name": "eldiven", "color": "#f59e0b", "x": 0.40, "y": 0.58, "w": 0.12, "h": 0.14}
            ]
        },
        {
            "image_url": "https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?w=700&auto=format&fit=crop&q=80",
            "title": "Lojistik Deposu Forklift Manevrası",
            "boxes": [
                {"class_name": "forklift", "color": "#f59e0b", "x": 0.35, "y": 0.40, "w": 0.35, "h": 0.45},
                {"class_name": "yaya", "color": "#3b82f6", "x": 0.75, "y": 0.48, "w": 0.15, "h": 0.42},
                {"class_name": "tehlike_bolgesi", "color": "#ef4444", "x": 0.25, "y": 0.35, "w": 0.55, "h": 0.55}
            ]
        }
    ],
    "traffic": [
        {
            "image_url": "https://images.unsplash.com/photo-1506521781263-d8422e82f27a?w=700&auto=format&fit=crop&q=80",
            "title": "Otoyol Yoğun Trafik Akışı & Şerit Takibi",
            "boxes": [
                {"class_name": "araba", "color": "#3b82f6", "x": 0.22, "y": 0.58, "w": 0.22, "h": 0.28},
                {"class_name": "araba", "color": "#3b82f6", "x": 0.52, "y": 0.55, "w": 0.20, "h": 0.26},
                {"class_name": "kamyon", "color": "#8b5cf6", "x": 0.72, "y": 0.45, "w": 0.22, "h": 0.40},
                {"class_name": "plaka", "color": "#f59e0b", "x": 0.28, "y": 0.76, "w": 0.08, "h": 0.05}
            ]
        },
        {
            "image_url": "https://images.unsplash.com/photo-1590674899484-d5640e854abe?w=700&auto=format&fit=crop&q=80",
            "title": "Açık Otopark Doluluk Tespiti",
            "boxes": [
                {"class_name": "dolu_park", "color": "#ef4444", "x": 0.15, "y": 0.42, "w": 0.18, "h": 0.28},
                {"class_name": "dolu_park", "color": "#ef4444", "x": 0.36, "y": 0.44, "w": 0.17, "h": 0.27},
                {"class_name": "bos_park", "color": "#10b981", "x": 0.55, "y": 0.45, "w": 0.18, "h": 0.25},
                {"class_name": "dolu_park", "color": "#ef4444", "x": 0.74, "y": 0.46, "w": 0.18, "h": 0.26}
            ]
        },
        {
            "image_url": "https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?w=700&auto=format&fit=crop&q=80",
            "title": "Yaya Geçidi & Şehir İçi Kavşak",
            "boxes": [
                {"class_name": "yaya", "color": "#10b981", "x": 0.38, "y": 0.48, "w": 0.12, "h": 0.40},
                {"class_name": "yaya", "color": "#10b981", "x": 0.52, "y": 0.50, "w": 0.11, "h": 0.38},
                {"class_name": "arac", "color": "#3b82f6", "x": 0.68, "y": 0.52, "w": 0.25, "h": 0.32}
            ]
        }
    ],
    "industry": [
        {
            "image_url": "https://images.unsplash.com/photo-1518770660439-4636190af475?w=700&auto=format&fit=crop&q=80",
            "title": "SMD Elektronik Kart (PCB) Lehim Hatları",
            "boxes": [
                {"class_name": "eksik_bilesen", "color": "#06b6d4", "x": 0.28, "y": 0.32, "w": 0.14, "h": 0.15},
                {"class_name": "hatali_lehim", "color": "#f59e0b", "x": 0.55, "y": 0.48, "w": 0.12, "h": 0.12},
                {"class_name": "kisa_devre", "color": "#ef4444", "x": 0.70, "y": 0.60, "w": 0.15, "h": 0.14}
            ]
        },
        {
            "image_url": "https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?w=700&auto=format&fit=crop&q=80",
            "title": "Üretim Bandı Şişe Kapak ve Sıvı Seviyesi",
            "boxes": [
                {"class_name": "dolu_sise", "color": "#10b981", "x": 0.20, "y": 0.25, "w": 0.18, "h": 0.65},
                {"class_name": "dolu_sise", "color": "#10b981", "x": 0.45, "y": 0.26, "w": 0.18, "h": 0.64},
                {"class_name": "eksik_dolum", "color": "#ef4444", "x": 0.70, "y": 0.28, "w": 0.18, "h": 0.62}
            ]
        }
    ],
    "retail": [
        {
            "image_url": "https://images.unsplash.com/photo-1578916171728-46686eac8d58?w=700&auto=format&fit=crop&q=80",
            "title": "Süpermarket Rafı Ürün Sayımı & Boşluk",
            "boxes": [
                {"class_name": "urun_paket", "color": "#ec4899", "x": 0.18, "y": 0.22, "w": 0.20, "h": 0.35},
                {"class_name": "urun_paket", "color": "#ec4899", "x": 0.40, "y": 0.22, "w": 0.20, "h": 0.35},
                {"class_name": "bos_raf", "color": "#ef4444", "x": 0.65, "y": 0.24, "w": 0.25, "h": 0.32},
                {"class_name": "fiyat_etiketi", "color": "#8b5cf6", "x": 0.22, "y": 0.58, "w": 0.12, "h": 0.08}
            ]
        },
        {
            "image_url": "https://images.unsplash.com/photo-1566576912321-d58ddd7a6088?w=700&auto=format&fit=crop&q=80",
            "title": "Kargo Koli Tasnif & Barkod Kontrolü",
            "boxes": [
                {"class_name": "koli", "color": "#d97706", "x": 0.25, "y": 0.35, "w": 0.32, "h": 0.45},
                {"class_name": "barkod", "color": "#3b82f6", "x": 0.34, "y": 0.48, "w": 0.14, "h": 0.12},
                {"class_name": "hasarli_koli", "color": "#ef4444", "x": 0.65, "y": 0.40, "w": 0.28, "h": 0.40}
            ]
        }
    ],
    "agriculture": [
        {
            "image_url": "https://images.unsplash.com/photo-1500937386664-56d1dfef3854?w=700&auto=format&fit=crop&q=80",
            "title": "Drone ile Tarla Mahsulü & Yabani Ot Teşhisi",
            "boxes": [
                {"class_name": "saglikli_mahsul", "color": "#22c55e", "x": 0.25, "y": 0.45, "w": 0.30, "h": 0.35},
                {"class_name": "zararli_ot", "color": "#ef4444", "x": 0.62, "y": 0.52, "w": 0.18, "h": 0.20},
                {"class_name": "saglikli_mahsul", "color": "#22c55e", "x": 0.48, "y": 0.28, "w": 0.25, "h": 0.28}
            ]
        },
        {
            "image_url": "https://images.unsplash.com/photo-1592417817098-8f3d6910985b?w=700&auto=format&fit=crop&q=80",
            "title": "Meyve Bahçesi Olgunluk Analizi",
            "boxes": [
                {"class_name": "olgun_meyve", "color": "#22c55e", "x": 0.32, "y": 0.35, "w": 0.18, "h": 0.22},
                {"class_name": "ham_meyve", "color": "#eab308", "x": 0.58, "y": 0.42, "w": 0.16, "h": 0.20},
                {"class_name": "curuk_hasarli", "color": "#ef4444", "x": 0.45, "y": 0.65, "w": 0.15, "h": 0.18}
            ]
        }
    ],
    "drone": [
        {
            "image_url": "https://images.unsplash.com/photo-1508614589041-895b88991e3e?w=700&auto=format&fit=crop&q=80",
            "title": "Güneş Paneli (Solar Farm) Termal Çatlak",
            "boxes": [
                {"class_name": "saglam_panel", "color": "#10b981", "x": 0.20, "y": 0.30, "w": 0.30, "h": 0.25},
                {"class_name": "hotspot_hucre", "color": "#ef4444", "x": 0.55, "y": 0.38, "w": 0.25, "h": 0.22},
                {"class_name": "toz_golge", "color": "#64748b", "x": 0.35, "y": 0.62, "w": 0.28, "h": 0.24}
            ]
        },
        {
            "image_url": "https://images.unsplash.com/photo-1466611653911-95081537e5b7?w=700&auto=format&fit=crop&q=80",
            "title": "Rüzgar Türbini Kanat Hasar Denetimi",
            "boxes": [
                {"class_name": "turbin_kanat", "color": "#3b82f6", "x": 0.30, "y": 0.20, "w": 0.40, "h": 0.55},
                {"class_name": "yuzey_catlak", "color": "#ef4444", "x": 0.42, "y": 0.38, "w": 0.12, "h": 0.14}
            ]
        }
    ],
    "medical": [
        {
            "image_url": "https://images.unsplash.com/photo-1579684385127-1ef15d508118?w=700&auto=format&fit=crop&q=80",
            "title": "Mikroskopik Kan Hücresi Tespiti",
            "boxes": [
                {"class_name": "alyuvar_rbc", "color": "#ef4444", "x": 0.25, "y": 0.30, "w": 0.16, "h": 0.18},
                {"class_name": "alyuvar_rbc", "color": "#ef4444", "x": 0.55, "y": 0.40, "w": 0.15, "h": 0.17},
                {"class_name": "akyuvar_wbc", "color": "#8b5cf6", "x": 0.38, "y": 0.58, "w": 0.22, "h": 0.25},
                {"class_name": "trombosit", "color": "#3b82f6", "x": 0.72, "y": 0.28, "w": 0.10, "h": 0.10}
            ]
        }
    ],
    "sports": [
        {
            "image_url": "https://images.unsplash.com/photo-1508098682722-e99c43a406b2?w=700&auto=format&fit=crop&q=80",
            "title": "Futbol Oyuncu, Hakem ve Top Takibi",
            "boxes": [
                {"class_name": "takim_a", "color": "#ef4444", "x": 0.28, "y": 0.35, "w": 0.15, "h": 0.45},
                {"class_name": "takim_b", "color": "#3b82f6", "x": 0.52, "y": 0.32, "w": 0.16, "h": 0.48},
                {"class_name": "futbol_topu", "color": "#ffffff", "x": 0.44, "y": 0.68, "w": 0.06, "h": 0.08}
            ]
        }
    ],
    "security": [
        {
            "image_url": "https://images.unsplash.com/photo-1555529669-e69e7aa0ba9a?w=700&auto=format&fit=crop&q=80",
            "title": "Metro İstasyonu Sahipsiz Çanta Uyarısı",
            "boxes": [
                {"class_name": "sahipsiz_canta", "color": "#ef4444", "x": 0.42, "y": 0.65, "w": 0.18, "h": 0.20},
                {"class_name": "guvenlik_gorevlisi", "color": "#3b82f6", "x": 0.70, "y": 0.35, "w": 0.20, "h": 0.55}
            ]
        }
    ]
}

def enrich_templates_with_demo_datasets():
    print(f"Enriching {len(templates)} templates with demo datasets...")
    updated_count = 0

    for t in templates:
        tid = t["tmpl"]
        cat = t["cat"]
        # Match category demo images or fallback to safety/traffic
        samples = CATEGORY_IMAGES.get(cat) or CATEGORY_IMAGES.get("safety")
        
        # Build tailored boxes with template's actual class names if possible
        template_classes = [c[0] if isinstance(c, (list, tuple)) else c.get("name") for c in t.get("classes", [])]
        
        enriched_samples = []
        for s in samples:
            sample_boxes = []
            for idx, b in enumerate(s.get("boxes", [])):
                # Map box class to template class if available
                cls_name = template_classes[idx % len(template_classes)] if template_classes else b.get("class_name")
                cls_color = t.get("classes", [])[idx % len(t.get("classes", []))][1] if t.get("classes") and isinstance(t.get("classes", [])[0], (list, tuple)) else b.get("color")
                sample_boxes.append({
                    "class_name": cls_name,
                    "color": cls_color,
                    "x": b["x"],
                    "y": b["y"],
                    "w": b["w"],
                    "h": b["h"]
                })
            enriched_samples.append({
                "image_url": s["image_url"],
                "title": f"{t['title']} — {s['title']}",
                "boxes": sample_boxes
            })

        samples_json = json.dumps(enriched_samples, ensure_ascii=False)
        
        sql = "UPDATE explore_templates SET sample_images_json = ? WHERE id = ?"
        res = cf_d1_query(sql, [samples_json, tid])
        if res is not None:
            updated_count += 1
            print(f"[OK] Demo dataset added: {tid}")
        else:
            print(f"[ERR] Failed: {tid}")

    print(f"\nDone. Successfully enriched {updated_count}/{len(templates)} templates with demo datasets in Cloudflare D1.")

if __name__ == "__main__":
    enrich_templates_with_demo_datasets()
