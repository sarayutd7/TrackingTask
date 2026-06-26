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
  document.getElementById('adminStatsGrid').innerHTML = `
  <div class="stat-card">
    <div class="stat-icon blue"><svg width="18" height="18" fill="none" stroke="var(--blue)" stroke-width="1.8" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-7 8-7s8 3 8 7"/></svg></div>
    <div class="stat-body">
      <div class="stat-num blue">${total}</div>
      <div class="stat-label">ผู้ใช้งานทั้งหมด</div>
    </div>
  </div>
  <div class="stat-card">
    <div class="stat-icon red"><svg width="18" height="18" fill="none" stroke="var(--red)" stroke-width="1.8" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg></div>
    <div class="stat-body">
      <div class="stat-num red">${disabled}</div>
      <div class="stat-label">ถูกระงับการใช้งาน</div>
    </div>
  </div>
  <div class="stat-card">
    <div class="stat-icon gray"><svg width="18" height="18" fill="none" stroke="var(--gray)" stroke-width="1.8" viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg></div>
    <div class="stat-body">
      <div class="stat-num gray">${locked}</div>
      <div class="stat-label">ล็อก (เข้าระบบผิดหลายครั้ง)</div>
    </div>
  </div>`;
}

function renderAdminUsers(){
  const body = document.getElementById('adminUserList');
  if(!adminUsersCache.length){
    body.innerHTML = '<span class="ql-empty">ไม่มีผู้ใช้งานอื่นในระบบ</span>';
    return;
  }
  body.innerHTML = adminUsersCache.map(u=>{
    const statusBadge = u.disabled
      ? `<span class="bill-status-badge overdue">ถูกระงับ</span>`
      : (u.locked ? `<span class="bill-status-badge duesoon">ล็อก (เข้าระบบผิดหลายครั้ง)</span>` : `<span class="bill-status-badge paid">ใช้งานได้</span>`);
    const menuChecks = Object.keys(MENU_LABELS).map(m=>{
      const checked = (u.allowedMenus||[]).includes(m) ? 'checked' : '';
      return `<label style="display:inline-flex;align-items:center;gap:.3rem;font-size:.78rem;margin-right:.8rem;cursor:pointer">
        <input type="checkbox" ${checked} onchange="adminTogglePermission('${esc(u.username)}','${m}',this.checked)">
        ${esc(MENU_LABELS[m])}
      </label>`;
    }).join('');
    const stats = u.stats || { task: 0, note: 0, finance: 0 };
    const statsRow = `<div style="display:flex;gap:1.2rem;font-size:.78rem;color:var(--text-3);margin:.4rem 0">
      <span>Daily Task: <b style="color:var(--text)">${stats.task}</b> รายการ</span>
      <span>Note: <b style="color:var(--text)">${stats.note}</b> รายการ</span>
      <span>รายรับ-รายจ่าย: <b style="color:var(--text)">${stats.finance}</b> รายการ</span>
    </div>`;
    return `
    <div class="fin-card bill-card" style="display:block">
      <div class="fin-card-top" style="margin-bottom:.4rem">
        <div>
          <div class="fin-card-item">${esc(u.username)}</div>
          <span class="fin-card-time">${esc(u.email||'-')}</span>
        </div>
        ${statusBadge}
      </div>
      ${statsRow}
      <div style="margin:.5rem 0">${menuChecks}</div>
      <div class="fin-card-actions" style="justify-content:flex-start;gap:.5rem;margin-top:.5rem">
        <button class="btn btn-ghost" style="padding:.4rem .8rem;font-size:.78rem" onclick="adminToggleDisabled('${esc(u.username)}',${!u.disabled})">${u.disabled ? 'เปิดให้ใช้งาน' : 'ระงับการใช้งาน'}</button>
        <button class="btn" style="padding:.4rem .8rem;font-size:.78rem;color:var(--red);border-color:var(--red)" onclick="adminDeleteUser('${esc(u.username)}')">ลบบัญชี</button>
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
