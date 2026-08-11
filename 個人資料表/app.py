# -*- coding: utf-8 -*-
"""
部門通訊錄 後端 API
------------------------------------------------
GET  /                              回傳前端頁面 index.html
GET  /api/contacts                  取得全部人員清單
POST /api/contacts                  新增人員（empNo 必填且不可重複）
GET  /api/contacts/<emp_no>         取得單筆人員資料
PUT  /api/contacts/<emp_no>         更新單筆人員資料（自動寫入 lastModified，empNo 為主鍵不可改）
POST /api/contacts/<emp_no>/photo   上傳個人照片（multipart，欄位名 photo），自動更新 photoUrl
GET  /photos/<filename>             提供照片檔案

資料儲存（本版重構）：
    每位人員一個獨立 JSON 檔，位於 contacts/ 資料夾，檔名為 工號.json
    例如：contacts/4563.json
    首次啟動時若偵測到舊版單一檔 contacts.json，會自動拆分成個別檔案，
    並將舊檔改名為 contacts.json.bak 保留備份。

照片儲存：photos/ 資料夾（檔名為 工號_時間戳.副檔名，上傳新照片時自動刪除舊檔）

啟動方式：
    pip install flask flask_cors
    python app.py
    瀏覽 http://127.0.0.1:5000
"""
import copy
import glob
import json
import os
import threading
import time
from datetime import datetime

from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
from werkzeug.utils import secure_filename

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CONTACT_DIR = os.path.join(BASE_DIR, "contacts")   # 每人一檔：contacts/工號.json
PHOTO_DIR = os.path.join(BASE_DIR, "photos")
LEGACY_FILE = os.path.join(BASE_DIR, "contacts.json")   # 舊版單一檔（自動遷移）
ALLOWED_EXT = {"png", "jpg", "jpeg", "gif", "webp"}
_lock = threading.Lock()

os.makedirs(CONTACT_DIR, exist_ok=True)
os.makedirs(PHOTO_DIR, exist_ok=True)

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 10 * 1024 * 1024  # 照片上限 10MB
CORS(app)  # 允許前端獨立開啟（file:// 或其他 port）時跨域呼叫

# 完整欄位範本：新增人員時以此為底，確保每筆資料欄位齊全
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

# 首次啟動且完全無資料時建立的範例
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


# ---------------------------------------------- 檔案存取（每人一檔）
def _safe_no(emp_no):
    """工號轉為安全檔名；含不支援字元時回傳空字串"""
    return secure_filename(str(emp_no).strip())


def _person_path(emp_no):
    safe = _safe_no(emp_no)
    return os.path.join(CONTACT_DIR, f"{safe}.json") if safe else None


def _read_json(path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def _write_json(path, obj):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=2)


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
                continue  # 略過損壞的檔案，不影響整體服務

    def sort_key(r):
        s = str(r.get("empNo", ""))
        return (0, int(s)) if s.isdigit() else (1, s)

    people.sort(key=sort_key)
    return people


def _migrate_or_seed():
    """舊版單一 contacts.json → 拆為每人一檔；完全無資料時建立範例"""
    if os.path.exists(LEGACY_FILE):
        try:
            old = _read_json(LEGACY_FILE)
            if isinstance(old, list):
                for person in old:
                    path = _person_path(person.get("empNo"))
                    if path and not os.path.exists(path):
                        _write_json(path, person)
            os.rename(LEGACY_FILE, LEGACY_FILE + ".bak")
            print(f"[migrate] 已將舊版 contacts.json 拆分至 {CONTACT_DIR}/，原檔備份為 contacts.json.bak")
        except (json.JSONDecodeError, OSError) as e:
            print(f"[migrate] 舊檔遷移失敗：{e}")

    if not glob.glob(os.path.join(CONTACT_DIR, "*.json")):
        _write_json(_person_path(SEED_RECORD["empNo"]), SEED_RECORD)


def _now():
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


_migrate_or_seed()


# ---------------------------------------------- 前端頁面與照片
@app.route("/")
def index():
    return send_from_directory(BASE_DIR, "index.html")


@app.route("/photos/<path:filename>")
def serve_photo(filename):
    return send_from_directory(PHOTO_DIR, filename)


# ---------------------------------------------- API
@app.route("/api/contacts", methods=["GET"])
def list_contacts():
    return jsonify(load_all())


@app.route("/api/contacts", methods=["POST"])
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

    # 以完整範本為底合併前端資料，確保欄位齊全
    record = copy.deepcopy(EMPTY_RECORD)
    record.update(payload)
    record["empNo"] = emp_no
    record["eduTop"] = {**EMPTY_RECORD["eduTop"], **(payload.get("eduTop") or {})}
    record["eduSecond"] = {**EMPTY_RECORD["eduSecond"], **(payload.get("eduSecond") or {})}
    if not isinstance(record.get("experiences"), list):
        record["experiences"] = []
    record["lastModified"] = _now()

    save_person(record)
    return jsonify(record), 201


@app.route("/api/contacts/<emp_no>", methods=["GET"])
def get_contact(emp_no):
    person = load_person(emp_no)
    if person is None:
        return jsonify({"error": "查無此工號"}), 404
    return jsonify(person)


@app.route("/api/contacts/<emp_no>", methods=["PUT"])
def update_contact(emp_no):
    payload = request.get_json(force=True, silent=True)
    if not isinstance(payload, dict):
        return jsonify({"error": "請求內容必須為 JSON 物件"}), 400

    person = load_person(emp_no)
    if person is None:
        return jsonify({"error": "查無此工號"}), 404

    payload["empNo"] = person.get("empNo")  # 主鍵不可修改
    payload["lastModified"] = _now()
    save_person(payload)
    return jsonify(payload)


@app.route("/api/contacts/<emp_no>/photo", methods=["POST"])
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
    # 刪除同工號的舊照片，避免檔案累積
    for old in glob.glob(os.path.join(PHOTO_DIR, f"{safe_no}_*")):
        try:
            os.remove(old)
        except OSError:
            pass
    filename = f"{safe_no}_{int(time.time())}.{ext}"
    file.save(os.path.join(PHOTO_DIR, filename))

    person["photoUrl"] = f"/photos/{filename}"
    person["lastModified"] = _now()
    save_person(person)
    return jsonify(person)


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)