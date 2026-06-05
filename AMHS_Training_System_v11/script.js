// ─── API BASE (調整這裡即可切換後台位址) ───
const API_BASE = 'http://127.0.0.1:5000';
const ABILITY_DATA = {
  A:{label:"基礎操作能力",en:"BASIC OPERATIONS",color:"#0ea5e9",items:[
    {id:"A1",name:"智能巡檢",desc:"日常設備確認"},
    {id:"A2",name:"SOP 操作",desc:"標準流程執行"},
    {id:"A3",name:"系統登入",desc:"MES 使用 / Alarm 確認 / 基本異常辨識"},
    {id:"A4",name:"交接班作業",desc:"班報與資訊交接"}
  ]},
  B:{label:"異常處理能力",en:"FAULT HANDLING",color:"#f59e0b",items:[
    {id:"B1",name:"Jam 排除",desc:"卡料異常處理"},
    {id:"B2",name:"Alarm Reset",desc:"Alarm 復歸"},
    {id:"B3",name:"Sensor 異常",desc:"I/O 與 Sensor 確認"},
    {id:"B4",name:"Robot Recovery",desc:"手臂復歸處理"},
    {id:"B5",name:"帳籍卡站處理",desc:"生產異常排除"}
  ]},
  C:{label:"系統理解能力",en:"SYSTEM KNOWLEDGE",color:"#8b5cf6",items:[
    {id:"C1",name:"AMHS 流程",desc:"搬送流程概念"},
    {id:"C2",name:"Conveyor 邏輯",desc:"自動派貨 Rule 理解"},
    {id:"C3",name:"Auto / Manual",desc:"模式切換理解"},
    {id:"C4",name:"系統關聯性",desc:"Auto Move In/Out 理解"}
  ]},
  D:{label:"值班應對能力",en:"ON-DUTY RESPONSE",color:"#ef4444",items:[
    {id:"D1",name:"異常回報",desc:"Escalation 判斷"},
    {id:"D2",name:"MFG 溝通",desc:"現場協調能力"},
    {id:"D3",name:"夜班應變",desc:"緊急狀況處理"},
    {id:"D4",name:"問題紀錄",desc:"Issue 紀錄完整度"}
  ]}
};
const LEVELS_DATA = [
  {level:"L1",title:"訓練初期",subtitle:"需學長陪同",method:"觀察法 OBSERVATION",
   conditions:["正確說明 SOP 步驟，全程不需提示","執行設備巡檢無跳漏任何項目","遇 Alarm 能說出第一步處置動作"],
   tools:"訓練紀錄表 / 學長現場觀察",pass:"三項全達標・學長簽核 ✓",color:"#64748b"},
  {level:"L2",title:"基本值班",subtitle:"依 SOP 獨立",method:"實作驗證 PRACTICAL TEST",
   conditions:["獨立完成指定 SOP，無需任何提示","Alarm Reset 於時限內復歸完成","交接班清單填寫完整無缺漏"],
   tools:"操作檢核表 / 計時驗收",pass:"零提示零重工・主管簽核 ✓",color:"#0ea5e9"},
  {level:"L3",title:"正式值班",subtitle:"獨立處理異常",method:"模擬情境測試 SCENARIO TEST",
   conditions:["異常排除於規定時間內完成","能研判異常原因並正確處理","異常回報含時間・現況・處置"],
   tools:"情境題卡 / 值班觀察記錄",pass:"2 題全通過・早夜值班各 1 輪 ✓",color:"#f59e0b"},
  {level:"L4",title:"資深值班",subtitle:"主導＋教學",method:"綜合評核 PEER REVIEW",
   conditions:["能帶領 L2 以下工程師排除異常","完成一次新人教學並由主管評分","獨立撰寫或更新至少 1 份 SOP"],
   tools:"主管訪談 / 問卷 + SOP 審查",pass:"三項均達標・部門主管核准 ✓",color:"#ef4444"}
];

const SCORE_LABELS = [
  {min:90,max:100,label:"非常熟練",grade:"L4",color:"#16a34a"},
  {min:80,max:89,label:"熟練",grade:"L3",color:"#0ea5e9"},
  {min:70,max:79,label:"操作正確但不熟練",grade:"L2",color:"#f59e0b"},
  {min:0,max:69,label:"操作錯誤，須重新訓練",grade:"L1",color:"#ef4444"}
];

