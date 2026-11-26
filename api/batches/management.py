"""
api/batches/management.py
Batch CRUD ve aşama yönetimi endpoints:
- /api/projects/batches (GET)
- /api/projects/rename-batch (POST)
- /api/projects/update-batch-tags (POST)
- /api/projects/delete-batch (POST)
- /api/projects/move-batch-stage (POST)
- /api/team/assign-batch (POST)
"""

import os
import json
import time
import uuid
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException, Query, Header

from core.config import ROOT_DIR
from core.database import (
    cf_d1_save_batches,
    cf_d1_load_batches,
    cf_r2_upload,
    cf_r2_get_object,
    cf_r2_delete_object,
    cf_r2_list_objects,
)
from core.security import check_project_permission
from api.shared.models import TeamAssignBatchRequest
from api.shared.utils import get_project_storage_info

router = APIRouter(tags=["Batches Management"])


@router.get("/api/projects/batches")
def get_project_batches(category: str = Query(...), token: Optional[str] = Query(None), authorization: Optional[str] = Header(None)):
    user = check_project_permission(category, authorization, require_edit=False, query_token=token)
    user_email = (user.get("email") or "").strip().lower()
    user_username = (user.get("username") or user.get("display_name") or (user_email.split("@")[0] if user_email else "")).strip().lower()

    # Kullanıcının takımlardaki tüm olası takma adlarını (username, display_name, email) topla
    user_aliases = {user_email, user_username}
    if "@" in user_email:
        user_aliases.add(user_email.split("@")[0].lower())
    try:
        from api.teams import _load_teams
        t_data = _load_teams()
        for tm in t_data.get("teams", []):
            for mm in tm.get("members", []):
                m_em = (mm.get("email") or "").strip().lower()
                m_un = (mm.get("username") or "").strip().lower()
                m_dn = (mm.get("display_name") or "").strip().lower()
                if (m_em and m_em == user_email) or (m_un and m_un in user_aliases):
                    if m_em: user_aliases.add(m_em)
                    if m_un: user_aliases.add(m_un)
                    if m_dn: user_aliases.add(m_dn)
    except Exception:
        pass

    project_role = (user.get("project_role") or user.get("role") or "").strip().lower()
    is_admin = project_role in ("admin", "owner", "captain")
    is_restricted_member = project_role in ("member", "annotator") and not is_admin
    cat_dir = ROOT_DIR / category
    labeled_dir = ROOT_DIR / f"{category}_labeled"
    if not cat_dir.exists():
        if category == "bag" and (ROOT_DIR / "bag_detection_project").exists():
            category = "bag_detection_project"
            cat_dir = ROOT_DIR / "bag_detection_project"
            labeled_dir = ROOT_DIR / "bag_detection_project_labeled"
        elif category == "bag_detection_project" and (ROOT_DIR / "bag").exists():
            category = "bag"
            cat_dir = ROOT_DIR / "bag"
            labeled_dir = ROOT_DIR / "bag_labeled"

    labels_dir = labeled_dir / "labels"
    batches_file = labeled_dir / "batches.json"

    valid_extensions = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}
    images_set = set()
    if cat_dir.exists() and cat_dir.is_dir():
        for f in cat_dir.iterdir():
            if f.is_file() and f.suffix.lower() in valid_extensions:
                images_set.add(f.name)

    try:
        storage_for_list = get_project_storage_info(category)
        r2_objs = cf_r2_list_objects(prefix=storage_for_list["r2_images_prefix"] + "/", limit=2500)
        if not r2_objs:
            r2_objs = cf_r2_list_objects(prefix=category, limit=2500)
        for obj in r2_objs:
            k = obj.get("key", "")
            fn = os.path.basename(k)
            if os.path.splitext(fn)[1].lower() in valid_extensions and "/labels/" not in k:
                images_set.add(fn)
    except Exception as e:
        print(f"[R2 Batches Check Warning]: {e}")

    images = sorted(list(images_set))

    d1_batches = []
    try:
        loaded = cf_d1_load_batches(category)
        if loaded and isinstance(loaded, list):
            d1_batches = loaded
    except Exception as d1_err:
        print(f"[D1 Batches Load Warning]: {d1_err}")

    local_batches = []
    if batches_file.exists():
        try:
            with open(batches_file, "r", encoding="utf-8") as f:
                local_batches = json.load(f)
        except Exception:
            local_batches = []

    # Akıllı seçim: Yerel disk veya D1 arasından daha fazla geçerli resim içeren güncel kaynağı tercih et
    d1_count = sum(len(b.get("images", [])) for b in d1_batches if isinstance(b, dict))
    local_count = sum(len(b.get("images", [])) for b in local_batches if isinstance(b, dict))

    if local_count >= d1_count and local_batches:
        batches = local_batches
    elif d1_batches:
        batches = d1_batches
    elif local_batches:
        batches = local_batches
    else:
        batches = []

    if not batches:
        try:
            storage = get_project_storage_info(category)
            r2_b_bytes = cf_r2_get_object(f"{storage['r2_project_prefix']}/batches.json")
            if r2_b_bytes:
                batches = json.loads(r2_b_bytes.decode('utf-8'))
        except Exception as e:
            print(f"[R2 Batches Fetch Warning]: {e}")

    if not batches and images:
        dt_str = datetime.now().strftime("%d.%m.%Y at %H:%M")
        default_batch = {
            "id": "batch_default",
            "name": f"Uploaded on {dt_str}",
            "created_at": dt_str,
            "images": images,
            "tags": "",
            "status": "unassigned",
            "approved_filenames": [],
            "returned_filenames": []
        }
        batches = [default_batch]
        try:
            labeled_dir.mkdir(parents=True, exist_ok=True)
            with open(batches_file, "w", encoding="utf-8") as f:
                json.dump(batches, f, ensure_ascii=False, indent=2)
            storage = get_project_storage_info(category)
            cf_r2_upload(batches_file.read_bytes(), f"{storage['r2_project_prefix']}/batches.json", "application/json")
            cf_d1_save_batches(category, batches)
        except Exception:
            pass

    # Disk üzerindeki hiçbir görselin açıkta kalmaması için batch'lerde olmayanları otomatik topla
    all_batched_set = set()
    for b in batches:
        if isinstance(b, dict):
            for fn in b.get("images", []):
                all_batched_set.add(fn)

    unbatched_images = [fn for fn in images if fn not in all_batched_set]
    batches_updated = False
    if unbatched_images:
        dt_str = datetime.now().strftime("%d.%m.%Y at %H:%M")
        batches.append({
            "id": f"batch_unassigned_{int(time.time())}",
            "name": f"Atanmamış Görseller ({len(unbatched_images)} Resim)",
            "created_at": dt_str,
            "images": unbatched_images,
            "tags": "Otomatik Toplanan",
            "status": "unassigned",
            "approved_filenames": [],
            "returned_filenames": []
        })
        batches_updated = True

    processed_batches = []
    disk_images_set = set(images)

    # Projenin public olup olmadığını kontrol et
    is_public_proj = False
    try:
        from core.database import cf_d1_query
        p_rows = cf_d1_query("SELECT visibility FROM projects WHERE id = ? LIMIT 1", [category])
        if p_rows and p_rows[0].get("visibility") == "public":
            is_public_proj = True
    except Exception:
        pass
    if not is_public_proj:
        try:
            from core.config import CONFIG_FILE
            if CONFIG_FILE.exists():
                with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                    cfg = json.load(f)
                if cfg.get("projects", {}).get(category, {}).get("visibility") == "public":
                    is_public_proj = True
        except Exception:
            pass

    def _is_batch_visible_for_user(b: dict) -> bool:
        if not is_restricted_member or is_public_proj:
            return True
        assigned = (b.get("assigned_to") or "").strip().lower()
        if not assigned:
            # Atanmamış yığınlar tüm proje üyelerine açıktır, böylece etiketlemeye başlayabilirler
            return True
        assigned_list = [a.strip().lower() for a in assigned.split(",")]
        return user_email in assigned_list or user_username in assigned_list

    for b in batches:
        if not _is_batch_visible_for_user(b):
            continue
        b_imgs = b.get("images", [])
        if not b_imgs and len(batches) == 1 and not is_restricted_member:
            b_imgs = images

        valid_b_imgs = [img for img in b_imgs if img in disk_images_set]
        if len(batches) == 1 and len(valid_b_imgs) < len(images) and not is_restricted_member:
            valid_b_imgs = list(images)

        if len(valid_b_imgs) != len(b_imgs):
            b["images"] = valid_b_imgs
            batches_updated = True
            b_imgs = valid_b_imgs

        annotated_files = []
        unassigned_files = []

        for img_name in b_imgs:
            stem = Path(img_name).stem
            txt_file = labels_dir / f"{stem}.txt"
            if txt_file.exists() and txt_file.stat().st_size > 0:
                annotated_files.append(img_name)
            else:
                unassigned_files.append(img_name)

        approved_files = [f for f in b.get("approved_filenames", []) if f in disk_images_set]
        approved_cnt = len(approved_files)

        returned_files = [f for f in b.get("returned_filenames", []) if f in disk_images_set and f not in set(approved_files)]
        active_files = [f for f in b_imgs if f not in set(approved_files) and f not in set(returned_files)]

        b_status = b.get("status", "unassigned")

        if approved_cnt > 0:
            processed_batches.append({
                "id": f"{b.get('id')}_completed",
                "original_id": b.get("id"),
                "name": b.get("name", "Default Batch"),
                "created_at": b.get("created_at", ""),
                "tags": b.get("tags", ""),
                "total_count": approved_cnt,
                "annotated_count": approved_cnt,
                "unassigned_count": 0,
                "approved_count": approved_cnt,
                "unassigned_filenames": [],
                "annotated_filenames": approved_files,
                "approved_filenames": approved_files,
                "filenames": approved_files,
                "status": "completed"
            })

        if b_status == "unassigned":
            unassigned_pool = active_files + returned_files
            if len(unassigned_pool) > 0:
                processed_batches.append({
                    "id": b.get("id"),
                    "name": b.get("name", "Default Batch"),
                    "created_at": b.get("created_at", ""),
                    "tags": b.get("tags", ""),
                    "total_count": len(unassigned_pool),
                    "annotated_count": 0,
                    "unassigned_count": len(unassigned_pool),
                    "approved_count": 0,
                    "unassigned_filenames": unassigned_pool,
                    "annotated_filenames": [],
                    "approved_filenames": [],
                    "filenames": unassigned_pool,
                    "status": "unassigned"
                })
        else:
            if len(returned_files) > 0:
                processed_batches.append({
                    "id": f"{b.get('id')}_unassigned",
                    "original_id": b.get("id"),
                    "name": b.get("name", "Default Batch"),
                    "created_at": b.get("created_at", ""),
                    "tags": b.get("tags", ""),
                    "total_count": len(returned_files),
                    "annotated_count": 0,
                    "unassigned_count": len(returned_files),
                    "approved_count": 0,
                    "unassigned_filenames": returned_files,
                    "annotated_filenames": [],
                    "approved_filenames": [],
                    "filenames": returned_files,
                    "status": "unassigned"
                })

        if b_status == "annotating" and len(active_files) > 0:
            act_annotated = [f for f in active_files if f in set(annotated_files)]
            act_unassigned = [f for f in active_files if f not in set(annotated_files)]
            processed_batches.append({
                "id": b.get("id"),
                "name": b.get("name", "Default Batch"),
                "created_at": b.get("created_at", ""),
                "tags": b.get("tags", ""),
                "total_count": len(active_files),
                "annotated_count": len(act_annotated),
                "unassigned_count": len(act_unassigned),
                "approved_count": 0,
                "unassigned_filenames": act_unassigned,
                "annotated_filenames": act_annotated,
                "approved_filenames": [],
                "filenames": active_files,
                "status": "annotating"
            })

    # Cloudflare D1 Team Tasks Entegrasyonu:
    # Takım kaptanının veya yöneticinin personele atadığı aktif görevleri (assigned, submitted)
    # Kanban panosunun 'Annotating (Etiketleniyor)' sütununda şık bir takım görevi kartı olarak sun
    try:
        from api.teams import _load_team_tasks
        team_tasks = _load_team_tasks()
        existing_batch_ids = {b.get("id") for b in processed_batches}

        # Projedeki tüm onaylanmış görseller kümesi
        all_approved_filenames = set()
        for b in batches:
            for af in b.get("approved_filenames", []):
                all_approved_filenames.add(af)

        for t in (team_tasks or []):
            if t.get("category") != category:
                continue
            if t.get("status") not in ("assigned", "submitted"):
                continue

            t_assigned = (t.get("assigned_to") or "").strip().lower()
            # Yetki kontrolü:
            # - Normal üye (restricted) ise: Yalnızca kendisine atanan görevleri görebilir.
            # - Kaptan / Yönetici / Genel erişim ise: Görevleri görebilir.
            if is_restricted_member and user_email and user_email != "public_annotator":
                if t_assigned not in user_aliases and not any(alias in t_assigned for alias in user_aliases):
                    continue

            task_imgs = t.get("images") or []
            if not task_imgs:
                continue

            # Disk veya R2 üzerindeki varlığını filtrele
            valid_t_imgs = [img for img in task_imgs if img in disk_images_set] if disk_images_set else task_imgs
            if not valid_t_imgs:
                valid_t_imgs = task_imgs

            t_id = t.get("id")
            # Eğer bu görev daha önce batch olarak eklenmemişse ekle
            if t_id in existing_batch_ids or f"batch_{t_id}" in existing_batch_ids:
                continue

            # Onay kontrolü: Eğer görevdeki tüm görseller onaylanmışsa, görevi D1'de 'approved' yap ve listeden düşür
            t_approved = [img for img in valid_t_imgs if img in all_approved_filenames]
            if len(valid_t_imgs) > 0 and len(t_approved) >= len(valid_t_imgs):
                try:
                    from core.database import cf_d1_query
                    cf_d1_query("UPDATE team_tasks SET status = 'approved', reviewed_at = ? WHERE id = ?", [datetime.now().strftime("%Y-%m-%d %H:%M:%S"), t_id])
                except Exception as up_err:
                    print(f"[Batches] team task auto-approve error: {up_err}")
                continue

            t_annotated = []
            t_unassigned = []
            for img_name in valid_t_imgs:
                stem = Path(img_name).stem
                txt_file = labels_dir / f"{stem}.txt"
                if txt_file.exists() and txt_file.stat().st_size > 0:
                    t_annotated.append(img_name)
                else:
                    t_unassigned.append(img_name)

            is_mine = (t_assigned in user_aliases or any(alias in t_assigned for alias in user_aliases))
            task_title = t.get("title") or f"Takım Görevi: {len(valid_t_imgs)} Görsel"
            if not t.get("title") and t_assigned:
                task_title = f"Görev: @{t_assigned} ({len(valid_t_imgs)} Görsel)"

            # Eğer henüz hiç etiketlenmemişse 1. Sütunda (Unassigned / Yüklenen Ham Resimler),
            # etiketleme başladıysa 2. Sütunda (Annotating) listele
            batch_stage = "annotating" if len(t_annotated) > 0 else "unassigned"

            processed_batches.append({
                "id": t_id,
                "name": task_title,
                "created_at": t.get("created_at", ""),
                "tags": f"Takım Görevi (@{t_assigned})",
                "total_count": len(valid_t_imgs),
                "annotated_count": len(t_annotated),
                "unassigned_count": len(t_unassigned),
                "approved_count": 0,
                "unassigned_filenames": t_unassigned,
                "annotated_filenames": t_annotated,
                "approved_filenames": [],
                "filenames": valid_t_imgs,
                "images": valid_t_imgs,
                "status": batch_stage,
                "is_team_task": True,
                "assigned_to": t_assigned,
                "is_mine": is_mine,
                "task_status": t.get("status", "assigned"),
                "admin_feedback": t.get("admin_feedback")
            })
    except Exception as e:
        print(f"[Batches] team_tasks D1 merge hatası: {e}")

    if batches_updated:
        try:
            batches_file.parent.mkdir(parents=True, exist_ok=True)
            with open(batches_file, "w", encoding="utf-8") as f:
                json.dump(batches, f, ensure_ascii=False, indent=2)
            cf_d1_save_batches(category, batches)
            storage = get_project_storage_info(category)
            cf_r2_upload(batches_file.read_bytes(), f"{storage['r2_project_prefix']}/batches.json", "application/json")
        except Exception:
            pass

    return {"category": category, "batches": processed_batches}


