// ── Admin Dashboard — TrackingTask ──
const API = 'https://trackingtask.sarayutd7.workers.dev';
const AUTH_TOKEN_KEY   = 'trackingTaskToken';
const AUTH_USER_KEY    = 'trackingTaskUser';
const AUTH_IS_ADMIN_KEY = 'trackingTaskIsAdmin';
const THEME_KEY        = 'dailyTodoTheme';

const MENU_LABELS = { task: 'Daily Task', tool: 'Note (QL)', finance: 'Finance' };
const MENU_CLASSES = { task: 'task', tool: 'tool', finance: 'finance' };

const AVATAR_GRADIENTS = [
  'linear-gradient(135deg,#6366f1,#8b5cf6)',
  'linear-gradient(135deg,#10b981,#059669)',
  'linear-gradient(135deg,#f59e0b,#d97706)',
  'linear-gradient(135deg,#06b6d4,#0891b2)',
  'linear-gradient(135deg,#f43f5e,#e11d48)',
];

// ── Utilities ──────────────────────────────────────────────────────────────

function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

function authHeaders(){
  const token = localStorage.getItem(AUTH_TOKEN_KEY);
  return token ? { 'Authorization': 'Bearer ' + token } : {};
}

function showAdmToast(msg, ms = 2800){
  const el = document.getElementById('admToast');
  if(!el) return;
  el.textContent = msg;
  el.style.display = 'block';
  el.style.opacity = '1';
  clearTimeout(el._t);
  el._t = setTimeout(() => {
    el.style.opacity = '0';
    setTimeout(() => { el.style.display = 'none'; }, 300);
  }, ms);
}

// ── Theme ───────────────────────────────────────────────────────────────────

const ADMIN_THEME_MOON_SVG = '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
const ADMIN_THEME_SUN_SVG = '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>';
function applyTheme(){
  const t = localStorage.getItem(THEME_KEY) || 'dark';
  document.documentElement.setAttribute('data-theme', t);
  const iconEl = document.getElementById('adminThemeIcon');
  if(iconEl) iconEl.innerHTML = t === 'light' ? ADMIN_THEME_SUN_SVG : ADMIN_THEME_MOON_SVG;
}

function adminToggleTheme(){
  const cur = localStorage.getItem(THEME_KEY) || 'dark';
  const next = cur === 'dark' ? 'light' : 'dark';
  localStorage.setItem(THEME_KEY, next);
  applyTheme();
}

// ── Sidebar init ────────────────────────────────────────────────────────────

function initSidebar(){
  applyTheme();

  const username = localStorage.getItem(AUTH_USER_KEY) || '';
  const initials = username ? username.charAt(0).toUpperCase() : '?';

  const nameEl   = document.getElementById('sbUserName');
  const emailEl  = document.getElementById('sbUserEmail');
  const avatarEl = document.getElementById('sbAvatar');
  if(nameEl) nameEl.textContent = username || '—';
  if(avatarEl){
    avatarEl.textContent = initials;
    avatarEl.style.background = AVATAR_GRADIENTS[0];
  }

  // Fetch account info for email
  const token = localStorage.getItem(AUTH_TOKEN_KEY);
  if(token){
    fetch(API + '/account', { headers: authHeaders() })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if(!d) return;
        if(emailEl) emailEl.textContent = d.email || '—';
      })
      .catch(() => {});
  }

  // Weather from sessionStorage cache
  try {
    const wx = JSON.parse(sessionStorage.getItem('wx_cache') || 'null');
    if(wx && Date.now() - wx.ts < 30 * 60 * 1000){
      const tempEl = document.getElementById('sbWeatherTemp');
      const locEl  = document.getElementById('sbWeatherLoc');
      if(tempEl) tempEl.textContent = wx.temp + '°C';
      if(locEl)  locEl.textContent  = 'ตำแหน่งปัจจุบัน';
    }
  } catch(_){}
}

// ── Topbar date ─────────────────────────────────────────────────────────────

function initTopbarDate(){
  const el = document.getElementById('adminTopbarDate');
  if(!el) return;
  const now = new Date();
  el.textContent = now.toLocaleDateString('th-TH', { year:'numeric', month:'long', day:'numeric' });
}

// ── Auth ────────────────────────────────────────────────────────────────────

