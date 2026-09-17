from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from loguru import logger
import json, os, secrets, glob, time, copy, csv, hashlib
from ldap3 import Server, Connection, ALL, NTLM # type: ignore
from ldap3.core.exceptions import LDAPException, LDAPBindError # type: ignore
from filelock import FileLock

app = Flask(__name__, static_folder='static')
# 前端(IIS)與 API(Flask)分屬不同埠,需允許跨來源。
# 上線後建議把 origins 收斂為實際站台來源,例如:
#   CORS(app, origins=['http://10.11.104.247:9017'], allow_headers=['Content-Type', 'X-Auth-Token'])
CORS(app, origins='*', allow_headers=['Content-Type', 'X-Auth-Token'])

BASE_DIR  = os.path.dirname(__file__)
DATA_DIR  = os.path.join(BASE_DIR, 'data')
# DATA_DIR = rf"D:\Data\ChiChen_AMHS_值班訓練表單\data"
# DATA_DIR  = rf"D:\Data\KL思維_新人值班訓練表單\data"
EMP_DIR   = os.path.join(DATA_DIR, 'employees')
LOG_DIR   = os.path.join(BASE_DIR, 'logs')
# LOG_DIR = rf"D:\Data\ChiChen_AMHS_值班訓練表單\logs"
# LOG_DIR = rf"D:\Data\KL思維_新人值班訓練表單\logs"

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

# ─── Persistent token store & File Lock ──────────────────────────────────────
_TOKENS_FILE = os.path.join(DATA_DIR, 'tokens.json')
LOCK_FILE = os.path.join(DATA_DIR, '.data.lock')
lock = FileLock(LOCK_FILE, timeout=10) # 等待鎖的最長時間為 10 秒

# Token 有效期限(秒),預設 12 小時,可用環境變數 TOKEN_TTL 覆寫
TOKEN_TTL = int(os.environ.get('TOKEN_TTL', 12 * 3600))

def _prune_tokens(tokens):
    """移除過期 token,回傳是否有變動"""
    now = time.time()
    expired = [t for t, u in tokens.items()
               if now - u.get('created', 0) > TOKEN_TTL]
    for t in expired:
        tokens.pop(t, None)
    return bool(expired)

def _load_tokens():
    try:
        with open(_TOKENS_FILE, 'r', encoding='utf-8') as f:
            tokens = json.load(f)
    except Exception:
        return {}
    # 舊格式的 token 沒有 created 欄位 → 視為已過期,一律清除
    tokens = {t: u for t, u in tokens.items() if u.get('created')}
    _prune_tokens(tokens)
    return tokens

def _save_tokens(tokens):
    try:
        tmp = _TOKENS_FILE + '.tmp'
        with open(tmp, 'w', encoding='utf-8') as f:
            json.dump(tokens, f, ensure_ascii=False)
        os.replace(tmp, _TOKENS_FILE)
    except Exception as e:
        logger.error(f"[TOKEN] 寫入 tokens.json 失敗: {e}")

_tokens = _load_tokens()
_save_tokens(_tokens)  # 啟動時立即把清理結果寫回

# ─── Data helpers ─────────────────────────────────────────────────────────────
def _read(path):
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)

def _write(path, obj):
    """Atomic Write:先寫入暫存檔,成功後再以 os.replace 原子性覆蓋,
    避免寫入中途程序中斷造成 JSON 檔案損毀。"""
    tmp = path + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(obj, f, ensure_ascii=False, indent=2)
    os.replace(tmp, path)

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
    token = request.headers.get('X-Auth-Token', '')
    u = _tokens.get(token)
    if u and time.time() - u.get('created', 0) > TOKEN_TTL:
        # token 已過期,移除並視為未登入
        _tokens.pop(token, None)
        _save_tokens(_tokens)
        return None
    return u

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
        user = f'kh\\{username}'
        return True

        conn = Connection(server, user = user, password = password, authentication = NTLM)
        if conn.bind():
            logger.info(f"User {username} login successful.")
            return True
        else:
            logger.warning(f"Login failed for user {username}: {conn.last_error}")
            return False
    except Exception as e:
        return False

