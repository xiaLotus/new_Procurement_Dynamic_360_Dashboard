# -*- coding: utf-8 -*-
"""
部門通訊錄 後端 API
------------------------------------------------
頁面
GET  /index.html                    前端頁面（需登入，未登入導向 /login.html）
GET  /login.html                    登入頁（已登入則導向 /index.html）
GET  /  與 /login                   舊網址，分別轉向 /index.html 與 /login.html

登入
POST /api/login                     登入（username / password / remember）
POST /api/logout                    登出
GET  /api/me                        取得目前登入者

人員（以下皆需登入，未登入回 401）
GET  /api/units                     取得單位清單（單位.json 的 key，依檔案順序）
GET  /api/contacts                  取得全部人員清單（每筆附 unit：所屬單位名稱）
POST /api/contacts                  新增人員（empNo、unit 必填；工號會寫入 單位.json 該單位的清單）
POST /api/contacts/batch-delete     批次移除人員與其照片（僅限 admin.json 內的工號，其他人回 403）
GET  /api/contacts/<emp_no>         取得單筆人員資料
PUT  /api/contacts/<emp_no>         更新單筆人員資料（自動寫入 lastModified，empNo 為主鍵不可改；
                                    帶 unit 時會把工號搬到該單位）
POST /api/contacts/<emp_no>/photo   上傳個人照片（multipart，欄位名 photo），自動更新 photoUrl
DELETE /api/contacts/<emp_no>/photo 移除個人照片（刪除檔案並清空 photoUrl）
GET  /photos/<filename>             提供照片檔案（需登入）

登入驗證
    本程式不儲存任何帳號密碼。登入頁把 username / password 送到 POST /api/login，
    由 verify_credentials() 決定是否放行，通過後只在 session 記住工號與姓名。
    登入條件：
        1. username 必須是 contacts/ 內已存在的工號（不分大小寫）
        2. 該筆資料已填寫中文姓名（nameZh）
        3. 密碼有輸入（目前不比對內容；要接公司驗證只需改 verify_credentials）
    Session 金鑰自動產生並存於 .secret_key（請加入 .gitignore），或以環境變數 DIRECTORY_SECRET_KEY 指定。

管理員
    admin.json 內列出的工號才有「移除人員」權限，格式：{"admin": ["K18251", "C9228"]}
    每次請求都會重新讀取，修改後不用重啟、也不用重新登入。

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

啟動方式：
    pip install flask flask_cors
    python app.py
    瀏覽 http://127.0.0.1:5000（登入後才能使用；請以 http 開啟，不支援直接開啟 index.html 檔案）
"""

import copy
import glob
import json
import os
import secrets
import threading
import time
from datetime import datetime, timedelta
from functools import wraps

from flask import Flask, jsonify, redirect, request, send_from_directory, session, url_for
from flask_cors import CORS
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
        print(f"[auth] 無法寫入 .secret_key（{error}），重啟後所有人需重新登入")
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


INDEX_URL = "/index.html"
LOGIN_URL = "/login.html"


def _safe_next(target):
    """只允許站內相對路徑，避免登入後被導向外部網址；預設回 index.html。"""
    target = str(target or "")
    if target.startswith("/") and not target.startswith(("//", "/\\")):
        return target
    return INDEX_URL


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


def _current_user():
    """session 內的登入者，附上即時計算的 isAdmin。"""
    user = session.get("user") or {}
    return {**user, "isAdmin": _is_admin(user.get("username"))}


def login_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        if session.get("user"):
            return view(*args, **kwargs)
        if request.path.startswith(("/api/", "/photos/")):
            return jsonify({"error": "未登入或登入已逾期", "code": "UNAUTHORIZED"}), 401
        next_url = request.full_path if request.query_string else request.path
        if next_url in ("/", "/?", INDEX_URL):
            return redirect(LOGIN_URL)
        return redirect(url_for("login_page", next=next_url))

    return wrapped


def admin_required(view):
    """需先登入，且工號列在 admin.json 內。"""
    @wraps(view)
    @login_required
    def wrapped(*args, **kwargs):
        if not _is_admin(session["user"].get("username")):
            return jsonify({"error": "只有管理員可以移除人員", "code": "FORBIDDEN"}), 403
        return view(*args, **kwargs)

    return wrapped


