from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Request, Header
from fastapi.responses import FileResponse, StreamingResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
import hashlib, secrets, hmac
from pathlib import Path
from PIL import Image
import sqlite3, uuid, shutil, jwt, os, json, base64, mimetypes, re, time
from datetime import datetime, timedelta, timezone

BASE = Path(__file__).resolve().parent
try:
    from dotenv import load_dotenv
    load_dotenv(BASE / ".env")
except Exception:
    pass
# Keep persistent user data separate from source files when desired.
# Set SCHOOL_PLUS_DATA_DIR to a directory on a persistent disk in deployment.
DATA_DIR = Path(os.environ.get("SCHOOL_PLUS_DATA_DIR", str(BASE))).expanduser().resolve()
DATA_DIR.mkdir(parents=True, exist_ok=True)
DB = DATA_DIR / "school_plus.db"
UPLOADS = DATA_DIR / "uploads"
UPLOADS.mkdir(parents=True, exist_ok=True)
def _load_secret():
    """Секрет JWT: из .env, а если там заглушка — случайный, сохранённый в backend/.secret."""
    value = os.getenv("SCHOOL_PLUS_SECRET", "").strip()
    if value and "change-me" not in value:
        return value
    f = DATA_DIR / ".secret"
    if f.exists() and f.read_text().strip():
        return f.read_text().strip()
    value = secrets.token_hex(32); f.write_text(value)
    return value

SECRET = _load_secret()
DEMO_MODE = os.getenv("DEMO_MODE", "1") == "1"  # Local presentation default; disable for production
ALLOW_WORKER_SIGNUP = os.getenv("ALLOW_WORKER_SIGNUP", "0") != "0"
# AI provider is OpenAI-compatible. Default is the user's DarkAPI gateway.
AI_API_KEY = (os.getenv("DARKAPI_API_KEY") or os.getenv("OPENAI_API_KEY") or "").strip()
AI_BASE_URL = (os.getenv("DARKAPI_BASE_URL") or os.getenv("OPENAI_BASE_URL") or "https://darkapi.shop/v1").strip().rstrip("/")
AI_MODEL = (os.getenv("DARKAPI_MODEL") or os.getenv("OPENAI_MODEL") or "gpt-6-luna").strip()


def hash_password(password: str):
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 180000)
    return salt.hex() + "$" + digest.hex()


def verify_password(password: str, stored: str):
    try:
        salt_hex, digest_hex = stored.split("$", 1)
        digest = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt_hex), 180000)
        return hmac.compare_digest(digest.hex(), digest_hex)
    except Exception:
        return False


app = FastAPI(title="ШКОЛА+")


@app.middleware("http")
async def security_headers(request: Request, call_next):
    resp = await call_next(request)
    resp.headers.update({
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY",
        "Referrer-Policy": "no-referrer",
        "Content-Security-Policy": "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; frame-ancestors 'none'",
    })
    return resp

app.mount("/assets", StaticFiles(directory=BASE.parent / "frontend" / "assets"), name="assets")


def db():
    c = sqlite3.connect(DB, timeout=15)
    c.row_factory = sqlite3.Row
    c.execute("PRAGMA journal_mode=WAL")
    c.execute("PRAGMA busy_timeout=15000")
    return c


SLA_HOURS = {"low":72, "medium":24, "high":8, "critical":2}
CATEGORY_LABELS = {
    "electricity":"Электрика", "furniture":"Мебель", "tech":"Техника",
    "heating":"Отопление", "plumbing":"Сантехника", "lighting":"Освещение",
    "windows_doors":"Двери и окна", "cleaning":"Уборка", "other":"Другое"
}
CATEGORY_KEYS = tuple(CATEGORY_LABELS.keys())
LOGIN_ATTEMPTS = {}
LOGIN_WINDOW = 60
LOGIN_LIMIT = 8

def now_iso():
    return datetime.now().isoformat(timespec="seconds")

def add_audit(c, request_id, user_id, action, details, created_at=None):
    c.execute("INSERT INTO audit_log(request_id,user_id,action,details,created_at) VALUES(?,?,?,?,?)",
              (request_id, user_id, action, details, created_at or now_iso()))

def add_notification(c, user_id, request_id, title, body, created_at=None):
    if not user_id:
        return
    c.execute("INSERT INTO notifications(user_id,request_id,title,body,created_at) VALUES(?,?,?,?,?)",
              (user_id, request_id, title, body, created_at or now_iso()))

def clean_ai_error(message):
    text = re.sub(r"Bearer\s+[A-Za-z0-9._-]+", "Bearer [redacted]", str(message or ""))
    text = re.sub(r"(?:sk|tc)-[A-Za-z0-9._-]{12,}", "[redacted]", text)
    return text[:900]

def sla_due(created_at: str, priority: str):
    try:
        dt = datetime.fromisoformat(created_at)
        return (dt + timedelta(hours=SLA_HOURS.get(priority,24))).isoformat(timespec="seconds")
    except Exception:
        return None

def enrich_request(row):
    item = dict(row)
    item["sla_hours"] = SLA_HOURS.get(item.get("priority") or "medium", 24)
    item["sla_due_at"] = sla_due(item.get("created_at") or "", item.get("priority") or "medium")
    if (item.get("status") == "done" and item.get("confirmed_at")) or item.get("status") == "rejected":
        item["sla_state"] = "closed"
    else:
        due = item.get("sla_due_at")
        try:
            item["sla_state"] = "overdue" if due and datetime.fromisoformat(due) < datetime.now() else "on_time"
        except Exception:
            item["sla_state"] = "on_time"
    return item

def init():
    c = db()
    c.executescript("""
    CREATE TABLE IF NOT EXISTS login_limits(key TEXT PRIMARY KEY, attempts INTEGER NOT NULL, expires_at REAL NOT NULL);
    CREATE TABLE IF NOT EXISTS repair_attempts(
      id INTEGER PRIMARY KEY AUTOINCREMENT, request_id INTEGER NOT NULL, worker_id INTEGER,
      started_at TEXT, finished_at TEXT, outcome TEXT NOT NULL, comment TEXT, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS equipment(
      id INTEGER PRIMARY KEY AUTOINCREMENT,room_id INTEGER NOT NULL,name TEXT NOT NULL,
      details TEXT DEFAULT '',condition TEXT DEFAULT 'ok',last_checked TEXT);
    CREATE TABLE IF NOT EXISTS inventory(
      id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT UNIQUE NOT NULL,quantity REAL NOT NULL DEFAULT 0,
      unit TEXT NOT NULL DEFAULT 'шт',min_quantity REAL NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS maintenance_plans(
      id INTEGER PRIMARY KEY AUTOINCREMENT,room_id INTEGER NOT NULL,title TEXT NOT NULL,
      due_at TEXT NOT NULL,done_at TEXT,notes TEXT DEFAULT '');
    CREATE TABLE IF NOT EXISTS ai_usage(
      id INTEGER PRIMARY KEY AUTOINCREMENT,request_id INTEGER,model TEXT,created_at TEXT NOT NULL,
      status TEXT NOT NULL,latency_ms INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS users(
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
      login TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('teacher','worker','admin','director'))
    );
    CREATE TABLE IF NOT EXISTS rooms(
      id INTEGER PRIMARY KEY AUTOINCREMENT, number TEXT UNIQUE NOT NULL,
      floor INTEGER NOT NULL, status TEXT DEFAULT 'ok'
    );
    CREATE TABLE IF NOT EXISTS requests(
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, worker_id INTEGER,
      room_id INTEGER NOT NULL, description TEXT, image TEXT,
      detected_problem TEXT, tools TEXT, status TEXT DEFAULT 'new', priority TEXT DEFAULT 'medium',
      after_image TEXT, resolution TEXT, materials TEXT,
      created_at TEXT NOT NULL, completed_at TEXT, rating INTEGER, rating_comment TEXT,
      ai_category TEXT, ai_priority TEXT, ai_confidence REAL, ai_tools TEXT, ai_materials TEXT,
      ai_checks TEXT, ai_actions TEXT, ai_safety TEXT
    );
    CREATE TABLE IF NOT EXISTS audit_log(
      id INTEGER PRIMARY KEY AUTOINCREMENT, request_id INTEGER, user_id INTEGER,
      action TEXT NOT NULL, details TEXT, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS comments(
      id INTEGER PRIMARY KEY AUTOINCREMENT, request_id INTEGER NOT NULL, user_id INTEGER NOT NULL, body TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS user_settings(
      user_id INTEGER PRIMARY KEY, notifications INTEGER DEFAULT 1, compact INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS notifications(
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, request_id INTEGER,
      title TEXT NOT NULL, body TEXT NOT NULL, read INTEGER DEFAULT 0, created_at TEXT NOT NULL
    );
    """)
    schema = c.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='users'").fetchone()
    if schema and 'director' not in (schema['sql'] or ''):
        c.execute("ALTER TABLE users RENAME TO users_old")
        c.execute("CREATE TABLE users(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, login TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('teacher','worker','admin','director')))" )
        c.execute("INSERT INTO users(id,name,login,password_hash,role) SELECT id,name,login,password_hash,role FROM users_old")
        c.execute("DROP TABLE users_old")
        c.commit()

    if DEMO_MODE and c.execute("SELECT COUNT(*) FROM users").fetchone()[0] == 0:
        demo = [("Анна Иванова", "teacher", "teacher"), ("Алексей Петров", "worker", "worker"), ("Администратор", "admin", "admin")]
        for name, login, role in demo:
            c.execute("INSERT INTO users(name,login,password_hash,role) VALUES(?,?,?,?)", (name, login, hash_password("1234"), role))
    # One-time production administrator creation (never resets an existing password).
    admin_login = os.getenv("SCHOOL_PLUS_ADMIN_LOGIN", "").strip()
    admin_password = os.getenv("SCHOOL_PLUS_ADMIN_PASSWORD", "")
    if admin_login and admin_password and not c.execute("SELECT 1 FROM users WHERE role='admin'").fetchone():
        if len(admin_login) < 3 or len(admin_password) < 12:
            raise RuntimeError("Admin login must be 3+ chars and password 12+ chars")
        try:
            c.execute("INSERT INTO users(name,login,password_hash,role) VALUES(?,?,?,?)",
                      ("Администратор", admin_login, hash_password(admin_password), "admin"))
        except sqlite3.IntegrityError:
            raise RuntimeError("Administrator login is already taken")
    if c.execute("SELECT COUNT(*) FROM rooms").fetchone()[0] == 0:
        c.executemany("INSERT INTO rooms(number,floor) VALUES(?,?)", [(f"{floor}{n:02}", floor) for floor in range(1, 5) for n in range(1, 9)])
    if DEMO_MODE and not c.execute("SELECT 1 FROM users WHERE login='director'").fetchone():
        c.execute("INSERT INTO users(name,login,password_hash,role) VALUES(?,?,?,?)", ("Директор школы", "director", hash_password("1234"), "director"))
    for col, typ, default in [("session_version","INTEGER","0")]:
        try: c.execute(f"ALTER TABLE users ADD COLUMN {col} {typ} DEFAULT {default}")
        except sqlite3.OperationalError: pass
    for col, typ, default in [("priority","TEXT","'medium'"),("after_image","TEXT","NULL"),("resolution","TEXT","NULL"),("materials","TEXT","NULL"),("rating","INTEGER","NULL"),("rating_comment","TEXT","NULL"),("category","TEXT","NULL"),("accepted_at","TEXT","NULL"),("started_at","TEXT","NULL"),("assigned_at","TEXT","NULL"),("repair_complexity","TEXT","NULL"),("estimated_minutes","INTEGER","NULL"),("ai_complexity","TEXT","NULL"),("ai_estimated_minutes","INTEGER","NULL"),("ai_specialist_required","TEXT","NULL"),("ai_category","TEXT","NULL"),("ai_priority","TEXT","NULL"),("ai_confidence","REAL","NULL"),("ai_tools","TEXT","NULL"),("ai_materials","TEXT","NULL"),("ai_checks","TEXT","NULL"),("ai_actions","TEXT","NULL"),("ai_safety","TEXT","NULL"),("ai_status","TEXT","NULL"),("ai_error","TEXT","NULL"),("ai_question","TEXT","NULL"),("ai_answer","TEXT","NULL"),("confirmed_at","TEXT","NULL"),("confirmed_by","INTEGER","NULL")]:
        try: c.execute(f"ALTER TABLE requests ADD COLUMN {col} {typ} DEFAULT {default}")
        except sqlite3.OperationalError: pass
    for idx in ("requests(user_id)", "requests(worker_id)", "requests(room_id)", "requests(status)",
                "notifications(user_id)", "audit_log(request_id)", "comments(request_id)"):
        c.execute(f"CREATE INDEX IF NOT EXISTS idx_{idx.replace('(', '_').replace(')', '')} ON {idx}")
    c.commit(); c.close()


