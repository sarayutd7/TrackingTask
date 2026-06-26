// ── Auth / Lock Screen ───────────────────────────────
const AUTH_TOKEN_KEY = 'trackingTaskToken';
const AUTH_USER_KEY = 'trackingTaskUser';
const AUTH_MENUS_KEY = 'trackingTaskAllowedMenus';
const ADMIN_USERNAME = 'Yut';
const MENU_TAB_BTN = { task: 'tabBtnTask', tool: 'tabBtnTool', finance: 'tabBtnFinance' };

// ── Sign in with Google / Microsoft ──────────────────
// Client ID (ไม่ใช่ secret) จาก Google Cloud Console / Azure Portal — เติมแล้วปุ่มจะโชว์เอง
const GOOGLE_CLIENT_ID = '273491289869-2hv9a0829st3nnelhhok3mq3dplf8ckv.apps.googleusercontent.com';
const MICROSOFT_CLIENT_ID = '';
let msalInstance = null;

function initOAuthSignIn(){
  if(!GOOGLE_CLIENT_ID && !MICROSOFT_CLIENT_ID) return;
  document.getElementById('oauthSignInSection').style.display = '';
  if(GOOGLE_CLIENT_ID){
    if(window.google && window.google.accounts){
      google.accounts.id.initialize({ client_id: GOOGLE_CLIENT_ID, callback: handleGoogleCredential });
      google.accounts.id.renderButton(document.getElementById('googleSignInBtn'), { theme: 'outline', size: 'large', width: 280 });
    } else {
      setTimeout(initOAuthSignIn, 200);
      return;
    }
  }
  if(MICROSOFT_CLIENT_ID){
    document.getElementById('msSignInBtn').style.display = '';
  }
}

async function handleGoogleCredential(response){
  const errorEl = document.getElementById('lockError');
  try {
    const r = await fetch(API + '/oauth/google', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ credential: response.credential })
    });
    const data = await r.json();
    if(!r.ok){ if(errorEl) errorEl.textContent = data.error || 'เข้าสู่ระบบด้วย Google ไม่สำเร็จ'; return; }
    localStorage.setItem(AUTH_TOKEN_KEY, data.token);
    localStorage.setItem(AUTH_USER_KEY, data.username);
    localStorage.setItem(AUTH_MENUS_KEY, JSON.stringify(data.allowedMenus || ['task','tool','finance']));
    await afterAuthSuccess();
  } catch(e){
    if(errorEl) errorEl.textContent = 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ลองใหม่อีกครั้ง';
  }
}

async function microsoftSignIn(){
  const errorEl = document.getElementById('lockError');
  errorEl.textContent = '';
  try {
    if(!msalInstance){
      msalInstance = new msal.PublicClientApplication({
        auth: { clientId: MICROSOFT_CLIENT_ID, authority: 'https://login.microsoftonline.com/common' }
      });
      await msalInstance.initialize();
    }
    const result = await msalInstance.loginPopup({ scopes: ['openid','email','profile'] });
    const r = await fetch(API + '/oauth/microsoft', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ credential: result.idToken })
    });
    const data = await r.json();
    if(!r.ok){ errorEl.textContent = data.error || 'เข้าสู่ระบบด้วย Microsoft ไม่สำเร็จ'; return; }
    localStorage.setItem(AUTH_TOKEN_KEY, data.token);
    localStorage.setItem(AUTH_USER_KEY, data.username);
    localStorage.setItem(AUTH_MENUS_KEY, JSON.stringify(data.allowedMenus || ['task','tool','finance']));
    await afterAuthSuccess();
  } catch(e){
    errorEl.textContent = 'เข้าสู่ระบบด้วย Microsoft ไม่สำเร็จ ลองใหม่อีกครั้ง';
  }
}

