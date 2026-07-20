let editId = null;
let selectedStatus = 'todo';
function localDateStr(d){
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const day = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}
const today = localDateStr(new Date());
let currentDate = today;
let DB = {};

function daysInMonth(year, month /*1-12*/){ return new Date(year, month, 0).getDate(); }
function clampDueDate(monthKey, dueDay){
  const [y,m] = monthKey.split('-').map(Number);
  const d = Math.min(dueDay, daysInMonth(y,m));
  return `${monthKey}-${String(d).padStart(2,'0')}`;
}
function shiftMonth(monthKey, delta){
  let [y,m] = monthKey.split('-').map(Number);
  m += delta;
  while(m>12){ m-=12; y++; }
  while(m<1){ m+=12; y--; }
  return `${y}-${String(m).padStart(2,'0')}`;
}
function monthLabelTH(monthKey){
  const [y,m] = monthKey.split('-').map(Number);
  const names = ['','ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
  return `${names[m]} ${y}`;
}

// ── เปลี่ยน URL นี้เป็น Workers URL ของคุณ ──────────
const API = 'https://trackingtask.sarayutd7.workers.dev';

// ── Read/Write JSON via Cloudflare Workers ────────────
function authHeaders(){
  const token = localStorage.getItem(AUTH_TOKEN_KEY);
  return token ? { 'Authorization': 'Bearer ' + token } : {};
}

// แคชทุกอย่างใน localStorage (DB, Note/QuickLink, ช่องทางจ่าย, คอลัมน์บอร์ด, daily log ฯลฯ)
// ต้องผูกกับ username เสมอ ห้ามใช้ key เดียวกันข้าม account
// (ไม่งั้น account อื่นบนเครื่อง/เบราว์เซอร์เดียวกันจะเห็นข้อมูลของ account ก่อนหน้า)
function userKey(base){
  const u = localStorage.getItem('trackingTaskUser');
  return u ? (base + ':' + u) : null;
}
function dbCacheKey(){ return userKey('dailyTodoPro'); }
// ลบแคชเก่าที่ไม่ผูกกับ account ทิ้งทั้งหมด (ของ bug เดิม ก่อนแก้)
['dailyTodoPro','dailyTodoCols','dailyTodoLog','dailyTodoQL','dailyTodoQLTags','dailyTodoFinPM'].forEach(k=>localStorage.removeItem(k));

async function loadFile({ silent = false } = {}){
  // Optimistic: load from localStorage cache immediately so UI renders instantly
  const key = dbCacheKey();
  if (key && !silent) {
    try {
      const cached = localStorage.getItem(key);
      if (cached) DB = JSON.parse(cached);
    } catch(_) {}
  }
  try {
    const r = await fetch(API + '/data', { headers: authHeaders() });
    if(r.status === 401){ sessionExpired(); return; }
    if(r.status === 403){
      const data = await r.json().catch(()=>({}));
      if(data.error === 'PIN_RESET_REQUIRED'){ showResetPinScreen(); return; }
      accountDisabled(data.error); return;
    }
    if(r.ok) DB = await r.json();
    else DB = {};
    const menusHeader = r.headers.get('X-Allowed-Menus');
    if(menusHeader){
      localStorage.setItem(AUTH_MENUS_KEY, JSON.stringify(menusHeader.split(',').filter(Boolean)));
      if(typeof applyMenuPermissions === 'function') applyMenuPermissions();
    }
    if(key) localStorage.setItem(key, JSON.stringify(DB));
  } catch(_){
    try { DB = key ? JSON.parse(localStorage.getItem(key)||'{}') : {}; } catch(_){ DB = {}; }
    if (!silent) showStatus('⚠️ โหลดจาก browser (offline)', 'warn');
  }
}

async function writeFile(){
  const key = dbCacheKey();
  try {
    const r = await fetch(API + '/data', {
      method: 'POST',
      headers: {'Content-Type':'application/json', ...authHeaders()},
      body: JSON.stringify(DB)
    });
    if(r.status === 401){ sessionExpired(); return; }
    if(r.status === 403){
      const data = await r.json().catch(()=>({}));
      if(data.error !== 'PIN_RESET_REQUIRED'){ accountDisabled(data.error); return; }
    }
    if(!r.ok) throw new Error('status '+r.status);
    if(key) localStorage.setItem(key, JSON.stringify(DB));
    showStatus('✓ บันทึกแล้ว', 'ok');
  } catch(e){
    if(key) localStorage.setItem(key, JSON.stringify(DB));
    showStatus('⚠️ บันทึกใน browser เท่านั้น', 'warn');
  }
}

function sessionExpired(){
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_USER_KEY);
  DB = {};
  lockShow();
}

function accountDisabled(message){
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_USER_KEY);
  localStorage.removeItem(AUTH_MENUS_KEY);
  DB = {};
  lockShow();
  const errorEl = document.getElementById('lockError');
  if(errorEl) errorEl.textContent = message || 'บัญชีนี้ถูกระงับการใช้งาน';
  alert(message || 'บัญชีนี้ถูกระงับการใช้งาน กรุณาติดต่อผู้ดูแลระบบ');
}

function getTasks(d){ return DB[d]||[]; }
function setTasks(d, t){ DB[d]=t; }

