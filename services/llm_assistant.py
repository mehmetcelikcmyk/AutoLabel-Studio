import os
import json
import base64
import urllib.request as _urllib_req
from typing import Optional, Tuple, Dict, Any, List
from datetime import datetime

from core.config import ROOT_DIR, load_settings

CHAT_HISTORY_FILE = ROOT_DIR / "ai_chat_history.json"


def call_gemini_llm(user_prompt: str, image_bytes: Optional[bytes] = None) -> Optional[str]:
    settings = load_settings()
    primary = settings.get("gemini_api_key", "")
    backups = settings.get("gemini_backup_keys", [])
    keys = [k for k in [primary] + backups if k]
    if not keys:
        return None

    for model_name in ("gemini-2.5-flash", "gemini-2.0-flash"):
        for key in keys:
            try:
                url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={key}"
                parts = []
                if image_bytes:
                    parts.append({
                        "inline_data": {
                            "mime_type": "image/jpeg",
                            "data": base64.b64encode(image_bytes).decode("utf-8")
                        }
                    })
                parts.append({"text": user_prompt})

                req_data = json.dumps({"contents": [{"parts": parts}]}).encode("utf-8")
                req = _urllib_req.Request(url, data=req_data, headers={"Content-Type": "application/json"})
                with _urllib_req.urlopen(req, timeout=20) as resp:
                    data = json.loads(resp.read().decode("utf-8"))
                    candidates = data.get("candidates", [])
                    if candidates and "content" in candidates[0]:
                        out_parts = candidates[0]["content"].get("parts", [])
                        if out_parts and "text" in out_parts[0]:
                            return out_parts[0]["text"]
            except Exception as e:
                print(f"[Gemini {model_name} Warning] {e}")
                continue
    return None


def call_openai_llm(user_prompt: str, image_bytes: Optional[bytes] = None) -> Optional[str]:
    settings = load_settings()
    primary = settings.get("openai_api_key", "")
    backups = settings.get("openai_backup_keys", [])
    keys = [k for k in [primary] + backups if k]
    if not keys:
        return None

    for key in keys:
        try:
            url = "https://api.openai.com/v1/chat/completions"
            msg_content = []
            if image_bytes:
                b64_str = base64.b64encode(image_bytes).decode("utf-8")
                msg_content.append({
                    "type": "image_url",
                    "image_url": {"url": f"data:image/jpeg;base64,{b64_str}"}
                })
            msg_content.append({"type": "text", "text": user_prompt})

            req_data = json.dumps({
                "model": "gpt-4o-mini",
                "messages": [{"role": "user", "content": msg_content}],
                "max_tokens": 1024
            }).encode("utf-8")

            req = _urllib_req.Request(url, data=req_data, headers={
                "Authorization": f"Bearer {key}",
                "Content-Type": "application/json"
            })
            with _urllib_req.urlopen(req, timeout=14) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                return data["choices"][0]["message"]["content"]
        except Exception:
            continue
    return None


def call_groq_llm(user_prompt: str) -> Optional[str]:
    settings = load_settings()
    primary = settings.get("groq_api_key", "")
    backups = settings.get("groq_backup_keys", [])
    keys = [k for k in [primary] + backups if k]
    if not keys:
        return None

    for key in keys:
        try:
            url = "https://api.groq.com/openai/v1/chat/completions"
            req_data = json.dumps({
                "model": "llama-3.3-70b-versatile",
                "messages": [{"role": "user", "content": user_prompt}],
                "max_tokens": 1500
            }).encode("utf-8")

            req = _urllib_req.Request(url, data=req_data, headers={
                "Authorization": f"Bearer {key}",
                "Content-Type": "application/json"
            })
            with _urllib_req.urlopen(req, timeout=20) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                return data["choices"][0]["message"]["content"]
        except Exception as e:
            print(f"[Groq Warning] {e}")
            continue
    return None


def query_multi_ai_chat(prompt: str, image_bytes: Optional[bytes] = None, history: list = None) -> Tuple[Optional[str], str]:
    system_instruction = (
        "Sen 'YOLO AI Asistan'sın. Bilgisayarlı görü (Computer Vision), YOLOv8, YOLOWorld ve nesne tespiti konularında uzman bir yapay zekasın.\n"
        "Kurallar:\n"
        "1. Kullanıcı selam verdiğinde, sohbet ettiğinde veya genel soru sorduğunda ASLA zorla proje/sınıf üretme. Doğal, samimi ve yardımsever Türkçe konuş.\n"
        "2. Kullanıcı bir görsel yüklediyse görseli detaylıca incele, gördüğün nesneleri ve detayları açıkla.\n"
        "3. Kullanıcı AÇIKÇA bir nesne tespit veya etiketleme projesi oluşturmak istediğini belirtirse yanıtının sonunda şu JSON bloğunu ekle:\n"
        "```json_blueprint\n"
        "{\n"
        "  \"name\": \"Proje Adı\",\n"
        "  \"description\": \"Açıklama\",\n"
        "  \"classes\": [{\"name\": \"Person\", \"color\": \"#3b82f6\", \"prompts\": [\"person\"]}]\n"
        "}\n"
        "```\n"
        "Eğer kullanıcı sadece sohbet ediyorsa veya bilgi istiyorsa json_blueprint bloğunu EKLEME.\n"
        "4. ÖNEMLİ: Önceki mesajları dikkate alarak tutarlı, konuşma bağlamını koruyan yanıtlar üret. Kullanıcı adın YOLO AI Asistan.\n"
    )

    history_context = ""
    if history:
        for h in history[-10:]:
            role = h.get("role", "")
            content = h.get("content") or h.get("message", "")
            if role == "user" and content:
                history_context += f"Kullanıcı: {content}\n"
            elif role == "assistant" and content:
                history_context += f"YOLO AI Asistan: {content}\n"

    if history_context:
        full_prompt = f"{system_instruction}\n\nKonuşma Geçmişi:\n{history_context}\nKullanıcı: {prompt}"
    else:
        full_prompt = f"{system_instruction}\n\nKullanıcı: {prompt}"

    res = call_gemini_llm(full_prompt, image_bytes)
    if res:
        return res, "Google Gemini 2.5 Flash"

    res = call_openai_llm(full_prompt, image_bytes)
    if res:
        return res, "OpenAI GPT-4o Mini"

    res = call_groq_llm(full_prompt)
    if res:
        return res, "Groq Llama 3.3 70B"

    return None, "local_ai"


def load_chat_history() -> Dict[str, Any]:
    if CHAT_HISTORY_FILE.exists():
        try:
            with open(CHAT_HISTORY_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return {}
    return {}


def save_chat_history(data: Dict[str, Any]):
    try:
        with open(CHAT_HISTORY_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f"Error saving chat history: {e}")