@app.route('/api/login', methods=['POST'])
def login():
    body   = request.get_json() or {}
    emp_id = body.get('empId', '').strip()
    pwd    = body.get('password', '')
    
    # ⚠️ 資安提醒：正式環境請勿將密碼印出於 Log (已為您註解)
    # logger.info("帳號: ", emp_id, " 密碼: ", pwd)

    if not emp_id:
        logger.warning(f"[LOGIN] 空白工號 | ip={client_ip()}")
        return jsonify({'error': '請輸入工號'}), 400

    if not pwd:
        logger.warning(f"[LOGIN] 空白 AD 密碼 | empId={emp_id} | ip={client_ip()}")
        return jsonify({'error': '請輸入 AD 密碼'}), 400

    accounts = load_accounts()
    acct = next((a for a in accounts if a.get('empId', '').strip().upper() == emp_id.upper()), None)

    if not acct:
        logger.warning(f"[LOGIN] 無系統權限 | empId={emp_id} | ip={client_ip()}")
        return jsonify({'error': '此工號尚未建立系統權限，無法登入'}), 403

    if not authenticate_user(emp_id, pwd):
        logger.warning(f"[LOGIN] AD 驗證失敗 | empId={emp_id} | ip={client_ip()}")
        return jsonify({'error': 'AD 帳號或密碼錯誤，請重新輸入'}), 401

    token = secrets.token_hex(24)
    user = {
        'empId': acct.get('empId', emp_id),
        'role': acct.get('role', 'user'),
        'name': acct.get('name', emp_id),
        'created': time.time(),   # token 建立時間,用於過期判斷
    }

    _prune_tokens(_tokens)  # 順手清除過期 token,避免 tokens.json 無限成長
    _tokens[token] = user
    _save_tokens(_tokens)

    logger.info(f"[LOGIN] 成功 | empId={user['empId']} | role={user['role']} | ip={client_ip()}")
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
    employees = load_employees()
    # 員工檔沒有 security(認證資訊)時,直接以 CSV 內容補進去並寫回檔案
    with lock:
        for emp in employees:
            if _ensure_security(emp):
                save_employee(emp)
                logger.info(f"[SECURITY] {emp.get('empId')} 無認證資料,已由 CSV 補入 {len(emp['security'])} 項")
    return jsonify({
        'employees': employees,
        'signers':   load_signers(),
    })

_FIELD_LABEL = {
    'learningItems':   '學習內容', 'practiceItems':   '練習項目', 'notes':           '備註',
    'mentorScore':     '學長評分', 'mentorAttitude':  '態度分',   'leaderScore':     'Leader評分',
    'total':           '總分',     'mentorNote':      '學長備註', 'leaderComment':   '長官評語',
}

# ─── 組別設定 ─────────────────────────────────────────────────────────────────
# 各組別可看到的權限項目「格子數」(直接取 1~N 項):
#   RR = 15 格(全部)、值班 = 14 格、保養組 = 13 格
GROUPS = ['RR', '值班', '保養組']
GROUP_ITEM_LIMITS = {'RR': 15, '值班': 14, '保養組': 13}

def group_item_limit(emp):
    """回傳該員工組別可使用的權限項目數;未設定組別時「預設視為值班」(14 項)"""
    return GROUP_ITEM_LIMITS.get(emp.get('group') or '值班', GROUP_ITEM_LIMITS['值班'])

# [新增] Onboarding 預設模板 (用於舊資料自動補齊)
# selfConfirmed = 本人確認(由員工本人勾選);done = 完成(由主管勾選)
_DEFAULT_ONBOARDING = [
    {"id": 1, "name": "個人基本資料（入賴群）", "done": False, "note": "", "selfConfirmed": False},
    {"id": 2, "name": "開通 AD", "done": False, "note": "", "selfConfirmed": False},
    {"id": 3, "name": "開通 Notes ID（含設定）", "done": False, "note": "", "selfConfirmed": False},
    {"id": 4, "name": "MES 相關申請（含設定）", "done": False, "note": "", "selfConfirmed": False},
    {"id": 5, "name": "PIP 拍照申請", "done": False, "note": "", "selfConfirmed": False},
    {"id": 6, "name": "NDA 保密義務承諾書", "done": False, "note": "", "selfConfirmed": False},
    {"id": 7, "name": "門禁開通", "done": False, "note": "", "selfConfirmed": False},
    {"id": 8, "name": "無塵服申請", "done": False, "note": "", "selfConfirmed": False},
    {"id": 9, "name": "停車證申請", "done": False, "note": "", "selfConfirmed": False},
    {"id": 10, "name": "廠區介紹六六", "done": False, "note": "", "selfConfirmed": False},
    {"id": 11, "name": "資安宣導", "done": False, "note": "", "selfConfirmed": False},
    {"id": 12, "name": "配件領取（無塵袋〈大、小〉、安全帽）", "done": False, "note": "", "selfConfirmed": False},
    {"id": 13, "name": "新人課程", "done": False, "note": "", "selfConfirmed": False},
    {"id": 14, "name": "個人槽使用申請（工程師）", "done": False, "note": "", "selfConfirmed": False},
    {"id": 15, "name": "外網權限（工程師）", "done": False, "note": "", "selfConfirmed": False}
]


