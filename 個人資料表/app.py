# -*- coding: utf-8 -*-
"""
部門通訊錄 後端 API
------------------------------------------------
頁面（後台只單純提供檔案，不做任何轉跳；跳轉一律由前端 window.location 處理）
GET  /index.html（及 /）            前端頁面
GET  /login.html（及 /login）       登入頁
    頁面也可以完全不經 Flask：直接在檔案總管雙擊 login.html（file:// 開啟），
    登入後前端會用 window.location 跳到同資料夾的 index.html，
    網址保持 file:///D:/... 的形式；只有 API 呼叫會連到 http://127.0.0.1:5000。

登入
POST /api/login                     登入（username / password / remember），成功時回傳簽章 token
POST /api/logout                    登出（清 session cookie；token 由前端自行丟棄）
GET  /api/me                        取得目前登入者

人員（以下皆需登入，未登入回 401）
GET  /api/units                     取得單位清單（單位.json 的 key，依檔案順序）
GET  /api/contacts                  取得全部人員清單（每筆附 unit：所屬單位名稱）
POST /api/contacts                  新增人員（empNo、unit 必填；工號會寫入 單位.json 該單位的清單）
POST /api/contacts/batch-delete     批次移除人員與其照片（僅限 admin.json 內的工號，其他人回 403）
GET  /api/contacts/<emp_no>         取得單筆人員資料
PUT  /api/contacts/<emp_no>         更新單筆人員資料（以舊資料為底合併、自動寫入 lastModified，
                                    empNo 為主鍵不可改；帶 unit 時會把工號搬到該單位）
POST /api/contacts/<emp_no>/photo   上傳個人照片（multipart，欄位名 photo），自動更新 photoUrl
DELETE /api/contacts/<emp_no>/photo 移除個人照片（刪除檔案並清空 photoUrl）
GET  /photos/<filename>             提供照片檔案（公開；<img> 標籤無法夾帶 token）

登入驗證
    本程式不儲存任何帳號密碼。登入頁把 username / password 送到 POST /api/login，
    由 verify_credentials() 決定是否放行，通過後只在 session 記住工號與姓名。
    登入條件：
        1. username 必須是 contacts/ 內已存在的工號（不分大小寫）
        2. 該筆資料已填寫中文姓名（nameZh）
        3. 密碼有輸入（目前不比對內容；要接公司驗證只需改 verify_credentials）
    通過後簽發 token（未勾「保持登入」12 小時有效、勾選 30 天），前端存 localStorage，
    每次 API 以 Authorization: Bearer <token> 夾帶；用 http 開啟時 session cookie 也仍可用。
    因此頁面用 file:// 直接開啟也能正常登入，不受瀏覽器跨站 cookie 限制。
    Session 金鑰自動產生並存於 .secret_key（請加入 .gitignore），或以環境變數 DIRECTORY_SECRET_KEY 指定。

管理員
    admin.json 內列出的工號才有「移除人員」權限，格式：{"admin": ["K18251", "C9228"]}
    每次請求都會重新讀取，修改後不用重啟、也不用重新登入。

入職作業清單（onboarding）
    每位人員都有固定 15 項入職作業（ONBOARDING_TEMPLATE），存於人員 JSON 的 onboarding 欄位：
        {"id": 1, "name": "個人基本資料（入賴群）", "done": false, "note": "", "selfConfirmed": false}
    API 回傳時一律以範本補齊（舊資料沒有此欄位、或之後新增項目，都會自動補上）。
    權限：管理員可修改 done / note / selfConfirmed；本人只能修改 selfConfirmed；其他人送來的異動一律忽略。

單位：
    單位.json 是所屬單位的唯一來源，格式 {"單位名稱": ["工號", ...]}。
    人員 JSON 不另存 unit，API 回傳時會即時從 單位.json 對照；
    新增 / 改單位 / 移除人員都會同步更新 單位.json（保留原本 4 空格縮排）。

資料儲存：
    每位人員一個獨立 JSON 檔，位於 contacts/ 資料夾，檔名為 工號.json
    例如：contacts/4563.json
    首次啟動時若偵測到舊版單一檔 contacts.json，會自動拆分成個別檔案，
    並將舊檔改名為 contacts.json.bak 保留備份。

照片儲存：photos/ 資料夾（檔名為 工號_時間戳.副檔名，上傳新照片時自動刪除舊檔）
    啟動時會清掉 photos/ 內沒有任何人員引用的孤兒檔案。

Log：
    使用 loguru，每天一個檔，路徑 Log/YYYY-MM-DD.log（半夜 00:00 自動換檔）。
    每個請求輸出一行完整紀錄：IP | 登入者 | 方法 路徑 → 狀態碼 | 動作說明，
    動作說明會寫清楚後台抓了什麼、比對了什麼，例如：
      載入人員清單：自 contacts/ 讀取 N 筆，與 單位.json 比對所屬單位
      登入成功：驗證工號存在於 contacts/ 且已填中文姓名、比對 admin.json 判斷管理員
      更新人員：逐欄位比對，只列有變動的欄位（舊值 → 新值），入職項目逐項比對
    另外未預期錯誤會多一行完整 traceback。密碼永遠不會被寫進 log。

啟動方式：
    pip install flask flask_cors loguru
    python app.py
    瀏覽 http://127.0.0.1:5000（登入後才能使用；請以 http 開啟，不支援直接開啟 index.html 檔案）
"""

