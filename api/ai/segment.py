"""
api/ai/segment.py
Görsel segmentasyon ve kutu sınırlarını hassaslaştırma endpoints:
- /api/refine-bounding-box (POST)
- /api/smart-segment (POST)
"""

import logging
from typing import Optional

import cv2
import numpy as np
from fastapi import APIRouter, HTTPException, Header

from core.security import check_project_permission
from api.ai_models import get_ai_model, set_classes_if_changed, run_model_predict, _MODEL_LOCK
from api.ai.auto_label import (
    _load_image_with_r2_fallback,
    _resolve_cls_list,
    _build_prompt_map,
)
from api.shared.models import (
    RefineBoundingBoxRequest,
    SmartSegmentRequest,
)
from api.shared.utils import load_project_config

logger = logging.getLogger(__name__)

router = APIRouter(tags=["AI Segmentation"])


@router.post("/api/refine-bounding-box")
def refine_bounding_box(req: RefineBoundingBoxRequest, authorization: Optional[str] = Header(None)):
    check_project_permission(req.category, authorization, require_edit=True)

    img_rgb = _load_image_with_r2_fallback(req.category, req.image_filename)
    if img_rgb is None:
        raise HTTPException(status_code=404, detail=f"Görsel bulunamadı (disk ve R2): {req.image_filename}")

    h_img, w_img = img_rgb.shape[:2]
    refined_boxes = []

    for b in req.boxes:
        bx1 = int((b.x_center - b.width / 2.0) * w_img)
        by1 = int((b.y_center - b.height / 2.0) * h_img)
        bx2 = int((b.x_center + b.width / 2.0) * w_img)
        by2 = int((b.y_center + b.height / 2.0) * h_img)

        try:
            with _MODEL_LOCK:
                model, _ = get_ai_model("yolov8s-worldv2")
                yres = run_model_predict(model, img_rgb, conf=0.10, verbose=False)[0]
            best_yolo_match = None
            max_area = 0.0
            for yb in yres.boxes:
                yxy = yb.xyxy[0].cpu().numpy()
                yx1, yy1, yx2, yy2 = float(yxy[0]), float(yxy[1]), float(yxy[2]), float(yxy[3])
                inter_x1 = max(bx1, yx1)
                inter_y1 = max(by1, yy1)
                inter_x2 = min(bx2, yx2)
                inter_y2 = min(by2, yy2)
                if inter_x2 > inter_x1 and inter_y2 > inter_y1:
                    inter_area = (inter_x2 - inter_x1) * (inter_y2 - inter_y1)
                    box_area = max(1.0, float((bx2 - bx1) * (by2 - by1)))
                    coverage = inter_area / box_area
                    y_area = (yx2 - yx1) * (yy2 - yy1)
                    if coverage > 0.40 and y_area > max_area:
                        max_area = y_area
                        best_yolo_match = (yx1, yy1, yx2, yy2)

            if best_yolo_match:
                yx1, yy1, yx2, yy2 = best_yolo_match
                new_w = float(yx2 - yx1) / w_img
                new_h = float(yy2 - yy1) / h_img
                new_xc = float(yx1 + yx2) / (2.0 * w_img)
                new_yc = float(yy1 + yy2) / (2.0 * h_img)
                refined_boxes.append({
                    "x_center": round(new_xc, 6),
                    "y_center": round(new_yc, 6),
                    "width": round(new_w, 6),
                    "height": round(new_h, 6),
                    "class_id": b.class_id
                })
                continue
        except Exception:
            pass

        pad_x = max(6, int((bx2 - bx1) * 0.08))
        pad_y = max(6, int((by2 - by1) * 0.08))

        crop_x1 = max(0, bx1 - pad_x)
        crop_y1 = max(0, by1 - pad_y)
        crop_x2 = min(w_img, bx2 + pad_x)
        crop_y2 = min(h_img, by2 + pad_y)

        crop = img_rgb[crop_y1:crop_y2, crop_x1:crop_x2]
        if crop.size == 0 or crop.shape[0] < 10 or crop.shape[1] < 10:
            refined_boxes.append(b.dict())
            continue

        try:
            gray = cv2.cvtColor(crop, cv2.COLOR_RGB2GRAY)
            blurred = cv2.GaussianBlur(gray, (5, 5), 0)
            _, thresh = cv2.threshold(blurred, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
            edges = cv2.Canny(blurred, 40, 140)
            combined = cv2.bitwise_or(thresh, edges)
            contours, _ = cv2.findContours(combined, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            if contours:
                best_c = None
                best_area = 0
                for c in contours:
                    area = cv2.contourArea(c)
                    if area > best_area and area > (crop.shape[0] * crop.shape[1] * 0.08):
                        best_area = area
                        best_c = c

                if best_c is not None:
                    rx, ry, rw, rh = cv2.boundingRect(best_c)
                    new_x1 = crop_x1 + rx
                    new_y1 = crop_y1 + ry
                    new_x2 = new_x1 + rw
                    new_y2 = new_y1 + rh
                    new_w = float(new_x2 - new_x1) / w_img
                    new_h = float(new_y2 - new_y1) / h_img
                    new_xc = float(new_x1 + new_x2) / (2.0 * w_img)
                    new_yc = float(new_y1 + new_y2) / (2.0 * h_img)

                    refined_boxes.append({
                        "x_center": round(new_xc, 6),
                        "y_center": round(new_yc, 6),
                        "width": round(new_w, 6),
                        "height": round(new_h, 6),
                        "class_id": b.class_id
                    })
                    continue
        except Exception:
            pass

        refined_boxes.append(b.dict())

    return {"status": "ok", "boxes": refined_boxes}


def _segment_by_click_cv(img_rgb: np.ndarray, px: int, py: int):
    try:
        h_img, w_img = img_rgb.shape[:2]
        px = max(0, min(w_img - 1, px))
        py = max(0, min(h_img - 1, py))

        rw = max(60, int(w_img * 0.42))
        rh = max(60, int(h_img * 0.42))
        rx1 = max(0, px - rw)
        ry1 = max(0, py - rh)
        rx2 = min(w_img, px + rw)
        ry2 = min(h_img, py + rh)

        roi = img_rgb[ry1:ry2, rx1:rx2]
        roi_h, roi_w = roi.shape[:2]
        if roi_h < 15 or roi_w < 15:
            return None

        lcx = px - rx1
        lcy = py - ry1

        corners = np.vstack([
            roi[0:3, :].reshape(-1, 3),
            roi[-3:, :].reshape(-1, 3),
            roi[:, 0:3].reshape(-1, 3),
            roi[:, -3:].reshape(-1, 3)
        ])
        bg_color = np.median(corners, axis=0)

        diff = np.linalg.norm(roi.astype(np.float32) - bg_color.astype(np.float32), axis=2)
        thresh = (diff > 24.0).astype(np.uint8) * 255

        k_open = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
        clean = cv2.morphologyEx(thresh, cv2.MORPH_OPEN, k_open, iterations=1)

        k_close = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))
        clean = cv2.morphologyEx(clean, cv2.MORPH_CLOSE, k_close, iterations=2)

        try:
            mask = np.zeros((roi_h, roi_w), np.uint8)
            mask[clean == 0] = cv2.GC_BGD
            mask[clean > 0] = cv2.GC_PR_FGD
            cv2.circle(mask, (lcx, lcy), max(4, int(min(roi_h, roi_w) * 0.05)), cv2.GC_FGD, -1)
            mask[0:2, :] = cv2.GC_BGD
            mask[roi_h-2:roi_h, :] = cv2.GC_BGD
            mask[:, 0:2] = cv2.GC_BGD
            mask[:, roi_w-2:roi_w] = cv2.GC_BGD

            bgdModel = np.zeros((1, 65), np.float64)
            fgdModel = np.zeros((1, 65), np.float64)
            cv2.grabCut(roi, mask, None, bgdModel, fgdModel, 2, cv2.GC_INIT_WITH_MASK)
            refined_mask = np.where((mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD), 255, 0).astype('uint8')
        except Exception:
            refined_mask = clean

        refined_mask = cv2.morphologyEx(refined_mask, cv2.MORPH_OPEN, k_open)
        refined_mask = cv2.morphologyEx(refined_mask, cv2.MORPH_CLOSE, k_close)

        contours, _ = cv2.findContours(refined_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)

        best_cnt = None
        for cnt in contours:
            if cv2.contourArea(cnt) < 1200:
                continue
            dist = cv2.pointPolygonTest(cnt, (lcx, lcy), False)
            if dist >= 0:
                best_cnt = cnt
                break

        if best_cnt is None and contours:
            valid_cnts = [c for c in contours if cv2.contourArea(c) >= 1200]
            if valid_cnts:
                best_cnt = max(valid_cnts, key=cv2.contourArea)

        if best_cnt is not None:
            arc = cv2.arcLength(best_cnt, True)
            epsilon = 0.0022 * arc
            approx = cv2.approxPolyDP(best_cnt, epsilon, True)

            if len(approx) < 18:
                approx = cv2.approxPolyDP(best_cnt, 0.0011 * arc, True)
            elif len(approx) > 48:
                approx = cv2.approxPolyDP(best_cnt, 0.0034 * arc, True)

            bx, by, bw, bh = cv2.boundingRect(best_cnt)
            gx1 = max(0, rx1 + bx)
            gy1 = max(0, ry1 + by)
            gx2 = min(w_img, rx1 + bx + bw)
            gy2 = min(h_img, ry1 + by + bh)

            poly_pts = []
            for p in approx:
                poly_pts.append({
                    "x": round(max(0.0, min(1.0, float(rx1 + p[0][0]) / w_img)), 5),
                    "y": round(max(0.0, min(1.0, float(ry1 + p[0][1]) / h_img)), 5)
                })

            return {
                "box": {
                    "x_center": round((gx1 + gx2) / (2.0 * w_img), 6),
                    "y_center": round((gy1 + gy2) / (2.0 * h_img), 6),
                    "width": round((gx2 - gx1) / float(w_img), 6),
                    "height": round((gy2 - gy1) / float(h_img), 6)
                },
                "polygon_points": poly_pts if len(poly_pts) >= 3 else None
            }
    except Exception as e:
        logger.warning(f"Click segmentation exception: {e}")
    return None


