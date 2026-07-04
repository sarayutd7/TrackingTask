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
  const disabled = adminUsersCache.filter(u=>u.disabled).length;
  const locked = adminUsersCache.filter(u=>u.locked).length;
  const active = total - disabled - locked;
  document.getElementById('adminStatsGrid').innerHTML = `
  <div class="adm-stat">
    <div class="adm-stat-icon" style="background:#3b82f622">
      <svg width="18" height="18" fill="none" stroke="#3b82f6" stroke-width="1.8" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-7 8-7s8 3 8 7"/></svg>
    </div>
    <div><div class="adm-stat-num" style="color:#3b82f6">${total}</div><div class="adm-stat-label">ผู้ใช้ทั้งหมด</div></div>
  </div>
  <div class="adm-stat">
    <div class="adm-stat-icon" style="background:#ef444422">
      <svg width="18" height="18" fill="none" stroke="#ef4444" stroke-width="1.8" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
    </div>
    <div><div class="adm-stat-num" style="color:#ef4444">${disabled}</div><div class="adm-stat-label">ถูกระงับ</div></div>
  </div>
  <div class="adm-stat">
    <div class="adm-stat-icon" style="background:#f59e0b22">
      <svg width="18" height="18" fill="none" stroke="#f59e0b" stroke-width="1.8" viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
    </div>
    <div><div class="adm-stat-num" style="color:#f59e0b">${locked}</div><div class="adm-stat-label">ล็อกบัญชี</div></div>
  </div>`;
}

function adminSearch(q){
  adminSearchQuery = q.trim().toLowerCase();
  renderAdminUsers();
}

function renderAdminUsers(){
  const body = document.getElementById('adminUserList');
  const countEl = document.getElementById('adminSearchCount');
  if(!adminUsersCache.length){
    body.innerHTML = '<span class="ql-empty">ไม่มีผู้ใช้งานอื่นในระบบ</span>';
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
    body.innerHTML = `<div class="adm-empty">ไม่พบผู้ใช้ที่ตรงกับ "${esc(adminSearchQuery)}"</div>`;
    return;
  }
  body.innerHTML = filtered.map(u=>{
    const initials = (u.username||'?').charAt(0).toUpperCase();
    const statusCls = u.disabled ? 'adm-status-dis' : (u.locked ? 'adm-status-lock' : 'adm-status-ok');
    const statusTxt = u.disabled ? '🚫 ระงับ' : (u.locked ? '🔒 ล็อก' : '✓ ใช้งานได้');
    const perms = Object.keys(MENU_LABELS).map(m=>{
      const on = (u.allowedMenus||[]).includes(m);
      return `<span class="adm-perm-chip${on?' on':''}" onclick="adminTogglePermission('${esc(u.username)}','${m}',${!on})">
        <span class="chip-dot"></span>${esc(MENU_LABELS[m])}
      </span>`;
    }).join('');
    const stats = u.stats || { task:0, note:0, finance:0 };
    return `
    <div class="adm-user-card">
      <div class="adm-user-top">
        <div class="adm-avatar">${initials}</div>
        <div class="adm-user-info">
          <div class="adm-user-name">${esc(u.username)}</div>
          <div class="adm-user-email">${esc(u.email||'-')}</div>
        </div>
        <span class="adm-status-badge ${statusCls}">${statusTxt}</span>
      </div>
      <div class="adm-user-stats">
        <span>Task <b>${stats.task}</b></span>
        <span>Note <b>${stats.note}</b></span>
        <span>Finance <b>${stats.finance}</b></span>
      </div>
      <div class="adm-perms">${perms}</div>
      <div class="adm-user-actions">
        <button class="btn btn-ghost" style="font-size:.78rem;padding:.35rem .8rem" onclick="adminToggleDisabled('${esc(u.username)}',${!u.disabled})">
          ${u.disabled ? 'เปิดใช้งาน' : 'ระงับ'}
        </button>
        ${u.locked ? `<button class="btn btn-ghost" style="font-size:.78rem;padding:.35rem .8rem;color:#f59e0b;border-color:#f59e0b44" onclick="adminUnlock('${esc(u.username)}')">ปลดล็อก</button>` : ''}
        <button class="btn btn-ghost" style="font-size:.78rem;padding:.35rem .8rem;color:var(--red);border-color:#ef444444;margin-left:auto" onclick="adminDeleteUser('${esc(u.username)}')">ลบบัญชี</button>
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