function getAllowedMenus(){
  if(localStorage.getItem(AUTH_USER_KEY) === ADMIN_USERNAME) return ['task','tool','finance'];
  try {
    const arr = JSON.parse(localStorage.getItem(AUTH_MENUS_KEY) || '["task","tool","finance"]');
    return Array.isArray(arr) && arr.length ? arr : ['task','tool','finance'];
  } catch(_){ return ['task','tool','finance']; }
}

function applyMenuPermissions(){
  const allowed = getAllowedMenus();
  Object.keys(MENU_TAB_BTN).forEach(tab=>{
    const btn = document.getElementById(MENU_TAB_BTN[tab]);
    if(btn) btn.style.display = allowed.includes(tab) ? '' : 'none';
  });
  const activeBtn = document.querySelector('.tab-btn.active');
  const activeTab = activeBtn && activeBtn.id === 'tabBtnTool' ? 'tool' : (activeBtn && activeBtn.id === 'tabBtnFinance' ? 'finance' : 'task');
  if(!allowed.includes(activeTab) && allowed.length && typeof switchTab === 'function'){
    switchTab(allowed[0]);
  }
}

function lockRegisterMode(){
  document.getElementById('lockIcon').textContent = '🔐';
  document.getElementById('lockSub').textContent = 'สมัครสมาชิกเพื่อเริ่มใช้งาน';
  document.getElementById('lockSubmitBtn').textContent = 'สมัครสมาชิก';
  document.getElementById('lockEmail').style.display = '';
  document.getElementById('lockPwConfirm').style.display = '';
  document.getElementById('lockPw').placeholder = 'PIN ใหม่ 6 หลัก';
  document.getElementById('lockPw').autocomplete = 'new-password';
  document.getElementById('lockError').textContent = '';
  document.getElementById('lockFooter').innerHTML =
    '<a onclick="lockLoginMode()">มีบัญชีอยู่แล้ว? เข้าสู่ระบบ</a>';
  document.getElementById('lockForgotLink').style.display = 'none';
}

function lockLoginMode(){
  document.getElementById('lockIcon').textContent = '🔒';
  document.getElementById('lockSub').textContent = 'เข้าสู่ระบบเพื่อใช้งาน';
  document.getElementById('lockSubmitBtn').textContent = 'เข้าสู่ระบบ';
  document.getElementById('lockEmail').style.display = 'none';
  document.getElementById('lockPwConfirm').style.display = 'none';
  document.getElementById('lockPw').placeholder = 'PIN 6 หลัก';
  document.getElementById('lockPw').autocomplete = 'current-password';
  document.getElementById('lockError').textContent = '';
  document.getElementById('lockFooter').innerHTML =
    '<a onclick="lockRegisterMode()">ยังไม่มีบัญชี? สมัครสมาชิก</a>';
  document.getElementById('lockForgotLink').style.display = '';
}

function lockShow(){
  document.getElementById('lockUser').value = '';
  document.getElementById('lockEmail').value = '';
  document.getElementById('lockPw').value = '';
  document.getElementById('lockPwConfirm').value = '';
  document.getElementById('lockError').textContent = '';
  lockLoginMode();
  document.getElementById('lockScreen').style.display = 'flex';
  document.getElementById('headerLockBtn').style.display = 'none';
  document.getElementById('headerAccountBtn').style.display = 'none';
  document.getElementById('headerAdminBtn').style.display = 'none';
  document.getElementById('userGreeting').style.display = 'none';
  setTimeout(()=>document.getElementById('lockUser').focus(), 80);
  initOAuthSignIn();
}

function lockHide(){
  document.getElementById('lockScreen').style.display = 'none';
  const loggedIn = !!localStorage.getItem(AUTH_TOKEN_KEY);
  document.getElementById('headerLockBtn').style.display = loggedIn ? '' : 'none';
  document.getElementById('headerAccountBtn').style.display = loggedIn ? '' : 'none';
  const greetingEl = document.getElementById('userGreeting');
  const uname = localStorage.getItem(AUTH_USER_KEY);
  document.getElementById('headerAdminBtn').style.display = (loggedIn && uname === ADMIN_USERNAME) ? '' : 'none';
  if(loggedIn && uname){
    greetingEl.textContent = `Hi, ${uname} วันนี้เป็นอย่างไรบ้าง`;
    greetingEl.style.display = '';
  } else {
    greetingEl.style.display = 'none';
  }
}