@router.post("/api/projects/rename-batch")
def rename_batch(data: dict, authorization: Optional[str] = Header(None)):
    cat = data.get("category")
    batch_id = data.get("batch_id")
    new_name = data.get("new_name")
    if not cat or not batch_id or not new_name:
        raise HTTPException(status_code=400, detail="Eksik parametre")
    check_project_permission(cat, authorization, require_edit=True, require_owner=True)

    orig_batch_id = str(batch_id).replace("_completed", "").replace("_unassigned", "")

    batches_file = ROOT_DIR / f"{cat}_labeled" / "batches.json"
    batches = []
    if batches_file.exists():
        try:
            with open(batches_file, "r", encoding="utf-8") as f:
                batches = json.load(f)
        except Exception:
            batches = []

    if not batches:
        try:
            batches = cf_d1_load_batches(cat) or []
        except Exception:
            batches = []

    if not batches:
        try:
            storage = get_project_storage_info(cat)
            r2_b = cf_r2_get_object(f"{storage['r2_project_prefix']}/batches.json")
            if r2_b:
                batches = json.loads(r2_b.decode("utf-8"))
        except Exception:
            batches = []

    if batches:
        try:
            for b in batches:
                if b.get("id") in (batch_id, orig_batch_id):
                    b["name"] = new_name
            batches_file.parent.mkdir(parents=True, exist_ok=True)
            with open(batches_file, "w", encoding="utf-8") as f:
                json.dump(batches, f, ensure_ascii=False, indent=2)

            cf_d1_save_batches(cat, batches)
            storage = get_project_storage_info(cat)
            cf_r2_upload(batches_file.read_bytes(), f"{storage['r2_project_prefix']}/batches.json", "application/json")
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))
    return {"status": "ok"}


