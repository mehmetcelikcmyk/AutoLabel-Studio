# -*- coding: utf-8 -*-
"""
scripts/seed_r2_template_datasets.py
49 hazır sektörel şablonun her biri için kendi konusuna özel, görsel olarak uyumlu SVG veri URI
veya gerçek sahne şeması üzerinde nesnelerle birebir örtüşen YOLO bounding box etiketleri üretir
ve Cloudflare D1 explore_templates tablosuna kaydeder.
"""
import sys
import json
import base64

sys.path.insert(0, ".")
from core.database import cf_d1_query
from scripts.generate_templates import templates


def _svg_data_uri(svg_content: str) -> str:
    b64 = base64.b64encode(svg_content.encode("utf-8")).decode("ascii")
    return f"data:image/svg+xml;base64,{b64}"


def _build_scene_svg(tid: str, title: str, cat: str, classes: list, objects: list) -> str:
    """
    Şablon konusuna ve nesnelerine özel yüksek kontrastlı, teknik bilgisayarlı görü sahnesi (800x600 SVG) üretir.
    Çizilen her nesnenin konumu (x, y, w, h) etiket kutularıyla %100 aynı koordinattadır.
    """
    palettes = {
        "safety": ("#0f172a", "#1e293b", "#f59e0b"),
        "traffic": ("#090d16", "#1e293b", "#38bdf8"),
        "industry": ("#0b1120", "#172554", "#06b6d4"),
        "retail": ("#111827", "#1f2937", "#ec4899"),
        "agriculture": ("#052e16", "#14532d", "#22c55e"),
        "drone": ("#082f49", "#0c4a6e", "#38bdf8"),
        "medical": ("#020617", "#0f172a", "#a855f7"),
        "sports": ("#064e3b", "#065f46", "#34d399"),
        "security": ("#18181b", "#27272a", "#ef4444"),
    }
    bg1, bg2, accent = palettes.get(cat, ("#0f172a", "#1e293b", "#3b82f6"))

    shapes_svg = []
    for idx, obj in enumerate(objects):
        ox = int(obj["x"] * 800)
        oy = int(obj["y"] * 600)
        ow = int(obj["w"] * 800)
        oh = int(obj["h"] * 600)
        color = obj["color"]
        cname = obj["class_name"]
        cx = ox + ow // 2
        cy = oy + oh // 2
        r_min = min(ow, oh) // 3

        # Nesne gövdesi ve ikonografik silüeti
        shapes_svg.append(
            f'<g>'
            f'<rect x="{ox+4}" y="{oy+4}" width="{max(20, ow-8)}" height="{max(20, oh-8)}" rx="12" '
            f'fill="{color}" fill-opacity="0.22" stroke="{color}" stroke-width="2" stroke-dasharray="6,4"/>'
            f'<circle cx="{cx}" cy="{cy - 8}" r="{max(12, r_min)}" fill="{color}" fill-opacity="0.38" stroke="{color}" stroke-width="2"/>'
            f'<rect x="{cx - max(16, ow//4)}" y="{cy + max(8, r_min//2)}" width="{max(32, ow//2)}" height="18" rx="6" fill="#020617" fill-opacity="0.85" stroke="{color}" stroke-width="1.2"/>'
            f'<text x="{cx}" y="{cy + max(8, r_min//2) + 13}" fill="#f8fafc" font-family="Segoe UI, Arial, sans-serif" font-size="11" font-weight="700" text-anchor="middle">{cname}</text>'
            f'</g>'
        )

    grid_lines = []
    for gx in range(80, 800, 80):
        grid_lines.append(f'<line x1="{gx}" y1="0" x2="{gx}" y2="600" stroke="#ffffff" stroke-opacity="0.04" stroke-width="1"/>')
    for gy in range(60, 600, 60):
        grid_lines.append(f'<line x1="0" y1="{gy}" x2="800" y2="{gy}" stroke="#ffffff" stroke-opacity="0.04" stroke-width="1"/>')

    safe_title = title.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    svg = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" width="800" height="600">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="{bg1}"/>
      <stop offset="100%" stop-color="{bg2}"/>
    </linearGradient>
  </defs>
  <rect width="800" height="600" fill="url(#bg)"/>
  {''.join(grid_lines)}
  <rect x="20" y="18" width="760" height="44" rx="10" fill="#020617" fill-opacity="0.72" stroke="{accent}" stroke-opacity="0.35" stroke-width="1.5"/>
  <circle cx="42" cy="40" r="6" fill="{accent}"/>
  <text x="58" y="45" fill="#f8fafc" font-family="Segoe UI, Arial, sans-serif" font-size="15" font-weight="700">{safe_title}</text>
  <text x="760" y="45" fill="#94a3b8" font-family=" monospace" font-size="12" text-anchor="end">YOLO-GT [{tid.upper()}]</text>
  {''.join(shapes_svg)}
