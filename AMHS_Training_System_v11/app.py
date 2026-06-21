from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from loguru import logger
import json, os, secrets, glob
from ldap3 import Server, Connection, ALL, NTLM # type: ignore
from ldap3.core.exceptions import LDAPException, LDAPBindError # type: ignore


app = Flask(__name__, static_folder='static')
CORS(app, origins='*', allow_headers=['Content-Type', 'X-Auth-Token'])

BASE_DIR  = os.path.dirname(__file__)
DATA_DIR  = os.path.join(BASE_DIR, 'data')
# DATA_DIR = rf"D:\Data\ChiChen_AMHS_值班訓練表單\data"
EMP_DIR   = os.path.join(DATA_DIR, 'employees')
LOG_DIR   = os.path.join(BASE_DIR, 'logs')
# LOG_DIR = rf"D:\Data\ChiChen_AMHS_值班訓練表單\logs"

os.makedirs(EMP_DIR, exist_ok=True)
os.makedirs(LOG_DIR, exist_ok=True)

# ─── Loguru：每天一個檔，保留 90 天 ──────────────────────────────────────────
logger.remove()
logger.add(
    os.path.join(LOG_DIR, '{time:YYYY-MM-DD}.log'),
    rotation='00:00',
    retention='90 days',
    encoding='utf-8',
    format='{time:YYYY-MM-DD HH:mm:ss} | {level:<8} | {message}',
    level='INFO',
)

# ─── Persistent token store ──────────────────────────────────────────────────
_TOKENS_FILE = os.path.join(DATA_DIR, 'tokens.json')

def _load_tokens():
    try:
        with open(_TOKENS_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return {}

def _save_tokens(tokens):
    try:
        with open(_TOKENS_FILE, 'w', encoding='utf-8') as f:
            json.dump(tokens, f, ensure_ascii=False)
    except Exception:
        pass

_tokens = _load_tokens()

# ─── Data helpers ─────────────────────────────────────────────────────────────
def _read(path):
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)

def _write(path, obj):
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(obj, f, ensure_ascii=False, indent=2)

def load_accounts():
    return _read(os.path.join(DATA_DIR, 'accounts.json'))

def save_accounts(accounts):
    _write(os.path.join(DATA_DIR, 'accounts.json'), accounts)

def load_signers():
    return _read(os.path.join(DATA_DIR, 'signers.json'))

def save_signers(signers):
    _write(os.path.join(DATA_DIR, 'signers.json'), signers)

def load_employees():
    employees = []
    for path in sorted(glob.glob(os.path.join(EMP_DIR, '*.json'))):
        if os.path.getsize(path) == 0:
            logger.warning(f"[DATA] 跳過空白檔案: {path}")
            continue
        try:
            employees.append(_read(path))
        except Exception as e:
            logger.error(f"[DATA] 讀取失敗 {path}: {e}")
    return employees

def save_employee(emp):
    """新增或更新單一員工檔案（以 empId 為檔名）"""
    _write(os.path.join(EMP_DIR, f"{emp['empId']}.json"), emp)

def delete_employee(emp_id):
    path = os.path.join(EMP_DIR, f'{emp_id}.json')
    if os.path.exists(path):
        os.remove(path)

# ─── Auth helpers ─────────────────────────────────────────────────────────────
def current_user():
    return _tokens.get(request.headers.get('X-Auth-Token', ''))

def who():
    u = current_user()
    return f"{u['empId']}({u.get('name','')})" if u else 'unknown'

def client_ip():
    return request.remote_addr or '-'

def require_login():
    if not current_user():
        return jsonify({'error': '請先登入'}), 401

def require_leader():
    u = current_user()
    if not u:
        return jsonify({'error': '請先登入'}), 401
    if u.get('role') != 'leader':
        return jsonify({'error': '權限不足'}), 403

# ─── Static files ─────────────────────────────────────────────────────────────
@app.route('/')
def index():
    return send_from_directory(app.static_folder, 'index.html')

@app.route('/app')
def app_page():
    return send_from_directory(app.static_folder, 'app.html')

@app.route('/<path:filename>')
def static_files(filename):
    return send_from_directory(app.static_folder, filename)

# ─── Auth ─────────────────────────────────────────────────────────────────────
def authenticate_user(username, password):
    try:
        server = Server('ldap://KHADDC02.kh.asegroup.com', get_info = ALL)
        # 使用 NTLM
        user = f'kh\\{username}'
        password = f'{password}'
        return True

        logger.info(f"帳號: {username} 密碼: {password}")
        # # 建立連接
        conn = Connection(server, user = user, password = password, authentication = NTLM)

        # # 嘗試綁定
        if conn.bind():
            logger.info(f"User {username} login successful.")
            return True
        else:
            logger.warning(f"Login failed for user {username}: {conn.last_error}")
            return False
    except Exception as e:
        # app.logger.error(f"Error during authentication for user {username}: {e}")
        return False