import copy
import glob
import json
import os
import secrets
import sys
import threading
import time
from datetime import datetime, timedelta, timezone
from functools import wraps

from flask import Flask, g, jsonify, request, send_from_directory, session
from flask_cors import CORS
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer
from loguru import logger
from werkzeug.exceptions import HTTPException
from werkzeug.utils import secure_filename


BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CONTACT_DIR = os.path.join(BASE_DIR, "contacts")
PHOTO_DIR = os.path.join(BASE_DIR, "photos")
LEGACY_FILE = os.path.join(BASE_DIR, "contacts.json")
INIT_MARKER = os.path.join(CONTACT_DIR, ".initialized")
SECRET_FILE = os.path.join(BASE_DIR, ".secret_key")
ADMIN_FILE = os.path.join(BASE_DIR, "admin.json")
UNIT_FILE = os.path.join(BASE_DIR, "單位.json")
ALLOWED_EXT = {"png", "jpg", "jpeg", "gif", "webp"}

# ---------------------------------------------- Log（loguru，每天一個檔）
log_path = os.path.join(BASE_DIR, "Log", "{time:YYYY-MM-DD}.log")
logger.remove()
logger.add(sys.stderr, level="INFO",
           format="<green>{time:HH:mm:ss}</green> | <level>{level: <7}</level> | {message}")
logger.add(log_path, rotation="00:00", encoding="utf-8", enqueue=True, level="INFO",
           format="{time:YYYY-MM-DD HH:mm:ss} | {level: <7} | {message}")


def _j(value):
    """log 用：把值轉成單行 JSON 字串（中文不轉碼）。"""
    return json.dumps(value, ensure_ascii=False)


def _log_user():
    """目前登入者（token 或 cookie），log 用：詹睿穎(K18251)；未登入回「未登入」。"""
    try:
        user = _auth_user() or {}
    except RuntimeError:
        user = {}
    return f"{user.get('name')}({user.get('username')})" if user else "未登入"


def _note(text):
    """附加本次請求的動作說明（後台抓了什麼、比對了什麼），最後由 log 一併輸出一行。"""
    notes = getattr(g, "log_notes", None)
    if notes is None:
        notes = g.log_notes = []
    notes.append(text)
REMEMBER_DAYS = 30             # 「保持登入」天數

_lock = threading.Lock()
_unit_lock = threading.Lock()

os.makedirs(CONTACT_DIR, exist_ok=True)
os.makedirs(PHOTO_DIR, exist_ok=True)


# ---------------------------------------------- 共用工具
def _now():
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def _read_json(path):
    with open(path, "r", encoding="utf-8") as file:
        return json.load(file)


def _write_json(path, obj, indent=2):
    with open(path, "w", encoding="utf-8") as file:
        json.dump(obj, file, ensure_ascii=False, indent=indent)


def _load_secret_key():
    """優先使用環境變數；否則讀取 / 建立 .secret_key，讓重啟後 session 仍有效。"""
    env_key = os.environ.get("DIRECTORY_SECRET_KEY")
    if env_key:
        return env_key
    try:
        with open(SECRET_FILE, "r", encoding="utf-8") as file:
            key = file.read().strip()
            if key:
                return key
    except OSError:
        pass
    key = secrets.token_hex(32)
    try:
        with open(SECRET_FILE, "w", encoding="utf-8") as file:
            file.write(key)
    except OSError as error:
        logger.warning(f"無法寫入 .secret_key（{error}），重啟後所有人需重新登入")
    return key


app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 10 * 1024 * 1024
app.config["SECRET_KEY"] = _load_secret_key()
app.config["JSON_AS_ASCII"] = False            # 舊版 Flask：回應直接輸出中文
if hasattr(app, "json"):
    app.json.ensure_ascii = False              # Flask 2.3+
app.config["SESSION_COOKIE_HTTPONLY"] = True
app.config["SESSION_COOKIE_SAMESITE"] = "Lax"
app.config["PERMANENT_SESSION_LIFETIME"] = timedelta(days=REMEMBER_DAYS)
CORS(app, supports_credentials=True)

TOKEN_REMEMBER_DAYS = REMEMBER_DAYS   # 勾「保持登入」的 token 效期
TOKEN_SHORT_HOURS = 12                # 未勾選的 token 效期
_token_serializer = URLSafeTimedSerializer(app.config["SECRET_KEY"], salt="directory-login")