# ─── Security C 權限清單(KL_Security_C.csv)────────────────────────────────
# data/KL_Security_C.csv 本身就是「全員範本」(獨立模板檔,UTF-8 BOM、CRLF、9 欄,
# 子項目可含引號內換行,一律以 csv 模組讀寫)。姓名 / 工號 / 是否具備 三欄在範本中一律留空,
# 顯示時姓名 / 工號取員工資料;是否具備存在各員工 <empId>.json 的 security 欄位。
# 「全員新增 / 全員移除」會同步改寫這個 CSV(新增 → 追加一列;移除 → 刪掉該列)。
# 項目 id 由「分類|項目|子項目|功能說明」內容雜湊產生(重複列加 _2、_3 序號),
# 因此手動編輯 CSV 時若改動這四欄,該項目視為新項目、員工原本的勾選會對不上。
def _find_security_csv():
    """依序在 data/ 與 app.py 同層尋找模板檔;檔名允許 KL_Security_C.csv、KL_Security C.csv、
    KL_Security (C).csv … 等變體(KL_Security 開頭的 .csv)。找不到則回傳 data/KL_Security_C.csv 供之後寫入。"""
    for d in (DATA_DIR, BASE_DIR):
        for name in ('KL_Security_C.csv', 'KL_Security C.csv', 'KL_(Security C).csv', 'KL_Security (C).csv'):
            p = os.path.join(d, name)
            if os.path.exists(p):
                return p
        found = sorted(glob.glob(os.path.join(d, 'KL_Security*.csv')))
        if found:
            return found[0]
    return os.path.join(DATA_DIR, 'KL_Security_C.csv')

SECURITY_CSV = _find_security_csv()
if os.path.exists(SECURITY_CSV):
    logger.info(f"[SECURITY] 使用模板檔: {SECURITY_CSV}")
else:
    logger.warning(f"[SECURITY] 找不到模板檔 KL_Security*.csv(已搜尋 {DATA_DIR} 與 {BASE_DIR}),認證資訊將為空")
_SEC_CSV_HEADER  = ['是否為認證項目', '姓名', '工號', '分類', '項目', '子項目', '功能說明', '是否具備', '廠商或工程師認證']
_SEC_ITEM_FIELDS = ('category', 'item', 'subItem', 'desc', 'isCert', 'cert')

def _sec_item(category='', item='', subItem='', desc='', isCert=False, cert='', has=False, note='', item_id=None):
    return {
        'id':       item_id or ('U' + secrets.token_hex(4)),
        'isCert':   bool(isCert),      # 是否為認證項目
        'category': str(category).strip(),   # 分類
        'item':     str(item).strip(),       # 項目
        'subItem':  str(subItem).strip(),    # 子項目
        'desc':     str(desc).strip(),       # 功能說明
        'has':      bool(has),         # 是否具備(勾選)
        'cert':     str(cert).strip(), # 廠商或工程師認證
        'note':     str(note),
    }

def _sec_content_id(it, seen):
    """以內容產生穩定 id;同內容重複時加序號。"""
    key  = '|'.join(it[k] for k in ('category', 'item', 'subItem', 'desc'))
    base = 'S' + hashlib.md5(key.encode('utf-8')).hexdigest()[:8]
    n = seen.get(base, 0) + 1
    seen[base] = n
    return base if n == 1 else f'{base}_{n}'

def load_security_template():
    """讀取 KL_Security_C.csv → 範本項目清單(has 一律 False)。"""
    items = []
    if not os.path.exists(SECURITY_CSV):
        logger.warning(f"[SECURITY] 找不到 {SECURITY_CSV},範本為空")
        return items
    with open(SECURITY_CSV, 'r', encoding='utf-8-sig', newline='') as f:
        rows = [r for r in csv.reader(f) if any(c.strip() for c in r)]
    seen = {}
    for r in rows:
        r = list(r) + [''] * (9 - len(r))
        if r[1].strip() == '姓名' or r[0].strip() == '是否為認證項目':
            continue  # 標題列
        it = _sec_item(category=r[3], item=r[4], subItem=r[5], desc=r[6],
                       isCert=bool(r[0].strip()), cert=r[8], has=False)
        it['id'] = _sec_content_id(it, seen)
        items.append(it)
    return items

def save_security_template(items):
    """把範本清單寫回 KL_Security_C.csv(原子寫入,姓名 / 工號 / 是否具備 留空)。"""
    tmp = SECURITY_CSV + '.tmp'
    with open(tmp, 'w', encoding='utf-8-sig', newline='') as f:
        w = csv.writer(f, lineterminator='\r\n')
        w.writerow(_SEC_CSV_HEADER)
        for it in items:
            w.writerow(['認證項目' if it.get('isCert') else '', '', '',
                        it.get('category', ''), it.get('item', ''), it.get('subItem', ''),
                        it.get('desc', ''), '', it.get('cert', '')])
    os.replace(tmp, SECURITY_CSV)

