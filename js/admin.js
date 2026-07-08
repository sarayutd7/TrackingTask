// ── Admin Dashboard (standalone page, Super Admin only) ──
const API = 'https://trackingtask.sarayutd7.workers.dev';
const AUTH_TOKEN_KEY = 'trackingTaskToken';
const AUTH_USER_KEY = 'trackingTaskUser';
const ADMIN_USERNAME = 'Yut';
const MENU_LABELS = { task: 'Daily Task', tool: 'Note', finance: 'รายรับ-รายจ่าย' };

function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function authHeaders(){
  const token = localStorage.getItem(AUTH_TOKEN_KEY);
  return token ? { 'Authorization': 'Bearer ' + token } : {};
}

let adminUsersCache = [];
let adminSearchQuery = '';

function denyAccess(){
  document.getElementById('adminDenied').style.display = '';
  document.getElementById('adminContent').style.display = 'none';
}

async function initAdminPage(){
  const token = localStorage.getItem(AUTH_TOKEN_KEY);
  const username = localStorage.getItem(AUTH_USER_KEY);
  if(!token || username !== ADMIN_USERNAME){
    denyAccess();
    return;
  }
  document.getElementById('adminContent').style.display = '';
  await loadAdminUsers();
}

async function loadAdminUsers(){
  const errorEl = document.getElementById('adminError');
  errorEl.textContent = '';
  try {
    const r = await fetch(API + '/admin/users', { headers: authHeaders() });
    if(r.status === 401){ denyAccess(); return; }
    const data = await r.json();
    if(!r.ok){ errorEl.textContent = data.error || 'โหลดรายชื่อผู้ใช้ไม่สำเร็จ'; return; }
    adminUsersCache = data.users || [];
    renderAdminStats();
    renderAdminUsers();
  } catch(e){
    errorEl.textContent = 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ลองใหม่อีกครั้ง';
  }
}

function renderAdminStats(){
  const total = adminUsersCache.length;
  const active = adminUsersCache.filter(u=>!u.disabled&&!u.locked).length;
  const disabled = adminUsersCache.filter(u=>u.disabled).length;
  const locked = adminUsersCache.filter(u=>u.locked&&!u.disabled).length;
  const el = document.getElementById('adminStatsGrid');
  if(!el) return;
  const card = (label,num,bg,color,svg) => `
    <div class="admin-stat">
      <div class="admin-stat-icon" style="background:${bg};box-shadow:0 0 14px ${color}40">
        ${svg}
      </div>
      <div>
        <div class="admin-stat-num">${num}</div>
        <div class="admin-stat-label">${label}</div>
      </div>
    </div>`;
  el.innerHTML =
    card('ผู้ใช้ทั้งหมด',total,'rgba(99,102,241,.2)','#818cf8',`<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#818cf8" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`) +
    card('ใช้งานอยู่',active,'rgba(16,185,129,.2)','#34d399',`<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#34d399" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`) +
    card('ถูกระงับ',disabled,'rgba(244,63,94,.2)','#fb7185',`<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fb7185" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>`) +
    card('ถูกล็อค',locked,'rgba(245,158,11,.2)','#fbbf24',`<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2.5"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`);
}

function adminSearch(q){
  adminSearchQuery = q.trim().toLowerCase();
  renderAdminUsers();
}