init()


def token_for(user):
    return jwt.encode({"sub": str(user["id"]), "role": user["role"], "ver": int(user.get("session_version") or 0), "exp": datetime.now(timezone.utc) + timedelta(hours=12)}, SECRET, algorithm="HS256")


def current_user(authorization):
    token = (authorization or "").removeprefix("Bearer ").strip()
    if not token:
        raise HTTPException(401, "Требуется вход в систему")
    try:
        p = jwt.decode(token, SECRET, algorithms=["HS256"], options={"verify_sub": False})
        c = db(); u = c.execute("SELECT id,name,login,role,session_version FROM users WHERE id=?", (int(p["sub"]),)).fetchone(); c.close()
        if not u:
            raise HTTPException(401, "Пользователь не найден")
        if int(p.get("ver", 0)) != int(u["session_version"] or 0):
            raise HTTPException(401, "Сессия отозвана. Войдите снова")
        return dict(u)
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Сессия истекла. Войдите снова")
    except (jwt.InvalidTokenError, ValueError, TypeError, KeyError):
        raise HTTPException(401, "Недействительная сессия. Войдите снова")


class Login(BaseModel):
    login: str
    password: str


class Register(BaseModel):
    name: str
    login: str
    password: str
    role: str = "teacher"


class Status(BaseModel):
    status: str


@app.get("/")
def index():
    return FileResponse(BASE.parent / "frontend/index.html")


@app.get("/api/health")
def health():
    return {"ok": True, "service": "school-plus", "version": "2.1-defense"}


@app.post("/api/register")
def register(x: Register):
    name, login, password = x.name.strip(), x.login.strip(), x.password
    if len(name) < 2 or len(login) < 3 or len(password) < 6:
        raise HTTPException(400, "Заполните имя, логин и пароль не короче 6 символов")
    if x.role not in ("teacher", "worker"):
        raise HTTPException(400, "Недопустимая роль")
    if x.role == "worker" and (not ALLOW_WORKER_SIGNUP or not DEMO_MODE):
        raise HTTPException(403, "Регистрация работников отключена. Обратитесь к администратору")
    c = db()
    try:
        cur = c.execute("INSERT INTO users(name,login,password_hash,role) VALUES(?,?,?,?)", (name, login, hash_password(password), x.role))
        c.commit()
        u = {"id": cur.lastrowid, "name": name, "login": login, "role": x.role}
        return {"token": token_for(u), "user": u}
    except sqlite3.IntegrityError:
        raise HTTPException(409, "Такой логин уже существует")
    finally:
        c.close()


@app.post("/api/login")
def login(x: Login, request: Request):
    ip = request.client.host if request.client else 'local'
    login_name = x.login.strip().lower()[:100]
    key = hashlib.sha256((ip + ':' + login_name).encode()).hexdigest()
    current = time.time()
    c = db()
    state = c.execute('SELECT attempts,expires_at FROM login_limits WHERE key=?', (key,)).fetchone()
    if state and state['expires_at'] > current and state['attempts'] >= LOGIN_LIMIT:
        c.close(); raise HTTPException(429, 'Слишком много попыток входа. Повторите позже.')
    u = c.execute('SELECT * FROM users WHERE login=?', (x.login.strip(),)).fetchone()
    valid = verify_password(x.password, u['password_hash']) if u else verify_password(x.password, hash_password('not-the-password'))
    if not u or not valid:
        attempts = state['attempts'] + 1 if state and state['expires_at'] > current else 1
        c.execute('INSERT INTO login_limits(key,attempts,expires_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET attempts=excluded.attempts,expires_at=excluded.expires_at', (key,attempts,current+LOGIN_WINDOW))
        c.commit(); c.close()
        raise HTTPException(401, 'Неверный логин или пароль')
    c.execute('DELETE FROM login_limits WHERE key=?',(key,)); c.commit(); c.close()
    u = dict(u); u.pop('password_hash')
    return {'token': token_for(u), 'user': u}


@app.get("/api/me")
def me(authorization: str | None = Header(None)):
    return current_user(authorization)


@app.get("/api/rooms")
def rooms(floor: int | None = None):
    c = db()
    q = """SELECT r.*, COUNT(CASE WHEN q.status NOT IN ('done','rejected') THEN 1 END) active,
                  COUNT(q.id) total,
                  COUNT(CASE WHEN q.created_at >= ? THEN 1 END) recent,
                  COALESCE(MAX(CASE WHEN q.status NOT IN ('done','rejected') THEN
                      CASE q.priority WHEN 'critical' THEN 4 WHEN 'high' THEN 3 WHEN 'medium' THEN 2 ELSE 1 END END), 0) worst
           FROM rooms r LEFT JOIN requests q ON q.room_id=r.id"""
    args = [(datetime.now() - timedelta(days=30)).isoformat(timespec="seconds")]
    if floor is not None:
        if not -5 <= floor <= 100: raise HTTPException(400, "Недопустимый этаж")
        q += " WHERE r.floor=?"; args.append(floor)
    q += " GROUP BY r.id ORDER BY r.floor,r.number"
    out = [dict(x) for x in c.execute(q, args).fetchall()]; c.close()
    for x in out: x["status"] = "issue" if x["active"] else "ok"
    return out


def process_upload(upload: UploadFile):
    if not upload or not upload.filename:
        return None
    ext = Path(upload.filename).suffix.lower()
    allowed = {".jpg": {"image/jpeg"}, ".jpeg": {"image/jpeg"}, ".png": {"image/png"}, ".webp": {"image/webp"}}
    if ext not in allowed:
        raise HTTPException(400, "Поддерживаются только JPG, PNG и WebP")
    if upload.content_type and upload.content_type.lower() not in allowed[ext]:
        raise HTTPException(400, "Тип файла не совпадает с расширением изображения")
    raw = upload.file.read()
    if len(raw) > 8 * 1024 * 1024:
        raise HTTPException(400, "Фото должно быть меньше 8 МБ")
    try:
        from io import BytesIO
        im = Image.open(BytesIO(raw)); im.verify(); im = Image.open(BytesIO(raw))
        if im.width < 120 or im.height < 120:
            raise HTTPException(400, "Фото должно быть не меньше 120×120 пикселей")
        max_side = 2200
        if max(im.size) > max_side:
            scale = max_side / max(im.size)
            im = im.resize((max(1, int(im.width*scale)), max(1, int(im.height*scale))), Image.Resampling.LANCZOS)
        if ext in {".jpg", ".jpeg"}:
            if im.mode not in ("RGB", "L"): im = im.convert("RGB")
            out_ext, fmt, kw = ".jpg", "JPEG", {"quality":88,"optimize":True}
        elif ext == ".png":
            if im.mode not in ("RGB", "RGBA", "L"): im = im.convert("RGBA")
            out_ext, fmt, kw = ".png", "PNG", {"optimize":True}
        else:
            if im.mode not in ("RGB", "RGBA"): im = im.convert("RGB")
            out_ext, fmt, kw = ".webp", "WEBP", {"quality":88,"method":6}
        filename=f"{uuid.uuid4().hex}{out_ext}"; path=UPLOADS/filename
        im.save(path, format=fmt, **kw)
        return filename
    except HTTPException: raise
    except Exception: raise HTTPException(400, "Файл не является корректным изображением")

def _ai_json(text: str):
    text = (text or "").strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.I)
        text = re.sub(r"\s*```$", "", text).strip()
    try:
        return json.loads(text)
    except Exception:
        a, b = text.find("{"), text.rfind("}")
        if a >= 0 and b > a:
            try:
                return json.loads(text[a:b+1])
            except Exception:
                pass
    return None


def _ai_text_from_response(payload):
    """Extract text from Responses API or Chat Completions compatible payload."""
    if isinstance(payload, dict):
        if isinstance(payload.get("output_text"), str):
            return payload["output_text"]
        choices = payload.get("choices")
        if isinstance(choices, list) and choices:
            msg = (choices[0] or {}).get("message", {})
            content = msg.get("content")
            if isinstance(content, str):
                return content
            if isinstance(content, list):
                parts = []
                for part in content:
                    if isinstance(part, dict):
                        t = part.get("text")
                        if isinstance(t, str):
                            parts.append(t)
                if parts:
                    return "".join(parts)
        output = payload.get("output")
        if isinstance(output, list):
            parts = []
            for item in output:
                if not isinstance(item, dict):
                    continue
                content = item.get("content")
                if isinstance(content, list):
                    for part in content:
                        if isinstance(part, dict):
                            t = part.get("text") or part.get("output_text")
                            if isinstance(t, str):
                                parts.append(t)
            if parts:
                return "".join(parts)
    return ""


def _ai_http_json(endpoint, body):
    """Small standard-library HTTP client so DarkAPI works without a special SDK."""
    import urllib.request
    import urllib.error
    req = urllib.request.Request(
        endpoint,
        data=json.dumps(body, ensure_ascii=False).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {AI_API_KEY}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=90) as r:
            raw = r.read().decode("utf-8", errors="replace")
            return json.loads(raw)
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", errors="replace")
        detail = raw[:700]
        raise RuntimeError(f"HTTP {e.code}: {detail}")
    except Exception as e:
        raise RuntimeError(str(e)[:700])


def safe_ai_confidence(x):
    try: return max(0.0,min(1.0,float(x)))
    except (ValueError,TypeError,OverflowError): return 0.0