function denyAccess(){
  const denied  = document.getElementById('adminDenied');
  const content = document.getElementById('adminContent');
  if(denied)  { denied.style.display = 'flex'; }
  if(content) { content.style.display = 'none'; }
}

function adminLogout(){
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_USER_KEY);
  localStorage.removeItem(AUTH_IS_ADMIN_KEY);
  window.location.href = 'index.html';
}

async function initAdminPage(){
  initSidebar();
  initTopbarDate();

  const token   = localStorage.getItem(AUTH_TOKEN_KEY);
  const isAdmin = localStorage.getItem(AUTH_IS_ADMIN_KEY);

  if(!token || isAdmin !== '1'){
    denyAccess();
    return;
  }

  // Verify via server
  try {
    const r = await fetch(API + '/account', { headers: authHeaders() });
    if(!r.ok){ denyAccess(); return; }
    // /account doesn't return isAdmin; trust localStorage flag (set at login)
  } catch(e){
    // offline — trust local flag
  }

  document.getElementById('adminContent').style.display = '';
  await loadAdminUsers();
}

// ── Data ────────────────────────────────────────────────────────────────────

let adminUsersCache = [];
let adminSearchQuery = '';
let adminFilter = 'all';

async function loadAdminUsers(){
  const errorEl = document.getElementById('adminError');
  if(errorEl) errorEl.textContent = '';

  try {
    const r = await fetch(API + '/admin/users', { headers: authHeaders() });
    if(r.status === 401 || r.status === 403){ denyAccess(); return; }
    const data = await r.json();
    if(!r.ok){
      if(errorEl) errorEl.textContent = data.error || 'โหลดรายชื่อผู้ใช้ไม่สำเร็จ';
      return;
    }
    adminUsersCache = data.users || [];
    renderAdminStats();
    renderAdminUsers();
  } catch(e){
    if(errorEl) errorEl.textContent = 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ลองใหม่อีกครั้ง';
  }
}

// ── Stats ───────────────────────────────────────────────────────────────────