def _make_token(user, remember):
    """簽發登入 token（內含登入者資訊與是否保持登入，附時間戳與簽章）。"""
    return _token_serializer.dumps({**user, "remember": bool(remember)})


def _verify_token(token):
    """驗證 token 簽章與效期；通過回登入者 dict，否則回 None。"""
    try:
        data, issued_at = _token_serializer.loads(
            token, max_age=TOKEN_REMEMBER_DAYS * 86400, return_timestamp=True
        )
    except (BadSignature, SignatureExpired):
        return None
    if not isinstance(data, dict) or not data.get("username"):
        return None
    if not data.get("remember"):
        if datetime.now(timezone.utc) - issued_at > timedelta(hours=TOKEN_SHORT_HOURS):
            return None
    return {
        "username": data.get("username"),
        "name": data.get("name"),
        "loginAt": data.get("loginAt"),
    }


# ---------------------------------------------- 入職作業清單範本
ONBOARDING_TEMPLATE = [
    {"id": 1, "name": "個人基本資料（入賴群）"},
    {"id": 2, "name": "開通 AD"},
    {"id": 3, "name": "開通 Notes ID（含設定）"},
    {"id": 4, "name": "MES 相關申請（含設定）"},
    {"id": 5, "name": "PIP 拍照申請"},
    {"id": 6, "name": "NDA 保密義務承諾書"},
    {"id": 7, "name": "門禁開通"},
    {"id": 8, "name": "無塵服申請"},
    {"id": 9, "name": "停車證申請"},
    {"id": 10, "name": "廠區介紹六六"},
    {"id": 11, "name": "資安宣導"},
    {"id": 12, "name": "配件領取（無塵袋〈大、小〉、安全帽）"},
    {"id": 13, "name": "新人課程"},
    {"id": 14, "name": "個人槽使用申請（工程師）"},
    {"id": 15, "name": "外網權限（工程師）"},
]


def _normalize_onboarding(items):
    """以範本為準補齊入職項目（依 id 對照），保留既有的 done / note / selfConfirmed。"""
    existing = {}
    if isinstance(items, list):
        for item in items:
            if isinstance(item, dict) and "id" in item:
                existing[str(item["id"])] = item
    result = []
    for template in ONBOARDING_TEMPLATE:
        old = existing.get(str(template["id"]), {})
        result.append({
            "id": template["id"],
            "name": template["name"],
            "done": bool(old.get("done")),
            "note": str(old.get("note") or ""),
            "selfConfirmed": bool(old.get("selfConfirmed")),
        })
    return result


EMPTY_RECORD = {
    "empNo": "",
    "nameZh": "",
    "title": "",
    "nameEn": "",
    "grade": "",
    "gender": "",
    "hireDate": "",
    "blood": "",
    "zodiac": "",
    "emgName": "",
    "birthDate": "",
    "emgPhone": "",
    "marriage": "",
    "phone": "",
    "mobile": "",
    "address": "",
    "eduTop": {"school": "", "major": "", "period": ""},
    "eduSecond": {"school": "", "major": "", "period": ""},
    "experiences": [],
    "interests": "",
    "skills": "",
    "photoUrl": "",
    "onboarding": [],
    "lastModified": "",
}


SEED_RECORD = {
    **copy.deepcopy(EMPTY_RECORD),
    "empNo": "4563",
    "nameZh": "4534",
    "title": "453",
    "nameEn": "453",
    "grade": "453",
    "gender": "男",
    "blood": "A",
    "emgPhone": "453453",
    "marriage": "已婚",
    "phone": "453",
    "mobile": "0930172219",
    "eduTop": {"school": "453", "major": "453453", "period": "453453"},
    "eduSecond": {"school": "4", "major": "", "period": ""},
    "experiences": [{"company": "453453", "position": "453453", "years": ""}],
    "interests": "453453",
    "skills": "453354",
    "lastModified": "2026-08-10 22:19:26",
}


# ---------------------------------------------- 登入
def _find_person(emp_no):
    """依工號找通訊錄資料，不分大小寫（K18251 / k18251 皆可）。"""
    person = load_person(emp_no)
    if person is None and emp_no.upper() != emp_no:
        person = load_person(emp_no.upper())
    return person


def verify_credentials(username, password):
    """
    決定是否可以登入。本程式不儲存帳號密碼。
    回傳 (person, error)：通過時 person 為該筆通訊錄資料、error 為空字串。

    條件：工號必須已存在於通訊錄，且已填中文姓名；密碼目前只要求有輸入。
    要比對公司驗證（AD/LDAP、HR API…）請在最後的 return 前加上，例如：
        if not ldap_bind(username, password):
            return None, "帳號或密碼錯誤"
    """
    person = _find_person(username)
    if person is None:
        return None, "查無此工號，請先在通訊錄建立人員資料"
    if not str(person.get("nameZh") or "").strip():
        return None, "此工號尚未填寫中文姓名，請先補齊資料再登入"
    if not password:
        return None, "請輸入密碼"
    return person, ""