def safe_ai_minutes(x):
    try: return max(0,min(1440,int(x or 0)))
    except (ValueError,TypeError,OverflowError): return 0

def ai_string_list(value, limit=12):
    if not isinstance(value, list): return []
    return [str(x).strip()[:180] for x in value[:limit] if isinstance(x, (str, int, float)) and str(x).strip()]

def _normalize_ai(data_obj):
    if not isinstance(data_obj, dict): raise ValueError("Ответ ИИ должен быть объектом JSON")
    allowed_categories = {"electricity","furniture","tech","heating","plumbing","lighting","windows_doors","cleaning","other"}
    allowed_priority = {"low","medium","high","critical"}
    result = {
        "problem": str(data_obj.get("problem") or "Не удалось уверенно определить проблему по фото.")[:500],
        "category": str(data_obj.get("category") or "other"),
        "priority": str(data_obj.get("priority") or "medium"),
        "confidence": safe_ai_confidence(data_obj.get("confidence")),
        "tools": ai_string_list(data_obj.get("tools"),12),
        "materials": ai_string_list(data_obj.get("materials"),12),
        "checks": ai_string_list(data_obj.get("checks"),12),
        "recommended_actions": ai_string_list(data_obj.get("recommended_actions"),12),
        "safety_notes": ai_string_list(data_obj.get("safety_notes"),8),
        "complexity": str(data_obj.get("complexity") or "medium"),
        "estimated_minutes": safe_ai_minutes(data_obj.get("estimated_minutes")),
        "specialist_required": str(data_obj.get("specialist_required") or "Не обязательно")[:80],
        "question": str(data_obj.get("question") or "")[:300],
        "ai_enabled": True,
        "ai_status": "ok",
        "ai_error": ""
    }
    if result["priority"] not in allowed_priority:
        result["priority"] = "medium"
    if result["category"] not in allowed_categories:
        result["category"] = "other"
    if result["complexity"] not in {"low","medium","high"}: result["complexity"]="medium"
    result["estimated_minutes"] = max(0, min(1440, result["estimated_minutes"]))
    return result


def analyze_image(path, description=""):
    unavailable = {
        "problem": "",
        "category": None, "priority": None, "confidence": None,
        "tools": [], "materials": [], "checks": [],
        "recommended_actions": [], "safety_notes": [], "question": "",
        "ai_enabled": False, "ai_status": "unavailable",
        "ai_error": "AI-анализ не выполнен."
    }
    if not AI_API_KEY:
        unavailable["ai_error"] = "Не задан ключ DarkAPI. Заполните DARKAPI_API_KEY или OPENAI_API_KEY в backend/.env."
        return unavailable

    try:
        mime = mimetypes.guess_type(str(path))[0] or "image/jpeg"
        data = base64.b64encode(Path(path).read_bytes()).decode("ascii")
        image_url = f"data:{mime};base64,{data}"

        prompt = f"""Ты — визуальный помощник школьной службы эксплуатации.
Проанализируй именно ПРЕДМЕТ И НЕИСПРАВНОСТЬ, которые видны на фотографии.

Описание учителя: {description or 'не указано'}

Главная задача: дать работнику практичную предварительную подготовку к ремонту.
Если неисправность явно видна на фото, назови её конкретно. Не используй "other" и
нулевую уверенность просто потому, что диагностика не абсолютна. Уверенность отражает
насколько хорошо проблема видна именно на фотографии.

Например, если на фото дверь сошла с петель, нужно написать именно это, выбрать
windows_doors, а не общий "требуется осмотр", и указать реальные инструменты,
материалы, проверки и порядок безопасных действий.

Верни ТОЛЬКО валидный JSON без markdown:
{{
  "problem": "конкретное описание видимой проблемы",
  "category": "electricity|furniture|tech|heating|plumbing|lighting|windows_doors|cleaning|other",
  "priority": "low|medium|high|critical",
  "confidence": 0.0,
  "tools": ["..."],
  "materials": ["..."],
  "checks": ["..."],
  "recommended_actions": ["..."],
  "safety_notes": ["..."],
  "complexity": "low|medium|high",
  "estimated_minutes": 30,
  "specialist_required": "Не обязательно|Желательно|Обязательно",
  "question": "один короткий уточняющий вопрос, если он действительно нужен; иначе пустая строка"
}}

Правила:
- Не выдумывай скрытые повреждения.
- confidence — лишь субъективная оценка видимости дефекта, не точность диагноза. Не завышай её.
- При недостатке данных задай один конкретный вопрос учителю без предложения опасных проверок.
- Инструменты и материалы должны соответствовать конкретной неисправности.
- Для тяжёлой двери, стекла, электричества и других опасных работ обязательно укажи
  соответствующее предупреждение.
- Оцени сложность ремонта и примерное время только ориентировочно.
- Если нужен профильный специалист, укажи это явно.
- Это предварительная рекомендация, окончательное решение принимает работник после осмотра.
"""

        responses_body = {
            "model": AI_MODEL,
            "input": [{
                "role": "user",
                "content": [
                    {"type": "input_text", "text": prompt},
                    {"type": "input_image", "image_url": image_url, "detail": "high"}
                ]
            }]
        }

        errors = []
        # First try Responses API, which is the intended modern format.
        try:
            payload = _ai_http_json(f"{AI_BASE_URL}/responses", responses_body)
            text = _ai_text_from_response(payload)
            obj = _ai_json(text)
            if isinstance(obj, dict):
                return _normalize_ai(obj)
            errors.append("Responses API: ответ не содержит валидный JSON")
        except Exception as e:
            errors.append(f"Responses API: {str(e)[:350]}")

        # DarkAPI is OpenAI-compatible in its agent tooling; if Responses is not
        # exposed for this account, fall back to the widely supported chat endpoint.
        chat_body = {
            "model": AI_MODEL,
            "messages": [{
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {"type": "image_url", "image_url": {"url": image_url, "detail": "high"}}
                ]
            }],
            "temperature": 0.1
        }
        try:
            payload = _ai_http_json(f"{AI_BASE_URL}/chat/completions", chat_body)
            text = _ai_text_from_response(payload)
            obj = _ai_json(text)
            if isinstance(obj, dict):
                return _normalize_ai(obj)
            errors.append("Chat Completions: ответ не содержит валидный JSON")
        except Exception as e:
            errors.append(f"Chat Completions: {str(e)[:350]}")

        raise RuntimeError(" | ".join(errors))

    except Exception as e:
        unavailable["ai_error"] = clean_ai_error(e)
        return unavailable


def schedule_ai_analysis(rid, filename, description):
    """Demo worker: persist request first. Pending rows can be retried after restart."""
    import threading
    def job():
        started=time.monotonic()
        try:
            result=analyze_image(UPLOADS / filename, description)
            status=result.get('ai_status','error')
        except Exception as exc:
            result={'ai_status':'error','ai_error':clean_ai_error(exc)}
            status='error'
        c=db()
        try:
            c.execute("""UPDATE requests SET detected_problem=?,tools=?,ai_category=?,ai_priority=?,ai_confidence=?,ai_tools=?,ai_materials=?,ai_checks=?,ai_actions=?,ai_safety=?,ai_complexity=?,ai_estimated_minutes=?,ai_specialist_required=?,ai_question=?,ai_status=?,ai_error=? WHERE id=?""",
                (result.get('problem',''),'; '.join(result.get('tools',[])),result.get('category'),result.get('priority'),result.get('confidence'),json.dumps(result.get('tools',[]),ensure_ascii=False),json.dumps(result.get('materials',[]),ensure_ascii=False),json.dumps(result.get('checks',[]),ensure_ascii=False),json.dumps(result.get('recommended_actions',[]),ensure_ascii=False),json.dumps(result.get('safety_notes',[]),ensure_ascii=False),result.get('complexity'),result.get('estimated_minutes'),result.get('specialist_required'),result.get('question'),status,clean_ai_error(result.get('ai_error')),rid))
            c.execute('INSERT INTO ai_usage(request_id,model,created_at,status,latency_ms) VALUES(?,?,?,?,?)',(rid,AI_MODEL,now_iso(),status,int((time.monotonic()-started)*1000)))
            add_audit(c,rid,None,'ai_analysis', 'Анализ завершён: '+status)
            c.commit()
        finally: c.close()
    threading.Thread(target=job,daemon=True,name=f'ai-request-{rid}').start()

@app.post("/api/requests")
def create_request(authorization: str | None = Header(None), room_id: int = Form(...), description: str = Form(""), priority: str = Form("medium"), category: str = Form("other"), image: UploadFile | None = File(None)):
    u = current_user(authorization)
    if u["role"] not in ("teacher", "admin"):
        raise HTTPException(403, "Только учитель или администратор может создать заявку")
    description = description.strip()
    if priority not in ('low','medium','high','critical'): raise HTTPException(400, 'Недопустимый приоритет')
    if category not in CATEGORY_KEYS: raise HTTPException(400, 'Недопустимая категория')
    if not description and not image:
        raise HTTPException(400, "Добавьте описание или фото проблемы")
    c = db()
    room_row = c.execute("SELECT id,number FROM rooms WHERE id=?", (room_id,)).fetchone()
    if not room_row:
        c.close(); raise HTTPException(404, "Кабинет не найден")
    filename = None; problem = ""; tools = ""; ai = {'ai_status':'unavailable','ai_error':'Нет фотографии'}
    if image and image.filename:
        filename = process_upload(image)
        ai = {"ai_status": "pending" if AI_API_KEY else "unavailable", "ai_error": "" if AI_API_KEY else "API-ключ не задан"}
    now = datetime.now().isoformat(timespec="seconds")
    final_category = ai.get("category") or category
    cur = c.execute("""INSERT INTO requests(user_id,room_id,description,image,detected_problem,tools,status,priority,created_at,category,repair_complexity,estimated_minutes,ai_complexity,ai_estimated_minutes,ai_specialist_required,ai_category,ai_priority,ai_confidence,ai_tools,ai_materials,ai_checks,ai_actions,ai_safety,ai_status,ai_error,ai_question)
                    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""", (u["id"], room_id, description, filename, problem, tools, "new", priority, now, final_category, ai.get("complexity"), ai.get("estimated_minutes"), ai.get("complexity"), ai.get("estimated_minutes"), ai.get("specialist_required"), ai.get("category"), ai.get("priority"), ai.get("confidence"), json.dumps(ai.get("tools",[]),ensure_ascii=False), json.dumps(ai.get("materials",[]),ensure_ascii=False), json.dumps(ai.get("checks",[]),ensure_ascii=False), json.dumps(ai.get("recommended_actions",[]),ensure_ascii=False), json.dumps(ai.get("safety_notes",[]),ensure_ascii=False), ai.get("ai_status"), ai.get("ai_error"), ai.get("question")))
    rid = cur.lastrowid
    c.execute("INSERT INTO audit_log(request_id,user_id,action,details,created_at) VALUES(?,?,?,?,?)", (rid,u['id'],'created','Заявка создана',now))
    workers=c.execute("SELECT id FROM users WHERE role='worker'").fetchall()
    for w in workers:
        enabled = c.execute('SELECT COALESCE(notifications,1) FROM user_settings WHERE user_id=?',(w['id'],)).fetchone()
        if not enabled or enabled[0]: c.execute("INSERT INTO notifications(user_id,request_id,title,body,created_at) VALUES(?,?,?,?,?)", (w['id'],rid,'Новая заявка',f'Кабинет {room_row["number"]}. Требуется внимание.',now))
    c.commit(); c.close()
    if filename and AI_API_KEY:
        schedule_ai_analysis(rid, filename, description)
    return {"id": rid, "ai": {"enabled": bool(ai.get("ai_enabled")), "status": ai.get("ai_status"), "error": ai.get("ai_error"), "problem": ai.get("problem"), "category": ai.get("category"), "priority": ai.get("priority"), "confidence": ai.get("confidence"), "tools": ai.get("tools",[]), "materials": ai.get("materials",[]), "checks": ai.get("checks",[]), "recommended_actions": ai.get("recommended_actions",[]), "safety_notes": ai.get("safety_notes",[]),"question": ai.get("question","")}}


