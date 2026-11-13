"""د ننګرهار پوهنتون ډیجیټل کتابتون - FastAPI بیک‌انډ.

چلول:
    pip install -r requirements.txt
    uvicorn main:app --reload
بیا براوزر کې پرانیزئ: http://127.0.0.1:8000

چاپېریال متغیرونه:
    DATA_DIR     د ډیټابیس او اپلوډ فایلونو فولډر (په Render کې Disk ته)
    ADMIN_EMAIL  د مدیر ایمیل/ایمیلونه (په کوما جلا)
"""
import hashlib
import hmac
import math
import os
import secrets
import sqlite3
import time
import uuid
from collections import defaultdict
from contextlib import closing
from pathlib import Path
from typing import Optional

from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, Query, Request, UploadFile
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

BASE_DIR = Path(__file__).parent
DATA_DIR = Path(os.environ.get("DATA_DIR", BASE_DIR))
DATA_DIR.mkdir(parents=True, exist_ok=True)
UPLOAD_DIR = DATA_DIR / "uploads"
STATIC_DIR = BASE_DIR / "static"
DB_PATH = DATA_DIR / "library.db"

MAX_UPLOAD_BYTES = 20 * 1024 * 1024  # 20 MB
SESSION_TTL = 7 * 24 * 3600  # 7 ورځې
PBKDF2_ROUNDS = 200_000
PAGE_SIZE = 12

CATEGORIES = [
    "کمپیوټر ساینس", "انجنیري", "طب", "درملپوهنه", "ساینس", "زراعت", "اقتصاد",
    "شرعیات", "حقوق", "ژبې او ادبیات", "تعلیم او تربیه", "نور",
]
ADMIN_EMAILS = {e.strip().lower() for e in os.environ.get("ADMIN_EMAIL", "").split(",") if e.strip()}

UPLOAD_DIR.mkdir(exist_ok=True)

app = FastAPI(title="Nangarhar University Library")


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("Referrer-Policy", "same-origin")
    return response


# ---------- ډیټابیس ----------
def get_db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def ensure_column(db: sqlite3.Connection, table: str, column: str, ddl: str) -> None:
    cols = [r["name"] for r in db.execute(f"PRAGMA table_info({table})")]
    if column not in cols:
        db.execute(f"ALTER TABLE {table} ADD COLUMN {column} {ddl}")


