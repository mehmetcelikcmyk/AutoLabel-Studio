import re
import json
import base64
from datetime import datetime
from typing import Optional, Dict, Any, List

from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel

from core.security import get_current_user
from core.database import cf_d1_query
from services.llm_assistant import query_multi_ai_chat, load_chat_history, save_chat_history

router = APIRouter(tags=["AI Assistant"])


class AgentSuggestRequest(BaseModel):
    prompt: str
    image_base64: Optional[str] = None
    image_name: Optional[str] = None
    provider: Optional[str] = None
    session_id: Optional[str] = None


@router.get("/api/agent/history")
def get_agent_history(
    authorization: Optional[str] = Header(None),
    session_id: Optional[str] = None
):
    user = get_current_user(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Oturum açmanız gerekmektedir.")
    user_email = user.get("email", "").strip().lower()
    
    # 1. First attempt Cloudflare D1
    try:
        if session_id:
            chat_row = cf_d1_query(
                "SELECT id, title, created_at, updated_at FROM ai_chats WHERE id = ? AND LOWER(user_email) = ? AND is_deleted = 0 LIMIT 1",
                [session_id, user_email]
            )
            if chat_row and len(chat_row) > 0:
                c = chat_row[0]
                msg_rows = cf_d1_query(
                    "SELECT role, content, msg_type, image_name, blueprint_json, created_at FROM ai_messages WHERE chat_id = ? ORDER BY id ASC",
                    [session_id]
                ) or []
                messages = []
                for m in msg_rows:
                    bp = None
                    if m.get("blueprint_json"):
                        try:
                            bp = json.loads(m["blueprint_json"])
                        except Exception:
                            bp = None
                    messages.append({
                        "role": m.get("role"),
                        "content": m.get("content") or "",
                        "type": m.get("msg_type") or "chat",
                        "message": m.get("content") or "",
                        "image_name": m.get("image_name"),
                        "blueprint": bp,
                        "timestamp": m.get("created_at")
                    })
                return {
                    "status": "ok",
                    "session": {
                        "id": c["id"],
                        "title": c.get("title", "Sohbet"),
                        "created_at": c.get("created_at", ""),
                        "updated_at": c.get("updated_at", ""),
                        "messages": messages
                    }
                }
        else:
            chats = cf_d1_query(
                """
                SELECT c.id, c.title, c.created_at, c.updated_at, COUNT(m.id) as message_count 
                FROM ai_chats c 
                LEFT JOIN ai_messages m ON c.id = m.chat_id 
                WHERE LOWER(c.user_email) = ? AND c.is_deleted = 0 
                GROUP BY c.id 
                ORDER BY c.updated_at DESC
                """,
                [user_email]
            )
            if chats is not None:
                session_list = []
                for s in chats:
                    session_list.append({
                        "id": s["id"],
                        "title": s.get("title", "Sohbet"),
                        "created_at": s.get("created_at", ""),
                        "updated_at": s.get("updated_at", ""),
                        "message_count": s.get("message_count", 0)
                    })
                return {"status": "ok", "sessions": session_list}
    except Exception as e:
        print(f"[D1 AI History Warning] {e}")

    # Fallback to local JSON
    all_history = load_chat_history()
    user_sessions = all_history.get(user_email, {})
    
    if session_id:
        session_data = user_sessions.get(session_id, {"id": session_id, "title": "Yeni Sohbet", "messages": [], "updated_at": datetime.now().isoformat()})
        return {"status": "ok", "session": session_data}
    
    session_list = []
    for sid, sdata in user_sessions.items():
        session_list.append({
            "id": sid,
            "title": sdata.get("title", "Sohbet"),
            "created_at": sdata.get("created_at", ""),
            "updated_at": sdata.get("updated_at", ""),
            "message_count": len(sdata.get("messages", []))
        })
    session_list.sort(key=lambda x: x.get("updated_at", ""), reverse=True)
    return {"status": "ok", "sessions": session_list}


@router.delete("/api/agent/history")
def delete_agent_history(
    authorization: Optional[str] = Header(None),
    session_id: Optional[str] = None
):
    user = get_current_user(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Oturum açmanız gerekmektedir.")
    user_email = user.get("email", "").strip().lower()
    
    # 1. Soft-delete in Cloudflare D1 (Keep record in storage, mark is_deleted = 1)
    try:
        if session_id:
            cf_d1_query(
                "UPDATE ai_chats SET is_deleted = 1 WHERE id = ? AND LOWER(user_email) = ?",
                [session_id, user_email]
            )
        else:
            cf_d1_query(
                "UPDATE ai_chats SET is_deleted = 1 WHERE LOWER(user_email) = ?",
                [user_email]
            )
    except Exception as e:
        print(f"[D1 AI Delete Warning] {e}")

    # Also update local fallback JSON
    try:
        all_history = load_chat_history()
        if user_email in all_history:
            if session_id:
                all_history[user_email].pop(session_id, None)
            else:
                all_history[user_email] = {}
            save_chat_history(all_history)
    except Exception:
        pass

    return {"status": "ok"}


@router.post("/api/agent/suggest")
def agent_suggest(req: AgentSuggestRequest, authorization: Optional[str] = Header(None)):
    user = get_current_user(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Oturum açmanız gerekmektedir.")
    user_email = user.get("email", "").strip().lower()
    sid = req.session_id or f"session_{int(datetime.now().timestamp() * 1000)}"

    p = req.prompt.strip()
    img_bytes = None
    if req.image_base64:
        try:
            img_data = req.image_base64
            if "," in img_data:
                img_data = img_data.split(",")[1]
            img_bytes = base64.b64decode(img_data)
        except Exception:
            pass

    # Load latest 15 prior messages (including blueprint JSON so AI remembers proposed projects/classes)
    prior_messages = []
    try:
        d1_msgs = cf_d1_query(
            "SELECT role, content, blueprint_json FROM ai_messages WHERE chat_id = ? AND LOWER(user_email) = ? ORDER BY id DESC LIMIT 15",
            [sid, user_email]
        )
        if d1_msgs:
            for m in reversed(d1_msgs):
                text = m.get("content") or ""
                if m.get("blueprint_json"):
                    text = f"{text}\n[Önerilen Proje Taslağı]: {m['blueprint_json']}".strip()
                prior_messages.append({"role": m["role"], "content": text})
        else:
            all_history = load_chat_history()
            if user_email in all_history and sid in all_history[user_email]:
                prior_messages = all_history[user_email][sid].get("messages", [])
    except Exception:
        pass

    llm_response, engine_name = query_multi_ai_chat(
        p or "Yüklediğim görseli incele ve içinde neler gördüğünü açıkla.",
        img_bytes,
        history=prior_messages
    )
    
    if not llm_response:
        llm_response = "Merhaba! Ben YOLO AI Asistan. Size nesne tespiti, veri seti hazırlama ve etiketleme konularında nasıl yardımcı olabilirim?"
        engine_name = "YOLO AI Asistan"

    result_payload = None

    if "```json_blueprint" in llm_response:
        try:
            parts = llm_response.split("```json_blueprint")
            text_reply = parts[0].strip()
            json_str = parts[1].split("```")[0].strip()
            bp_data = json.loads(json_str)

            folder_slug = re.sub(r'[^a-z0-9_]', '_', bp_data.get("name", "custom_project").lower()).strip('_')
            classes = []
            palette = ["#3b82f6", "#10b981", "#f59e0b", "#ec4899", "#8b5cf6", "#06b6d4"]
            for idx, c in enumerate(bp_data.get("classes", [])):
                classes.append({
                    "id": idx,
                    "name": c.get("name", f"Class_{idx}"),
                    "color": c.get("color", palette[idx % len(palette)]),
                    "prompts": c.get("prompts", [c.get("name", "").lower()])
                })

            blueprint = {
                "name": bp_data.get("name", "AI Nesne Tespiti"),
                "folder": folder_slug or "ai_project",
                "type": "detection",
                "classes": classes,
                "description": bp_data.get("description", "Yapay zeka tarafından hazırlanan proje.")
            }

            result_payload = {
                "status": "ok",
                "type": "blueprint",
                "source": engine_name,
                "blueprint": blueprint,
                "message": text_reply or "Harika! İsteğinizi inceledim ve projeniz için uygun sınıfları hazırladım:",
                "session_id": sid
            }
        except Exception:
            pass

    if not result_payload:
        result_payload = {
            "status": "ok",
            "type": "chat",
            "source": engine_name,
            "message": llm_response,
            "session_id": sid
        }

    now_iso = datetime.now().isoformat()
    title_preview = (p[:35] + "...") if len(p) > 35 else (p or "Yeni Sohbet")

    # 1. Cloudflare D1 Chat & Message Persistence
    try:
        cf_d1_query(
            """
            INSERT INTO ai_chats (id, user_email, title, created_at, updated_at, is_deleted)
            VALUES (?, ?, ?, ?, ?, 0)
            ON CONFLICT(id) DO UPDATE SET updated_at = ?
            """,
            [sid, user_email, title_preview, now_iso, now_iso, now_iso]
        )
        
        # User message
        cf_d1_query(
            """
            INSERT INTO ai_messages (chat_id, user_email, role, content, msg_type, image_name, blueprint_json, created_at)
            VALUES (?, ?, 'user', ?, 'chat', ?, NULL, ?)
            """,
            [sid, user_email, p, req.image_name if req.image_base64 else None, now_iso]
        )
        
        # Assistant message
        bp_json_str = json.dumps(result_payload.get("blueprint")) if result_payload.get("blueprint") else None
        cf_d1_query(
            """
            INSERT INTO ai_messages (chat_id, user_email, role, content, msg_type, image_name, blueprint_json, created_at)
            VALUES (?, ?, 'assistant', ?, ?, NULL, ?, ?)
            """,
            [
                sid,
                user_email,
                result_payload.get("message", ""),
                result_payload.get("type", "chat"),
                bp_json_str,
                now_iso
            ]
        )
    except Exception as e:
        print(f"[D1 Save AI Messages Error] {e}")

    # 2. Also keep local fallback JSON
    try:
        all_history = load_chat_history()
        if user_email not in all_history:
            all_history[user_email] = {}
        
        if sid not in all_history[user_email]:
            all_history[user_email][sid] = {
                "id": sid,
                "title": title_preview,
                "created_at": now_iso,
                "updated_at": now_iso,
                "messages": []
            }

        sess = all_history[user_email][sid]
        sess["updated_at"] = now_iso
        if len(sess["messages"]) == 0 and p:
            sess["title"] = title_preview

        sess["messages"].append({
            "role": "user",
            "content": p,
            "image_name": req.image_name if req.image_base64 else None,
            "timestamp": now_iso
        })

        sess["messages"].append({
            "role": "assistant",
            "type": result_payload.get("type", "chat"),
            "source": engine_name,
            "message": result_payload.get("message", ""),
            "blueprint": result_payload.get("blueprint"),
            "timestamp": now_iso
        })

        save_chat_history(all_history)
    except Exception as e:
        print(f"Error appending local chat history: {e}")

    return result_payload