function lockApp(){
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_USER_KEY);
  DB = {};
  render();
  renderDL();
  lockShow();
}

async function afterAuthSuccess(){
  lockHide();
  applyMenuPermissions();
  try {
    await loadFile();
    render();
    loadDL();
    renderDL();
    loadQLTags();
    loadQL();
    renderQlFilterBar();
    renderQL();
  } catch(e){
    console.error('afterAuthSuccess render error:', e);
  }
}

const PIN_RE = /^\d{6}$/;

async function lockSubmit(){
  const username = document.getElementById('lockUser').value.trim();
  const email = document.getElementById('lockEmail').value.trim();
  const pw = document.getElementById('lockPw').value;
  const confirmEl = document.getElementById('lockPwConfirm');
  const errorEl = document.getElementById('lockError');
  const box = document.getElementById('lockBox');
  const isRegister = confirmEl.style.display !== 'none';

  if(!username){ errorEl.textContent='กรุณาใส่ชื่อผู้ใช้'; return; }
  if(isRegister && !email){ errorEl.textContent='กรุณาใส่อีเมล (ใช้สำหรับลืมรหัส/แจ้งเตือน)'; return; }
  if(!pw){ errorEl.textContent='กรุณาใส่ PIN'; return; }
  if(!PIN_RE.test(pw)){ errorEl.textContent='PIN ต้องเป็นตัวเลข 6 หลักเท่านั้น'; return; }

  if(isRegister){
    const confirm = confirmEl.value;
    if(!confirm){ errorEl.textContent='กรุณายืนยัน PIN'; return; }
    if(pw !== confirm){
      errorEl.textContent='PIN ไม่ตรงกัน';
      box.classList.remove('lock-shake');
      void box.offsetWidth;
      box.classList.add('lock-shake');
      return;
    }
  }

  const endpoint = isRegister ? '/register' : '/login';
  const payload = isRegister ? { username, password: pw, email } : { username, password: pw };
  try {
    const r = await fetch(API + endpoint, {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify(payload)
    });
    const data = await r.json();
    if(!r.ok){
      errorEl.textContent = data.error || (isRegister ? 'สมัครสมาชิกไม่สำเร็จ' : 'เข้าสู่ระบบไม่สำเร็จ');
      box.classList.remove('lock-shake');
      void box.offsetWidth;
      box.classList.add('lock-shake');
      return;
    }
    localStorage.setItem(AUTH_TOKEN_KEY, data.token);
    localStorage.setItem(AUTH_USER_KEY, data.username);
    localStorage.setItem(AUTH_MENUS_KEY, JSON.stringify(data.allowedMenus || ['task','tool','finance']));
    errorEl.textContent='';
    if(isRegister) showToast('สมัครสมาชิกสำเร็จ 🔓');
    if(data.mustResetPin){
      document.getElementById('lockScreen').style.display = 'none';
      showResetPinScreen();
      return;
    }
    await afterAuthSuccess();
  } catch(e){
    errorEl.textContent = 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ลองใหม่อีกครั้ง';
  }
}

function showResetPinScreen(){
  document.getElementById('resetPinNew').value = '';
  document.getElementById('resetPinConfirm').value = '';
  document.getElementById('resetPinError').textContent = '';
  document.getElementById('resetPinScreen').style.display = 'flex';
  setTimeout(()=>document.getElementById('resetPinNew').focus(), 80);
}