@app.get("/api/requests")
def list_requests(authorization: str | None = Header(None), mine: bool = False):
    u = current_user(authorization); c = db()
    q = """SELECT q.*, r.number room, r.floor, cu.name creator, wu.name worker
         FROM requests q JOIN rooms r ON r.id=q.room_id
         LEFT JOIN users cu ON cu.id=q.user_id LEFT JOIN users wu ON wu.id=q.worker_id"""
    args = []
    if u["role"] == "teacher" or mine:
        q += " WHERE q.user_id=?"; args.append(u["id"])
    elif u["role"] == "worker":
        q += " WHERE (q.status IN ('new','rework') AND q.worker_id IS NULL) OR q.worker_id=?"; args.append(u["id"])
    q += " ORDER BY CASE q.status WHEN 'new' THEN 0 WHEN 'rework' THEN 0 WHEN 'accepted' THEN 1 WHEN 'working' THEN 2 ELSE 3 END, q.id DESC"
    rows = [enrich_request(x) for x in c.execute(q, args).fetchall()]; c.close()
    return rows


@app.get("/api/requests/{rid}")
def get_request(rid: int, authorization: str | None = Header(None)):
    u = current_user(authorization); c = db()
    x = c.execute("""SELECT q.*,r.number room,r.floor,cu.name creator,wu.name worker
                   FROM requests q JOIN rooms r ON r.id=q.room_id
                   LEFT JOIN users cu ON cu.id=q.user_id LEFT JOIN users wu ON wu.id=q.worker_id
                   WHERE q.id=?""", (rid,)).fetchone(); c.close()
    if not x: raise HTTPException(404, "Заявка не найдена")
    item = enrich_request(x)
    if u["role"] == "teacher" and item["user_id"] != u["id"]:
        raise HTTPException(403, "Эта заявка недоступна")
    if u["role"] == "worker" and item["worker_id"] not in (None, u["id"]):
        raise HTTPException(403, "Заявка закреплена за другим работником")
    return item


@app.get('/api/rooms/{room_id}/qr')
def room_qr(room_id: int, base: str = '', authorization: str | None = Header(None)):
    current_user(authorization)
    c = db(); row = c.execute('SELECT id,number,floor FROM rooms WHERE id=?', (room_id,)).fetchone(); c.close()
    if not row: raise HTTPException(404, 'Кабинет не найден')
    try:
        import qrcode
        from io import BytesIO
    except ImportError:
        raise HTTPException(500, 'QR-модуль не установлен')
    base = base.strip().rstrip('/')
    if base and not re.match(r'^https?://[\w.:\-\[\]]+$', base): raise HTTPException(400, 'Недопустимый адрес')
    payload = f"{base}/?room={row['id']}" if base else f"SCHOOL+ | Кабинет {row['number']} | room={row['id']}"
    buf = BytesIO(); qrcode.make(payload).save(buf, format='PNG'); buf.seek(0)
    return StreamingResponse(buf, media_type='image/png')

@app.get("/api/uploads/{name}")
def upload(name: str, authorization: str | None = Header(None)):
    u = current_user(authorization)
    safe = Path(name).name
    p = UPLOADS / safe
    if not p.is_file(): raise HTTPException(404, "Файл не найден")
    c = db(); row = c.execute("SELECT user_id,worker_id FROM requests WHERE image=? OR after_image=?", (safe, safe)).fetchone(); c.close()
    if not row: raise HTTPException(404, "Файл не найден")
    if u["role"] == "teacher" and row["user_id"] != u["id"]: raise HTTPException(403, "Нет доступа к файлу")
    if u["role"] == "worker" and row["worker_id"] not in (None, u["id"]): raise HTTPException(403, "Нет доступа к файлу")
    return FileResponse(p, headers={"Cache-Control": "private, max-age=3600"})


@app.patch('/api/requests/{rid}/cancel')
def cancel_request(rid:int, authorization: str | None = Header(None)):
    u=current_user(authorization); c=db(); row=c.execute('SELECT q.*,r.number room_number FROM requests q JOIN rooms r ON r.id=q.room_id WHERE q.id=?',(rid,)).fetchone()
    if not row: c.close(); raise HTTPException(404,'Заявка не найдена')
    if u['role']!='teacher' or row['user_id']!=u['id']: c.close(); raise HTTPException(403,'Отменить можно только свою заявку')
    if row['status']!='new': c.close(); raise HTTPException(400,'Отменить можно только новую заявку')
    now=now_iso(); c.execute("UPDATE requests SET status='rejected' WHERE id=?",(rid,)); add_audit(c,rid,u['id'],'cancelled','Заявка отменена автором',now)
    if row['worker_id']: add_notification(c,row['worker_id'],rid,'Заявка отменена',f'Заявка #{rid} отменена автором.',now)
    c.commit(); c.close(); return {'ok':True}

@app.post('/api/requests/{rid}/comments')
def add_comment(rid:int, body: dict, authorization: str | None = Header(None)):
    u=current_user(authorization); text=str(body.get('body','')).strip()
    if not text or len(text)>1000: raise HTTPException(400,'Комментарий должен содержать от 1 до 1000 символов')
    c=db(); row=c.execute('SELECT user_id,worker_id FROM requests WHERE id=?',(rid,)).fetchone()
    if not row: c.close(); raise HTTPException(404,'Заявка не найдена')
    if u['role']=='teacher' and row['user_id']!=u['id']: c.close(); raise HTTPException(403,'Нет доступа')
    if u['role']=='worker' and row['worker_id'] not in (None,u['id']): c.close(); raise HTTPException(403,'Нет доступа')
    now=now_iso(); c.execute('INSERT INTO comments(request_id,user_id,body,created_at) VALUES(?,?,?,?)',(rid,u['id'],text,now)); add_audit(c,rid,u['id'],'comment','Комментарий добавлен',now)
    targets=[x for x in (row['user_id'],row['worker_id']) if x and x!=u['id']]
    for tid in set(targets): c.execute("INSERT INTO notifications(user_id,request_id,title,body,created_at) VALUES(?,?,?,?,?)",(tid,rid,'Новый комментарий',text[:120],now))
    c.commit(); c.close(); return {'ok':True}

@app.get('/api/requests/{rid}/comments')
def get_comments(rid:int, authorization: str | None = Header(None)):
    u=current_user(authorization); c=db(); row=c.execute('SELECT user_id,worker_id FROM requests WHERE id=?',(rid,)).fetchone()
    if not row: c.close(); raise HTTPException(404,'Заявка не найдена')
    if u['role']=='teacher' and row['user_id']!=u['id']: c.close(); raise HTTPException(403,'Нет доступа')
    if u['role']=='worker' and row['worker_id'] not in (None,u['id']): c.close(); raise HTTPException(403,'Нет доступа')
    out=[dict(x) for x in c.execute('SELECT c.*,u.name FROM comments c JOIN users u ON u.id=c.user_id WHERE c.request_id=? ORDER BY c.id',(rid,)).fetchall()]; c.close(); return out

@app.post('/api/requests/{rid}/rating')
def rate_request(rid:int, body: dict, authorization: str | None = Header(None)):
    u=current_user(authorization); rating=int(body.get('rating',0)) if str(body.get('rating',0)).isdigit() else 0; comment=str(body.get('comment','')).strip()
    if rating<1 or rating>5: raise HTTPException(400,'Оценка от 1 до 5')
    c=db(); row=c.execute('SELECT user_id,status FROM requests WHERE id=?',(rid,)).fetchone()
    if not row or row['user_id']!=u['id']: c.close(); raise HTTPException(403,'Оценить можно только свою заявку')
    if row['status']!='done': c.close(); raise HTTPException(400,'Оценить можно после завершения')
    c.execute('UPDATE requests SET rating=?,rating_comment=? WHERE id=?',(rating,comment[:500],rid)); c.commit(); c.close(); return {'ok':True}

@app.get('/api/search')
def search(authorization: str | None = Header(None), q:str=''):
    u=current_user(authorization); q=q.strip(); c=db()
    if not q: c.close(); return []
    like=f'%{q}%'; sql='SELECT q.id,q.status,q.priority,q.description,r.number room,cu.name creator,wu.name worker FROM requests q JOIN rooms r ON r.id=q.room_id LEFT JOIN users cu ON cu.id=q.user_id LEFT JOIN users wu ON wu.id=q.worker_id WHERE (CAST(q.id AS TEXT) LIKE ? OR r.number LIKE ? OR q.description LIKE ? OR cu.name LIKE ? OR wu.name LIKE ?)' ; args=[like]*5
    if u['role']=='teacher': sql+=' AND q.user_id=?'; args.append(u['id'])
    elif u['role']=='worker': sql+=" AND ((q.status IN ('new','rework') AND q.worker_id IS NULL) OR q.worker_id=?)"; args.append(u['id'])
    sql+=' ORDER BY q.id DESC LIMIT 50'; out=[enrich_request(x) for x in c.execute(sql,args).fetchall()]; c.close(); return out

@app.get('/api/profile')
def profile_data(authorization: str | None = Header(None)):
    u=current_user(authorization); c=db(); x=c.execute('SELECT id,name,login,role FROM users WHERE id=?',(u['id'],)).fetchone(); s=c.execute('SELECT notifications,compact FROM user_settings WHERE user_id=?',(u['id'],)).fetchone(); c.close(); return {'user':dict(x),'settings':dict(s) if s else {'notifications':1,'compact':0}}

@app.patch('/api/profile/password')
def change_password(body: dict, authorization: str | None = Header(None)):
    u=current_user(authorization); old=str(body.get('old_password','')); new=str(body.get('new_password',''))
    if len(new)<6: raise HTTPException(400,'Новый пароль должен быть не короче 6 символов')
    c=db(); row=c.execute('SELECT password_hash FROM users WHERE id=?',(u['id'],)).fetchone()
    if not row or not verify_password(old,row['password_hash']): c.close(); raise HTTPException(400,'Старый пароль указан неверно')
    c.execute('UPDATE users SET password_hash=?,session_version=session_version+1 WHERE id=?',(hash_password(new),u['id'])); c.commit(); c.close(); return {'ok':True,'reauth_required':True}