def _ensure_security(emp):
    """員工若沒有 security 清單 → 以範本補齊(全部未具備)。回傳是否有補。"""
    if isinstance(emp.get('security'), list) and emp['security']:
        return False
    emp['security'] = copy.deepcopy(load_security_template())
    return True

def _sec_from_body(body):
    """從請求內容組出一筆項目;項目名稱必填。"""
    item = _sec_item(
        category=body.get('category', ''), item=body.get('item', ''),
        subItem=body.get('subItem', ''), desc=body.get('desc', ''),
        isCert=body.get('isCert', False), cert=body.get('cert', ''),
    )
    if not item['item']:
        return None
    return item

def _sec_label(it):
    return ' / '.join(x for x in (it.get('category'), it.get('item'), it.get('subItem')) if x)

def _v(val):
    return str(val).strip() if str(val).strip() else '—'

def _diff_employee(old_emp, new_emp):
    changes = []
    eid  = new_emp['empId']
    name = new_emp.get('name', eid)

    for field, label in [('name','姓名'),('mentor','學長工號'),('leader','Leader工號'),
                          ('startDate','到職日'),('type','訓練類型')]:
        ov, nv = old_emp.get(field,''), new_emp.get(field,'')
        if ov != nv:
            changes.append(f"[{eid}] 基本資料 {label}: {_v(ov)} → {_v(nv)}")

    old_ojt = {r['id']: r for r in old_emp.get('ojtRecords', [])}
    for r in new_emp.get('ojtRecords', []):
        o    = old_ojt.get(r['id'], {})
        item = f"{r['id']}({r.get('name','')})"
        if str(r.get('score','')) != str(o.get('score','')):
            changes.append(f"[{eid}({name})] OJT {item} 分數: {_v(o.get('score'))} → {_v(r.get('score'))}")
        if r.get('mentorNote','') != o.get('mentorNote','') and r.get('mentorNote',''):
            changes.append(f"[{eid}({name})] OJT {item} 學長備註: 「{r['mentorNote']}」")
        if r.get('mentorSignerId','') != o.get('mentorSignerId','') and r.get('mentorSignerId'):
            changes.append(f"[{eid}({name})] OJT {item} 學長簽核 ← {r['mentorSignerId']}")
        if r.get('supervisorSignerId','') != o.get('supervisorSignerId','') and r.get('supervisorSignerId'):
            changes.append(f"[{eid}({name})] OJT {item} 主管簽核 ← {r['supervisorSignerId']}")

    old_daily = {r['day']: r for r in old_emp.get('dailyRecords', [])}
    for r in new_emp.get('dailyRecords', []):
        o   = old_daily.get(r['day'], {})
        day = r['day']
        for field in ('mentorScore','mentorAttitude','leaderScore','total'):
            ov, nv = str(o.get(field,'')), str(r.get(field,''))
            if ov != nv and nv:
                changes.append(f"[{eid}({name})] 第{day}天 {_FIELD_LABEL[field]}: {_v(ov)} → {_v(nv)}")
        for field in ('learningItems','practiceItems','notes','leaderComment'):
            ov, nv = o.get(field,''), r.get(field,'')
            if ov != nv and nv:
                preview = nv.replace('\n', ' ')[:60]
                suffix  = '…' if len(nv) > 60 else ''
                changes.append(f"[{eid}({name})] 第{day}天 {_FIELD_LABEL[field]}: 「{preview}{suffix}」")
        if r.get('mentorSignerId','') != o.get('mentorSignerId','') and r.get('mentorSignerId'):
            changes.append(f"[{eid}({name})] 第{day}天 學長簽核 ← {r['mentorSignerId']}")
        if r.get('leaderSignerId','') != o.get('leaderSignerId','') and r.get('leaderSignerId'):
            changes.append(f"[{eid}({name})] 第{day}天 Leader簽核 ← {r['leaderSignerId']}")

    old_ob = {r['id']: r for r in old_emp.get('onboarding', [])}
    for r in new_emp.get('onboarding', []):
        o = old_ob.get(r['id'], {})
        item_name = r.get('name', f"項目{r['id']}")
        if r.get('done') != o.get('done'):
            status = "完成 ✓" if r.get('done') else "取消 ☐"
            changes.append(f"[{eid}({name})] 權限項目 {r['id']}.{item_name} 狀態: {status}")
        if r.get('note', '') != o.get('note', '') and r.get('note'):
            changes.append(f"[{eid}({name})] 權限項目 {r['id']}.{item_name} 備註: 「{r.get('note')}」")

    old_sec = {r['id']: r for r in old_emp.get('security', [])}
    for r in new_emp.get('security', []):
        o = old_sec.get(r['id'], {})
        if r.get('has') != o.get('has'):
            status = "具備 ✓" if r.get('has') else "取消 ☐"
            changes.append(f"[{eid}({name})] Security {_sec_label(r)} 是否具備: {status}")
        if r.get('cert', '') != o.get('cert', ''):
            changes.append(f"[{eid}({name})] Security {_sec_label(r)} 認證: {_v(o.get('cert'))} → {_v(r.get('cert'))}")

    return changes