@app.route('/api/login', methods=['POST'])
def login():
    body   = request.get_json() or {}
    emp_id = body.get('empId', '').strip()
    pwd    = body.get('password', '')
    logger.info("帳號: ", emp_id, " 密碼: ", pwd)

    # 1. 工號與 AD 密碼都要輸入
    # 注意：這裡的密碼是 AD 密碼，不是 accounts.json 的 password
    if not emp_id:
        logger.warning(f"[LOGIN] 空白工號 | ip={client_ip()}")
        return jsonify({'error': '請輸入工號'}), 400

    if not pwd:
        logger.warning(f"[LOGIN] 空白 AD 密碼 | empId={emp_id} | ip={client_ip()}")
        return jsonify({'error': '請輸入 AD 密碼'}), 400

    # 2. 先讀取 accounts.json
    accounts = load_accounts()

    # 3. 只確認工號是否存在，不比對 password
    acct = next(
        (
            a for a in accounts
            if a.get('empId', '').strip().upper() == emp_id.upper()
        ),
        None
    )

    # 4. 如果 accounts.json 找不到工號，代表沒有系統權限
    if not acct:
        logger.warning(f"[LOGIN] 無系統權限 | empId={emp_id} | ip={client_ip()}")
        return jsonify({'error': '此工號尚未建立系統權限，無法登入'}), 403

    # 5. 工號存在後，再進行 AD 驗證
    if not authenticate_user(emp_id, pwd):
        logger.warning(f"[LOGIN] AD 驗證失敗 | empId={emp_id} | ip={client_ip()}")
        return jsonify({'error': 'AD 帳號或密碼錯誤，請重新輸入'}), 401

    # 6. AD 驗證成功後，用 accounts.json 的角色 / 姓名建立登入資訊
    token = secrets.token_hex(24)

    user = {
        'empId': acct.get('empId', emp_id),
        'role': acct.get('role', 'user'),
        'name': acct.get('name', emp_id)
    }

    _tokens[token] = user
    _save_tokens(_tokens)

    logger.info(
        f"[LOGIN] 成功 | empId={user['empId']} | role={user['role']} | ip={client_ip()}"
    )

    return jsonify({'user': user, 'token': token})





@app.route('/api/logout', methods=['POST'])
def logout():
    u = current_user()
    _tokens.pop(request.headers.get('X-Auth-Token', ''), None)
    _save_tokens(_tokens)
    if u:
        logger.info(f"[LOGOUT] | empId={u['empId']} | ip={client_ip()}")
    return jsonify({'ok': True})

# ─── State (employees + signers) ──────────────────────────────────────────────
@app.route('/api/state', methods=['GET'])
def get_state():
    err = require_login()
    if err: return err
    return jsonify({
        'employees': load_employees(),
        'signers':   load_signers(),
    })

# 欄位中文名稱對照
_FIELD_LABEL = {
    'learningItems':   '學習內容',
    'practiceItems':   '練習項目',
    'notes':           '備註',
    'mentorScore':     '學長評分',
    'mentorAttitude':  '態度分',
    'leaderScore':     'Leader評分',
    'total':           '總分',
    'mentorNote':      '學長備註',
    'leaderComment':   '長官評語',
}

def _v(val):
    """把空值顯示成 —"""
    return str(val).strip() if str(val).strip() else '—'