@app.patch('/api/profile/settings')
def profile_settings(body: dict, authorization: str | None = Header(None)):
    u=current_user(authorization); nv=1 if body.get('notifications',True) else 0; cv=1 if body.get('compact',False) else 0; c=db(); c.execute('INSERT INTO user_settings(user_id,notifications,compact) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET notifications=excluded.notifications,compact=excluded.compact',(u['id'],nv,cv)); c.commit(); c.close(); return {'ok':True}

@app.get('/api/admin/requests')
def admin_requests(authorization: str | None = Header(None), status:str='all', priority:str='all', category:str='all', floor:int=0):
    u=current_user(authorization)
    if u['role']!='admin': raise HTTPException(403,'Только администратор')
    c=db(); sql='SELECT q.*,r.number room,r.floor,cu.name creator,wu.name worker FROM requests q JOIN rooms r ON r.id=q.room_id LEFT JOIN users cu ON cu.id=q.user_id LEFT JOIN users wu ON wu.id=q.worker_id WHERE 1=1'; args=[]
    if status!='all': sql+=' AND q.status=?'; args.append(status)
    if priority!='all': sql+=' AND q.priority=?'; args.append(priority)
    if category!='all': sql+=' AND q.category=?'; args.append(category)
    if floor: sql+=' AND r.floor=?'; args.append(floor)
    sql+=' ORDER BY q.id DESC'; out=[enrich_request(x) for x in c.execute(sql,args).fetchall()]; c.close(); return out

def label_status(s):
    return {'new':'Новая','rework':'На доработке','accepted':'Принята','working':'В работе','done':'Выполнена','rejected':'Отклонена'}.get(s,s)

@app.get('/api/notifications')
def notifications(authorization: str | None = Header(None)):
    u=current_user(authorization); c=db(); now=datetime.now();
    # Generate at most one SLA warning per request/user in a six-hour window.
    rows = c.execute("SELECT id,user_id,worker_id,created_at,priority,status FROM requests WHERE status NOT IN ('done','rejected')").fetchall()
    target_ids = {u['id']}
    for r in rows:
        if u['role']=='worker' and r['worker_id']!=u['id'] and r['status']!='new':
            continue
        due=sla_due(r['created_at'],r['priority'])
        if not due: continue
        try: delta=(datetime.fromisoformat(due)-now).total_seconds()/3600
        except Exception: continue
        if delta <= 2:
            title='SLA просрочен' if delta < 0 else 'SLA скоро истекает'
            body=(f'Заявка #{r["id"]}: срок SLA уже превышен.' if delta < 0 else f'Заявка #{r["id"]}: до срока SLA менее 2 часов.')
            exists=c.execute("SELECT 1 FROM notifications WHERE user_id=? AND request_id=? AND title=? AND created_at>=? LIMIT 1",(u['id'],r['id'],title,(now-timedelta(hours=6)).isoformat(timespec='seconds'))).fetchone()
            if not exists: add_notification(c,u['id'],r['id'],title,body)
    c.commit()
    out=[dict(x) for x in c.execute("SELECT * FROM notifications WHERE user_id=? ORDER BY id DESC LIMIT 40",(u['id'],)).fetchall()]; c.close(); return out

@app.patch('/api/notifications/read')
def notifications_read(authorization: str | None = Header(None)):
    u=current_user(authorization); c=db(); c.execute("UPDATE notifications SET read=1 WHERE user_id=?",(u['id'],)); c.commit(); c.close(); return {'ok':True}

@app.get('/api/requests/{rid}/history')
def request_history(rid:int, authorization: str | None = Header(None)):
    u=current_user(authorization); c=db(); row=c.execute('SELECT user_id,worker_id FROM requests WHERE id=?',(rid,)).fetchone()
    if not row: c.close(); raise HTTPException(404,'Заявка не найдена')
    if u['role']=='teacher' and row['user_id']!=u['id']: c.close(); raise HTTPException(403,'Нет доступа')
    if u['role']=='worker' and row['worker_id'] not in (None,u['id']): c.close(); raise HTTPException(403,'Заявка закреплена за другим работником')
    out=[dict(x) for x in c.execute("SELECT a.*,u.name FROM audit_log a LEFT JOIN users u ON u.id=a.user_id WHERE request_id=? ORDER BY a.id",(rid,)).fetchall()]; c.close(); return out

@app.post('/api/requests/{rid}/complete')
def complete_request(rid:int, authorization: str | None = Header(None), resolution:str=Form(''), materials:str=Form(''), after_image:UploadFile|None=File(None)):
    u=current_user(authorization)
    if u['role'] not in ('worker','admin'): raise HTTPException(403,'Недостаточно прав')
    c=db(); row=c.execute('SELECT * FROM requests WHERE id=?',(rid,)).fetchone()
    if not row: c.close(); raise HTTPException(404,'Заявка не найдена')
    if u['role']=='worker' and row['worker_id'] not in (None,u['id']): c.close(); raise HTTPException(403,'Заявка закреплена за другим работником')
    if row['status']!='working': c.close(); raise HTTPException(400,'Сначала переведите заявку в работу')
    if not resolution.strip():
        c.close(); raise HTTPException(400,'Перед завершением укажите результат работы')
    if not materials.strip():
        c.close(); raise HTTPException(400,'Укажите материалы или инструменты')
    if not after_image or not after_image.filename:
        c.close(); raise HTTPException(400,'Добавьте фото после ремонта')
    filename=None
    if after_image and after_image.filename:
        filename=process_upload(after_image)
    now=datetime.now().isoformat(timespec='seconds')
    c.execute("UPDATE requests SET status='done',completed_at=?,after_image=?,resolution=?,materials=? WHERE id=?",(now,filename,resolution.strip(),materials.strip(),rid))
    c.execute("INSERT INTO repair_attempts(request_id,worker_id,started_at,finished_at,outcome,comment,created_at) VALUES(?,?,?,?,?,?,?)",(rid,row['worker_id'] or u['id'],row['started_at'],now,'pending',resolution.strip(),now))
    c.execute('INSERT INTO audit_log(request_id,user_id,action,details,created_at) VALUES(?,?,?,?,?)',(rid,u['id'],'done','Работа завершена',now))
    if row['user_id'] and row['user_id']!=u['id']: c.execute("INSERT INTO notifications(user_id,request_id,title,body,created_at) VALUES(?,?,?,?,?)",(row['user_id'],rid,'Заявка завершена',f'Работа по кабинету завершена.',now))
    c.commit(); c.close(); return {'ok':True}

class RoomCreate(BaseModel):
    number: str = Field(min_length=1, max_length=20)
    floor: int = Field(ge=-5, le=100)

@app.post('/api/admin/rooms')
def create_room(x: RoomCreate, authorization: str | None = Header(None)):
    u=current_user(authorization)
    if u['role']!='admin': raise HTTPException(403,'Только администратор может изменять кабинеты')
    c=db()
    try:
        cur=c.execute('INSERT INTO rooms(number,floor) VALUES(?,?)',(x.number.strip(), x.floor)); c.commit()
        return {'id':cur.lastrowid,'number':x.number.strip(),'floor':x.floor}
    except sqlite3.IntegrityError:
        raise HTTPException(409,'Кабинет с таким номером уже существует')
    finally: c.close()

@app.delete('/api/admin/rooms/{room_id}')
def delete_room(room_id:int, authorization: str | None = Header(None)):
    u=current_user(authorization)
    if u['role']!='admin': raise HTTPException(403,'Недостаточно прав')
    c=db()
    if c.execute('SELECT 1 FROM requests WHERE room_id=? LIMIT 1',(room_id,)).fetchone():
        c.close(); raise HTTPException(409,'Нельзя удалить кабинет с историей заявок')
    changed=c.execute('DELETE FROM rooms WHERE id=?',(room_id,)).rowcount
    c.commit(); c.close()
    if not changed: raise HTTPException(404,'Кабинет не найден')
    return {'ok':True}

class ConfirmRepair(BaseModel):
    accepted: bool
    comment: str = Field(default='',max_length=500)

@app.post('/api/requests/{rid}/confirm')
def confirm_repair(rid:int, x: ConfirmRepair, authorization: str | None = Header(None)):
    u=current_user(authorization); c=db()
    row=c.execute('SELECT * FROM requests WHERE id=?',(rid,)).fetchone()
    if not row: c.close(); raise HTTPException(404,'Заявка не найдена')
    if u['id']!=row['user_id'] and u['role']!='admin':
        c.close(); raise HTTPException(403,'Подтвердить может автор заявки или администратор')
    if row['status']!='done': c.close(); raise HTTPException(409,'Ремонт ещё не завершён')
    if row['confirmed_at']: c.close(); raise HTTPException(409,'Результат уже подтверждён')
    now=now_iso()
    if x.accepted:
        c.execute('UPDATE requests SET confirmed_at=?,confirmed_by=? WHERE id=?',(now,u['id'],rid))
        c.execute("UPDATE repair_attempts SET outcome='accepted' WHERE id=(SELECT MAX(id) FROM repair_attempts WHERE request_id=?)",(rid,))
        add_audit(c,rid,u['id'],'confirmed','Результат ремонта подтверждён',now)
    else:
        if not x.comment.strip(): c.close(); raise HTTPException(400,'Укажите, что осталось неисправным')
        c.execute("UPDATE requests SET status='rework',completed_at=NULL,confirmed_at=NULL,confirmed_by=NULL WHERE id=?",(rid,))
        c.execute("UPDATE repair_attempts SET outcome='rework',comment=COALESCE(comment,'')||? WHERE id=(SELECT MAX(id) FROM repair_attempts WHERE request_id=?)",('\nВозврат: '+x.comment.strip(),rid))
        add_audit(c,rid,u['id'],'reopened',x.comment.strip(),now)
        for worker in c.execute("SELECT id FROM users WHERE role IN ('worker','admin')").fetchall():
            add_notification(c,worker['id'],rid,'Повторная заявка',x.comment.strip()[:140],now)
    c.commit(); c.close(); return {'ok':True}

class Clarification(BaseModel):
    answer: str = Field(min_length=2,max_length=500)