@app.route('/api/state', methods=['POST'])
def post_state():
    
    # err = require_login()
    err = require_leader()
    
    if err: return err
    body = request.get_json() or {}

    with lock: # 保護全量寫入 (主要用於 importData 匯入)
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
    
                # 舊資料如果沒有 onboarding，自動補上預設模板
                if 'onboarding' not in emp or not isinstance(emp.get('onboarding'), list) or len(emp['onboarding']) == 0:
                    emp['onboarding'] = copy.deepcopy(_DEFAULT_ONBOARDING)
                    
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

# ─── Single employee save (Full POST) ─────────────────────────────────────────
# 【權限修正】整包覆蓋可寫入分數、簽核等所有欄位,
# 若只檢查登入,一般使用者可繞過各 PATCH 路由的角色限制,故限 leader。
@app.route('/api/employee/<emp_id>', methods=['POST'])
def post_employee(emp_id):
    err = require_leader()
    if err: return err
    emp = request.get_json() or {}
    if emp.get('empId') != emp_id:
        return jsonify({'error': 'empId mismatch'}), 400
        
    with lock:
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

# ─── PATCH: Daily Record (by day number) ──────────────────────────────────────
@app.route('/api/employee/<emp_id>/day-num/<int:day_num>', methods=['PATCH'])
def patch_employee_day_num(emp_id, day_num):
    err = require_login()
    if err: return err
    
    u = current_user()
    # 權限檢查：非主管只能修改自己的資料
    if u.get('role') != 'leader' and u.get('empId','').upper() != emp_id.upper():
        return jsonify({'error': '權限不足，只能修改自己的訓練紀錄'}), 403
        
    patch = request.get_json() or {}
    
    # 【鎖一致性修正】改回與其他路由相同的「全域鎖」。
    # 原本此路由使用 per-employee 鎖,但其他路由(整包 POST、OJT、onboarding、
    # add/remove-day)都使用全域鎖,兩種鎖互不互斥,並發時會發生
    # read-modify-write 交錯導致資料互相覆蓋。統一使用全域鎖確保正確性。
    with lock:
        try:
            emp = _read(os.path.join(EMP_DIR, f'{emp_id}.json'))
        except FileNotFoundError:
            return jsonify({'error': '找不到員工資料'}), 404
        except json.JSONDecodeError:
            logger.error(f"[DATA] 員工檔案損壞: {emp_id}.json")
            return jsonify({'error': '員工資料檔案損壞，請聯繫管理員'}), 500
            
        rec = next((r for r in emp.get('dailyRecords', []) if r.get('day') == day_num), None)
        if rec is None:
            return jsonify({'error': f'找不到第 {day_num} 天紀錄'}), 404
            
        old_rec = dict(rec) # 複製一份舊資料用於比對 Log
        
        # 【優化 2】修正原版中 'dat-e' 的拼寫錯誤為 'date'
        _ALLOWED_DAY_FIELDS = {
            'learningItems', 'practiceItems', 'notes', 'leaderComment',
            'mentorScore', 'mentorAttitude', 'leaderScore',
            'mentorSignerId', 'leaderSignerId', 'date'
        }
        
        # 僅更新白名單內的欄位，阻擋非法注入
        rec.update({k: v for k, v in patch.items() if k in _ALLOWED_DAY_FIELDS})
        
        # 【優化 3】自動計算總分 (加入 try-except 防止前端傳入非數字字串導致 500 錯誤)
        try:
            ms = float(rec.get('mentorScore') or 0)
            ma = float(rec.get('mentorAttitude') or 0)
            ls = float(rec.get('leaderScore') or 0)
            if ms or ma or ls:
                total = min(100, ms + ma + ls)
                # 整數值以整數儲存,避免畫面顯示「85.0」
                rec['total'] = int(total) if total == int(total) else total
            else:
                rec['total'] = ''
        except ValueError:
            rec['total'] = ''
            
        # 【優化 4】呼叫 save_employee (請確保下方的 _write 函數已實作 Atomic Write)
        save_employee(emp)
        
    # 記錄變更 Log (放在鎖外面，減少鎖的持有時間，提升並發效能)
    date_label = rec.get('date') or f'第{day_num}天'
    for field, nv in patch.items():
        if field not in _ALLOWED_DAY_FIELDS:
            continue # 忽略白名單外的非法欄位
            
        ov = str(old_rec.get(field, ''))
        nv_s = str(nv)
        
        # 只有當數值真的有改變，且新值不為空時，才記錄 Log
        if ov != nv_s and nv_s:
            fl = _FIELD_LABEL.get(field, field)
            if field in ('mentorScore', 'mentorAttitude', 'leaderScore', 'total'):
                logger.info(f"[PATCH:day] {who()} | [{emp_id}] 第{day_num}天({date_label}) {fl}: {_v(ov)} → {_v(nv_s)} | ip={client_ip()}")
            else:
                preview = nv_s.replace('\n', ' ')[:60]
                suffix = '…' if len(nv_s) > 60 else ''
                logger.info(f"[PATCH:day] {who()} | [{emp_id}] 第{day_num}天({date_label}) {fl}: 「{preview}{suffix}」 | ip={client_ip()}")
                
    return jsonify({'ok': True, 'total': rec['total']})