function renderAdminStats(){
  const total    = adminUsersCache.length;
  const disabled = adminUsersCache.filter(u => u.disabled).length;
  const locked   = adminUsersCache.filter(u => u.locked && !u.disabled).length;
  const active   = total - disabled - locked;

  function statCard(iconColor, glowColor, bgAlpha, iconSvg, count, label){
    return `
    <div class="adm-stat">
      <div class="adm-stat-icon" style="background:rgba(${iconColor},.15);box-shadow:0 0 16px rgba(${glowColor},.3)">
        ${iconSvg}
      </div>
      <div>
        <div class="adm-stat-num">${count}</div>
        <div class="adm-stat-label">${label}</div>
      </div>
    </div>`;
  }

  const grid = document.getElementById('adminStatsGrid');
  if(!grid) return;
  grid.innerHTML =
    statCard('99,102,241','99,102,241','.15',
      `<svg width="20" height="20" fill="none" stroke="#6366f1" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-7 8-7s8 3 8 7"/></svg>`,
      total, 'ผู้ใช้ทั้งหมด') +
    statCard('16,185,129','16,185,129','.15',
      `<svg width="20" height="20" fill="none" stroke="#10b981" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
      active, 'Active') +
    statCard('244,63,94','244,63,94','.15',
      `<svg width="20" height="20" fill="none" stroke="#f43f5e" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>`,
      disabled, 'Disabled') +
    statCard('245,158,11','245,158,11','.15',
      `<svg width="20" height="20" fill="none" stroke="#f59e0b" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`,
      locked, 'Locked');
}

// ── Filter ──────────────────────────────────────────────────────────────────

function setAdminFilter(f){
  adminFilter = f;
  // update chip UI
  document.querySelectorAll('#adminFilterChips .adm-filter-chip').forEach(chip => {
    chip.classList.toggle('active', chip.dataset.filter === f);
  });
  renderAdminUsers();
}

// ── Search ──────────────────────────────────────────────────────────────────

function adminSearch(q){
  adminSearchQuery = q.trim().toLowerCase();
  renderAdminUsers();
}

// ── Render users ────────────────────────────────────────────────────────────

function fmtLastLogin(ts){
  if(!ts) return 'ไม่มีข้อมูล';
  try {
    return new Date(ts).toLocaleString('th-TH', { dateStyle:'medium', timeStyle:'short' });
  } catch(_){ return String(ts); }
}

function renderAdminUsers(){
  const body = document.getElementById('adminUserList');
  if(!body) return;

  // Apply filter
  let list = adminUsersCache;
  if(adminFilter === 'active')   list = list.filter(u => !u.disabled && !u.locked);
  if(adminFilter === 'disabled') list = list.filter(u => u.disabled);
  if(adminFilter === 'locked')   list = list.filter(u => u.locked && !u.disabled);

  // Apply search
  if(adminSearchQuery){
    list = list.filter(u =>
      u.username.toLowerCase().includes(adminSearchQuery) ||
      (u.email || '').toLowerCase().includes(adminSearchQuery)
    );
  }

  if(!list.length){
    body.innerHTML = `<div class="adm-empty">${adminSearchQuery ? `ไม่พบผู้ใช้ที่ตรงกับ "${esc(adminSearchQuery)}"` : 'ไม่มีผู้ใช้งานในระบบ'}</div>`;
    return;
  }

  const cards = list.map((u, idx) => {
    const initials = (u.username || '?').charAt(0).toUpperCase();
    const avatarGrad = AVATAR_GRADIENTS[idx % AVATAR_GRADIENTS.length];

    // Status badge
    let statusBadge;
    if(u.disabled){
      statusBadge = `<span class="adm-status-badge adm-status-dis">✕ Disabled</span>`;
    } else if(u.locked){
      statusBadge = `<span class="adm-status-badge adm-status-lock">🔒 Locked</span>`;
    } else {
      statusBadge = `<span class="adm-status-badge adm-status-ok">● Active</span>`;
    }

    // Permission chips
    const perms = Object.keys(MENU_LABELS).map(m => {
      const on = (u.allowedMenus || []).includes(m);
      const cls = `adm-perm-chip ${on ? 'on ' + MENU_CLASSES[m] : 'off'}`;
      return `<span class="${cls}" onclick="adminTogglePermission('${esc(u.username)}','${m}',${!on})">${esc(MENU_LABELS[m])}</span>`;
    }).join('');

    // Admin chip (read-only — admin flag is server-side)
    const adminChip = u.isAdmin
      ? `<span class="adm-perm-chip on admin-chip" style="cursor:default">Admin</span>`
      : '';

    // Warning banner for locked
    const warnBanner = u.locked
      ? `<div class="adm-warn-banner">⚠️ ล็อกอัตโนมัติหลัง PIN ผิด 5 ครั้ง</div>`
      : '';

    // Action buttons
    let actions = '';
    if(u.locked && !u.disabled){
      actions += `<button class="adm-btn warn" onclick="adminUnlock('${esc(u.username)}')">🔒 ปลดล็อก</button>`;
    }
    if(u.disabled){
      actions += `<button class="adm-btn success" onclick="adminToggleDisabled('${esc(u.username)}',false)">✓ เปิดใช้งาน</button>`;
      actions += `<button class="adm-btn danger" onclick="adminDeleteUser('${esc(u.username)}')">🗑 ลบบัญชี</button>`;
    } else {
      actions += `<button class="adm-btn" onclick="adminEditUser('${esc(u.username)}')">🔑 แก้ไข</button>`;
      actions += `<button class="adm-btn" onclick="adminResetPin('${esc(u.username)}')">🔑 รีเซ็ต PIN</button>`;
      actions += `<button class="adm-btn danger" onclick="adminToggleDisabled('${esc(u.username)}',true)">✗ ระงับ</button>`;
    }

    return `
    <div class="adm-user-card">
      <div class="adm-user-top">
        <div class="adm-avatar" style="background:${avatarGrad}">${initials}</div>
        <div class="adm-user-info">
          <div class="adm-user-name">${esc(u.username)}</div>
          <div class="adm-user-email">${esc(u.email || '—')}</div>
        </div>
        ${statusBadge}
      </div>
      <div class="adm-perm-row">${perms}${adminChip}</div>
      <div class="adm-last-login">เข้าสู่ระบบล่าสุด: ${esc(fmtLastLogin(u.lastLoginAt))}</div>
      ${warnBanner}
      <div class="adm-actions">${actions}</div>
    </div>`;
  }).join('');

  body.innerHTML = `<div class="adm-user-grid">${cards}</div>`;
}

// ── Actions ─────────────────────────────────────────────────────────────────

async function adminToggleDisabled(username, disable){
  const errorEl = document.getElementById('adminError');
  if(errorEl) errorEl.textContent = '';
  try {
    const r = await fetch(`${API}/admin/users/${encodeURIComponent(username)}/${disable ? 'disable' : 'enable'}`, {
      method: 'POST', headers: authHeaders()
    });
    const data = await r.json();
    if(!r.ok){ if(errorEl) errorEl.textContent = data.error || 'ดำเนินการไม่สำเร็จ'; return; }
    showAdmToast(disable ? `ระงับ ${username} แล้ว` : `เปิดใช้งาน ${username} แล้ว`);
    await loadAdminUsers();
  } catch(e){
    if(errorEl) errorEl.textContent = 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ลองใหม่อีกครั้ง';
  }
}

async function adminUnlock(username){
  const errorEl = document.getElementById('adminError');
  if(errorEl) errorEl.textContent = '';
  try {
    // Try dedicated unlock endpoint first (may not exist yet)
    const r = await fetch(`${API}/admin/users/${encodeURIComponent(username)}/enable`, {
      method: 'POST', headers: authHeaders()
    });
    const data = await r.json();
    if(!r.ok){ if(errorEl) errorEl.textContent = data.error || 'ปลดล็อกไม่สำเร็จ'; return; }
    showAdmToast(`ปลดล็อก ${username} แล้ว`);
    await loadAdminUsers();
  } catch(e){
    if(errorEl) errorEl.textContent = 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ลองใหม่อีกครั้ง';
  }
}

async function adminTogglePermission(username, menu, enable){
  const errorEl = document.getElementById('adminError');
  if(errorEl) errorEl.textContent = '';
  const user = adminUsersCache.find(u => u.username === username);
  if(!user) return;

  let allowedMenus = (user.allowedMenus || []).slice();
  if(enable){
    if(!allowedMenus.includes(menu)) allowedMenus.push(menu);
  } else {
    allowedMenus = allowedMenus.filter(m => m !== menu);
  }
  if(!allowedMenus.length){
    if(errorEl) errorEl.textContent = 'ต้องเปิดให้เข้าใช้งานได้อย่างน้อย 1 เมนู';
    return;
  }

  // Optimistic update
  user.allowedMenus = allowedMenus;
  renderAdminUsers();

  try {
    const r = await fetch(`${API}/admin/users/${encodeURIComponent(username)}/permissions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ allowedMenus })
    });
    const data = await r.json();
    if(!r.ok){
      if(errorEl) errorEl.textContent = data.error || 'บันทึกสิทธิ์ไม่สำเร็จ';
      await loadAdminUsers(); // revert
    } else {
      showAdmToast('บันทึกสิทธิ์แล้ว');
    }
  } catch(e){
    if(errorEl) errorEl.textContent = 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ลองใหม่อีกครั้ง';
    await loadAdminUsers();
  }
}