@app.post('/api/requests/{rid}/ai-clarify')
def clarify_ai(rid:int, x:Clarification, authorization: str | None = Header(None)):
    u=current_user(authorization); c=db()
    row=c.execute('SELECT * FROM requests WHERE id=?',(rid,)).fetchone()
    if not row: c.close(); raise HTTPException(404,'Заявка не найдена')
    if u['role']=='teacher' and row['user_id']!=u['id']:
        c.close(); raise HTTPException(403,'Недостаточно прав')
    if u['role']=='worker' and row['worker_id'] not in (None,u['id']):
        c.close(); raise HTTPException(403,'Недостаточно прав')
    if not row['ai_question']: c.close(); raise HTTPException(409,'ИИ не запрашивал уточнение')
    if row['ai_answer']: c.close(); raise HTTPException(409,'Ответ уже сохранён')
    question=row['ai_question']
    answer=x.answer.strip()
    image_name=row['image']
    if not image_name or not (UPLOADS / image_name).is_file():
        c.close(); raise HTTPException(409,'Исходная фотография недоступна для повторного анализа')
    c.close()
    if not AI_API_KEY: raise HTTPException(503,'Для повторной диагностики требуется API-ключ ИИ')
    context = (row['description'] or '')[:1000] + '\nПредыдущий диагноз: '+str(row['detected_problem'] or '')[:600]+'\nПредыдущая категория: '+str(row['ai_category'] or '')+'\nУточняющий вопрос: ' + question[:300] + "\nОтвет пользователя: " + answer
    result=analyze_image(UPLOADS / image_name,context)
    if result.get('ai_status') != 'ok':
        raise HTTPException(502,'Повторный ИИ-анализ не удался: '+clean_ai_error(result.get('ai_error'))[:250])
    c=db()
    fresh=c.execute('SELECT ai_answer FROM requests WHERE id=?',(rid,)).fetchone()
    if not fresh or fresh['ai_answer']:
        c.close(); raise HTTPException(409,'Уточнение уже обработано')
    c.execute("""UPDATE requests SET ai_answer=?,detected_problem=?,tools=?,ai_category=?,ai_priority=?,ai_confidence=?,ai_tools=?,ai_materials=?,ai_checks=?,ai_actions=?,ai_safety=?,ai_complexity=?,ai_estimated_minutes=?,ai_specialist_required=?,ai_question=NULL,ai_status='ok',ai_error=NULL WHERE id=?""",
        (answer,result['problem'],'; '.join(result['tools']),result['category'],result['priority'],result['confidence'],json.dumps(result['tools'],ensure_ascii=False),json.dumps(result['materials'],ensure_ascii=False),json.dumps(result['checks'],ensure_ascii=False),json.dumps(result['recommended_actions'],ensure_ascii=False),json.dumps(result['safety_notes'],ensure_ascii=False),result['complexity'],result['estimated_minutes'],result['specialist_required'],rid))
    add_audit(c,rid,u['id'],'ai_clarified','ИИ повторно проанализировал уточнение',now_iso())
    c.commit();c.close()
    return {'ok':True,'message':'Диагноз обновлён после повторного анализа ИИ.','problem':result['problem']}

@app.get('/api/analytics/repeats')
def repeat_issues(authorization: str | None = Header(None), days:int=90):
    u=current_user(authorization)
    if u['role'] not in ('admin','director','worker'): raise HTTPException(403,'Недостаточно прав')
    days=max(7,min(365,days)); since=(datetime.now()-timedelta(days=days)).isoformat(timespec='seconds')
    c=db()
    rows=[dict(x) for x in c.execute("""SELECT r.number room,r.floor, q.category category,
      COUNT(*) count,COUNT(CASE WHEN q.status NOT IN ('done','rejected') THEN 1 END) active,
      MAX(q.created_at) latest FROM requests q JOIN rooms r ON r.id=q.room_id
      WHERE q.created_at>=? GROUP BY q.room_id,q.category HAVING COUNT(*)>=2
      ORDER BY count DESC, latest DESC LIMIT 20""",(since,)).fetchall()]
    c.close()
    for row in rows:
        row['label']=CATEGORY_LABELS.get(row['category'] or 'other','Другое')
        row['recommendation']='Рекомендуется комплексная проверка повторяющейся неисправности специалистом.'
    return {'days':days,'items':rows,'method':'Правило: 2+ заявок одной категории в одном кабинете за период. Не прогноз ИИ.'}

@app.get('/api/analytics')
def analytics(authorization: str | None = Header(None)):
    u=current_user(authorization)
    if u['role'] not in ('admin','worker','director'): raise HTTPException(403,'Недостаточно прав')
    c=db()
    total=c.execute('SELECT COUNT(*) n FROM requests').fetchone()['n'] or 0
    done=c.execute("SELECT COUNT(*) n FROM requests WHERE status='done' AND confirmed_at IS NOT NULL").fetchone()['n'] or 0
    avg_response=c.execute("SELECT AVG((julianday(accepted_at)-julianday(created_at))*24*60) m FROM requests WHERE accepted_at IS NOT NULL").fetchone()['m']
    avg_repair=c.execute("SELECT AVG((julianday(completed_at)-julianday(started_at))*24*60) m FROM requests WHERE completed_at IS NOT NULL AND started_at IS NOT NULL").fetchone()['m']
    avg_total=c.execute("SELECT AVG((julianday(completed_at)-julianday(created_at))*24*60) m FROM requests WHERE completed_at IS NOT NULL").fetchone()['m']
    ratings=c.execute("SELECT AVG(rating) a, COUNT(rating) n FROM requests WHERE rating IS NOT NULL").fetchone()
    overdue=0; sla_total=0; sla_ok=0
    for row in c.execute("SELECT created_at,priority,status,completed_at,confirmed_at FROM requests").fetchall():
        due=sla_due(row['created_at'],row['priority'])
        if not due: continue
        if row['status']=='done' and row['confirmed_at']:
            sla_total+=1
            if datetime.fromisoformat(row['confirmed_at']) <= datetime.fromisoformat(due): sla_ok+=1
        elif row['status']!='rejected':
            if datetime.fromisoformat(due) < datetime.now(): overdue+=1
    pending_confirm=c.execute("SELECT COUNT(*) FROM requests WHERE status='done' AND confirmed_at IS NULL").fetchone()[0]
    reworks=c.execute("SELECT COUNT(*) FROM repair_attempts WHERE outcome='rework'").fetchone()[0]
    byfloor=[dict(x) for x in c.execute("SELECT r.floor,COUNT(q.id) count FROM rooms r LEFT JOIN requests q ON q.room_id=r.id GROUP BY r.floor ORDER BY r.floor").fetchall()]
    bycategory=[{'category':x['category'] or 'other','label':CATEGORY_LABELS.get(x['category'] or 'other','Другое'),'count':x['count']} for x in c.execute("SELECT category,COUNT(*) count FROM requests GROUP BY category ORDER BY count DESC").fetchall()]
    byroom=[dict(x) for x in c.execute("SELECT r.number room,r.floor,COUNT(q.id) count FROM rooms r JOIN requests q ON q.room_id=r.id GROUP BY r.id ORDER BY count DESC LIMIT 8").fetchall()]
    byworker=[dict(x) for x in c.execute("SELECT u.name worker,COUNT(q.id) assigned,SUM(q.status='done') done,AVG(CASE WHEN q.completed_at IS NOT NULL AND q.started_at IS NOT NULL THEN (julianday(q.completed_at)-julianday(q.started_at))*24*60 END) avg_repair FROM users u LEFT JOIN requests q ON q.worker_id=u.id WHERE u.role='worker' GROUP BY u.id ORDER BY done DESC,assigned DESC").fetchall()]
    bypriority=[dict(x) for x in c.execute('SELECT priority,COUNT(*) count FROM requests GROUP BY priority').fetchall()]
    c.close()
    return {'total':total,'done':done,'pending_confirmation':pending_confirm,'rework_attempts':reworks,'completion_rate':round(done/total*100,1) if total else 0,'avg_response_minutes':round(avg_response or 0,1),'avg_repair_minutes':round(avg_repair or 0,1),'avg_total_minutes':round(avg_total or 0,1),'avg_minutes':round(avg_total or 0,1),'avg_rating':round(ratings['a'],2) if ratings['a'] is not None else None,'ratings_count':ratings['n'],'overdue':overdue,'sla_compliance':round(sla_ok/sla_total*100,1) if sla_total else None,'by_floor':byfloor,'by_category':bycategory,'by_room':byroom,'by_worker':byworker,'by_priority':bypriority}

@app.get('/api/admin/users')
def admin_users(authorization: str | None = Header(None)):
    u=current_user(authorization)
    if u['role']!='admin': raise HTTPException(403,'Только администратор')
    c=db(); rows=[dict(x) for x in c.execute("SELECT id,name,login,role FROM users ORDER BY role,name").fetchall()]; c.close(); return rows

@app.patch('/api/admin/users/{uid}')
def admin_user_role(uid:int, role:str, authorization: str | None = Header(None)):
    u=current_user(authorization)
    if u['role']!='admin': raise HTTPException(403,'Только администратор')
    if role not in ('teacher','worker','admin','director'): raise HTTPException(400,'Недопустимая роль')
    c=db(); row=c.execute('SELECT role FROM users WHERE id=?',(uid,)).fetchone();
    if not row: c.close(); raise HTTPException(404,'Пользователь не найден')
    if row['role']=='admin' and role!='admin' and c.execute("SELECT COUNT(*) FROM users WHERE role='admin'").fetchone()[0] <= 1: c.close(); raise HTTPException(400,'Нельзя убрать роль у последнего администратора')
    c.execute('UPDATE users SET role=?,session_version=session_version+1 WHERE id=?',(role,uid)); c.commit(); c.close(); return {'ok':True}

@app.patch("/api/requests/{rid}")
def update_request(rid: int, x: Status, authorization: str | None = Header(None)):
    u = current_user(authorization)
    if u["role"] not in ("worker", "admin"): raise HTTPException(403, "Недостаточно прав")
    transitions = {"new": "accepted", "rework": "accepted", "accepted": "working"}
    c = db(); row = c.execute("SELECT * FROM requests WHERE id=?", (rid,)).fetchone()
    if not row: c.close(); raise HTTPException(404, "Заявка не найдена")
    if row["status"] in ("done", "rejected"): c.close(); raise HTTPException(400, "Заявка уже закрыта")
    if x.status not in transitions.values() and x.status != "rejected":
        c.close(); raise HTTPException(400, "Недопустимый статус")
    if u["role"] == "worker":
        if row["worker_id"] not in (None, u["id"]): c.close(); raise HTTPException(403, "Заявка закреплена за другим работником")
        if row['status'] in ('new','rework') and row['worker_id'] is None and x.status!='accepted': c.close(); raise HTTPException(400,'Сначала примите заявку')
        if row['status']=='accepted' and row['worker_id']!=u['id']: c.close(); raise HTTPException(403,'Сначала примите заявку')
    if u['role']=='admin' and x.status=='accepted' and not row['worker_id']:
        c.close(); raise HTTPException(400, 'Сначала назначьте работника')
    if x.status != "rejected" and row["status"] != x.status and transitions.get(row["status"]) != x.status:
        c.close(); raise HTTPException(400, "Нельзя пропустить этап заявки")
    now=now_iso(); worker = u['id'] if u['role']=='worker' else row['worker_id']
    if x.status=='accepted':
        c.execute("UPDATE requests SET status=?,worker_id=COALESCE(?,worker_id),accepted_at=COALESCE(accepted_at,?),assigned_at=COALESCE(assigned_at,?) WHERE id=?",(x.status,worker,now,now,rid))
    elif x.status=='working':
        c.execute("UPDATE requests SET status=?,worker_id=COALESCE(?,worker_id),started_at=COALESCE(started_at,?) WHERE id=?",(x.status,worker,now,rid))
    else:
        c.execute("UPDATE requests SET status=? WHERE id=?",(x.status,rid))
    add_audit(c,rid,u['id'],x.status,label_status(x.status),now)
    owner=row['user_id']
    if owner and owner != u['id']: add_notification(c,owner,rid,'Изменение заявки',f'Заявка #{rid}: {label_status(x.status)}',now)
    if x.status in ('done','rejected'):
        active=c.execute("SELECT COUNT(*) FROM requests WHERE room_id=? AND status NOT IN ('done','rejected')",(row['room_id'],)).fetchone()[0]
        if active==0:c.execute("UPDATE rooms SET status='ok' WHERE id=?",(row['room_id'],))
    else:c.execute("UPDATE rooms SET status='issue' WHERE id=?",(row['room_id'],))
    c.commit(); c.close(); return {'ok':True}