# ─── PATCH: OJT Record ────────────────────────────────────────────────────────
@app.route('/api/employee/<emp_id>/ojt/<item_id>', methods=['PATCH'])
def patch_employee_ojt(emp_id, item_id):
    err = require_login()
    if err: return err
    u = current_user()
    if u.get('role') != 'leader':
        return jsonify({'error': '權限不足，僅主管可進行 OJT 評分'}), 403
        
    patch = request.get_json() or {}
    with lock:
        try:
            emp = _read(os.path.join(EMP_DIR, f'{emp_id}.json'))
        except Exception:
            return jsonify({'error': '找不到員工資料'}), 404
            
        rec = next((r for r in emp.get('ojtRecords', []) if r.get('id') == item_id), None)
        if rec is None:
            return jsonify({'error': '找不到 OJT 項目'}), 404
            
        _ALLOWED_OJT_FIELDS = {'score', 'mentorNote', 'mentorSignerId', 'supervisorSignerId', 'currentLevel'}
        rec.update({k: v for k, v in patch.items() if k in _ALLOWED_OJT_FIELDS})
        save_employee(emp)
        
    logger.info(f"[PATCH:ojt] {who()} | [{emp_id}] OJT {item_id} 更新 | ip={client_ip()}")
    return jsonify({'ok': True})

# ─── PATCH: Employee Basic Info ───────────────────────────────────────────────
@app.route('/api/employee/<emp_id>/info', methods=['PATCH'])
def patch_employee_info(emp_id):
    # 【權限修正】基本資料(姓名、到職日、學長、Leader、訓練類型)僅主管可修改,
    # 與前端 UI 的 leader-only 設計一致。
    err = require_leader()
    if err: return err
    patch = request.get_json() or {}
    with lock:
        try:
            emp = _read(os.path.join(EMP_DIR, f'{emp_id}.json'))
        except Exception:
            return jsonify({'error': '找不到員工資料'}), 404
            
        _ALLOWED_INFO_FIELDS = {'name', 'startDate', 'mentor', 'leader', 'type', 'group'}
        for k, v in patch.items():
            if k in _ALLOWED_INFO_FIELDS:
                # 組別僅允許合法值(RR / 值班 / 保養組)
                if k == 'group' and v not in GROUPS:
                    return jsonify({'error': '組別必須為 RR、值班 或 保養組'}), 400
                emp[k] = v
        save_employee(emp)
        
    logger.info(f"[PATCH:info] {who()} | [{emp_id}] 基本資料更新 | ip={client_ip()}")
    return jsonify({'ok': True})

# ─── PATCH: Onboarding (權限項目) ─────────────────────────────────────────────
@app.route('/api/employee/<emp_id>/onboarding/<int:item_id>', methods=['PATCH'])
def patch_employee_onboarding(emp_id, item_id):
    # 【權限設計】
    #   主管(leader):可修改「完成(done)」與「備註(note)」— 所有人的都可以。
    #   本人(empId 相符的 user):只能修改「本人確認(selfConfirmed)」。
    #   其他人:一律拒絕。
    err = require_login()
    if err: return err
    u = current_user()
    is_leader = u.get('role') == 'leader'
    is_self   = u.get('empId', '').upper() == emp_id.upper()
    if not (is_leader or is_self):
        return jsonify({'error': '權限不足，只能查看與確認自己的權限項目'}), 403

    patch = request.get_json() or {}

    # 依身分過濾允許的欄位:
    #   主管 → done / note;本人 → selfConfirmed(主管同時是本人時取聯集)
    allowed = set()
    if is_leader: allowed |= {'done', 'note'}
    if is_self:   allowed |= {'selfConfirmed'}
    filtered = {k: v for k, v in patch.items() if k in allowed}
    if not filtered:
        return jsonify({'error': '沒有可更新的欄位（完成與備註限主管，本人確認限本人）'}), 403

    with lock:
        try:
            emp = _read(os.path.join(EMP_DIR, f'{emp_id}.json'))
        except Exception:
            return jsonify({'error': '找不到員工資料'}), 404
            
        # [關鍵修復] 如果舊資料沒有 onboarding，自動補上預設模板
        if 'onboarding' not in emp or not isinstance(emp.get('onboarding'), list) or len(emp['onboarding']) == 0:
            emp['onboarding'] = copy.deepcopy(_DEFAULT_ONBOARDING)
            logger.info(f"[PATCH:onboarding] {who()} | [{emp_id}] 舊資料無 onboarding，已自動初始化 15 項預設清單 | ip={client_ip()}")

        # 【組別格子數限制】RR=15、值班=14、保養組=13,超出該組別範圍的項目不可修改
        if item_id > group_item_limit(emp):
            return jsonify({'error': f"此員工組別（{emp.get('group') or '未設定'}）無此權限項目"}), 400

        rec = next((r for r in emp.get('onboarding', []) if r.get('id') == item_id), None)
        if rec is None:
            return jsonify({'error': '找不到權限項目'}), 404

        rec.setdefault('selfConfirmed', False)  # 舊資料相容
        rec.update(filtered)
        save_employee(emp)
        
    logger.info(f"[PATCH:onboarding] {who()} | [{emp_id}] 權限項目 {item_id} 更新 {list(filtered.keys())} | ip={client_ip()}")
    return jsonify({'ok': True})