def _load_admins():
    """讀取 admin.json 的工號清單（大寫化），檔案不存在或格式錯誤時回空集合。"""
    try:
        data = _read_json(ADMIN_FILE)
    except (OSError, json.JSONDecodeError):
        return set()
    names = data.get("admin") if isinstance(data, dict) else data
    if not isinstance(names, list):
        return set()
    return {str(value).strip().upper() for value in names if str(value).strip()}


def _is_admin(username):
    return str(username or "").strip().upper() in _load_admins()


def _auth_user():
    """取得本次請求的登入者：優先 Authorization: Bearer token，其次 session cookie。"""
    if not hasattr(g, "auth_user"):
        user = None
        header = request.headers.get("Authorization", "")
        if header.startswith("Bearer "):
            user = _verify_token(header[7:].strip())
        if user is None:
            user = session.get("user")
        g.auth_user = user
    return g.auth_user


def _current_user():
    """目前登入者，附上即時計算的 isAdmin。"""
    user = _auth_user() or {}
    return {**user, "isAdmin": _is_admin(user.get("username"))}


def login_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        if _auth_user():
            return view(*args, **kwargs)
        _note("被擋：未登入或憑證已逾期")
        return jsonify({"error": "未登入或登入已逾期", "code": "UNAUTHORIZED"}), 401

    return wrapped


def admin_required(view):
    """需先登入，且工號列在 admin.json 內。"""
    @wraps(view)
    @login_required
    def wrapped(*args, **kwargs):
        username = (_auth_user() or {}).get("username")
        if not _is_admin(username):
            _note(f"被擋：非管理員（admin.json 內沒有 {username}）")
            return jsonify({"error": "只有管理員可以移除人員", "code": "FORBIDDEN"}), 403
        return view(*args, **kwargs)

    return wrapped


@app.route("/login")
@app.route("/login.html")
def login_page():
    _note("提供登入頁（是否已登入由前端檢查）")
    return send_from_directory(BASE_DIR, "login.html")


@app.route("/api/login", methods=["POST"])
def api_login():
    payload = request.get_json(force=True, silent=True)
    if not isinstance(payload, dict):
        return jsonify({"error": "請求內容必須為 JSON 物件"}), 400

    username = str(payload.get("username") or "").strip()
    password = str(payload.get("password") or "")
    remember = bool(payload.get("remember"))
    if not username or not password:
        _note("登入失敗：未輸入工號或密碼")
        return jsonify({"error": "請輸入工號與密碼"}), 400

    person, error = verify_credentials(username, password)
    if error:
        _note(f"登入失敗：{error}（帳號輸入={username}）")
        return jsonify({"error": error}), 401

    # 密碼用完即丟，不寫入任何地方；只記工號與中文姓名
    user = {
        "username": str(person.get("empNo") or username),
        "name": str(person.get("nameZh") or "").strip(),
        "loginAt": _now(),
    }
    session.clear()
    session.permanent = remember
    session["user"] = user            # 以 http 同網域開啟時的備援
    g.auth_user = user
    token = _make_token(user, remember)
    validity = f"{TOKEN_REMEMBER_DAYS} 天" if remember else f"{TOKEN_SHORT_HOURS} 小時"
    _note(
        f"登入成功：{_log_user()}；驗證=工號存在於 contacts/ 且已填中文姓名；"
        f"管理員={'是' if _is_admin(user['username']) else '否'}（比對 admin.json）；"
        f"保持登入={'是' if remember else '否'}；已簽發 token（效期 {validity}）"
    )
    return jsonify({"ok": True, "user": _current_user(), "token": token})


@app.route("/api/logout", methods=["POST"])
def api_logout():
    _note(f"登出：{_log_user()}（session 已清除，前端會丟棄 token）")
    session.clear()
    return jsonify({"ok": True})


@app.route("/api/me", methods=["GET"])
@login_required
def api_me():
    user = _current_user()
    _note(
        f"查詢登入者身分：{user.get('name')}({user.get('username')})；"
        f"管理員={'是' if user.get('isAdmin') else '否'}（比對 admin.json）"
    )
    return jsonify(user)


# ---------------------------------------------- 檔案存取（每人一檔）
def _safe_no(emp_no):
    """工號轉為安全檔名；含不支援字元時回傳空字串。"""
    return secure_filename(str(emp_no).strip())


def _person_path(emp_no):
    safe = _safe_no(emp_no)
    return os.path.join(CONTACT_DIR, f"{safe}.json") if safe else None


def load_person(emp_no):
    path = _person_path(emp_no)
    if not path or not os.path.exists(path):
        return None
    with _lock:
        return _read_json(path)


def save_person(record):
    path = _person_path(record.get("empNo"))
    if not path:
        raise ValueError("工號無法轉為合法檔名")
    with _lock:
        _write_json(path, record)