function renderAdminUsers(){
  const body = document.getElementById('adminUserList');
  const countEl = document.getElementById('adminSearchCount');
  if(!adminUsersCache.length){
    body.innerHTML = '<div class="adm-empty" style="grid-column:1/-1">ไม่มีผู้ใช้งานอื่นในระบบ</div>';
    if(countEl) countEl.textContent = '';
    return;
  }
  const filtered = adminSearchQuery
    ? adminUsersCache.filter(u=>
        u.username.toLowerCase().includes(adminSearchQuery) ||
        (u.email||'').toLowerCase().includes(adminSearchQuery)
      )
    : adminUsersCache;
  if(countEl) countEl.textContent = adminSearchQuery ? `แสดง ${filtered.length} / ${adminUsersCache.length} คน` : `${adminUsersCache.length} คน`;
  if(!filtered.length){
    body.innerHTML = `<div class="adm-empty" style="grid-column:1/-1">ไม่พบผู้ใช้ที่ตรงกับ "${esc(adminSearchQuery)}"</div>`;
    return;
  }
  body.innerHTML = filtered.map(u=>{
    const initials = (u.username||'?').charAt(0).toUpperCase();
    const statusClass = u.disabled ? 'status-disabled' : u.locked ? 'status-locked' : 'status-active';
    const statusText = u.disabled ? 'ระงับ' : u.locked ? 'ล็อค' : 'ใช้งาน';
    const perms = Object.keys(MENU_LABELS).map(m=>{
      const on = (u.allowedMenus||[]).includes(m);
      return `<span class="perm-chip${on?' on':''}" onclick="adminTogglePermission('${esc(u.username)}','${m}',${!on})">${esc(MENU_LABELS[m])}</span>`;
    }).join('');
    return `
    <div class="user-card">
      <div class="user-card-top">
        <div class="user-avatar">${initials}</div>
        <div style="flex:1;min-width:0">
          <div class="user-name">${esc(u.username)}</div>
          <div class="user-email">${esc(u.email||'-')}</div>
        </div>
        <span class="user-status ${statusClass}">${statusText}</span>
      </div>
      <div class="perm-row">${perms}</div>
      <div class="user-actions">
        <button class="ua-btn" onclick="adminToggleDisabled('${esc(u.username)}',${!u.disabled})">${u.disabled ? 'เปิดใช้งาน' : 'ระงับ'}</button>
        ${u.locked ? `<button class="ua-btn warn" onclick="adminUnlock('${esc(u.username)}')">ปลดล็อก</button>` : ''}
        <button class="ua-btn danger" onclick="adminDeleteUser('${esc(u.username)}')">ลบ</button>
      </div>
    </div>`;
  }).join('');
}

async function adminToggleDisabled(username, disable){
  const errorEl = document.getElementById('adminError');
  errorEl.textContent = '';
  try {
    const r = await fetch(`${API}/admin/users/${encodeURIComponent(username)}/${disable ? 'disable' : 'enable'}`, {
      method: 'POST', headers: authHeaders()
    });
    const data = await r.json();
    if(!r.ok){ errorEl.textContent = data.error || 'ดำเนินการไม่สำเร็จ'; return; }
    await loadAdminUsers();
  } catch(e){
    errorEl.textContent = 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ลองใหม่อีกครั้ง';
  }
}

async function adminTogglePermission(username, menu, checked){
  const errorEl = document.getElementById('adminError');
  errorEl.textContent = '';
  const user = adminUsersCache.find(u=>u.username===username);
  if(!user) return;
  let allowedMenus = (user.allowedMenus||[]).slice();
  if(checked){
    if(!allowedMenus.includes(menu)) allowedMenus.push(menu);
  } else {
    allowedMenus = allowedMenus.filter(m=>m!==menu);
  }
  if(!allowedMenus.length){
    errorEl.textContent = 'ต้องเปิดให้เข้าใช้งานได้อย่างน้อย 1 เมนู';
    renderAdminUsers();
    return;
  }
  try {
    const r = await fetch(`${API}/admin/users/${encodeURIComponent(username)}/permissions`, {
      method: 'POST',
      headers: {'Content-Type':'application/json', ...authHeaders()},
      body: JSON.stringify({ allowedMenus })
    });
    const data = await r.json();
    if(!r.ok){ errorEl.textContent = data.error || 'บันทึกสิทธิ์ไม่สำเร็จ'; renderAdminUsers(); return; }
    user.allowedMenus = allowedMenus;
  } catch(e){
    errorEl.textContent = 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ลองใหม่อีกครั้ง';
    renderAdminUsers();
  }
}

async function adminDeleteUser(username){
  if(!confirm(`ลบบัญชี "${username}" ทิ้งทั้งหมด รวมถึงข้อมูลทุกอย่างที่บัญชีนี้เคยเพิ่มไว้? การกระทำนี้ไม่สามารถย้อนกลับได้`)) return;
  const errorEl = document.getElementById('adminError');
  errorEl.textContent = '';
  try {
    const r = await fetch(`${API}/admin/users/${encodeURIComponent(username)}`, {
      method: 'DELETE', headers: authHeaders()
    });
    const data = await r.json();
    if(!r.ok){ errorEl.textContent = data.error || 'ลบบัญชีไม่สำเร็จ'; return; }
    await loadAdminUsers();
  } catch(e){
    errorEl.textContent = 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ลองใหม่อีกครั้ง';
  }
}

initAdminPage();