# ─── Security C 權限清單 API ──────────────────────────────────────────────────
@app.route('/api/security/template', methods=['GET'])
def get_security_template():
    err = require_login()
    if err: return err
    return jsonify({'items': load_security_template()})

@app.route('/api/employee/<emp_id>/security/<item_id>', methods=['PATCH'])
def patch_employee_security(emp_id, item_id):
    """勾選「是否具備」/ 修改認證、備註。主管:所有人;一般 User:唯讀。"""
    err = require_leader()
    if err: return err
    patch = request.get_json() or {}
    _ALLOWED = {'has', 'cert', 'note'}
    filtered = {k: v for k, v in patch.items() if k in _ALLOWED}
    if not filtered:
        return jsonify({'error': '沒有可更新的欄位'}), 400
    with lock:
        try:
            emp = _read(os.path.join(EMP_DIR, f'{emp_id}.json'))
        except Exception:
            return jsonify({'error': '找不到員工資料'}), 404
        _ensure_security(emp)
        rec = next((r for r in emp['security'] if r.get('id') == item_id), None)
        if rec is None:
            return jsonify({'error': '找不到 Security 項目'}), 404
        if 'has' in filtered: filtered['has'] = bool(filtered['has'])
        rec.update(filtered)
        save_employee(emp)
    logger.info(f"[PATCH:security] {who()} | [{emp_id}] {_sec_label(rec)} 更新 {filtered} | ip={client_ip()}")
    return jsonify({'ok': True})

@app.route('/api/employee/<emp_id>/security/items', methods=['POST'])
def add_employee_security_item(emp_id):
    """新增項目(該員)。"""
    err = require_leader()
    if err: return err
    item = _sec_from_body(request.get_json() or {})
    if item is None:
        return jsonify({'error': '請填寫「項目」名稱'}), 400
    with lock:
        try:
            emp = _read(os.path.join(EMP_DIR, f'{emp_id}.json'))
        except Exception:
            return jsonify({'error': '找不到員工資料'}), 404
        _ensure_security(emp)
        emp['security'].append(item)
        save_employee(emp)
    logger.info(f"[ADD:security] {who()} | [{emp_id}] 新增項目 {_sec_label(item)} | ip={client_ip()}")
    return jsonify({'ok': True, 'item': item})

@app.route('/api/employee/<emp_id>/security/<item_id>', methods=['DELETE'])
def delete_employee_security_item(emp_id, item_id):
    """移除項目(該員)。"""
    err = require_leader()
    if err: return err
    with lock:
        try:
            emp = _read(os.path.join(EMP_DIR, f'{emp_id}.json'))
        except Exception:
            return jsonify({'error': '找不到員工資料'}), 404
        _ensure_security(emp)
        before = len(emp['security'])
        removed = [r for r in emp['security'] if r.get('id') == item_id]
        emp['security'] = [r for r in emp['security'] if r.get('id') != item_id]
        if len(emp['security']) == before:
            return jsonify({'error': '找不到 Security 項目'}), 404
        save_employee(emp)
    logger.info(f"[DEL:security] {who()} | [{emp_id}] 移除項目 {_sec_label(removed[0])} | ip={client_ip()}")
    return jsonify({'ok': True})