def load_all():
    people = []
    with _lock:
        for path in glob.glob(os.path.join(CONTACT_DIR, "*.json")):
            try:
                people.append(_read_json(path))
            except (json.JSONDecodeError, OSError):
                continue

    def sort_key(record):
        value = str(record.get("empNo", ""))
        return (0, int(value)) if value.isdigit() else (1, value)

    people.sort(key=sort_key)
    logger.debug(f"載入 {len(people)} 筆人員資料")
    return people


def _remove_photo_files(emp_no):
    """刪除某工號在 photos/ 裡的所有照片檔。"""
    safe_no = _safe_no(emp_no) or "user"
    for old in glob.glob(os.path.join(PHOTO_DIR, f"{safe_no}_*")):
        try:
            os.remove(old)
        except OSError:
            pass


def _cleanup_orphan_photos():
    """啟動時移除沒有被任何人員 photoUrl 引用的照片檔。"""
    referenced = set()
    for person in load_all():
        url = str(person.get("photoUrl") or "")
        if url.startswith("/photos/"):
            referenced.add(url[len("/photos/"):])
    removed = 0
    for path in glob.glob(os.path.join(PHOTO_DIR, "*")):
        if os.path.isfile(path) and os.path.basename(path) not in referenced:
            try:
                os.remove(path)
                removed += 1
            except OSError:
                pass
    if removed:
        logger.info(f"啟動清理：移除 {removed} 個未被引用的照片檔")


def _mark_initialized():
    try:
        with open(INIT_MARKER, "a", encoding="utf-8"):
            pass
    except OSError as error:
        logger.warning(f"無法建立初始化標記：{error}")


def _migrate_or_seed():
    """遷移舊資料；只在真正的首次啟動建立範例資料。"""
    if os.path.exists(LEGACY_FILE):
        try:
            old = _read_json(LEGACY_FILE)
            if isinstance(old, list):
                for person in old:
                    path = _person_path(person.get("empNo"))
                    if path and not os.path.exists(path):
                        _write_json(path, person)
            os.rename(LEGACY_FILE, LEGACY_FILE + ".bak")
            logger.info(
                f"已將舊版 contacts.json 拆分至 {CONTACT_DIR}/，"
                "原檔備份為 contacts.json.bak"
            )
        except (json.JSONDecodeError, OSError) as error:
            logger.error(f"舊檔遷移失敗：{error}")

    has_records = bool(glob.glob(os.path.join(CONTACT_DIR, "*.json")))
    if not has_records and not os.path.exists(INIT_MARKER):
        _write_json(_person_path(SEED_RECORD["empNo"]), SEED_RECORD)

    _mark_initialized()


_migrate_or_seed()
_cleanup_orphan_photos()
if not os.path.exists(ADMIN_FILE):
    logger.warning("找不到 admin.json，目前沒有任何人能移除人員")


# ---------------------------------------------- 單位（單位.json）
def _load_units():
    """讀取 單位.json → {單位名稱: [工號, ...]}；檔案不存在或格式錯誤時回空 dict。"""
    try:
        data = _read_json(UNIT_FILE)
    except (OSError, json.JSONDecodeError):
        return {}
    if not isinstance(data, dict):
        return {}
    return {name: (members if isinstance(members, list) else []) for name, members in data.items()}


def _unit_map(units=None):
    """工號（大寫）→ 單位名稱。"""
    units = _load_units() if units is None else units
    mapping = {}
    for name, members in units.items():
        for member in members:
            mapping.setdefault(str(member).strip().upper(), name)
    return mapping


def _with_unit(person, mapping=None):
    """回傳附上 unit 欄位、且入職清單已用範本補齊的副本（不寫回人員檔）。"""
    mapping = _unit_map() if mapping is None else mapping
    result = dict(person)
    result["unit"] = mapping.get(str(person.get("empNo") or "").strip().upper(), "")
    result["onboarding"] = _normalize_onboarding(person.get("onboarding"))
    return result


def _set_unit(emp_no, unit_name):
    """把工號放進指定單位並從其他單位移除；unit_name 為空字串時只移除。"""
    emp_no = str(emp_no).strip()
    with _unit_lock:
        units = _load_units()
        if unit_name and unit_name not in units:
            raise ValueError(f"單位「{unit_name}」不存在於 單位.json")
        for name, members in units.items():
            units[name] = [m for m in members if str(m).strip().upper() != emp_no.upper()]
        if unit_name:
            units[unit_name].append(emp_no)
        _write_json(UNIT_FILE, units, indent=4)


@app.route("/api/units", methods=["GET"])
@login_required
def list_units():
    units = _load_units()
    _note(f"讀取單位清單：自 單位.json 取得 {len(units)} 個單位")
    return jsonify({"units": list(units.keys())})