</svg>"""
    return _svg_data_uri(svg)


# Şablon bazlı özel nesne yerleşim düzenleri (Her şablon kendi sınıflarını kendi sahnesinde doğru koordinatta gösterir)
LAYOUT_PRESETS = [
    [
        {"x": 0.08, "y": 0.18, "w": 0.36, "h": 0.34},
        {"x": 0.52, "y": 0.18, "w": 0.38, "h": 0.34},
        {"x": 0.10, "y": 0.58, "w": 0.34, "h": 0.32},
        {"x": 0.54, "y": 0.58, "w": 0.36, "h": 0.32},
    ],
    [
        {"x": 0.07, "y": 0.22, "w": 0.26, "h": 0.62},
        {"x": 0.37, "y": 0.22, "w": 0.26, "h": 0.62},
        {"x": 0.67, "y": 0.22, "w": 0.26, "h": 0.62},
        {"x": 0.38, "y": 0.14, "w": 0.24, "h": 0.14},
    ],
    [
        {"x": 0.12, "y": 0.20, "w": 0.42, "h": 0.40},
        {"x": 0.58, "y": 0.22, "w": 0.30, "h": 0.32},
        {"x": 0.16, "y": 0.64, "w": 0.32, "h": 0.26},
        {"x": 0.54, "y": 0.60, "w": 0.34, "h": 0.30},
    ],
]


def build_tailored_dataset_for_template(t: dict, idx_seed: int = 0) -> list:
    tid = t["tmpl"]
    cat = t.get("cat", "safety")
    title = t.get("title", tid)
    classes = t.get("classes", [])

    preset_1 = LAYOUT_PRESETS[idx_seed % len(LAYOUT_PRESETS)]
    preset_2 = LAYOUT_PRESETS[(idx_seed + 1) % len(LAYOUT_PRESETS)]

    boxes_1 = []
    for i, cls in enumerate(classes):
        slot = preset_1[i % len(preset_1)]
        cname = cls[0] if isinstance(cls, (list, tuple)) else cls.get("name", f"class_{i}")
        color = cls[1] if isinstance(cls, (list, tuple)) else cls.get("color", "#3b82f6")
        boxes_1.append({
            "class_name": cname,
            "color": color,
            "x": slot["x"],
            "y": slot["y"],
            "w": slot["w"],
            "h": slot["h"],
        })

    boxes_2 = []
    for i, cls in enumerate(reversed(classes)):
        slot = preset_2[i % len(preset_2)]
        cname = cls[0] if isinstance(cls, (list, tuple)) else cls.get("name", f"class_{i}")
        color = cls[1] if isinstance(cls, (list, tuple)) else cls.get("color", "#3b82f6")
        boxes_2.append({
            "class_name": cname,
            "color": color,
            "x": slot["x"],
            "y": slot["y"],
            "w": slot["w"],
            "h": slot["h"],
        })

    svg_uri_1 = _build_scene_svg(tid, f"{title} — Sahne #1", cat, classes, boxes_1)
    svg_uri_2 = _build_scene_svg(tid, f"{title} — Sahne #2", cat, classes, boxes_2)

    return [
        {
            "image_url": svg_uri_1,
            "title": f"{title} — Örnek Sahne 1",
            "boxes": boxes_1,
        },
        {
            "image_url": svg_uri_2,
            "title": f"{title} — Örnek Sahne 2",
            "boxes": boxes_2,
        },
    ]


def run_seed():
    print(f"Toplam {len(templates)} şablon için birebir örtüşen sahne ve etiketler D1'e yazılıyor...")
    success = 0
    for idx, t in enumerate(templates):
        tid = t["tmpl"]
        dataset = build_tailored_dataset_for_template(t, idx)
        dataset_json = json.dumps(dataset, ensure_ascii=False)
        res = cf_d1_query(
            "UPDATE explore_templates SET sample_images_json = ? WHERE id = ?",
            [dataset_json, tid],
        )
        if res is not None:
            success += 1
    print(f"Tamamlandı: {success}/{len(templates)} şablon güncellendi.")


if __name__ == "__main__":
    run_seed()