@app.route('/api/security/items', methods=['POST'])
def add_security_item_all():
    """新增項目(全員):寫入範本 + 所有員工檔案。"""
    err = require_leader()
    if err: return err
    item = _sec_from_body(request.get_json() or {})
    if item is None:
        return jsonify({'error': '請填寫「項目」名稱'}), 400
    with lock:
        tpl = load_security_template()
        tpl.append(item)
        save_security_template(tpl)          # 追加一列到 KL_Security_C.csv
        item = load_security_template()[-1]  # 重新讀回,取得依內容產生的正式 id
        count = 0
        for path in glob.glob(os.path.join(EMP_DIR, '*.json')):
            try:
                emp = _read(path)
            except Exception:
                continue
            _ensure_security(emp)
            if not any(r.get('id') == item['id'] for r in emp['security']):
                emp['security'].append(copy.deepcopy(item))
            save_employee(emp)
            count += 1
    logger.info(f"[ADD:security-all] {who()} | 全員新增項目 {_sec_label(item)}(影響 {count} 人)| ip={client_ip()}")
    return jsonify({'ok': True, 'item': item, 'affected': count})

@app.route('/api/security/items/<item_id>', methods=['DELETE'])
def delete_security_item_all(item_id):
    """移除項目(全員):自範本 + 所有員工檔案移除。"""
    err = require_leader()
    if err: return err
    with lock:
        tpl = load_security_template()
        label = next((_sec_label(r) for r in tpl if r.get('id') == item_id), item_id)
        save_security_template([r for r in tpl if r.get('id') != item_id])
        count = 0
        for path in glob.glob(os.path.join(EMP_DIR, '*.json')):
            try:
                emp = _read(path)
            except Exception:
                continue
            sec = emp.get('security') or []
            new_sec = [r for r in sec if r.get('id') != item_id]
            if len(new_sec) != len(sec):
                emp['security'] = new_sec
                save_employee(emp)
                count += 1
    logger.info(f"[DEL:security-all] {who()} | 全員移除項目 {label}(影響 {count} 人)| ip={client_ip()}")
    return jsonify({'ok': True, 'affected': count})


# ─── PATCH: Add Day (Daily Record) ────────────────────────────────────────────
@app.route('/api/employee/<emp_id>/add-day', methods=['PATCH'])
def patch_employee_add_day(emp_id):
    err = require_login()
    if err: return err
    u = current_user()
    if u.get('role') != 'leader':
        return jsonify({'error': '權限不足，僅主管可新增天數'}), 403
        
    new_rec = request.get_json() or {}
    with lock:
        try:
            emp = _read(os.path.join(EMP_DIR, f'{emp_id}.json'))
        except Exception:
            return jsonify({'error': '找不到員工資料'}), 404

        records = emp.setdefault('dailyRecords', [])
        # 【天數同步修正】day 編號改由「伺服器」依現有資料決定,
        # 不採信前端傳入的 day 值,避免前端與伺服器天數不同步時
        # 產生重複的 day 編號。實際編號會回傳給前端更新畫面。
        try:
            max_day = max((int(r.get('day') or 0) for r in records), default=0)
        except (ValueError, TypeError):
            max_day = len(records)
        new_rec['day'] = max_day + 1
        records.append(new_rec)
        save_employee(emp)

    logger.info(f"[PATCH:add-day] {who()} | [{emp_id}] 新增第 {new_rec['day']} 天 | ip={client_ip()}")
    return jsonify({'ok': True, 'day': new_rec['day']})

# ─── PATCH: Remove Day (Daily Record) ─────────────────────────────────────────
@app.route('/api/employee/<emp_id>/remove-day/<int:day_num>', methods=['PATCH'])
def patch_employee_remove_day(emp_id, day_num):
    err = require_login()
    if err: return err
    u = current_user()
    if u.get('role') != 'leader':
        return jsonify({'error': '權限不足，僅主管可刪除天數'}), 403
        
    with lock:
        try:
            emp = _read(os.path.join(EMP_DIR, f'{emp_id}.json'))
        except Exception:
            return jsonify({'error': '找不到員工資料'}), 404
            
        emp['dailyRecords'] = [r for r in emp.get('dailyRecords', []) if r.get('day') != day_num]
        for i, r in enumerate(emp['dailyRecords']):
            r['day'] = i + 1
        save_employee(emp)
        
    logger.info(f"[PATCH:remove-day] {who()} | [{emp_id}] 刪除第 {day_num} 天 | ip={client_ip()}")
    return jsonify({'ok': True})

# ─── DELETE: Employee ─────────────────────────────────────────────────────────
@app.route('/api/employee/<emp_id>', methods=['DELETE'])
def delete_employee_api(emp_id):
    err = require_leader()
    if err: return err
    with lock:
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
    
    with lock:
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

    return jsonify({'ok': True})

if __name__ == "__main__":
    app.run(debug=True)
    # serve(app, host='10.11.99.84', port=8091)  
    # 原狀態
    # app.run(host="10.11.104.247", port=9031, debug=True)
    # 0971-50-2211 修哥電話