@app.route("/login.html")
def login_page():
    if session.get("user"):
        return redirect(_safe_next(request.args.get("next")))
    return send_from_directory(BASE_DIR, "login.html")


@app.route("/login")
def login_legacy():
    return redirect(LOGIN_URL)


@app.route("/api/login", methods=["POST"])
def api_login():
    payload = request.get_json(force=True, silent=True)
    if not isinstance(payload, dict):
        return jsonify({"error": "請求內容必須為 JSON 物件"}), 400

    username = str(payload.get("username") or "").strip()
    password = str(payload.get("password") or "")
    remember = bool(payload.get("remember"))
    if not username or not password:
        return jsonify({"error": "請輸入工號與密碼"}), 400

    person, error = verify_credentials(username, password)
    if error:
        return jsonify({"error": error}), 401

    # 密碼用完即丟，不寫入任何地方；session 只記工號與中文姓名
    session.clear()
    session.permanent = remember
    session["user"] = {
        "username": str(person.get("empNo") or username),
        "name": str(person.get("nameZh") or "").strip(),
        "loginAt": _now(),
    }
    return jsonify({"ok": True, "user": _current_user()})


@app.route("/api/logout", methods=["POST"])
def api_logout():
    session.clear()
    return jsonify({"ok": True})


@app.route("/api/me", methods=["GET"])
@login_required
def api_me():
    return jsonify(_current_user())


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
    print(f"成功載入 {len(people)} 筆人員資料")
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
        print(f"[photos] 已清除 {removed} 個未被引用的照片檔")


def _mark_initialized():
    try:
        with open(INIT_MARKER, "a", encoding="utf-8"):
            pass
    except OSError as error:
        print(f"[init] 無法建立初始化標記：{error}")


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
            print(
                f"[migrate] 已將舊版 contacts.json 拆分至 {CONTACT_DIR}/，"
                "原檔備份為 contacts.json.bak"
            )
        except (json.JSONDecodeError, OSError) as error:
            print(f"[migrate] 舊檔遷移失敗：{error}")

    has_records = bool(glob.glob(os.path.join(CONTACT_DIR, "*.json")))
    if not has_records and not os.path.exists(INIT_MARKER):
        _write_json(_person_path(SEED_RECORD["empNo"]), SEED_RECORD)

    _mark_initialized()


_migrate_or_seed()
_cleanup_orphan_photos()
if not os.path.exists(ADMIN_FILE):
    print("[admin] 找不到 admin.json，目前沒有任何人能移除人員")


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
    """回傳附上 unit 欄位的副本（不寫回人員檔）。"""
    mapping = _unit_map() if mapping is None else mapping
    result = dict(person)
    result["unit"] = mapping.get(str(person.get("empNo") or "").strip().upper(), "")
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
    return jsonify({"units": list(_load_units().keys())})


# ---------------------------------------------- 前端頁面與照片
@app.after_request
def _no_cache(response):
    """頁面與 API 一律不快取，避免更新 index.html 後瀏覽器仍顯示舊版。"""
    if request.path.startswith("/api/") or request.path.endswith(".html") or request.path in ("/", "/login"):
        response.headers["Cache-Control"] = "no-store"
    return response


@app.route("/index.html")
@login_required
def index():
    return send_from_directory(BASE_DIR, "index.html")


@app.route("/")
def index_legacy():
    return redirect(INDEX_URL)


@app.route("/photos/<path:filename>")
@login_required
def serve_photo(filename):
    return send_from_directory(PHOTO_DIR, filename)


# ---------------------------------------------- API
@app.route("/api/contacts", methods=["GET"])
@login_required
def list_contacts():
    mapping = _unit_map()
    return jsonify([_with_unit(person, mapping) for person in load_all()])


