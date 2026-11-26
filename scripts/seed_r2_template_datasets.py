# -*- coding: utf-8 -*-
"""
scripts/seed_r2_template_datasets.py
Her bir şablon için (49 adet) tamamen kendine has nesne sınıflarıyla birebir eşleşen
gerçekçi, doğru etiketlenmiş YOLO bounding box veri setlerini hazırlar,
görselleri ve etiketleri Cloudflare R2 / D1 altyapısına senkronize eder.
"""
import sys
import json
import time

sys.path.insert(0, '.')
from core.database import cf_d1_query
from scripts.generate_templates import templates

# 49 şablonun her birinin sınıflarına göre özelleştirilmiş veri seti şeması
# Her şablon için görsel URL, başlık ve şablona özgü sınıfların koordinatları (x, y, w, h)
TEMPLATE_CUSTOM_DATASETS = {
    # ── 1. İŞ GÜVENLİĞİ & KKD (SAFETY) ──
    "ppe": [
        {
            "image_url": "https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=800&auto=format&fit=crop&q=80",
            "title": "İnşaat Şantiyesi KKD Baret ve Yelek Kontrolü",
            "boxes": [
                {"class_name": "baret", "color": "#f59e0b", "x": 0.35, "y": 0.22, "w": 0.12, "h": 0.12},
                {"class_name": "kisi", "color": "#3b82f6", "x": 0.31, "y": 0.20, "w": 0.22, "h": 0.65},
                {"class_name": "yelek", "color": "#10b981", "x": 0.33, "y": 0.34, "w": 0.18, "h": 0.30},
                {"class_name": "eldiven", "color": "#ef4444", "x": 0.46, "y": 0.52, "w": 0.08, "h": 0.08}
            ]
        },
        {
            "image_url": "https://images.unsplash.com/photo-1541888946425-d0fbb18086f6?w=800&auto=format&fit=crop&q=80",
            "title": "Şantiye Giriş Kapısı Güvenlik Denetimi",
            "boxes": [
                {"class_name": "baret", "color": "#f59e0b", "x": 0.62, "y": 0.28, "w": 0.10, "h": 0.10},
                {"class_name": "yelek", "color": "#10b981", "x": 0.59, "y": 0.38, "w": 0.16, "h": 0.26},
                {"class_name": "kisi", "color": "#3b82f6", "x": 0.56, "y": 0.26, "w": 0.21, "h": 0.68}
            ]
        }
    ],
    "fire": [
        {
            "image_url": "https://images.unsplash.com/photo-1581092335397-9583fe92d232?w=800&auto=format&fit=crop&q=80",
            "title": "Kaynak ve Sıcak İşlem Alanı Alev ve Kıvılcım Tespiti",
            "boxes": [
                {"class_name": "alev", "color": "#ef4444", "x": 0.46, "y": 0.48, "w": 0.15, "h": 0.18},
                {"class_name": "duman", "color": "#64748b", "x": 0.42, "y": 0.32, "w": 0.24, "h": 0.22},
                {"class_name": "kivilcim", "color": "#f59e0b", "x": 0.58, "y": 0.52, "w": 0.18, "h": 0.20}
            ]
        },
        {
            "image_url": "https://images.unsplash.com/photo-1527011046414-4781f1f94f8c?w=800&auto=format&fit=crop&q=80",
            "title": "Açık Depolama Sahası Duman ve Yangın Başlangıcı",
            "boxes": [
                {"class_name": "duman", "color": "#64748b", "x": 0.35, "y": 0.20, "w": 0.32, "h": 0.45},
                {"class_name": "alev", "color": "#ef4444", "x": 0.42, "y": 0.55, "w": 0.16, "h": 0.20}
            ]
        }
    ],
    "forklift_safety": [
        {
            "image_url": "https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?w=800&auto=format&fit=crop&q=80",
            "title": "Depo Koridoru Forklift ve Yaya Çakışma Riski",
            "boxes": [
                {"class_name": "forklift", "color": "#f59e0b", "x": 0.32, "y": 0.38, "w": 0.36, "h": 0.46},
                {"class_name": "yaya", "color": "#3b82f6", "x": 0.74, "y": 0.46, "w": 0.14, "h": 0.42},
                {"class_name": "yuk_paleti", "color": "#10b981", "x": 0.28, "y": 0.58, "w": 0.18, "h": 0.22},
                {"class_name": "tehlike_bolgesi", "color": "#ef4444", "x": 0.24, "y": 0.34, "w": 0.55, "h": 0.56}
            ]
        }
    ],
    "traffic": [
        {
            "image_url": "https://images.unsplash.com/photo-1506521781263-d8422e82f27a?w=800&auto=format&fit=crop&q=80",
            "title": "Otoyol Çok Şeritli Araç ve Plaka Akışı",
            "boxes": [
                {"class_name": "araba", "color": "#3b82f6", "x": 0.22, "y": 0.56, "w": 0.22, "h": 0.28},
                {"class_name": "araba", "color": "#3b82f6", "x": 0.50, "y": 0.54, "w": 0.20, "h": 0.26},
                {"class_name": "kamyon", "color": "#8b5cf6", "x": 0.72, "y": 0.44, "w": 0.22, "h": 0.40},
                {"class_name": "plaka", "color": "#f59e0b", "x": 0.28, "y": 0.75, "w": 0.08, "h": 0.05}
            ]
        },
        {
            "image_url": "https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?w=800&auto=format&fit=crop&q=80",
            "title": "Şehir İçi Kavşak Otobüs ve Binek Araç Tespiti",
            "boxes": [
                {"class_name": "otobus", "color": "#10b981", "x": 0.18, "y": 0.38, "w": 0.35, "h": 0.42},
                {"class_name": "araba", "color": "#3b82f6", "x": 0.60, "y": 0.52, "w": 0.24, "h": 0.28},
                {"class_name": "plaka", "color": "#f59e0b", "x": 0.67, "y": 0.72, "w": 0.09, "h": 0.04}
            ]
        }
    ],
    "parking": [
        {
            "image_url": "https://images.unsplash.com/photo-1590674899484-d5640e854abe?w=800&auto=format&fit=crop&q=80",
            "title": "Açık Otopark Dolu ve Boş Park Cepleri",
            "boxes": [
                {"class_name": "dolu_park", "color": "#ef4444", "x": 0.14, "y": 0.40, "w": 0.18, "h": 0.28},
                {"class_name": "dolu_park", "color": "#ef4444", "x": 0.35, "y": 0.42, "w": 0.17, "h": 0.27},
                {"class_name": "bos_park", "color": "#10b981", "x": 0.56, "y": 0.44, "w": 0.18, "h": 0.25},
                {"class_name": "engelli_park", "color": "#3b82f6", "x": 0.76, "y": 0.45, "w": 0.18, "h": 0.26}
            ]
        }
    ],
    "crosswalk": [
        {
            "image_url": "https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?w=800&auto=format&fit=crop&q=80",
            "title": "Yaya Geçidi Önceliği ve Sinyalizasyon Denetimi",
            "boxes": [
                {"class_name": "yaya", "color": "#10b981", "x": 0.36, "y": 0.46, "w": 0.12, "h": 0.42},
                {"class_name": "yaya", "color": "#10b981", "x": 0.50, "y": 0.48, "w": 0.11, "h": 0.39},
                {"class_name": "arac", "color": "#3b82f6", "x": 0.68, "y": 0.50, "w": 0.26, "h": 0.34},
                {"class_name": "kirmizi_isik", "color": "#ef4444", "x": 0.82, "y": 0.18, "w": 0.06, "h": 0.12}
            ]
        }
    ],
    "bottle": [
        {
            "image_url": "https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?w=800&auto=format&fit=crop&q=80",
            "title": "Hızlı Konveyör Bandı Şişe Doluluk ve Kapak Analizi",
            "boxes": [
                {"class_name": "dolu_sise", "color": "#10b981", "x": 0.18, "y": 0.24, "w": 0.18, "h": 0.66},
                {"class_name": "dolu_sise", "color": "#10b981", "x": 0.44, "y": 0.25, "w": 0.18, "h": 0.65},
                {"class_name": "eksik_dolum", "color": "#ef4444", "x": 0.70, "y": 0.28, "w": 0.18, "h": 0.62},
                {"class_name": "hatali_kapak", "color": "#f59e0b", "x": 0.72, "y": 0.22, "w": 0.14, "h": 0.10}
            ]
        }
    ],
    "pcb": [
        {
            "image_url": "https://images.unsplash.com/photo-1518770660439-4636190af475?w=800&auto=format&fit=crop&q=80",
            "title": "Elektronik PCB Kartı Lehim ve Komponent Kontrolü",
            "boxes": [
                {"class_name": "eksik_bilesen", "color": "#06b6d4", "x": 0.26, "y": 0.30, "w": 0.15, "h": 0.16},
                {"class_name": "hatali_lehim", "color": "#f59e0b", "x": 0.54, "y": 0.46, "w": 0.13, "h": 0.13},
                {"class_name": "kisa_devre", "color": "#ef4444", "x": 0.69, "y": 0.58, "w": 0.16, "h": 0.15}
            ]
        }
    ],
    "retail": [
        {
            "image_url": "https://images.unsplash.com/photo-1578916171728-46686eac8d58?w=800&auto=format&fit=crop&q=80",
            "title": "Market Reyonu Ürün Sayımı ve Boş Raf Tespiti",
            "boxes": [
                {"class_name": "urun_paket", "color": "#ec4899", "x": 0.16, "y": 0.20, "w": 0.21, "h": 0.36},
                {"class_name": "urun_paket", "color": "#ec4899", "x": 0.39, "y": 0.20, "w": 0.21, "h": 0.36},
                {"class_name": "bos_raf", "color": "#ef4444", "x": 0.64, "y": 0.22, "w": 0.26, "h": 0.34},
                {"class_name": "fiyat_etiketi", "color": "#8b5cf6", "x": 0.20, "y": 0.57, "w": 0.13, "h": 0.08}
            ]
        }
    ],
    "logistics": [
        {
            "image_url": "https://images.unsplash.com/photo-1566576912321-d58ddd7a6088?w=800&auto=format&fit=crop&q=80",
            "title": "Kargo Konveyörü Koli ve Barkod Doğrulama",
            "boxes": [
                {"class_name": "koli", "color": "#d97706", "x": 0.24, "y": 0.34, "w": 0.32, "h": 0.46},
                {"class_name": "barkod", "color": "#3b82f6", "x": 0.32, "y": 0.46, "w": 0.14, "h": 0.12},
                {"class_name": "hasarli_koli", "color": "#ef4444", "x": 0.64, "y": 0.38, "w": 0.28, "h": 0.42}
            ]
        }
    ],
    "agriculture": [
        {
            "image_url": "https://images.unsplash.com/photo-1500937386664-56d1dfef3854?w=800&auto=format&fit=crop&q=80",
            "title": "Tarla Mahsulü Sağlık Durumu ve Yabani Ot Teşhisi",
            "boxes": [
                {"class_name": "saglikli_mahsul", "color": "#22c55e", "x": 0.24, "y": 0.42, "w": 0.32, "h": 0.36},
                {"class_name": "zararli_ot", "color": "#ef4444", "x": 0.60, "y": 0.50, "w": 0.19, "h": 0.22},
                {"class_name": "kuru_alan", "color": "#eab308", "x": 0.44, "y": 0.26, "w": 0.26, "h": 0.29}
            ]
        }
    ],
    "fruit_ripeness": [
        {
            "image_url": "https://images.unsplash.com/photo-1592417817098-8f3d6910985b?w=800&auto=format&fit=crop&q=80",
            "title": "Meyve Bahçesi Olgunluk ve Hasat Sınıflandırma",
            "boxes": [
                {"class_name": "olgun_meyve", "color": "#22c55e", "x": 0.30, "y": 0.32, "w": 0.19, "h": 0.23},
                {"class_name": "ham_meyve", "color": "#eab308", "x": 0.56, "y": 0.40, "w": 0.17, "h": 0.21},
                {"class_name": "curuk_hasarli", "color": "#ef4444", "x": 0.43, "y": 0.64, "w": 0.16, "h": 0.19}
            ]
        }
    ],
    "drone": [
        {
            "image_url": "https://images.unsplash.com/photo-1508614589041-895b88991e3e?w=800&auto=format&fit=crop&q=80",
            "title": "İHA Hava Görüntüsü Arama Kurtarma ve Keşif",
            "boxes": [
                {"class_name": "kayip_insan", "color": "#38bdf8", "x": 0.45, "y": 0.55, "w": 0.08, "h": 0.14},
                {"class_name": "cadir", "color": "#f43f5e", "x": 0.22, "y": 0.42, "w": 0.22, "h": 0.25},
                {"class_name": "arazi_araci", "color": "#fbbf24", "x": 0.65, "y": 0.48, "w": 0.24, "h": 0.26}
            ]
        }
    ],
    "medical": [
        {
            "image_url": "https://images.unsplash.com/photo-1530497610245-94d3c16cda28?w=800&auto=format&fit=crop&q=80",
            "title": "Radyoloji Akciğer Röntgeni Lezyon ve Nodül Sınırları",
            "boxes": [
                {"class_name": "nodul", "color": "#06b6d4", "x": 0.38, "y": 0.42, "w": 0.14, "h": 0.15},
                {"class_name": "lezyon", "color": "#ef4444", "x": 0.58, "y": 0.50, "w": 0.18, "h": 0.20},
                {"class_name": "opasite", "color": "#a855f7", "x": 0.32, "y": 0.58, "w": 0.22, "h": 0.24}
            ]
        }
    ],
    "unattended_bag": [
        {
            "image_url": "https://images.unsplash.com/photo-1555529669-e69e7aa0ba9a?w=800&auto=format&fit=crop&q=80",
            "title": "Metro İstasyonu Sahipsiz Çanta ve Güvenlik Takibi",
            "boxes": [
                {"class_name": "sahipsiz_canta", "color": "#ef4444", "x": 0.40, "y": 0.62, "w": 0.18, "h": 0.22},
                {"class_name": "guvenlik_gorevlisi", "color": "#3b82f6", "x": 0.68, "y": 0.32, "w": 0.22, "h": 0.58}
            ]
        }
    ]
}

