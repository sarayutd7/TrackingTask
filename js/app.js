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

async function loadFile(){
  try {
    const r = await fetch(API + '/data', { headers: authHeaders() });
    if(r.status === 401){ sessionExpired(); return; }
    if(r.status === 403){
      const data = await r.json().catch(()=>({}));
      if(data.error === 'PIN_RESET_REQUIRED'){ showResetPinScreen(); return; }
    }
    if(r.ok) DB = await r.json();
    else DB = {};
    const key = dbCacheKey();
    if(key) localStorage.setItem(key, JSON.stringify(DB)); // local backup เฉพาะ account นี้
  } catch(_){
    const key = dbCacheKey();
    try { DB = key ? JSON.parse(localStorage.getItem(key)||'{}') : {}; } catch(_){ DB = {}; }
    showStatus('⚠️ โหลดจาก browser (offline)', 'warn');
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
function applyTheme(t){
  document.documentElement.setAttribute('data-theme', t);
  localStorage.setItem(THEME_KEY, t);
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
}
function prevDay(){ shiftDay(-1); }
function nextDay(){ shiftDay(+1); }

// ── Init ────────────────────────────────────────────
const dp = document.getElementById('datePicker');
dp.value = today;
dp.addEventListener('change', e => { currentDate = e.target.value; render(); renderDL(); renderFinance(); });

// โหลด localStorage ไว้ก่อน จนกว่า server จะตอบ (เฉพาะของ account ที่ login อยู่เท่านั้น)
try {
  const cacheKey = dbCacheKey();
  DB = cacheKey ? JSON.parse(localStorage.getItem(cacheKey)||'{}') : {};
} catch(_){ DB = {}; }
// render() ถูกย้ายไปท้าย script เพื่อให้ const declarations ทั้งหมดถูก initialize ก่อน

// ── Tab switching ────────────────────────────────────
function switchTab(tab){
  document.getElementById('tabTask').style.display    = tab==='task'    ? '' : 'none';
  document.getElementById('tabTool').style.display    = tab==='tool'    ? '' : 'none';
  document.getElementById('tabFinance').style.display = tab==='finance' ? '' : 'none';
  document.getElementById('tabBtnTask').classList.toggle('active',    tab==='task');
  document.getElementById('tabBtnTool').classList.toggle('active',    tab==='tool');
  document.getElementById('tabBtnFinance').classList.toggle('active', tab==='finance');
  if(tab==='tool')    renderDL();
  if(tab==='finance'){ renderFinance(); if(finSubTab==='bills') renderBills(); }
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
  } else {
    document.getElementById('modalTitle').textContent = 'เพิ่มงานใหม่';
    document.getElementById('taskTitle').value = '';
    rteClear('taskNoteBody');
    document.getElementById('taskTimeStart').value = '';
    document.getElementById('taskTimeEnd').value   = '';
    selectStatus(status || COLS[0]?.id || 'todo');
    clearPriority();
  }
  document.getElementById('overlay').style.display='flex';
  setTimeout(()=>document.getElementById('taskTitle').focus(),60);
}

function closeModal(){ document.getElementById('overlay').style.display='none'; editId=null; }
function closeOnBg(e){ if(e.target===document.getElementById('overlay')) closeModal(); }

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
  Object.values(DB).forEach(arr=>{ taskCount+=arr.filter(t=>t.status===editColId).length; });
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
      tasks[idx].updatedAt = new Date().toISOString();
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

const linkSvg = `<svg width="10" height="10" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`;
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
  // กำหนดจำนวน column ให้เต็มจอ เท่ากันทุก column
  board.style.gridTemplateColumns = `repeat(${COLS.length}, 1fr)`;
  board.innerHTML = COLS.map(col=>`
    <div class="col" id="col-${esc(col.id)}">
      <div class="col-header">
        <div class="col-dot ${col.color}"></div>
        <span class="col-title">${esc(col.name)}</span>
        <span class="col-count ${col.color}" id="badge-${esc(col.id)}">0</span>
        <button class="col-edit-btn" onclick="event.stopPropagation();openColEdit('${esc(col.id)}')" title="แก้ไข column">
          <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>
        </button>
      </div>
      <div id="list-${esc(col.id)}"></div>
      <button class="add-btn" onclick="openModal('${esc(col.id)}')">
        <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        เพิ่มงาน
      </button>
    </div>
  `).join('');
}