@app.route("/api/contacts", methods=["POST"])
@login_required
def create_contact():
    payload = request.get_json(force=True, silent=True)
    if not isinstance(payload, dict):
        return jsonify({"error": "請求內容必須為 JSON 物件"}), 400

    emp_no = str(payload.get("empNo") or "").strip()
    if not emp_no:
        return jsonify({"error": "工號為必填欄位"}), 400
    if not _safe_no(emp_no):
        return jsonify({"error": "工號含不支援的字元"}), 400

    path = _person_path(emp_no)
    if os.path.exists(path):
        return jsonify({"error": f"工號 {emp_no} 已存在"}), 409

    unit = str(payload.pop("unit", "") or "").strip()
    units = _load_units()
    if units and not unit:
        return jsonify({"error": "請選擇所屬單位"}), 400
    if unit and unit not in units:
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
    record["lastModified"] = _now()

    save_person(record)
    if unit:
        _set_unit(emp_no, unit)
    return jsonify(_with_unit(record)), 201


@app.route("/api/contacts/batch-delete", methods=["POST"])
@admin_required
def batch_delete_contacts():
    """一次移除多位人員的 JSON 與照片（僅限管理員）。"""
    payload = request.get_json(force=True, silent=True)
    if not isinstance(payload, dict):
        return jsonify({"error": "請求內容必須為 JSON 物件"}), 400

    raw_emp_nos = payload.get("empNos")
    if not isinstance(raw_emp_nos, list):
        return jsonify({"error": "empNos 必須為陣列"}), 400

    emp_nos = []
    seen = set()
    for value in raw_emp_nos:
        emp_no = str(value or "").strip()
        if emp_no and _safe_no(emp_no) and emp_no not in seen:
            seen.add(emp_no)
            emp_nos.append(emp_no)

    if not emp_nos:
        return jsonify({"error": "請至少選擇一位人員"}), 400

    deleted = []
    not_found = []
    failed = []

    with _lock:
        for emp_no in emp_nos:
            path = _person_path(emp_no)
            if not path or not os.path.exists(path):
                not_found.append(emp_no)
                continue

            try:
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
        return jsonify({"error": "查無此工號"}), 404
    return jsonify(_with_unit(person))


@app.route("/api/contacts/<emp_no>", methods=["PUT"])
@login_required
def update_contact(emp_no):
    payload = request.get_json(force=True, silent=True)
    if not isinstance(payload, dict):
        return jsonify({"error": "請求內容必須為 JSON 物件"}), 400

    person = load_person(emp_no)
    if person is None:
        return jsonify({"error": "查無此工號"}), 404

    # unit 不寫進人員檔，只同步到 單位.json
    unit = payload.pop("unit", None)
    if unit is not None:
        unit = str(unit or "").strip()
        if unit and unit not in _load_units():
            return jsonify({"error": f"單位「{unit}」不存在於 單位.json"}), 400

    # 客戶端把 photoUrl 清空時，一併刪除檔案，避免留下孤兒照片
    if "photoUrl" in payload and not payload.get("photoUrl") and person.get("photoUrl"):
        _remove_photo_files(emp_no)

    payload["empNo"] = person.get("empNo")
    payload["lastModified"] = _now()
    save_person(payload)
    if unit is not None:
        _set_unit(payload["empNo"], unit)
    return jsonify(_with_unit(payload))


@app.route("/api/contacts/<emp_no>/photo", methods=["POST"])
@login_required
def upload_photo(emp_no):
    file = request.files.get("photo")
    if not file or not file.filename:
        return jsonify({"error": "未收到檔案（欄位名應為 photo）"}), 400

    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else ""
    if ext not in ALLOWED_EXT:
        return jsonify({"error": "僅支援 png / jpg / jpeg / gif / webp"}), 400

    person = load_person(emp_no)
    if person is None:
        return jsonify({"error": "查無此工號"}), 404

    safe_no = _safe_no(emp_no) or "user"
    _remove_photo_files(emp_no)

    filename = f"{safe_no}_{int(time.time())}.{ext}"
    file.save(os.path.join(PHOTO_DIR, filename))

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
        return jsonify({"error": "查無此工號"}), 404

    _remove_photo_files(emp_no)
    person["photoUrl"] = ""
    person["lastModified"] = _now()
    save_person(person)
    return jsonify(_with_unit(person))


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)