async function adminDeleteUser(username){
  if(!confirm(`ลบบัญชี "${username}" ทิ้งทั้งหมด รวมถึงข้อมูลทุกอย่างที่บัญชีนี้เคยเพิ่มไว้?\n\nการกระทำนี้ไม่สามารถย้อนกลับได้`)) return;
  const errorEl = document.getElementById('adminError');
  if(errorEl) errorEl.textContent = '';
  try {
    const r = await fetch(`${API}/admin/users/${encodeURIComponent(username)}`, {
      method: 'DELETE', headers: authHeaders()
    });
    const data = await r.json();
    if(!r.ok){ if(errorEl) errorEl.textContent = data.error || 'ลบบัญชีไม่สำเร็จ'; return; }
    showAdmToast(`ลบบัญชี ${username} แล้ว`);
    await loadAdminUsers();
  } catch(e){
    if(errorEl) errorEl.textContent = 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ลองใหม่อีกครั้ง';
  }
}

function adminEditUser(username){
  showAdmToast('ฟีเจอร์แก้ไขผู้ใช้จะเพิ่มเร็วๆ นี้');
}

function adminResetPin(username){
  showAdmToast('ฟีเจอร์รีเซ็ต PIN จะเพิ่มเร็วๆ นี้');
}

function adminAddUser(){
  showAdmToast('ฟีเจอร์นี้จะเพิ่มเร็วๆ นี้');
}

// ── Boot ─────────────────────────────────────────────────────────────────────

initAdminPage();