@router.post("/api/projects/update-batch-tags")
def update_batch_tags(data: dict, authorization: Optional[str] = Header(None)):
    cat = data.get("category")
    batch_id = data.get("batch_id")
    tags = data.get("tags", "")
    if not cat or not batch_id:
        raise HTTPException(status_code=400, detail="Eksik parametre")
    check_project_permission(cat, authorization, require_edit=True, require_owner=True)

    orig_batch_id = str(batch_id).replace("_completed", "").replace("_unassigned", "")

    batches_file = ROOT_DIR / f"{cat}_labeled" / "batches.json"
    batches = []
    if batches_file.exists():
        try:
            with open(batches_file, "r", encoding="utf-8") as f:
                batches = json.load(f)
        except Exception:
            batches = []

    if not batches:
        try:
            batches = cf_d1_load_batches(cat) or []
        except Exception:
            batches = []

    if not batches:
        try:
            storage = get_project_storage_info(cat)
            r2_b = cf_r2_get_object(f"{storage['r2_project_prefix']}/batches.json")
            if r2_b:
                batches = json.loads(r2_b.decode("utf-8"))
        except Exception:
            batches = []

    if batches:
        try:
            for b in batches:
                if b.get("id") in (batch_id, orig_batch_id):
                    b["tags"] = tags
            batches_file.parent.mkdir(parents=True, exist_ok=True)
            with open(batches_file, "w", encoding="utf-8") as f:
                json.dump(batches, f, ensure_ascii=False, indent=2)

            cf_d1_save_batches(cat, batches)
            storage = get_project_storage_info(cat)
            cf_r2_upload(batches_file.read_bytes(), f"{storage['r2_project_prefix']}/batches.json", "application/json")
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))
    return {"status": "ok"}


