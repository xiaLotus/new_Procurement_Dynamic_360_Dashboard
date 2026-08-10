# -*- coding: utf-8 -*-
"""
A3 Flip Chip CIM 個人介紹表 - 後端 API
Flask + Flask-CORS
- 資料以 JSON 檔儲存於 data/ (以工號為檔名)
- 照片儲存於 uploads/
安裝:  pip install flask flask-cors
啟動:  python app.py   ->  http://localhost:5000
"""
import os
import json
import time
import uuid
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
UPLOAD_DIR = os.path.join(BASE_DIR, "uploads")
ALLOWED_EXT = {".jpg", ".jpeg", ".png", ".gif", ".webp"}
MAX_PHOTO_MB = 8

os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(UPLOAD_DIR, exist_ok=True)

app = Flask(__name__, static_folder=BASE_DIR, static_url_path="")
app.config["MAX_CONTENT_LENGTH"] = MAX_PHOTO_MB * 1024 * 1024
CORS(app)  # 允許前端跨網域呼叫


# ---------- 靜態頁面 ----------
@app.route("/")
def index():
    return send_from_directory(BASE_DIR, "index.html")


@app.route("/uploads/<path:filename>")
def serve_upload(filename):
    return send_from_directory(UPLOAD_DIR, filename)


# ---------- 工具 ----------
def _safe_emp_no(emp_no: str) -> str:
    """僅允許英數與 - _,避免路徑注入"""
    return "".join(c for c in (emp_no or "") if c.isalnum() or c in "-_")


def _profile_path(emp_no: str) -> str:
    return os.path.join(DATA_DIR, f"{_safe_emp_no(emp_no)}.json")


# ---------- API ----------
@app.route("/api/profiles", methods=["GET"])
def list_profiles():
    """列出所有已儲存的個人介紹表(摘要)"""
    items = []
    for fn in sorted(os.listdir(DATA_DIR)):
        if not fn.endswith(".json"):
            continue
        try:
            with open(os.path.join(DATA_DIR, fn), "r", encoding="utf-8") as f:
                d = json.load(f)
            items.append({
                "empNo": d.get("empNo", fn[:-5]),
                "nameZh": d.get("nameZh", ""),
                "nameEn": d.get("nameEn", ""),
                "title": d.get("title", ""),
                "grade": d.get("grade", ""),
                "phone": d.get("phone", ""),
                "mobile": d.get("mobile", ""),
                "hireDate": d.get("hireDate", ""),
                "photoUrl": d.get("photoUrl", ""),
                "lastModified": d.get("lastModified", ""),
            })
        except Exception:
            continue
    return jsonify({"ok": True, "items": items})


@app.route("/api/profile/<emp_no>", methods=["GET"])
def get_profile(emp_no):
    path = _profile_path(emp_no)
    if not os.path.exists(path):
        return jsonify({"ok": False, "error": "查無此工號資料"}), 404
    with open(path, "r", encoding="utf-8") as f:
        return jsonify({"ok": True, "data": json.load(f)})


@app.route("/api/profile", methods=["POST"])
def save_profile():
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"ok": False, "error": "請提供 JSON 資料"}), 400
    emp_no = _safe_emp_no(data.get("empNo", ""))
    if not emp_no:
        return jsonify({"ok": False, "error": "工號 (empNo) 為必填"}), 400

    data["empNo"] = emp_no
    data["lastModified"] = time.strftime("%Y-%m-%d %H:%M:%S")
    with open(_profile_path(emp_no), "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    return jsonify({"ok": True, "lastModified": data["lastModified"]})


@app.route("/api/profile/<emp_no>", methods=["DELETE"])
def delete_profile(emp_no):
    path = _profile_path(emp_no)
    if os.path.exists(path):
        os.remove(path)
        return jsonify({"ok": True})
    return jsonify({"ok": False, "error": "查無此工號資料"}), 404


@app.route("/api/upload", methods=["POST"])
def upload_photo():
    """上傳照片,回傳可存取的 URL"""
    if "photo" not in request.files:
        return jsonify({"ok": False, "error": "缺少 photo 欄位"}), 400
    f = request.files["photo"]
    if not f.filename:
        return jsonify({"ok": False, "error": "未選擇檔案"}), 400
    ext = os.path.splitext(f.filename)[1].lower()
    if ext not in ALLOWED_EXT:
        return jsonify({"ok": False, "error": f"僅接受 {', '.join(sorted(ALLOWED_EXT))}"}), 400

    fname = f"{time.strftime('%Y%m%d%H%M%S')}_{uuid.uuid4().hex[:8]}{ext}"
    f.save(os.path.join(UPLOAD_DIR, fname))
    return jsonify({"ok": True, "url": f"/uploads/{fname}"})


@app.errorhandler(413)
def too_large(_):
    return jsonify({"ok": False, "error": f"檔案超過 {MAX_PHOTO_MB}MB 限制"}), 413


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)