function showStatus(msg, type){
  let el = document.getElementById('saveStatus');
  if(!el){
    el = document.createElement('div');
    el.id = 'saveStatus';
    el.style.cssText = 'position:fixed;bottom:1.2rem;right:1.5rem;padding:.45rem 1rem;border-radius:8px;font-size:.78rem;font-weight:500;transition:opacity .4s;z-index:999;pointer-events:none';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.style.opacity = '1';
  el.style.background = type==='ok' ? 'var(--green-dim)' : 'var(--amber-dim)';
  el.style.color      = type==='ok' ? 'var(--green)'     : 'var(--amber)';
  el.style.border     = `1px solid ${type==='ok' ? 'var(--green)' : 'var(--amber)'}`;
  clearTimeout(el._t);
  el._t = setTimeout(()=>{ el.style.opacity='0'; }, 2500);
}

// ── Theme (Light / Dark) ─────────────────────────────
const THEME_KEY = 'dailyTodoTheme';
const THEME_MOON_SVG = '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
const THEME_SUN_SVG = '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>';
function applyTheme(t){
  document.documentElement.setAttribute('data-theme', t);
  localStorage.setItem(THEME_KEY, t);
  const iconEl = document.getElementById('sbThemeIcon');
  if(iconEl) iconEl.innerHTML = t === 'light' ? THEME_SUN_SVG : THEME_MOON_SVG;
}
function toggleTheme(){
  const cur = document.documentElement.getAttribute('data-theme') || 'dark';
  applyTheme(cur === 'dark' ? 'light' : 'dark');
}
// init: โหลด theme จาก localStorage
(function(){ applyTheme(localStorage.getItem(THEME_KEY) || 'dark'); })();

// ── Date navigation ─────────────────────────────────
function shiftDay(delta){
  const d = new Date(currentDate + 'T00:00:00');
  d.setDate(d.getDate() + delta);
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const day = String(d.getDate()).padStart(2,'0');
  currentDate = `${y}-${m}-${day}`;
  document.getElementById('datePicker').value = currentDate;
  render();
  renderDL();
  renderFinance();
  renderTimeline();
}
function prevDay(){ shiftDay(-1); }
function nextDay(){ shiftDay(+1); }

// ── Init ────────────────────────────────────────────
const dp = document.getElementById('datePicker');
dp.value = today;
dp.addEventListener('change', e => { currentDate = e.target.value; render(); renderDL(); renderFinance(); renderTimeline(); });

// โหลด localStorage ไว้ก่อน จนกว่า server จะตอบ (เฉพาะของ account ที่ login อยู่เท่านั้น)
try {
  const cacheKey = dbCacheKey();
  DB = cacheKey ? JSON.parse(localStorage.getItem(cacheKey)||'{}') : {};
} catch(_){ DB = {}; }
// render() ถูกย้ายไปท้าย script เพื่อให้ const declarations ทั้งหมดถูก initialize ก่อน

// ── Tab switching ────────────────────────────────────
// ── Topbar search ──────────────────────────────────────
function openTopbarSearch(){
  const wrap = document.getElementById('topbarSearchWrap');
  const btn  = document.getElementById('topbarSearchBtn');
  const inp  = document.getElementById('topbarSearchInput');
  if(wrap){ wrap.style.display='flex'; btn.style.display='none'; inp.focus(); }
}
function closeTopbarSearch(){
  const wrap = document.getElementById('topbarSearchWrap');
  const btn  = document.getElementById('topbarSearchBtn');
  const res  = document.getElementById('topbarSearchResults');
  if(wrap){ wrap.style.display='none'; btn.style.display=''; }
  if(res)  res.style.display='none';
  const inp = document.getElementById('topbarSearchInput');
  if(inp) inp.value='';
}
function topbarSearch(q){
  const res = document.getElementById('topbarSearchResults');
  if(!res) return;
  q = q.trim();
  if(!q){ res.style.display='none'; return; }
  const ql = q.toLowerCase();
  const hits = [];
  // search tasks (current day ± all days in DB)
  const allDates = Object.keys(DB._tasks||{});
  allDates.forEach(date=>{
    (DB._tasks[date]||[]).forEach(t=>{
      if((t.title||'').toLowerCase().includes(ql)){
        hits.push({type:'task', title:t.title, sub:date, action:()=>{
          currentDate=date;
          const dp=document.getElementById('datePicker'); if(dp) dp.value=date;
          render(); renderDL(); renderFinance(); switchTab('task'); closeTopbarSearch();
        }});
      }
    });
  });
  // search notes
  (QL||[]).forEach((item,i)=>{
    if((item.name||'').toLowerCase().includes(ql)||(item.detail||'').toLowerCase().includes(ql)){
      hits.push({type:'note', title:item.name, sub:item.tag?qlTagLabel(item.tag):'', action:()=>{
        switchTab('tool'); setTimeout(()=>qlOpenRead(i),50); closeTopbarSearch();
      }});
    }
  });
  if(!hits.length){
    res.innerHTML=`<div class="tsearch-empty">ไม่พบผลลัพธ์สำหรับ "${esc(q)}"</div>`;
  } else {
    res.innerHTML = hits.slice(0,20).map((h,i)=>`
      <div class="tsearch-item" onclick="__tsearchHit(${i})">
        <span class="tsearch-badge ${h.type}">${h.type==='task'?'Task':'Note'}</span>
        <div><div class="tsearch-item-title">${esc(h.title)}</div>${h.sub?`<div class="tsearch-item-sub">${esc(h.sub)}</div>`:''}</div>
      </div>`).join('');
    window.__tsearchHits = hits;
  }
  res.style.display='';
}
function __tsearchHit(i){ if(window.__tsearchHits&&window.__tsearchHits[i]) window.__tsearchHits[i].action(); }

function toggleSidebar(){
  const isMobile = window.innerWidth <= 768;
  if(isMobile){
    const sb = document.getElementById('appSidebar');
    const bd = document.getElementById('sbBackdrop');
    const open = sb.classList.toggle('open');
    if(bd) bd.classList.toggle('open', open);
  } else {
    document.querySelector('.shell').classList.toggle('sidebar-collapsed');
  }
}
function closeSidebar(){
  const sb = document.getElementById('appSidebar');
  const bd = document.getElementById('sbBackdrop');
  if(sb) sb.classList.remove('open');
  if(bd) bd.classList.remove('open');
}

function switchTab(tab){
  ['tabTask','tabDaily','tabTool','tabFinance','tabTimeline'].forEach(id=>{
    const el = document.getElementById(id);
    if(!el) return;
    el.classList.remove('active-pane');
    el.style.display = 'none';
  });
  const active = {task:'tabTask',daily:'tabDaily',tool:'tabTool',finance:'tabFinance',timeline:'tabTimeline'}[tab];
  if(active){
    const el = document.getElementById(active);
    el.style.display = '';
    requestAnimationFrame(()=>{ el.classList.add('active-pane'); });
  }
  document.getElementById('tabBtnTask').classList.toggle('active',     tab==='task');
  document.getElementById('tabBtnDaily').classList.toggle('active',    tab==='daily');
  document.getElementById('tabBtnTool').classList.toggle('active',     tab==='tool');
  document.getElementById('tabBtnFinance').classList.toggle('active',  tab==='finance');
  const tlBtn = document.getElementById('tabBtnTimeline');
  if(tlBtn) tlBtn.classList.toggle('active', tab==='timeline');
  // sync sidebar + bottom nav
  ['task','daily','tool','finance','timeline'].forEach(t=>{
    const sb = document.getElementById('sb-'+t);
    const bnb = document.getElementById('bnb-'+t);
    if(sb)  sb.classList.toggle('sb-on',  t===tab);
    if(bnb) bnb.classList.toggle('bnb-on', t===tab);
  });
  if(tab==='daily')   { renderDL(); }
  if(tab==='finance') { renderFinance(); if(finSubTab==='bills') renderBills(); if(finSubTab==='income') renderIncomeSources(); }
  if(tab==='timeline'){
    if(!document.getElementById('tlCanvas')?.dataset.dragBound) tlInitDrag();
    renderTimeline();
    if(currentDate===today) tlScrollToNow();
  }
  // update mobile title & close drawer
  const titles = {task:'Daily Task', daily:'บันทึกประจำวัน', tool:'Note (QL)', finance:'รายรับ-รายจ่าย', timeline:'Timeline'};
  const titleEl = document.getElementById('mobileTabTitle');
  if(titleEl) titleEl.textContent = titles[tab] || '';
  const topbarDateEl = document.getElementById('topbarDate');
  if(topbarDateEl){
    const today = new Date();
    topbarDateEl.textContent = today.toLocaleDateString('th-TH',{weekday:'short',day:'numeric',month:'long',year:'numeric'});
  }
  closeSidebar();
}

// ── Status selector ─────────────────────────────────
function selectStatus(val){
  selectedStatus = val;
  document.querySelectorAll('.status-pill').forEach(p=>{
    p.classList.remove('active');
    if(p.dataset.val === val) p.classList.add('active');
  });
}

// ── Modal ────────────────────────────────────────────
let selectedPriority = '';

function selectPriority(p){
  selectedPriority = p;
  document.querySelectorAll('#priorityRow .priority-pill').forEach(btn=>{
    btn.classList.toggle('active-priority', btn.dataset.p === p);
  });
}

function clearPriority(){
  selectedPriority = '';
  document.querySelectorAll('#priorityRow .priority-pill').forEach(btn=>btn.classList.remove('active-priority'));
}

function openModal(status, id=null){
  editId = id;
  document.getElementById('statusRow').innerHTML = COLS.map(col=>
    `<button class="status-pill ${col.color}" data-val="${esc(col.id)}" onclick="selectStatus('${esc(col.id)}')">${esc(col.name)}</button>`
  ).join('');
  const tasks = getTasks(currentDate);
  if(id){
    const t = tasks.find(x=>x.id===id);
    if(!t) return;
    document.getElementById('modalTitle').textContent = 'แก้ไขงาน';
    document.getElementById('taskTitle').value = t.title;
    rteSetHTML('taskNoteBody', t.note||'');
    document.getElementById('taskTimeStart').value = t.timeStart || '';
    document.getElementById('taskTimeEnd').value   = t.timeEnd   || '';
    selectStatus(t.status);
    t.priority ? selectPriority(t.priority) : clearPriority();
    taskEditHidden = !!t.hidden;
    document.getElementById('taskHideToggle').classList.toggle('on', taskEditHidden);
  } else {
    document.getElementById('modalTitle').textContent = 'เพิ่มงานใหม่';
    document.getElementById('taskTitle').value = '';
    rteClear('taskNoteBody');
    document.getElementById('taskTimeStart').value = '';
    document.getElementById('taskTimeEnd').value   = '';
    selectStatus(status || COLS[0]?.id || 'todo');
    clearPriority();
    taskEditHidden = false;
    document.getElementById('taskHideToggle').classList.toggle('on', false);
  }
  document.getElementById('overlay').style.display='flex';
  setTimeout(()=>document.getElementById('taskTitle').focus(),60);
}

function closeModal(){ document.getElementById('overlay').style.display='none'; editId=null; }
function closeOnBg(e){ if(e.target===document.getElementById('overlay')) closeModal(); }

let taskEditHidden = false;
function taskToggleHide(){
  taskEditHidden = !taskEditHidden;
  document.getElementById('taskHideToggle').classList.toggle('on', taskEditHidden);
}

// ── Column Management ────────────────────────────────
let editColId = null;
let selectedColColor = 'purple';

function openColAdd(){
  editColId = null;
  selectedColColor = 'purple';
  document.getElementById('colModalTitle').textContent = 'เพิ่ม Column ใหม่';
  document.getElementById('colName').value = '';
  document.getElementById('colDeleteBtn').style.display = 'none';
  colSelectColor('purple');
  document.getElementById('colOverlay').style.display = 'flex';
  setTimeout(()=>document.getElementById('colName').focus(), 60);
}

function openColEdit(id){
  const col = COLS.find(c=>c.id===id);
  if(!col) return;
  editColId = id;
  selectedColColor = col.color;
  document.getElementById('colModalTitle').textContent = 'แก้ไข Column';
  document.getElementById('colName').value = col.name;
  document.getElementById('colDeleteBtn').style.display = COLS.length>1 ? 'inline-flex' : 'none';
  colSelectColor(col.color);
  document.getElementById('colOverlay').style.display = 'flex';
  setTimeout(()=>document.getElementById('colName').focus(), 60);
}

function colSelectColor(color){
  selectedColColor = color;
  document.querySelectorAll('.col-color-swatch').forEach(el=>{
    el.classList.toggle('selected', el.dataset.color===color);
  });
}

function colClose(){
  document.getElementById('colOverlay').style.display = 'none';
  editColId = null;
}
function colCloseOnBg(e){ if(e.target===document.getElementById('colOverlay')) colClose(); }

function colSave(){
  const name = document.getElementById('colName').value.trim();
  if(!name){ document.getElementById('colName').focus(); return; }
  if(editColId){
    const col = COLS.find(c=>c.id===editColId);
    if(col){ col.name=name; col.color=selectedColColor; }
  } else {
    COLS.push({ id:'c'+Date.now().toString(36), name, color:selectedColColor });
  }
  saveCols(); renderBoard(); render(); colClose();
}

function colDelete(){
  if(!editColId||COLS.length<=1) return;
  const col = COLS.find(c=>c.id===editColId);
  if(!col) return;
  let taskCount = 0;
  Object.values(DB).forEach(arr=>{ if(Array.isArray(arr)) taskCount+=arr.filter(t=>t.status===editColId).length; });
  if(taskCount>0){
    if(!confirm(`Column "${col.name}" มี ${taskCount} task อยู่\nลบ column และย้าย task ไปที่ column แรกไหม?`)) return;
    const targetId = COLS.find(c=>c.id!==editColId)?.id;
    Object.keys(DB).forEach(date=>{
      DB[date]=DB[date].map(t=>t.status===editColId?{...t,status:targetId,updatedAt:new Date().toISOString()}:t);
    });
    writeFile();
  }
  COLS=COLS.filter(c=>c.id!==editColId);
  saveCols(); renderBoard(); render(); colClose();
}

// ── CRUD ─────────────────────────────────────────────
async function saveTask(){
  const title = document.getElementById('taskTitle').value.trim();
  if(!title){ document.getElementById('taskTitle').focus(); return; }
  const timeStart = document.getElementById('taskTimeStart').value || '';
  const timeEnd   = document.getElementById('taskTimeEnd').value || '';
  const tasks = getTasks(currentDate);
  if(editId){
    const idx = tasks.findIndex(x=>x.id===editId);
    if(idx>-1){
      tasks[idx].title     = title;
      tasks[idx].note      = rteGetHTML('taskNoteBody');
      tasks[idx].status    = selectedStatus;
      tasks[idx].priority  = selectedPriority || '';
      tasks[idx].timeStart = timeStart;
      tasks[idx].timeEnd   = timeEnd;
      tasks[idx].hidden    = taskEditHidden;
      tasks[idx].updatedAt = new Date().toISOString();
      if(taskEditHidden) taskUnlockedIds.delete(tasks[idx].id);
    }
  } else {
    tasks.push({
      id: Date.now().toString(36)+Math.random().toString(36).slice(2,6),
      title,
      note:      rteGetHTML('taskNoteBody'),
      status:    selectedStatus,
      priority:  selectedPriority || '',
      timeStart,
      timeEnd,
      hidden:    taskEditHidden,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  }
  setTasks(currentDate, tasks);
  closeModal();
  await writeFile();
  render();
}

async function deleteTask(id){
  setTasks(currentDate, getTasks(currentDate).filter(x=>x.id!==id));
  await writeFile();
  render();
}

async function moveTask(id, newStatus){
  const tasks = getTasks(currentDate);
  const t = tasks.find(x=>x.id===id);
  if(t){ t.status=newStatus; t.updatedAt=new Date().toISOString(); }
  setTasks(currentDate, tasks);
  await writeFile();
  render();
}

// ── Hidden tasks (PIN-lock) ──────────────────────────
let taskUnlockedIds = new Set(); // เก็บแค่ใน session นี้ ไม่ persist — กลับมาเปิดแอปใหม่ต้องใส่ PIN อีก
let taskPendingUnlockId = null;

async function taskToggleQuickHide(id){
  const tasks = getTasks(currentDate);
  const t = tasks.find(x=>x.id===id);
  if(!t) return;
  t.hidden = !t.hidden;
  t.updatedAt = new Date().toISOString();
  if(t.hidden) taskUnlockedIds.delete(id);
  setTasks(currentDate, tasks);
  await writeFile();
  render();
}

function taskRequestUnlock(id){
  taskPendingUnlockId = id;
  document.getElementById('taskUnlockPin').value = '';
  document.getElementById('taskUnlockError').textContent = '';
  document.getElementById('taskUnlockOverlay').style.display = 'flex';
  setTimeout(()=>document.getElementById('taskUnlockPin').focus(), 60);
}

function closeTaskUnlock(){
  document.getElementById('taskUnlockOverlay').style.display = 'none';
  taskPendingUnlockId = null;
}

async function submitTaskUnlock(){
  const pin = document.getElementById('taskUnlockPin').value;
  const errorEl = document.getElementById('taskUnlockError');
  if(!PIN_RE.test(pin)){ errorEl.textContent = 'PIN ต้องเป็นตัวเลข 6 หลักเท่านั้น'; return; }
  try {
    const r = await fetch(API + '/verify-pin', {
      method: 'POST',
      headers: {'Content-Type':'application/json', ...authHeaders()},
      body: JSON.stringify({ pin })
    });
    const data = await r.json();
    if(!r.ok){
      errorEl.textContent = data.error || 'PIN ไม่ถูกต้อง';
      return;
    }
    if(taskPendingUnlockId) taskUnlockedIds.add(taskPendingUnlockId);
    closeTaskUnlock();
    render();
  } catch(e){
    errorEl.textContent = 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ลองใหม่อีกครั้ง';
  }
}


// ── Toast ────────────────────────────────────────────
function showToast(msg, ms=2400){
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(()=>{ el.style.opacity='0'; el.style.transition='opacity .3s'; setTimeout(()=>el.remove(),320); }, ms);
}

// ── Reschedule ───────────────────────────────────────
let rschedTaskId = null;

function openReschedule(id){
  const task = getTasks(currentDate).find(x=>x.id===id);
  if(!task) return;
  rschedTaskId = id;
  document.getElementById('rschedTaskName').textContent = task.title;
  // default = tomorrow
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate()+1);
  document.getElementById('rschedDate').value = localDateStr(tomorrow);
  document.getElementById('rschedOverlay').style.display='flex';
}

function rschedClose(){
  document.getElementById('rschedOverlay').style.display='none';
  rschedTaskId = null;
}

function rschedCloseOnBg(e){
  if(e.target===document.getElementById('rschedOverlay')) rschedClose();
}

async function rschedConfirm(){
  if(!rschedTaskId) return;
  const targetDate = document.getElementById('rschedDate').value;
  if(!targetDate || targetDate === currentDate) return;

  // ดึง task จากวันนี้
  const srcTasks = getTasks(currentDate);
  const idx = srcTasks.findIndex(x=>x.id===rschedTaskId);
  if(idx===-1) return;
  const task = { ...srcTasks[idx], updatedAt: new Date().toISOString() };

  // ลบออกจากวันนี้
  srcTasks.splice(idx,1);
  setTasks(currentDate, srcTasks);

  // ใส่เข้าวันปลายทาง
  const dstTasks = getTasks(targetDate);
  dstTasks.push(task);
  setTasks(targetDate, dstTasks);

  await writeFile();
  rschedClose();
  render();

  // แจ้งว่าย้ายสำเร็จ
  const d = new Date(targetDate+'T00:00:00');
  const label = d.toLocaleDateString('th-TH',{weekday:'short',day:'numeric',month:'short'});
  showToast(`ย้ายไป ${label} แล้ว`);
}

// ── Export ───────────────────────────────────────────
function exportJSON(){
  const blob = new Blob([JSON.stringify(DB,null,2)],{type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href=url; a.download='daily-todo.json'; a.click();
  URL.revokeObjectURL(url);
}

// ── Link helpers ──────────────────────────────────────
const URL_RE = /https?:\/\/[^\s\u3000\u3001\u3002\uff0c\uff0e"'<>()[\]{}]+/g;

const MDLINK_RE = () => /\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g;

// Extract raw URLs only (skip URLs inside [text](url) markdown links)
function extractLinks(text){
  const parts = [];
  let lastIdx = 0, m;
  const re = MDLINK_RE();
  while((m = re.exec(text)) !== null){
    parts.push(text.slice(lastIdx, m.index));
    lastIdx = m.index + m[0].length;
  }
  parts.push(text.slice(lastIdx));
  return (parts.join('').match(URL_RE)||[]);
}

// Remove raw URLs from note but keep markdown links intact
function noteWithoutLinks(text){
  const parts = [];
  let lastIdx = 0, m;
  const re = MDLINK_RE();
  while((m = re.exec(text)) !== null){
    parts.push(text.slice(lastIdx, m.index).replace(URL_RE,''));
    parts.push(m[0]);
    lastIdx = m.index + m[0].length;
  }
  parts.push(text.slice(lastIdx).replace(URL_RE,''));
  return parts.join('').replace(/\n{3,}/g,'\n\n').trim();
}

// Render note text: convert [text](url) to <a> tags, escape the rest
function renderNote(text){
  let result = '', lastIdx = 0, m;
  const re = MDLINK_RE();
  while((m = re.exec(text)) !== null){
    result += esc(text.slice(lastIdx, m.index));
    result += `<a href="${esc(m[2])}" target="_blank" rel="noopener" title="${esc(m[2])}">${esc(m[1])}</a>`;
    lastIdx = m.index + m[0].length;
  }
  result += esc(text.slice(lastIdx));
  return result;
}

function shortUrl(url){
  try {
    const u = new URL(url);
    const p = u.pathname.split('/').filter(Boolean);
    // ดึงชื่อไฟล์จาก path หรือ query param "file="
    const fileParam = u.searchParams.get('file') || u.searchParams.get('sourcedoc');
    if(fileParam){
      const name = decodeURIComponent(fileParam).split(/[/\\]/).pop().replace(/\.[^.]+$/,'');
      return name.length > 30 ? name.slice(0,28)+'…' : name;
    }
    const last = p[p.length-1];
    if(last) return last.length > 30 ? last.slice(0,28)+'…' : last;
    return u.hostname;
  } catch(_){ return url.slice(0,30)+'…'; }
}

const linkSvg = `<svg width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`;
function fmtTime(iso){
  if(!iso) return '';
  return new Date(iso).toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit'});
}
function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

function showImagePreview(src){
  document.getElementById('imagePreviewImg').src = src;
  document.getElementById('imagePreviewOverlay').style.display = 'flex';
}
function closeImagePreview(){
  document.getElementById('imagePreviewOverlay').style.display = 'none';
  document.getElementById('imagePreviewImg').src = '';
}

// ── Rich-text sanitizer (whitelist tags/attrs, strip script vectors) ──
const RTE_ALLOWED_TAGS = new Set(['B','STRONG','I','EM','U','S','STRIKE','BR','DIV','SPAN','P','UL','OL','LI','A','IMG','BLOCKQUOTE','H1','H2','H3','SUB','SUP','FONT']);
const RTE_ALLOWED_ATTRS = { A: ['href','target','rel'], IMG: ['src','alt'], FONT: ['color'], '*': ['style'] };
function rteSanitizeStyle(value){
  if(/url\s*\(|expression\s*\(|javascript:/i.test(value)) return '';
  return value;
}
function sanitizeRichHTML(html){
  const tpl = document.createElement('template');
  tpl.innerHTML = String(html || '');
  const walk = (node)=>{
    [...node.childNodes].forEach(child=>{
      if(child.nodeType === Node.ELEMENT_NODE){
        if(!RTE_ALLOWED_TAGS.has(child.tagName)){
          child.replaceWith(...child.childNodes);
          return;
        }
        [...child.attributes].forEach(attr=>{
          const name = attr.name.toLowerCase();
          const allowed = (RTE_ALLOWED_ATTRS[child.tagName]||[]).includes(name) || RTE_ALLOWED_ATTRS['*'].includes(name);
          if(!allowed){ child.removeAttribute(attr.name); return; }
          if(name === 'href' || name === 'src'){
            if(/^\s*(javascript:|data:text\/html)/i.test(attr.value)) child.removeAttribute(attr.name);
            if(name === 'src' && child.tagName === 'IMG' && !/^data:image\//i.test(attr.value)) {
              child.removeAttribute(attr.name);
              return;
            }
          }
          if(name === 'style'){
            const safe = rteSanitizeStyle(attr.value);
            if(safe) child.setAttribute('style', safe); else child.removeAttribute('style');
          }
        });
        if(child.tagName === 'A') child.setAttribute('rel', 'noopener noreferrer');
        walk(child);
      } else if(child.nodeType !== Node.TEXT_NODE){
        child.remove();
      }
    });
  };
  walk(tpl.content);
  return tpl.innerHTML;
}

// ── Columns ───────────────────────────────────────────
const COLS_KEY = 'dailyTodoCols';
const DEFAULT_COLS = [
  { id: 'todo',      name: 'Todo',        color: 'purple' },
  { id: 'process',   name: 'In Progress', color: 'amber'  },
  { id: 'completed', name: 'Completed',   color: 'green'  },
];
let COLS = [];

function loadCols(){
  try {
    const key = userKey(COLS_KEY);
    const saved = key ? JSON.parse(localStorage.getItem(key)) : null;
    COLS = (Array.isArray(saved) && saved.length) ? saved : DEFAULT_COLS.map(c=>({...c}));
  } catch(_){ COLS = DEFAULT_COLS.map(c=>({...c})); }
}

function saveCols(){ const key = userKey(COLS_KEY); if(key) localStorage.setItem(key, JSON.stringify(COLS)); }

function getColById(id){ return COLS.find(c=>c.id===id); }
function getColColor(id){ return (getColById(id)||{}).color||'gray'; }
function getNextColId(id){
  const idx = COLS.findIndex(c=>c.id===id);
  if(idx===-1) return COLS[0]?.id;
  return COLS[(idx+1)%COLS.length].id;
}
function isLastCol(id){ return COLS.length>0 && COLS[COLS.length-1].id===id; }

// ── Rich Text Editor helpers ──────────────────────────
function rteExec(cmd, val){
  document.execCommand(cmd, false, val === undefined ? null : val);
}
function rteGetHTML(id){
  const el = document.getElementById(id);
  if(!el) return '';
  const html = el.innerHTML.trim();
  // treat empty/placeholder as empty
  return html === '<br>' ? '' : html;
}
function rteSetHTML(id, html){
  const el = document.getElementById(id);
  if(el) el.innerHTML = sanitizeRichHTML(html || '');
}
function rteClear(id){
  const el = document.getElementById(id);
  if(el) el.innerHTML = '';
}
let rteSavedRange = null;
function rteSaveSelection(){
  const sel = window.getSelection();
  if(sel && sel.rangeCount > 0){
    rteSavedRange = sel.getRangeAt(0);
  }
}
function rteApplyColor(color){
  const sel = window.getSelection();
  if(rteSavedRange){
    sel.removeAllRanges();
    sel.addRange(rteSavedRange);
  }
  document.execCommand('foreColor', false, color);
}
function rteHandlePaste(e){
  const items = (e.clipboardData && e.clipboardData.items) || [];
  for(const item of items){
    if(item.type && item.type.startsWith('image/')){
      e.preventDefault();
      const file = item.getAsFile();
      if(!file) continue;
      compressImageToDataURL(file, 900, 0.7).then(dataUrl=>{
        document.execCommand('insertImage', false, dataUrl);
      });
      return;
    }
  }
}

// ── Board rendering ───────────────────────────────────
function renderBoard(){
  const board = document.getElementById('board');
  if(!board) return;
  board.style.gridTemplateColumns = `repeat(${COLS.length}, minmax(240px, 1fr))`;
  const colGradients = {
    purple:'linear-gradient(90deg,#6366f1,#8b5cf6)',
    amber: 'linear-gradient(90deg,#f59e0b,#fb923c)',
    green: 'linear-gradient(90deg,#10b981,#34d399)',
    blue:  'linear-gradient(90deg,#3b82f6,#60a5fa)',
    pink:  'linear-gradient(90deg,#ec4899,#f472b6)',
    teal:  'linear-gradient(90deg,#06b6d4,#22d3ee)',
    gray:  'linear-gradient(90deg,#64748b,#94a3b8)',
  };
  const colIconSvg = {
    purple:`<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M9 12l2 2 4-4"/></svg>`,
    amber: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="var(--amber)" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
    green: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="var(--green)" stroke-width="2.5" stroke-linecap="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
    blue:  `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="var(--blue)" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>`,
    pink:  `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="var(--pink)" stroke-width="2.5" stroke-linecap="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78z"/></svg>`,
    teal:  `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="var(--teal)" stroke-width="2.5" stroke-linecap="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>`,
    gray:  `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="var(--gray)" stroke-width="2.5" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 9h6M9 12h6M9 15h4"/></svg>`,
  };
  board.innerHTML = COLS.map(col=>{
    const grad = colGradients[col.color] || colGradients.gray;
    const icon = colIconSvg[col.color] || colIconSvg.gray;
    return `
    <div class="col kanban-col col-color-${esc(col.color)}" id="col-${esc(col.id)}">
      <div class="col-bar" style="background:${grad}"></div>
      <div class="col-header">
        ${icon}
        <span class="col-name col-title">${esc(col.name)}</span>
        <span class="col-count ${col.color}" id="badge-${esc(col.id)}">0</span>
        <button class="col-edit-btn" onclick="event.stopPropagation();openColEdit('${esc(col.id)}')" title="แก้ไข column">
          <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></svg>
        </button>
      </div>
      <div class="col-body" id="list-${esc(col.id)}"></div>
      <button class="add-btn add-task-btn" style="width:94%" onclick="openModal('${esc(col.id)}')">
        <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        เพิ่มงาน
      </button>
    </div>`;
  }).join('');
}

// ── Stats rendering ───────────────────────────────────
function renderStats(g){
  const el = document.getElementById('statsGrid');
  if(!el||!COLS.length) return;
  const icons = {
    purple:`<svg width="18" height="18" fill="none" stroke="var(--accent)" stroke-width="1.8" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke-dasharray="3 3"/></svg>`,
    amber: `<svg width="18" height="18" fill="none" stroke="var(--amber)"  stroke-width="1.8" viewBox="0 0 24 24"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>`,
    green: `<svg width="18" height="18" fill="none" stroke="var(--green)"  stroke-width="1.8" viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
    blue:  `<svg width="18" height="18" fill="none" stroke="var(--blue)"   stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>`,
    pink:  `<svg width="18" height="18" fill="none" stroke="var(--pink)"   stroke-width="1.8" viewBox="0 0 24 24"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`,
    teal:  `<svg width="18" height="18" fill="none" stroke="var(--teal)"   stroke-width="1.8" viewBox="0 0 24 24"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>`,
    gray:  `<svg width="18" height="18" fill="none" stroke="var(--gray)"   stroke-width="1.8" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 9h6M9 12h6M9 15h4"/></svg>`,
  };
  el.style.gridTemplateColumns = `repeat(${COLS.length}, 1fr)`;
  el.innerHTML = COLS.map(col=>{
    const count = (g[col.id]||[]).length;
    return `
    <div class="stat-card ${col.color}">
      <div class="stat-icon-wrap stat-icon ${col.color}">${icons[col.color]||icons.gray}</div>
      <div class="stat-body">
        <div class="stat-num ${col.color}">${count}</div>
        <div class="stat-label">${esc(col.name)}</div>
      </div>
    </div>`;
  }).join('');
}

function renderCard(t){
  const col = getColById(t.status);
  const c = col ? col.color : 'gray';
  const last = isLastCol(t.status);
  const isLocked = t.hidden && !taskUnlockedIds.has(t.id);
  if(isLocked){
    return `
    <div class="card ${c} is-locked"${last?' data-done="1"':''}>
      <div class="ql-card-locked-body">
        <div class="ql-lock-circle">
          <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2.5"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
        </div>
        <div class="ql-card-locked-text">งานถูกซ่อนไว้</div>
        <div class="ql-card-locked-sub">ต้องใส่ PIN เพื่อดู</div>
        <button class="ql-unlock-btn" onclick="event.stopPropagation();taskRequestUnlock('${t.id}')">ปลดล็อก</button>
      </div>
    </div>`;
  }
  // backward-compat: HTML notes render as-is; old [text](url) markdown still parsed
  const noteIsHtml = t.note && /<[a-z][\s\S]*>/i.test(t.note);
  const links = (!noteIsHtml && t.note) ? extractLinks(t.note) : [];
  const plainNote = (!noteIsHtml && t.note) ? noteWithoutLinks(t.note) : '';

  const linksHtml = links.length
    ? `<div class="card-links" onclick="event.stopPropagation()">
        ${links.map((url,i)=>`<a class="card-link-btn" href="${esc(url)}" target="_blank" rel="noopener" title="${esc(url)}">${linkSvg} Link ${links.length>1?i+1:''}</a>`).join('')}
       </div>`
    : '';

  const noteHtml = noteIsHtml
    ? `<div class="card-note">${sanitizeRichHTML(t.note)}</div>`
    : plainNote
      ? `<div class="card-note">${renderNote(plainNote)}</div>`
      : '';

  const nextId = getNextColId(t.status);
  const nextCol = getColById(nextId);
  const moveTitle = nextCol ? nextCol.name : '→';
  const colIdx = COLS.findIndex(x=>x.id===t.status);
  const isLast = colIdx===COLS.length-1;
  const moveSvg = isLast
    ? `<svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.45"/></svg>`
    : `<svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg>`;

  const priorityLabels = {critical:'Critical',high:'High',medium:'Medium',low:'Low',lowest:'Lowest'};
  const priorityBadge = t.priority && priorityLabels[t.priority]
    ? `<span class="priority-badge ${t.priority}">${priorityLabels[t.priority]}</span>`
    : '';

  const clockSvg = `<svg width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;
  const timeRangeHtml = (t.timeStart || t.timeEnd)
    ? `<div class="card-time-range">${clockSvg} ${esc(t.timeStart||'?')} - ${esc(t.timeEnd||'?')}</div>`
    : '';

  return `<div class="card ${c}"${last?' data-done="1"':''} onclick="openModal('${esc(t.status)}','${t.id}')">
    <div class="card-title">${priorityBadge} ${esc(t.title)}</div>
    ${timeRangeHtml}
    ${noteHtml}
    ${linksHtml}
    <div class="card-footer">
      <span class="card-time">${fmtTime(t.updatedAt)}</span>
      <div class="card-actions" onclick="event.stopPropagation()">
        <button class="icon-btn hide" title="${t.hidden?'เลิกซ่อน':'ซ่อนงานนี้'}" onclick="taskToggleQuickHide('${t.id}')">
          ${t.hidden
            ? `<svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2.5"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>`
            : `<svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2.5"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`}
        </button>
        ${!isLast ? `<button class="icon-btn sched" title="ย้ายไปวันอื่น" onclick="openReschedule('${t.id}')"><svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2.5"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><polyline points="9 16 12 13 15 16"/></svg></button>` : ''}
        <button class="icon-btn move" title="${esc(moveTitle)}" onclick="moveTask('${t.id}','${nextId}')">${moveSvg}</button>
        <button class="icon-btn del" title="ลบ" onclick="deleteTask('${t.id}')">
          <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
        </button>
      </div>
    </div>
  </div>`;
}

const emptyIcon = `<svg width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 9h6M9 12h6M9 15h4"/></svg>`;

// ── Priority filter ──────────────────────────────────
let activePriorityFilter = '';

const PRIORITIES = [
  { id:'critical', label:'Critical', dot:'🔴' },
  { id:'high',     label:'High',     dot:'🟠' },
  { id:'medium',   label:'Medium',   dot:'🟡' },
  { id:'low',      label:'Low',      dot:'🔵' },
  { id:'lowest',   label:'Lowest',   dot:'⚪' },
];

function setPriorityFilter(p){
  activePriorityFilter = (activePriorityFilter === p) ? '' : p; // toggle off if same
  render();
}

function renderPriorityFilterBar(tasks){
  const bar = document.getElementById('priorityFilterBar');
  if(!bar) return;

  // นับจำนวนต่อ priority จากทุก task วันนี้
  const counts = {};
  PRIORITIES.forEach(p=>{ counts[p.id]=0; });
  tasks.forEach(t=>{ if(t.priority && counts[t.priority]!==undefined) counts[t.priority]++; });

  // ถ้าไม่มี task ที่มี priority เลย ซ่อน bar
  const hasAny = PRIORITIES.some(p=>counts[p.id]>0);
  bar.style.display = hasAny ? '' : 'none';
  if(!hasAny){ activePriorityFilter=''; return; }

  const allActive = !activePriorityFilter;
  const dotColors = {critical:'#f43f5e',high:'#f97316',medium:'#f59e0b',low:'#10b981',lowest:'#94a3b8'};
  bar.innerHTML =
    `<button class="filter-chip pf-btn pf-all${allActive?' active pf-active':''}" onclick="setPriorityFilter('')">
       <span class="chip-dot" style="background:rgba(148,163,184,0.45)"></span>ทั้งหมด
     </button>` +
    PRIORITIES.filter(p=>counts[p.id]>0).map(p=>{
      const active = activePriorityFilter===p.id;
      return `<button class="filter-chip pf-btn${active?' active pf-active':''}" data-p="${p.id}" onclick="setPriorityFilter('${p.id}')">
        <span class="chip-dot" style="background:${dotColors[p.id]||'#94a3b8'}"></span>${p.label}
      </button>`;
    }).join('');
}

// ── Mobile Board (Tab Switch) ─────────────────────────
let mbActiveCol = '';
let mbActivePriority = {};  // colId → priority filter

function mbColorVar(color){
  const map={purple:'var(--accent)',amber:'var(--amber)',green:'var(--green)',blue:'var(--blue)',pink:'var(--pink)',teal:'var(--teal)',gray:'var(--gray)'};
  return map[color]||map.gray;
}

function renderMobileBoard(g, tasks){
  const tabBar = document.getElementById('mbTabBar');
  const panesEl = document.getElementById('mbPanes');
  if(!tabBar||!panesEl) return;

  // default active tab to first col
  if(!mbActiveCol || !COLS.find(c=>c.id===mbActiveCol)) mbActiveCol = COLS[0]?.id||'';

  // ── Tab bar ──
  tabBar.innerHTML = COLS.map(col=>{
    const count = (g[col.id]||[]).length;
    const active = col.id===mbActiveCol ? ' active' : '';
    return `<div class="mb-tab c-${col.color}${active}" onclick="mbSwitchTab('${esc(col.id)}')">
      ${esc(col.name)}
      <span class="mb-tab-count">${count}</span>
    </div>`;
  }).join('');

  // ── Panes ──
  const moveSvgNext = `<svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg>`;
  const moveSvgBack = `<svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.45"/></svg>`;
  const priorityDots={critical:'🔴',high:'🟠',medium:'🟡',low:'🔵',lowest:'⚪'};
  const priorityLabels={critical:'Critical',high:'High',medium:'Medium',low:'Low',lowest:'Lowest'};

  panesEl.innerHTML = COLS.map((col, colIdx)=>{
    const all = g[col.id]||[];
    const isLast = colIdx===COLS.length-1;
    const nextCol = COLS[colIdx+1];
    const nextId  = nextCol?.id||COLS[0]?.id;
    const active  = col.id===mbActiveCol ? ' active' : '';
    const pFilter = mbActivePriority[col.id]||'';

    // priority counts for this pane
    const pCounts={};
    PRIORITIES.forEach(p=>{ pCounts[p.id]=0; });
    all.forEach(t=>{ if(t.priority&&pCounts[t.priority]!==undefined) pCounts[t.priority]++; });
    const hasPriority = PRIORITIES.some(p=>pCounts[p.id]>0);

    const pfBar = hasPriority ? `<div class="mb-pf-bar">
      <div class="mb-pf-pill${!pFilter?' active':''}" onclick="mbSetPriority('${esc(col.id)}','')">ทั้งหมด ${all.length}</div>
      ${PRIORITIES.filter(p=>pCounts[p.id]>0).map(p=>`
      <div class="mb-pf-pill${pFilter===p.id?' active':''}" onclick="mbSetPriority('${esc(col.id)}','${p.id}')">
        ${p.dot} ${p.label} ${pCounts[p.id]}
      </div>`).join('')}
    </div>` : '';

    const filtered = pFilter ? all.filter(t=>(t.priority||'')===pFilter) : all;
    const sorted = filtered.slice().sort((a,b)=>{
      if(!a.timeStart&&!b.timeStart) return 0;
      if(!a.timeStart) return 1; if(!b.timeStart) return -1;
      return a.timeStart.localeCompare(b.timeStart);
    });

    const cardsHtml = sorted.length ? sorted.map(t=>{
      const isLocked = t.hidden && !taskUnlockedIds.has(t.id);
      if(isLocked){
        return `<div class="mb-task-card c-${col.color} is-locked">
          <div class="ql-card-locked-body">
            <div class="ql-lock-circle">
              <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2.5"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            </div>
            <div class="ql-card-locked-text">งานถูกซ่อนไว้</div>
            <button class="ql-unlock-btn" onclick="event.stopPropagation();taskRequestUnlock('${t.id}')">ปลดล็อก</button>
          </div>
        </div>`;
      }
      const pbadge = t.priority&&priorityLabels[t.priority]
        ? `<span class="priority-badge ${t.priority}">${priorityLabels[t.priority]}</span>` : '';
      const timeRange = (t.timeStart||t.timeEnd)
        ? `<span class="mb-task-time">🕙 ${esc(t.timeStart||'?')} - ${esc(t.timeEnd||'?')}</span>` : '';
      const moveSvg  = isLast ? moveSvgBack : moveSvgNext;
      const moveTitle= isLast ? 'ย้อนกลับ' : (nextCol?nextCol.name:'→');
      const done = isLast ? ' done' : '';
      const hideSvg = t.hidden
        ? `<svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2.5"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>`
        : `<svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2.5"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`;
      return `<div class="mb-task-card c-${col.color}" onclick="openModal('${esc(col.id)}','${t.id}')">
        <div class="mb-task-top">
          <span class="mb-task-title${done}">${esc(t.title)}</span>
          <div class="mb-move-btn" title="${t.hidden?'เลิกซ่อน':'ซ่อนงานนี้'}" onclick="event.stopPropagation();taskToggleQuickHide('${t.id}')">${hideSvg}</div>
          <div class="mb-move-btn" title="${esc(moveTitle)}" onclick="event.stopPropagation();moveTask('${t.id}','${nextId}')">${moveSvg}</div>
        </div>
        <div class="mb-task-meta">
          ${pbadge}${timeRange}
          <span class="mb-task-time">${fmtTime(t.updatedAt)}</span>
        </div>
      </div>`;
    }).join('')
    : `<div style="padding:.6rem .1rem;font-size:.8rem;color:var(--text-3)">${pFilter?'ไม่มีงานใน filter นี้':'ยังไม่มีงาน'}</div>`;

    const moreBtn = `<div class="mb-pane-more" onclick="openColEdit('${esc(col.id)}')" title="แก้ไข / ลบ column">
      <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></svg>
    </div>`;

    return `<div class="mb-pane col-color-${esc(col.color)}${active}" id="mbPane-${esc(col.id)}">
      ${pfBar}
      <div class="mb-pane-header">
        <span class="mb-pane-dot" style="background:${mbColorVar(col.color)}"></span>
        <span class="mb-pane-label">${esc(col.name)}</span>
        ${moreBtn}
      </div>
      <div class="mb-task-list">${cardsHtml}</div>
      <button class="mb-add-btn" onclick="openModal('${esc(col.id)}')">
        <svg width="17" height="17" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        เพิ่มงาน
      </button>
      <div class="mb-pane-spacer"></div>
    </div>`;
  }).join('');
}

function mbSwitchTab(colId){
  mbActiveCol = colId;
  document.querySelectorAll('.mb-tab').forEach(el=>{
    const id = el.getAttribute('onclick').match(/'([^']+)'/)?.[1];
    if(id) el.classList.toggle('active', id===colId);
  });
  document.querySelectorAll('.mb-pane').forEach(el=>{
    el.classList.toggle('active', el.id==='mbPane-'+colId);
  });
}

function mbSetPriority(colId, priority){
  mbActivePriority[colId] = priority;
  render();
}

function render(){
  const tasks = getTasks(currentDate);
  const g = {};
  COLS.forEach(col=>{ g[col.id]=[]; });
  tasks.forEach(t=>{
    if(t.status in g) g[t.status].push(t);
    else if(COLS[0]) g[COLS[0].id].push(t);
  });

  renderPriorityFilterBar(tasks);

  COLS.forEach(col=>{
    const listEl = document.getElementById('list-'+col.id);
    if(!listEl) return;
    const badgeEl = document.getElementById('badge-'+col.id);
    const all = g[col.id];
    const filtered = activePriorityFilter
      ? all.filter(t=>(t.priority||'') === activePriorityFilter)
      : all;
    const sorted = filtered.slice().sort((a,b)=>{
      if(!a.timeStart && !b.timeStart) return 0;
      if(!a.timeStart) return 1;
      if(!b.timeStart) return -1;
      return a.timeStart.localeCompare(b.timeStart);
    });
    listEl.innerHTML = sorted.length
      ? sorted.map(renderCard).join('')
      : `<div class="empty">${emptyIcon}<div>${activePriorityFilter ? 'ไม่มีงานใน filter นี้' : 'ยังไม่มีงาน'}</div></div>`;
    // badge: แสดง filtered/total เมื่อ filter active
    if(badgeEl) badgeEl.textContent = activePriorityFilter && filtered.length !== all.length
      ? `${filtered.length}/${all.length}`
      : all.length;
  });

  renderStats(g);
  renderMobileBoard(g, tasks);

  // Progress: นับ "completed" col เป็น done, ไม่นับ col ที่ชื่อมี "back" ใน denominator
  const backlogCols = COLS.filter(c=>/back/i.test(c.name)).map(c=>c.id);
  const completedCol = COLS.find(c=>/complet/i.test(c.name) || c.id==='completed');
  const doneColId = completedCol ? completedCol.id : COLS.find(c=>!backlogCols.includes(c.id) && COLS.indexOf(c)===COLS.filter(c2=>!backlogCols.includes(c2.id)).length-1)?.id;
  const done = doneColId ? (g[doneColId]||[]).length : 0;
  const tot = tasks.filter(t=>!backlogCols.includes(t.status)).length;
  const pct = tot>0 ? Math.round((done/tot)*100) : 0;
  document.getElementById('progressFill').style.width = pct+'%';
  document.getElementById('progressLabel').textContent = pct+'%';

  const d = new Date(currentDate+'T00:00:00');
  const isToday = currentDate===today;
  const label = d.toLocaleDateString('th-TH',{weekday:'long',year:'numeric',month:'long',day:'numeric'});
  const dateHtml = label + (isToday?'<span class="date-today">วันนี้</span>':'');
  document.getElementById('dateDisplay').innerHTML = dateHtml;
  const sbDate = document.getElementById('sbDateDisplay');
  if(sbDate) sbDate.textContent = label;
  const topbarDateEl = document.getElementById('topbarDate');
  if(topbarDateEl) topbarDateEl.textContent = d.toLocaleDateString('th-TH',{weekday:'short',day:'numeric',month:'long',year:'numeric'});

  // bnb-badge: task count for current date
  const taskBadge = document.getElementById('bnb-badge-task');
  if(taskBadge){
    const cnt = tasks ? tasks.length : 0;
    taskBadge.textContent = cnt > 99 ? '99+' : cnt;
    taskBadge.style.display = cnt > 0 ? 'flex' : 'none';
  }
  renderDateStrip();
}

// Date strip — 7-day week view around currentDate (mobile)
function renderDateStrip(){
  const track = document.getElementById('dsScrollTrack');
  if(!track) return;
  const cur = new Date(currentDate+'T00:00:00');
  const MONTHS_TH = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
  const today = localDateStr(new Date());
  // เรนเดอร์ช่วงกว้าง (±10 วัน) แล้วปล่อยให้ track เลื่อนซ้าย/ขวาเอง —
  // ‹ › (ปุ่มคงที่นอก track) ใช้ shiftDay ไปทีละวัน ส่วนการเลื่อนดูวันอื่นๆ ทำผ่านการปัด
  const RANGE = 10;
  const chips = [];
  for(let i=-RANGE; i<=RANGE; i++){
    const dt = new Date(cur);
    dt.setDate(cur.getDate()+i);
    const ds = localDateStr(dt);
    const isCur = ds===currentDate;
    const isToday = ds===today;
    const todayDot = isToday ? '<span class="ds-today-dot"></span>' : '';
    const label = `${dt.getDate()} ${MONTHS_TH[dt.getMonth()]}${todayDot}`;
    chips.push(`<button class="ds-chip${isCur?' ds-cur':''}${isToday?' ds-today':''}" data-ds="${ds}" onclick="setDateFromStrip('${ds}')" title="${isToday?'วันนี้':''}">${label}</button>`);
  }
  track.innerHTML = chips.join('');
  const curChip = track.querySelector('.ds-chip.ds-cur');
  if(curChip) curChip.scrollIntoView({ block: 'nearest', inline: 'center' });
}

function setDateFromStrip(ds){
  currentDate = ds;
  const dp = document.getElementById('datePicker');
  if(dp){ dp.value = ds; }
  render(); renderDL(); renderFinance();
}

document.addEventListener('keydown', e=>{
  if(e.key==='Escape'){ closeModal(); qlClose(); colClose(); rschedClose(); closeFinanceModal(); closeFinPMModal(); qlReadClose(); closeChangelogModal(); }
});
document.addEventListener('keydown', e=>{
  if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){
    if(document.getElementById('overlay').style.display!=='none') saveTask();
    if(document.getElementById('qlOverlay').style.display!=='none') qlSave();
    if(document.getElementById('colOverlay').style.display!=='none') colSave();
    if(document.getElementById('finOverlay').style.display!=='none') saveFinance();
  }
});

// ── Daily Log ────────────────────────────────────────
const DL_KEY = 'dailyTodoLog';
let DL = {};

function loadDL(){
  // Merge localStorage (fallback, เฉพาะของ account นี้) กับ file (_logs), file takes precedence
  const fromLS = {};
  try { const key = userKey(DL_KEY); if(key) Object.assign(fromLS, JSON.parse(localStorage.getItem(key)||'{}')); } catch(_){}
  const fromFile = (DB._logs && typeof DB._logs==='object') ? DB._logs : {};
  DL = Object.assign({}, fromLS, fromFile);
}
let _saveDLTimer = null;
function saveDL(){
  if(!DB._logs) DB._logs = {};
  Object.assign(DB._logs, DL);
  const key = userKey(DL_KEY); if(key) localStorage.setItem(key, JSON.stringify(DL));
  clearTimeout(_saveDLTimer);
  _saveDLTimer = setTimeout(() => writeFile(), 1500);
}

const MOOD_ICONS = {
  '😄': { color:'#f59e0b', svg:'<circle cx="12" cy="12" r="9"/><circle cx="9" cy="10" r="1.2" fill="currentColor" stroke="none"/><circle cx="15" cy="10" r="1.2" fill="currentColor" stroke="none"/><path d="M8 14s1.5 3 4 3 4-3 4-3"/>' },
  '🙂': { color:'#84cc16', svg:'<circle cx="12" cy="12" r="9"/><circle cx="9" cy="10" r="1.2" fill="currentColor" stroke="none"/><circle cx="15" cy="10" r="1.2" fill="currentColor" stroke="none"/><path d="M9 14.5s1 2 3 2 3-2 3-2"/>' },
  '😐': { color:'#94a3b8', svg:'<circle cx="12" cy="12" r="9"/><circle cx="9" cy="10" r="1.2" fill="currentColor" stroke="none"/><circle cx="15" cy="10" r="1.2" fill="currentColor" stroke="none"/><line x1="9" y1="15" x2="15" y2="15"/>' },
  '😔': { color:'#60a5fa', svg:'<circle cx="12" cy="12" r="9"/><circle cx="9" cy="10" r="1.2" fill="currentColor" stroke="none"/><circle cx="15" cy="10" r="1.2" fill="currentColor" stroke="none"/><path d="M9 16s1-2 3-2 3 2 3 2"/>' },
  '😴': { color:'#a78bfa', svg:'<circle cx="12" cy="12" r="9"/><path d="M8 10.5c.5-.5 1.5-.5 2 0"/><path d="M14 10.5c.5-.5 1.5-.5 2 0"/><path d="M9.5 15s1-1 2.5-1 2.5 1 2.5 1"/><text x="16" y="8" font-size="4" fill="currentColor" stroke="none">z</text>' },
  '😡': { color:'#f87171', svg:'<circle cx="12" cy="12" r="9"/><circle cx="9" cy="11" r="1.2" fill="currentColor" stroke="none"/><circle cx="15" cy="11" r="1.2" fill="currentColor" stroke="none"/><path d="M7.5 8.5l3 1.5"/><path d="M16.5 8.5l-3 1.5"/><path d="M9 16s1-2 3-2 3 2 3 2"/>' },
};
function moodIconHtml(emoji){
  const m = MOOD_ICONS[emoji];
  if(!m) return '';
  return `<svg width="18" height="18" fill="none" stroke="${m.color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24">${m.svg}</svg>`;
}

function renderDL(){
  const log = DL[currentDate] || {};
  document.getElementById('dlBlocker').value   = log.blocker   || '';
  document.getElementById('dlHighlight').value = log.highlight || '';
  document.getElementById('dlNote').value      = log.note      || '';
  ['dlBlocker','dlHighlight','dlNote'].forEach(id => dlResize(document.getElementById(id)));
  const badge = document.getElementById('dlMoodBadge');
  if(badge) badge.innerHTML = moodIconHtml(log.mood);
  document.querySelectorAll('#dlMoodRow .dl-mood-pill').forEach(btn=>{
    btn.classList.toggle('active', btn.dataset.mood === log.mood);
  });
  const label = document.getElementById('dlDateLabel');
  if(label){
    const d = new Date(currentDate + 'T00:00:00');
    label.textContent = d.toLocaleDateString('th-TH',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
    const isToday = currentDate === today;
    label.style.color = isToday ? 'var(--accent)' : 'var(--text)';
  }
}

function dlSave(field, val){
  if(!DL[currentDate]) DL[currentDate] = {};
  DL[currentDate][field] = val;
  saveDL();
}

function dlSetMood(emoji){
  if(!DL[currentDate]) DL[currentDate] = {};
  DL[currentDate].mood = DL[currentDate].mood === emoji ? '' : emoji;
  saveDL();
  renderDL();
}

function dlToggle(){
  const body = document.getElementById('dlBody');
  const chev = document.getElementById('dlChevron');
  if(body) body.classList.toggle('collapsed');
  if(chev) chev.classList.toggle('closed');
}

function dlResize(el){
  el.style.height = 'auto';
  el.style.height = (el.scrollHeight) + 'px';
}

loadDL();
renderDL();

// ── Quick Links ──────────────────────────────────────
const QL_KEY = 'dailyTodoQL';
let QL = [];
let qlActiveFilter = 'all';
let selectedQlTag  = '';
let selectedQlType = 'fleeting';
let selectedQlRelated = [];
let qlSearchQuery = '';
let qlPage = 1;
const QL_PAGE_SIZE = 20;
let qlSelectedColor = 'plain';
let qlEditPinned = false;
let qlEditHidden = false;

function qlSetSearch(value){
  qlSearchQuery = value.trim().toLowerCase();
  qlPage = 1;
  renderQL();
}

function qlStripHTML(html){
  if(!html) return '';
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  return tmp.textContent || '';
}

function qlMatchesSearch(item){
  if(!qlSearchQuery) return true;
  const tagLabel = item.tag ? qlTagLabel(item.tag) : '';
  const haystack = [item.name, qlStripHTML(item.detail), tagLabel].join(' ').toLowerCase();
  return haystack.includes(qlSearchQuery);
}

function loadQL(){
  // Merge localStorage (fallback เฉพาะของ account นี้) with file (_ql), file takes precedence
  let fromLS = [];
  try { const key = userKey(QL_KEY); if(key) fromLS = JSON.parse(localStorage.getItem(key)||'[]'); } catch(_){}
  const fromFile = Array.isArray(DB._ql) ? DB._ql : null;
  QL = fromFile !== null ? fromFile : fromLS;
  // บันทึกเก่าก่อนมีฟีเจอร์ id/noteType อาจไม่มี field พวกนี้ -> backfill ให้ครบ
  let backfilled = false;
  QL.forEach(item=>{
    if(!item.id){ item.id = Date.now().toString(36)+Math.random().toString(36).slice(2,8); backfilled = true; }
    if(!item.noteType){ item.noteType = 'fleeting'; backfilled = true; }
    if(!Array.isArray(item.relatedIds)){ item.relatedIds = []; backfilled = true; }
    if(typeof item.hidden !== 'boolean'){ item.hidden = false; backfilled = true; }
    if(!item.color){ item.color = 'plain'; backfilled = true; }
  });
  if(backfilled) saveQL();
}
function saveQL(){
  DB._ql = QL;
  const key = userKey(QL_KEY); if(key) localStorage.setItem(key, JSON.stringify(QL));
  writeFile();
}

// ── QL Tags (เพิ่ม/ลบได้) ──────────────────────────────
const QL_TAGS_KEY = 'dailyTodoQLTags';
const QL_TAG_PALETTE = ['#2dd4c4','#7c6ff7','#34d399','#8896a5','#f59e0b','#ef4444','#4a9eff','#ec4899'];
let QL_TAGS = [];

function loadQLTags(){
  let fromLS = null;
  try { const key = userKey(QL_TAGS_KEY); if(key) fromLS = JSON.parse(localStorage.getItem(key)||'null'); } catch(_){}
  const fromFile = Array.isArray(DB._qlTags) ? DB._qlTags : null;
  QL_TAGS = fromFile || fromLS || [
    {id:'system',    label:'System'},
    {id:'document',  label:'Document'},
    {id:'knowledge', label:'Knowledge Sharing'},
    {id:'other',     label:'Other'}
  ];
}
function saveQLTags(){
  DB._qlTags = QL_TAGS;
  const key = userKey(QL_TAGS_KEY); if(key) localStorage.setItem(key, JSON.stringify(QL_TAGS));
  writeFile();
}
function qlTagColor(id){
  const idx = QL_TAGS.findIndex(t=>t.id===id);
  return QL_TAG_PALETTE[idx >= 0 ? idx % QL_TAG_PALETTE.length : 0];
}
function qlTagLabel(id){
  const tag = QL_TAGS.find(t=>t.id===id);
  return tag ? tag.label : '';
}

function renderQlTagRow(){
  const row = document.getElementById('qlTagRow');
  row.innerHTML = QL_TAGS.map(tag=>{
    const color = qlTagColor(tag.id);
    const active = selectedQlTag === tag.id ? 'active-tag' : '';
    return `<span class="ql-tag-pill ${active}" data-tag="${esc(tag.id)}" style="--tag-color:${color}" onclick="selectQlTag('${tag.id}')">${esc(tag.label)}<button type="button" class="ql-tag-remove" onclick="event.stopPropagation();qlTagRemove('${tag.id}')" title="ลบ tag">✕</button></span>`;
  }).join('');
}

function qlTagAdd(){
  const input = document.getElementById('qlNewTagInput');
  const label = input.value.trim();
  if(!label) return;
  const id = 'tag_' + Date.now().toString(36);
  QL_TAGS.push({id, label});
  saveQLTags();
  renderQlTagRow();
  renderQlFilterBar();
  input.value = '';
}

function qlTagRemove(id){
  QL_TAGS = QL_TAGS.filter(t=>t.id!==id);
  saveQLTags();
  if(selectedQlTag === id) selectedQlTag = '';
  renderQlTagRow();
  if(qlActiveFilter === id) qlSetFilter('all');
  else renderQlFilterBar();
}

function renderQlFilterBar(){
  const bar = document.getElementById('qlFilterBar');
  const pinned = QL.filter(item=>item.pinned && !item.hidden).length;
  const hidden = QL.filter(item=>item.hidden).length;
  const allActive   = qlActiveFilter==='all'    ? ' active' : '';
  const pinActive   = qlActiveFilter==='pinned' ? ' active' : '';
  const hideActive  = qlActiveFilter==='hidden' ? ' active' : '';
  const allBtn = `<button class="ql-filter-btn${allActive}" data-filter="all" onclick="qlSetFilter('all')"><span class="ql-filter-dot" style="background:var(--text-3)"></span>ทั้งหมด<span class="ql-filter-count">${QL.length}</span></button>`;
  const pinBtn = pinned ? `<button class="ql-filter-btn${pinActive}" data-filter="pinned" style="--tag-color:#e8c64c;--tag-bg:#e8c64c1F" onclick="qlSetFilter('pinned')"><span class="ql-filter-dot"></span>ปักหมุด<span class="ql-filter-count">${pinned}</span></button>` : '';
  const hideBtn = hidden ? `<button class="ql-filter-btn${hideActive}" data-filter="hidden" style="--tag-color:#8890a8;--tag-bg:#8890a81F" onclick="qlSetFilter('hidden')"><span class="ql-filter-dot"></span>ซ่อนอยู่<span class="ql-filter-count">${hidden}</span></button>` : '';
  const tagBtns = QL_TAGS.map(tag=>{
    const color = qlTagColor(tag.id);
    const count = QL.filter(item=>(item.tag||'')===tag.id).length;
    const active = qlActiveFilter===tag.id ? ' active' : '';
    return `<button class="ql-filter-btn${active}" data-filter="${esc(tag.id)}" style="--tag-color:${color};--tag-bg:${color}1F" onclick="qlSetFilter('${tag.id}')"><span class="ql-filter-dot"></span>${esc(tag.label)}<span class="ql-filter-count">${count}</span></button>`;
  }).join('');
  bar.innerHTML = allBtn + pinBtn + hideBtn + tagBtns;
}

function selectQlTag(tag){
  selectedQlTag = (selectedQlTag === tag) ? '' : tag; // toggle off if same
  renderQlTagRow();
}

function selectQlType(type){
  selectedQlType = type;
  document.querySelectorAll('#qlTypeRow .ql-type-card').forEach(card=>{
    card.classList.toggle('active', card.dataset.type === type);
  });
}

function renderQlRelatedRow(){
  renderQlRelatedChipsEdit();
  const searchEl = document.getElementById('qlRelatedSearchInput');
  if(searchEl) searchEl.value = '';
  const box = document.getElementById('qlRelatedSuggestions');
  if(box) box.style.display = 'none';
}

function renderQlRelatedChipsEdit(){
  const row = document.getElementById('qlRelatedChipsEdit');
  if(!row) return;
  if(!selectedQlRelated.length){ row.innerHTML = ''; return; }
  row.innerHTML = selectedQlRelated.map(id=>{
    const idx = qlIndexById(id);
    if(idx<0) return '';
    return `<span class="ql-related-chip removable">🔗 ${esc(QL[idx].name)}<button type="button" onclick="qlRemoveRelatedPick('${esc(id)}')" title="เอาออก">✕</button></span>`;
  }).filter(Boolean).join('');
}

function qlRelatedSearchInputHandler(value){
  const box = document.getElementById('qlRelatedSuggestions');
  if(!box) return;
  const q = value.trim().toLowerCase();
  const others = QL.filter(item=>item.id !== qlEditId && !selectedQlRelated.includes(item.id));
  const matches = (q ? others.filter(item=>item.name.toLowerCase().includes(q)) : others).slice(0, 8);
  if(!matches.length){
    const emptyMsg = q ? 'ไม่พบโน้ตที่ตรงกับคำค้นหา' : (others.length ? 'พิมพ์เพื่อค้นหาโน้ต…' : 'ไม่มีโน้ตอื่นให้เลือก');
    box.innerHTML = `<div class="ql-related-suggestion-empty">${esc(emptyMsg)}</div>`;
  } else {
    box.innerHTML = matches.map(item=>`<div class="ql-related-suggestion-item" onmousedown="event.preventDefault();qlPickRelated('${esc(item.id)}')">${esc(item.name)}</div>`).join('');
  }
  box.style.display = 'block';
}

function qlPickRelated(id){
  if(!selectedQlRelated.includes(id)) selectedQlRelated.push(id);
  const searchEl = document.getElementById('qlRelatedSearchInput');
  if(searchEl){ searchEl.value = ''; searchEl.focus(); }
  qlRelatedSearchInputHandler('');
  renderQlRelatedChipsEdit();
}

function qlRemoveRelatedPick(id){
  selectedQlRelated = selectedQlRelated.filter(x=>x!==id);
  renderQlRelatedChipsEdit();
}

function qlSetFilter(filter){
  qlActiveFilter = filter;
  qlPage = 1;
  renderQlFilterBar();
  renderQL();
}

function qlLoadMore(){
  qlPage++;
  renderQL();
}

const qlLinkSvg = `<svg width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`;

const qlEditSvg = `<svg width="9" height="9" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
const qlDelSvg  = `<svg width="9" height="9" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>`;
const qlPinSvg  = `<svg width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"/></svg>`;

function qlIndexById(id){ return QL.findIndex(x=>x.id===id); }

function qlRelatedChipsHtml(item, max=Infinity){
  const ids = (item.relatedIds || []).filter(id=>qlIndexById(id)>=0);
  if(!ids.length) return '';
  const shown = ids.slice(0, max);
  const chips = shown.map(id=>{
    const idx = qlIndexById(id);
    return `<span class="ql-related-chip" onclick="qlOpenRead(${idx})" title="${esc(QL[idx].name)}">🔗 ${esc(QL[idx].name)}</span>`;
  }).join('');
  const moreCount = ids.length - shown.length;
  const moreHtml = moreCount > 0 ? `<span class="ql-related-more">+${moreCount}</span>` : '';
  return `<div class="ql-related-row">${chips}${moreHtml}</div>`;
}

function qlFmtDate(ts){
  if(!ts) return '';
  const d = new Date(ts);
  const months = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
  const hh = String(d.getHours()).padStart(2,'0');
  const mm = String(d.getMinutes()).padStart(2,'0');
  return `${d.getDate()} ${months[d.getMonth()]} · ${hh}:${mm}`;
}

function qlCardHtml(item, i){
  const color = item.color || 'plain';
  const isLocked = item.hidden && !qlUnlockedIds.has(item.id);
  if(isLocked){
    return `
    <div class="ql-card nc-plain is-locked">
      <div class="ql-card-locked-body">
        <div class="ql-lock-circle">
          <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2.5"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
        </div>
        <div class="ql-card-locked-text">${esc(item.name)}</div>
        <div class="ql-card-locked-sub">ต้องใส่ PIN เพื่อดู</div>
        <button class="ql-unlock-btn" onclick="qlRequestUnlock(${i})">ปลดล็อก</button>
      </div>
      <div class="ql-card-footer">
        <span class="ql-card-date">${qlFmtDate(item.createdAt)}</span>
      </div>
    </div>`;
  }
  const tagLabel  = item.tag ? qlTagLabel(item.tag) : '';
  const tagColor  = item.tag ? qlTagColor(item.tag) : '';
  // ถ้าไม่ได้เลือกสีการ์ดเอง (plain) แต่มี tag ติดอยู่ ให้ทำพื้นหลังการ์ดตามสี tag แทน
  // เพื่อให้เห็นความแตกต่างของแต่ละ tag ได้ทันทีโดยไม่ต้องเลือกสีเอง — glow blob มุมขวาบน
  // ให้ความรู้สึกพรีเมียมใกล้เคียงสไตล์ Aurora ของแอป แทนที่จะเป็นพื้นสีเรียบ
  const useTagBg  = color === 'plain' && tagColor;
  const cardBgStyle   = useTagBg ? ` style="background:radial-gradient(90px 90px at 100% 0%, ${tagColor}40, transparent 70%), rgba(20,22,35,0.9);border-color:${tagColor}38"` : '';
  const accentBgStyle = useTagBg ? ` style="background:${tagColor}"` : '';
  const tagChip   = tagLabel
    ? `<span class="note-tag-chip" style="background:${tagColor}22;color:${tagColor};border:1px solid ${tagColor}44">${esc(tagLabel)}</span>`
    : '';
  const wasUnlocked = !!item.hidden;
  const hiddenChip = wasUnlocked
    ? `<span class="ql-card-hidden-chip"><svg width="8" height="8" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2.5"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>ซ่อนอยู่</span>`
    : '';
  const isPinned  = !!item.pinned;
  const isPermanent = item.noteType === 'permanent';
  const hasUrl    = item.url && item.url.trim();
  const openBtn   = hasUrl
    ? `<a class="ql-open-btn" href="${esc(item.url)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">${qlLinkSvg} เปิด Link</a>`
    : '';
  const detailContent = item.detail
    ? (/<[a-z][\s\S]*>/i.test(item.detail) ? sanitizeRichHTML(item.detail) : esc(item.detail))
    : '';
  const imgCount  = (item.images && item.images.length) || 0;
  const imagesHtml = imgCount
    ? `<div class="ql-img-row"><img class="ql-img-thumb" src="${esc(item.images[0])}" onclick="event.stopPropagation();qlOpenRead(${i})">${imgCount>1?`<span class="ql-img-count-badge" onclick="event.stopPropagation();qlOpenRead(${i})">+${imgCount-1}</span>`:''}</div>`
    : '';
  const relatedHtml = qlRelatedChipsHtml(item, 2);
  const summarizeBtn = !isPermanent
    ? `<button class="ql-card-btn summarize" onclick="event.stopPropagation();qlSummarizeToPermanent(${i})" title="สรุปเป็นโน้ตถาวร">✍️</button>`
    : '';
  const hideBtn = wasUnlocked
    ? `<button class="ql-card-btn unhide" onclick="event.stopPropagation();qlUnhideNote(${i})" title="เลิกซ่อน">🔓</button>`
    : `<button class="ql-card-btn hide" onclick="event.stopPropagation();qlHideNote(${i})" title="ซ่อน">🔒</button>`;
  const typeBadge = isPermanent
    ? `<span class="note-type-badge">📄 Permanent</span>`
    : `<span class="note-type-badge">💡 Fleeting</span>`;
  return `
  <div class="ql-card note-card nc-${color}${isPinned?' is-pinned':''}" data-tag="${esc(item.tag||'')}"${cardBgStyle} onclick="if(window.innerWidth<=768)qlOpenRead(${i})">
    <div class="note-card-inner">
      <div class="note-accent"${accentBgStyle}></div>
      ${isPinned ? `<div class="note-footer" style="margin-bottom:6px"><span class="pin-icon">📌</span>${tagChip?`<span style="margin-left:4px">${tagChip}</span>`:''}</div>` : ''}
      <div class="note-title">${esc(item.name)}</div>
      ${detailContent ? `<div class="note-body">${detailContent}</div>` : ''}
      ${imagesHtml}
      ${relatedHtml}
      ${openBtn}
      <div class="note-footer" style="margin-top:auto;padding-top:.4rem">
        ${!isPinned && tagChip ? tagChip : ''}
        ${hiddenChip}
        ${typeBadge}
        <span class="note-date" style="margin-left:auto">${qlFmtDate(item.createdAt)}</span>
      </div>
      <div class="ql-card-actions">
        <button class="ql-card-btn pin${isPinned?' pinned':''}" onclick="event.stopPropagation();qlTogglePin(${i})" title="${isPinned?'ถอดหมุด':'ปักหมุด'}">${qlPinSvg}</button>
        ${hideBtn}
        ${summarizeBtn}
        <button class="ql-card-btn view" onclick="event.stopPropagation();qlOpenRead(${i})" title="ดูรายละเอียด"><svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></button>
        <button class="ql-card-btn edit" onclick="event.stopPropagation();qlOpenEdit(${i})" title="แก้ไข">${qlEditSvg}</button>
        <button class="ql-card-btn del"  onclick="event.stopPropagation();qlDelete(${i})"   title="ลบ">${qlDelSvg}</button>
      </div>
    </div>
  </div>`;
}

function qlSectionLabel(label, icon){
  return `<div class="ql-section-label"><span>${icon}</span><span>${esc(label)}</span><span class="sl-line"></span></div>`;
}

function renderQL(){
  const body = document.getElementById('qlBody');

  let allItems = QL.map((item,i)=>({item,i}));

  // filter by active filter
  if(qlActiveFilter === 'pinned'){
    allItems = allItems.filter(({item})=>item.pinned && !item.hidden);
  } else if(qlActiveFilter === 'hidden'){
    allItems = allItems.filter(({item})=>item.hidden);
  } else if(qlActiveFilter !== 'all'){
    allItems = allItems.filter(({item})=>(item.tag||'') === qlActiveFilter);
  }

  // search filter
  const filtered = allItems.filter(({item})=>{
    const isLocked = item.hidden && !qlUnlockedIds.has(item.id);
    return isLocked ? !qlSearchQuery : qlMatchesSearch(item);
  });

  if(!filtered.length){
    if(qlSearchQuery) body.innerHTML = `<div class="ql-empty">ไม่พบโน้ตที่ตรงกับ "${esc(qlSearchQuery)}"</div>`;
    else body.innerHTML = QL.length
      ? `<div class="ql-empty">ไม่มีโน้ตในกลุ่มนี้</div>`
      : `<div class="ql-empty">ยังไม่มีโน้ต — กด เพิ่มโน้ต เพื่อเริ่มต้น</div>`;
    return;
  }

  const pinnedGroup = filtered.filter(({item})=> item.pinned && !item.hidden);
  const hiddenGroup = filtered.filter(({item})=> item.hidden);
  const normalGroup = filtered.filter(({item})=> !item.pinned && !item.hidden);

  let html = '';

  if(pinnedGroup.length){
    html += qlSectionLabel('ปักหมุด','📌');
    html += `<div class="ql-card-grid">${pinnedGroup.map(({item,i})=>qlCardHtml(item,i)).join('')}</div>`;
  }
  if(normalGroup.length){
    if(pinnedGroup.length) html += qlSectionLabel('โน้ตทั้งหมด','📝');
    const newCard = `<div class="ql-new-card" onclick="qlOpenAdd()"><svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg><span>เพิ่มโน้ตใหม่</span></div>`;
    const pageSlice = normalGroup.slice(0, qlPage * QL_PAGE_SIZE);
    const hasMore = normalGroup.length > pageSlice.length;
    html += `<div class="ql-card-grid">${newCard}${pageSlice.map(({item,i})=>qlCardHtml(item,i)).join('')}</div>`;
    if(hasMore){
      const remaining = normalGroup.length - pageSlice.length;
      html += `<div class="ql-load-more-wrap"><button class="btn btn-ghost ql-load-more-btn" onclick="qlLoadMore()">ดูเพิ่มเติม (${remaining} รายการ)</button></div>`;
    }
  } else if(!pinnedGroup.length && !hiddenGroup.length){
    const newCard = `<div class="ql-new-card" onclick="qlOpenAdd()"><svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg><span>เพิ่มโน้ตใหม่</span></div>`;
    html += `<div class="ql-card-grid">${newCard}</div>`;
  }
  if(hiddenGroup.length){
    html += qlSectionLabel('ซ่อนอยู่','🔒');
    html += `<div class="ql-card-grid">${hiddenGroup.map(({item,i})=>qlCardHtml(item,i)).join('')}</div>`;
  }

  body.innerHTML = html;
}

function qlOpenRead(i){
  const item = QL[i];
  if(!item) return;
  document.getElementById('qlReadTitle').textContent = item.name;
  // meta: type badge + tag badge + open link
  const meta = document.getElementById('qlReadMeta');
  const isPermanent = item.noteType === 'permanent';
  const typeHtml = `<span class="ql-notetype-badge${isPermanent?' permanent':''}">${isPermanent?'📌 Permanent':'📝 Fleeting'}</span>`;
  const tagLabel = item.tag ? qlTagLabel(item.tag) : '';
  const tagHtml = tagLabel
    ? `<span class="ql-tag-badge" style="--tag-color:${qlTagColor(item.tag)};--tag-bg:${qlTagColor(item.tag)}1F">● ${esc(tagLabel)}</span>`
    : '';
  const linkHtml = (item.url && item.url.trim())
    ? `<a class="ql-open-btn" href="${esc(item.url)}" target="_blank" rel="noopener">${qlLinkSvg} เปิด Link</a>`
    : '';
  meta.innerHTML = typeHtml + tagHtml + linkHtml;
  // detail
  const detail = document.getElementById('qlReadDetail');
  detail.innerHTML = item.detail
    ? (/<[a-z][\s\S]*>/i.test(item.detail) ? sanitizeRichHTML(item.detail) : esc(item.detail))
    : '<span style="color:var(--text-3)">ไม่มีรายละเอียด</span>';
  // images
  const imgs = document.getElementById('qlReadImages');
  imgs.innerHTML = (item.images && item.images.length)
    ? item.images.map(src=>`<img src="${esc(src)}" style="max-width:100%;max-height:280px;border-radius:8px;cursor:pointer;object-fit:contain" onclick="window.open('${esc(src)}')">`).join('')
    : '';
  // related notes
  const relatedEl = document.getElementById('qlReadRelated');
  if(relatedEl) relatedEl.innerHTML = qlRelatedChipsHtml(item);
  // wire action buttons
  const editBtn = document.getElementById('qlReadEditBtn');
  if(editBtn) editBtn.onclick = ()=>{ qlReadClose(); qlOpenEdit(i); };
  const delBtn = document.getElementById('qlReadDelBtn');
  if(delBtn) delBtn.onclick = ()=>{ qlReadClose(); qlDelete(i); };
  const pinBtn = document.getElementById('qlReadPinBtn');
  if(pinBtn){
    const isPinned = !!item.pinned;
    pinBtn.innerHTML = isPinned
      ? `<svg width="11" height="11" fill="#f59e0b" stroke="#f59e0b" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`
      : `<svg width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`;
    pinBtn.classList.toggle('pinned', isPinned);
    pinBtn.onclick = ()=>{ qlTogglePin(i); qlReadClose(); };
  }
  qlShowPage('read');
}
function qlReadClose(){
  qlShowPage('list');
}

function qlTogglePin(i){
  QL[i].pinned = !QL[i].pinned;
  saveQL();
  renderQL();
}

function qlToggle(){
  document.getElementById('qlBody').classList.toggle('collapsed');
  document.getElementById('qlChevron').classList.toggle('closed');
}

function qlDelete(i){
  QL.splice(i,1);
  saveQL();
  renderQL();
}

let qlEditIdx = -1;
let qlEditId = null;
let qlPendingImages = [];

function renderQlImagesRow(){
  const row = document.getElementById('qlImagesRow');
  row.innerHTML = qlPendingImages.map((src,i)=>`
    <div class="ql-img-thumb-wrap">
      <img class="ql-img-thumb" src="${esc(src)}">
      <button class="ql-img-remove-btn" onclick="qlImageRemove(${i})" title="ลบรูป">✕</button>
    </div>`).join('');
}

function qlImagesChange(e){
  const files = Array.from(e.target.files || []);
  Promise.all(files.map(file=>compressImageToDataURL(file, 800, 0.7))).then(dataUrls=>{
    qlPendingImages.push(...dataUrls);
    renderQlImagesRow();
  });
  e.target.value = '';
}

function qlImageRemove(i){
  qlPendingImages.splice(i,1);
  renderQlImagesRow();
}

function qlSetColor(color, el){
  qlSelectedColor = color;
  document.querySelectorAll('.ql-swatch').forEach(s=>s.classList.remove('active'));
  if(el) el.classList.add('active');
  const strip = document.getElementById('qlColorStrip');
  if(strip){ strip.className = 'ql-color-strip nc-' + color; }
}
function qlToggleEditPin(){
  qlEditPinned = !qlEditPinned;
  document.getElementById('qlPinToggle').classList.toggle('on', qlEditPinned);
}
function qlToggleEditHide(){
  qlEditHidden = !qlEditHidden;
  document.getElementById('qlHideToggle').classList.toggle('on', qlEditHidden);
}
function qlResetEditToggles(pinned, hidden, color){
  qlEditPinned = !!pinned;
  qlEditHidden = !!hidden;
  const pt = document.getElementById('qlPinToggle');
  const ht = document.getElementById('qlHideToggle');
  if(pt) pt.classList.toggle('on', qlEditPinned);
  if(ht) ht.classList.toggle('on', qlEditHidden);
  const c = color || 'plain';
  qlSelectedColor = c;
  document.querySelectorAll('.ql-swatch').forEach(s=>s.classList.remove('active'));
  const sw = document.querySelector(`.sw-${c}`);
  if(sw) sw.classList.add('active');
  const strip = document.getElementById('qlColorStrip');
  if(strip) strip.className = 'ql-color-strip nc-' + c;
}

function qlOpenAdd(prefill=null){
  qlEditIdx = -1;
  qlEditId = null;
  document.getElementById('qlModalTitle').textContent = 'เพิ่มโน้ต';
  document.getElementById('qlName').value = (prefill && prefill.name) || '';
  document.getElementById('qlColorStripName').textContent = (prefill && prefill.name) || 'ชื่อโน้ต…';
  document.getElementById('qlUrl').value = (prefill && prefill.url) || '';
  rteSetHTML('qlDetailBody', (prefill && prefill.detail) || '');
  selectedQlTag = (prefill && prefill.tag) || '';
  renderQlTagRow();
  selectedQlType = (prefill && prefill.noteType) || 'fleeting';
  selectQlType(selectedQlType);
  selectedQlRelated = (prefill && prefill.relatedIds) ? prefill.relatedIds.slice() : [];
  renderQlRelatedRow();
  qlPendingImages = (prefill && prefill.images) ? prefill.images.slice() : [];
  renderQlImagesRow();
  qlResetEditToggles(false, false, 'plain');
  qlShowPage('edit');
  setTimeout(()=>document.getElementById('qlName').focus(),60);
}

function qlOpenEdit(i){
  const item = QL[i];
  if(!item) return;
  qlEditIdx = i;
  qlEditId = item.id;
  document.getElementById('qlModalTitle').textContent = 'แก้ไขโน้ต';
  document.getElementById('qlName').value   = item.name   || '';
  document.getElementById('qlColorStripName').textContent = item.name || 'ชื่อโน้ต…';
  document.getElementById('qlUrl').value    = item.url    || '';
  rteSetHTML('qlDetailBody', item.detail || '');
  selectedQlTag = item.tag || '';
  renderQlTagRow();
  selectedQlType = item.noteType || 'fleeting';
  selectQlType(selectedQlType);
  selectedQlRelated = (item.relatedIds || []).slice();
  renderQlRelatedRow();
  qlPendingImages = (item.images || []).slice();
  renderQlImagesRow();
  qlResetEditToggles(item.pinned, item.hidden, item.color);
  qlShowPage('edit');
  setTimeout(()=>document.getElementById('qlName').focus(),60);
}

function qlShowPage(page){
  document.getElementById('qlListView').style.display  = page==='list' ? '' : 'none';
  document.getElementById('qlEditPage').style.display  = page==='edit' ? '' : 'none';
  document.getElementById('qlReadPage').style.display  = page==='read' ? '' : 'none';
}

function qlClose(){
  qlEditIdx = -1;
  qlEditId = null;
  qlShowPage('list');
}

function qlCloseOnBg(e){
  if(e.target===document.getElementById('qlOverlay')) qlClose();
}

function qlSave(){
  const name   = document.getElementById('qlName').value.trim();
  const url    = document.getElementById('qlUrl').value.trim();
  const detail = rteGetHTML('qlDetailBody');
  if(!name){ document.getElementById('qlName').focus(); return; }
  if(qlEditIdx >= 0){
    const existing = QL[qlEditIdx];
    QL[qlEditIdx] = { ...existing, name, url, tag: selectedQlTag, detail, images: qlPendingImages.slice(), noteType: selectedQlType, relatedIds: selectedQlRelated.slice(), color: qlSelectedColor, pinned: qlEditPinned, hidden: qlEditHidden };
    if(qlEditHidden) qlUnlockedIds.delete(existing.id);
  } else {
    const id = Date.now().toString(36)+Math.random().toString(36).slice(2,8);
    QL.push({ id, name, url, tag: selectedQlTag, detail, images: qlPendingImages.slice(), noteType: selectedQlType, relatedIds: selectedQlRelated.slice(), color: qlSelectedColor, pinned: qlEditPinned, hidden: qlEditHidden, createdAt: Date.now() });
  }
  saveQL();
  renderQL();
  renderQlFilterBar();
  qlClose();
}

function qlSummarizeToPermanent(i){
  const item = QL[i];
  if(!item) return;
  showToast('เขียนสรุปด้วยคำพูดของตัวเอง (Feynman Technique) ก่อนบันทึก ✍️', 3200);
  qlOpenAdd({
    name: 'สรุป: ' + item.name,
    url: item.url,
    tag: item.tag,
    detail: item.detail,
    noteType: 'permanent',
    relatedIds: [item.id]
  });
}

// ── Note ซ่อน / ปลดล็อกด้วย PIN ───────────────────────
let qlUnlockedIds = new Set(); // เก็บแค่ใน session นี้ ไม่ persist — กลับมาเปิดแอปใหม่ต้องใส่ PIN อีก
let qlPendingUnlockIdx = null;

function qlHideNote(i){
  const item = QL[i];
  if(!item) return;
  item.hidden = true;
  qlUnlockedIds.delete(item.id);
  saveQL();
  renderQL();
}

function qlUnhideNote(i){
  const item = QL[i];
  if(!item) return;
  item.hidden = false;
  saveQL();
  renderQL();
}

function qlRequestUnlock(i){
  qlPendingUnlockIdx = i;
  document.getElementById('qlUnlockPin').value = '';
  document.getElementById('qlUnlockError').textContent = '';
  document.getElementById('qlUnlockOverlay').style.display = 'flex';
  setTimeout(()=>document.getElementById('qlUnlockPin').focus(), 60);
}

function closeQlUnlock(){
  document.getElementById('qlUnlockOverlay').style.display = 'none';
  qlPendingUnlockIdx = null;
}

async function submitQlUnlock(){
  const pin = document.getElementById('qlUnlockPin').value;
  const errorEl = document.getElementById('qlUnlockError');
  if(!PIN_RE.test(pin)){ errorEl.textContent = 'PIN ต้องเป็นตัวเลข 6 หลักเท่านั้น'; return; }
  try {
    const r = await fetch(API + '/verify-pin', {
      method: 'POST',
      headers: {'Content-Type':'application/json', ...authHeaders()},
      body: JSON.stringify({ pin })
    });
    const data = await r.json();
    if(!r.ok){
      errorEl.textContent = data.error || 'PIN ไม่ถูกต้อง';
      return;
    }
    const item = QL[qlPendingUnlockIdx];
    if(item) qlUnlockedIds.add(item.id);
    closeQlUnlock();
    renderQL();
  } catch(e){
    errorEl.textContent = 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ลองใหม่อีกครั้ง';
  }
}

// (loadQL/renderQL called after loadFile resolves, below)

// ── Finance (รายรับ-รายจ่าย) ──────────────────────────
const FINPM_KEY = 'dailyTodoFinPM';
const FINPM_DEFAULT = ['เงินสด','โอน/พร้อมเพย์','บัตรเครดิต','บัตรเดบิต','อื่นๆ'];
let FINPM = [];
const FIN_TAG_RECURRING = 'รายจ่ายประจำ';
const FIN_TAG_INCOME = 'รายรับ';
const FIN_TAG_RESERVED = [FIN_TAG_RECURRING, FIN_TAG_INCOME];
const FIN_TAG_KEY = 'dailyTodoFinTags';
const FIN_TAG_CUSTOM_DEFAULT = ['บิล', 'shopping'];
let FIN_TAGS = [];
let finActiveFilter = 'all';
let selectedFinType = 'income';
let selectedFinPM = '';
let selectedFinTag = '';
let finEditId = null;
let finSlipData = '';

function getFinance(d){ return (DB._finance && DB._finance[d]) || []; }
function setFinance(d, arr){ if(!DB._finance) DB._finance = {}; DB._finance[d] = arr; }
function findFinanceById(id){
  for(const d of Object.keys(DB._finance||{})){
    const e = DB._finance[d].find(x=>x.id===id);
    if(e) return {entry:e, date:d};
  }
  return null;
}

// ── Recurring bills (รายจ่ายประจำ) ────────────────────
let finSubTab = 'list';
let billsViewMonth = today.slice(0,7);
let incomeViewMonth = today.slice(0,7);
let billEditId = null;
let billImageData = '';
const BILL_DUE_SOON_DAYS = 4;

function getBills(){ return Array.isArray(DB._bills) ? DB._bills : (DB._bills = []); }
function setBills(arr){ DB._bills = arr; }
function getBillPayments(month){ return (DB._billPayments && DB._billPayments[month]) || []; }
function setBillPayments(month, arr){ if(!DB._billPayments) DB._billPayments = {}; DB._billPayments[month] = arr; }
function findBillPayment(month, billId){ return getBillPayments(month).find(p=>p.billId===billId) || null; }
function getBillMonthAmount(bill, month){
  const p = findBillPayment(month, bill.id);
  return (p && p.amount != null) ? p.amount : bill.amount;
}
function getBillMonthImage(bill, month){
  const p = findBillPayment(month, bill.id);
  // payment slip takes priority over bill's own image
  if(p && p.slip) return p.slip;
  if(p && p.image != null) return p.image;
  return bill.image || '';
}

function loadFinPM(){
  let fromLS = [];
  try { const key = userKey(FINPM_KEY); if(key) fromLS = JSON.parse(localStorage.getItem(key)||'[]'); } catch(_){}
  const fromFile = Array.isArray(DB._finPM) ? DB._finPM : null;
  FINPM = fromFile !== null ? fromFile : (fromLS.length ? fromLS : FINPM_DEFAULT.slice());
}
function saveFinPM(){
  DB._finPM = FINPM;
  const key = userKey(FINPM_KEY); if(key) localStorage.setItem(key, JSON.stringify(FINPM));
  writeFile();
}

function loadFinTags(){
  let fromLS = [];
  try { const key = userKey(FIN_TAG_KEY); if(key) fromLS = JSON.parse(localStorage.getItem(key)||'[]'); } catch(_){}
  const fromFile = Array.isArray(DB._finTags) ? DB._finTags : null;
  const custom = fromFile !== null ? fromFile : (fromLS.length ? fromLS : FIN_TAG_CUSTOM_DEFAULT.slice());
  FIN_TAGS = [...FIN_TAG_RESERVED, ...custom.filter(t=>!FIN_TAG_RESERVED.includes(t))];
}
function saveFinTags(){
  const custom = FIN_TAGS.filter(t=>!FIN_TAG_RESERVED.includes(t));
  DB._finTags = custom;
  const key = userKey(FIN_TAG_KEY); if(key) localStorage.setItem(key, JSON.stringify(custom));
  writeFile();
}

function finFmtMoney(n){
  return Number(n||0).toLocaleString('th-TH', {minimumFractionDigits:0, maximumFractionDigits:2});
}

function finSetFilter(filter){
  finActiveFilter = filter;
  document.querySelectorAll('#finFilterBar .filter-chip, #finFilterBar .ql-filter-btn').forEach(btn=>{
    btn.classList.toggle('active', (btn.dataset.filter || btn.dataset.filter) === filter);
  });
  renderFinance();
}

function finSetSubTab(tab){
  finSubTab = tab;
  document.querySelectorAll('#finSubTabBar .sub-tab, #finSubTabBar .ql-filter-btn').forEach(btn=>{
    const isActive = (btn.dataset.subtab === tab) || (btn.getAttribute('onclick')||'').includes(`'${tab}'`);
    btn.classList.toggle('active', isActive);
  });
  document.getElementById('finListPane').style.display   = tab==='list'   ? '' : 'none';
  document.getElementById('finBillsPane').style.display  = tab==='bills'  ? '' : 'none';
  document.getElementById('finIncomePane').style.display = tab==='income' ? '' : 'none';
  if(tab==='bills') renderBills();
  if(tab==='income') renderIncomeSources();
}

const finEditSvg = `<svg width="9" height="9" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
const finDelSvg  = `<svg width="9" height="9" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>`;

// Map finance tag/type to an emoji icon
function finTagIcon(tag, type){
  if(type === 'income') return '💼';
  const map = {
    'อาหาร':'🍜','ช้อปปิ้ง':'🛍️','เดินทาง':'🚌','บันเทิง':'🎬','สุขภาพ':'💊',
    'บิล':'🧾','น้ำมัน':'⛽','บ้าน':'🏠','การศึกษา':'📚','อื่นๆ':'📌'
  };
  if(tag && map[tag]) return map[tag];
  return '📌';
}

// Format a YYYY-MM-DD date as short Thai string e.g. "1 ก.ค. 2569"
function fmtDateShortTH(dateStr){
  if(!dateStr) return '';
  const months = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
  const [y, m, d] = dateStr.split('-');
  return `${Number(d)} ${months[Number(m)-1]} ${Number(y)+543}`;
}

// Render a donut SVG showing income vs expense ratio
function renderDonutSvg(income, expense){
  const total = income + expense || 1;
  const incomeRatio = income / total;
  const savePct = income > 0 ? Math.round(((income - expense) / income) * 100) : 0;
  const pct = (incomeRatio * 100).toFixed(1) + '%';
  return `<div class="donut-wrap">
    <div class="donut" style="background:conic-gradient(#10b981 0% ${pct}, #f43f5e ${pct} 100%)">
      <div class="donut-center">
        <div class="donut-pct">${savePct}%</div>
        <div class="donut-sub">ประหยัด</div>
      </div>
    </div>
  </div>`;
}

// Render bills preview sidebar widget
function renderBillsPreview(month){
  const bills = getBills().filter(b => b.active);
  if(!bills.length) return '';
  const iconBgs = ['rgba(99,102,241,.18)','rgba(244,63,94,.15)','rgba(6,182,212,.15)','rgba(245,158,11,.15)','rgba(16,185,129,.15)'];
  const iconEmojis = ['🏠','🎬','📱','💡','📋'];
  const rows = bills.slice(0, 5).map((bill, idx) => {
    const payment = findBillPayment(month, bill.id);
    const paid = !!payment;
    const bg = iconBgs[idx % iconBgs.length];
    const emoji = iconEmojis[idx % iconEmojis.length];
    return `<div class="bill-card preview-bill">
      <div class="bill-icon" style="background:${bg}">${emoji}</div>
      <div>
        <div class="bill-name">${esc(bill.name)}</div>
        <div class="bill-amount">฿${finFmtMoney(bill.amount)} / เดือน · ครบ ${bill.dueDay} ของเดือน</div>
      </div>
      <span class="bill-status ${paid ? 'bill-paid' : 'bill-due'}">${paid ? 'จ่ายแล้ว' : 'รอจ่าย'}</span>
    </div>`;
  }).join('');
  return `<div class="fin-bills-preview">
    <div class="bills-section-title">
      <span>บิลประจำเดือน</span>
      <span onclick="finSetSubTab('bills')" style="font-size:11px;color:var(--accent);font-weight:600;cursor:pointer">ดูทั้งหมด →</span>
    </div>
    ${rows}
  </div>`;
}

function renderFinance(){
  // Collect all entries for the viewed month, newest date first
  const curMonth = currentDate.slice(0,7);
  const monthEntries = Object.keys(DB._finance||{})
    .filter(d=>d.slice(0,7)===curMonth)
    .sort((a,b)=>b.localeCompare(a))
    .flatMap(d=>DB._finance[d].map(e=>({...e, _date:d})));

  let income = 0, expense = 0;
  monthEntries.forEach(e => {
    if(e.type === 'income') income += Number(e.amount)||0;
    else expense += Number(e.amount)||0;
  });
  const balance = income - expense;

  // --- Summary cards ---
  const statsEl = document.getElementById('finStatsGrid');
  if(statsEl){
    statsEl.className = 'finance-summary';
    statsEl.innerHTML = `
    <div class="fin-card income">
      <div class="fin-icon">📈</div>
      <div class="fin-amount">฿${finFmtMoney(income)}</div>
      <div class="fin-label">รายรับทั้งหมด</div>
    </div>
    <div class="fin-card expense">
      <div class="fin-icon">📉</div>
      <div class="fin-amount">฿${finFmtMoney(expense)}</div>
      <div class="fin-label">รายจ่ายทั้งหมด</div>
    </div>
    <div class="fin-card balance">
      <div class="fin-icon">💎</div>
      <div class="fin-amount">฿${finFmtMoney(balance)}</div>
      <div class="fin-label">คงเหลือสุทธิ</div>
    </div>`;
  }

  // --- Transaction list ---
  const body = document.getElementById('finBody');
  if(!body) return;

  const list = finActiveFilter === 'all' ? monthEntries : monthEntries.filter(e => e.type === finActiveFilter);

  if(!list.length){
    body.innerHTML = monthEntries.length
      ? '<span class="ql-empty">ไม่มีรายการในตัวกรองนี้</span>'
      : '<span class="ql-empty">ยังไม่มีรายการในเดือนนี้ — กด + เพิ่มรายการ เพื่อบันทึก</span>';
  } else {
    body.innerHTML = `<div class="txn-list">${list.map(e => {
      const isIncome = e.type === 'income';
      const icon = finTagIcon(e.tag, e.type);
      const iconBg = isIncome ? 'rgba(16,185,129,.18)' : 'rgba(244,63,94,.15)';
      const amtClass = isIncome ? 'income' : 'expense';
      const amtPrefix = isIncome ? '+' : '−';
      const tagHtml = e.tag ? `<span class="txn-cat">${esc(e.tag)}</span>` : '';
      const pmHtml  = e.paymentMethod ? `<span class="txn-pm">${esc(e.paymentMethod)}</span>` : '';
      const label   = e.note || e.item || '(ไม่มีชื่อ)';
      const slipHtml = e.slip ? `<img class="fin-slip-thumb" src="${esc(e.slip)}" onclick="event.stopPropagation();showImagePreview(this.src)" title="ดูสลิป">` : '';
      return `<div class="txn-row" onclick="openFinanceModal('${esc(e.id)}')">
        <div class="txn-icon" style="background:${iconBg}">${icon}</div>
        <div style="flex:1;min-width:0">
          <div class="txn-name">${esc(label)}</div>
          <div class="txn-meta">${tagHtml}${pmHtml}</div>
        </div>
        ${slipHtml}
        <div style="text-align:right;flex-shrink:0">
          <div class="txn-amount ${amtClass}">${amtPrefix}฿${finFmtMoney(e.amount)}</div>
          <div class="txn-date">${fmtDateShortTH(e._date)}</div>
        </div>
      </div>`;
    }).join('')}</div>`;
  }

  // --- Side column: donut chart + bills preview ---
  // Find or create the side column element
  let sideCol = document.getElementById('finSideCol');
  if(!sideCol){
    sideCol = document.createElement('div');
    sideCol.id = 'finSideCol';
    sideCol.className = 'two-col-side';
    // Insert after finBody
    body.parentNode.insertBefore(sideCol, body.nextSibling);
    // Wrap body + sideCol in a two-col container if not already wrapped
    const wrapper = document.createElement('div');
    wrapper.className = 'two-col';
    body.parentNode.insertBefore(wrapper, body);
    wrapper.appendChild(body);
    wrapper.appendChild(sideCol);
  }

  sideCol.innerHTML = `
    <div class="fin-donut-card">
      <div class="section-title">สัดส่วนรายรับ/รายจ่าย</div>
      <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap">
        ${renderDonutSvg(income, expense)}
        <div class="donut-legend">
          <div class="legend-item">
            <div class="legend-dot" style="background:#10b981"></div>
            <div class="legend-label">รายรับ</div>
            <div class="legend-val" style="color:#34d399">฿${finFmtMoney(income)}</div>
          </div>
          <div class="legend-item">
            <div class="legend-dot" style="background:#f43f5e"></div>
            <div class="legend-label">รายจ่าย</div>
            <div class="legend-val" style="color:#fb7185">฿${finFmtMoney(expense)}</div>
          </div>
          <div class="legend-item">
            <div class="legend-dot" style="background:rgba(99,102,241,.4)"></div>
            <div class="legend-label">คงเหลือ</div>
            <div class="legend-val" style="color:#818cf8">฿${finFmtMoney(balance)}</div>
          </div>
        </div>
      </div>
    </div>
    ${renderBillsPreview(curMonth)}
  `;
}

function billsChangeMonth(delta){
  billsViewMonth = shiftMonth(billsViewMonth, delta);
  renderBills();
}
function incomeChangeMonth(delta){
  incomeViewMonth = shiftMonth(incomeViewMonth, delta);
  renderIncomeSources();
}

function billRowHtml(bill, payment, dueDateStr, isOverdue, isDueSoon, amount, image){
  const paid = !!(payment && payment.paid);
  const statusBadge = paid
    ? `<span class="bill-status-badge paid">จ่ายแล้ว</span>`
    : isOverdue
      ? `<span class="bill-status-badge overdue">เกินกำหนด</span>`
      : isDueSoon
        ? `<span class="bill-status-badge duesoon">ใกล้ถึงกำหนด</span>`
        : `<span class="bill-status-badge pending">ยังไม่จ่าย</span>`;
  const inactiveBadge = bill.active ? '' : `<span class="fin-pm-badge">หยุดใช้งาน</span>`;
  const imageThumb = image ? `<img class="fin-slip-thumb" src="${esc(image)}" onclick="showImagePreview(this.src)" title="คลิกเพื่อดูรูปขนาดเต็ม">` : '';
  const pmBadge = (paid && payment && payment.paymentMethod) ? `<span class="fin-pm-badge">${esc(payment.paymentMethod)}</span>` : '';
  const payTimeBadge = (paid && payment && payment.payTime) ? `<span class="fin-card-time">จ่ายเวลา ${esc(payment.payTime)}</span>` : '';
  const payNoteHtml = (paid && payment && payment.payNote) ? `<div class="fin-card-note">${esc(payment.payNote)}</div>` : '';
  return `
  <div class="fin-card fin-entry-row bill-card ${paid?'paid':isOverdue?'overdue':isDueSoon?'duesoon':''}">
    ${imageThumb}
    <div class="fin-card-main">
      <div class="fin-card-top">
        <div>
          <div class="fin-card-item">${esc(bill.name)}</div>
          <span class="fin-card-time">ครบกำหนดวันที่ ${dueDateStr.slice(-2)}</span>
        </div>
        <div class="fin-card-amount expense">-${finFmtMoney(amount)}</div>
      </div>
      <div class="fin-card-meta">${statusBadge}${inactiveBadge}${pmBadge}${payTimeBadge}</div>
      ${payNoteHtml}
    </div>
    <div class="fin-card-actions">
      <button class="fin-card-btn" onclick="toggleBillPaid('${esc(bill.id)}')" title="${paid?'ยกเลิกจ่าย':'มาร์คว่าจ่ายแล้ว'}">
        ${paid
          ? `<svg width="9" height="9" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`
          : `<svg width="9" height="9" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>`}
      </button>
      <button class="fin-card-btn edit" onclick="openBillModal('${esc(bill.id)}')" title="แก้ไข">${finEditSvg}</button>
      <button class="fin-card-btn del"  onclick="deleteBill('${esc(bill.id)}')" title="ลบ">${finDelSvg}</button>
    </div>
  </div>`;
}

function renderBills(){
  const monthLabelEl = document.getElementById('billMonthLabel');
  if(monthLabelEl) monthLabelEl.textContent = monthLabelTH(billsViewMonth);

  const bills = getBills().filter(b=>!b.startMonth || b.startMonth <= billsViewMonth);
  const activeBills = bills.filter(b=>b.active);
  const payments = getBillPayments(billsViewMonth);

  const totalMonthly = activeBills.reduce((s,b)=>s+(Number(getBillMonthAmount(b, billsViewMonth))||0),0);

  let paidSoFar = 0;
  activeBills.forEach(b=>{
    const p = payments.find(x=>x.billId===b.id);
    if(p && p.paid) paidSoFar += Number(p.paidAmount ?? getBillMonthAmount(b, billsViewMonth) ?? 0);
  });
  const remaining = totalMonthly - paidSoFar;

  const isCurrentMonth = billsViewMonth === today.slice(0,7);
  const todayD = new Date(today+'T00:00:00');
  let dueSoonCount = 0, overdueCount = 0;
  const dueSoonList = [];
  if(isCurrentMonth){
    activeBills.forEach(b=>{
      const p = payments.find(x=>x.billId===b.id);
      if(p && p.paid) return;
      const dueStr = clampDueDate(billsViewMonth, b.dueDay);
      const dueD = new Date(dueStr+'T00:00:00');
      const diffDays = Math.round((dueD - todayD) / 86400000);
      if(diffDays < 0){ dueSoonList.push({bill:b, dueStr, state:'overdue'}); overdueCount++; }
      else if(diffDays <= BILL_DUE_SOON_DAYS){ dueSoonList.push({bill:b, dueStr, state:'duesoon'}); dueSoonCount++; }
    });
    dueSoonList.sort((a,b)=>a.dueStr.localeCompare(b.dueStr));
  }

  const nextMonth = shiftMonth(billsViewMonth, 1);
  const nextMonthBills = getBills().filter(b=>b.active && (!b.startMonth || b.startMonth <= nextMonth));
  const nextMonthForecast = nextMonthBills.reduce((s,b)=>s+(Number(getBillMonthAmount(b, nextMonth))||0),0);

  const statsEl = document.getElementById('billStatsGrid');
  if(statsEl){
    statsEl.innerHTML = `
    <div class="stat-card">
      <div class="stat-icon navy"><svg width="18" height="18" fill="none" stroke="var(--navy)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2.5"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg></div>
      <div class="stat-body">
        <div class="stat-num navy">${finFmtMoney(totalMonthly)}</div>
        <div class="stat-label">ค่าใช้จ่ายประจำ/เดือน</div>
      </div>
    </div>
    <div class="stat-card">
      <div class="stat-icon blue"><svg width="18" height="18" fill="none" stroke="var(--blue)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg></div>
      <div class="stat-body">
        <div class="stat-num blue">${finFmtMoney(paidSoFar)}</div>
        <div class="stat-label">จ่ายไปแล้ว</div>
      </div>
    </div>
    <div class="stat-card">
      <div class="stat-icon ${remaining>0?'amber':'blue'}"><svg width="18" height="18" fill="none" stroke="${remaining>0?'var(--amber)':'var(--blue)'}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg></div>
      <div class="stat-body">
        <div class="stat-num ${remaining>0?'amber':'blue'}">${finFmtMoney(remaining)}</div>
        <div class="stat-label">เหลืออีก</div>
      </div>
    </div>
    <div class="stat-card">
      <div class="stat-icon ${dueSoonCount>0?'yellow':'gray'}"><svg width="18" height="18" fill="none" stroke="${dueSoonCount>0?'var(--yellow)':'var(--gray)'}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></div>
      <div class="stat-body">
        <div class="stat-num ${dueSoonCount>0?'yellow':'gray'}">${dueSoonCount}</div>
        <div class="stat-label">ใกล้ถึงกำหนด (${BILL_DUE_SOON_DAYS} วัน)</div>
      </div>
    </div>
    <div class="stat-card">
      <div class="stat-icon ${overdueCount>0?'red':'gray'}"><svg width="18" height="18" fill="none" stroke="${overdueCount>0?'var(--red)':'var(--gray)'}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><circle cx="12" cy="16" r="0.5" fill="currentColor"/></svg></div>
      <div class="stat-body">
        <div class="stat-num ${overdueCount>0?'red':'gray'}">${overdueCount}</div>
        <div class="stat-label">เกินกำหนดแล้ว</div>
      </div>
    </div>`;
  }

  const forecastEl = document.getElementById('billForecastNote');
  if(forecastEl){
    forecastEl.innerHTML = `<div class="bill-forecast-note">📅 คาดการณ์เดือนหน้า (${monthLabelTH(nextMonth)}): ประมาณ <b>${finFmtMoney(nextMonthForecast)}</b> บาท</div>`;
  }

  const listEl = document.getElementById('billListBody');
  if(!listEl) return;
  if(!bills.length){
    listEl.innerHTML = '<span class="ql-empty">ยังไม่มีรายจ่ายประจำ — กด + เพิ่มรายจ่ายประจำ</span>';
    return;
  }

  const rows = bills
    .map(b=>({ b, dueStr: clampDueDate(billsViewMonth, b.dueDay) }))
    .sort((x,y)=>x.dueStr.localeCompare(y.dueStr))
    .map(({b, dueStr})=>{
      const p = payments.find(x=>x.billId===b.id);
      const paid = !!(p && p.paid);
      const dueD = new Date(dueStr+'T00:00:00');
      const diffDays = isCurrentMonth ? Math.round((dueD - todayD)/86400000) : null;
      const overdue = isCurrentMonth && diffDays!==null && diffDays<0 && !paid;
      const dueSoon = isCurrentMonth && diffDays!==null && diffDays>=0 && diffDays<=BILL_DUE_SOON_DAYS && !paid;
      const group = paid ? 'paid' : overdue ? 'overdue' : dueSoon ? 'duesoon' : 'pending';
      const html = billRowHtml(b, p, dueStr, overdue, dueSoon, getBillMonthAmount(b, billsViewMonth), getBillMonthImage(b, billsViewMonth));
      return { group, html };
    });

  const groupOrder = [
    { key: 'overdue', label: 'เกินกำหนด' },
    { key: 'duesoon', label: 'ใกล้ถึงกำหนด' },
    { key: 'paid',    label: 'จ่ายแล้ว' },
    { key: 'pending', label: 'รอชำระ' },
  ];
  const sections = [];
  groupOrder.forEach(({key, label})=>{
    const items = rows.filter(r=>r.group===key);
    if(!items.length) return;
    sections.push(`
      <div class="bill-group">
        <div class="bill-group-title ${key}">${label} <span class="bill-group-count">${items.length}</span></div>
        <div class="fin-list">${items.map(r=>r.html).join('')}</div>
      </div>`);
  });
  listEl.innerHTML = sections.join('<hr class="bill-group-divider">');
}

let selectedBillPM = '';

function openBillModal(id=null){
  billEditId = id;
  if(id){
    const b = getBills().find(x=>x.id===id);
    if(!b) return;
    document.getElementById('billModalTitle').textContent = 'แก้ไขรายจ่ายประจำ';
    document.getElementById('billName').value = b.name;
    document.getElementById('billAmount').value = getBillMonthAmount(b, billsViewMonth);
    document.getElementById('billDueDay').value = b.dueDay;
    selectBillActive(b.active);
    document.getElementById('billAmountLabel').textContent = `จำนวนเงิน (บาท) — ${monthLabelTH(billsViewMonth)}`;
    document.getElementById('billAmountHint').style.display = '';
    document.getElementById('billImageLabel').textContent = `รูปบิล/สลิป — ${monthLabelTH(billsViewMonth)}`;
    document.getElementById('billImageHint').style.display = '';
    billImageData = getBillMonthImage(b, billsViewMonth);
    selectedBillPM = b.paymentMethod || '';
    document.getElementById('billNote').value = b.note || '';
  } else {
    document.getElementById('billModalTitle').textContent = 'เพิ่มรายจ่ายประจำ';
    document.getElementById('billName').value = '';
    document.getElementById('billAmount').value = '';
    document.getElementById('billDueDay').value = '';
    selectBillActive(true);
    document.getElementById('billAmountLabel').textContent = 'จำนวนเงิน (บาท)';
    document.getElementById('billAmountHint').style.display = 'none';
    document.getElementById('billImageLabel').textContent = 'รูปบิล/สลิป';
    document.getElementById('billImageHint').style.display = 'none';
    billImageData = '';
    selectedBillPM = '';
    document.getElementById('billNote').value = '';
  }
  renderBillPMRow();
  document.getElementById('billImageInput').value = '';
  const preview = document.getElementById('billImagePreview');
  if(billImageData){
    preview.src = billImageData;
    preview.style.display = 'inline-block';
    document.getElementById('billImageRemoveBtn').style.display = 'inline-flex';
  } else {
    preview.src = '';
    preview.style.display = 'none';
    document.getElementById('billImageRemoveBtn').style.display = 'none';
  }
  document.getElementById('billOverlay').style.display = 'flex';
  setTimeout(()=>document.getElementById('billName').focus(), 60);
}

function renderBillPMRow(){
  const row = document.getElementById('billPMRow');
  if(!row) return;
  row.innerHTML = FINPM.map(pm=>
    `<button class="fin-pm-pill ${pm===selectedBillPM?'active':''}" data-pm="${esc(pm)}" onclick="selectBillPM('${esc(pm)}')">${esc(pm)}</button>`
  ).join('');
}

function selectBillPM(pm){
  selectedBillPM = (selectedBillPM===pm) ? '' : pm;
  document.querySelectorAll('#billPMRow .fin-pm-pill').forEach(btn=>{
    btn.classList.toggle('active', btn.dataset.pm === selectedBillPM);
  });
}
function closeBillModal(){
  const el = document.getElementById('billOverlay');
  if(el) el.style.display = 'none';
  billEditId = null;
}
function billImageChange(e){
  const file = e.target.files && e.target.files[0];
  if(!file) return;
  compressImageToDataURL(file, 800, 0.7).then(dataUrl=>{
    billImageData = dataUrl;
    const preview = document.getElementById('billImagePreview');
    preview.src = dataUrl;
    preview.style.display = 'inline-block';
    document.getElementById('billImageRemoveBtn').style.display = 'inline-flex';
  });
}
function billRemoveImage(){
  billImageData = '';
  document.getElementById('billImageInput').value = '';
  const preview = document.getElementById('billImagePreview');
  preview.src = '';
  preview.style.display = 'none';
  document.getElementById('billImageRemoveBtn').style.display = 'none';
}
function billCloseOnBg(e){ if(e.target===document.getElementById('billOverlay')) closeBillModal(); }
function selectBillActive(isActive){
  document.querySelectorAll('#billActiveRow .fin-type-pill').forEach(btn=>{
    btn.classList.toggle('active', (btn.dataset.active==='true') === isActive);
  });
  document.getElementById('billActiveRow').dataset.value = isActive ? 'true' : 'false';
}

async function saveBill(){
  const name = document.getElementById('billName').value.trim();
  const amount = parseFloat(document.getElementById('billAmount').value);
  const dueDay = parseInt(document.getElementById('billDueDay').value, 10);
  if(!name){ document.getElementById('billName').focus(); return; }
  if(!amount || amount<=0){ document.getElementById('billAmount').focus(); return; }
  if(!dueDay || dueDay<1 || dueDay>31){ document.getElementById('billDueDay').focus(); return; }
  const isActive = document.getElementById('billActiveRow').dataset.value !== 'false';
  const note = document.getElementById('billNote').value.trim();
  const bills = getBills();
  if(billEditId){
    const idx = bills.findIndex(x=>x.id===billEditId);
    if(idx>-1) bills[idx] = { ...bills[idx], name, dueDay, active: isActive, paymentMethod: selectedBillPM, note, updatedAt: new Date().toISOString() };
    // จำนวนเงินและรูปแก้ไขเฉพาะเดือนที่กำลังดูอยู่ (override) ไม่กระทบเดือนอื่น
    const payments = getBillPayments(billsViewMonth);
    let p = payments.find(x=>x.billId===billEditId);
    if(p){ p.amount = amount; p.image = billImageData; }
    else { payments.push({ billId: billEditId, paid: false, paidDate: null, paidAmount: null, financeEntryId: null, amount, image: billImageData }); }
    setBillPayments(billsViewMonth, payments);
  } else {
    bills.push({
      id: Date.now().toString(36)+Math.random().toString(36).slice(2,6),
      name, amount, dueDay, active: isActive, image: billImageData,
      paymentMethod: selectedBillPM, note,
      startMonth: billsViewMonth,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
    });
  }
  setBills(bills);
  closeBillModal();
  await writeFile();
  renderBills();
}

async function deleteBill(id){
  const bill = getBills().find(x=>x.id===id);
  if(!bill) return;
  const hasHistory = Object.values(DB._billPayments||{}).some(arr=>arr.some(p=>p.billId===id && p.paid));
  if(hasHistory){
    const ok = confirm(`"${bill.name}" มีประวัติจ่ายเงินแล้ว การลบจะเอารายการรายจ่ายประจำนี้ออกทั้งหมด (รายการที่บันทึกไปแล้วในแท็บ "รายการ" จะยังอยู่เหมือนเดิม) ต้องการลบหรือไม่?`);
    if(!ok) return;
  }
  setBills(getBills().filter(x=>x.id!==id));
  if(DB._billPayments){
    Object.keys(DB._billPayments).forEach(month=>{
      DB._billPayments[month] = DB._billPayments[month].filter(p=>p.billId!==id);
    });
  }
  await writeFile();
  renderBills();
}

let billPayBillId = null;
let selectedBillPayPM = '';
let billPaySlipData = '';

async function toggleBillPaid(billId){
  const bill = getBills().find(b=>b.id===billId);
  if(!bill) return;
  const payments = getBillPayments(billsViewMonth);
  const p = payments.find(x=>x.billId===billId);

  if(p && p.paid){
    if(p.financeEntryId && p.paidDate){
      setFinance(p.paidDate, getFinance(p.paidDate).filter(e=>e.id!==p.financeEntryId));
    }
    p.paid = false; p.paidDate = null; p.paidAmount = null; p.financeEntryId = null;
    p.paymentMethod = ''; p.payTime = ''; p.payNote = '';
    setBillPayments(billsViewMonth, payments);
    await writeFile();
    renderBills();
    if(typeof renderFinance === 'function') renderFinance();
  } else {
    openBillPayModal(billId);
  }
}

function openBillPayModal(billId){
  billPayBillId = billId;
  const bill = getBills().find(b=>b.id===billId);
  const now = new Date();
  document.getElementById('billPayTime').value = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
  document.getElementById('billPayNote').value = (bill && bill.note) || '';
  selectedBillPayPM = (bill && bill.paymentMethod) || '';
  billPaySlipData = '';
  document.getElementById('billPaySlipInput').value = '';
  document.getElementById('billPaySlipPreview').src = '';
  document.getElementById('billPaySlipPreview').style.display = 'none';
  document.getElementById('billPaySlipRemoveBtn').style.display = 'none';
  renderBillPayPMRow();
  document.getElementById('billPayOverlay').style.display = 'flex';
}

function closeBillPayModal(){
  document.getElementById('billPayOverlay').style.display = 'none';
  billPayBillId = null;
  billPaySlipData = '';
}

function billPaySlipChange(e){
  const file = e.target.files && e.target.files[0];
  if(!file) return;
  compressImageToDataURL(file, 800, 0.75).then(dataUrl=>{
    billPaySlipData = dataUrl;
    const preview = document.getElementById('billPaySlipPreview');
    preview.src = dataUrl;
    preview.style.display = 'inline-block';
    document.getElementById('billPaySlipRemoveBtn').style.display = 'inline-flex';
  });
}

function billPayRemoveSlip(){
  billPaySlipData = '';
  document.getElementById('billPaySlipInput').value = '';
  document.getElementById('billPaySlipPreview').src = '';
  document.getElementById('billPaySlipPreview').style.display = 'none';
  document.getElementById('billPaySlipRemoveBtn').style.display = 'none';
}

function billPayCloseOnBg(e){
  if(e.target.id === 'billPayOverlay') closeBillPayModal();
}

function renderBillPayPMRow(){
  const row = document.getElementById('billPayPMRow');
  if(!row) return;
  row.innerHTML = FINPM.map(pm=>
    `<button class="fin-pm-pill ${pm===selectedBillPayPM?'active':''}" data-pm="${esc(pm)}" onclick="selectBillPayPM('${esc(pm)}')">${esc(pm)}</button>`
  ).join('');
}

function selectBillPayPM(pm){
  selectedBillPayPM = (selectedBillPayPM===pm) ? '' : pm;
  document.querySelectorAll('#billPayPMRow .fin-pm-pill').forEach(btn=>{
    btn.classList.toggle('active', btn.dataset.pm === selectedBillPayPM);
  });
}

async function confirmBillPay(){
  const billId = billPayBillId;
  const bill = getBills().find(b=>b.id===billId);
  if(!bill) return;
  const payments = getBillPayments(billsViewMonth);
  let p = payments.find(x=>x.billId===billId);

  const monthAmount = getBillMonthAmount(bill, billsViewMonth);
  const paidDate = today;
  const financeId = Date.now().toString(36)+Math.random().toString(36).slice(2,6);
  const entries = getFinance(paidDate);
  const now = new Date();
  const payTime = document.getElementById('billPayTime').value || '';
  const payNote = document.getElementById('billPayNote').value.trim();
  entries.push({
    id: financeId,
    type: 'expense',
    item: bill.name,
    amount: monthAmount,
    time: payTime,
    paymentMethod: selectedBillPayPM,
    note: payNote || `รายจ่ายประจำ (auto) — ${monthLabelTH(billsViewMonth)}`,
    slip: billPaySlipData,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    billId: bill.id
  });
  setFinance(paidDate, entries);

  if(!p){
    p = { billId, paid: true, paidDate, paidAmount: monthAmount, financeEntryId: financeId };
    payments.push(p);
  } else {
    p.paid = true; p.paidDate = paidDate; p.paidAmount = monthAmount; p.financeEntryId = financeId;
  }
  p.paymentMethod = selectedBillPayPM;
  p.payTime = payTime;
  p.payNote = payNote;
  if(billPaySlipData) p.slip = billPaySlipData;

  setBillPayments(billsViewMonth, payments);
  closeBillPayModal();
  renderBills();
  if(typeof renderFinance === 'function') renderFinance();
  await writeFile();
}

// ── รายรับ (Income Sources + Log การรับ) ─────────
let incomeSourceEditId = null;
let selectedIncomeSourcePM = '';
let selectedIncomeLogPM = '';
let incomeLogSourceId = null;
let incomeHistorySourceId = null;

function getIncomeSources(){ return Array.isArray(DB._incomeSources) ? DB._incomeSources : (DB._incomeSources = []); }
function setIncomeSources(arr){ DB._incomeSources = arr; }
function getIncomeLogs(){ return Array.isArray(DB._incomeLogs) ? DB._incomeLogs : (DB._incomeLogs = []); }
function setIncomeLogs(arr){ DB._incomeLogs = arr; }

function openIncomeSourceModal(id=null){
  incomeSourceEditId = id;
  if(id){
    const s = getIncomeSources().find(x=>x.id===id);
    if(!s) return;
    document.getElementById('incomeSourceModalTitle').textContent = 'แก้ไขแหล่งรายรับ';
    document.getElementById('incomeSourceName').value = s.name;
    document.getElementById('incomeSourceAmount').value = s.amount || '';
    selectIncomeSourceActive(s.active);
    selectedIncomeSourcePM = s.paymentMethod || '';
    document.getElementById('incomeSourceNote').value = s.note || '';
  } else {
    document.getElementById('incomeSourceModalTitle').textContent = 'เพิ่มแหล่งรายรับ';
    document.getElementById('incomeSourceName').value = '';
    document.getElementById('incomeSourceAmount').value = '';
    selectIncomeSourceActive(true);
    selectedIncomeSourcePM = '';
    document.getElementById('incomeSourceNote').value = '';
  }
  renderIncomeSourcePMRow();
  document.getElementById('incomeSourceOverlay').style.display = 'flex';
  setTimeout(()=>document.getElementById('incomeSourceName').focus(), 60);
}

function closeIncomeSourceModal(){
  const el = document.getElementById('incomeSourceOverlay');
  if(el) el.style.display = 'none';
  incomeSourceEditId = null;
}
function incomeSourceCloseOnBg(e){ if(e.target===document.getElementById('incomeSourceOverlay')) closeIncomeSourceModal(); }

function selectIncomeSourceActive(isActive){
  document.querySelectorAll('#incomeSourceActiveRow .fin-type-pill').forEach(btn=>{
    btn.classList.toggle('active', (btn.dataset.active==='true') === isActive);
  });
  document.getElementById('incomeSourceActiveRow').dataset.value = isActive ? 'true' : 'false';
}

function renderIncomeSourcePMRow(){
  const row = document.getElementById('incomeSourcePMRow');
  if(!row) return;
  row.innerHTML = FINPM.map(pm=>
    `<button class="fin-pm-pill ${pm===selectedIncomeSourcePM?'active':''}" data-pm="${esc(pm)}" onclick="selectIncomeSourcePM('${esc(pm)}')">${esc(pm)}</button>`
  ).join('');
}
function selectIncomeSourcePM(pm){
  selectedIncomeSourcePM = (selectedIncomeSourcePM===pm) ? '' : pm;
  document.querySelectorAll('#incomeSourcePMRow .fin-pm-pill').forEach(btn=>{
    btn.classList.toggle('active', btn.dataset.pm === selectedIncomeSourcePM);
  });
}

async function saveIncomeSource(){
  const name = document.getElementById('incomeSourceName').value.trim();
  const amount = parseFloat(document.getElementById('incomeSourceAmount').value) || 0;
  if(!name){ document.getElementById('incomeSourceName').focus(); return; }
  const isActive = document.getElementById('incomeSourceActiveRow').dataset.value !== 'false';
  const note = document.getElementById('incomeSourceNote').value.trim();
  const sources = getIncomeSources();
  const isNew = !incomeSourceEditId;
  let newSource = null;
  if(incomeSourceEditId){
    const idx = sources.findIndex(x=>x.id===incomeSourceEditId);
    if(idx>-1) sources[idx] = { ...sources[idx], name, amount, active: isActive, paymentMethod: selectedIncomeSourcePM, note, updatedAt: new Date().toISOString() };
  } else {
    newSource = {
      id: Date.now().toString(36)+Math.random().toString(36).slice(2,6),
      name, amount, active: isActive, paymentMethod: selectedIncomeSourcePM, note,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
    };
    sources.push(newSource);
  }
  setIncomeSources(sources);

  if(isNew && newSource && amount > 0){
    const now = new Date();
    recordIncomeReceipt(newSource, {
      amount, date: today,
      time: `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`,
      paymentMethod: selectedIncomeSourcePM, note
    });
  }

  closeIncomeSourceModal();
  await writeFile();
  renderIncomeSources();
  if(typeof renderFinance === 'function') renderFinance();
}

async function deleteIncomeSource(id){
  const hasHistory = getIncomeLogs().some(l=>l.sourceId===id);
  if(hasHistory && !confirm('แหล่งรายรับนี้มีประวัติการรับเงินแล้ว ต้องการลบทิ้งทั้งหมดหรือไม่? (ประวัติรายการในแท็บ "รายการ" จะยังอยู่)')) return;
  setIncomeSources(getIncomeSources().filter(x=>x.id!==id));
  setIncomeLogs(getIncomeLogs().filter(l=>l.sourceId!==id));
  await writeFile();
  renderIncomeSources();
}

function openIncomeLogModal(sourceId){
  const source = getIncomeSources().find(x=>x.id===sourceId);
  if(!source) return;
  incomeLogSourceId = sourceId;
  const now = new Date();
  document.getElementById('incomeLogAmount').value = source.amount || '';
  document.getElementById('incomeLogDate').value = today;
  document.getElementById('incomeLogTime').value = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
  document.getElementById('incomeLogNote').value = source.note || '';
  document.getElementById('incomeLogError').textContent = '';
  selectedIncomeLogPM = source.paymentMethod || '';
  renderIncomeLogPMRow();
  document.getElementById('incomeLogOverlay').style.display = 'flex';
  setTimeout(()=>document.getElementById('incomeLogAmount').focus(), 60);
}

function closeIncomeLogModal(){
  const el = document.getElementById('incomeLogOverlay');
  if(el) el.style.display = 'none';
  incomeLogSourceId = null;
}
function incomeLogCloseOnBg(e){ if(e.target===document.getElementById('incomeLogOverlay')) closeIncomeLogModal(); }

function renderIncomeLogPMRow(){
  const row = document.getElementById('incomeLogPMRow');
  if(!row) return;
  row.innerHTML = FINPM.map(pm=>
    `<button class="fin-pm-pill ${pm===selectedIncomeLogPM?'active':''}" data-pm="${esc(pm)}" onclick="selectIncomeLogPM('${esc(pm)}')">${esc(pm)}</button>`
  ).join('');
}
function selectIncomeLogPM(pm){
  selectedIncomeLogPM = (selectedIncomeLogPM===pm) ? '' : pm;
  document.querySelectorAll('#incomeLogPMRow .fin-pm-pill').forEach(btn=>{
    btn.classList.toggle('active', btn.dataset.pm === selectedIncomeLogPM);
  });
}

function recordIncomeReceipt(source, { amount, date, time, paymentMethod, note }){
  const now = new Date();
  const financeId = Date.now().toString(36)+Math.random().toString(36).slice(2,6);
  const logId = Date.now().toString(36)+Math.random().toString(36).slice(2,8);

  const entries = getFinance(date);
  entries.push({
    id: financeId,
    type: 'income',
    item: source.name,
    amount,
    time,
    paymentMethod,
    note: note || `รายรับ — ${source.name}`,
    slip: '',
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    incomeSourceId: source.id
  });
  setFinance(date, entries);

  const logs = getIncomeLogs();
  logs.push({
    id: logId,
    sourceId: source.id,
    amount, date, time,
    paymentMethod,
    note,
    financeEntryId: financeId,
    createdAt: now.toISOString()
  });
  setIncomeLogs(logs);
  return logId;
}

async function confirmIncomeLog(){
  const errorEl = document.getElementById('incomeLogError');
  if(errorEl) errorEl.textContent = '';
  try {
    const source = getIncomeSources().find(x=>x.id===incomeLogSourceId);
    if(!source){
      if(errorEl) errorEl.textContent = 'ไม่พบแหล่งรายรับนี้ กรุณาปิดหน้านี้แล้วลองใหม่';
      return;
    }
    const amount = parseFloat(document.getElementById('incomeLogAmount').value);
    if(!amount || amount<=0){
      if(errorEl) errorEl.textContent = 'กรุณาใส่จำนวนเงินที่ได้รับ';
      document.getElementById('incomeLogAmount').focus();
      return;
    }
    const date = document.getElementById('incomeLogDate').value || today;
    const time = document.getElementById('incomeLogTime').value || '';
    const note = document.getElementById('incomeLogNote').value.trim();

    const logId = recordIncomeReceipt(source, { amount, date, time, paymentMethod: selectedIncomeLogPM, note });

    closeIncomeLogModal();
    renderIncomeSources();
    if(typeof renderFinance === 'function') renderFinance();
    showToast('บันทึกว่าได้รับเงินสำเร็จ ✅');
    await writeFile();
  } catch(e){
    console.error('confirmIncomeLog error:', e);
    if(errorEl) errorEl.textContent = 'เกิดข้อผิดพลาดในการบันทึก กรุณาลองใหม่';
  }
}

async function deleteIncomeLog(logId){
  const logs = getIncomeLogs();
  const log = logs.find(l=>l.id===logId);
  if(!log) return;
  if(log.financeEntryId){
    setFinance(log.date, getFinance(log.date).filter(e=>e.id!==log.financeEntryId));
  }
  setIncomeLogs(logs.filter(l=>l.id!==logId));
  await writeFile();
  renderIncomeHistory(incomeHistorySourceId);
  renderIncomeSources();
  if(typeof renderFinance === 'function') renderFinance();
}

function incomeSourceRowHtml(source, logsThisMonth, totalThisMonth){
  const inactiveBadge = source.active ? '' : `<span class="fin-pm-badge">หยุดใช้งาน</span>`;
  const pmBadge = source.paymentMethod ? `<span class="fin-pm-badge">${esc(source.paymentMethod)}</span>` : '';
  const lastLog = logsThisMonth[0];
  const lastInfo = lastLog ? `ล่าสุด ${lastLog.date.slice(-2)}/${lastLog.date.slice(5,7)} — ${finFmtMoney(lastLog.amount)} บาท` : 'ยังไม่มีรายการเดือนนี้';
  return `
  <div class="income-source-card fin-card">
    <div class="fin-card-main">
      <div class="fin-card-top">
        <div>
          <div class="fin-card-item">${esc(source.name)}</div>
          <span class="fin-card-time">${esc(lastInfo)}</span>
        </div>
        <div class="fin-card-amount fin-amount income">+${finFmtMoney(totalThisMonth)}</div>
      </div>
      <div class="fin-card-meta">
        <span class="bill-status-badge pending">${logsThisMonth.length} ครั้งเดือนนี้</span>
        ${pmBadge}${inactiveBadge}
      </div>
    </div>
    <div class="fin-card-actions">
      <button class="fin-card-btn" onclick="openIncomeLogModal('${esc(source.id)}')" title="บันทึกว่าได้รับ">
        <svg width="9" height="9" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      </button>
      <button class="fin-card-btn" onclick="openIncomeHistory('${esc(source.id)}')" title="ดูประวัติการรับ">
        <svg width="9" height="9" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>
      </button>
      <button class="fin-card-btn edit" onclick="openIncomeSourceModal('${esc(source.id)}')" title="แก้ไข">${finEditSvg}</button>
      <button class="fin-card-btn del"  onclick="deleteIncomeSource('${esc(source.id)}')" title="ลบ">${finDelSvg}</button>
    </div>
  </div>`;
}

function renderIncomeSources(){
  const sources = getIncomeSources();
  const logs = getIncomeLogs();
  const curMonth = incomeViewMonth;
  const logsThisMonth = logs.filter(l=>(l.date||'').slice(0,7) === curMonth);
  const monthLabelEl = document.getElementById('incomeMonthLabel');
  if(monthLabelEl) monthLabelEl.textContent = monthLabelTH(curMonth);

  // รายการรายรับทั้งหมดจาก _finance (type=income) ของเดือนนี้
  const allIncomeEntries = Object.keys(DB._finance||{})
    .filter(d=>d.slice(0,7)===curMonth)
    .sort((a,b)=>b.localeCompare(a))
    .flatMap(d=>DB._finance[d].filter(e=>e.type==='income').map(e=>({...e,_date:d})));

  const statsEl = document.getElementById('incomeStatsGrid');
  if(statsEl){
    const totalThisMonth = allIncomeEntries.reduce((s,e)=>s+Number(e.amount||0),0);
    const countThisMonth = allIncomeEntries.length;
    const lastEntry = allIncomeEntries[0]; // newest first
    const lastLabel = lastEntry ? esc(lastEntry.item) : '-';
    statsEl.innerHTML = `
    <div class="stat-card">
      <div class="stat-icon green"><svg width="18" height="18" fill="none" stroke="var(--green)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v10M9 9.5c0-1.1 1.1-2 3-2s3 .9 3 2-1.3 2-3 2-3 .9-3 2 1.34 2 3 2 3-.9 3-2"/></svg></div>
      <div class="stat-body">
        <div class="stat-num green">${finFmtMoney(totalThisMonth)}</div>
        <div class="stat-label">รายรับเดือนนี้</div>
      </div>
    </div>
    <div class="stat-card">
      <div class="stat-icon blue"><svg width="18" height="18" fill="none" stroke="var(--blue)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg></div>
      <div class="stat-body">
        <div class="stat-num blue">${countThisMonth}</div>
        <div class="stat-label">จำนวนครั้งเดือนนี้</div>
      </div>
    </div>
    <div class="stat-card">
      <div class="stat-icon gray"><svg width="18" height="18" fill="none" stroke="var(--gray)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></div>
      <div class="stat-body">
        <div class="stat-num gray" style="font-size:1.1rem">${lastLabel}</div>
        <div class="stat-label">รายการล่าสุด</div>
      </div>
    </div>`;
  }

  // แหล่งรายรับ (income sources)
  const listEl = document.getElementById('incomeSourceListBody');
  if(listEl){
    if(!sources.length){
      listEl.innerHTML = '<span class="ql-empty">ยังไม่มีแหล่งรายรับ — กด + เพิ่มแหล่งรายรับ</span>';
    } else {
      listEl.innerHTML = sources.map(source=>{
        const sourceLogsThisMonth = logsThisMonth.filter(l=>l.sourceId===source.id).sort((a,b)=> (b.date+(b.time||'')+(b.createdAt||'')).localeCompare(a.date+(a.time||'')+(a.createdAt||'')));
        const totalThisMonth = sourceLogsThisMonth.reduce((s,l)=>s+Number(l.amount||0),0);
        return incomeSourceRowHtml(source, sourceLogsThisMonth, totalThisMonth);
      }).join('');
    }
  }

  // รายการรายรับทั้งหมดของเดือน (ทุก entry type=income จาก _finance)
  const allEntriesSection = document.getElementById('incomeAllEntriesSection');
  const allEntriesLabel = document.getElementById('incomeAllEntriesLabel');
  const allEntriesBody = document.getElementById('incomeAllEntriesBody');
  if(allEntriesBody){
    if(allEntriesLabel) allEntriesLabel.textContent = `รายการรายรับทั้งหมด — ${monthLabelTH(curMonth)}`;
    if(!allIncomeEntries.length){
      allEntriesBody.innerHTML = '<span class="ql-empty">ไม่มีรายรับในเดือนนี้</span>';
    } else {
      allEntriesBody.innerHTML = allIncomeEntries.map(e=>{
        const dateBadge = `<span class="fin-card-date-badge">${esc(e._date.slice(5))}</span>`;
        const timeBadge = e.time ? `<span class="fin-card-time">${esc(e.time)}</span>` : '';
        const pmBadge = e.paymentMethod ? `<span class="fin-pm-badge">${esc(e.paymentMethod)}</span>` : '';
        const noteHtml = e.note ? `<div class="fin-card-note">${esc(e.note)}</div>` : '';
        return `
        <div class="fin-card income">
          <div class="fin-card-main">
            <div class="fin-card-top">
              <div>
                <div class="fin-card-item">${esc(e.item)}</div>
                <div style="display:flex;gap:.3rem;align-items:center;flex-wrap:wrap">${dateBadge}${timeBadge}</div>
              </div>
              <div class="fin-card-amount income">+${finFmtMoney(e.amount)}</div>
            </div>
            <div class="fin-card-meta">${pmBadge}</div>
            ${noteHtml}
          </div>
          <div class="fin-card-actions">
            <button class="fin-card-btn edit" onclick="openFinanceModal('${esc(e.id)}')" title="แก้ไข">${finEditSvg}</button>
            <button class="fin-card-btn del"  onclick="deleteFinance('${esc(e.id)}')" title="ลบ">${finDelSvg}</button>
          </div>
        </div>`;
      }).join('');
    }
  }
}

function openIncomeHistory(sourceId){
  incomeHistorySourceId = sourceId;
  renderIncomeHistory(sourceId);
  document.getElementById('incomeHistoryOverlay').style.display = 'flex';
}
function closeIncomeHistory(){
  document.getElementById('incomeHistoryOverlay').style.display = 'none';
  incomeHistorySourceId = null;
}

function renderIncomeHistory(sourceId){
  const source = getIncomeSources().find(x=>x.id===sourceId);
  if(!source) return;
  document.getElementById('incomeHistoryTitle').textContent = source.name;
  const logs = getIncomeLogs().filter(l=>l.sourceId===sourceId).sort((a,b)=> (b.date+(b.time||'')+(b.createdAt||'')).localeCompare(a.date+(a.time||'')+(a.createdAt||'')));
  const total = logs.reduce((s,l)=>s+Number(l.amount||0),0);
  document.getElementById('incomeHistoryMeta').innerHTML = `<span class="ql-tag-badge" style="--tag-color:var(--green);--tag-bg:var(--green-dim)">● รวมทั้งหมด ${finFmtMoney(total)} บาท · ${logs.length} ครั้ง</span>`;
  const body = document.getElementById('incomeHistoryBody');
  if(!logs.length){
    body.innerHTML = '<span class="ql-empty">ยังไม่มีประวัติการรับเงินจากแหล่งนี้</span>';
    return;
  }
  body.innerHTML = logs.map(l=>{
    const pmBadge = l.paymentMethod ? `<span class="fin-pm-badge">${esc(l.paymentMethod)}</span>` : '';
    const noteHtml = l.note ? `<div class="fin-card-note">${esc(l.note)}</div>` : '';
    return `
    <div class="fin-card">
      <div class="fin-card-main">
        <div class="fin-card-top">
          <div>
            <div class="fin-card-item">${esc(l.date)}${l.time?` ${esc(l.time)}`:''}</div>
          </div>
          <div class="fin-card-amount income">+${finFmtMoney(l.amount)}</div>
        </div>
        <div class="fin-card-meta">${pmBadge}</div>
        ${noteHtml}
      </div>
      <div class="fin-card-actions">
        <button class="fin-card-btn del" onclick="deleteIncomeLog('${esc(l.id)}')" title="ลบรายการนี้">${finDelSvg}</button>
      </div>
    </div>`;
  }).join('');
}

function selectFinType(type){
  selectedFinType = type;
  document.querySelectorAll('#finTypeRow .fin-type-pill').forEach(btn=>{
    btn.classList.toggle('active', btn.dataset.type === type);
  });
}

function renderFinPMRow(){
  const row = document.getElementById('finPMRow');
  row.innerHTML = FINPM.map(pm=>
    `<button class="fin-pm-pill ${pm===selectedFinPM?'active':''}" data-pm="${esc(pm)}" onclick="selectFinPM('${esc(pm)}')">${esc(pm)}</button>`
  ).join('');
}

function selectFinPM(pm){
  selectedFinPM = (selectedFinPM===pm) ? '' : pm;
  document.querySelectorAll('#finPMRow .fin-pm-pill').forEach(btn=>{
    btn.classList.toggle('active', btn.dataset.pm === selectedFinPM);
  });
}

function renderFinTagRow(){
  const row = document.getElementById('finTagRow');
  if(!row) return;
  row.innerHTML = FIN_TAGS.map(tag=>
    `<button class="fin-pm-pill ${tag===selectedFinTag?'active':''}" data-tag="${esc(tag)}" onclick="selectFinTag('${esc(tag)}')">${esc(tag)}</button>`
  ).join('');
}

function selectFinTag(tag){
  selectedFinTag = (selectedFinTag===tag) ? '' : tag;
  document.querySelectorAll('#finTagRow .fin-pm-pill').forEach(btn=>{
    btn.classList.toggle('active', btn.dataset.tag === selectedFinTag);
  });
  const dueDayField = document.getElementById('finBillDueDayField');
  if(dueDayField) dueDayField.style.display = (selectedFinTag === FIN_TAG_RECURRING) ? '' : 'none';
}

// ── Tag manage modal ──────────────────────────────────
function renderFinTagManageList(){
  const list = document.getElementById('finTagManageList');
  if(!list) return;
  list.innerHTML = FIN_TAGS.map((tag,i)=>{
    const isReserved = FIN_TAG_RESERVED.includes(tag);
    const delBtn = isReserved
      ? `<span style="font-size:.7rem;color:var(--text-3)">tag หลัก</span>`
      : `<button class="fin-card-btn del" onclick="finTagDelete(${i})" title="ลบ">${finDelSvg}</button>`;
    return `
      <div class="fin-pm-manage-item">
        <span>${esc(tag)}</span>
        ${delBtn}
      </div>`;
  }).join('');
}

function openFinTagModal(){
  renderFinTagManageList();
  document.getElementById('finTagNewName').value = '';
  document.getElementById('finTagOverlay').style.display = 'flex';
  setTimeout(()=>document.getElementById('finTagNewName').focus(), 60);
}
function closeFinTagModal(){
  const el = document.getElementById('finTagOverlay');
  if(el) el.style.display = 'none';
}
function finTagCloseOnBg(e){ if(e.target===document.getElementById('finTagOverlay')) closeFinTagModal(); }

async function finTagAdd(){
  const input = document.getElementById('finTagNewName');
  const name = input.value.trim();
  if(!name || FIN_TAGS.includes(name)){ input.focus(); return; }
  FIN_TAGS.push(name);
  saveFinTags();
  renderFinTagManageList();
  renderFinTagRow();
  input.value = '';
  input.focus();
}

async function finTagDelete(i){
  const tag = FIN_TAGS[i];
  if(FIN_TAG_RESERVED.includes(tag)) return;
  FIN_TAGS.splice(i,1);
  if(selectedFinTag === tag) selectedFinTag = '';
  saveFinTags();
  renderFinTagManageList();
  renderFinTagRow();
}

function finSlipChange(e){
  const file = e.target.files && e.target.files[0];
  if(!file) return;
  compressImageToDataURL(file, 800, 0.7).then(dataUrl=>{
    finSlipData = dataUrl;
    const preview = document.getElementById('finSlipPreview');
    preview.src = dataUrl;
    preview.style.display = 'inline-block';
    document.getElementById('finSlipRemoveBtn').style.display = 'inline-flex';
  });
}

function finRemoveSlip(){
  finSlipData = '';
  document.getElementById('finSlipInput').value = '';
  const preview = document.getElementById('finSlipPreview');
  preview.src = '';
  preview.style.display = 'none';
  document.getElementById('finSlipRemoveBtn').style.display = 'none';
}

function compressImageToDataURL(file, maxDim, quality, maxBytes){
  const limit = maxBytes || 500 * 1024; // default 500 KB
  return new Promise(resolve=>{
    const img = new Image();
    const reader = new FileReader();
    reader.onload = ()=>{
      img.onload = ()=>{
        const drawAndResolve = (dim, q) => {
          let { width, height } = img;
          if(width > dim || height > dim){
            if(width > height){ height = Math.round(height * dim / width); width = dim; }
            else { width = Math.round(width * dim / height); height = dim; }
          }
          const canvas = document.createElement('canvas');
          canvas.width = width; canvas.height = height;
          canvas.getContext('2d').drawImage(img, 0, 0, width, height);
          let dataUrl = canvas.toDataURL('image/jpeg', q);
          if(dataUrl.length > limit * 1.37){
            if(q > 0.4){ return drawAndResolve(dim, Math.round((q - 0.15) * 10) / 10); }
            if(dim > 100){ return drawAndResolve(Math.round(dim * 0.7), 0.4); }
            // last resort: binary-search quality at current dim until fits
            let lo = 0.1, hi = 0.4;
            while(hi - lo > 0.02){
              const mid = Math.round(((lo + hi) / 2) * 100) / 100;
              dataUrl = canvas.toDataURL('image/jpeg', mid);
              if(dataUrl.length > limit * 1.37) hi = mid; else lo = mid;
            }
            dataUrl = canvas.toDataURL('image/jpeg', lo);
          }
          resolve(dataUrl);
        };
        drawAndResolve(maxDim, quality);
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function openFinanceModal(id=null){
  finEditId = id;
  renderFinPMRow();
  if(id){
    const found = findFinanceById(id);
    const e = found ? found.entry : null;
    if(!e) return;
    document.getElementById('finModalTitle').textContent = 'แก้ไขรายการ';
    document.getElementById('finItem').value = e.item || '';
    document.getElementById('finAmount').value = e.amount || '';
    document.getElementById('finDate').value = found.date || currentDate;
    document.getElementById('finTime').value = e.time || '';
    document.getElementById('finNote').value = e.note || '';
    selectFinType(e.type || 'income');
    selectedFinPM = e.paymentMethod || '';
    renderFinPMRow();
    selectedFinTag = e.tag || '';
    renderFinTagRow();
    const dueDayField = document.getElementById('finBillDueDayField');
    if(selectedFinTag === FIN_TAG_RECURRING){
      dueDayField.style.display = '';
      const bill = e.billId ? getBills().find(b=>b.id===e.billId) : null;
      document.getElementById('finBillDueDay').value = bill ? bill.dueDay : '';
    } else {
      dueDayField.style.display = 'none';
      document.getElementById('finBillDueDay').value = '';
    }

    finSlipData = e.slip || '';
    const preview = document.getElementById('finSlipPreview');
    if(finSlipData){
      preview.src = finSlipData;
      preview.style.display = 'inline-block';
      document.getElementById('finSlipRemoveBtn').style.display = 'inline-flex';
    } else {
      preview.src = '';
      preview.style.display = 'none';
      document.getElementById('finSlipRemoveBtn').style.display = 'none';
    }
  } else {
    document.getElementById('finModalTitle').textContent = 'เพิ่มรายการ';
    document.getElementById('finItem').value = '';
    document.getElementById('finAmount').value = '';
    document.getElementById('finDate').value = currentDate;
    const now = new Date();
    document.getElementById('finTime').value = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
    document.getElementById('finNote').value = '';
    selectFinType('income');
    selectedFinPM = '';
    renderFinPMRow();
    selectedFinTag = '';
    renderFinTagRow();
    document.getElementById('finBillDueDayField').style.display = 'none';
    document.getElementById('finBillDueDay').value = '';
    finRemoveSlip();
  }
  document.getElementById('finSlipInput').value = '';
  document.getElementById('finOverlay').style.display = 'flex';
  setTimeout(()=>document.getElementById('finItem').focus(), 60);
}

function closeFinanceModal(){
  const el = document.getElementById('finOverlay');
  if(el) el.style.display = 'none';
  finEditId = null;
}
function finCloseOnBg(e){ if(e.target===document.getElementById('finOverlay')) closeFinanceModal(); }

function unlinkFinanceBill(billId){
  setBills(getBills().filter(b=>b.id!==billId));
  if(DB._billPayments){
    Object.keys(DB._billPayments).forEach(month=>{
      DB._billPayments[month] = DB._billPayments[month].filter(p=>p.billId!==billId);
    });
  }
}

function unlinkFinanceIncomeSource(sourceId){
  setIncomeSources(getIncomeSources().filter(s=>s.id!==sourceId));
  setIncomeLogs(getIncomeLogs().filter(l=>l.sourceId!==sourceId));
}

async function saveFinance(){
  const item = document.getElementById('finItem').value.trim();
  const amount = parseFloat(document.getElementById('finAmount').value);
  if(!item){ document.getElementById('finItem').focus(); return; }
  if(!amount || amount <= 0){ document.getElementById('finAmount').focus(); return; }
  const time = document.getElementById('finTime').value || '';
  const note = document.getElementById('finNote').value.trim();
  const tag = selectedFinTag;
  const isRecurring = tag === FIN_TAG_RECURRING;
  const isIncomeTag = tag === FIN_TAG_INCOME;
  const dueDay = isRecurring ? parseInt(document.getElementById('finBillDueDay').value, 10) : null;
  if(isRecurring && (!dueDay || dueDay<1 || dueDay>31)){
    document.getElementById('finBillDueDay').focus();
    return;
  }

  const now = new Date();
  let existingBillId = null;
  let existingIncomeSourceId = null;
  let financeId;
  const pickedDate = document.getElementById('finDate').value || currentDate;
  let saveDate = pickedDate;      // วันที่จะบันทึก: วันที่เลือกในฟอร์ม (ทั้งรายการใหม่และแก้ไข)
  let entries = getFinance(saveDate);

  if(finEditId){
    const found = findFinanceById(finEditId);
    if(!found) return;
    const oldDate = found.date;
    const oldEntries = getFinance(oldDate);
    const idx = oldEntries.findIndex(x=>x.id===finEditId);
    if(idx<0) return;
    existingBillId = oldEntries[idx].billId || null;
    existingIncomeSourceId = oldEntries[idx].incomeSourceId || null;
    financeId = oldEntries[idx].id;
    if(existingBillId && !isRecurring){
      const ok = confirm(`"${oldEntries[idx].item}" เป็นรายจ่ายประจำอยู่ การเอา tag นี้ออกจะลบรายการรายจ่ายประจำที่ผูกไว้ด้วย (ประวัติการจ่ายเดือนอื่นจะไม่ถูกลบ) ต้องการดำเนินการต่อหรือไม่?`);
      if(!ok) return;
      unlinkFinanceBill(existingBillId);
      existingBillId = null;
    }
    if(existingIncomeSourceId && !isIncomeTag){
      const ok = confirm(`"${oldEntries[idx].item}" เป็นแหล่งรายรับอยู่ การเอา tag นี้ออกจะลบแหล่งรายรับที่ผูกไว้ด้วย (ประวัติการรับเงินเดือนอื่นจะไม่ถูกลบ) ต้องการดำเนินการต่อหรือไม่?`);
      if(!ok) return;
      unlinkFinanceIncomeSource(existingIncomeSourceId);
      existingIncomeSourceId = null;
    }
    const updatedEntry = {
      ...oldEntries[idx],
      type: selectedFinType,
      item, amount, time,
      paymentMethod: selectedFinPM,
      note, slip: finSlipData,
      tag, billId: existingBillId, incomeSourceId: existingIncomeSourceId,
      updatedAt: now.toISOString()
    };
    if(oldDate === saveDate){
      entries[idx] = updatedEntry;   // ไม่เปลี่ยนวัน — แก้ในตำแหน่งเดิม
    } else {
      oldEntries.splice(idx, 1);     // เปลี่ยนวัน — ย้ายรายการไปวันใหม่
      setFinance(oldDate, oldEntries);
      entries.push(updatedEntry);
    }
  } else {
    financeId = Date.now().toString(36)+Math.random().toString(36).slice(2,6);
    entries.push({
      id: financeId,
      type: selectedFinType,
      item, amount, time,
      paymentMethod: selectedFinPM,
      note, slip: finSlipData,
      tag, billId: null, incomeSourceId: null,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    });
  }

  if(isRecurring){
    const month = saveDate.slice(0,7);
    if(existingBillId){
      const bills = getBills();
      const bIdx = bills.findIndex(b=>b.id===existingBillId);
      if(bIdx>-1) bills[bIdx] = { ...bills[bIdx], name: item, amount, dueDay, paymentMethod: selectedFinPM, note, updatedAt: now.toISOString() };
      setBills(bills);
      const payments = getBillPayments(month);
      const p = payments.find(x=>x.billId===existingBillId);
      if(p){ p.amount = amount; p.image = finSlipData; }
      setBillPayments(month, payments);
    } else {
      const billId = Date.now().toString(36)+Math.random().toString(36).slice(2,6)+'b';
      getBills().push({
        id: billId, name: item, amount, dueDay, active: true, image: '',
        paymentMethod: selectedFinPM, note,
        startMonth: month,
        createdAt: now.toISOString(), updatedAt: now.toISOString()
      });
      const payments = getBillPayments(month);
      payments.push({ billId, paid: true, paidDate: saveDate, paidAmount: amount, financeEntryId: financeId, amount, image: finSlipData });
      setBillPayments(month, payments);
      const idx2 = entries.findIndex(x=>x.id===financeId);
      if(idx2>-1) entries[idx2].billId = billId;
    }
  }

  if(isIncomeTag){
    if(existingIncomeSourceId){
      const sources = getIncomeSources();
      const sIdx = sources.findIndex(s=>s.id===existingIncomeSourceId);
      if(sIdx>-1) sources[sIdx] = { ...sources[sIdx], name: item, amount, paymentMethod: selectedFinPM, note, updatedAt: now.toISOString() };
      setIncomeSources(sources);
      const logs = getIncomeLogs();
      const log = logs.find(l=>l.financeEntryId===financeId);
      if(log){ log.amount = amount; log.paymentMethod = selectedFinPM; log.note = note; }
      else logs.push({ id: Date.now().toString(36)+Math.random().toString(36).slice(2,8), sourceId: existingIncomeSourceId, amount, date: saveDate, time, paymentMethod: selectedFinPM, note, financeEntryId: financeId, createdAt: now.toISOString() });
      setIncomeLogs(logs);
    } else {
      const sourceId = Date.now().toString(36)+Math.random().toString(36).slice(2,6)+'s';
      getIncomeSources().push({
        id: sourceId, name: item, amount, active: true,
        paymentMethod: selectedFinPM, note,
        createdAt: now.toISOString(), updatedAt: now.toISOString()
      });
      const logs = getIncomeLogs();
      logs.push({ id: Date.now().toString(36)+Math.random().toString(36).slice(2,8), sourceId, amount, date: saveDate, time, paymentMethod: selectedFinPM, note, financeEntryId: financeId, createdAt: now.toISOString() });
      setIncomeLogs(logs);
      const idx2 = entries.findIndex(x=>x.id===financeId);
      if(idx2>-1) entries[idx2].incomeSourceId = sourceId;
    }
  }

  setFinance(saveDate, entries);
  closeFinanceModal();
  await writeFile();
  renderFinance();
  if(typeof renderBills === 'function') renderBills();
  if(typeof renderIncomeSources === 'function') renderIncomeSources();
}

async function deleteFinance(id){
  const found = findFinanceById(id);
  const entry = found ? found.entry : null;
  if(entry && entry.billId){
    const ok = confirm(`"${entry.item}" เป็นรายจ่ายประจำอยู่ การลบจะเอารายการรายจ่ายประจำนี้ออกทั้งหมด (รายการที่บันทึกไปแล้วในเดือนอื่นจะยังอยู่เหมือนเดิม) ต้องการลบหรือไม่?`);
    if(!ok) return;
    unlinkFinanceBill(entry.billId);
  }
  if(entry && entry.incomeSourceId){
    const ok = confirm(`"${entry.item}" เป็นแหล่งรายรับอยู่ การลบจะเอาแหล่งรายรับนี้ออกทั้งหมด (ประวัติการรับเงินเดือนอื่นจะยังอยู่เหมือนเดิม) ต้องการลบหรือไม่?`);
    if(!ok) return;
    unlinkFinanceIncomeSource(entry.incomeSourceId);
  }
  const delDate = found ? found.date : currentDate;
  setFinance(delDate, getFinance(delDate).filter(x=>x.id!==id));
  await writeFile();
  renderFinance();
  if(typeof renderBills === 'function') renderBills();
  if(typeof renderIncomeSources === 'function') renderIncomeSources();
}

// ── Payment Method manage modal ──────────────────────
function renderFinPMManageList(){
  const list = document.getElementById('finPMManageList');
  list.innerHTML = FINPM.length
    ? FINPM.map((pm,i)=>`
      <div class="fin-pm-manage-item">
        <span>${esc(pm)}</span>
        <button class="fin-card-btn del" onclick="finPMDelete(${i})" title="ลบ">${finDelSvg}</button>
      </div>`).join('')
    : '<span class="ql-empty">ยังไม่มีรูปแบบการจ่าย</span>';
}

function openFinPMModal(){
  renderFinPMManageList();
  document.getElementById('finPMNewName').value = '';
  document.getElementById('finPMOverlay').style.display = 'flex';
  setTimeout(()=>document.getElementById('finPMNewName').focus(), 60);
}
function closeFinPMModal(){
  const el = document.getElementById('finPMOverlay');
  if(el) el.style.display = 'none';
}
function finPMCloseOnBg(e){ if(e.target===document.getElementById('finPMOverlay')) closeFinPMModal(); }

async function finPMAdd(){
  const input = document.getElementById('finPMNewName');
  const name = input.value.trim();
  if(!name || FINPM.includes(name)){ input.focus(); return; }
  FINPM.push(name);
  saveFinPM();
  renderFinPMManageList();
  renderFinPMRow();
  renderBillPayPMRow();
  renderBillPMRow();
  input.value = '';
  input.focus();
}

async function finPMDelete(i){
  const pm = FINPM[i];
  FINPM.splice(i,1);
  if(selectedFinPM === pm) selectedFinPM = '';
  if(selectedBillPayPM === pm) selectedBillPayPM = '';
  if(selectedBillPM === pm) selectedBillPM = '';
  saveFinPM();
  renderFinPMManageList();
  renderFinPMRow();
  renderBillPayPMRow();
  renderBillPMRow();
}

// ── Cross-device auto-refresh ──────────────────────────
// บัญชีเดียวกันเปิดหลายเครื่อง/แท็บพร้อมกัน: poll ข้อมูลใหม่จาก server เป็นระยะ
// แล้ว re-render ให้อัตโนมัติโดยไม่ต้องกดรีเฟรช (ข้ามถ้ากำลังเปิดฟอร์มแก้ไขอยู่ กันข้อมูลที่พิมพ์ค้างหาย)
const POLL_INTERVAL_MS = 5000;
const EDIT_OVERLAY_IDS = ['overlay','colOverlay','rschedOverlay','qlOverlay','billOverlay','billPayOverlay','incomeSourceOverlay','incomeLogOverlay','finTagOverlay','finOverlay','finPMOverlay'];
function isEditingNow(){
  return EDIT_OVERLAY_IDS.some(id=>{
    const el = document.getElementById(id);
    return el && el.style.display === 'flex';
  });
}

let pollTimer = null;
async function pollServerForUpdates(){
  if(document.hidden || isEditingNow()) return;
  // ถ้าวันเปลี่ยน (เปิดแอปทิ้งไว้ข้ามคืน) ให้ reload หน้าเพื่อรีเซ็ต today + currentDate ให้ถูกต้อง
  if(localDateStr(new Date()) !== today){ window.location.reload(); return; }
  try {
    const r = await fetch(API + '/data', { headers: authHeaders() });
    if(r.status === 401){ sessionExpired(); return; }
    if(!r.ok) return; // เงียบไว้ ลองใหม่รอบถัดไป ไม่อยากขัดจังหวะผู้ใช้ระหว่างทำงาน
    const fresh = await r.json();
    if(JSON.stringify(fresh) === JSON.stringify(DB)) return; // ไม่มีอะไรเปลี่ยน
    DB = fresh;
    const key = dbCacheKey();
    if(key) localStorage.setItem(key, JSON.stringify(DB));
    render();
    loadDL();
    renderDL();
    loadQLTags();
    loadQL();
    renderQlFilterBar();
    renderQL();
    loadFinPM();
    loadFinTags();
    renderFinance();
    showStatus('🔄 อัปเดตข้อมูลใหม่จากอุปกรณ์อื่น', 'ok');
  } catch(_){
    // network hiccup ระหว่าง poll - ข้ามไปเงียบๆ ลองใหม่รอบถัดไป
  }
}
function startAutoRefresh(){
  if(pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(pollServerForUpdates, POLL_INTERVAL_MS);
  document.addEventListener('visibilitychange', () => { if(!document.hidden) pollServerForUpdates(); });
}

// ── Weather ──
function loadWeather() {
  const WX_KEY = 'wx_cache';
  // show placeholder immediately
  const sbW0 = document.getElementById('dlWeather');
  if (sbW0 && !sbW0.innerHTML.trim()) {
    sbW0.innerHTML = `<span style="font-size:22px;opacity:.4">⛅</span><div><div class="weather-temp" style="color:var(--text-3)">--°C</div><div class="weather-loc" style="color:var(--text-3)">กำลังโหลด...</div></div>`;
  }
  const ICONS = {
    sun: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`,
    cloud: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v2M4.93 4.93l1.41 1.41M20 12h2M17.66 6.34l-1.41 1.41"/><circle cx="12" cy="12" r="3"/><path d="M20 17.58A5 5 0 0 0 18 8h-1.26A8 8 0 1 0 4 16.25"/><path d="M8 19a4 4 0 1 0 8 0"/></svg>`,
    rain: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 17.58A5 5 0 0 0 18 8h-1.26A8 8 0 1 0 4 16.25"/><line x1="8" y1="19" x2="8" y2="21"/><line x1="8" y1="23" x2="8" y2="25"/><line x1="12" y1="18" x2="12" y2="20"/><line x1="16" y1="19" x2="16" y2="21"/></svg>`,
    fog: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 17.58A5 5 0 0 0 18 8h-1.26A8 8 0 1 0 4 16.25"/><line x1="4" y1="20" x2="20" y2="20"/><line x1="6" y1="23" x2="18" y2="23"/></svg>`,
    thunder: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M19 16.9A5 5 0 0 0 18 7h-1.26a8 8 0 1 0-11.62 9"/><polyline points="13 11 9 17 15 17 11 23"/></svg>`,
    snow: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 17.58A5 5 0 0 0 18 8h-1.26A8 8 0 1 0 4 16.25"/><line x1="8" y1="20" x2="8" y2="24"/><line x1="12" y1="20" x2="12" y2="24"/><line x1="16" y1="20" x2="16" y2="24"/></svg>`,
  };
  function codeToMeta(code) {
    if (code === 0)                                    return { icon: ICONS.sun,    label: 'ฟ้าใส' };
    if ([1,2,3].includes(code))                        return { icon: ICONS.cloud,  label: 'มีเมฆ' };
    if ([45,48].includes(code))                        return { icon: ICONS.fog,    label: 'หมอก' };
    if ([51,53,55,61,63,65,80,81,82].includes(code))   return { icon: ICONS.rain,   label: 'ฝนตก' };
    if ([71,73,75,77].includes(code))                  return { icon: ICONS.snow,   label: 'หิมะ' };
    if ([95,96,99].includes(code))                     return { icon: ICONS.thunder, label: 'ฟ้าผ่า' };
    return { icon: ICONS.cloud, label: 'มีเมฆบางส่วน' };
  }
  function render(temp, code) {
    const { icon, label } = codeToMeta(code);
    const html = `<span class="dl-weather-icon">${icon}</span><span class="dl-weather-temp">${Math.round(temp)}°</span>`;
    // sidebar weather card
    const sbW = document.getElementById('dlWeather');
    if (sbW) {
      sbW.innerHTML = `
        <span style="font-size:22px">${icon}</span>
        <div>
          <div class="weather-temp">${Math.round(temp)}°C</div>
          <div class="weather-loc" id="wxLocLabel">${label}</div>
        </div>`;
      // reverse-geocode city name
      if (navigator.geolocation && !sbW.dataset.city) {
        navigator.geolocation.getCurrentPosition(pos => {
          fetch(`https://nominatim.openstreetmap.org/reverse?lat=${pos.coords.latitude}&lon=${pos.coords.longitude}&format=json`)
            .then(r=>r.json()).then(d=>{
              const city = d.address?.city || d.address?.state || d.address?.country || label;
              const loc = document.getElementById('wxLocLabel');
              if(loc) loc.textContent = city;
              sbW.dataset.city = city;
            }).catch(()=>{});
        }, ()=>{});
      }
    }
    const topbarEl = document.getElementById('dlWeatherTopbar');
    if (topbarEl) { topbarEl.title = label; topbarEl.innerHTML = html; }
  }
  // Check cache
  try {
    const cached = JSON.parse(sessionStorage.getItem(WX_KEY) || 'null');
    if (cached && (Date.now() - cached.ts) < 30 * 60 * 1000) {
      render(cached.temp, cached.code);
      return;
    }
  } catch(_) {}
  if (!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(async pos => {
    const { latitude: lat, longitude: lon } = pos.coords;
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weathercode&temperature_unit=celsius&wind_speed_unit=kmh&timezone=auto`;
      const r = await fetch(url);
      if (!r.ok) return;
      const data = await r.json();
      const temp = data.current.temperature_2m;
      const code = data.current.weathercode;
      sessionStorage.setItem(WX_KEY, JSON.stringify({ ts: Date.now(), temp, code }));
      render(temp, code);
    } catch(_) {}
  }, () => {});
}

// ── App version ──
async function loadAppVersion(){
  try {
    const r = await fetch('/version.json');
    if(!r.ok) return;
    const data = await r.json();
    const el = document.getElementById('appVersion');
    if(el && data.version) el.textContent = 'v' + data.version;
  } catch(e){}
}

async function openChangelogModal() {
  const body = document.getElementById('changelogBody');
  if (body && !body.dataset.loaded) {
    body.innerHTML = '<div style="padding:1rem;color:var(--text-3)">กำลังโหลด...</div>';
    try {
      const r = await fetch('/CHANGELOG.md');
      if (r.ok) {
        const md = await r.text();
        // Parse sections by ## [version] header
        const sections = md.split(/^## \[/m).slice(1);
        const badges = { Fixed:'cl-badge-patch', Changed:'cl-badge-minor', Added:'cl-badge-minor', Security:'cl-badge-patch', Removed:'cl-badge-patch' };
        body.innerHTML = sections.map(s => {
          const header = s.match(/^([^\]]+)\] — (\d{4}-\d{2}-\d{2})/);
          if (!header) return '';
          const ver = header[1], date = header[2];
          const rest = s.slice(header[0].length + 1);
          // group by ### subheader
          const groups = rest.split(/^### /m).slice(1);
          const content = groups.map(g => {
            const [name, ...lines] = g.split('\n');
            const items = lines.filter(l => l.trim().startsWith('-')).map(l => `<li>${esc(l.replace(/^- /,'').trim())}</li>`).join('');
            const badgeClass = badges[name.trim()] || 'cl-badge-patch';
            return `<div class="cl-badge ${badgeClass}">${esc(name.trim())}</div><ul class="cl-list">${items}</ul>`;
          }).join('');
          return `<div class="cl-entry"><div class="cl-version-tag">v${esc(ver)} <span class="cl-date">${esc(date)}</span></div>${content}</div>`;
        }).join('');
        body.dataset.loaded = '1';
      }
    } catch(_) {}
    if (!body.dataset.loaded) {
      // fallback legacy hardcoded
      body.innerHTML = `
      <div class="cl-entry">
        <div class="cl-version-tag">v1.1.1 <span class="cl-date">2026-07-09</span></div>
        <div class="cl-badge cl-badge-patch">UI Polish</div>
        <ul class="cl-list">
          <li>col-header: เพิ่ม padding-top 7px</li>
          <li>Changelog modal: scroll ได้แล้ว</li>
          <li>Date strip bar: แสดงบน desktop แล้ว</li>
        </ul>
      </div>
      <div class="cl-entry">
        <div class="cl-version-tag">v1.1.0 <span class="cl-date">2026-07-09</span></div>
        <div class="cl-badge cl-badge-minor">Changed</div>
        <ul class="cl-list">
          <li>ลบ weather background animation ออก (ทำให้แอปพัง)</li>
          <li>ลบ &lt;canvas id="weatherBg"&gt; ออกจาก HTML</li>
          <li>Weather icon+อุณหภูมิใน topbar ยังทำงานได้ปกติ</li>
        </ul>
      </div>
      <div class="cl-entry">
        <div class="cl-version-tag">v1.0.12 <span class="cl-date">2026-07-09</span></div>
        <div class="cl-badge cl-badge-patch">Fixed</div>
        <ul class="cl-list">
          <li>Service worker ค้างกับ version เก่า — เปลี่ยนเป็น network-first strategy</li>
          <li>Bump cache เป็น trackingtask-v3</li>
        </ul>
      </div>
      <div class="cl-entry">
        <div class="cl-version-tag">v1.0.9 <span class="cl-date">2026-07-09</span></div>
        <div class="cl-badge cl-badge-minor">Aurora UI</div>
        <ul class="cl-list">
          <li>CSS rewrite สะอาด 5 sections (~920 บรรทัด)</li>
          <li>Finance: 2-column layout, donut chart, bills mini widget</li>
          <li>Note filter chips มีจุดสี, left accent strip</li>
          <li>Sidebar class mapping ครบ, Admin badge เป็น indigo</li>
        </ul>
      </div>
      <div class="cl-entry">
        <div class="cl-version-tag">v1.0.6–1.0.8 <span class="cl-date">2026-07-08</span></div>
        <div class="cl-badge cl-badge-minor">Aurora Remodel</div>
        <ul class="cl-list">
          <li>Aurora UI redesign ทุก tab: Daily Task, Note, Finance, Admin</li>
          <li>Stat cards gradient, sidebar active gradient, Kanban column accent strips</li>
          <li>CSS custom properties: --bg #0f1117, --accent indigo-violet gradient</li>
        </ul>
      </div>
      <div class="cl-entry">
        <div class="cl-version-tag">v1.0.5 <span class="cl-date">2026-07-08</span></div>
        <div class="cl-badge cl-badge-patch">Changed</div>
        <ul class="cl-list">
          <li>ลบ weather canvas animation ออก (รุ่นแรก)</li>
          <li>Background เป็น static Aurora radial gradient</li>
        </ul>
      </div>
      <div class="cl-entry">
        <div class="cl-version-tag">v1.0.2 <span class="cl-date">2026-07-08</span></div>
        <div class="cl-badge cl-badge-minor">Added</div>
        <ul class="cl-list">
          <li>Weather wallpaper animation (canvas-based)</li>
          <li>Frosted glass UI ทั่วทั้งแอป</li>
          <li>Weather icon ใน mobile topbar</li>
          <li>Mood icons SVG 6 แบบ พร้อม springy animation</li>
          <li>Changelog modal (version badge clickable)</li>
          <li>Stale-while-revalidate + 60s auto-refresh</li>
        </ul>
      </div>
      <div class="cl-entry">
        <div class="cl-version-tag">v1.0.1 <span class="cl-date">2026-07-08</span></div>
        <div class="cl-badge cl-badge-patch">Security Patch</div>
        <ul class="cl-list">
          <li>Rate-limit brute-force บน PIN reset (ล็อคหลัง 5 ครั้ง)</li>
          <li>เปลี่ยน OTP ให้ใช้ crypto.getRandomValues() แทน Math.random()</li>
          <li>แก้ XSS: ครอบ esc() บน img slip/image ใน Finance</li>
          <li>sanitizeRichHTML บล็อก external URL ใน &lt;img&gt;</li>
          <li>เพิ่ม Content-Security-Policy headers</li>
          <li>ลบ admin username hardcode ออกจาก frontend JS</li>
          <li>กัน wrangler.toml ไม่ให้ push ขึ้น public repo</li>
          <li>Bump service worker cache เป็น v2</li>
        </ul>
      </div>
      <div class="cl-entry">
        <div class="cl-version-tag">v1.0.0 <span class="cl-date">2026-07-08</span></div>
        <div class="cl-badge cl-badge-major">Initial Release</div>
        <ul class="cl-list">
          <li>Daily task management พร้อม to-do list และสถานะ</li>
          <li>Note system พร้อม rich content, รูปภาพ และ pagination 20 รายการ</li>
          <li>Finance module: บันทึกรายจ่ายและรายรับ</li>
          <li>Image compression รับประกัน 500 KB</li>
          <li>PWA: ติดตั้งได้, รองรับ offline, service worker</li>
          <li>UI mobile-first ภาษาไทย</li>
          <li>Cloudflare Workers backend + KV storage</li>
          <li>Admin panel สำหรับจัดการผู้ใช้</li>
        </ul>
      </div>
    `;
    }
  }
  document.getElementById('changelogModal').style.display = 'flex';
}

function closeChangelogModal() {
  document.getElementById('changelogModal').style.display = 'none';
}

// ── Timeline ─────────────────────────────────────────
let TL_BLOCKS = {}; // { dateKey: [{id,title,startMin,endMin,color}] }
const TL_SLOT = 48;  // px per 30 min
const TL_SLOTS = 48; // 24h × 2

function getTLBlocks(d){ return (TL_BLOCKS[d] || []); }
function setTLBlocks(d, arr){ TL_BLOCKS[d] = arr; }
function tlNextId(){ return Date.now().toString(36) + Math.random().toString(36).slice(2,5); }
function tlOverlaps(a,b){ return a.startMin < b.endMin && a.endMin > b.startMin; }
function tlHasConflict(candidate, excludeId, dateKey){
  return getTLBlocks(dateKey).some(b => b.id !== excludeId && tlOverlaps(b, candidate));
}
function tlMinsToTop(m){ return (m/30)*TL_SLOT; }
function tlMinsToH(m){ return (m/30)*TL_SLOT; }
function tlSnapToSlot(px){ return Math.round(px/TL_SLOT)*TL_SLOT; }
function tlPxToMins(px){ return Math.round(px/TL_SLOT)*30; }
function tlFmtTime(mins){
  const h=Math.floor(mins/60), m=mins%60;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
}
function tlParseTime(s){ const [h,m]=s.split(':').map(Number); return h*60+m; }

function loadTL(){
  const fromFile = (DB._timeline && typeof DB._timeline==='object') ? DB._timeline : {};
  const lsKey = userKey('tlBlocks');
  let fromLS = {};
  try { fromLS = JSON.parse(localStorage.getItem(lsKey)||'{}'); } catch(_){}
  TL_BLOCKS = Object.assign({}, fromLS, fromFile);
}
function saveTL(){
  localStorage.setItem(userKey('tlBlocks'), JSON.stringify(TL_BLOCKS));
  if(!DB._timeline) DB._timeline = {};
  Object.assign(DB._timeline, TL_BLOCKS);
  writeFile();
}

const TL_COLORS = [
  {id:'indigo',bg:'rgba(99,102,241,.85)',text:'#fff'},
  {id:'green', bg:'rgba(34,197,94,.82)', text:'#fff'},
  {id:'amber', bg:'rgba(245,158,11,.85)',text:'#fff'},
  {id:'rose',  bg:'rgba(244,63,94,.82)', text:'#fff'},
  {id:'teal',  bg:'rgba(20,184,166,.82)',text:'#fff'},
  {id:'blue',  bg:'rgba(96,165,250,.85)',text:'#fff'},
];

function tlColorById(id){ return TL_COLORS.find(c=>c.id===id) || TL_COLORS[0]; }

function renderTimeline(){
  const canvas = document.getElementById('tlCanvas');
  if(!canvas) return;

  // Build grid if not already built
  if(!canvas.dataset.gridBuilt){ tlBuildGrid(); canvas.dataset.gridBuilt='1'; }

  // Update date label
  const lbl = document.getElementById('tlDateLabel');
  if(lbl){
    const d = new Date(currentDate+'T00:00:00');
    lbl.textContent = d.toLocaleDateString('th-TH',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
    lbl.style.color = currentDate===today ? 'var(--accent)' : 'var(--text)';
  }

  // Remove old blocks
  canvas.querySelectorAll('.tl-block').forEach(e=>e.remove());

  // Update now-line
  const nowLine = document.getElementById('tlNowLine');
  if(nowLine){
    if(currentDate===today){
      const d=new Date(), mins=d.getHours()*60+d.getMinutes();
      nowLine.style.display=''; nowLine.style.top=tlMinsToTop(mins)+'px';
    } else {
      nowLine.style.display='none';
    }
  }

  // Render blocks
  getTLBlocks(currentDate).forEach(b=>{
    const col = tlColorById(b.color);
    const el = document.createElement('div');
    el.className = 'tl-block';
    el.dataset.id = b.id;
    el.style.top = tlMinsToTop(b.startMin)+'px';
    el.style.height = tlMinsToH(b.endMin-b.startMin)+'px';
    el.style.background = col.bg;
    el.style.color = col.text;
    el.innerHTML = `
      <div class="tl-block-title">${esc(b.title)}</div>
      <div class="tl-block-time">${tlFmtTime(b.startMin)} – ${tlFmtTime(b.endMin)}</div>
      <button class="tl-block-del" onclick="tlDeleteBlock('${b.id}')" title="ลบ">✕</button>
      <div class="tl-block-resize" data-id="${b.id}"></div>
    `;
    el.addEventListener('dblclick', e=>{ e.stopPropagation(); tlOpenModal(b.id); });
    el.addEventListener('mousedown', e=>{
      if(e.target.classList.contains('tl-block-resize')||e.target.classList.contains('tl-block-del')) return;
      e.preventDefault();
      const origTop = tlMinsToTop(b.startMin);
      const duration = b.endMin - b.startMin;
      tlDragState = { type:'move', blockId:b.id, startY:e.clientY, origTop, duration };
      el.classList.add('tl-dragging');
    });
    el.querySelector('.tl-block-resize').addEventListener('mousedown', e=>{
      e.preventDefault(); e.stopPropagation();
      tlDragState = { type:'resize', blockId:b.id, startY:e.clientY, origH:tlMinsToH(b.endMin-b.startMin), startMin:b.startMin };
    });
    canvas.appendChild(el);
  });
}

let tlDragState = null;

function tlInitDrag(){
  const canvas = document.getElementById('tlCanvas');
  if(!canvas || canvas.dataset.dragBound) return;
  canvas.dataset.dragBound = '1';

  const TL_TOTAL = TL_SLOT * TL_SLOTS;

  canvas.addEventListener('mousedown', e=>{
    const isCanvasItself = e.target === canvas;
    const isHourLine = e.target.classList.contains('tl-hour-line');
    const isGhost = e.target.classList.contains('tl-ghost');
    if(!isCanvasItself && !isHourLine && !isGhost) return;
    e.preventDefault();
    const wrap = document.getElementById('tlWrap');
    const rect = canvas.getBoundingClientRect();
    const y = e.clientY - rect.top + wrap.scrollTop;
    const snapY = tlSnapToSlot(y);
    tlDragState = { type:'create', startY:e.clientY, origTop:snapY, ghostTop:snapY, ghostH:TL_SLOT };
    const ghost = document.getElementById('tlGhost');
    if(ghost){ ghost.style.display=''; ghost.style.top=snapY+'px'; ghost.style.height=TL_SLOT+'px'; }
  });

  document.addEventListener('mousemove', e=>{
    if(!tlDragState) return;
    const TL_TOTAL_H = TL_SLOT * TL_SLOTS;
    if(tlDragState.type==='create'){
      const dy = e.clientY - tlDragState.startY;
      const ghostH = Math.max(TL_SLOT, tlSnapToSlot(Math.abs(dy))||TL_SLOT);
      const top = dy>=0 ? tlDragState.origTop : Math.max(0, tlSnapToSlot(tlDragState.origTop+dy));
      tlDragState.ghostTop=top; tlDragState.ghostH=ghostH;
      const ghost = document.getElementById('tlGhost');
      if(ghost){ ghost.style.top=top+'px'; ghost.style.height=ghostH+'px'; }
    }
    if(tlDragState.type==='move'){
      const dy = e.clientY - tlDragState.startY;
      const newTop = Math.max(0, Math.min(TL_TOTAL_H - tlMinsToH(tlDragState.duration), tlSnapToSlot(tlDragState.origTop+dy)));
      const el = document.getElementById('tlCanvas')?.querySelector(`[data-id="${tlDragState.blockId}"]`);
      if(el) el.style.top = newTop+'px';
      tlDragState.currentTop = newTop;
    }
    if(tlDragState.type==='resize'){
      const dy = e.clientY - tlDragState.startY;
      const newH = Math.max(TL_SLOT, tlSnapToSlot(tlDragState.origH+dy));
      const maxH = TL_TOTAL_H - tlMinsToTop(tlDragState.startMin);
      const el = document.getElementById('tlCanvas')?.querySelector(`[data-id="${tlDragState.blockId}"]`);
      if(el) el.style.height = Math.min(newH,maxH)+'px';
      tlDragState.currentH = Math.min(newH,maxH);
    }
  });

  document.addEventListener('mouseup', e=>{
    if(!tlDragState) return;
    const ghost = document.getElementById('tlGhost');
    if(tlDragState.type==='create'){
      if(ghost) ghost.style.display='none';
      const top = tlDragState.ghostTop ?? tlDragState.origTop;
      const h   = tlDragState.ghostH ?? TL_SLOT;
      const startMin = tlPxToMins(top), endMin = startMin + tlPxToMins(h);
      if(endMin > startMin && !tlHasConflict({startMin,endMin}, null, currentDate)){
        tlOpenModal(null, startMin, endMin);
      }
    } else if(tlDragState.type==='move'){
      const newTop = tlDragState.currentTop ?? 0;
      const newStart = tlPxToMins(newTop);
      const arr = getTLBlocks(currentDate);
      const blk = arr.find(b=>b.id===tlDragState.blockId);
      if(blk){
        const newEnd = newStart + (blk.endMin - blk.startMin);
        if(!tlHasConflict({startMin:newStart,endMin:newEnd}, tlDragState.blockId, currentDate)){
          blk.startMin=newStart; blk.endMin=newEnd;
          setTLBlocks(currentDate, arr);
          saveTL();
        }
      }
      const el = document.getElementById('tlCanvas')?.querySelector(`[data-id="${tlDragState.blockId}"]`);
      if(el) el.classList.remove('tl-dragging');
      renderTimeline();
    } else if(tlDragState.type==='resize'){
      const h = tlDragState.currentH ?? TL_SLOT;
      const arr = getTLBlocks(currentDate);
      const blk = arr.find(b=>b.id===tlDragState.blockId);
      if(blk){
        const newEnd = blk.startMin + tlPxToMins(h);
        if(newEnd > blk.startMin && !tlHasConflict({startMin:blk.startMin,endMin:newEnd}, blk.id, currentDate)){
          blk.endMin = newEnd;
          setTLBlocks(currentDate, arr);
          saveTL();
        }
      }
      renderTimeline();
    }
    tlDragState = null;
  });
}

let tlEditingId = null;
let tlSelColor = 'indigo';

function tlOpenModal(id=null, startMin=null, endMin=null){
  tlEditingId = id;
  const blk = id ? getTLBlocks(currentDate).find(b=>b.id===id) : null;
  document.getElementById('tlModalTitle').textContent = id ? 'แก้ไขกิจกรรม' : 'เพิ่มกิจกรรม';
  document.getElementById('tlFTitle').value = blk ? blk.title : '';
  document.getElementById('tlFStart').value = tlFmtTime(blk ? blk.startMin : (startMin ?? 9*60));
  document.getElementById('tlFEnd').value   = tlFmtTime(blk ? blk.endMin   : (endMin   ?? 10*60));
  tlSelColor = blk ? blk.color : 'indigo';
  document.getElementById('tlModalError').style.display='none';
  tlBuildColorRow();
  document.getElementById('tlModalBg').style.display='flex';
  setTimeout(()=>document.getElementById('tlFTitle').focus(), 80);
}

function tlCloseModal(){
  document.getElementById('tlModalBg').style.display='none';
  tlEditingId=null;
}

function tlBuildColorRow(){
  const row = document.getElementById('tlColorRow');
  if(!row) return;
  row.innerHTML = '';
  TL_COLORS.forEach(c=>{
    const chip = document.createElement('div');
    chip.className = 'tl-color-chip' + (tlSelColor===c.id ? ' tl-sel' : '');
    chip.style.background = c.bg.replace(/[\d.]+\)$/,'1)');
    chip.dataset.id = c.id;
    chip.onclick = ()=>{
      tlSelColor = c.id;
      row.querySelectorAll('.tl-color-chip').forEach(ch=>ch.classList.toggle('tl-sel', ch.dataset.id===c.id));
    };
    row.appendChild(chip);
  });
}

function tlSaveModal(){
  const title = document.getElementById('tlFTitle').value.trim();
  const startMin = tlParseTime(document.getElementById('tlFStart').value);
  const endMin   = tlParseTime(document.getElementById('tlFEnd').value);
  const errEl = document.getElementById('tlModalError');
  if(!title){ errEl.textContent='กรุณาใส่ชื่อกิจกรรม'; errEl.style.display=''; return; }
  if(endMin<=startMin){ errEl.textContent='เวลาสิ้นสุดต้องมากกว่าเวลาเริ่ม'; errEl.style.display=''; return; }
  if(tlHasConflict({startMin,endMin}, tlEditingId, currentDate)){
    errEl.textContent='เวลาทับซ้อนกับกิจกรรมอื่น'; errEl.style.display=''; return;
  }
  const arr = getTLBlocks(currentDate);
  if(tlEditingId){
    const blk = arr.find(b=>b.id===tlEditingId);
    if(blk){ blk.title=title; blk.startMin=startMin; blk.endMin=endMin; blk.color=tlSelColor; }
  } else {
    arr.push({ id:tlNextId(), title, startMin, endMin, color:tlSelColor });
  }
  setTLBlocks(currentDate, arr);
  saveTL();
  renderTimeline();
  tlCloseModal();
}

function tlDeleteBlock(id){
  setTLBlocks(currentDate, getTLBlocks(currentDate).filter(b=>b.id!==id));
  saveTL();
  renderTimeline();
}

function tlScrollToNow(){
  const wrap = document.getElementById('tlWrap');
  if(!wrap) return;
  const d=new Date(), mins=d.getHours()*60+d.getMinutes();
  const top=(mins/30)*TL_SLOT - wrap.clientHeight/2;
  wrap.scrollTop = Math.max(0,top);
}

function tlBuildGrid(){
  const labelsEl = document.getElementById('tlLabels');
  const canvas = document.getElementById('tlCanvas');
  if(!labelsEl || !canvas) return;
  labelsEl.innerHTML = '';
  canvas.querySelectorAll('.tl-hour-line').forEach(e=>e.remove());
  for(let s=0; s<TL_SLOTS; s++){
    const h=Math.floor(s/2), m=s%2===0?'00':'30';
    const div=document.createElement('div');
    div.className='tl-label'+(m==='00'?' tl-label-hour':'');
    div.textContent = m==='00' ? `${String(h).padStart(2,'0')}:00` : '';
    labelsEl.appendChild(div);
  }
  for(let h=1;h<24;h++){
    const line=document.createElement('div');
    line.className='tl-hour-line';
    line.style.top=(h*TL_SLOT*2)+'px';
    canvas.appendChild(line);
  }
}

// ── Initial render (ต้องอยู่ท้ายสุด เพื่อให้ const ทุกตัวถูก initialize ก่อน) ──
loadCols();
renderBoard();
if(typeof applyMenuPermissions === 'function') applyMenuPermissions();
loadFile().then(() => {
  render();
  loadDL();
  renderDL();
  loadQLTags();
  loadQL();
  renderQlFilterBar();
  renderQL();
  loadFinPM();
  loadFinTags();
  renderFinance();
  loadTL();
  startAutoRefresh();
  // เปิดแท็บตาม ?tab= ใน URL ถ้ามี (เช่น กลับมาจาก Admin Panel)
  const tabParam = new URLSearchParams(location.search).get('tab');
  if(['task','daily','tool','finance','timeline'].includes(tabParam)) switchTab(tabParam);
});
// ── Weather Background Animation removed ──────────────────────────────────────
loadAppVersion();
loadWeather();