def _diff_employee(old_emp, new_emp):
    """比對單一員工，回傳每一筆具體變動的描述"""
    changes = []
    eid  = new_emp['empId']
    name = new_emp.get('name', eid)

    # ── 基本資料 ──
    for field, label in [('name','姓名'),('mentor','學長工號'),('leader','Leader工號'),
                          ('startDate','到職日'),('type','訓練類型')]:
        ov, nv = old_emp.get(field,''), new_emp.get(field,'')
        if ov != nv:
            changes.append(f"[{eid}] 基本資料 {label}: {_v(ov)} → {_v(nv)}")

    # ── OJT 紀錄 ──
    old_ojt = {r['id']: r for r in old_emp.get('ojtRecords', [])}
    for r in new_emp.get('ojtRecords', []):
        o    = old_ojt.get(r['id'], {})
        item = f"{r['id']}({r.get('name','')})"

        if str(r.get('score','')) != str(o.get('score','')):
            changes.append(
                f"[{eid}({name})] OJT {item} 分數: {_v(o.get('score'))} → {_v(r.get('score'))}")

        if r.get('mentorNote','') != o.get('mentorNote','') and r.get('mentorNote',''):
            changes.append(
                f"[{eid}({name})] OJT {item} 學長備註: 「{r['mentorNote']}」")

        if r.get('mentorSignerId','') != o.get('mentorSignerId','') and r.get('mentorSignerId'):
            changes.append(
                f"[{eid}({name})] OJT {item} 學長簽核 ← {r['mentorSignerId']}")

        if r.get('supervisorSignerId','') != o.get('supervisorSignerId','') and r.get('supervisorSignerId'):
            changes.append(
                f"[{eid}({name})] OJT {item} 主管簽核 ← {r['supervisorSignerId']}")

    # ── 每日訓練紀錄 ──
    old_daily = {r['day']: r for r in old_emp.get('dailyRecords', [])}
    for r in new_emp.get('dailyRecords', []):
        o   = old_daily.get(r['day'], {})
        day = r['day']

        # 數值欄位
        for field in ('mentorScore','mentorAttitude','leaderScore','total'):
            ov, nv = str(o.get(field,'')), str(r.get(field,''))
            if ov != nv and nv:
                changes.append(
                    f"[{eid}({name})] 第{day}天 {_FIELD_LABEL[field]}: {_v(ov)} → {_v(nv)}")

        # 文字欄位：記錄內容（截斷過長的）
        for field in ('learningItems','practiceItems','notes','leaderComment'):
            ov, nv = o.get(field,''), r.get(field,'')
            if ov != nv and nv:
                preview = nv.replace('\n', ' ')[:60]
                suffix  = '…' if len(nv) > 60 else ''
                changes.append(
                    f"[{eid}({name})] 第{day}天 {_FIELD_LABEL[field]}: 「{preview}{suffix}」")

        # 簽核
        if r.get('mentorSignerId','') != o.get('mentorSignerId','') and r.get('mentorSignerId'):
            changes.append(
                f"[{eid}({name})] 第{day}天 學長簽核 ← {r['mentorSignerId']}")
        if r.get('leaderSignerId','') != o.get('leaderSignerId','') and r.get('leaderSignerId'):
            changes.append(
                f"[{eid}({name})] 第{day}天 Leader簽核 ← {r['leaderSignerId']}")

    return changes


@app.route('/api/state', methods=['POST'])
def post_state():
    err = require_login()
    if err: return err
    body = request.get_json() or {}

    # ── Employees ──
    if 'employees' in body:
        new_emps    = body['employees']
        new_emp_map = {e['empId']: e for e in new_emps}
        old_emp_ids = {os.path.splitext(os.path.basename(p))[0]
                       for p in glob.glob(os.path.join(EMP_DIR, '*.json'))}
        new_emp_ids = set(new_emp_map.keys())

        added   = new_emp_ids - old_emp_ids
        removed = old_emp_ids - new_emp_ids
        all_changes = []

        for emp in new_emps:
            eid = emp['empId']
            if eid in old_emp_ids:
                try:
                    old_emp = _read(os.path.join(EMP_DIR, f'{eid}.json'))
                    all_changes.extend(_diff_employee(old_emp, emp))
                except Exception:
                    all_changes.append(f"{eid} 資料更新")
            save_employee(emp)

        for emp_id in removed:
            delete_employee(emp_id)

        detail = []
        if added:        detail.append(f"新增人員={'、'.join(added)}")
        if removed:      detail.append(f"移除人員={'、'.join(removed)}")
        if all_changes:  detail.extend(all_changes)

        if detail:
            for d in detail:
                logger.info(f"[WRITE:employees] {who()} | {d} | ip={client_ip()}")
        else:
            logger.info(f"[WRITE:employees] {who()} | (無變動) | ip={client_ip()}")

    # ── Signers ──
    if 'signers' in body:
        old_signers  = load_signers()
        new_signers  = body['signers']
        old_ids = {s['signerId'] for s in old_signers}
        new_ids = {s['signerId'] for s in new_signers}
        added_s   = new_ids - old_ids
        removed_s = old_ids - new_ids
        save_signers(new_signers)
        detail_s = []
        if added_s:   detail_s.append(f"新增={'、'.join(added_s)}")
        if removed_s: detail_s.append(f"移除={'、'.join(removed_s)}")
        if detail_s:
            logger.info(f"[WRITE:signers] {who()} | {' | '.join(detail_s)} | ip={client_ip()}")

    return jsonify({'ok': True, 'savedBy': current_user()['empId']})

# ─── Single employee save (prevents full-overwrite race condition) ────────────
@app.route('/api/employee/<emp_id>', methods=['POST'])
def post_employee(emp_id):
    err = require_login()
    if err: return err
    emp = request.get_json() or {}
    if emp.get('empId') != emp_id:
        return jsonify({'error': 'empId mismatch'}), 400
    try:
        old_emp = _read(os.path.join(EMP_DIR, f'{emp_id}.json'))
        changes = _diff_employee(old_emp, emp)
    except Exception:
        changes = [f"{emp_id} 資料新增"]
    save_employee(emp)
    if changes:
        for c in changes:
            logger.info(f"[WRITE:employee] {who()} | {c} | ip={client_ip()}")
    else:
        logger.info(f"[WRITE:employee] {who()} | {emp_id} (無變動) | ip={client_ip()}")
    return jsonify({'ok': True})


