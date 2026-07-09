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
  const statCard = (colorDim, colorGlow, iconSvg, count, label) => `
  <div style="background:rgba(99,102,241,0.055);border:1px solid rgba(255,255,255,0.07);border-radius:16px;padding:16px;display:flex;align-items:center;gap:12px">
    <div style="width:44px;height:44px;border-radius:12px;display:grid;place-items:center;background:${colorDim};box-shadow:0 0 16px ${colorGlow};flex-shrink:0">
      ${iconSvg}
    </div>
    <div>
      <div style="font-size:24px;font-weight:700;color:#f1f5f9;font-variant-numeric:tabular-nums;letter-spacing:-1px">${count}</div>
      <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:.8px;margin-top:2px">${label}</div>
    </div>
  </div>`;
  document.getElementById('adminStatsGrid').innerHTML =
    statCard('rgba(99,102,241,0.15)','rgba(99,102,241,0.3)',
      `<svg width="20" height="20" fill="none" stroke="#6366f1" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-7 8-7s8 3 8 7"/></svg>`,
      total, 'ผู้ใช้ทั้งหมด') +
    statCard('rgba(16,185,129,0.15)','rgba(16,185,129,0.3)',
      `<svg width="20" height="20" fill="none" stroke="#10b981" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
      active, 'ใช้งานอยู่') +
    statCard('rgba(245,158,11,0.15)','rgba(245,158,11,0.3)',
      `<svg width="20" height="20" fill="none" stroke="#f59e0b" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
      disabled, 'ถูกระงับ') +
    statCard('rgba(244,63,94,0.15)','rgba(244,63,94,0.3)',
      `<svg width="20" height="20" fill="none" stroke="#f43f5e" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`,
      locked, 'ล็อกบัญชี');
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
    const statusBadge = u.disabled
      ? `<span style="background:rgba(148,163,184,0.1);color:#94a3b8;border:1px solid rgba(148,163,184,0.2);border-radius:6px;padding:3px 8px;font-size:11px;font-weight:600">ระงับ</span>`
      : u.locked
        ? `<span style="background:rgba(244,63,94,0.15);color:#f43f5e;border:1px solid rgba(244,63,94,0.3);border-radius:6px;padding:3px 8px;font-size:11px;font-weight:600">🔒 ล็อค</span>`
        : `<span style="background:rgba(16,185,129,0.15);color:#10b981;border:1px solid rgba(16,185,129,0.3);border-radius:6px;padding:3px 8px;font-size:11px;font-weight:600">ใช้งาน</span>`;
    const perms = Object.keys(MENU_LABELS).map(m=>{
      const on = (u.allowedMenus||[]).includes(m);
      return on
        ? `<span style="background:rgba(99,102,241,0.15);color:#a5b4fc;border-radius:4px;padding:2px 6px;font-size:10px;font-weight:600;cursor:pointer" onclick="adminTogglePermission('${esc(u.username)}','${m}',false)">${esc(MENU_LABELS[m])}</span>`
        : `<span style="background:rgba(255,255,255,0.04);color:#475569;border-radius:4px;padding:2px 6px;font-size:10px;font-weight:600;cursor:pointer" onclick="adminTogglePermission('${esc(u.username)}','${m}',true)">${esc(MENU_LABELS[m])}</span>`;
    }).join('');
    const stats = u.stats || { task:0, note:0, finance:0 };
    const btnBase = `background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.08);border-radius:8px;color:#94a3b8;padding:5px 10px;font-size:12px;cursor:pointer;transition:all .15s`;
    const btnHover = `onmouseover="this.style.background='rgba(99,102,241,0.15)';this.style.color='#a5b4fc'" onmouseout="this.style.background='rgba(255,255,255,0.05)';this.style.color='#94a3b8'"`;
    const btnRedHover = `onmouseover="this.style.background='rgba(244,63,94,0.15)';this.style.color='#f43f5e'" onmouseout="this.style.background='rgba(255,255,255,0.05)';this.style.color='#94a3b8'"`;
    const btnAmberHover = `onmouseover="this.style.background='rgba(245,158,11,0.15)';this.style.color='#f59e0b'" onmouseout="this.style.background='rgba(255,255,255,0.05)';this.style.color='#94a3b8'"`;
    return `
    <div style="background:rgba(99,102,241,0.055);border:1px solid rgba(255,255,255,0.07);border-radius:14px;padding:14px 16px;display:flex;align-items:center;gap:12px;transition:all .15s;flex-wrap:wrap"
         onmouseover="this.style.background='rgba(99,102,241,0.09)';this.style.borderColor='rgba(99,102,241,0.2)'"
         onmouseout="this.style.background='rgba(99,102,241,0.055)';this.style.borderColor='rgba(255,255,255,0.07)'">
      <div style="width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,#6366f1,#8b5cf6);display:grid;place-items:center;font-size:15px;font-weight:700;color:#fff;flex-shrink:0">${initials}</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:14px;font-weight:600;color:#f1f5f9">${esc(u.username)}</div>
        <div style="font-size:12px;color:#94a3b8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(u.email||'-')}</div>
      </div>
      ${statusBadge}
      <div style="display:flex;gap:4px;flex-wrap:wrap">${perms}</div>
      <div style="font-size:11px;color:#475569;white-space:nowrap">Task ${stats.task} · Note ${stats.note} · Finance ${stats.finance}</div>
      <div style="display:flex;gap:6px;margin-left:auto">
        <button onclick="adminToggleDisabled('${esc(u.username)}',${!u.disabled})" style="${btnBase}" ${btnHover}>${u.disabled ? 'เปิดใช้งาน' : 'ระงับ'}</button>
        ${u.locked ? `<button onclick="adminUnlock('${esc(u.username)}')" style="${btnBase}" ${btnAmberHover}>ปลดล็อก</button>` : ''}
        <button onclick="adminDeleteUser('${esc(u.username)}')" style="${btnBase}" ${btnRedHover}>ลบบัญชี</button>
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