async function submitResetPin(){
  const newPin = document.getElementById('resetPinNew').value;
  const confirmPin = document.getElementById('resetPinConfirm').value;
  const errorEl = document.getElementById('resetPinError');
  const box = document.getElementById('resetPinBox');
  if(!PIN_RE.test(newPin)){ errorEl.textContent='PIN ต้องเป็นตัวเลข 6 หลักเท่านั้น'; return; }
  if(newPin !== confirmPin){
    errorEl.textContent='PIN ไม่ตรงกัน';
    box.classList.remove('lock-shake'); void box.offsetWidth; box.classList.add('lock-shake');
    return;
  }
  try {
    const r = await fetch(API + '/reset-pin', {
      method: 'POST',
      headers: {'Content-Type':'application/json', ...authHeaders()},
      body: JSON.stringify({ newPin })
    });
    const data = await r.json();
    if(!r.ok){
      errorEl.textContent = data.error || 'ตั้งค่า PIN ใหม่ไม่สำเร็จ';
      box.classList.remove('lock-shake'); void box.offsetWidth; box.classList.add('lock-shake');
      return;
    }
    document.getElementById('resetPinScreen').style.display = 'none';
    showToast('ตั้งค่า PIN ใหม่สำเร็จ 🔑');
    await afterAuthSuccess();
  } catch(e){
    errorEl.textContent = 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ลองใหม่อีกครั้ง';
  }
}

async function openAccountModal(){
  document.getElementById('accountError').textContent = '';
  document.getElementById('accountNewPin').value = '';
  document.getElementById('accountCurrentPin').value = '';
  document.getElementById('accountUsername').value = localStorage.getItem(AUTH_USER_KEY) || '';
  document.getElementById('accountEmail').value = '';
  document.getElementById('accountOverlay').style.display = 'flex';
  try {
    const r = await fetch(API + '/account', { headers: authHeaders() });
    if(r.status === 401){ closeAccountModal(); sessionExpired(); return; }
    const data = await r.json();
    if(r.ok){
      document.getElementById('accountUsername').value = data.username;
      document.getElementById('accountEmail').value = data.email || '';
    }
  } catch(e){
    document.getElementById('accountError').textContent = 'โหลดข้อมูลบัญชีไม่สำเร็จ ลองใหม่อีกครั้ง';
  }
}

function closeAccountModal(){
  document.getElementById('accountOverlay').style.display = 'none';
}