# ---------------------------------------------- 前端頁面與照片
@app.before_request
def _log_begin():
    """記下請求開始時的登入者；各路由用 _note() 補上動作說明，結束時輸出一行。"""
    g.log_user = _log_user()
    g.log_notes = []


@app.after_request
def _finish_request(response):
    """加上不快取標頭，並為每個請求輸出一行完整 log：IP | 登入者 | 方法 路徑 → 狀態 | 動作說明。"""
    if request.path.startswith("/api/") or request.path.endswith(".html") or request.path in ("/", "/login"):
        response.headers["Cache-Control"] = "no-store"

    if request.method == "OPTIONS" or request.path.startswith("/photos/"):
        return response

    start_user = getattr(g, "log_user", None) or "未登入"
    user = start_user if start_user != "未登入" else _log_user()
    path = request.full_path if request.query_string else request.path
    notes = "；".join(getattr(g, "log_notes", []))
    line = f"{request.remote_addr} | {user} | {request.method} {path} → {response.status_code}"
    if notes:
        line += f" | {notes}"
    (logger.warning if response.status_code >= 400 else logger.info)(line)
    return response


@app.errorhandler(Exception)
def _log_unexpected(error):
    """未預期錯誤：完整 traceback 進 log，回 500。"""
    if isinstance(error, HTTPException):
        return error
    logger.exception(f"未預期錯誤 | {_log_user()} | {request.method} {request.path} | {error}")
    _note("未預期錯誤，完整 traceback 見上一行")
    return jsonify({"error": "伺服器發生未預期錯誤，詳見 Log"}), 500


@app.route("/")
@app.route("/index.html")
def index():
    _note("提供通訊錄主頁面（登入狀態由前端以 /api/me 檢查）")
    return send_from_directory(BASE_DIR, "index.html")


@app.route("/photos/<path:filename>")
def serve_photo(filename):
    # 照片公開提供：<img> 標籤無法夾帶 Authorization token
    return send_from_directory(PHOTO_DIR, filename)


# ---------------------------------------------- API
@app.route("/api/contacts", methods=["GET"])
@login_required
def list_contacts():
    mapping = _unit_map()
    people = [_with_unit(person, mapping) for person in load_all()]
    with_unit = sum(1 for person in people if person["unit"])
    _note(
        f"載入人員清單：自 contacts/ 讀取 {len(people)} 筆，"
        f"與 單位.json 比對所屬單位（{with_unit} 筆有單位、{len(people) - with_unit} 筆未指定）"
    )
    return jsonify(people)


@app.route("/api/contacts", methods=["POST"])
@login_required
def create_contact():
    payload = request.get_json(force=True, silent=True)
    if not isinstance(payload, dict):
        _note("新增人員失敗：請求內容不是 JSON 物件")
        return jsonify({"error": "請求內容必須為 JSON 物件"}), 400

    emp_no = str(payload.get("empNo") or "").strip()
    if not emp_no:
        _note("新增人員失敗：未填工號")
        return jsonify({"error": "工號為必填欄位"}), 400
    if not _safe_no(emp_no):
        _note(f"新增人員失敗：工號含不支援的字元（輸入={emp_no}）")
        return jsonify({"error": "工號含不支援的字元"}), 400

    path = _person_path(emp_no)
    if os.path.exists(path):
        _note(f"新增人員失敗：工號 {emp_no} 已存在（比對 contacts/）")
        return jsonify({"error": f"工號 {emp_no} 已存在"}), 409

    unit = str(payload.pop("unit", "") or "").strip()
    units = _load_units()
    if units and not unit:
        _note(f"新增人員失敗：未選擇所屬單位（工號={emp_no}）")
        return jsonify({"error": "請選擇所屬單位"}), 400
    if unit and unit not in units:
        _note(f"新增人員失敗：單位「{unit}」不存在於 單位.json（工號={emp_no}）")
        return jsonify({"error": f"單位「{unit}」不存在於 單位.json"}), 400

    record = copy.deepcopy(EMPTY_RECORD)
    record.update(payload)
    record["empNo"] = emp_no
    record["eduTop"] = {
        **EMPTY_RECORD["eduTop"],
        **(payload.get("eduTop") or {}),
    }
    record["eduSecond"] = {
        **EMPTY_RECORD["eduSecond"],
        **(payload.get("eduSecond") or {}),
    }
    if not isinstance(record.get("experiences"), list):
        record["experiences"] = []
    # 入職清單：只有管理員送來的內容會採用，其他人一律用空白範本
    is_admin = _is_admin((_auth_user() or {}).get("username"))
    record["onboarding"] = _normalize_onboarding(payload.get("onboarding") if is_admin else None)
    record["lastModified"] = _now()

    save_person(record)
    if unit:
        _set_unit(emp_no, unit)

    filled = {
        key: value for key, value in record.items()
        if key not in ("lastModified", "onboarding") and value not in ("", [], {}, None)
        and value != EMPTY_RECORD.get(key)
    }
    _note(
        f"新增人員：{record.get('nameZh') or '未填姓名'}({emp_no})；"
        f"單位={unit or '未指定'}（工號已寫入 單位.json）；寫入資料={_j(filled)}；"
        f"入職清單已依範本建立 {len(record['onboarding'])} 項"
    )
    return jsonify(_with_unit(record)), 201


