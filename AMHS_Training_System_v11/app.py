from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from loguru import logger
import json, os, secrets, glob

app = Flask(__name__, static_folder='static')
CORS(app, origins='*', allow_headers=['Content-Type', 'X-Auth-Token'])

BASE_DIR  = os.path.dirname(__file__)
DATA_DIR  = os.path.join(BASE_DIR, 'data')
EMP_DIR   = os.path.join(DATA_DIR, 'employees')
LOG_DIR   = os.path.join(BASE_DIR, 'logs')

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

# ─── In-memory token store ────────────────────────────────────────────────────
_tokens = {}

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
@app.route('/api/login', methods=['POST'])
def login():
    body   = request.get_json() or {}
    emp_id = body.get('empId', '').strip()
    pwd    = body.get('password', '')
    if not emp_id or not pwd:
        logger.warning(f"[LOGIN] 空白工號或密碼 | ip={client_ip()}")
        return jsonify({'error': '請輸入工號與密碼'}), 400
    accounts = load_accounts()
    acct = next((a for a in accounts
                 if a['empId'] == emp_id and a['password'] == pwd), None)
    if not acct:
        logger.warning(f"[LOGIN] 失敗 | empId={emp_id} | ip={client_ip()}")
        return jsonify({'error': '工號或密碼錯誤，請重新輸入'}), 401
    token = secrets.token_hex(24)
    user  = {'empId': acct['empId'], 'role': acct['role'], 'name': acct['name']}
    _tokens[token] = user
    logger.info(f"[LOGIN] 成功 | empId={emp_id} | role={acct['role']} | ip={client_ip()}")
    return jsonify({'user': user, 'token': token})

@app.route('/api/logout', methods=['POST'])
def logout():
    u = current_user()
    _tokens.pop(request.headers.get('X-Auth-Token', ''), None)
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
        for field in ('learningItems','practiceItems','notes'):
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

if __name__ == '__main__':
    app.run(debug=True, port=5000)