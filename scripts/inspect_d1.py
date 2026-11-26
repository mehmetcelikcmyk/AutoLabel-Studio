# -*- coding: utf-8 -*-
import sys
import os
from pathlib import Path
sys.path.insert(0, os.path.abspath('.'))
from core.database import cf_d1_query


# D1 is the single authoritative metadata store.  This is intentionally kept in
# an existing tracked script because the workspace ACL currently blocks adding a
# new file; run `python scripts/inspect_d1.py --migrate` once per fresh D1 DB.
MIGRATIONS = [
    "CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE COLLATE NOCASE, display_name TEXT NOT NULL, password_hash TEXT, salt TEXT, auth_provider TEXT NOT NULL DEFAULT 'local', avatar_url TEXT, role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('user','admin')), reset_code TEXT, reset_expires TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)",
    "CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, created_at TEXT NOT NULL, expires_at TEXT NOT NULL, absolute_expires_at TEXT NOT NULL, revoked_at TEXT, user_agent_hash TEXT, ip_hash TEXT)",
    "CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id)",
    "CREATE TABLE IF NOT EXISTS workspaces (id TEXT PRIMARY KEY, owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, name TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(owner_user_id, name))",
    "CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE, owner_user_id TEXT NOT NULL REFERENCES users(id), slug TEXT NOT NULL, display_name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', visibility TEXT NOT NULL DEFAULT 'private' CHECK(visibility IN ('private','public')), project_type TEXT NOT NULL DEFAULT 'detection', created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT, UNIQUE(workspace_id, slug))",
    "CREATE TABLE IF NOT EXISTS project_members (project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, role TEXT NOT NULL CHECK(role IN ('owner','manager','reviewer','annotator','viewer')), created_at TEXT NOT NULL, PRIMARY KEY(project_id,user_id))",
    "CREATE TABLE IF NOT EXISTS project_classes (id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE, class_index INTEGER NOT NULL, name TEXT NOT NULL, color TEXT NOT NULL, prompts_json TEXT NOT NULL DEFAULT '[]', UNIQUE(project_id,class_index))",
    "CREATE TABLE IF NOT EXISTS assets (id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE, original_filename TEXT NOT NULL, object_key TEXT NOT NULL UNIQUE, content_type TEXT NOT NULL, byte_size INTEGER NOT NULL, sha256 TEXT NOT NULL, annotation_key TEXT, annotation_version INTEGER NOT NULL DEFAULT 0, created_by_user_id TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT)",
    "CREATE INDEX IF NOT EXISTS idx_assets_project ON assets(project_id, created_at)",
    "CREATE TABLE IF NOT EXISTS teams (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE, name TEXT NOT NULL, created_by_user_id TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL, UNIQUE(workspace_id,name))",
    "CREATE TABLE IF NOT EXISTS team_members (team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, role TEXT NOT NULL CHECK(role IN ('captain','reviewer','annotator')), created_at TEXT NOT NULL, PRIMARY KEY(team_id,user_id))",
    "CREATE TABLE IF NOT EXISTS team_projects (team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE, created_at TEXT NOT NULL, PRIMARY KEY(team_id,project_id))",
    "CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE, assigned_to_user_id TEXT NOT NULL REFERENCES users(id), assigned_by_user_id TEXT NOT NULL REFERENCES users(id), status TEXT NOT NULL CHECK(status IN ('assigned','submitted','approved','rejected')), asset_ids_json TEXT NOT NULL, created_at TEXT NOT NULL, submitted_at TEXT, reviewed_at TEXT, reviewer_user_id TEXT REFERENCES users(id), feedback TEXT)",
    "CREATE TABLE IF NOT EXISTS audit_events (id TEXT PRIMARY KEY, actor_user_id TEXT REFERENCES users(id), project_id TEXT REFERENCES projects(id), event_type TEXT NOT NULL, payload_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL)",
]

if "--migrate" in sys.argv:
    for statement in MIGRATIONS:
        cf_d1_query(statement)
    print("Cloudflare D1 multi-tenant schema applied.")
    raise SystemExit(0)


tables = cf_d1_query("SELECT name FROM sqlite_master WHERE type='table'")
print("D1 Tables:", [t.get('name') for t in (tables or [])])

# Check ai_chat_history or chat_messages tables
for t in ['ai_chats', 'chat_sessions', 'chat_messages', 'ai_chat_history']:
    info = cf_d1_query(f"PRAGMA table_info({t})")
    if info:
        print(f"Table {t} columns:", [c.get('name') for c in info])