async function saveAccount(){
  const newEmail = document.getElementById('accountEmail').value.trim();
  const newPin = document.getElementById('accountNewPin').value;
  const currentPin = document.getElementById('accountCurrentPin').value;
  const errorEl = document.getElementById('accountError');

  if(!EMAIL_RE.test(newEmail)){ errorEl.textContent = 'กรุณาใส่อีเมลให้ถูกต้อง'; return; }
  if(newPin && !PIN_RE.test(newPin)){ errorEl.textContent = 'PIN ใหม่ต้องเป็นตัวเลข 6 หลักเท่านั้น'; return; }
  if(!PIN_RE.test(currentPin)){ errorEl.textContent = 'กรุณายืนยัน PIN ปัจจุบัน (6 หลัก)'; return; }

  try {
    const r = await fetch(API + '/account', {
      method: 'POST',
      headers: {'Content-Type':'application/json', ...authHeaders()},
      body: JSON.stringify({ currentPin, newEmail, newPin: newPin || null })
    });
    const data = await r.json();
    if(!r.ok){
      errorEl.textContent = data.error || 'บันทึกไม่สำเร็จ';
      return;
    }
    closeAccountModal();
    showToast('บันทึกข้อมูลบัญชีสำเร็จ ✅');
  } catch(e){
    errorEl.textContent = 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ลองใหม่อีกครั้ง';
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function showForgotPinScreen(){
  document.getElementById('lockScreen').style.display = 'none';
  document.getElementById('forgotPinUser').value = document.getElementById('lockUser').value.trim();
  document.getElementById('forgotPinEmail').value = '';
  document.getElementById('forgotPinCode').value = '';
  document.getElementById('forgotPinNewPin').value = '';
  document.getElementById('forgotPinNewPinConfirm').value = '';
  document.getElementById('forgotPinError').textContent = '';
  document.getElementById('forgotPinConfirmError').textContent = '';
  document.getElementById('forgotPinSub').textContent = 'ใส่ชื่อผู้ใช้และอีเมลที่ลงทะเบียนไว้ เพื่อรับรหัสยืนยัน';
  document.getElementById('forgotPinStep1').style.display = '';
  document.getElementById('forgotPinStep2').style.display = 'none';
  document.getElementById('forgotPinScreen').style.display = 'flex';
  setTimeout(()=>document.getElementById('forgotPinUser').focus(), 80);
}

function hideForgotPinScreen(){
  document.getElementById('forgotPinScreen').style.display = 'none';
  lockShow();
}

async function submitForgotPinRequest(){
  const username = document.getElementById('forgotPinUser').value.trim();
  const email = document.getElementById('forgotPinEmail').value.trim();
  const errorEl = document.getElementById('forgotPinError');
  const box = document.getElementById('forgotPinBox');
  if(!username){ errorEl.textContent = 'กรุณาใส่ชื่อผู้ใช้'; return; }
  if(!email){ errorEl.textContent = 'กรุณาใส่อีเมล'; return; }
  try {
    const r = await fetch(API + '/forgot-pin', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ username, email })
    });
    if(!r.ok){
      errorEl.textContent = 'ส่งคำขอไม่สำเร็จ ลองใหม่อีกครั้ง';
      box.classList.remove('lock-shake'); void box.offsetWidth; box.classList.add('lock-shake');
      return;
    }
    errorEl.textContent = '';
    showToast('ถ้าข้อมูลถูกต้อง ระบบได้ส่งรหัสยืนยันไปที่อีเมลแล้ว 📧');
    document.getElementById('forgotPinSub').textContent = 'กรอกรหัสยืนยันที่ได้รับทางอีเมล (อายุ 15 นาที) และตั้ง PIN ใหม่';
    document.getElementById('forgotPinStep1').style.display = 'none';
    document.getElementById('forgotPinStep2').style.display = '';
    setTimeout(()=>document.getElementById('forgotPinCode').focus(), 80);
  } catch(e){
    errorEl.textContent = 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ลองใหม่อีกครั้ง';
  }
}

async function submitForgotPinConfirm(){
  const username = document.getElementById('forgotPinUser').value.trim();
  const code = document.getElementById('forgotPinCode').value.trim();
  const newPin = document.getElementById('forgotPinNewPin').value;
  const confirmPin = document.getElementById('forgotPinNewPinConfirm').value;
  const errorEl = document.getElementById('forgotPinConfirmError');
  const box = document.getElementById('forgotPinBox');
  if(!code){ errorEl.textContent = 'กรุณาใส่รหัสยืนยัน'; return; }
  if(!PIN_RE.test(newPin)){ errorEl.textContent = 'PIN ต้องเป็นตัวเลข 6 หลักเท่านั้น'; return; }
  if(newPin !== confirmPin){
    errorEl.textContent = 'PIN ไม่ตรงกัน';
    box.classList.remove('lock-shake'); void box.offsetWidth; box.classList.add('lock-shake');
    return;
  }
  try {
    const r = await fetch(API + '/forgot-pin/confirm', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ username, code, newPin })
    });
    const data = await r.json();
    if(!r.ok){
      errorEl.textContent = data.error || 'รหัสยืนยันไม่ถูกต้องหรือหมดอายุ';
      box.classList.remove('lock-shake'); void box.offsetWidth; box.classList.add('lock-shake');
      return;
    }
    document.getElementById('forgotPinScreen').style.display = 'none';
    showToast('ตั้งค่า PIN ใหม่สำเร็จ กรุณาเข้าสู่ระบบอีกครั้ง 🔑');
    lockShow();
  } catch(e){
    errorEl.textContent = 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ลองใหม่อีกครั้ง';
  }
}

// เรียกตอน app โหลด
if(localStorage.getItem(AUTH_TOKEN_KEY)){
  lockHide();
} else {
  lockShow();
}