@router.post("/api/projects/delete-batch")
def delete_batch(data: dict, authorization: Optional[str] = Header(None)):
    cat = (data.get("category") or "").strip()
    batch_id = (data.get("batch_id") or "").strip()
    delete_images = bool(data.get("delete_images", True))

    if not cat or not batch_id:
        raise HTTPException(status_code=400, detail="Kategori veya Yığın Kimliği eksik.")
    check_project_permission(cat, authorization, require_edit=True, require_owner=True)

    orig_batch_id = str(batch_id).replace("_completed", "").replace("_unassigned", "")
    is_completed_sub = str(batch_id).endswith("_completed")
    is_unassigned_sub = str(batch_id).endswith("_unassigned")

    cat_dir = ROOT_DIR / cat
    labeled_dir = ROOT_DIR / f"{cat}_labeled"
    labels_dir = labeled_dir / "labels"
    previews_dir = labeled_dir / "previews"
    batches_file = labeled_dir / "batches.json"

    deleted_images_count = 0

    batches = []
    if batches_file.exists():
        try:
            with open(batches_file, "r", encoding="utf-8") as f:
                batches = json.load(f)
        except Exception:
            batches = []

    if not batches:
        try:
            batches = cf_d1_load_batches(cat) or []
        except Exception:
            batches = []

    if not batches:
        try:
            storage = get_project_storage_info(cat)
            r2_b = cf_r2_get_object(f"{storage['r2_project_prefix']}/batches.json")
            if r2_b:
                batches = json.loads(r2_b.decode("utf-8"))
        except Exception:
            batches = []

    if batches:
        try:
            storage = get_project_storage_info(cat)
            target_batch = next((b for b in batches if str(b.get("id")) in (str(batch_id), orig_batch_id)), None)
            if not target_batch and str(batch_id).startswith("batch_unassigned"):
                target_batch = next((b for b in batches if str(b.get("id", "")).startswith("batch_unassigned") or b.get("status") == "unassigned"), None)

            if target_batch:
                all_imgs = target_batch.get("images", [])
                approved_imgs = set(target_batch.get("approved_filenames", []))
                returned_imgs = set(target_batch.get("returned_filenames", []))

                if is_completed_sub:
                    imgs_to_delete = [img for img in all_imgs if img in approved_imgs]
                elif is_unassigned_sub:
                    imgs_to_delete = [img for img in all_imgs if img in returned_imgs]
                else:
                    imgs_to_delete = list(all_imgs)

                if delete_images and imgs_to_delete:
                    r2_keys_to_delete = []
                    for img_name in imgs_to_delete:
                        img_path = cat_dir / img_name
                        if img_path.exists() and img_path.is_file():
                            try:
                                img_path.unlink()
                                deleted_images_count += 1
                            except Exception:
                                pass
                        elif not img_path.exists():
                            deleted_images_count += 1

                        txt_name = f"{Path(img_name).stem}.txt"
                        lbl_path = labels_dir / txt_name
                        if lbl_path.exists() and lbl_path.is_file():
                            try:
                                lbl_path.unlink()
                            except Exception:
                                pass

                        for p_ext in [".jpg", ".png", ".webp"]:
                            prev_path = previews_dir / f"{Path(img_name).stem}{p_ext}"
                            if prev_path.exists() and prev_path.is_file():
                                try:
                                    prev_path.unlink()
                                except Exception:
                                    pass

                        r2_keys_to_delete.append(f"{storage['r2_images_prefix']}/{img_name}")
                        r2_keys_to_delete.append(f"{cat}/{img_name}")
                        r2_keys_to_delete.append(f"{storage['r2_labels_prefix']}/{txt_name}")
                        r2_keys_to_delete.append(f"{cat}_labeled/labels/{txt_name}")

                    try:
                        from core.database import cf_r2_delete_keys
                        cf_r2_delete_keys(r2_keys_to_delete)
                    except Exception as r2_del_err:
                        print(f"[R2 Batch Delete Warning]: {r2_del_err}")

                delete_set = set(imgs_to_delete)
                new_all_imgs = [img for img in all_imgs if img not in delete_set]

                if not new_all_imgs or (not is_completed_sub and not is_unassigned_sub):
                    batches = [b for b in batches if str(b.get("id")) not in (str(batch_id), orig_batch_id)]
                else:
                    target_batch["images"] = new_all_imgs
                    target_batch["approved_filenames"] = [img for img in target_batch.get("approved_filenames", []) if img not in delete_set]
                    target_batch["returned_filenames"] = [img for img in target_batch.get("returned_filenames", []) if img not in delete_set]
                    target_batch["total_count"] = len(new_all_imgs)
                    target_batch["approved_count"] = len(target_batch["approved_filenames"])

            labeled_dir.mkdir(parents=True, exist_ok=True)
            with open(batches_file, "w", encoding="utf-8") as f:
                json.dump(batches, f, ensure_ascii=False, indent=2)

            cf_d1_save_batches(cat, batches)
            try:
                cf_r2_upload(batches_file.read_bytes(), f"{storage['r2_project_prefix']}/batches.json", "application/json")
            except Exception:
                pass
            try:
                from api.projects.images import invalidate_images_cache
                invalidate_images_cache(cat)
            except Exception:
                pass

            return {
                "status": "ok",
                "deleted_batch_id": batch_id,
                "deleted_images_count": deleted_images_count,
                "message": f"Yığın ve {deleted_images_count} görsel başarıyla silindi (R2 ve D1 senkronize edildi)."
            }
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Yığın silinemedi: {e}")

    return {"status": "ok", "deleted_images_count": 0}