@app.route("/api/contacts/batch-delete", methods=["POST"])
@admin_required
def batch_delete_contacts():
    """一次移除多位人員的 JSON 與照片（僅限管理員）。"""
    payload = request.get_json(force=True, silent=True)
    if not isinstance(payload, dict):
        _note("移除人員失敗：請求內容不是 JSON 物件")
        return jsonify({"error": "請求內容必須為 JSON 物件"}), 400

    raw_emp_nos = payload.get("empNos")
    if not isinstance(raw_emp_nos, list):
        _note("移除人員失敗：empNos 不是陣列")
        return jsonify({"error": "empNos 必須為陣列"}), 400

    emp_nos = []
    seen = set()
    for value in raw_emp_nos:
        emp_no = str(value or "").strip()
        if emp_no and _safe_no(emp_no) and emp_no not in seen:
            seen.add(emp_no)
            emp_nos.append(emp_no)

    if not emp_nos:
        _note("移除人員失敗：未選擇任何人員")
        return jsonify({"error": "請至少選擇一位人員"}), 400

    deleted = []
    not_found = []
    failed = []

    deleted_names = {}
    with _lock:
        for emp_no in emp_nos:
            path = _person_path(emp_no)
            if not path or not os.path.exists(path):
                not_found.append(emp_no)
                continue

            try:
                try:
                    deleted_names[emp_no] = _read_json(path).get("nameZh") or "未填姓名"
                except (json.JSONDecodeError, OSError):
                    deleted_names[emp_no] = "未填姓名"
                os.remove(path)
                _remove_photo_files(emp_no)
                deleted.append(emp_no)
            except OSError as error:
                failed.append({"empNo": emp_no, "error": str(error)})

    for emp_no in deleted:
        try:
            _set_unit(emp_no, "")
        except (OSError, ValueError):
            pass

    if deleted:
        detail = "、".join(f"{deleted_names[no]}({no})" for no in deleted)
        _note(f"移除人員 {len(deleted)} 位：{detail}（已刪 contacts/ JSON 與照片，並自 單位.json 移除工號）")
    if not_found:
        _note(f"查無工號：{'、'.join(not_found)}（比對 contacts/ 無此檔）")
    for item in failed:
        logger.error(f"移除人員失敗 | 操作者={_log_user()} | 工號={item['empNo']} | {item['error']}")
        _note(f"移除失敗：{item['empNo']}（{item['error']}）")

    status_code = 200 if deleted or not failed else 500
    return jsonify(
        {
            "deleted": deleted,
            "notFound": not_found,
            "failed": failed,
        }
    ), status_code


@app.route("/api/contacts/<emp_no>", methods=["GET"])
@login_required
def get_contact(emp_no):
    person = load_person(emp_no)
    if person is None:
        _note(f"讀取人員資料失敗：contacts/ 內查無工號 {emp_no}")
        return jsonify({"error": "查無此工號"}), 404
    result = _with_unit(person)
    done = sum(1 for item in result["onboarding"] if item["done"])
    _note(
        f"讀取人員資料：{result.get('nameZh') or '未填姓名'}({result.get('empNo')})；"
        f"單位={result.get('unit') or '未指定'}（比對 單位.json）；"
        f"入職清單完成 {done}/{len(result['onboarding'])} 項"
    )
    return jsonify(result)