def init_db() -> None:
    with closing(get_db()) as db:
        db.execute("PRAGMA journal_mode = WAL")
        db.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                email TEXT NOT NULL UNIQUE,
                role TEXT NOT NULL CHECK (role IN ('student', 'teacher')),
                password_hash TEXT NOT NULL,
                salt TEXT NOT NULL,
                created_at INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS sessions (
                token TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                expires_at INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS files (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                original_name TEXT NOT NULL,
                stored_name TEXT NOT NULL UNIQUE,
                size INTEGER NOT NULL,
                downloads INTEGER NOT NULL DEFAULT 0,
                owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                created_at INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS favorites (
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
                created_at INTEGER NOT NULL,
                PRIMARY KEY (user_id, file_id)
            );
            CREATE TABLE IF NOT EXISTS comments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                body TEXT NOT NULL,
                created_at INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_files_created ON files(created_at);
            CREATE INDEX IF NOT EXISTS idx_comments_file ON comments(file_id);
            """
        )
        # د زړو ډیټابیسونو لپاره نوې ستنې
        ensure_column(db, "users", "is_admin", "INTEGER NOT NULL DEFAULT 0")
        ensure_column(db, "users", "is_active", "INTEGER NOT NULL DEFAULT 1")
        ensure_column(db, "files", "category", "TEXT NOT NULL DEFAULT 'نور'")
        ensure_column(db, "files", "views", "INTEGER NOT NULL DEFAULT 0")
        db.commit()


init_db()


# ---------- پاسورډ ----------
def hash_password(password: str, salt: bytes) -> str:
    return hashlib.pbkdf2_hmac("sha256", password.encode(), salt, PBKDF2_ROUNDS).hex()


def new_credentials(password: str) -> tuple[str, str]:
    salt = secrets.token_bytes(16)
    return hash_password(password, salt), salt.hex()


FAILED: dict[str, list[float]] = defaultdict(list)
MAX_FAILS, FAIL_WINDOW = 8, 600


def check_rate_limit(key: str) -> None:
    now = time.time()
    FAILED[key] = [t for t in FAILED[key] if now - t < FAIL_WINDOW]
    if len(FAILED[key]) >= MAX_FAILS:
        raise HTTPException(429, "ډېر ناسم هڅې شوې. ۱۰ دقیقې وروسته بیا هڅه وکړئ.")


# ---------- ماډلونه ----------
EMAIL_PATTERN = r"^[^@\s]+@[^@\s]+\.[^@\s]+$"


class RegisterIn(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    email: str = Field(min_length=5, max_length=120, pattern=EMAIL_PATTERN)
    password: str = Field(min_length=6, max_length=128)
    role: str = Field(pattern="^(student|teacher)$")


class LoginIn(BaseModel):
    email: str = Field(max_length=120)
    password: str = Field(max_length=128)


class ProfileIn(BaseModel):
    name: str = Field(min_length=2, max_length=80)


class PasswordIn(BaseModel):
    current: str = Field(max_length=128)
    new: str = Field(min_length=6, max_length=128)


class FileEditIn(BaseModel):
    title: str = Field(min_length=2, max_length=150)
    description: str = Field("", max_length=1000)
    category: str = Field(max_length=40)


class CommentIn(BaseModel):
    body: str = Field(min_length=1, max_length=1000)


class AdminUserIn(BaseModel):
    role: Optional[str] = Field(default=None, pattern="^(student|teacher)$")
    is_admin: Optional[bool] = None
    is_active: Optional[bool] = None


# ---------- تصدیق ----------
def is_admin(u: sqlite3.Row) -> bool:
    return bool(u["is_admin"]) or u["email"].lower() in ADMIN_EMAILS


def current_user(authorization: Optional[str] = Header(default=None)) -> sqlite3.Row:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "مهرباني وکړئ لومړی ننوځئ.")
    token = authorization[7:]
    with closing(get_db()) as db:
        row = db.execute(
            """SELECT u.id, u.name, u.email, u.role, u.is_admin, u.is_active FROM sessions s
               JOIN users u ON u.id = s.user_id
               WHERE s.token = ? AND s.expires_at > ?""",
            (token, int(time.time())),
        ).fetchone()
    if not row or not row["is_active"]:
        raise HTTPException(401, "ناسته پای ته رسېدلې، بیا ننوځئ.")
    return row


def admin_user(user=Depends(current_user)) -> sqlite3.Row:
    if not is_admin(user):
        raise HTTPException(403, "دا برخه یوازې د مدیر لپاره ده.")
    return user


def user_dict(u: sqlite3.Row) -> dict:
    return {"id": u["id"], "name": u["name"], "email": u["email"], "role": u["role"], "is_admin": is_admin(u)}


def bearer_token(authorization: Optional[str]) -> str:
    return (authorization or "")[7:]


# ---------- ثبت او ننوتل ----------
@app.get("/api/meta")
def meta():
    return {"categories": CATEGORIES, "max_upload_mb": MAX_UPLOAD_BYTES // (1024 * 1024), "page_size": PAGE_SIZE}


@app.get("/healthz")
def healthz():
    return {"ok": True}


@app.post("/api/register", status_code=201)
def register(data: RegisterIn):
    email = data.email.strip().lower()
    pw_hash, salt = new_credentials(data.password)
    with closing(get_db()) as db:
        try:
            db.execute(
                "INSERT INTO users (name, email, role, password_hash, salt, created_at) VALUES (?,?,?,?,?,?)",
                (data.name.strip(), email, data.role, pw_hash, salt, int(time.time())),
            )
            db.commit()
        except sqlite3.IntegrityError:
            raise HTTPException(409, "دا ایمیل مخکې ثبت شوی دی.")
    return {"message": "اکاونټ جوړ شو. اوس ننوځئ."}


@app.post("/api/login")
def login(data: LoginIn):
    email = data.email.strip().lower()
    check_rate_limit(email)
    with closing(get_db()) as db:
        user = db.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
        # همدا کار تل کوو چې د وخت له مخې ایمیل نه پیژندل کېږي
        salt = bytes.fromhex(user["salt"]) if user else b"\0" * 16
        candidate = hash_password(data.password, salt)
        if not user or not hmac.compare_digest(candidate, user["password_hash"]):
            FAILED[email].append(time.time())
            raise HTTPException(401, "ایمیل یا پاسورډ ناسم دی.")
        if not user["is_active"]:
            raise HTTPException(403, "دا اکاونټ بند شوی دی. له مدیر سره اړیکه ونیسئ.")
        FAILED.pop(email, None)
        token = secrets.token_urlsafe(32)
        db.execute(
            "INSERT INTO sessions (token, user_id, expires_at) VALUES (?,?,?)",
            (token, user["id"], int(time.time()) + SESSION_TTL),
        )
        db.execute("DELETE FROM sessions WHERE expires_at <= ?", (int(time.time()),))
        db.commit()
    return {"token": token, "user": user_dict(user)}


@app.post("/api/logout")
def logout(authorization: Optional[str] = Header(default=None), user=Depends(current_user)):
    with closing(get_db()) as db:
        db.execute("DELETE FROM sessions WHERE token = ?", (bearer_token(authorization),))
        db.commit()
    return {"message": "وتل شئ."}


@app.get("/api/me")
def me(user=Depends(current_user)):
    return user_dict(user)


@app.patch("/api/me")
def update_profile(data: ProfileIn, user=Depends(current_user)):
    with closing(get_db()) as db:
        db.execute("UPDATE users SET name = ? WHERE id = ?", (data.name.strip(), user["id"]))
        db.commit()
        row = db.execute("SELECT id, name, email, role, is_admin, is_active FROM users WHERE id = ?", (user["id"],)).fetchone()
    return user_dict(row)


@app.post("/api/me/password")
def change_password(data: PasswordIn, authorization: Optional[str] = Header(default=None), user=Depends(current_user)):
    with closing(get_db()) as db:
        row = db.execute("SELECT password_hash, salt FROM users WHERE id = ?", (user["id"],)).fetchone()
        candidate = hash_password(data.current, bytes.fromhex(row["salt"]))
        if not hmac.compare_digest(candidate, row["password_hash"]):
            raise HTTPException(400, "اوسنی پاسورډ ناسم دی.")
        pw_hash, salt = new_credentials(data.new)
        db.execute("UPDATE users SET password_hash = ?, salt = ? WHERE id = ?", (pw_hash, salt, user["id"]))
        # نورې ناستې بندوو، اوسنۍ پاتې کېږي
        db.execute("DELETE FROM sessions WHERE user_id = ? AND token != ?", (user["id"], bearer_token(authorization)))
        db.commit()
    return {"message": "پاسورډ بدل شو."}


# ---------- فایلونه ----------
FILE_SELECT = """
    SELECT f.*, u.name AS owner_name, u.role AS owner_role,
           EXISTS(SELECT 1 FROM favorites fv WHERE fv.file_id = f.id AND fv.user_id = ?) AS fav,
           (SELECT COUNT(*) FROM favorites fv2 WHERE fv2.file_id = f.id) AS fav_count,
           (SELECT COUNT(*) FROM comments c WHERE c.file_id = f.id) AS comment_count
    FROM files f JOIN users u ON u.id = f.owner_id
"""

SORTS = {
    "new": "f.created_at DESC",
    "popular": "f.downloads DESC, f.created_at DESC",
    "views": "f.views DESC, f.created_at DESC",
    "title": "f.title COLLATE NOCASE ASC",
}


def file_dict(r: sqlite3.Row, viewer: sqlite3.Row) -> dict:
    return {
        "id": r["id"],
        "title": r["title"],
        "description": r["description"],
        "category": r["category"],
        "size": r["size"],
        "downloads": r["downloads"],
        "views": r["views"],
        "created_at": r["created_at"],
        "owner_id": r["owner_id"],
        "owner_name": r["owner_name"],
        "owner_role": r["owner_role"],
        "favorite": bool(r["fav"]),
        "fav_count": r["fav_count"],
        "comment_count": r["comment_count"],
        "mine": r["owner_id"] == viewer["id"],
        "can_edit": r["owner_id"] == viewer["id"] or is_admin(viewer),
    }


def fetch_file(db: sqlite3.Connection, file_id: int, viewer: sqlite3.Row) -> sqlite3.Row:
    row = db.execute(FILE_SELECT + " WHERE f.id = ?", (viewer["id"], file_id)).fetchone()
    if not row:
        raise HTTPException(404, "فایل ونه موندل شو.")
    return row


def clean_category(value: str) -> str:
    if value not in CATEGORIES:
        raise HTTPException(400, "کټګورۍ ناسمه ده.")
    return value


def safe_filename(title: str) -> str:
    cleaned = "".join("-" if c in '/\\:*?"<>|' or ord(c) < 32 else c for c in title).strip()
    return (cleaned or "file") + ".pdf"


@app.post("/api/files", status_code=201)
async def upload_file(
    title: str = Form(..., min_length=2, max_length=150),
    description: str = Form("", max_length=1000),
    category: str = Form("نور"),
    file: UploadFile = File(...),
    user=Depends(current_user),
):
    category = clean_category(category)
    original = (file.filename or "file.pdf").strip()
    if not original.lower().endswith(".pdf"):
        raise HTTPException(400, "یوازې PDF فایل منل کېږي.")

    stored = f"{uuid.uuid4().hex}.pdf"
    path = UPLOAD_DIR / stored
    size = 0
    first_chunk = True
    try:
        with open(path, "wb") as out:
            while chunk := await file.read(1024 * 1024):
                if first_chunk:
                    if not chunk.startswith(b"%PDF"):
                        raise HTTPException(400, "دا فایل اصلي PDF نه دی.")
                    first_chunk = False
                size += len(chunk)
                if size > MAX_UPLOAD_BYTES:
                    raise HTTPException(413, "فایل له 20MB څخه لوی دی.")
                out.write(chunk)
        if size == 0:
            raise HTTPException(400, "فایل تش دی.")
    except Exception:
        path.unlink(missing_ok=True)
        raise

    with closing(get_db()) as db:
        cur = db.execute(
            """INSERT INTO files (title, description, category, original_name, stored_name, size, owner_id, created_at)
               VALUES (?,?,?,?,?,?,?,?)""",
            (title.strip(), description.strip(), category, original[:200], stored, size, user["id"], int(time.time())),
        )
        db.commit()
    return {"id": cur.lastrowid, "message": "فایل په بریالیتوب اپلوډ شو."}


@app.get("/api/files")
def list_files(
    q: str = Query("", max_length=100),
    category: str = Query("", max_length=40),
    sort: str = Query("new"),
    scope: str = Query("all", pattern="^(all|mine|favorites)$"),
    page: int = Query(1, ge=1, le=10_000),
    user=Depends(current_user),
):
    where, params = [], []
    if q.strip():
        like = f"%{q.strip()}%"
        where.append("(f.title LIKE ? OR f.description LIKE ? OR u.name LIKE ?)")
        params += [like, like, like]
    if category:
        where.append("f.category = ?")
        params.append(category)
    if scope == "mine":
        where.append("f.owner_id = ?")
        params.append(user["id"])
    elif scope == "favorites":
        where.append("EXISTS(SELECT 1 FROM favorites x WHERE x.file_id = f.id AND x.user_id = ?)")
        params.append(user["id"])
    clause = (" WHERE " + " AND ".join(where)) if where else ""
    order = SORTS.get(sort, SORTS["new"])

    with closing(get_db()) as db:
        total = db.execute(
            "SELECT COUNT(*) FROM files f JOIN users u ON u.id = f.owner_id" + clause, params
        ).fetchone()[0]
        rows = db.execute(
            FILE_SELECT + clause + f" ORDER BY {order} LIMIT ? OFFSET ?",
            [user["id"], *params, PAGE_SIZE, (page - 1) * PAGE_SIZE],
        ).fetchall()
    return {
        "items": [file_dict(r, user) for r in rows],
        "total": total,
        "page": page,
        "pages": max(1, math.ceil(total / PAGE_SIZE)),
    }


@app.get("/api/files/{file_id}")
def get_file(file_id: int, user=Depends(current_user)):
    with closing(get_db()) as db:
        return file_dict(fetch_file(db, file_id, user), user)


@app.patch("/api/files/{file_id}")
def edit_file(file_id: int, data: FileEditIn, user=Depends(current_user)):
    category = clean_category(data.category)
    with closing(get_db()) as db:
        row = fetch_file(db, file_id, user)
        if row["owner_id"] != user["id"] and not is_admin(user):
            raise HTTPException(403, "یوازې د فایل مالک یا مدیر یې بدلولی شي.")
        db.execute(
            "UPDATE files SET title = ?, description = ?, category = ? WHERE id = ?",
            (data.title.strip(), data.description.strip(), category, file_id),
        )
        db.commit()
        return file_dict(fetch_file(db, file_id, user), user)


def stored_path(db: sqlite3.Connection, file_id: int) -> tuple[sqlite3.Row, Path]:
    row = db.execute("SELECT * FROM files WHERE id = ?", (file_id,)).fetchone()
    if not row:
        raise HTTPException(404, "فایل ونه موندل شو.")
    path = UPLOAD_DIR / row["stored_name"]
    if not path.is_file():
        raise HTTPException(404, "فایل په سرور کې نشته.")
    return row, path


@app.get("/api/files/{file_id}/download")
def download_file(file_id: int, user=Depends(current_user)):
    with closing(get_db()) as db:
        row, path = stored_path(db, file_id)
        db.execute("UPDATE files SET downloads = downloads + 1 WHERE id = ?", (file_id,))
        db.commit()
    return FileResponse(path, media_type="application/pdf", filename=safe_filename(row["title"]))


@app.get("/api/files/{file_id}/view")
def view_file(file_id: int, user=Depends(current_user)):
    """د براوزر کې کتل (preview) پرته له ډاونلوډ شمېرنې."""
    with closing(get_db()) as db:
        row, path = stored_path(db, file_id)
        db.execute("UPDATE files SET views = views + 1 WHERE id = ?", (file_id,))
        db.commit()
    return FileResponse(
        path, media_type="application/pdf", filename=safe_filename(row["title"]), content_disposition_type="inline"
    )


@app.delete("/api/files/{file_id}")
def delete_file(file_id: int, user=Depends(current_user)):
    with closing(get_db()) as db:
        row = db.execute("SELECT * FROM files WHERE id = ?", (file_id,)).fetchone()
        if not row:
            raise HTTPException(404, "فایل ونه موندل شو.")
        if row["owner_id"] != user["id"] and not is_admin(user):
            raise HTTPException(403, "یوازې د فایل مالک یا مدیر یې ړنګولی شي.")
        db.execute("DELETE FROM files WHERE id = ?", (file_id,))
        db.commit()
    (UPLOAD_DIR / row["stored_name"]).unlink(missing_ok=True)
    return {"message": "فایل ړنګ شو."}


# ---------- خوښې ----------
@app.put("/api/files/{file_id}/favorite")
def add_favorite(file_id: int, user=Depends(current_user)):
    with closing(get_db()) as db:
        if not db.execute("SELECT 1 FROM files WHERE id = ?", (file_id,)).fetchone():
            raise HTTPException(404, "فایل ونه موندل شو.")
        db.execute(
            "INSERT OR IGNORE INTO favorites (user_id, file_id, created_at) VALUES (?,?,?)",
            (user["id"], file_id, int(time.time())),
        )
        db.commit()
    return {"favorite": True}


@app.delete("/api/files/{file_id}/favorite")
def remove_favorite(file_id: int, user=Depends(current_user)):
    with closing(get_db()) as db:
        db.execute("DELETE FROM favorites WHERE user_id = ? AND file_id = ?", (user["id"], file_id))
        db.commit()
    return {"favorite": False}


# ---------- نظرونه ----------
def comment_dict(r: sqlite3.Row, viewer: sqlite3.Row) -> dict:
    return {
        "id": r["id"],
        "body": r["body"],
        "created_at": r["created_at"],
        "author_name": r["author_name"],
        "author_role": r["author_role"],
        "can_delete": r["user_id"] == viewer["id"] or is_admin(viewer),
    }


COMMENT_SELECT = """SELECT c.*, u.name AS author_name, u.role AS author_role
                    FROM comments c JOIN users u ON u.id = c.user_id"""


@app.get("/api/files/{file_id}/comments")
def list_comments(file_id: int, user=Depends(current_user)):
    with closing(get_db()) as db:
        fetch_file(db, file_id, user)
        rows = db.execute(COMMENT_SELECT + " WHERE c.file_id = ? ORDER BY c.created_at ASC", (file_id,)).fetchall()
    return [comment_dict(r, user) for r in rows]


@app.post("/api/files/{file_id}/comments", status_code=201)
def add_comment(file_id: int, data: CommentIn, user=Depends(current_user)):
    body = data.body.strip()
    if not body:
        raise HTTPException(400, "نظر تش دی.")
    with closing(get_db()) as db:
        fetch_file(db, file_id, user)
        cur = db.execute(
            "INSERT INTO comments (file_id, user_id, body, created_at) VALUES (?,?,?,?)",
            (file_id, user["id"], body, int(time.time())),
        )
        db.commit()
        row = db.execute(COMMENT_SELECT + " WHERE c.id = ?", (cur.lastrowid,)).fetchone()
    return comment_dict(row, user)


@app.delete("/api/comments/{comment_id}")
def delete_comment(comment_id: int, user=Depends(current_user)):
    with closing(get_db()) as db:
        row = db.execute("SELECT * FROM comments WHERE id = ?", (comment_id,)).fetchone()
        if not row:
            raise HTTPException(404, "نظر ونه موندل شو.")
        if row["user_id"] != user["id"] and not is_admin(user):
            raise HTTPException(403, "یوازې د نظر لیکوال یا مدیر یې ړنګولی شي.")
        db.execute("DELETE FROM comments WHERE id = ?", (comment_id,))
        db.commit()
    return {"message": "نظر ړنګ شو."}


# ---------- احصایې ----------
@app.get("/api/stats")
def stats(user=Depends(current_user)):
    with closing(get_db()) as db:
        totals = db.execute(
            "SELECT COUNT(*) AS files, COALESCE(SUM(downloads),0) AS downloads, COALESCE(SUM(size),0) AS bytes FROM files"
        ).fetchone()
        users = db.execute("SELECT COUNT(*) FROM users").fetchone()[0]
        mine = db.execute("SELECT COUNT(*) FROM files WHERE owner_id = ?", (user["id"],)).fetchone()[0]
        cats = db.execute(
            "SELECT category AS name, COUNT(*) AS count FROM files GROUP BY category ORDER BY count DESC"
        ).fetchall()
    return {
        "files": totals["files"],
        "downloads": totals["downloads"],
        "bytes": totals["bytes"],
        "users": users,
        "mine": mine,
        "categories": [{"name": c["name"], "count": c["count"]} for c in cats],
    }


# ---------- مدیر ----------
def admin_user_dict(r: sqlite3.Row) -> dict:
    return {
        "id": r["id"],
        "name": r["name"],
        "email": r["email"],
        "role": r["role"],
        "created_at": r["created_at"],
        "file_count": r["file_count"],
        "is_active": bool(r["is_active"]),
        "is_admin": is_admin(r),
        "locked_admin": r["email"].lower() in ADMIN_EMAILS,  # د چاپېریال له لارې مدیر، نه شي بدلېدلی
    }


ADMIN_USER_SELECT = """SELECT u.*, (SELECT COUNT(*) FROM files f WHERE f.owner_id = u.id) AS file_count FROM users u"""


@app.get("/api/admin/users")
def admin_list_users(q: str = Query("", max_length=100), admin=Depends(admin_user)):
    like = f"%{q.strip()}%"
    with closing(get_db()) as db:
        rows = db.execute(
            ADMIN_USER_SELECT + " WHERE u.name LIKE ? OR u.email LIKE ? ORDER BY u.created_at DESC", (like, like)
        ).fetchall()
    return [admin_user_dict(r) for r in rows]


@app.patch("/api/admin/users/{user_id}")
def admin_update_user(user_id: int, data: AdminUserIn, admin=Depends(admin_user)):
    with closing(get_db()) as db:
        target = db.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
        if not target:
            raise HTTPException(404, "کارونکی ونه موندل شو.")
        if user_id == admin["id"] and (data.is_admin is False or data.is_active is False):
            raise HTTPException(400, "خپل مدیر حق یا اکاونټ نه شئ بندولی.")
        if target["email"].lower() in ADMIN_EMAILS and (data.is_admin is False or data.is_active is False):
            raise HTTPException(400, "دا مدیر د سرور تنظیماتو له لارې ټاکل شوی.")
        if data.role is not None:
            db.execute("UPDATE users SET role = ? WHERE id = ?", (data.role, user_id))
        if data.is_admin is not None:
            db.execute("UPDATE users SET is_admin = ? WHERE id = ?", (int(data.is_admin), user_id))
        if data.is_active is not None:
            db.execute("UPDATE users SET is_active = ? WHERE id = ?", (int(data.is_active), user_id))
            if not data.is_active:
                db.execute("DELETE FROM sessions WHERE user_id = ?", (user_id,))
        db.commit()
        row = db.execute(ADMIN_USER_SELECT + " WHERE u.id = ?", (user_id,)).fetchone()
    return admin_user_dict(row)


@app.post("/api/admin/users/{user_id}/reset-password")
def admin_reset_password(user_id: int, admin=Depends(admin_user)):
    temp = secrets.token_urlsafe(8)
    pw_hash, salt = new_credentials(temp)
    with closing(get_db()) as db:
        if not db.execute("SELECT 1 FROM users WHERE id = ?", (user_id,)).fetchone():
            raise HTTPException(404, "کارونکی ونه موندل شو.")
        db.execute("UPDATE users SET password_hash = ?, salt = ? WHERE id = ?", (pw_hash, salt, user_id))
        db.execute("DELETE FROM sessions WHERE user_id = ?", (user_id,))
        db.commit()
    return {"temporary_password": temp}


@app.delete("/api/admin/users/{user_id}")
def admin_delete_user(user_id: int, admin=Depends(admin_user)):
    if user_id == admin["id"]:
        raise HTTPException(400, "خپل اکاونټ نه شئ ړنګولی.")
    with closing(get_db()) as db:
        target = db.execute("SELECT email FROM users WHERE id = ?", (user_id,)).fetchone()
        if not target:
            raise HTTPException(404, "کارونکی ونه موندل شو.")
        if target["email"].lower() in ADMIN_EMAILS:
            raise HTTPException(400, "دا مدیر د سرور تنظیماتو له لارې ټاکل شوی.")
        stored = [r["stored_name"] for r in db.execute("SELECT stored_name FROM files WHERE owner_id = ?", (user_id,))]
        db.execute("DELETE FROM users WHERE id = ?", (user_id,))  # فایلونه، خوښې او ناستې په CASCADE ړنګېږي
        db.commit()
    for name in stored:
        (UPLOAD_DIR / name).unlink(missing_ok=True)
    return {"message": "کارونکی او د هغه فایلونه ړنګ شول."}


# فرنټ‌انډ (باید په پای کې وي)
app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