@router.post("/api/projects/move-batch-stage")
def move_batch_stage(data: dict, authorization: Optional[str] = Header(None)):
    cat = data.get("category")
    batch_id = data.get("batch_id")
    target_stage = data.get("target_stage")

    if not cat or not batch_id or not target_stage:
        raise HTTPException(status_code=400, detail="Eksik parametre")
    user_perm = check_project_permission(cat, authorization, require_edit=True, require_owner=False)
    user_role = (user_perm.get("project_role") or user_perm.get("role") or "annotator").lower()
    if target_stage == "completed" and user_role not in ("owner", "captain", "admin", "reviewer", "lead"):
        raise HTTPException(status_code=403, detail="Yığını onaylayıp Veri Setine ekleme yetkisi yalnızca İnceleyici ve Takım Yöneticilerine aittir.")

    orig_batch_id = str(batch_id).replace("_completed", "").replace("_unassigned", "")

    batches_file = ROOT_DIR / f"{cat}_labeled" / "batches.json"
    batches = []
    if batches_file.exists():
        try:
            with open(batches_file, "r", encoding="utf-8") as f:
                batches = json.load(f)
        except Exception:
            batches = []

    if not batches:
        try:
            batches = cf_d1_load_batches(cat) or []
        except Exception:
            batches = []

    if not batches:
        try:
            storage = get_project_storage_info(cat)
            r2_b = cf_r2_get_object(f"{storage['r2_project_prefix']}/batches.json")
            if r2_b:
                batches = json.loads(r2_b.decode("utf-8"))
        except Exception:
            batches = []

    if not batches:
        raise HTTPException(status_code=404, detail="Yığın bulunamadı")

    try:
        found = False
        new_batches = []
        for b in batches:
            b_id = str(b.get("id"))
            b_imgs = list(b.get("images", []))
            total = len(b_imgs)

            if b_id == str(batch_id) or (not found and str(batch_id).startswith("batch_unassigned") and b_id.startswith("batch_unassigned")):
                found = True
                if target_stage == "unassigned":
                    b["status"] = "unassigned"
                    b["approved_count"] = 0
                    b["approved_filenames"] = []
                    b["returned_filenames"] = []
                    b["unassigned_count"] = total
                    b["annotated_count"] = 0
                    if "completed_at" in b:
                        del b["completed_at"]
                elif target_stage == "annotating":
                    b["status"] = "annotating"
                    b["approved_filenames"] = []
                    b["approved_count"] = 0
                    b["returned_filenames"] = []
                    b["unassigned_count"] = 0
                    b["annotated_count"] = total
                    if "completed_at" in b:
                        del b["completed_at"]
                elif target_stage == "completed":
                    b["status"] = "completed"
                    b["approved_filenames"] = list(b_imgs)
                    b["approved_count"] = total
                    b["returned_filenames"] = []
                    b["unassigned_count"] = 0
                    b["annotated_count"] = total
                    b["completed_at"] = datetime.now().strftime("%d.%m.%Y at %H:%M")
                new_batches.append(b)

            elif b_id == orig_batch_id and str(batch_id).endswith("_completed"):
                found = True
                approved_set = set(b.get("approved_filenames", []))
                completed_imgs = [img for img in b_imgs if img in approved_set]
                remaining_imgs = [img for img in b_imgs if img not in approved_set]

                dt_str = datetime.now().strftime("%d.%m.%Y at %H:%M")
                detached_batch = {
                    "id": f"batch_{uuid.uuid4().hex[:12]}",
                    "name": f"{b.get('name', 'Batch')} (Dataset)",
                    "created_at": b.get("created_at", dt_str),
                    "images": completed_imgs,
                    "tags": b.get("tags", ""),
                    "status": target_stage,
                    "approved_filenames": completed_imgs if target_stage == "completed" else [],
                    "approved_count": len(completed_imgs) if target_stage == "completed" else 0,
                    "returned_filenames": [],
                    "unassigned_count": len(completed_imgs) if target_stage == "unassigned" else 0,
                    "annotated_count": len(completed_imgs) if target_stage in ("annotating", "completed") else 0,
                    "total_count": len(completed_imgs)
                }
                new_batches.append(detached_batch)

                if remaining_imgs:
                    b["images"] = remaining_imgs
                    b["approved_filenames"] = []
                    b["approved_count"] = 0
                    b["total_count"] = len(remaining_imgs)
                    if set(remaining_imgs).issubset(set(b.get("returned_filenames", []))):
                        b["status"] = "unassigned"
                        b["unassigned_count"] = len(remaining_imgs)
                        b["returned_filenames"] = list(remaining_imgs)
                    new_batches.append(b)

            elif b_id == orig_batch_id and str(batch_id).endswith("_unassigned"):
                found = True
                returned_set = set(b.get("returned_filenames", []))
                unassigned_imgs = [img for img in b_imgs if img in returned_set]
                remaining_imgs = [img for img in b_imgs if img not in returned_set]

                dt_str = datetime.now().strftime("%d.%m.%Y at %H:%M")
                detached_batch = {
                    "id": f"batch_{uuid.uuid4().hex[:12]}",
                    "name": f"{b.get('name', 'Batch')} (Havuz)",
                    "created_at": b.get("created_at", dt_str),
                    "images": unassigned_imgs,
                    "tags": b.get("tags", ""),
                    "status": target_stage,
                    "approved_filenames": unassigned_imgs if target_stage == "completed" else [],
                    "approved_count": len(unassigned_imgs) if target_stage == "completed" else 0,
                    "returned_filenames": [],
                    "unassigned_count": len(unassigned_imgs) if target_stage == "unassigned" else 0,
                    "annotated_count": len(unassigned_imgs) if target_stage in ("annotating", "completed") else 0,
                    "total_count": len(unassigned_imgs)
                }
                new_batches.append(detached_batch)

                if remaining_imgs:
                    b["images"] = remaining_imgs
                    b["returned_filenames"] = []
                    b["total_count"] = len(remaining_imgs)
                    new_batches.append(b)
            else:
                new_batches.append(b)

        if not found:
            raise HTTPException(status_code=404, detail="Yığın ID bulunamadı")

        batches = new_batches

        batches_file.parent.mkdir(parents=True, exist_ok=True)
        with open(batches_file, "w", encoding="utf-8") as f:
            json.dump(batches, f, ensure_ascii=False, indent=2)

        cf_d1_save_batches(cat, batches)

        try:
            storage = get_project_storage_info(cat)
            cf_r2_upload(batches_file.read_bytes(), f"{storage['r2_project_prefix']}/batches.json", "application/json")
        except Exception as r2_err:
            print(f"[R2 Sync Warning]: {r2_err}")
        try:
            from api.projects.images import invalidate_images_cache
            invalidate_images_cache(cat)
        except Exception:
            pass

        return {"status": "ok", "target_stage": target_stage, "message": f"Yığın '{target_stage}' aşamasına başarıyla taşındı."}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/team/assign-batch")