# ─── Patch single day record (by day number) ──────────────────────────────────
@app.route('/api/employee/<emp_id>/day-num/<int:day_num>', methods=['PATCH'])
def patch_employee_day_num(emp_id, day_num):
    err = require_login()
    if err: return err
    u = current_user()
    if u.get('role') != 'leader' and u.get('empId','').upper() != emp_id.upper():
        return jsonify({'error': '權限不足，只能修改自己的訓練紀錄'}), 403
    patch = request.get_json() or {}
    try:
        emp = _read(os.path.join(EMP_DIR, f'{emp_id}.json'))
    except Exception:
        return jsonify({'error': '找不到員工資料'}), 404
    rec = next((r for r in emp.get('dailyRecords', []) if r.get('day') == day_num), None)
    if rec is None:
        return jsonify({'error': f'找不到第 {day_num} 天紀錄'}), 404
    old_rec = dict(rec)
    _ALLOWED_DAY_FIELDS = {
        'learningItems','practiceItems','notes','leaderComment',
        'mentorScore','mentorAttitude','leaderScore',
        'mentorSignerId','leaderSignerId','date'
    }
    rec.update({k: v for k, v in patch.items() if k in _ALLOWED_DAY_FIELDS})
    ms = float(rec.get('mentorScore') or 0)
    ma = float(rec.get('mentorAttitude') or 0)
    ls = float(rec.get('leaderScore') or 0)
    rec['total'] = min(100, ms + ma + ls) if (ms or ma or ls) else ''
    save_employee(emp)
    date_label = rec.get('date') or f'第{day_num}天'
    for field, nv in patch.items():
        ov = str(old_rec.get(field, ''))
        nv_s = str(nv)
        if ov != nv_s and nv_s:
            fl = _FIELD_LABEL.get(field, field)
            if field in ('mentorScore', 'mentorAttitude', 'leaderScore', 'total'):
                logger.info(f"[PATCH:day] {who()} | [{emp_id}] 第{day_num}天({date_label}) {fl}: {_v(ov)} → {_v(nv_s)} | ip={client_ip()}")
            else:
                preview = nv_s.replace('\n', ' ')[:60]
                suffix = '…' if len(nv_s) > 60 else ''
                logger.info(f"[PATCH:day] {who()} | [{emp_id}] 第{day_num}天({date_label}) {fl}: 「{preview}{suffix}」 | ip={client_ip()}")
    return jsonify({'ok': True, 'total': rec['total']})

@app.route('/api/employee/<emp_id>', methods=['DELETE'])
def delete_employee_api(emp_id):
    err = require_leader()
    if err: return err
    delete_employee(emp_id)
    logger.info(f"[DELETE:employee] {who()} | empId={emp_id} | ip={client_ip()}")
    return jsonify({'ok': True})

# ─── Accounts (leader only) ───────────────────────────────────────────────────
@app.route('/api/accounts', methods=['GET'])
def get_accounts():
    err = require_leader()
    if err: return err
    return jsonify({'accounts': load_accounts()})

@app.route('/api/accounts', methods=['POST'])
def post_accounts():
    err = require_leader()
    if err: return err
    body     = request.get_json() or {}
    new_accts = body.get('accounts', [])
    old_accts = load_accounts()

    old_ids   = {a['empId'] for a in old_accts}
    new_ids   = {a['empId'] for a in new_accts}
    old_roles = {a['empId']: a['role'] for a in old_accts}
    new_roles = {a['empId']: a['role'] for a in new_accts}

    added   = new_ids - old_ids
    removed = old_ids - new_ids
    changed = [eid for eid in (old_ids & new_ids) if old_roles[eid] != new_roles[eid]]

    save_accounts(new_accts)

    detail = []
    if added:   detail.append(f"新增帳號={','.join(added)}")
    if removed: detail.append(f"移除帳號={','.join(removed)}")
    if changed: detail.append(f"角色變更={','.join(changed)}")
    logger.info(f"[WRITE:accounts] {who()} | {' | '.join(detail) or '帳號資料更新'} | ip={client_ip()}")

    save_accounts(new_accts)
    return jsonify({'ok': True})

if __name__ == "__main__":
    app.run(debug=True)
    # serve(app, host='10.11.99.84', port=8091)  
    # 原狀態
    # app.run(host="10.11.104.247", port=9017, debug=True)
    # 0971-50-2211 修哥電話