@app.get('/api/admin/workers')
def admin_workers(authorization: str | None = Header(None)):
    u=current_user(authorization)
    if u['role'] not in ('admin','director'): raise HTTPException(403,'Недостаточно прав')
    c=db(); rows=[dict(x) for x in c.execute("SELECT u.id,u.name,u.login,COUNT(CASE WHEN q.status IN ('accepted','working') THEN 1 END) active,COUNT(CASE WHEN q.status='done' THEN 1 END) done FROM users u LEFT JOIN requests q ON q.worker_id=u.id WHERE u.role='worker' GROUP BY u.id ORDER BY active,u.name").fetchall()]; c.close(); return rows

@app.patch('/api/admin/requests/{rid}/assign')
def assign_request(rid:int, authorization: str | None = Header(None), worker_id:int=0, auto:bool=False):
    u=current_user(authorization)
    if u['role']!='admin': raise HTTPException(403,'Только администратор')
    c=db(); row=c.execute('SELECT q.*,r.number room_number FROM requests q JOIN rooms r ON r.id=q.room_id WHERE q.id=?',(rid,)).fetchone()
    if not row: c.close(); raise HTTPException(404,'Заявка не найдена')
    if row['status'] in ('done','rejected'): c.close(); raise HTTPException(400,'Закрытую заявку нельзя назначить')
    if auto or not worker_id:
        cand=c.execute("SELECT u.id,COUNT(CASE WHEN q.status IN ('accepted','working') THEN 1 END) active FROM users u LEFT JOIN requests q ON q.worker_id=u.id WHERE u.role='worker' GROUP BY u.id ORDER BY active,u.id LIMIT 1").fetchone()
        if not cand: c.close(); raise HTTPException(400,'Нет доступных работников')
        worker_id=cand['id']
    worker=c.execute("SELECT id,name FROM users WHERE id=? AND role='worker'",(worker_id,)).fetchone()
    if not worker: c.close(); raise HTTPException(400,'Работник не найден')
    now=now_iso(); c.execute("UPDATE requests SET worker_id=?,assigned_at=? WHERE id=?",(worker_id,now,rid)); add_audit(c,rid,u['id'],'assigned',f'Назначен работник: {worker["name"]}',now)
    add_notification(c,worker_id,rid,'Назначена новая заявка',f'Заявка #{rid} · кабинет {row["room_number"]}',now)
    c.commit(); c.close(); return {'ok':True,'worker_id':worker_id,'worker':worker['name']}

@app.get('/api/rooms/{room_id}/summary')
def room_summary(room_id:int, authorization: str | None = Header(None)):
    u=current_user(authorization) if authorization else None
    c=db(); room=c.execute('SELECT * FROM rooms WHERE id=?',(room_id,)).fetchone()
    if not room: c.close(); raise HTTPException(404,'Кабинет не найден')
    rows=c.execute("SELECT q.*,wu.name worker,cu.name creator FROM requests q LEFT JOIN users wu ON wu.id=q.worker_id LEFT JOIN users cu ON cu.id=q.user_id WHERE q.room_id=? ORDER BY q.id DESC LIMIT 12",(room_id,)).fetchall()
    visible=[]
    for x in rows:
        if u and u['role']=='teacher' and x['user_id']!=u['id']: continue
        visible.append(enrich_request(x))
    cats=[dict(x) for x in c.execute('SELECT category,COUNT(*) count FROM requests WHERE room_id=? GROUP BY category ORDER BY count DESC',(room_id,)).fetchall()]
    last=c.execute("SELECT created_at,description,status,category FROM requests WHERE room_id=? ORDER BY id DESC LIMIT 1",(room_id,)).fetchone()
    ap=[dict(x) for x in c.execute("SELECT id,category,status,priority FROM requests WHERE room_id=? AND status NOT IN ('done','rejected') ORDER BY id DESC",(room_id,)).fetchall()]
    c.close(); return {'active_public':ap,'room':dict(room),'active':sum(x['status'] not in ('done','rejected') for x in visible),'total':len(visible),'last_request':dict(last) if last else None,'categories':cats,'requests':visible}

@app.get('/api/meta')
def meta():
    return {'categories':[{'key':k,'label':v} for k,v in CATEGORY_LABELS.items()],'priorities':[{'key':k,'label':v} for k,v in {'low':'Низкий','medium':'Средний','high':'Высокий','critical':'Критический'}.items()]}

@app.get('/api/demo')
def demo():
    return {'title':'SCHOOL+ · Демо-сценарий','steps':[
        {'role':'Учитель','title':'Создание заявки','text':'Выбирает кабинет, описывает проблему и прикрепляет фото.'},
        {'role':'AI','title':'Предварительный анализ','text':'Определяет проблему, категорию, приоритет, инструменты и материалы.'},
        {'role':'Администратор','title':'Назначение','text':'Назначает работника вручную или автоматически по текущей нагрузке.'},
        {'role':'Работник','title':'Ремонт','text':'Принимает заявку, начинает работу, фиксирует результат и фото после ремонта.'},
        {'role':'Директор','title':'Контроль','text':'Видит SLA, время реакции, время ремонта, категории и проблемные кабинеты.'}
    ],'principles':['Фото не является окончательным диагнозом.','SLA контролируется автоматически.','Каждое действие сохраняется в истории заявки.']}


@app.get("/api/stats")
def stats(authorization: str | None = Header(None)):
    u = current_user(authorization)
    c = db()
    r = c.execute("""SELECT COUNT(*) total,
      COALESCE(SUM(status='new'),0) new, COALESCE(SUM(status='accepted'),0) accepted,
      COALESCE(SUM(status='working'),0) working, COALESCE(SUM(status='done'),0) done,
      COALESCE(SUM(status='rejected'),0) rejected FROM requests""").fetchone()
    if u["role"] == "teacher":
        mine = c.execute("SELECT COUNT(*) total, COALESCE(SUM(status IN ('new','rework','accepted','working')),0) active, COALESCE(SUM(status='done'),0) done FROM requests WHERE user_id=?", (u["id"],)).fetchone()
        c.close(); return {"total": mine["total"], "active": mine["active"], "done": mine["done"]}
    overdue=0
    critical=0
    for row in c.execute("SELECT created_at,priority,status FROM requests WHERE status NOT IN ('done','rejected')").fetchall():
        due=sla_due(row['created_at'],row['priority'])
        if due and datetime.fromisoformat(due)<datetime.now(): overdue+=1
        if row['priority']=='critical': critical+=1
    out=dict(r); out.update({'overdue':overdue,'critical_active':critical}); c.close(); return out




def _csv_cell(v):
    v = "" if v is None else str(v)
    return "'" + v if v[:1] in ("=", "+", "-", "@") else v


@app.get("/api/export/requests.csv")
def export_requests(authorization: str | None = Header(None)):
    import csv, io
    u = current_user(authorization)
    if u["role"] not in ("admin", "director"): raise HTTPException(403, "Недостаточно прав")
    c = db()
    rows = c.execute("""SELECT q.id,r.number room,r.floor,q.category,q.priority,q.status,q.description,cu.name creator,wu.name worker,
                        q.created_at,q.accepted_at,q.started_at,q.completed_at,q.rating
                        FROM requests q JOIN rooms r ON r.id=q.room_id LEFT JOIN users cu ON cu.id=q.user_id
                        LEFT JOIN users wu ON wu.id=q.worker_id ORDER BY q.id""").fetchall(); c.close()
    buf = io.StringIO(); w = csv.writer(buf, delimiter=";")
    w.writerow(["№", "Кабинет", "Этаж", "Категория", "Приоритет", "Статус", "Описание", "Автор", "Исполнитель", "Создана", "Принята", "Начата", "Завершена", "Оценка"])
    for x in rows:
        w.writerow([_csv_cell(v) for v in (x["id"], x["room"], x["floor"], CATEGORY_LABELS.get(x["category"] or "other", "Другое"), x["priority"], label_status(x["status"]),
                                           x["description"], x["creator"], x["worker"], x["created_at"], x["accepted_at"], x["started_at"], x["completed_at"], x["rating"])])
    return Response("\ufeff" + buf.getvalue(), media_type="text/csv; charset=utf-8",
                    headers={"Content-Disposition": 'attachment; filename="school_plus_requests.csv"'})


# (кабинет, категория, приоритет, описание, статус, возраст в часах, реакция мин, ремонт мин, оценка, что сделано)
DEMO_ROWS = [
    ("101", "tech", "medium", "Не включается проектор, на экране «нет сигнала»", "done", 70, 25, 40, 5, "Заменили HDMI-кабель, проверили вывод"),
    ("103", "furniture", "low", "Качается парта в третьем ряду", "done", 60, 90, 25, 4, "Подтянули крепёж, заменили опору"),
    ("204", "electricity", "high", "Не работает розетка у окна, пахнет горелым", "done", 50, 12, 55, 5, "Заменили розетку, проверили проводку"),
    ("206", "plumbing", "high", "Течёт кран в кабинете химии", "done", 40, 20, 35, 4, "Заменили прокладку смесителя"),
    ("302", "lighting", "medium", "Мигает лампа над доской", "done", 30, 140, 20, 5, "Заменили лампу и стартёр"),
    ("305", "windows_doors", "medium", "Не закрывается окно, сквозняк", "done", 26, 45, 30, 3, "Отрегулировали фурнитуру"),
    ("402", "heating", "critical", "Холодная батарея, в кабинете +14", "working", 3, 15, 0, None, ""),
    ("104", "cleaning", "low", "Разлит реагент на полу в коридоре", "working", 2, 30, 0, None, ""),
    ("208", "tech", "medium", "Не работает интерактивная панель", "accepted", 5, 40, 0, None, ""),
    ("307", "windows_doors", "high", "Дверь сошла с верхней петли", "new", 9, 0, 0, None, ""),
    ("203", "electricity", "critical", "Искрит выключатель", "new", 1, 0, 0, None, ""),
    ("406", "furniture", "low", "Сломан стул у учительского стола", "new", 4, 0, 0, None, ""),
    ("204", "electricity", "medium", "Греется розетка у учительского стола", "done", 20, 30, 35, 4, "Заменили розетку и автомат"),
    ("204", "lighting", "low", "Не горит одна из ламп над партами", "done", 14, 60, 15, 5, "Заменили лампу"),
    ("206", "plumbing", "medium", "Подтекает раковина в лаборантской", "done", 10, 35, 30, 4, "Заменили сифон"),
    ("402", "windows_doors", "low", "Не фиксируется оконная ручка", "done", 8, 50, 20, 5, "Заменили ручку"),
]