@router.post("/api/smart-segment")
def smart_segment_click(req: SmartSegmentRequest, authorization: Optional[str] = Header(None)):
    check_project_permission(req.category, authorization, require_edit=True)

    img_rgb = _load_image_with_r2_fallback(req.category, req.image_filename)
    if img_rgb is None:
        raise HTTPException(status_code=404, detail=f"Görsel bulunamadı (disk ve R2): {req.image_filename}")

    h_img, w_img = img_rgb.shape[:2]
    px = int(req.click_x * w_img)
    py = int(req.click_y * h_img)

    assigned_class_id = req.class_id if (req.class_id is not None) else 0

    config = load_project_config()
    cls_list = _resolve_cls_list(req.category, config)
    all_prompts, prompt_to_class = _build_prompt_map(cls_list)

    # Önce tıklanan pikseldeki nesnenin gerçek sınıfını YOLOWorld ile tespit et
    detected_class_id = assigned_class_id
    detected_class_name = None
    yolo_best_xyxy = None

    try:
        with _MODEL_LOCK:
            model, _ = get_ai_model("yolov8s-worldv2")
            if all_prompts:
                set_classes_if_changed(model, all_prompts)

            res = run_model_predict(model, img_rgb, conf=0.05, imgsz=640, verbose=False)[0]
        if res.boxes and len(res.boxes) > 0:
            matching = []
            for box in res.boxes:
                xyxy = box.xyxy[0].cpu().numpy()
                bx1, by1, bx2, by2 = float(xyxy[0]), float(xyxy[1]), float(xyxy[2]), float(xyxy[3])
                cls_idx = int(box.cls[0].cpu().numpy()) if box.cls is not None else 0
                b_conf = float(box.conf[0].cpu().numpy()) if box.conf is not None else 0.0
                c_id = assigned_class_id
                c_name = None
                if cls_idx < len(all_prompts):
                    p_name = all_prompts[cls_idx]
                    matched_tuple = prompt_to_class.get(p_name) or prompt_to_class.get(p_name.lower().strip())
                    if matched_tuple:
                        c_id, c_name = matched_tuple

                pad_x = max(15.0, (bx2 - bx1) * 0.12)
                pad_y = max(15.0, (by2 - by1) * 0.12)
                if (bx1 - pad_x) <= px <= (bx2 + pad_x) and (by1 - pad_y) <= py <= (by2 + pad_y):
                    area = (bx2 - bx1) * (by2 - by1)
                    bcx = (bx1 + bx2) / 2.0
                    bcy = (by1 + by2) / 2.0
                    dist = ((bcx - px) ** 2 + (bcy - py) ** 2) ** 0.5
                    matching.append((area, dist, -b_conf, (bx1, by1, bx2, by2), c_id, c_name))

            if matching:
                # En yüksek güven ve en yakın kutuyu seç
                matching.sort(key=lambda m: (m[2], m[0]))
                _, _, _, best_xyxy, detected_class_id, detected_class_name = matching[0]
                yolo_best_xyxy = best_xyxy
    except Exception as e:
        logger.warning(f"Smart segment YOLOWorld siniflandirma hatasi: {e}")

    # 1. Eğer YOLOWorld tıklanan noktada gerçek bir nesne bulduysa, tüm nesneyi kapsayan kutuyu kullan
    if yolo_best_xyxy is not None:
        obj_x1, obj_y1, obj_x2, obj_y2 = yolo_best_xyxy
        new_w = float(obj_x2 - obj_x1) / w_img
        new_h = float(obj_y2 - obj_y1) / h_img
        new_xc = float(obj_x1 + obj_x2) / (2.0 * w_img)
        new_yc = float(obj_y1 + obj_y2) / (2.0 * h_img)

        resp = {
            "status": "ok",
            "box": {
                "x_center": round(new_xc, 6),
                "y_center": round(new_yc, 6),
                "width": round(new_w, 6),
                "height": round(new_h, 6),
                "class_id": detected_class_id,
                "class_name": detected_class_name
            }
        }

        # Poligon modu için nesne sınırları içerisinde kontur noktalarını hesapla
        try:
            cx1 = max(0, int(obj_x1))
            cy1 = max(0, int(obj_y1))
            cx2 = min(w_img, int(obj_x2))
            cy2 = min(h_img, int(obj_y2))
            crop = img_rgb[cy1:cy2, cx1:cx2]
            if crop.shape[0] >= 10 and crop.shape[1] >= 10:
                gray = cv2.cvtColor(crop, cv2.COLOR_RGB2GRAY)
                blurred = cv2.GaussianBlur(gray, (5, 5), 0)
                _, thresh = cv2.threshold(blurred, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
                edges = cv2.Canny(blurred, 30, 120)
                comb = cv2.bitwise_or(thresh, edges)
                contours, _ = cv2.findContours(comb, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
                if contours:
                    best_c = max(contours, key=cv2.contourArea)
                    arc = cv2.arcLength(best_c, True)
                    approx = cv2.approxPolyDP(best_c, 0.012 * arc, True)
                    if len(approx) >= 3:
                        poly_pts = []
                        for p in approx:
                            pt_x = float(cx1 + p[0][0]) / w_img
                            pt_y = float(cy1 + p[0][1]) / h_img
                            poly_pts.append({
                                "x": round(max(0.0, min(1.0, pt_x)), 5),
                                "y": round(max(0.0, min(1.0, pt_y)), 5)
                            })
                        if len(poly_pts) >= 3:
                            resp["polygon_points"] = poly_pts
        except Exception as poly_err:
            pass

        return resp

    # 2. YOLOWorld belirgin nesne bulamazsa kontur segmentasyonuna geri düş
    cv_seg = _segment_by_click_cv(img_rgb, px, py)
    if cv_seg and cv_seg.get("box"):
        b = cv_seg["box"]
        b["class_id"] = detected_class_id
        if detected_class_name:
            b["class_name"] = detected_class_name
        resp = {
            "status": "ok",
            "box": b
        }
        if cv_seg.get("polygon_points"):
            resp["polygon_points"] = cv_seg["polygon_points"]
        return resp

    dw = 0.16
    dh = 0.16
    return {
        "status": "ok",
        "box": {
            "x_center": round(req.click_x, 6),
            "y_center": round(req.click_y, 6),
            "width": dw,
            "height": dh,
            "class_id": assigned_class_id
        }
    }