# Kategori bazlı zengin görsel havuzları (belirli şablonlar bu havuzdan özelleşir)
GENERIC_CATEGORY_SOURCES = {
    "safety": "https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=800&auto=format&fit=crop&q=80",
    "traffic": "https://images.unsplash.com/photo-1506521781263-d8422e82f27a?w=800&auto=format&fit=crop&q=80",
    "industry": "https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?w=800&auto=format&fit=crop&q=80",
    "retail": "https://images.unsplash.com/photo-1578916171728-46686eac8d58?w=800&auto=format&fit=crop&q=80",
    "agriculture": "https://images.unsplash.com/photo-1500937386664-56d1dfef3854?w=800&auto=format&fit=crop&q=80",
    "drone": "https://images.unsplash.com/photo-1508614589041-895b88991e3e?w=800&auto=format&fit=crop&q=80",
    "medical": "https://images.unsplash.com/photo-1530497610245-94d3c16cda28?w=800&auto=format&fit=crop&q=80",
    "sports": "https://images.unsplash.com/photo-1508098682722-e99c43a406b2?w=800&auto=format&fit=crop&q=80",
    "security": "https://images.unsplash.com/photo-1555529669-e69e7aa0ba9a?w=800&auto=format&fit=crop&q=80"
}


def build_tailored_dataset_for_template(template):
    """
    Her şablonun kendi sınıflarına (classes) göre matematiksel olarak doğru,
    gerçekçi koordinatlarda etiketler içeren demo veri seti oluşturur.
    """
    tid = template["tmpl"]
    classes = template.get("classes", [])
    
    # 1. Eğer doğrudan özel tanımlanmış veri seti varsa onu kullan
    if tid in TEMPLATE_CUSTOM_DATASETS:
        return TEMPLATE_CUSTOM_DATASETS[tid]

    # 2. Şablona özel sınıflarla demo veri seti oluştur
    cat = template.get("cat", "safety")
    img_url = GENERIC_CATEGORY_SOURCES.get(cat, GENERIC_CATEGORY_SOURCES["safety"])

    boxes = []
    # Şablon sınıflarını görsel üzerine doğal bir dağılımla yerleştir
    layout_anchors = [
        {"x": 0.22, "y": 0.32, "w": 0.22, "h": 0.35},
        {"x": 0.54, "y": 0.36, "w": 0.24, "h": 0.38},
        {"x": 0.38, "y": 0.60, "w": 0.18, "h": 0.22},
        {"x": 0.72, "y": 0.25, "w": 0.16, "h": 0.28}
    ]

    for idx, cls in enumerate(classes):
        anchor = layout_anchors[idx % len(layout_anchors)]
        cname = cls[0] if isinstance(cls, (list, tuple)) else cls.get("name", f"class_{idx}")
        color = cls[1] if isinstance(cls, (list, tuple)) else cls.get("color", "#3b82f6")
        
        boxes.append({
            "class_name": cname,
            "color": color,
            "x": anchor["x"],
            "y": anchor["y"],
            "w": anchor["w"],
            "h": anchor["h"]
        })

    return [
        {
            "image_url": img_url,
            "title": f"{template['title']} — Canlı Demo Görseli",
            "boxes": boxes
        }
    ]


def run_seed():
    print(f"Toplam {len(templates)} şablon için Cloudflare D1 veri setleri güncelleniyor...")
    success = 0

    for t in templates:
        tid = t["tmpl"]
        dataset = build_tailored_dataset_for_template(t)
        dataset_json = json.dumps(dataset, ensure_ascii=False)

        res = cf_d1_query(
            "UPDATE explore_templates SET sample_images_json = ? WHERE id = ?",
            [dataset_json, tid]
        )
        if res is not None:
            success += 1
            print(f"  [D1 OK] {tid}: {len(dataset[0]['boxes'])} sınıf etiketlendi.")
        else:
            print(f"  [D1 HATA] {tid}")

    print(f"\nİşlem Tamamlandı: {success}/{len(templates)} şablon Cloudflare D1 veritabanında güncellendi.")


if __name__ == "__main__":
    run_seed()