@app.route("/api/contacts/<emp_no>", methods=["PUT"])
@login_required
def update_contact(emp_no):
    payload = request.get_json(force=True, silent=True)
    if not isinstance(payload, dict):
        _note("更新人員失敗：請求內容不是 JSON 物件")
        return jsonify({"error": "請求內容必須為 JSON 物件"}), 400

    person = load_person(emp_no)
    if person is None:
        _note(f"更新人員失敗：contacts/ 內查無工號 {emp_no}")
        return jsonify({"error": "查無此工號"}), 404

    # unit 不寫進人員檔，只同步到 單位.json
    old_unit = _with_unit(person)["unit"]
    unit = payload.pop("unit", None)
    if unit is not None:
        unit = str(unit or "").strip()
        if unit and unit not in _load_units():
            _note(f"更新人員失敗：單位「{unit}」不存在於 單位.json")
            return jsonify({"error": f"單位「{unit}」不存在於 單位.json"}), 400

    # 入職清單權限：管理員可改全部；本人只能改 selfConfirmed；其他人忽略
    old_onboarding = _normalize_onboarding(person.get("onboarding"))
    if "onboarding" in payload:
        incoming = _normalize_onboarding(payload.pop("onboarding"))
        me = _auth_user() or {}
        is_admin = _is_admin(me.get("username"))
        is_self = str(me.get("username") or "").strip().upper() == str(person.get("empNo") or "").strip().upper()
        if is_admin:
            payload["onboarding"] = incoming
        elif is_self:
            payload["onboarding"] = [
                {**old, "selfConfirmed": new["selfConfirmed"]}
                for old, new in zip(old_onboarding, incoming)
            ]
        else:
            _note("入職清單異動已忽略：非管理員亦非本人")

    # 客戶端把 photoUrl 清空時，一併刪除檔案，避免留下孤兒照片
    if "photoUrl" in payload and not payload.get("photoUrl") and person.get("photoUrl"):
        _remove_photo_files(emp_no)

    # 以舊資料為底、只覆蓋有帶的欄位：部分更新不會把其他欄位洗掉
    record = {**person, **payload}
    record["empNo"] = person.get("empNo")
    record["onboarding"] = _normalize_onboarding(record.get("onboarding"))
    record["lastModified"] = _now()
    save_person(record)
    if unit is not None:
        _set_unit(record["empNo"], unit)

    # 逐欄位比對，記下誰改了什麼（舊值 → 新值）
    changes = [
        f"{key}: {_j(person.get(key))} → {_j(record.get(key))}"
        for key in sorted(set(person) | set(record))
        if key not in ("lastModified", "empNo", "onboarding") and person.get(key) != record.get(key)
    ]
    if unit is not None and unit != old_unit:
        changes.append(f"單位: {_j(old_unit)} → {_j(unit)}")
    old_items = {item["id"]: item for item in old_onboarding}
    for item in record["onboarding"]:
        old = old_items.get(item["id"], {})
        for field in ("done", "note", "selfConfirmed"):
            if old.get(field) != item.get(field):
                changes.append(f"入職[{item['name']}].{field}: {_j(old.get(field))} → {_j(item.get(field))}")
    if changes:
        _note(
            f"更新人員：{record.get('nameZh') or '未填姓名'}({record['empNo']})；"
            f"逐欄位比對後異動={'；'.join(changes)}"
        )
    else:
        _note(f"更新人員：{record.get('nameZh') or '未填姓名'}({record['empNo']})；逐欄位比對後無異動")
    return jsonify(_with_unit(record))


@app.route("/api/contacts/<emp_no>/photo", methods=["POST"])
@login_required
def upload_photo(emp_no):
    file = request.files.get("photo")
    if not file or not file.filename:
        _note("上傳照片失敗：未收到檔案")
        return jsonify({"error": "未收到檔案（欄位名應為 photo）"}), 400

    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else ""
    if ext not in ALLOWED_EXT:
        _note(f"上傳照片失敗：副檔名 {ext or '無'} 不支援")
        return jsonify({"error": "僅支援 png / jpg / jpeg / gif / webp"}), 400

    person = load_person(emp_no)
    if person is None:
        _note(f"上傳照片失敗：contacts/ 內查無工號 {emp_no}")
        return jsonify({"error": "查無此工號"}), 404

    safe_no = _safe_no(emp_no) or "user"
    _remove_photo_files(emp_no)

    filename = f"{safe_no}_{int(time.time())}.{ext}"
    save_path = os.path.join(PHOTO_DIR, filename)
    file.save(save_path)
    _note(
        f"上傳照片：{person.get('nameZh') or '未填姓名'}({emp_no})；"
        f"存為 photos/{filename}（{os.path.getsize(save_path)} bytes，舊照片已刪除）"
    )

    person["photoUrl"] = f"/photos/{filename}"
    person["lastModified"] = _now()
    save_person(person)
    return jsonify(_with_unit(person))


@app.route("/api/contacts/<emp_no>/photo", methods=["DELETE"])
@login_required
def delete_photo(emp_no):
    """移除個人照片：刪除 photos/ 內的檔案並清空 photoUrl。"""
    person = load_person(emp_no)
    if person is None:
        _note(f"移除照片失敗：contacts/ 內查無工號 {emp_no}")
        return jsonify({"error": "查無此工號"}), 404

    old_url = person.get("photoUrl") or ""
    _remove_photo_files(emp_no)
    person["photoUrl"] = ""
    person["lastModified"] = _now()
    save_person(person)
    _note(
        f"移除照片：{person.get('nameZh') or '未填姓名'}({emp_no})；"
        f"原檔={old_url or '無'}（檔案已刪除並清空 photoUrl）"
    )
    return jsonify(_with_unit(person))


if __name__ == "__main__":
    if os.environ.get("WERKZEUG_RUN_MAIN") != "true":
        logger.info(
            "伺服器啟動 | API=http://127.0.0.1:5000 | 頁面可直接雙擊 login.html 開啟（file://） | "
            f"Log 目錄：{os.path.join(BASE_DIR, 'Log')}"
        )
    app.run(host="0.0.0.0", port=5000, debug=True)