// ── Stats rendering ───────────────────────────────────
function renderStats(g){
  const el = document.getElementById('statsGrid');
  if(!el||!COLS.length) return;
  const icons = {
    purple:`<svg width="18" height="18" fill="none" stroke="var(--accent)" stroke-width="1.8" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke-dasharray="3 3"/></svg>`,
    amber: `<svg width="18" height="18" fill="none" stroke="var(--amber)"  stroke-width="1.8" viewBox="0 0 24 24"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>`,
    green: `<svg width="18" height="18" fill="none" stroke="var(--green)"  stroke-width="1.8" viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
    blue:  `<svg width="18" height="18" fill="none" stroke="var(--blue)"   stroke-width="1.8" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>`,
    pink:  `<svg width="18" height="18" fill="none" stroke="var(--pink)"   stroke-width="1.8" viewBox="0 0 24 24"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`,
    teal:  `<svg width="18" height="18" fill="none" stroke="var(--teal)"   stroke-width="1.8" viewBox="0 0 24 24"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>`,
    gray:  `<svg width="18" height="18" fill="none" stroke="var(--gray)"   stroke-width="1.8" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 9h6M9 12h6M9 15h4"/></svg>`,
  };
  el.style.gridTemplateColumns = `repeat(${COLS.length}, 1fr)`;
  el.innerHTML = COLS.map(col=>{
    const count = (g[col.id]||[]).length;
    return `
    <div class="stat-card">
      <div class="stat-icon ${col.color}">${icons[col.color]||icons.gray}</div>
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
    ? `<svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.17"/></svg>`
    : `<svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg>`;

  const priorityLabels = {critical:'Critical',high:'High',medium:'Medium',low:'Low',lowest:'Lowest'};
  const priorityBadge = t.priority && priorityLabels[t.priority]
    ? `<span class="priority-badge ${t.priority}">${priorityLabels[t.priority]}</span>`
    : '';

  const clockSvg = `<svg width="10" height="10" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;
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
        ${!isLast ? `<button class="icon-btn sched" title="ย้ายไปวันอื่น" onclick="openReschedule('${t.id}')"><svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="8" y1="14" x2="8" y2="14" stroke-linecap="round" stroke-width="2.5"/><path d="M16 14l-3 3 3 3"/><line x1="13" y1="17" x2="19" y2="17"/></svg></button>` : ''}
        <button class="icon-btn move" title="${esc(moveTitle)}" onclick="moveTask('${t.id}','${nextId}')">${moveSvg}</button>
        <button class="icon-btn del" title="ลบ" onclick="deleteTask('${t.id}')">
          <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
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
  bar.innerHTML =
    `<button class="pf-btn pf-all${allActive?' pf-active':''}" onclick="setPriorityFilter('')">
       ทั้งหมด<span class="pf-count">${tasks.length}</span>
     </button>` +
    PRIORITIES.filter(p=>counts[p.id]>0).map(p=>{
      const active = activePriorityFilter===p.id;
      return `<button class="pf-btn${active?' pf-active':''}" data-p="${p.id}" onclick="setPriorityFilter('${p.id}')">
        ${p.dot} ${p.label}<span class="pf-count">${counts[p.id]}</span>
      </button>`;
    }).join('');
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
  document.getElementById('dateDisplay').innerHTML =
    label + (isToday?'<span class="date-today">วันนี้</span>':'');
}

document.addEventListener('keydown', e=>{
  if(e.key==='Escape'){ closeModal(); qlClose(); colClose(); rschedClose(); closeFinanceModal(); closeFinPMModal(); qlReadClose(); }
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
function saveDL(){
  if(!DB._logs) DB._logs = {};
  Object.assign(DB._logs, DL);
  const key = userKey(DL_KEY); if(key) localStorage.setItem(key, JSON.stringify(DL));
  writeFile();
}

function renderDL(){
  const log = DL[currentDate] || {};
  document.getElementById('dlBlocker').value   = log.blocker   || '';
  document.getElementById('dlHighlight').value = log.highlight || '';
  document.getElementById('dlNote').value      = log.note      || '';
  ['dlBlocker','dlHighlight','dlNote'].forEach(id => dlResize(document.getElementById(id)));
  document.getElementById('dlMoodBadge').textContent = log.mood || '';
  document.querySelectorAll('#dlMoodRow .dl-mood-pill').forEach(btn=>{
    btn.classList.toggle('active', btn.dataset.mood === log.mood);
  });
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
  document.getElementById('dlBody').classList.toggle('collapsed');
  document.getElementById('dlChevron').classList.toggle('closed');
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

function qlSetSearch(value){
  qlSearchQuery = value.trim().toLowerCase();
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
  const allBtn = `<button class="ql-filter-btn${qlActiveFilter==='all'?' active':''}" data-filter="all" onclick="qlSetFilter('all')">ทั้งหมด</button>`;
  const tagBtns = QL_TAGS.map(tag=>`<button class="ql-filter-btn${qlActiveFilter===tag.id?' active':''}" data-filter="${esc(tag.id)}" onclick="qlSetFilter('${tag.id}')">${esc(tag.label)}</button>`).join('');
  bar.innerHTML = allBtn + tagBtns;
}

function selectQlTag(tag){
  selectedQlTag = (selectedQlTag === tag) ? '' : tag; // toggle off if same
  renderQlTagRow();
}

function selectQlType(type){
  selectedQlType = type;
  document.querySelectorAll('#qlTypeRow .ql-filter-btn').forEach(btn=>{
    btn.classList.toggle('active', btn.dataset.type === type);
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
  renderQlFilterBar();
  renderQL();
}

const qlLinkSvg = `<svg width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`;

const qlEditSvg = `<svg width="9" height="9" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
const qlDelSvg  = `<svg width="9" height="9" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>`;
const qlPinSvg  = `<svg width="9" height="9" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2l2.4 6H21l-5.1 3.7 1.9 6.3L12 14l-5.8 4 1.9-6.3L3 8h6.6z"/></svg>`;

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

function renderQL(){
  const body = document.getElementById('qlBody');
  const list = (qlActiveFilter === 'all'
    ? QL.map((item,i)=>({item,i}))
    : QL.map((item,i)=>({item,i})).filter(({item})=>(item.tag||'') === qlActiveFilter)
  ).filter(({item})=>{
     const isLocked = item.hidden && !qlUnlockedIds.has(item.id);
     return isLocked ? !qlSearchQuery : qlMatchesSearch(item); // note ที่ซ่อนไว้ไม่ให้ค้นหาเจอเนื้อหาก่อนปลดล็อก
   })
   .sort((a,b)=> (b.item.pinned?1:0) - (a.item.pinned?1:0));

  if(!list.length){
    if(qlSearchQuery) body.innerHTML = '<span class="ql-empty">ไม่พบ note ที่ตรงกับ "' + esc(qlSearchQuery) + '"</span>';
    else body.innerHTML = QL.length
      ? '<span class="ql-empty">ไม่มี link ใน tag นี้</span>'
      : '<span class="ql-empty">ยังไม่มี link — กด + เพิ่ม เพื่อเพิ่ม Note</span>';
    return;
  }
  body.innerHTML = list.map(({item,i})=>{
    const isLocked = item.hidden && !qlUnlockedIds.has(item.id);
    if(isLocked){
      return `
      <div class="ql-card ql-card-locked">
        <div class="ql-card-locked-body">
          <span class="ql-card-locked-icon">🔒</span>
          <span class="ql-card-locked-text">Note นี้ถูกซ่อนไว้</span>
          <button class="btn btn-ghost ql-unlock-btn" onclick="qlRequestUnlock(${i})">ใส่ PIN เพื่อดู</button>
        </div>
      </div>`;
    }
    const tagLabel = item.tag ? qlTagLabel(item.tag) : '';
    const tagBadge = tagLabel
      ? `<span class="ql-tag-badge" style="--tag-color:${qlTagColor(item.tag)};--tag-bg:${qlTagColor(item.tag)}1F">● ${esc(tagLabel)}</span>`
      : '';
    const isPermanent = item.noteType === 'permanent';
    const hasUrl = item.url && item.url.trim();
    const openBtn = hasUrl
      ? `<a class="ql-open-btn" href="${esc(item.url)}" target="_blank" rel="noopener" title="${esc(item.url)}">${qlLinkSvg} เปิด Link</a>`
      : '';
    const detailHtml = item.detail
      ? `<div class="ql-card-detail">${/<[a-z][\s\S]*>/i.test(item.detail) ? sanitizeRichHTML(item.detail) : esc(item.detail)}</div>`
      : '';
    const imgCount = (item.images && item.images.length) || 0;
    const imagesHtml = imgCount
      ? `<div class="ql-img-row"><img class="ql-img-thumb" src="${esc(item.images[0])}" onclick="qlOpenRead(${i})">${imgCount>1?`<span class="ql-img-count-badge" onclick="qlOpenRead(${i})">+${imgCount-1}</span>`:''}</div>`
      : '';
    const relatedHtml = qlRelatedChipsHtml(item, 2);
    const hasExpandable = item.detail || imgCount || (item.relatedIds && item.relatedIds.length);
    const expandBtn = hasExpandable
      ? `<button class="ql-card-btn expand" onclick="qlOpenRead(${i})" title="ขยาย"><svg width="10" height="10" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg></button>`
      : '';
    const summarizeBtn = !isPermanent
      ? `<button class="ql-card-btn summarize" onclick="qlSummarizeToPermanent(${i})" title="สรุปเป็นโน้ตถาวร">✍️</button>`
      : '';
    const isPinned = !!item.pinned;
    const pinBadge = isPinned ? `<span class="ql-pin-badge">${qlPinSvg}</span>` : '';
    const wasUnlocked = !!item.hidden; // ซ่อนอยู่แต่ปลดล็อกแล้วใน session นี้
    const hideBtn = wasUnlocked
      ? `<button class="ql-card-btn unhide" onclick="qlUnhideNote(${i})" title="เลิกซ่อน Note นี้">🔓</button>`
      : `<button class="ql-card-btn hide" onclick="qlHideNote(${i})" title="ซ่อน Note นี้ (ต้องใส่ PIN เพื่อดูอีกครั้ง)">🔒</button>`;
    const hiddenBadge = wasUnlocked ? `<span class="ql-pin-badge" style="color:var(--text-3)" title="ซ่อนอยู่ — ปลดล็อกแล้วชั่วคราว">🔓 ซ่อนอยู่</span>` : '';
    return `
    <div class="ql-card${isPinned?' pinned':''}" data-tag="${esc(item.tag||'')}">
      <div class="ql-card-top">
        <div class="ql-card-name-wrap">
          ${pinBadge}
          <span class="ql-notetype-badge${isPermanent?' permanent':''}" title="${isPermanent?'Permanent':'Fleeting'}">${isPermanent?'📌':'📝'}</span>
          <div class="ql-card-name" title="${esc(item.name)}">${esc(item.name)}</div>
        </div>
        <div class="ql-card-actions">
          <button class="ql-card-btn pin${isPinned?' pinned':''}" onclick="qlTogglePin(${i})" title="${isPinned?'ถอดหมุด':'ปักหมุด'}">${qlPinSvg}</button>
          ${hideBtn}
          ${summarizeBtn}
          ${expandBtn}
          <button class="ql-card-btn edit" onclick="qlOpenEdit(${i})" title="แก้ไข">${qlEditSvg}</button>
          <button class="ql-card-btn del"  onclick="qlDelete(${i})"   title="ลบ">${qlDelSvg}</button>
        </div>
      </div>
      ${(tagBadge || hiddenBadge) ? `<div class="ql-card-meta-row" style="margin-top:.25rem">${tagBadge}${hiddenBadge}</div>` : ''}
      ${openBtn}
      ${detailHtml}
      ${imagesHtml}
      ${relatedHtml}
    </div>`;
  }).join('');
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
  document.getElementById('qlReadOverlay').style.display = 'flex';
}
function qlReadClose(){
  document.getElementById('qlReadOverlay').style.display = 'none';
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

function qlOpenAdd(prefill=null){
  qlEditIdx = -1;
  qlEditId = null;
  document.getElementById('qlModalTitle').textContent = 'เพิ่ม Note';
  document.getElementById('qlName').value = (prefill && prefill.name) || '';
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
  document.getElementById('qlOverlay').style.display='flex';
  setTimeout(()=>document.getElementById('qlName').focus(),60);
}

function qlOpenEdit(i){
  const item = QL[i];
  if(!item) return;
  qlEditIdx = i;
  qlEditId = item.id;
  document.getElementById('qlModalTitle').textContent = 'แก้ไข Note';
  document.getElementById('qlName').value   = item.name   || '';
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
  document.getElementById('qlOverlay').style.display='flex';
  setTimeout(()=>document.getElementById('qlName').focus(),60);
}

function qlClose(){
  document.getElementById('qlOverlay').style.display='none';
  qlEditIdx = -1;
  qlEditId = null;
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
    QL[qlEditIdx] = { ...existing, name, url, tag: selectedQlTag, detail, images: qlPendingImages.slice(), noteType: selectedQlType, relatedIds: selectedQlRelated.slice() };
  } else {
    const id = Date.now().toString(36)+Math.random().toString(36).slice(2,8);
    QL.push({ id, name, url, tag: selectedQlTag, detail, images: qlPendingImages.slice(), noteType: selectedQlType, relatedIds: selectedQlRelated.slice() });
  }
  saveQL();
  renderQL();
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
let finActiveFilter = 'all';
let selectedFinType = 'income';
let selectedFinPM = '';
let finEditId = null;
let finSlipData = '';

function getFinance(d){ return (DB._finance && DB._finance[d]) || []; }
function setFinance(d, arr){ if(!DB._finance) DB._finance = {}; DB._finance[d] = arr; }

// ── Recurring bills (รายจ่ายประจำ) ────────────────────
let finSubTab = 'list';
let billsViewMonth = today.slice(0,7);
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
  return (p && p.image != null) ? p.image : (bill.image || '');
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

function finFmtMoney(n){
  return Number(n||0).toLocaleString('th-TH', {minimumFractionDigits:0, maximumFractionDigits:2});
}

function finSetFilter(filter){
  finActiveFilter = filter;
  document.querySelectorAll('#finFilterBar .ql-filter-btn').forEach(btn=>{
    btn.classList.toggle('active', btn.dataset.filter === filter);
  });
  renderFinance();
}

function finSetSubTab(tab){
  finSubTab = tab;
  document.querySelectorAll('#finSubTabBar .ql-filter-btn').forEach(btn=>{
    btn.classList.toggle('active', btn.dataset.subtab === tab);
  });
  document.getElementById('finListPane').style.display  = tab==='list'  ? '' : 'none';
  document.getElementById('finBillsPane').style.display = tab==='bills' ? '' : 'none';
  if(tab==='bills') renderBills();
}

const finEditSvg = `<svg width="9" height="9" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
const finDelSvg  = `<svg width="9" height="9" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>`;

function renderFinance(){
  const entries = getFinance(currentDate);

  // Summary cards
  let income = 0, expense = 0;
  entries.forEach(e=>{
    if(e.type === 'income') income += Number(e.amount)||0;
    else expense += Number(e.amount)||0;
  });
  const balance = income - expense;
  const statsEl = document.getElementById('finStatsGrid');
  if(statsEl){
    statsEl.style.gridTemplateColumns = 'repeat(3, 1fr)';
    statsEl.innerHTML = `
    <div class="stat-card">
      <div class="stat-icon green"><svg width="18" height="18" fill="none" stroke="var(--green)" stroke-width="1.8" viewBox="0 0 24 24"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg></div>
      <div class="stat-body">
        <div class="stat-num green">${finFmtMoney(income)}</div>
        <div class="stat-label">รายรับ</div>
      </div>
    </div>
    <div class="stat-card">
      <div class="stat-icon red"><svg width="18" height="18" fill="none" stroke="var(--red)" stroke-width="1.8" viewBox="0 0 24 24"><polyline points="22 17 13.5 8.5 8.5 13.5 2 7"/><polyline points="16 17 22 17 22 11"/></svg></div>
      <div class="stat-body">
        <div class="stat-num red">${finFmtMoney(expense)}</div>
        <div class="stat-label">รายจ่าย</div>
      </div>
    </div>
    <div class="stat-card">
      <div class="stat-icon ${balance>=0?'blue':'red'}"><svg width="18" height="18" fill="none" stroke="${balance>=0?'var(--blue)':'var(--red)'}" stroke-width="1.8" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg></div>
      <div class="stat-body">
        <div class="stat-num ${balance>=0?'blue':'red'}">${finFmtMoney(balance)}</div>
        <div class="stat-label">คงเหลือ</div>
      </div>
    </div>`;
  }

  // List
  const body = document.getElementById('finBody');
  if(!body) return;
  const list = (finActiveFilter==='all' ? entries : entries.filter(e=>e.type===finActiveFilter))
    .map((e,i)=>({e,i:entries.indexOf(e)}))
    .sort((a,b)=> (a.e.time||'').localeCompare(b.e.time||''));

  if(!list.length){
    body.innerHTML = entries.length
      ? '<span class="ql-empty">ไม่มีรายการในตัวกรองนี้</span>'
      : '<span class="ql-empty">ยังไม่มีรายการ — กด + เพิ่มรายการ เพื่อบันทึก</span>';
    return;
  }

  body.innerHTML = list.map(({e})=>{
    const pmBadge = e.paymentMethod ? `<span class="fin-pm-badge">${esc(e.paymentMethod)}</span>` : '';
    const timeBadge = e.time ? `<span class="fin-card-time">${esc(e.time)}</span>` : '';
    const noteHtml = e.note ? `<div class="fin-card-note">${esc(e.note)}</div>` : '';
    const slipImg = e.slip ? `<img class="fin-slip-thumb" src="${e.slip}" onclick="showImagePreview(this.src)" title="คลิกเพื่อดูรูปขนาดเต็ม">` : '';
    const sign = e.type==='income' ? '+' : '-';
    return `
    <div class="fin-card ${esc(e.type)}">
      ${slipImg}
      <div class="fin-card-main">
        <div class="fin-card-top">
          <div>
            <div class="fin-card-item">${esc(e.item)}</div>
            ${timeBadge}
          </div>
          <div class="fin-card-amount ${esc(e.type)}">${sign}${finFmtMoney(e.amount)}</div>
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

function billsChangeMonth(delta){
  billsViewMonth = shiftMonth(billsViewMonth, delta);
  renderBills();
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
  const imageThumb = image ? `<img class="fin-slip-thumb" src="${image}" onclick="showImagePreview(this.src)" title="คลิกเพื่อดูรูปขนาดเต็ม">` : '';
  const pmBadge = (paid && payment && payment.paymentMethod) ? `<span class="fin-pm-badge">${esc(payment.paymentMethod)}</span>` : '';
  const payTimeBadge = (paid && payment && payment.payTime) ? `<span class="fin-card-time">จ่ายเวลา ${esc(payment.payTime)}</span>` : '';
  const payNoteHtml = (paid && payment && payment.payNote) ? `<div class="fin-card-note">${esc(payment.payNote)}</div>` : '';
  return `
  <div class="fin-card bill-card ${paid?'paid':isOverdue?'overdue':isDueSoon?'duesoon':''}">
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
          ? `<svg width="9" height="9" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`
          : `<svg width="9" height="9" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>`}
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
    statsEl.style.gridTemplateColumns = 'repeat(5, 1fr)';
    statsEl.innerHTML = `
    <div class="stat-card">
      <div class="stat-icon navy"><svg width="18" height="18" fill="none" stroke="var(--navy)" stroke-width="1.8" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg></div>
      <div class="stat-body">
        <div class="stat-num navy">${finFmtMoney(totalMonthly)}</div>
        <div class="stat-label">ค่าใช้จ่ายประจำ/เดือน</div>
      </div>
    </div>
    <div class="stat-card">
      <div class="stat-icon blue"><svg width="18" height="18" fill="none" stroke="var(--blue)" stroke-width="1.8" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg></div>
      <div class="stat-body">
        <div class="stat-num blue">${finFmtMoney(paidSoFar)}</div>
        <div class="stat-label">จ่ายไปแล้ว</div>
      </div>
    </div>
    <div class="stat-card">
      <div class="stat-icon ${remaining>0?'amber':'blue'}"><svg width="18" height="18" fill="none" stroke="${remaining>0?'var(--amber)':'var(--blue)'}" stroke-width="1.8" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg></div>
      <div class="stat-body">
        <div class="stat-num ${remaining>0?'amber':'blue'}">${finFmtMoney(remaining)}</div>
        <div class="stat-label">เหลืออีก</div>
      </div>
    </div>
    <div class="stat-card">
      <div class="stat-icon ${dueSoonCount>0?'yellow':'gray'}"><svg width="18" height="18" fill="none" stroke="${dueSoonCount>0?'var(--yellow)':'var(--gray)'}" stroke-width="1.8" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></div>
      <div class="stat-body">
        <div class="stat-num ${dueSoonCount>0?'yellow':'gray'}">${dueSoonCount}</div>
        <div class="stat-label">ใกล้ถึงกำหนด (${BILL_DUE_SOON_DAYS} วัน)</div>
      </div>
    </div>
    <div class="stat-card">
      <div class="stat-icon ${overdueCount>0?'red':'gray'}"><svg width="18" height="18" fill="none" stroke="${overdueCount>0?'var(--red)':'var(--gray)'}" stroke-width="1.8" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg></div>
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
  renderBillPayPMRow();
  document.getElementById('billPayOverlay').style.display = 'flex';
}

function closeBillPayModal(){
  document.getElementById('billPayOverlay').style.display = 'none';
  billPayBillId = null;
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
    slip: '',
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

  setBillPayments(billsViewMonth, payments);
  await writeFile();
  closeBillPayModal();
  renderBills();
  if(typeof renderFinance === 'function') renderFinance();
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

function compressImageToDataURL(file, maxDim, quality){
  return new Promise(resolve=>{
    const img = new Image();
    const reader = new FileReader();
    reader.onload = ()=>{
      img.onload = ()=>{
        let { width, height } = img;
        if(width > maxDim || height > maxDim){
          if(width > height){ height = Math.round(height * maxDim / width); width = maxDim; }
          else { width = Math.round(width * maxDim / height); height = maxDim; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function openFinanceModal(id=null){
  finEditId = id;
  renderFinPMRow();
  const entries = getFinance(currentDate);
  if(id){
    const e = entries.find(x=>x.id===id);
    if(!e) return;
    document.getElementById('finModalTitle').textContent = 'แก้ไขรายการ';
    document.getElementById('finItem').value = e.item || '';
    document.getElementById('finAmount').value = e.amount || '';
    document.getElementById('finTime').value = e.time || '';
    document.getElementById('finNote').value = e.note || '';
    selectFinType(e.type || 'income');
    selectedFinPM = e.paymentMethod || '';
    renderFinPMRow();
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
    const now = new Date();
    document.getElementById('finTime').value = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
    document.getElementById('finNote').value = '';
    selectFinType('income');
    selectedFinPM = '';
    renderFinPMRow();
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

async function saveFinance(){
  const item = document.getElementById('finItem').value.trim();
  const amount = parseFloat(document.getElementById('finAmount').value);
  if(!item){ document.getElementById('finItem').focus(); return; }
  if(!amount || amount <= 0){ document.getElementById('finAmount').focus(); return; }
  const time = document.getElementById('finTime').value || '';
  const note = document.getElementById('finNote').value.trim();
  const entries = getFinance(currentDate);
  if(finEditId){
    const idx = entries.findIndex(x=>x.id===finEditId);
    if(idx>-1){
      entries[idx] = {
        ...entries[idx],
        type: selectedFinType,
        item, amount, time,
        paymentMethod: selectedFinPM,
        note, slip: finSlipData,
        updatedAt: new Date().toISOString()
      };
    }
  } else {
    entries.push({
      id: Date.now().toString(36)+Math.random().toString(36).slice(2,6),
      type: selectedFinType,
      item, amount, time,
      paymentMethod: selectedFinPM,
      note, slip: finSlipData,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  }
  setFinance(currentDate, entries);
  closeFinanceModal();
  await writeFile();
  renderFinance();
}

async function deleteFinance(id){
  setFinance(currentDate, getFinance(currentDate).filter(x=>x.id!==id));
  await writeFile();
  renderFinance();
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

// ── Initial render (ต้องอยู่ท้ายสุด เพื่อให้ const ทุกตัวถูก initialize ก่อน) ──
loadCols();
renderBoard();
loadFile().then(() => {
  render();
  loadDL();
  renderDL();
  loadQLTags();
  loadQL();
  renderQlFilterBar();
  renderQL();
  loadFinPM();
  renderFinance();
});