def assign_batch_to_user(req: TeamAssignBatchRequest, authorization: Optional[str] = Header(None)):
    check_project_permission(req.category, authorization, require_edit=True, require_owner=True)
    labeled_dir = ROOT_DIR / f"{req.category}_labeled"
    batches_file = labeled_dir / "batches.json"
    if not batches_file.exists():
        raise HTTPException(status_code=404, detail="Yığın dosyası bulunamadı.")

    batches = []
    try:
        with open(batches_file, "r", encoding="utf-8") as f:
            batches = json.load(f)
    except Exception:
        batches = []

    found = False
    now = datetime.now()
    expires_at = (now + timedelta(hours=req.lock_hours)).strftime("%d.%m.%Y %H:%M")

    for b in batches:
        if b.get("id") == req.batch_id:
            b["assigned_to"] = req.assigned_user
            b["locked_until"] = expires_at
            found = True
            break

    if not found:
        raise HTTPException(status_code=404, detail="Belirtilen batch bulunamadı.")

    with open(batches_file, "w", encoding="utf-8") as f:
        json.dump(batches, f, ensure_ascii=False, indent=2)

    return {"status": "ok", "message": f"Yığın '{req.assigned_user}' kullanıcısına atandı.", "locked_until": expires_at}


@router.post("/api/projects/approve-batch")
def approve_batch(data: dict, authorization: Optional[str] = Header(None)):
    """Etiketlenmiş yığını onaylayıp Dataset (Tamamlanan) aşamasına taşır."""
    data_copy = dict(data)
    data_copy["target_stage"] = "completed"
    return move_batch_stage(data_copy, authorization)