@app.post("/api/admin/demo-seed")
def demo_seed(authorization: str | None = Header(None)):
    u = current_user(authorization)
    if u["role"] != "admin": raise HTTPException(403, "Только администратор")
    c = db()
    if c.execute("SELECT 1 FROM requests WHERE ai_status='demo' LIMIT 1").fetchone():
        c.close(); raise HTTPException(400, "Демо-данные уже добавлены")
    teacher = c.execute("SELECT id FROM users WHERE role='teacher' ORDER BY id LIMIT 1").fetchone()
    workers = [w["id"] for w in c.execute("SELECT id FROM users WHERE role='worker' ORDER BY id").fetchall()]
    if not teacher or not workers: c.close(); raise HTTPException(400, "Нужны хотя бы один учитель и один работник")
    now = datetime.now(); iso = lambda d: d.isoformat(timespec="seconds"); added = 0
    for i, (room, cat, prio, desc, status, age, react, repair, rating, resolution) in enumerate(DEMO_ROWS):
        r = c.execute("SELECT id FROM rooms WHERE number=?", (room,)).fetchone()
        if not r: continue
        created = now - timedelta(hours=age); wid = workers[i % len(workers)] if status != "new" else None
        accepted = created + timedelta(minutes=react) if status != "new" else None
        started = accepted + timedelta(minutes=10) if status in ("working", "done") else None
        done = started + timedelta(minutes=repair) if status == "done" else None
        cur = c.execute("""INSERT INTO requests(user_id,worker_id,room_id,description,status,priority,category,created_at,accepted_at,assigned_at,started_at,completed_at,
                           resolution,materials,rating,ai_status,ai_error) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'demo','')""",
                        (teacher["id"], wid, r["id"], desc, status, prio, cat, iso(created), iso(accepted) if accepted else None, iso(accepted) if accepted else None,
                         iso(started) if started else None, iso(done) if done else None, resolution or None, "Стандартный набор инструментов" if resolution else None, rating))
        rid = cur.lastrowid; added += 1
        add_audit(c, rid, teacher["id"], "created", "Заявка создана", iso(created))
        if accepted: add_audit(c, rid, wid, "accepted", "Принята", iso(accepted))
        if started: add_audit(c, rid, wid, "working", "В работе", iso(started))
        if done: add_audit(c, rid, wid, "done", "Работа завершена", iso(done))
    c.commit(); c.close(); return {"ok": True, "added": added}


@app.delete("/api/admin/demo-seed")
def demo_clear(authorization: str | None = Header(None)):
    u = current_user(authorization)
    if u["role"] != "admin": raise HTTPException(403, "Только администратор")
    c = db(); ids = [x["id"] for x in c.execute("SELECT id FROM requests WHERE ai_status='demo'").fetchall()]
    for t in ("audit_log", "comments", "notifications"):
        c.executemany(f"DELETE FROM {t} WHERE request_id=?", [(i,) for i in ids])
    c.executemany("DELETE FROM requests WHERE id=?", [(i,) for i in ids])
    c.commit(); c.close(); return {"ok": True, "removed": len(ids)}

# V8 operational extensions: use existing role permissions, never exposed publicly.
def require_manager(header):
    u=current_user(header)
    if u['role'] not in ('admin','director'): raise HTTPException(403,'Требуются права руководителя')
    return u

class EquipmentIn(BaseModel):
    room_id:int
    name:str=Field(min_length=2,max_length=120)
    details:str=Field(default='',max_length=500)
    condition:str='ok'

@app.get('/api/rooms/{room_id}/passport')
def room_passport(room_id:int,authorization:str|None=Header(None)):
    u=current_user(authorization)
    c=db(); r=c.execute('SELECT * FROM rooms WHERE id=?',(room_id,)).fetchone()
    if not r: c.close(); raise HTTPException(404,'Кабинет не найден')
    equipment=[dict(x) for x in c.execute('SELECT * FROM equipment WHERE room_id=? ORDER BY name',(room_id,))]
    summary=[dict(x) for x in c.execute('SELECT category,COUNT(*) count FROM requests WHERE room_id=? GROUP BY category',(room_id,))]
    recent=[dict(x) for x in c.execute("SELECT id,description,status,created_at FROM requests WHERE room_id=? AND (? != 'teacher' OR user_id=?) ORDER BY id DESC LIMIT 20",(room_id,u['role'],u['id']))]
    c.close(); return {'room':dict(r),'equipment':equipment,'categories':summary,'recent':recent}

@app.post('/api/admin/equipment')
def equipment_add(x:EquipmentIn,authorization:str|None=Header(None)):
    require_manager(authorization)
    if x.condition not in ('ok','attention','broken'): raise HTTPException(400,'Недопустимое состояние')
    c=db(); room=c.execute('SELECT id FROM rooms WHERE id=?',(x.room_id,)).fetchone()
    if not room: c.close(); raise HTTPException(404,'Нет кабинета')
    cur=c.execute('INSERT INTO equipment(room_id,name,details,condition) VALUES(?,?,?,?)',(x.room_id,x.name.strip(),x.details.strip(),x.condition));c.commit();c.close();return {'id':cur.lastrowid}

class StockIn(BaseModel):
    name:str=Field(min_length=2,max_length=120)
    quantity:float=Field(ge=0,le=1000000)
    unit:str=Field(default='шт',max_length=20)
    min_quantity:float=Field(default=0,ge=0,le=1000000)

@app.get('/api/inventory')
def inventory_list(authorization:str|None=Header(None)):
    u=current_user(authorization)
    if u['role'] not in ('admin','director','worker'): raise HTTPException(403,'Недостаточно прав')
    c=db();v=[dict(x) for x in c.execute('SELECT * FROM inventory ORDER BY name')];c.close();return v

@app.post('/api/admin/inventory')
def inventory_add(x:StockIn,authorization:str|None=Header(None)):
    require_manager(authorization)
    c=db()
    try:
        cur=c.execute('INSERT INTO inventory(name,quantity,unit,min_quantity) VALUES(?,?,?,?)',(x.name.strip(),x.quantity,x.unit.strip(),x.min_quantity));c.commit();return {'id':cur.lastrowid}
    except sqlite3.IntegrityError: raise HTTPException(409,'Материал с таким названием уже есть')
    finally:c.close()

class StockAdjustment(BaseModel):
    delta:float=Field(ge=-1000000,le=1000000)

@app.patch('/api/admin/inventory/{item_id}')
def inventory_change(item_id:int,x:StockAdjustment,authorization:str|None=Header(None)):
    require_manager(authorization)
    c=db();cur=c.execute('UPDATE inventory SET quantity=quantity+? WHERE id=? AND quantity+?>=0',(x.delta,item_id,x.delta));c.commit();c.close()
    if not cur.rowcount:raise HTTPException(409,'Нет материала или недостаточно остатка')
    return {'ok':True}

class MaintenanceIn(BaseModel):
    room_id:int
    title:str=Field(min_length=3,max_length=200)
    due_at:str=Field(min_length=10,max_length=40)

@app.get('/api/maintenance')
def maintenance_list(authorization:str|None=Header(None)):
    u=current_user(authorization)
    if u['role'] not in ('admin','director','worker'):raise HTTPException(403,'Недостаточно прав')
    c=db();v=[dict(x) for x in c.execute('SELECT p.*,r.number room FROM maintenance_plans p JOIN rooms r ON r.id=p.room_id ORDER BY p.done_at IS NOT NULL,p.due_at')];c.close();return v

@app.post('/api/admin/maintenance')
def maintenance_add(x:MaintenanceIn,authorization:str|None=Header(None)):
    require_manager(authorization)
    try:datetime.fromisoformat(x.due_at)
    except ValueError:raise HTTPException(400,'Неверная дата')
    c=db();cur=c.execute('INSERT INTO maintenance_plans(room_id,title,due_at) VALUES(?,?,?)',(x.room_id,x.title.strip(),x.due_at));c.commit();c.close();return {'id':cur.lastrowid}

@app.patch('/api/maintenance/{item_id}/done')
def maintenance_done(item_id:int,authorization:str|None=Header(None)):
    u=current_user(authorization)
    if u['role'] not in ('admin','worker'):raise HTTPException(403,'Недостаточно прав')
    c=db();cur=c.execute('UPDATE maintenance_plans SET done_at=? WHERE id=? AND done_at IS NULL',(now_iso(),item_id));c.commit();c.close()
    if not cur.rowcount:raise HTTPException(409,'План уже выполнен или не найден')
    return {'ok':True}

@app.get('/api/requests/{rid}/attempts')
def attempts(rid:int,authorization:str|None=Header(None)):
    u=current_user(authorization);c=db();r=c.execute('SELECT user_id,worker_id FROM requests WHERE id=?',(rid,)).fetchone()
    if not r:c.close();raise HTTPException(404,'Заявка не найдена')
    if u['role']=='teacher' and r['user_id']!=u['id']:c.close();raise HTTPException(403,'Нет доступа')
    if u['role']=='worker' and r['worker_id'] not in (None,u['id']):c.close();raise HTTPException(403,'Нет доступа')
    v=[dict(x) for x in c.execute('SELECT * FROM repair_attempts WHERE request_id=? ORDER BY id',(rid,))];c.close();return v

@app.get('/api/admin/ai-usage')
def ai_usage(authorization:str|None=Header(None)):
    require_manager(authorization);c=db()
    v=[dict(x) for x in c.execute('SELECT model,status,COUNT(*) requests,ROUND(AVG(latency_ms)) avg_ms FROM ai_usage GROUP BY model,status')]
    c.close();return {'items':v,'note':'Стоимость зависит от тарифов провайдера; токены и деньги пока не измеряются.'}

@app.post('/api/requests/{rid}/ai-retry')
def retry_ai(rid:int,authorization:str|None=Header(None)):
    u=current_user(authorization);c=db();r=c.execute('SELECT * FROM requests WHERE id=?',(rid,)).fetchone()
    if not r:c.close();raise HTTPException(404,'Заявка не найдена')
    if u['role']=='teacher' and r['user_id']!=u['id']:c.close();raise HTTPException(403,'Нет доступа')
    if u['role']=='worker' and r['worker_id'] not in (None,u['id']):c.close();raise HTTPException(403,'Нет доступа')
    if not AI_API_KEY:c.close();raise HTTPException(503,'Сначала задайте ключ API')
    if not r['image']:c.close();raise HTTPException(409,'Нет фотографии')
    if r['ai_status']=='pending':c.close();raise HTTPException(409,'Анализ уже выполняется')
    c.execute("UPDATE requests SET ai_status='pending',ai_error=NULL WHERE id=?",(rid,));c.commit();c.close()
    schedule_ai_analysis(rid,r['image'],r['description'] or '')
    return {'ok':True,'status':'pending'}

@app.get("/{path:path}")
def spa(path: str):
    if path.startswith("api/"): raise HTTPException(404, "Не найдено")
    root = (BASE.parent / "frontend").resolve()
    p = (root / path).resolve()
    if p.is_file() and p.is_relative_to(root): return FileResponse(p)
    return FileResponse(root / "index.html")