// ══════════════════════════════════════════════════════
//  Vue 3 App
// ══════════════════════════════════════════════════════
const vueApp = Vue.createApp({

  data() {
    return {
      ACCOUNTS: [],
      _authToken: '',
      currentUser: null,
      state: { employees: [], signers: [], selectedEmpId: null, selectedDay: 0 },
      autoSave: true,
      isDirty: false,
      lastSaver: null,
      _lastPersistedState: null,
      _lastPersistedAccounts: null,
      _warnTimer: null,
      _toastTimer: null,
      currentTab: 'training',
      searchQuery: '',
      ojtSelectedCat: 'A',
      ojtSelectedEmpId: null,
    };
  },

  methods: {

// ─── ACCOUNTS (loaded from Flask after login) ───

apiFetch(path, opts){
  opts = opts || {};
  opts.headers = Object.assign({'Content-Type':'application/json','X-Auth-Token':this._authToken}, opts.headers||{});
  return fetch(API_BASE + path, opts);
},
async doLogout(){
  try{await this.apiFetch('/api/logout', {method:'POST'});}catch(e){}
  sessionStorage.removeItem('amhs_token');
  sessionStorage.removeItem('amhs_user');
  location.href = 'index.html';
},
async enterApp(){
  // Load state from Flask
  try{
    const res=await this.apiFetch('/api/state', {});
    if(res.ok){const d=await res.json();this.state.employees=d.employees||[];this.state.signers=d.signers||[];}
  }catch(e){console.error('Failed to load state:',e);}
  // Load accounts if leader
  if(this.isLeader()){
    try{
      const res=await this.apiFetch('/api/accounts', {});
      if(res.ok){const d=await res.json();this.ACCOUNTS=d.accounts||[];}
    }catch(e){}
  }
  this.applyRoleUI();
  this.renderSaveBar();
  this.switchTab('training');
},
isLeader(){return this.currentUser&&this.currentUser.role==='leader';},
applyRoleUI(){
  const bar=document.getElementById('userBarContainer');
  const roleLabel=this.isLeader()?'Leader':'User';
  const roleColor=this.isLeader()?'#16a34a':'#0ea5e9';
  bar.innerHTML='<div class="user-bar"><div class="user-avatar" style="background:'+roleColor+'">'+this.currentUser.empId.charAt(0)+'</div><div class="user-info"><div class="user-name">'+this.currentUser.empId+'</div><div class="user-role" style="color:'+roleColor+'">'+roleLabel+'</div></div></div>';
  document.querySelectorAll('.leader-only').forEach(el=>{el.style.display=this.isLeader()?'':'none';});
},

// ─── DATA MODEL ───


getScoreInfo(s){
  if(s===''||s===null||s===undefined)return null;
  const n=Number(s);if(isNaN(n))return null;
  return SCORE_LABELS.find(l=>n>=l.min&&n<=l.max)||null;
},

getEmpCatSummary(emp, catKey) {
  const catItems = emp.ojtRecords.filter(r => r.category === catKey);
  const scored = catItems.filter(r => r.score !== '' && r.score !== null && r.score !== undefined);
  const gradeCount = {L4:0,L3:0,L2:0,L1:0};
  scored.forEach(r => { const si = this.getScoreInfo(r.score); if(si) gradeCount[si.grade]++; });
  return { scored: scored.length, total: catItems.length, gradeCount };
},

getEmpCatLevel(emp, catKey) {
  const catItems = emp.ojtRecords.filter(r => r.category === catKey);
  const scored = catItems.filter(r => r.score !== '' && r.score !== null && r.score !== undefined);
  if(scored.length === 0) return null;
  const avg = Math.round(scored.reduce((a,r) => a + Number(r.score), 0) / scored.length);
  return this.getScoreInfo(avg);
},

catSummaryCell(emp, catKey, color) {
  const si = this.getEmpCatLevel(emp, catKey);
  if(!si) return '<span style="color:var(--text4);font-size:12px">—</span>';
  return '<span class="level-badge" style="background:' + si.color + '20;color:' + si.color + ';border:1px solid ' + si.color + '40">' + si.grade + '</span>';
},

getEmpOjtAvgScore(emp) {
  const scored = emp.ojtRecords.filter(r => r.score !== '' && r.score !== null && r.score !== undefined);
  if(scored.length === 0) return null;
  return Math.round(scored.reduce((a,r) => a + Number(r.score), 0) / scored.length);
},

// Average raw score (0-100) for one category, or null if none scored
getEmpCatAvgScore(emp, catKey){
  const scored = emp.ojtRecords.filter(r => r.category === catKey && r.score !== '' && r.score !== null && r.score !== undefined);
  if(scored.length === 0) return null;
  return Math.round(scored.reduce((a,r) => a + Number(r.score), 0) / scored.length);
},

// Overall grade bucket for headcount stats: 'L4','L3','L2','L1', or 'new' (no scores yet)
getEmpOverallGrade(emp){
  const avg = this.getEmpOjtAvgScore(emp);
  if(avg === null) return 'new';
  const si = this.getScoreInfo(avg);
  return si ? si.grade : 'L1';
},

// ─── REDESIGN HELPERS ───
daysSince(dateStr){
  if(!dateStr) return null;
  const d = new Date(dateStr);
  if(isNaN(d.getTime())) return null;
  return Math.max(0, Math.floor((Date.now() - d.getTime()) / 86400000));
},
colorFromId(s){
  s = s || '?';
  let h = 0;
  for(let i=0;i<s.length;i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  const palette = ['#3b82f6','#8b5cf6','#0ea5e9','#16a34a','#f59e0b','#ef4444','#ec4899','#14b8a6','#6366f1','#d946ef'];
  return palette[Math.abs(h) % palette.length];
},
firstChar(s){
  if(!s) return '?';
  const c = String(s).trim().charAt(0);
  return c ? c.toUpperCase() : '?';
},
fmtDateZh(d){
  if(!d) return '—';
  return String(d).replace(/-/g,'/');
},
getEmpProgress(emp){
  const daily = emp.dailyRecords || [];
  const ojt   = emp.ojtRecords || [];
  const dailyDone = daily.filter(r => (r.learningItems||r.practiceItems||r.notes||r.date||'').toString().trim().length > 0).length;
  const ojtScored = ojt.filter(r => r.score!=='' && r.score!==null && r.score!==undefined).length;
  const mentorSigned = ojt.filter(r => r.mentorSignerId).length;
  const supSigned    = ojt.filter(r => r.supervisorSignerId).length;
  return {
    dailyDone, dailyTotal: daily.length,
    ojtScored, ojtTotal: ojt.length,
    mentorSigned, supSigned
  };
},

scoreGradeBarHTML() {
  return '<div style="display:flex;gap:10px;flex-wrap:wrap">' + SCORE_LABELS.map(function(s) {
    return '<div style="flex:1;min-width:170px;display:flex;align-items:center;gap:12px;padding:10px 16px;border-radius:10px;background:var(--surface);border:1px solid ' + s.color + '30">' +
    '<span style="font-family:var(--mono);font-size:18px;font-weight:900;color:' + s.color + ';min-width:30px">' + s.grade + '</span>' +
    '<div><div style="font-size:13px;font-weight:600;color:' + s.color + '">' + s.min + '–' + s.max + ' 分</div>' +
    '<div style="font-size:11px;color:var(--text2)">' + s.label + '</div></div></div>';
  }).join('') + '</div>';
},

levelToNum(l){return l?parseInt(l.replace('L','')):0},

// ─── HEADCOUNT STATS (live) ───
statIcon(name){
  const I = {
    total:'<path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-.35 0-.68.06-1 .17C15.63 5.96 16 6.93 16 8s-.37 2.04-1 2.83c.32.11.65.17 1 .17zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/>',
    check:'<path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm-2.5 6L7 15.5l1.4-1.4 1.1 1.1 3.1-3.1 1.4 1.4L9.5 18z"/><path d="M12 13c-2.67 0-8 1.34-8 4v3h7.5l-.5-.5V18c0-1.1.45-2.1 1.18-2.83C11.5 13.92 11.7 13 12 13z" opacity=".55"/>',
    cap:'<path d="M12 3L1 9l11 6 9-4.91V17h2V9L12 3zM5 13.18v4L12 21l7-3.82v-4L12 17l-7-3.82z"/>',
    plus:'<path d="M15 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm-9-1V8H4v3H1v2h3v3h2v-3h3v-2H6zm9 2c-2.67 0-8 1.34-8 4v3h16v-3c0-2.66-5.33-4-8-4z"/>'
  };
  return '<svg viewBox="0 0 24 24">'+(I[name]||I.total)+'</svg>';
},

renderStatsBar(){
  const el = document.getElementById('statsBar');
  if(!el) return;
  if(!this.isLeader()){ el.innerHTML=''; return; }   // management dashboard
  let emps = this.state.employees;
  let total=emps.length, hi=0, l2=0, l1=0;
  emps.forEach(e=>{
    const g = this.getEmpOverallGrade(e);
    if(g==='L4'||g==='L3') hi++;
    else if(g==='L2') l2++;
    else l1++;                       // L1 or 'new' (新人訓練)
  });
  el.innerHTML =
    '<div class="stat-grid">'+
      this.statCard('total','amber','人員數','TOTAL', total, '') +
      this.statCard('check','green','L4–L3','SENIOR', hi, '') +
      this.statCard('cap','sky','L2','QUALIFIED', l2, '') +
      this.statCard('plus','violet','L1','TRAINEE', l1, '新人訓練') +
    '</div>';
},
statCard(icon, cls, name, sub, val, tag){
  return '<div class="stat-card '+cls+'">'+
    '<div class="stat-top"><span class="stat-ic">'+this.statIcon(icon)+'</span>'+
      '<div><div class="stat-name">'+name+'</div><div class="stat-sub">'+sub+'</div></div></div>'+
    '<div><span class="stat-val">'+val+'</span><span class="stat-unit">位</span></div>'+
    (tag?'<span class="stat-tag">'+tag+'</span>':'')+
  '</div>';
},

// ─── RADAR CHART (live, SVG, no external libs) ───
// Maps each category's average score (0-100) onto a 0-4 scale (L1=1 … L4=4).
scoreToLevelVal(score){
  if(score===null) return 0;
  return Math.max(0, Math.min(4, score/25));   // 100→4, 75→3, 50→2, 25→1
},
renderRadar(emp){
  const cats = ['A','B','C','D'];
  const labels = {A:'A 基礎操作', B:'B 異常處理', C:'C 系統理解', D:'D 值班應對'};
  const cx=200, cy=160, R=98, MAX=4;
  // axis angles: A top, B right, C bottom, D left
  const ang = {A:-90, B:0, C:90, D:180};
  const rad = a => a*Math.PI/180;
  const pt = (a,r) => [ cx + r*Math.cos(rad(a)), cy + r*Math.sin(rad(a)) ];

  const accent = '#22d3ee';   // cyan, matches reference
  let svg = '<svg class="radar-svg" width="400" height="320" viewBox="0 0 400 320" xmlns="http://www.w3.org/2000/svg" style="overflow:visible">';

  // grid rings (1..4)
  for(let lvl=1; lvl<=MAX; lvl++){
    const r = R*lvl/MAX;
    const poly = cats.map(c=>{ const [x,y]=pt(ang[c],r); return x.toFixed(1)+','+y.toFixed(1); }).join(' ');
    const ringStroke = (lvl===MAX) ? '#37445f' : '#2a3550';
    svg += '<polygon points="'+poly+'" fill="none" stroke="'+ringStroke+'" stroke-width="1"/>';
  }
  // spokes
  cats.forEach(c=>{ const [x,y]=pt(ang[c],R); svg += '<line x1="'+cx+'" y1="'+cy+'" x2="'+x.toFixed(1)+'" y2="'+y.toFixed(1)+'" stroke="#2a3550" stroke-width="1"/>'; });
  // scale numbers along the top (A) axis
  for(let lvl=1; lvl<=MAX; lvl++){
    const [x,y]=pt(-90, R*lvl/MAX);
    svg += '<text x="'+(x+8)+'" y="'+(y+4)+'" font-size="10" fill="#64748b">'+lvl+'</text>';
  }
  // data polygon
  const vals = {};
  let hasAny=false;
  cats.forEach(c=>{ const s=this.getEmpCatAvgScore(emp,c); vals[c]={score:s,v:this.scoreToLevelVal(s)}; if(s!==null) hasAny=true; });
  if(hasAny){
    const dpoly = cats.map(c=>{ const [x,y]=pt(ang[c], R*vals[c].v/MAX); return x.toFixed(1)+','+y.toFixed(1); }).join(' ');
    svg += '<polygon points="'+dpoly+'" fill="'+accent+'33" stroke="'+accent+'" stroke-width="2" stroke-linejoin="round"/>';
    cats.forEach(c=>{ const [x,y]=pt(ang[c], R*vals[c].v/MAX); svg += '<circle cx="'+x.toFixed(1)+'" cy="'+y.toFixed(1)+'" r="3.5" fill="'+accent+'"/>'; });
  }
  // axis labels
  const labOff = {A:[0,-16,'middle'], B:[18,4,'start'], C:[0,22,'middle'], D:[-18,4,'end']};
  cats.forEach(c=>{ const [x,y]=pt(ang[c],R); const o=labOff[c];
    svg += '<text x="'+(x+o[0])+'" y="'+(y+o[1])+'" font-size="12" font-weight="600" fill="#cbd5e1" text-anchor="'+o[2]+'">'+labels[c]+'</text>'; });
  svg += '</svg>';

  // legend with live scores + grades
  let legend = '<div class="radar-legend">';
  const catColors = {A:'#0ea5e9', B:'#f59e0b', C:'#8b5cf6', D:'#ef4444'};
  cats.forEach(c=>{
    const s = vals[c].score;
    const si = s!==null ? this.getScoreInfo(s) : null;
    legend += '<div class="radar-leg-row">'+
      '<span class="radar-leg-dot" style="background:'+catColors[c]+'"></span>'+
      '<span class="radar-leg-name">'+labels[c]+'</span>'+
      (si ? '<span class="level-badge" style="background:'+si.color+'20;color:'+si.color+';border:1px solid '+si.color+'40;width:30px;height:20px;font-size:11px">'+si.grade+'</span>' : '')+
      '<span class="radar-leg-score">'+(s!==null? s+'分' : '—')+'</span>'+
    '</div>';
  });
  legend += '</div>';

  return '<div class="radar-wrap">'+svg+legend+'</div>';
},

// ─── STATE ───

// ─── SAVE SYSTEM (auto-save toggle + Flask API persist) ───


// Persist to Flask (fire-and-forget, shows toast/warn on result)
// 上次送出的快照，用來判斷是否真的有變動

async _persist(){
  try{
    const stateSnap    = JSON.stringify({employees:this.state.employees, signers:this.state.signers});
    const accountsSnap = JSON.stringify(this.ACCOUNTS);

    // 只在內容實際有變動時才送
    if(stateSnap !== this._lastPersistedState){
      await this.apiFetch('/api/state', {method:'POST',
        body:JSON.stringify({employees:this.state.employees,signers:this.state.signers})});
      this._lastPersistedState = stateSnap;
    }
    if(this.isLeader() && accountsSnap !== this._lastPersistedAccounts){
      await this.apiFetch('/api/accounts', {method:'POST',
        body:JSON.stringify({accounts:this.ACCOUNTS})});
      this._lastPersistedAccounts = accountsSnap;
    }
  }catch(e){
    this.showSaveWarn('儲存失敗，請確認伺服器連線');
    console.error('Save failed:',e);
    throw e;
  }
},

// Unified save entry point.
//   save()             -> respects auto-save toggle (field edits)
//   save({force:true}) -> always writes now (structural ops / 立即更新 button)
save(opts){
  opts = opts || {};
  const force = !!opts.force;
  if(!this.autoSave && !force){
    this.isDirty = true;
    this.renderSaveBar();
    return;
  }
  const me = this.currentUser ? this.currentUser.empId : '?';
  this.lastSaver = {by: me, at: Date.now()};
  this.isDirty = false;
  this.renderSaveBar();
  this._persist().then(function(){
    if(!opts.silent && opts.toast) this.showSaveToast('已由 '+me+' 儲存');
    this.renderSaveBar();
  }).catch(function(){
    this.isDirty = true;
    this.renderSaveBar();
  });
},

// 立即更新 button — manual immediate save
saveNow(){
  this.save({force:true, toast:true});
},

// 即時更新 toggle
toggleAutoSave(on){
  this.autoSave = on;
  localStorage.setItem('amhs_autosave', on ? 'on' : 'off');
  if(on && this.isDirty) this.save({force:true, toast:true});
  this.renderSaveBar();
},


showSaveWarn(msg){
  const w = document.getElementById('saveWarn');
  if(!w) return;
  document.getElementById('saveWarnMsg').textContent = msg || '請稍待再進行儲存';
  w.classList.add('show');
  clearTimeout(this._warnTimer);
  this._warnTimer = setTimeout(function(){ w.classList.remove('show'); }, 2600);
},
showSaveToast(msg){
  const t = document.getElementById('saveToast');
  if(!t) return;
  document.getElementById('saveToastMsg').textContent = msg || '已儲存';
  t.classList.add('show');
  clearTimeout(this._toastTimer);
  this._toastTimer = setTimeout(function(){ t.classList.remove('show'); }, 2000);
},

fmtTime(ts){
  if(!ts) return '—';
  const d = new Date(ts);
  const p = function(n){ return String(n).padStart(2,'0'); };
  return p(d.getHours())+':'+p(d.getMinutes())+':'+p(d.getSeconds());
},

renderSaveBar(){
  const el = document.getElementById('saveBar');
  if(!el) return;
  let statusCls, statusTxt;
  if(this.isDirty){ statusCls='dirty'; statusTxt='● 有未儲存變更'; }
  else { statusCls='saved'; statusTxt='✓ 已儲存'; }
  const saverTxt = this.lastSaver
    ? '最後儲存者 <strong>'+this.lastSaver.by+'</strong> · '+this.fmtTime(this.lastSaver.at)
    : '尚無儲存紀錄';
  el.innerHTML =
    '<div class="save-bar">'+
      '<span class="save-title">💾 儲存控制</span>'+
      '<span class="save-status '+statusCls+'">'+statusTxt+'</span>'+
      '<span class="save-meta">'+saverTxt+'</span>'+
      '<div class="ml-auto flex items-center gap-12 fw-wrap">'+
        '<label class="toggle" title="開啟後，任何修改會即時自動儲存">'+
          '<input type="checkbox" '+(this.autoSave?'checked':'')+' onchange="toggleAutoSave(this.checked)">'+
          '<span class="track"></span><span>即時更新</span>'+
        '</label>'+
        '<button class="btn btn-primary btn-sm" onclick="saveNow()">⬇ 立即更新</button>'+
      '</div>'+
    '</div>';
},

// (cross-tab sync via localStorage removed; state is now server-side)

newEmployee(empId, name){
  const ojtRecs = [];
  Object.entries(ABILITY_DATA).forEach(([cat, data])=>{
    data.items.forEach(item=>{
      ojtRecs.push({id:item.id, category:cat, name:item.name, desc:item.desc,
        currentLevel:"", score:"", mentorNote:"",
        mentorSignerId:"", supervisorSignerId:""});
    });
  });
  return {
    id: Date.now().toString(36)+Math.random().toString(36).slice(2,6),
    empId: empId||"", name: name||"", startDate:"", mentor:"", leader:"", type:"新人訓練",
    dailyRecords: Array.from({length:5},(_,i)=>({
      day:i+1, date:"", learningItems:"", practiceItems:"",
      mentorScore:"", mentorAttitude:"", leaderScore:"", total:"", notes:"",
      mentorSignerId:"", leaderSignerId:""
    })),
    ojtRecords: ojtRecs
  };
},

// ─── SIGNER LOOKUP ───
findSigner(signerId){
  return this.state.signers.find(s=>s.signerId===signerId)||null;
},

signerDisplay(signerId){
  if(!signerId) return '';
  const s = this.findSigner(signerId);
  return s ? `${s.name}（${s.position}）` : `⚠ 未知工號 ${signerId}`;
},

signerBadgeHTML(signerId, cls){
  if(!signerId) return `<span class="sign-btn sign-unsigned ${cls}">○ 待簽核</span>`;
  const s = this.findSigner(signerId);
  if(s) return `<span class="sign-btn sign-signed ${cls}" title="工號: ${s.signerId}">✓ ${s.name}（${s.position}）</span>`;
  return `<span class="sign-btn sign-unsigned ${cls}" style="border-color:#ef444450;color:#f87171">⚠ ${signerId}</span>`;
},

// ─── COMPUTED ───
getEmpAvgScore(emp){
  const scored = emp.dailyRecords.filter(r=>r.total!==''&&r.total!==null);
  if(!scored.length) return null;
  return Math.round(scored.reduce((a,r)=>a+Number(r.total),0)/scored.length);
},

getEmpOjtLevel(emp){
  const withLevel = emp.ojtRecords.filter(r=>r.currentLevel);
  if(!withLevel.length) return null;
  const avg = withLevel.reduce((a,r)=>a+this.levelToNum(r.currentLevel),0)/withLevel.length;
  return 'L'+Math.round(avg);
},

// ─── TAB SWITCHING ───
switchTab(tab){
  this.currentTab = tab;
  document.querySelectorAll('.tab').forEach(t=>{
    t.classList.toggle('active', t.dataset.tab===tab);
  });
  ['training','ojt','cert','settings'].forEach(t=>{
    document.getElementById('tab-'+t).classList.toggle('hidden', t!==tab);
  });
  if(tab==='training'){
    this.renderEmployeeList();
    // keep an open detail (and its radar) in sync with edits made elsewhere
    if(this.state.selectedEmpId && this.state.employees.find(e=>e.id===this.state.selectedEmpId)){
      this.renderEmployeeDetail();
    }
  }
  if(tab==='ojt') this.renderOJT();
  if(tab==='cert') this.renderCert();
  if(tab==='settings') this.renderSettings();
  this.renderSaveBar();
},

// ─── EMPLOYEE LIST ───
filterEmployees(mode){
  if(mode==='all'){
    document.getElementById('searchInput').value='';
    this.searchQuery='';
  } else {
    this.searchQuery = document.getElementById('searchInput').value.trim();
  }
  this.renderEmployeeList();
},

renderEmployeeList(){
  this.renderStatsBar();
  const el = document.getElementById('employeeList');
  const sgb = document.getElementById('scoreGradeBar');
  if(sgb) sgb.innerHTML = this.isLeader() ? this.scoreGradeBarHTML() : '';
  let emps = this.state.employees;
  if(this.currentUser && !this.isLeader()){
    emps = emps.filter(e=>e.empId===this.currentUser.empId);
  }
  if(this.searchQuery){
    const q = this.searchQuery.toLowerCase();
    emps = emps.filter(e=>e.empId.toLowerCase().includes(q)||e.name.toLowerCase().includes(q));
  }
  if(!emps.length && !this.state.employees.length){
    el.innerHTML=`<div class="empty"><div class="empty-icon">📋</div><div>尚無人員資料</div><div style="font-size:12px;margin-top:8px;color:var(--text4)">點擊「＋ 新增人員」或「⬆ 匯入」開始</div></div>`;
    return;
  }
  if(!emps.length){
    el.innerHTML=`<div class="empty"><div class="empty-icon">🔍</div><div>找不到符合「${this.searchQuery}」的人員</div></div>`;
    return;
  }

  let html = `<div class="card"><table class="tbl"><thead><tr>
    <th>工號</th><th>姓名</th>
    ${this.isLeader()?`
    <th style="text-align:center"><span style="color:#0ea5e9;font-family:var(--mono);font-weight:900">A</span> 基礎操作</th>
    <th style="text-align:center"><span style="color:#f59e0b;font-family:var(--mono);font-weight:900">B</span> 異常處理</th>
    <th style="text-align:center"><span style="color:#8b5cf6;font-family:var(--mono);font-weight:900">C</span> 系統理解</th>
    <th style="text-align:center"><span style="color:#ef4444;font-family:var(--mono);font-weight:900">D</span> 值班應對</th>
    <th style="text-align:center;background:var(--surface2)"><span style="font-family:var(--mono);font-weight:900;color:var(--blue2);font-size:13px">總平均</span></th>
    `:''}
    <th>開始日期</th><th>操作</th>
  </tr></thead><tbody>`;
  emps.forEach(emp=>{
    html+=`<tr style="cursor:pointer" onclick="selectEmployee('${emp.id}')">
      <td><span style="font-family:var(--mono);font-weight:600;color:var(--blue2)">${emp.empId||'—'}</span></td>
      <td style="font-weight:600">${emp.name||'—'}</td>
      ${this.isLeader()?`
      <td style="text-align:center">${this.catSummaryCell(emp, 'A', '#0ea5e9')}</td>
      <td style="text-align:center">${this.catSummaryCell(emp, 'B', '#f59e0b')}</td>
      <td style="text-align:center">${this.catSummaryCell(emp, 'C', '#8b5cf6')}</td>
      <td style="text-align:center">${this.catSummaryCell(emp, 'D', '#ef4444')}</td>
      <td style="text-align:center;background:var(--surface2)">${(()=>{ const ojtAvg=this.getEmpOjtAvgScore(emp); const ojtSi=this.getScoreInfo(ojtAvg); return ojtAvg!==null && ojtSi ? '<div><span class="level-badge" style="background:'+ojtSi.color+'25;color:'+ojtSi.color+';border:2px solid '+ojtSi.color+'60;font-size:16px;width:48px;height:30px">'+ojtSi.grade+'</span><div style="font-size:11px;color:var(--text2);margin-top:3px;font-family:var(--mono);font-weight:600">'+ojtAvg+'分</div></div>' : '<span style="color:var(--text4)">—</span>'; })()}</td>
      `:''}
      <td style="color:var(--text2);font-size:12px">${emp.startDate||'—'}</td>
      <td>
        <button class="btn btn-ghost btn-xs" onclick="event.stopPropagation();selectEmployee('${emp.id}')">查看</button>
        ${this.isLeader()?'<button class="btn btn-danger btn-xs" onclick="event.stopPropagation();deleteEmployee(\''+emp.id+'\')">刪除</button>':''}
      </td>
    </tr>`;
  });
  html+='</tbody></table></div>';
  html+=`<div style="margin-top:8px;font-size:11px;color:var(--text4)">共 ${emps.length} 位人員${this.searchQuery?' (篩選結果)':''}</div>`;
  el.innerHTML=html;
},

// ─── ADD EMPLOYEE MODAL ───
openAddEmployee(){
  const root = document.getElementById('modalRoot');
  root.innerHTML=`<div class="overlay" onclick="if(event.target===this)closeModal()">
    <div class="modal">
      <div class="modal-head"><span style="font-weight:700;font-size:15px">新增訓練人員</span><button class="btn btn-ghost btn-xs" onclick="closeModal()">✕</button></div>
      <div class="modal-body">
        <div class="grid g2 mb-16">
          <div><label class="label">工號 <span style="color:var(--red)">*</span></label><input class="field" id="newEmpId" placeholder="例: F12345"></div>
          <div><label class="label">姓名 <span style="color:var(--red)">*</span></label><input class="field" id="newEmpName" placeholder="姓名"></div>
        </div>
        <div class="grid g2 mb-16">
          <div><label class="label">開始訓練日期</label><input type="date" class="field" id="newEmpDate"></div>
          <div><label class="label">訓練類型</label><select class="field" id="newEmpType"><option>新人訓練</option><option>第二專長訓練</option><option>調站</option></select></div>
        </div>
        <div class="grid g2">
          <div><label class="label">指導學長工號</label><input class="field" id="newEmpMentor" placeholder="輸入工號" oninput="previewSigner(this,'newMentorPreview')"><div id="newMentorPreview"></div></div>
          <div><label class="label">組長工號</label><input class="field" id="newEmpLeader" placeholder="輸入工號" oninput="previewSigner(this,'newLeaderPreview')"><div id="newLeaderPreview"></div></div>
        </div>
      </div>
      <div class="modal-foot"><button class="btn btn-ghost btn-sm" onclick="closeModal()">取消</button><button class="btn btn-primary btn-sm" onclick="confirmAddEmployee()">確認新增</button></div>
    </div>
  </div>`;
},

previewSigner(input, targetId){
  const el = document.getElementById(targetId);
  if(!input.value.trim()){el.innerHTML='';return;}
  const s = this.findSigner(input.value.trim());
  el.innerHTML = s
    ? `<div class="signer-result signer-found">✓ ${s.name}（${s.position}）</div>`
    : `<div class="signer-result signer-notfound">⚠ 此工號不在簽核人員清單中</div>`;
},

confirmAddEmployee(){
  const empId = document.getElementById('newEmpId').value.trim();
  const name = document.getElementById('newEmpName').value.trim();
  if(!empId||!name){alert('請填寫工號與姓名');return;}
  if(this.state.employees.find(e=>e.empId===empId)){alert('此工號已存在');return;}
  const emp = this.newEmployee(empId, name);
  emp.startDate = document.getElementById('newEmpDate').value;
  emp.type = document.getElementById('newEmpType').value;
  emp.mentor = document.getElementById('newEmpMentor').value.trim();
  emp.leader = document.getElementById('newEmpLeader').value.trim();
  this.state.employees.push(emp);
  this.save({force:true});
  this.closeModal();
  this.renderEmployeeList();
},

deleteEmployee(id){
  if(!confirm('確定刪除此人員？所有紀錄將無法復原。'))return;
  this.state.employees = this.state.employees.filter(e=>e.id!==id);
  if(this.state.selectedEmpId===id){this.state.selectedEmpId=null;document.getElementById('employeeDetail').classList.add('hidden');}
  this.save({force:true});
  this.renderEmployeeList();
},

closeModal(){document.getElementById('modalRoot').innerHTML='';},

// ─── EMPLOYEE DETAIL (TRAINING RECORDS) ───
selectEmployee(id){
  this.state.selectedEmpId = id;
  this.state.selectedDay = 0;
  this.renderEmployeeDetail(true);
},

renderEmployeeDetail(doScroll){
  const emp = this.state.employees.find(e=>e.id===this.state.selectedEmpId);
  if(!emp){document.getElementById('employeeDetail').classList.add('hidden');return;}
  const el = document.getElementById('employeeDetail');
  el.classList.remove('hidden');

  const avg = this.getEmpAvgScore(emp);
  const si = this.getScoreInfo(avg);
  const mentorInfo = this.findSigner(emp.mentor);
  const leaderInfo = this.findSigner(emp.leader);
  const catA = this.getEmpCatSummary(emp, 'A');
  const catB = this.getEmpCatSummary(emp, 'B');
  const catC = this.getEmpCatSummary(emp, 'C');
  const catD = this.getEmpCatSummary(emp, 'D');

  let html = '';

  // Person Info Card — redesigned (hero + info grid + score/radar panel)
  const prog = this.getEmpProgress(emp);
  const pct = (n,t) => t>0 ? Math.round(n*100/t) : 0;
  const trainDays = this.daysSince(emp.startDate);
  const avatarBg = this.colorFromId(emp.empId || emp.name);
  const mentorBg = emp.mentor ? this.colorFromId(emp.mentor) : '#475569';
  const leaderBg = emp.leader ? this.colorFromId(emp.leader) : '#475569';

  function signerCardHTML(role, value, info, fieldKey, accent){
    const inputId = fieldKey+'-'+emp.id;
    return `<div class="emp-signer-card">
      <div class="emp-signer-head"><span class="pip" style="background:${accent}"></span>${role}</div>
      ${info ? `
        <div class="emp-signer-body">
          <div class="emp-signer-av" style="background:${this.colorFromId(value)}">${this.firstChar(info.name)}</div>
          <div><div class="emp-signer-name">${info.name}</div><div class="emp-signer-pos">${info.position}</div></div>
        </div>` : (value ? `
        <div class="emp-signer-empty" style="color:#f87171">⚠ 工號 ${value} 不在簽核清單</div>` : `
        <div class="emp-signer-empty">尚未指定 ${role}</div>`)
      }
      <input class="field field-sm" value="${value||''}" placeholder="輸入工號"
             onchange="updateEmpField('${emp.id}','${fieldKey}',this.value);renderEmployeeDetail()"
             oninput="showInlineSigner(this,'${inputId}')">
      <div id="${inputId}"></div>
    </div>`;
  }

  function progRowHTML(){ return ''; }  // (removed in v11 — kept as no-op for compat)

  html+=`<div class="card mb-16 fade-up">
    <div class="card-head">
      <div class="dot" style="background:var(--blue)"></div>
      <span style="font-size:13px;font-weight:700;color:var(--text2);letter-spacing:1px">人員資料</span>
      <button class="btn btn-ghost btn-xs ml-auto" onclick="_vm.state.selectedEmpId=null;document.getElementById('employeeDetail').classList.add('hidden');renderEmployeeList()">← 返回列表</button>
    </div>
    <div class="card-body emp-detail-body">

      <!-- HERO STRIP -->
      <div class="emp-hero">
        <div class="emp-avatar" style="background:linear-gradient(135deg,${avatarBg},${avatarBg}aa)">${this.firstChar(emp.name||emp.empId)}</div>
        <div class="emp-hero-main">
          <div class="emp-hero-name">${emp.name||'—'}</div>
          <div class="emp-hero-id">${emp.empId||'—'}</div>
        </div>
        <div class="emp-hero-tags">
          <span class="emp-type-chip">🎓 ${emp.type||'—'}</span>
          <div class="emp-hero-stat"><span class="v">${trainDays!==null?trainDays:'—'}</span><span class="l">訓練天數</span></div>
          <div class="emp-hero-stat"><span class="v" style="font-size:14px">${this.fmtDateZh(emp.startDate)||'—'}</span><span class="l">開始日期</span></div>
        </div>
      </div>

      <!-- INFO BODY: 基本資訊 + 簽核人員（兩張卡並排） -->
      <div class="emp-info-body">
        <div class="emp-info-section">
          <div class="emp-section-title"><span class="pip" style="background:var(--blue)"></span>基本資訊</div>
          <div class="emp-field-row">
            <div>
              <label>開始日期</label>
              <input type="date" class="field field-sm" value="${emp.startDate||''}" onchange="updateEmpField('${emp.id}','startDate',this.value);renderEmployeeDetail()">
            </div>
            <div>
              <label>訓練類型</label>
              <select class="field field-sm" onchange="updateEmpField('${emp.id}','type',this.value);renderEmployeeDetail()">
                <option ${emp.type==='新人訓練'?'selected':''}>新人訓練</option>
                <option ${emp.type==='第二專長訓練'?'selected':''}>第二專長訓練</option>
                <option ${emp.type==='調站'?'selected':''}>調站</option>
              </select>
            </div>
          </div>
        </div>
        <div class="emp-info-section">
          <div class="emp-section-title"><span class="pip" style="background:var(--amber)"></span>簽核人員</div>
          <div class="emp-signer-grid">
            ${signerCardHTML('指導學長', emp.mentor, mentorInfo, 'mentor', '#f59e0b')}
            ${signerCardHTML('組　　長', emp.leader, leaderInfo, 'leader', '#0ea5e9')}
          </div>
        </div>
      </div>

      ${this.isLeader()?`
      <!-- SCORE + RADAR COMBINED PANEL -->
      <div class="emp-skill-panel">
        <div class="emp-score-box">
          <div class="emp-score-label">📈 目前評鑑分數</div>
          ${(()=>{ const a=this.getEmpOjtAvgScore(emp); const si=this.getScoreInfo(a);
            if(a===null) return '<div class="emp-score-empty">—</div><div class="emp-score-note">尚未開始評分</div>';
            return '<div class="emp-score-big">'+
              '<span class="emp-score-num" style="color:'+(si?si.color:'var(--text)')+'">'+a+'</span>'+
              '<span class="emp-score-unit">分</span></div>'+
              (si?'<span class="emp-score-grade" style="background:'+si.color+'25;color:'+si.color+';border:1px solid '+si.color+'60">'+si.grade+'</span>':'')+
              '<div class="emp-score-note">'+(si?si.label:'')+'</div>';
          })()}
        </div>
        <div class="emp-radar-box">
          <div class="emp-radar-title">
            <span class="ic">📡</span>
            <span class="t">平均技能雷達圖</span>
            <span class="s">四大核心技能全方位評估（L1–L4）</span>
          </div>
          ${this.renderRadar(emp)}
        </div>
      </div>
      `:''}

    </div>
  </div>`;

  // Daily Records with date pagination
  const dayIdx = this.state.selectedDay;
  const rec = emp.dailyRecords[dayIdx];
  const recSi = this.getScoreInfo(rec.total);

  // Add day button
  const maxVisible = 5;
  const totalDays = emp.dailyRecords.length;
  let dotStart = 0;
  if(totalDays > maxVisible){
    dotStart = Math.min(Math.max(0, dayIdx - Math.floor(maxVisible/2)), totalDays - maxVisible);
  }
  const dotEnd = Math.min(dotStart + maxVisible, totalDays);

  html+=`<div class="flex items-center gap-12 mb-12 fw-wrap">
    <h3 style="font-size:15px;font-weight:700">每日訓練紀錄</h3>
    <div class="page-dots">`;
  if(dotStart > 0){
    html+=`<button class="page-dot" onclick="_vm.state.selectedDay=0;renderEmployeeDetail()" title="第 1 天" style="font-size:10px">≪</button>`;
  }
  for(let i=dotStart;i<dotEnd;i++){
    const r = emp.dailyRecords[i];
    html+=`<button class="page-dot ${i===dayIdx?'active':''}" onclick="_vm.state.selectedDay=${i};renderEmployeeDetail()" title="第 ${r.day} 天${r.date?' ('+r.date+')':''}">${r.day}</button>`;
  }
  if(dotEnd < totalDays){
    html+=`<button class="page-dot" onclick="_vm.state.selectedDay=${totalDays-1};renderEmployeeDetail()" title="第 ${totalDays} 天" style="font-size:10px">≫</button>`;
  }
  html+=`<button class="page-dot leader-only" onclick="addDay('${emp.id}')" title="新增一天" style="color:var(--blue2);border-color:var(--blue);font-size:16px">+</button>`;
  html+=`</div>`;
  // Date search
  html+=`<div class="flex items-center gap-8" style="margin-left:auto">
    <input type="date" class="field field-sm" style="width:150px" id="daySearchDate" placeholder="搜尋日期" onchange="searchDayByDate('${emp.id}',this.value)">
    <button class="btn btn-ghost btn-xs" onclick="searchDayByDate('${emp.id}',document.getElementById('daySearchDate').value)">🔍 搜尋</button>
    <span style="font-size:11px;color:var(--text4)">共 ${totalDays} 天</span>
  </div>`;
  // Score summary removed
  html+=`</div>`;

  // Day card
  html+=`<div class="card fade-up" style="animation-delay:.08s">
    <div class="card-head">
      <span style="font-family:var(--mono);font-size:14px;font-weight:700;color:var(--blue)">DAY ${String(rec.day).padStart(2,'0')}</span>
      <input type="date" class="field field-sm" style="width:160px" value="${rec.date}" onchange="updateDay('${emp.id}',${dayIdx},'date',this.value)">
      ${emp.dailyRecords.length>1?`<button class="btn btn-danger btn-xs ml-auto" onclick="removeDay('${emp.id}',${dayIdx})">刪除此天</button>`:''}
    </div>
    <div class="card-body">
      <div class="grid g2 mb-16">
        <div><label class="label">學習項目</label><textarea class="field" placeholder="今日學習課程..." onchange="updateDay('${emp.id}',${dayIdx},'learningItems',this.value)">${rec.learningItems}</textarea></div>
        <div><label class="label">實做項目</label><textarea class="field" placeholder="今日實做內容..." onchange="updateDay('${emp.id}',${dayIdx},'practiceItems',this.value)">${rec.practiceItems}</textarea></div>
      </div>
      <div class="mb-16"><label class="label">今日學習心得</label><textarea class="field" placeholder="具體說明今日學習重點..." onchange="updateDay('${emp.id}',${dayIdx},'notes',this.value)">${rec.notes}</textarea></div>
      <div class="flex gap-10 fw-wrap">
        <div>
          <label class="label">指導學長簽核（輸入工號）</label>
          <div class="flex items-center gap-8 mt-4">
            <input class="field field-sm" style="width:120px" placeholder="簽核人工號" value="${rec.mentorSignerId||''}" onchange="updateDay('${emp.id}',${dayIdx},'mentorSignerId',this.value);renderEmployeeDetail()" oninput="showInlineSigner(this,'dayMentor-${dayIdx}')">
            ${this.signerBadgeHTML(rec.mentorSignerId,'')}
          </div>
          <div id="dayMentor-${dayIdx}"></div>
        </div>
        <div>
          <label class="label">組長 / 主管簽核（輸入工號）</label>
          <div class="flex items-center gap-8 mt-4">
            <input class="field field-sm" style="width:120px" placeholder="簽核人工號" value="${rec.leaderSignerId||''}" onchange="updateDay('${emp.id}',${dayIdx},'leaderSignerId',this.value);renderEmployeeDetail()" oninput="showInlineSigner(this,'dayLeader-${dayIdx}')">
            ${this.signerBadgeHTML(rec.leaderSignerId,'')}
          </div>
          <div id="dayLeader-${dayIdx}"></div>
        </div>
      </div>
    </div>
  </div>`;

  el.innerHTML = html;
  if(doScroll) el.scrollIntoView({behavior:'smooth', block:'start'});
},

showInlineSigner(input, targetId){
  const el = document.getElementById(targetId);
  if(!el)return;
  if(!input.value.trim()){el.innerHTML='';return;}
  const s = this.findSigner(input.value.trim());
  el.innerHTML = s
    ? `<div class="signer-result signer-found">✓ ${s.name}（${s.position}）</div>`
    : `<div class="signer-result signer-notfound">⚠ 此工號不在簽核人員清單中</div>`;
},

updateEmpField(id, field, value){
  const emp = this.state.employees.find(e=>e.id===id);
  if(emp) emp[field]=value;
  this.save();
},

updateDay(empId, dayIdx, field, value){
  const emp = this.state.employees.find(e=>e.id===empId);
  if(emp) emp.dailyRecords[dayIdx][field]=value;
  this.save();
},

updateDayScore(empId, dayIdx, field, value){
  const emp = this.state.employees.find(e=>e.id===empId);
  if(!emp) return;
  emp.dailyRecords[dayIdx][field]=value;
  const r = emp.dailyRecords[dayIdx];
  const ms = Number(r.mentorScore)||0;
  const ma = Number(r.mentorAttitude)||0;
  const ls = Number(r.leaderScore)||0;
  r.total = (ms||ma||ls) ? Math.min(100, ms+ma+ls) : '';
  this.save();
  this.renderEmployeeDetail();
  this.renderEmployeeList();
},

addDay(empId){
  const emp = this.state.employees.find(e=>e.id===empId);
  if(!emp)return;
  const nextDay = emp.dailyRecords.length+1;
  emp.dailyRecords.push({day:nextDay,date:"",learningItems:"",practiceItems:"",mentorScore:"",mentorAttitude:"",leaderScore:"",total:"",notes:"",mentorSignerId:"",leaderSignerId:""});
  this.state.selectedDay = emp.dailyRecords.length-1;
  this.save({force:true});
  this.renderEmployeeDetail();
},

searchDayByDate(empId, dateVal){
  if(!dateVal) return;
  const emp = this.state.employees.find(e=>e.id===empId);
  if(!emp) return;
  const idx = emp.dailyRecords.findIndex(r=>r.date===dateVal);
  if(idx>=0){
    this.state.selectedDay = idx;
    this.renderEmployeeDetail();
  } else {
    alert('找不到日期「'+dateVal+'」的訓練紀錄');
  }
},

removeDay(empId, dayIdx){
  const emp = this.state.employees.find(e=>e.id===empId);
  if(!emp||emp.dailyRecords.length<=1)return;
  if(!confirm('確定刪除第 '+emp.dailyRecords[dayIdx].day+' 天紀錄？'))return;
  emp.dailyRecords.splice(dayIdx,1);
  emp.dailyRecords.forEach((r,i)=>r.day=i+1);
  if(this.state.selectedDay>=emp.dailyRecords.length) this.state.selectedDay=emp.dailyRecords.length-1;
  this.save({force:true});
  this.renderEmployeeDetail();
  this.renderEmployeeList();
},

// ─── OJT TAB ───

renderOJT(){
  const el = document.getElementById('tab-ojt');
  if(!this.state.employees.length){
    el.innerHTML=`<div class="empty fade-up"><div class="empty-icon">📝</div><div>請先在「訓練紀錄表」新增人員</div></div>`;
    return;
  }
  let ojtEmps = this.state.employees;
  if(this.currentUser && !this.isLeader()){
    ojtEmps = ojtEmps.filter(e=>e.empId===this.currentUser.empId);
  }
  if(!ojtEmps.length){
    el.innerHTML=`<div class="empty fade-up"><div class="empty-icon">📝</div><div>尚無您的訓練資料</div></div>`;
    return;
  }
  if(!this.ojtSelectedEmpId || !ojtEmps.find(e=>e.id===this.ojtSelectedEmpId)){
    this.ojtSelectedEmpId = ojtEmps[0].id;
  }
  const emp = this.state.employees.find(e=>e.id===this.ojtSelectedEmpId);
  const cat = ABILITY_DATA[this.ojtSelectedCat];
  const catRecs = emp.ojtRecords.filter(r=>r.category===this.ojtSelectedCat);

  let html = `<div class="fade-up">
    <h2 style="font-size:16px;font-weight:700;margin-bottom:14px">能力項目 OJT 簽核紀錄</h2>

    <!-- Employee selector -->
    <div class="flex items-center gap-12 mb-16 fw-wrap">
      <label class="label" style="margin:0">選擇人員</label>
      <select class="field field-sm" style="width:220px" onchange="_vm.ojtSelectedEmpId=this.value;renderOJT()">
        ${ojtEmps.map(e=>`<option value="${e.id}" ${e.id===this.ojtSelectedEmpId?'selected':''}>${e.empId} — ${e.name}</option>`).join('')}
      </select>
      ${(()=>{
        const sA=this.getEmpCatLevel(emp,'A'),sB=this.getEmpCatLevel(emp,'B'),sC=this.getEmpCatLevel(emp,'C'),sD=this.getEmpCatLevel(emp,'D');
        const ojtAvg=this.getEmpOjtAvgScore(emp); const ojtSi=this.getScoreInfo(ojtAvg);
        function lb(label,si){ return '<span style="color:var(--text3);font-weight:500">'+label+'</span>' + (si ? '<span class="level-badge" style="background:'+si.color+'20;color:'+si.color+';border:1px solid '+si.color+'40;font-size:11px;width:30px;height:20px">'+si.grade+'</span>' : '<span style="color:var(--text4)">—</span>'); }
        return '<div class="flex items-center gap-8 ml-auto" style="font-family:var(--mono);font-size:12px">' +
          lb('A',sA) + lb('B',sB) + lb('C',sC) + lb('D',sD) +
          (ojtAvg!==null ? '<span style="margin-left:8px;padding:3px 10px;border-radius:6px;background:'+(ojtSi?.color||'#475569')+'15;color:'+(ojtSi?.color||'var(--text3)')+';font-weight:700;border:1px solid '+(ojtSi?.color||'#475569')+'30">'+ojtAvg+'分</span>' : '') +
          '</div>';
      })()}
    </div>

    <!-- Category tabs -->
    <div class="flex gap-8 mb-20 fw-wrap">
      ${Object.entries(ABILITY_DATA).map(([key,c])=>`
        <button onclick="_vm.ojtSelectedCat='${key}';renderOJT()" style="padding:10px 18px;border-radius:10px;border:1px solid ${this.ojtSelectedCat===key?c.color+'60':'var(--border)'};background:${this.ojtSelectedCat===key?c.color+'15':'var(--surface)'};color:${this.ojtSelectedCat===key?c.color:'var(--text3)'};cursor:pointer;font-size:13px;font-weight:600;font-family:var(--font);transition:all .2s;display:flex;align-items:center;gap:8px">
          <span style="font-family:var(--mono);font-size:16px;font-weight:900">${key}</span>${c.label}
        </button>
      `).join('')}
    </div>

    <!-- Score Grade Reference -->
    <div class="mb-16">${this.scoreGradeBarHTML()}</div>

    <!-- Items table -->
    <div class="card" style="border-color:${cat.color}30">
      <div class="card-head" style="background:${cat.color}08">
        <span style="font-family:var(--mono);font-size:20px;font-weight:900;color:${cat.color}">${this.ojtSelectedCat}</span>
        <div><div style="font-size:14px;font-weight:700">${cat.label}</div><div style="font-size:11px;color:var(--text3)">${cat.en}</div></div>
      </div>
      <div style="overflow-x:auto">
        <table class="tbl" style="min-width:900px">
          <thead><tr>
            <th>項目</th><th>說明</th><th>評分</th><th>目前等級</th><th>指導學長備註</th><th>學長簽核</th><th>主管簽核</th>
          </tr></thead>
          <tbody>`;

  catRecs.forEach(rec=>{
    const gIdx = emp.ojtRecords.findIndex(r=>r.id===rec.id);
    const rsi = this.getScoreInfo(rec.score);
    html+=`<tr>
      <td style="font-weight:600;white-space:nowrap">${rec.name}</td>
      <td style="font-size:12px;color:var(--text2)">${rec.desc}</td>
      <td><div class="flex items-center gap-8">
        <input type="number" min="0" max="100" class="field field-sm" style="width:62px;text-align:center${this.isLeader()?'':';opacity:.6'}" value="${rec.score}" placeholder="分" onchange="updateOjtField('${emp.id}',${gIdx},'score',this.value);renderOJT()" ${this.isLeader()?'':'disabled'}>
      </div></td>
      <td style="text-align:center">${rsi?`<span class="level-badge" style="background:${rsi.color}20;color:${rsi.color};border:1px solid ${rsi.color}40">${rsi.grade}</span>`:'<span style="color:var(--text4)">—</span>'}</td>
      <td><input class="field field-sm" style="min-width:110px${this.isLeader()?'':';opacity:.6'}" placeholder="備註..." value="${rec.mentorNote||''}" onchange="updateOjtField('${emp.id}',${gIdx},'mentorNote',this.value)" ${this.isLeader()?'':'disabled'}></td>
      <td>
        <input class="field field-sm" style="width:90px" placeholder="工號" value="${rec.mentorSignerId||''}"
          onchange="updateOjtField('${emp.id}',${gIdx},'mentorSignerId',this.value);renderOJT()"
          oninput="showInlineSigner(this,'ojtM-${rec.id}')">
        <div id="ojtM-${rec.id}"></div>
        ${rec.mentorSignerId?`<div style="margin-top:3px">${this.signerBadgeHTML(rec.mentorSignerId,'')}</div>`:''}
      </td>
      <td>
        <input class="field field-sm" style="width:90px" placeholder="工號" value="${rec.supervisorSignerId||''}"
          onchange="updateOjtField('${emp.id}',${gIdx},'supervisorSignerId',this.value);renderOJT()"
          oninput="showInlineSigner(this,'ojtS-${rec.id}')">
        <div id="ojtS-${rec.id}"></div>
        ${rec.supervisorSignerId?`<div style="margin-top:3px">${this.signerBadgeHTML(rec.supervisorSignerId,'')}</div>`:''}
      </td>
    </tr>`;
  });

  const mentorSigned = catRecs.filter(r=>r.mentorSignerId).length;
  const supSigned = catRecs.filter(r=>r.supervisorSignerId).length;
  const catAvg = catRecs.filter(r=>r.score).length>0 ? Math.round(catRecs.filter(r=>r.score).reduce((a,r)=>a+Number(r.score),0)/catRecs.filter(r=>r.score).length) : null;

  html+=`</tbody></table></div>
      <div style="padding:12px 20px;border-top:1px solid var(--border);background:#0f1220;display:flex;gap:20px;flex-wrap:wrap;font-size:12px">
        <span style="color:var(--text3)">學長簽核: <strong style="color:var(--green2)">${mentorSigned}</strong>/${catRecs.length}</span>
        <span style="color:var(--text3)">主管簽核: <strong style="color:var(--blue2)">${supSigned}</strong>/${catRecs.length}</span>
        <span style="color:var(--text3)">平均分數: <strong style="color:var(--text)">${catAvg!==null?catAvg:'—'}</strong></span>
      </div>
    </div>
  </div>`;
  el.innerHTML = html;
},

updateOjtField(empId, idx, field, value){
  const emp = this.state.employees.find(e=>e.id===empId);
  if(emp && emp.ojtRecords[idx]) {
    emp.ojtRecords[idx][field]=value;
    if(field==='score'){
      const si = this.getScoreInfo(value);
      emp.ojtRecords[idx].currentLevel = si ? si.grade : '';
    }
    this.save();
  }
},

// ─── CERT TAB ───
renderCert(){
  const el = document.getElementById('tab-cert');
  let html = `<div class="fade-up">
    <h2 style="font-size:16px;font-weight:700;margin-bottom:16px">各等級能力驗證標準</h2>
    <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(265px,1fr));gap:14px">`;
  LEVELS_DATA.forEach((lv,i)=>{
    html+=`<div class="card slide-in" style="border-color:${lv.color}30;animation-delay:${i*.07}s">
      <div style="padding:16px 20px;border-bottom:2px solid ${lv.color}30;background:linear-gradient(135deg,${lv.color}08,transparent)">
        <div class="flex items-center gap-10" style="margin-bottom:6px">
          <span class="level-badge" style="background:${lv.color}20;color:${lv.color};border:1px solid ${lv.color}40">${lv.level}</span>
          <div><div style="font-size:14px;font-weight:700">${lv.title}</div><div style="font-size:11px;color:var(--text3)">${lv.subtitle}</div></div>
        </div>
        <div style="font-size:11px;color:${lv.color};font-weight:600;letter-spacing:.5px;margin-top:4px">${lv.method}</div>
      </div>
      <div style="padding:16px 20px">
        <div style="font-size:11px;font-weight:600;color:var(--text3);margin-bottom:8px">通過條件（3 項全達標）</div>
        ${lv.conditions.map((c,ci)=>`<div class="flex gap-8" style="margin-bottom:8px;font-size:12px;color:#cbd5e1;line-height:1.5"><span style="color:${lv.color};font-weight:700;flex-shrink:0;font-family:var(--mono)">${ci+1}.</span>${c}</div>`).join('')}
        <div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--border)">
          <div style="font-size:11px;color:var(--text3);margin-bottom:4px">驗收工具</div>
          <div style="font-size:12px;color:var(--text2)">${lv.tools}</div>
        </div>
        <div style="margin-top:10px;padding:8px 12px;border-radius:8px;background:${lv.color}10;border:1px solid ${lv.color}20;font-size:12px;font-weight:600;color:${lv.color}">${lv.pass}</div>
      </div>
    </div>`;
  });
  html+=`</div>
    <div class="card mt-20" style="border-color:#ef444430">
      <div style="padding:14px 20px;background:#ef444408;font-size:12px;color:#f87171;line-height:1.6">
        ⚠ 各等級驗收須由直屬主管或資深工程師（L4）擔任評核人；同一人不得自行簽核自身晉級。
      </div>
    </div>
  </div>`;
  el.innerHTML = html;
},

// ─── SETTINGS TAB ───
renderSettings(){
  const el = document.getElementById('tab-settings');
  let html=`<div class="fade-up">
    <h2 style="font-size:16px;font-weight:700;margin-bottom:6px">系統設定</h2>
    <p style="font-size:12px;color:var(--text3);margin-bottom:20px">管理帳號權限與可簽核人員清單</p>

    <!-- Account Management -->
    <div class="card mb-20">
      <div class="card-head">
        <div class="dot" style="background:var(--blue)"></div>
        <span style="font-size:13px;font-weight:700;color:var(--text2)">帳號權限管理</span>
        <span class="badge ml-auto" style="background:var(--surface2);color:var(--text3);border:1px solid var(--border2)">${this.ACCOUNTS.length} 組帳號</span>
      </div>
      <div class="card-body">
        <div class="flex items-center gap-10 mb-16 fw-wrap" style="padding-bottom:16px;border-bottom:1px solid var(--border)">
          <input class="field field-sm" id="newAcctId" placeholder="工號" style="width:120px">
          <input class="field field-sm" id="newAcctPwd" placeholder="密碼" style="width:120px">
          <input class="field field-sm" id="newAcctName" placeholder="姓名（選填）" style="width:120px">
          <select class="field field-sm" id="newAcctRole" style="width:120px">
            <option value="leader">Leader</option>
            <option value="user" selected>User</option>
          </select>
          <button class="btn btn-primary btn-sm" onclick="addAccount()">新增帳號</button>
        </div>
        <table class="tbl">
          <thead><tr><th>工號</th><th>姓名</th><th>密碼</th><th>角色</th><th>操作</th></tr></thead>
          <tbody>
            ${this.ACCOUNTS.map((a,i)=>{
              const isCurrentUser = this.currentUser && a.empId===this.currentUser.empId;
              const rc = a.role==='leader' ? '#16a34a' : '#0ea5e9';
              return `<tr>
                <td><span style="font-family:var(--mono);font-weight:600;color:var(--blue2)">${a.empId}</span></td>
                <td style="font-weight:500">${a.name||'—'}</td>
                <td><span style="font-family:var(--mono);font-size:12px;color:var(--text3)">${a.password}</span></td>
                <td>
                  <select class="field field-sm" style="width:100px;color:${rc};font-weight:600" onchange="changeAccountRole(${i},this.value)" ${isCurrentUser?'disabled title="無法變更自己的角色"':''}>
                    <option value="leader" ${a.role==='leader'?'selected':''} style="color:#16a34a">Leader</option>
                    <option value="user" ${a.role==='user'?'selected':''} style="color:#0ea5e9">User</option>
                  </select>
                </td>
                <td>${isCurrentUser?'<span style="font-size:11px;color:var(--text4)">目前登入</span>':'<button class="btn btn-danger btn-xs" onclick="removeAccount('+i+')">\u522a\u9664</button>'}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <!-- Signer List -->

    <div class="card mb-20">
      <div class="card-head">
        <div class="dot" style="background:var(--amber)"></div>
        <span style="font-size:13px;font-weight:700;color:var(--text2)">可簽核人員清單</span>
        <span class="badge ml-auto" style="background:var(--surface2);color:var(--text3);border:1px solid var(--border2)">${this.state.signers.length} 人</span>
      </div>
      <div class="card-body">
        <!-- Add new signer -->
        <div class="flex items-center gap-10 mb-16 fw-wrap" style="padding-bottom:16px;border-bottom:1px solid var(--border)">
          <input class="field field-sm" id="newSignerId" placeholder="工號" style="width:120px">
          <input class="field field-sm" id="newSignerName" placeholder="姓名" style="width:120px">
          <select class="field field-sm" id="newSignerPos" style="width:140px">
            <option>指導學長</option><option>資深工程師</option><option>組長</option><option>主任</option><option>經理</option><option>L4 資深值班</option>
          </select>
          <button class="btn btn-primary btn-sm" onclick="addSigner()">新增</button>
        </div>

        ${this.state.signers.length===0?`<div class="empty" style="padding:24px"><div class="empty-icon">👤</div><div>尚無簽核人員</div><div style="font-size:12px;margin-top:6px;color:var(--text4)">請新增可簽核的學長、主管等人員</div></div>`:`
        <table class="tbl">
          <thead><tr><th>工號</th><th>姓名</th><th>職位</th><th>操作</th></tr></thead>
          <tbody>
            ${this.state.signers.map((s,i)=>`<tr>
              <td><span style="font-family:var(--mono);font-weight:600;color:var(--blue2)">${s.signerId}</span></td>
              <td style="font-weight:600">${s.name}</td>
              <td><span class="badge" style="background:var(--surface2);border:1px solid var(--border2);color:var(--text2)">${s.position}</span></td>
              <td><button class="btn btn-danger btn-xs" onclick="removeSigner(${i})">移除</button></td>
            </tr>`).join('')}
          </tbody>
        </table>`}
      </div>
    </div>

    <!-- Score Guide -->
    <div class="card">
      <div class="card-head">
        <div class="dot" style="background:var(--violet)"></div>
        <span style="font-size:13px;font-weight:700;color:var(--text2)">評分標準對照</span>
      </div>
      <div class="card-body">
        <div class="grid g4">
          ${SCORE_LABELS.map(s=>`
            <div style="background:${s.color}10;border:1px solid ${s.color}30;border-radius:10px;padding:12px 14px;display:flex;align-items:center;gap:10px">
              <span style="font-family:var(--mono);font-size:20px;font-weight:700;color:${s.color};min-width:28px">${s.grade}</span>
              <div><div style="font-size:12px;font-weight:600;color:${s.color}">${s.min}–${s.max} 分</div><div style="font-size:11px;color:var(--text2)">${s.label}</div></div>
            </div>
          `).join('')}
        </div>
      </div>
    </div>
  </div>`;
  el.innerHTML=html;
},

addAccount(){
  const empId=document.getElementById('newAcctId').value.trim();
  const pwd=document.getElementById('newAcctPwd').value.trim();
  const name=document.getElementById('newAcctName').value.trim();
  const role=document.getElementById('newAcctRole').value;
  if(!empId||!pwd){alert('請填寫工號與密碼');return;}
  if(this.ACCOUNTS.find(a=>a.empId===empId)){alert('此工號已存在');return;}
  this.ACCOUNTS.push({empId, password:pwd, role, name: name||(role==='leader'?'Leader-':'User-')+empId});
  this.save({force:true});
  document.getElementById('newAcctId').value='';
  document.getElementById('newAcctPwd').value='';
  document.getElementById('newAcctName').value='';
  this.renderSettings();
},
changeAccountRole(idx, newRole){
  if(this.ACCOUNTS[idx]) this.ACCOUNTS[idx].role=newRole;
  this.save({force:true});
  this.renderSettings();
},
removeAccount(idx){
  if(!confirm('確定刪除此帳號？'))return;
  this.ACCOUNTS.splice(idx,1);
  this.save({force:true});
  this.renderSettings();
},

addSigner(){
  const id=document.getElementById('newSignerId').value.trim();
  const name=document.getElementById('newSignerName').value.trim();
  const pos=document.getElementById('newSignerPos').value;
  if(!id||!name){alert('請填寫工號與姓名');return;}
  if(this.state.signers.find(s=>s.signerId===id)){alert('此工號已存在');return;}
  this.state.signers.push({signerId:id,name,position:pos});
  this.save({force:true});
  document.getElementById('newSignerId').value='';
  document.getElementById('newSignerName').value='';
  this.renderSettings();
},

removeSigner(idx){
  if(!confirm('確定移除此簽核人員？'))return;
  this.state.signers.splice(idx,1);
  this.save({force:true});
  this.renderSettings();
},

// ─── IMPORT / EXPORT ───
exportData(){
  const blob = new Blob([JSON.stringify(this.state, null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `AMHS_Training_${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
},

importData(e){
  const file = e.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = async function(ev){
    try{
      const data = JSON.parse(ev.target.result);
      if(data.employees && data.signers){
        // Migrate old data: ensure all fields exist
        data.employees.forEach(emp=>{
          emp.dailyRecords.forEach(r=>{
            if(!('mentorSignerId' in r)){r.mentorSignerId='';r.leaderSignerId='';}
          });
          emp.ojtRecords.forEach(r=>{
            if(!('mentorSignerId' in r)){r.mentorSignerId='';r.supervisorSignerId='';}
          });
        });
        this.state.employees = data.employees;
        this.state.signers = data.signers;
        this.state.selectedEmpId = null;
        this.state.selectedDay = 0;
        await this._persist();
        document.getElementById('employeeDetail').classList.add('hidden');
        this.switchTab(this.currentTab);
        alert('匯入成功！共 '+this.state.employees.length+' 位人員、'+this.state.signers.length+' 位簽核人員');
      } else {
        alert('檔案格式錯誤，請確認為本系統匯出的 JSON 檔案');
      }
    }catch(err){
      alert('匯入失敗：'+err.message);
    }
  };
  reader.readAsText(file);
  e.target.value='';
}

// ─── INIT ───
  },

  mounted() {
    const token = sessionStorage.getItem('amhs_token');
    const user  = sessionStorage.getItem('amhs_user');
    if (!token || !user) { location.href = 'index.html'; return; }
    this._authToken  = token;
    this.currentUser = JSON.parse(user);
    try { this.autoSave = localStorage.getItem('amhs_autosave') !== 'off'; } catch(e) {}
    this.enterApp();
  },

});

const _vm = vueApp.mount('#app');
const _exposed = ['apiFetch', 'isLeader', 'applyRoleUI', 'doLogout', 'enterApp', 'getScoreInfo', 'getEmpCatSummary', 'getEmpCatLevel', 'catSummaryCell', 'getEmpOjtAvgScore', 'getEmpCatAvgScore', 'getEmpOverallGrade', 'daysSince', 'colorFromId', 'firstChar', 'fmtDateZh', 'getEmpProgress', 'scoreGradeBarHTML', 'levelToNum', 'statIcon', 'renderStatsBar', 'statCard', 'scoreToLevelVal', 'renderRadar', '_persist', 'save', 'saveNow', 'toggleAutoSave', 'showSaveWarn', 'showSaveToast', 'fmtTime', 'renderSaveBar', 'newEmployee', 'findSigner', 'signerDisplay', 'signerBadgeHTML', 'getEmpAvgScore', 'getEmpOjtLevel', 'switchTab', 'filterEmployees', 'renderEmployeeList', 'openAddEmployee', 'previewSigner', 'confirmAddEmployee', 'deleteEmployee', 'closeModal', 'selectEmployee', 'renderEmployeeDetail', 'showInlineSigner', 'updateEmpField', 'updateDay', 'updateDayScore', 'addDay', 'searchDayByDate', 'removeDay', 'renderOJT', 'updateOjtField', 'renderCert', 'renderSettings', 'addAccount', 'changeAccountRole', 'removeAccount', 'addSigner', 'removeSigner', 'exportData', 'importData'];
_exposed.forEach(m => { if (typeof _vm[m] === 'function') window[m] = (...a) => _vm[m](...a); });