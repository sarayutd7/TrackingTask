const LEGACY_KV_KEY = "daily-todo-data";
const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;
const PIN_RE = /^\d{6}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days
const MAX_FAILED_ATTEMPTS = 5; // ครั้งที่ 6 จะถูกล็อกและ "ส่งอีเมล" แจ้งเตือน
const ADMIN_USERNAMES = new Set(["Yut"]);
const ALL_MENUS = ["task", "tool", "finance"];

const ALLOWED_ORIGINS = new Set([
  "https://sarayutd7.github.io",
  "https://trackingtask.online",
  "https://www.trackingtask.online",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
]);

function corsHeaders(request) {
  const origin = request.headers.get("Origin");
  const headers = {
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Expose-Headers": "X-Allowed-Menus",
    "Vary": "Origin",
  };
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

function jsonResponse(body, status, corsHdrs) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHdrs },
  });
}

// ── base64url helpers ────────────────────────────────
function bytesToB64Url(bytes) {
  let str = btoa(String.fromCharCode(...bytes));
  return str.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64UrlToBytes(str) {
  str = str.replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4) str += "=";
  const bin = atob(str);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}
function bytesToHex(bytes) {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  return bytes;
}

// ── Password hashing (PBKDF2-SHA256) ─────────────────
async function derivePasswordHash(password, salt) {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
    keyMaterial,
    256
  );
  return new Uint8Array(bits);
}

async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derivePasswordHash(password, salt);
  return { salt: bytesToHex(salt), hash: bytesToHex(hash) };
}

async function verifyPassword(password, salt, hash) {
  const computed = await derivePasswordHash(password, hexToBytes(salt));
  const expected = hexToBytes(hash);
  if (computed.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < computed.length; i++) diff |= computed[i] ^ expected[i];
  return diff === 0;
}

// ── JWT (HS256) ───────────────────────────────────────
async function hmacKey(secret) {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

async function signJWT(payload, secret) {
  const header = { alg: "HS256", typ: "JWT" };
  const headerB64 = bytesToB64Url(new TextEncoder().encode(JSON.stringify(header)));
  const payloadB64 = bytesToB64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const data = `${headerB64}.${payloadB64}`;
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(secret), new TextEncoder().encode(data));
  return `${data}.${bytesToB64Url(new Uint8Array(sig))}`;
}

async function verifyJWT(token, secret) {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [headerB64, payloadB64, sigB64] = parts;
  const data = `${headerB64}.${payloadB64}`;
  const valid = await crypto.subtle.verify(
    "HMAC",
    await hmacKey(secret),
    b64UrlToBytes(sigB64),
    new TextEncoder().encode(data)
  );
  if (!valid) return null;
  let payload;
  try {
    payload = JSON.parse(new TextDecoder().decode(b64UrlToBytes(payloadB64)));
  } catch (e) {
    return null;
  }
  if (typeof payload.exp !== "number" || Date.now() / 1000 > payload.exp) return null;
  return payload;
}

async function getAuthUser(request, env) {
  const auth = request.headers.get("Authorization") || "";
  const match = auth.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  const payload = await verifyJWT(match[1], env.JWT_SECRET);
  return payload ? payload.sub : null;
}

// ── OAuth ID token verification (Google / Microsoft) ─
// ตรวจ RS256 JWT จาก provider โดย verify signature ด้วย public key (JWKS) ของ provider เอง
// ไม่ต้องใช้ client secret เพราะเป็น public-client flow (ID token ออกให้ฝั่ง browser ตรงๆ)
async function verifyOAuthIdToken(idToken, jwksUrl, expectedAud, issuerOk) {
  if (typeof idToken !== "string") return null;
  const parts = idToken.split(".");
  if (parts.length !== 3) return null;
  const [headerB64, payloadB64, sigB64] = parts;
  let header, payload;
  try {
    header = JSON.parse(new TextDecoder().decode(b64UrlToBytes(headerB64)));
    payload = JSON.parse(new TextDecoder().decode(b64UrlToBytes(payloadB64)));
  } catch (e) {
    return null;
  }
  if (header.alg !== "RS256" || !header.kid) return null;

  const jwksRes = await fetch(jwksUrl);
  if (!jwksRes.ok) return null;
  const jwks = await jwksRes.json();
  const jwk = (jwks.keys || []).find((k) => k.kid === header.kid);
  if (!jwk) return null;

  let key;
  try {
    key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  } catch (e) {
    return null;
  }
  const data = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64UrlToBytes(sigB64), data);
  if (!valid) return null;

  const now = Date.now() / 1000;
  if (typeof payload.exp !== "number" || now > payload.exp) return null;
  if (payload.aud !== expectedAud) return null;
  if (!issuerOk(payload.iss)) return null;

  return payload;
}

// ถ้าอีเมลนี้ถูก "เชื่อม" (link) ไว้กับบัญชี username+PIN เดิมแล้ว ให้ login เข้าบัญชีนั้นแทน
// ไม่ใช่สร้างบัญชีแยกใหม่ตามอีเมล — ป้องกันปัญหาบัญชีซ้ำซ้อนเวลาคนเดิม sign in ด้วย Google/Microsoft
async function loginOrRegisterOAuthUser(env, email, provider, corsHdrs) {
  const normalizedEmail = email.toLowerCase();
  const linkedUsername = await env.TRACKING_TASK_KV.get(`oauthlink:${provider}:${normalizedEmail}`);
  const username = linkedUsername || normalizedEmail;

  const recordRaw = await env.TRACKING_TASK_KV.get(`user:${username}`);
  let userRec;
  if (!recordRaw) {
    if (linkedUsername) {
      return jsonResponse({ error: "บัญชีที่เชื่อมโยงไว้ไม่พบ กรุณาติดต่อผู้ดูแลระบบ" }, 404, corsHdrs);
    }
    userRec = {
      email: normalizedEmail,
      authProvider: provider,
      salt: "",
      hash: "",
      mustResetPin: false,
      failedAttempts: 0,
      locked: false,
      disabled: false,
      allowedMenus: ALL_MENUS.slice(),
    };
    await env.TRACKING_TASK_KV.put(`user:${username}`, JSON.stringify(userRec));
    await migrateLegacyDataTo(username, env);
  } else {
    userRec = JSON.parse(recordRaw);
    if (userRec.disabled) {
      return jsonResponse({ error: "บัญชีนี้ถูกระงับการใช้งาน กรุณาติดต่อผู้ดูแลระบบ" }, 403, corsHdrs);
    }
  }
  const now = Math.floor(Date.now() / 1000);
  const token = await signJWT({ sub: username, iat: now, exp: now + TOKEN_TTL_SECONDS }, env.JWT_SECRET);
  const allowedMenus = Array.isArray(userRec.allowedMenus) ? userRec.allowedMenus : ALL_MENUS.slice();
  return jsonResponse({ token, username, allowedMenus }, 200, corsHdrs);
}

// ── Request metadata (สำหรับแปะใน email แจ้งเตือนความปลอดภัย) ──
function getRequestMeta(request) {
  const ip = request.headers.get("CF-Connecting-IP") || "ไม่ทราบ";
  const cf = request.cf || {};
  const locationParts = [cf.city, cf.region, cf.country].filter(Boolean);
  const location = locationParts.length ? locationParts.join(", ") : "ไม่ทราบ";
  const userAgent = request.headers.get("User-Agent") || "ไม่ทราบ";
  const time = new Date().toLocaleString("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "medium", timeStyle: "medium" }) + " น. (เวลาไทย)";
  return { ip, location, userAgent, time };
}

// ── Email (Resend) ─────────────────────────────────────
// ส่งผ่าน Resend API (https://resend.com) — ต้องตั้ง Worker secret RESEND_API_KEY
// (และ verify domain ที่ resend.com ถ้าจะส่งจากอีเมล @trackingtask.online ของจริง)
// ถ้ายังไม่ตั้ง RESEND_API_KEY จะ fallback เป็น log ไว้ใน wrangler tail เหมือนเดิม
async function sendEmail(env, { to, subject, text }) {
  if (!env.RESEND_API_KEY) {
    console.log(`[EMAIL STUB] to=${to} subject="${subject}" body="${text}"`);
    return true;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: env.RESEND_FROM_EMAIL || "TrackingTask <onboarding@resend.dev>",
        to: [to],
        subject,
        text,
      }),
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      console.log(`[EMAIL FAILED] status=${res.status} to=${to} body=${errBody}`);
      return false;
    }
    return true;
  } catch (e) {
    console.log(`[EMAIL ERROR] ${e.message} to=${to}`);
    return false;
  }
}

// ── Per-account usage stats (record counts per menu) ──
const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;
function computeUsageStats(dataRaw) {
  let data;
  try {
    data = JSON.parse(dataRaw || "{}");
  } catch (e) {
    return { task: 0, note: 0, finance: 0 };
  }
  let task = 0;
  for (const key of Object.keys(data)) {
    if (DATE_KEY_RE.test(key) && Array.isArray(data[key])) task += data[key].length;
  }
  const note = Array.isArray(data._ql) ? data._ql.length : 0;
  let finance = 0;
  if (data._finance && typeof data._finance === "object") {
    for (const d of Object.keys(data._finance)) {
      if (Array.isArray(data._finance[d])) finance += data._finance[d].length;
    }
  }
  return { task, note, finance };
}

// ── Migration of legacy single-blob data ─────────────
async function migrateLegacyDataTo(username, env) {
  const migrated = await env.TRACKING_TASK_KV.get("migrated");
  if (migrated) return;
  const legacy = await env.TRACKING_TASK_KV.get(LEGACY_KV_KEY);
  if (legacy) {
    await env.TRACKING_TASK_KV.put(`data:${username}`, legacy);
  }
  await env.TRACKING_TASK_KV.put("migrated", "1");
}

// ── Per-menu KV split (task / tool[Note] / finance) ──
// แทนที่จะเก็บข้อมูลทั้งหมดของ user ไว้ใน key เดียว (data:<username>)
// แยกเป็น 3 key ตามเมนู เพื่อให้แต่ละเมนูเป็นอิสระต่อกัน
const TASK_OWN_KEYS = new Set(["_logs"]);
const TOOL_OWN_KEYS = new Set(["_ql", "_qlTags"]);
const FINANCE_OWN_KEYS = new Set([
  "_finance", "_bills", "_billPayments", "_incomeSources", "_incomeLogs", "_finPM", "_finTags",
]);

function menuDataKey(username, menu) {
  return `data:${username}:${menu}`;
}

function splitDataByMenu(data) {
  const task = {}, tool = {}, finance = {};
  for (const [k, v] of Object.entries(data || {})) {
    if (FINANCE_OWN_KEYS.has(k)) finance[k] = v;
    else if (TOOL_OWN_KEYS.has(k)) tool[k] = v;
    else task[k] = v; // date-keyed task arrays, _logs, and any unknown key default here (safe: never drops data)
  }
  return { task, tool, finance };
}

function mergeMenuData(task, tool, finance) {
  return { ...(task || {}), ...(tool || {}), ...(finance || {}) };
}

// อ่านข้อมูล user แบบ merge 3 ก้อนเข้าด้วยกัน — ถ้ายังไม่เคย split (ไม่มี flag splitv2:<username>)
// จะ migrate จาก data:<username> ก้อนเดียวเดิมแบบ lazy ในจังหวะนี้เลย (เก็บ key เดิมไว้เป็น backup ไม่ลบทิ้ง)
async function readUserDataSplit(username, env) {
  const migFlag = await env.TRACKING_TASK_KV.get(`splitv2:${username}`);
  if (!migFlag) {
    const oldRaw = await env.TRACKING_TASK_KV.get(`data:${username}`);
    let oldData = {};
    try { oldData = oldRaw ? JSON.parse(oldRaw) : {}; } catch (e) { oldData = {}; }
    const { task, tool, finance } = splitDataByMenu(oldData);
    await Promise.all([
      env.TRACKING_TASK_KV.put(menuDataKey(username, "task"), JSON.stringify(task)),
      env.TRACKING_TASK_KV.put(menuDataKey(username, "tool"), JSON.stringify(tool)),
      env.TRACKING_TASK_KV.put(menuDataKey(username, "finance"), JSON.stringify(finance)),
      env.TRACKING_TASK_KV.put(`splitv2:${username}`, "1"),
    ]);
    return { task, tool, finance };
  }
  const [taskRaw, toolRaw, financeRaw] = await Promise.all([
    env.TRACKING_TASK_KV.get(menuDataKey(username, "task")),
    env.TRACKING_TASK_KV.get(menuDataKey(username, "tool")),
    env.TRACKING_TASK_KV.get(menuDataKey(username, "finance")),
  ]);
  let task = {}, tool = {}, finance = {};
  try { task = taskRaw ? JSON.parse(taskRaw) : {}; } catch (e) { task = {}; }
  try { tool = toolRaw ? JSON.parse(toolRaw) : {}; } catch (e) { tool = {}; }
  try { finance = financeRaw ? JSON.parse(financeRaw) : {}; } catch (e) { finance = {}; }
  return { task, tool, finance };
}

async function writeUserDataSplit(username, data, env) {
  const { task, tool, finance } = splitDataByMenu(data);
  await Promise.all([
    env.TRACKING_TASK_KV.put(menuDataKey(username, "task"), JSON.stringify(task)),
    env.TRACKING_TASK_KV.put(menuDataKey(username, "tool"), JSON.stringify(tool)),
    env.TRACKING_TASK_KV.put(menuDataKey(username, "finance"), JSON.stringify(finance)),
    env.TRACKING_TASK_KV.put(`splitv2:${username}`, "1"),
  ]);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const CORS_HEADERS = corsHeaders(request);

    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (url.pathname === "/register" && request.method === "POST") {
      let body;
      try {
        body = await request.json();
      } catch (e) {
        return jsonResponse({ error: "Invalid JSON" }, 400, CORS_HEADERS);
      }
      const { username, password, email } = body || {};
      if (typeof username !== "string" || !USERNAME_RE.test(username)) {
        return jsonResponse({ error: "Username must be 3-20 characters (letters, numbers, underscore)" }, 400, CORS_HEADERS);
      }
      if (typeof password !== "string" || !PIN_RE.test(password)) {
        return jsonResponse({ error: "PIN ต้องเป็นตัวเลข 6 หลักเท่านั้น" }, 400, CORS_HEADERS);
      }
      if (typeof email !== "string" || !EMAIL_RE.test(email)) {
        return jsonResponse({ error: "กรุณาใส่อีเมลให้ถูกต้อง" }, 400, CORS_HEADERS);
      }

      const existing = await env.TRACKING_TASK_KV.get(`user:${username}`);
      if (existing) {
        return jsonResponse({ error: "Username already exists" }, 409, CORS_HEADERS);
      }

      const { salt, hash } = await hashPassword(password);
      await env.TRACKING_TASK_KV.put(`user:${username}`, JSON.stringify({
        salt, hash, email,
        mustResetPin: false,
        failedAttempts: 0,
        locked: false,
        disabled: false,
        allowedMenus: ALL_MENUS.slice(),
      }));
      await migrateLegacyDataTo(username, env);

      await sendEmail(env, {
        to: email,
        subject: "ยืนยันการสมัครสมาชิก TrackingTask",
        text: `สมัครสมาชิกด้วยชื่อผู้ใช้ ${username} สำเร็จแล้ว\n\nเข้าใช้งานได้ที่: https://trackingtask.online/`,
      });

      const now = Math.floor(Date.now() / 1000);
      const token = await signJWT({ sub: username, iat: now, exp: now + TOKEN_TTL_SECONDS }, env.JWT_SECRET);
      return jsonResponse({ token, username, allowedMenus: ALL_MENUS.slice() }, 200, CORS_HEADERS);
    }

    if (url.pathname === "/oauth/google" && request.method === "POST") {
      if (!env.GOOGLE_CLIENT_ID) {
        return jsonResponse({ error: "ยังไม่ได้ตั้งค่า Google Sign-In บนเซิร์ฟเวอร์" }, 501, CORS_HEADERS);
      }
      let body;
      try {
        body = await request.json();
      } catch (e) {
        return jsonResponse({ error: "Invalid JSON" }, 400, CORS_HEADERS);
      }
      const { credential } = body || {};
      const payload = await verifyOAuthIdToken(
        credential,
        "https://www.googleapis.com/oauth2/v3/certs",
        env.GOOGLE_CLIENT_ID,
        (iss) => iss === "https://accounts.google.com" || iss === "accounts.google.com"
      );
      if (!payload || !payload.email || payload.email_verified !== true) {
        return jsonResponse({ error: "ยืนยันตัวตนกับ Google ไม่สำเร็จ" }, 401, CORS_HEADERS);
      }
      return await loginOrRegisterOAuthUser(env, payload.email, "google", CORS_HEADERS);
    }

    if (url.pathname === "/oauth/microsoft" && request.method === "POST") {
      if (!env.MICROSOFT_CLIENT_ID) {
        return jsonResponse({ error: "ยังไม่ได้ตั้งค่า Microsoft Sign-In บนเซิร์ฟเวอร์" }, 501, CORS_HEADERS);
      }
      let body;
      try {
        body = await request.json();
      } catch (e) {
        return jsonResponse({ error: "Invalid JSON" }, 400, CORS_HEADERS);
      }
      const { credential } = body || {};
      const payload = await verifyOAuthIdToken(
        credential,
        "https://login.microsoftonline.com/common/discovery/v2.0/keys",
        env.MICROSOFT_CLIENT_ID,
        (iss) => /^https:\/\/login\.microsoftonline\.com\/[^/]+\/v2\.0$/.test(iss || "")
      );
      const email = payload && (payload.email || payload.preferred_username);
      if (!payload || !email) {
        return jsonResponse({ error: "ยืนยันตัวตนกับ Microsoft ไม่สำเร็จ" }, 401, CORS_HEADERS);
      }
      return await loginOrRegisterOAuthUser(env, email, "microsoft", CORS_HEADERS);
    }

    if (url.pathname === "/login" && request.method === "POST") {
      let body;
      try {
        body = await request.json();
      } catch (e) {
        return jsonResponse({ error: "Invalid JSON" }, 400, CORS_HEADERS);
      }
      const { username, password } = body || {};
      if (typeof username !== "string" || typeof password !== "string") {
        return jsonResponse({ error: "Invalid credentials" }, 401, CORS_HEADERS);
      }

      const recordRaw = await env.TRACKING_TASK_KV.get(`user:${username}`);
      if (!recordRaw) {
        return jsonResponse({ error: "Invalid credentials" }, 401, CORS_HEADERS);
      }
      const userRec = JSON.parse(recordRaw);

      if (userRec.disabled) {
        return jsonResponse({ error: "บัญชีนี้ถูกระงับการใช้งาน กรุณาติดต่อผู้ดูแลระบบ" }, 403, CORS_HEADERS);
      }

      if (userRec.locked) {
        return jsonResponse({ error: "บัญชีถูกล็อกเนื่องจากพยายามเข้าระบบผิดหลายครั้ง กรุณารีเซ็ต PIN ผ่านอีเมลที่แจ้งไว้" }, 423, CORS_HEADERS);
      }

      const ok = await verifyPassword(password, userRec.salt, userRec.hash);
      if (!ok) {
        userRec.failedAttempts = (userRec.failedAttempts || 0) + 1;
        if (userRec.failedAttempts > MAX_FAILED_ATTEMPTS) {
          userRec.locked = true;
          await env.TRACKING_TASK_KV.put(`user:${username}`, JSON.stringify(userRec));
          const meta = getRequestMeta(request);
          await sendEmail(env, {
            to: userRec.email,
            subject: "แจ้งเตือน: มีการพยายามเข้าระบบผิดหลายครั้ง",
            text: `บัญชี ${username} ถูกล็อกเนื่องจากพยายามเข้าระบบผิด ${userRec.failedAttempts} ครั้ง กรุณารีเซ็ต PIN\n\n`
              + `รายละเอียดความพยายามเข้าระบบล่าสุดที่ทำให้บัญชีถูกล็อก:\n`
              + `- เวลา: ${meta.time}\n`
              + `- IP Address: ${meta.ip}\n`
              + `- ตำแหน่งที่ตั้ง (โดยประมาณ): ${meta.location}\n`
              + `- อุปกรณ์/เบราว์เซอร์: ${meta.userAgent}\n\n`
              + `ถ้าไม่ใช่คุณ กรุณารีเซ็ต PIN ทันทีที่: https://trackingtask.online/`,
          });
          return jsonResponse({ error: "พยายามเข้าระบบผิดเกินกำหนด บัญชีถูกล็อกและส่งอีเมลแจ้งเตือนแล้ว" }, 423, CORS_HEADERS);
        }
        await env.TRACKING_TASK_KV.put(`user:${username}`, JSON.stringify(userRec));
        return jsonResponse({ error: "Invalid credentials" }, 401, CORS_HEADERS);
      }

      userRec.failedAttempts = 0;
      await env.TRACKING_TASK_KV.put(`user:${username}`, JSON.stringify(userRec));

      const now = Math.floor(Date.now() / 1000);
      const token = await signJWT({ sub: username, iat: now, exp: now + TOKEN_TTL_SECONDS }, env.JWT_SECRET);
      // record เก่าก่อนมีฟีเจอร์นี้จะไม่มี field mustResetPin เลย -> ถือว่าต้อง reset เป็น PIN 6 หลักก่อนใช้งานต่อ
      const mustResetPin = userRec.mustResetPin !== false;
      const allowedMenus = Array.isArray(userRec.allowedMenus) ? userRec.allowedMenus : ALL_MENUS.slice();
      return jsonResponse({ token, username, mustResetPin, allowedMenus }, 200, CORS_HEADERS);
    }

    if (url.pathname === "/verify-pin" && request.method === "POST") {
      const username = await getAuthUser(request, env);
      if (!username) {
        return jsonResponse({ error: "Unauthorized" }, 401, CORS_HEADERS);
      }
      let body;
      try {
        body = await request.json();
      } catch (e) {
        return jsonResponse({ error: "Invalid JSON" }, 400, CORS_HEADERS);
      }
      const { pin } = body || {};
      if (typeof pin !== "string" || !PIN_RE.test(pin)) {
        return jsonResponse({ error: "PIN ต้องเป็นตัวเลข 6 หลักเท่านั้น" }, 400, CORS_HEADERS);
      }
      const recordRaw = await env.TRACKING_TASK_KV.get(`user:${username}`);
      if (!recordRaw) {
        return jsonResponse({ error: "Unauthorized" }, 401, CORS_HEADERS);
      }
      const userRec = JSON.parse(recordRaw);
      const ok = await verifyPassword(pin, userRec.salt, userRec.hash);
      if (!ok) {
        return jsonResponse({ error: "PIN ไม่ถูกต้อง" }, 401, CORS_HEADERS);
      }
      return jsonResponse({ ok: true }, 200, CORS_HEADERS);
    }

    if (url.pathname === "/reset-pin" && request.method === "POST") {
      const username = await getAuthUser(request, env);
      if (!username) {
        return jsonResponse({ error: "Unauthorized" }, 401, CORS_HEADERS);
      }
      let body;
      try {
        body = await request.json();
      } catch (e) {
        return jsonResponse({ error: "Invalid JSON" }, 400, CORS_HEADERS);
      }
      const { newPin } = body || {};
      if (typeof newPin !== "string" || !PIN_RE.test(newPin)) {
        return jsonResponse({ error: "PIN ต้องเป็นตัวเลข 6 หลักเท่านั้น" }, 400, CORS_HEADERS);
      }
      const recordRaw = await env.TRACKING_TASK_KV.get(`user:${username}`);
      if (!recordRaw) {
        return jsonResponse({ error: "Unauthorized" }, 401, CORS_HEADERS);
      }
      const userRec = JSON.parse(recordRaw);
      const { salt, hash } = await hashPassword(newPin);
      userRec.salt = salt;
      userRec.hash = hash;
      userRec.mustResetPin = false;
      userRec.failedAttempts = 0;
      userRec.locked = false;
      await env.TRACKING_TASK_KV.put(`user:${username}`, JSON.stringify(userRec));
      return jsonResponse({ ok: true }, 200, CORS_HEADERS);
    }

    if (url.pathname === "/forgot-pin" && request.method === "POST") {
      let body;
      try {
        body = await request.json();
      } catch (e) {
        return jsonResponse({ error: "Invalid JSON" }, 400, CORS_HEADERS);
      }
      const { username, email } = body || {};
      if (typeof username !== "string" || !USERNAME_RE.test(username)) {
        return jsonResponse({ error: "Invalid username" }, 400, CORS_HEADERS);
      }
      // ตอบ ok เสมอไม่ว่า username/email จะตรงกับระบบหรือไม่ เพื่อไม่ให้เดา username ในระบบได้
      const recordRaw = await env.TRACKING_TASK_KV.get(`user:${username}`);
      if (recordRaw) {
        const userRec = JSON.parse(recordRaw);
        if (userRec.email && typeof email === "string" && email.trim().toLowerCase() === userRec.email.trim().toLowerCase()) {
          const code = String(Math.floor(100000 + Math.random() * 900000));
          const now = Math.floor(Date.now() / 1000);
          userRec.resetCode = code;
          userRec.resetCodeExpires = now + 15 * 60; // 15 นาที
          await env.TRACKING_TASK_KV.put(`user:${username}`, JSON.stringify(userRec));
          const meta = getRequestMeta(request);
          await sendEmail(env, {
            to: userRec.email,
            subject: "รหัสยืนยันสำหรับรีเซ็ต PIN — TrackingTask",
            text: `รหัสยืนยันของคุณคือ ${code} (มีอายุ 15 นาที) ใช้รหัสนี้เพื่อตั้ง PIN ใหม่สำหรับบัญชี ${username} ที่: https://trackingtask.online/\n\n`
              + `รายละเอียดคำขอนี้:\n`
              + `- เวลา: ${meta.time}\n`
              + `- IP Address: ${meta.ip}\n`
              + `- ตำแหน่งที่ตั้ง (โดยประมาณ): ${meta.location}\n`
              + `- อุปกรณ์/เบราว์เซอร์: ${meta.userAgent}\n\n`
              + `ถ้าไม่ใช่คุณที่ขอรีเซ็ต PIN กรุณาเพิกเฉยอีเมลนี้ได้เลย`,
          });
        }
      }
      return jsonResponse({ ok: true }, 200, CORS_HEADERS);
    }

    if (url.pathname === "/forgot-pin/confirm" && request.method === "POST") {
      let body;
      try {
        body = await request.json();
      } catch (e) {
        return jsonResponse({ error: "Invalid JSON" }, 400, CORS_HEADERS);
      }
      const { username, code, newPin } = body || {};
      if (typeof username !== "string" || !USERNAME_RE.test(username)) {
        return jsonResponse({ error: "Invalid username" }, 400, CORS_HEADERS);
      }
      if (typeof newPin !== "string" || !PIN_RE.test(newPin)) {
        return jsonResponse({ error: "PIN ต้องเป็นตัวเลข 6 หลักเท่านั้น" }, 400, CORS_HEADERS);
      }
      const recordRaw = await env.TRACKING_TASK_KV.get(`user:${username}`);
      if (!recordRaw) {
        return jsonResponse({ error: "รหัสยืนยันไม่ถูกต้องหรือหมดอายุ" }, 400, CORS_HEADERS);
      }
      const userRec = JSON.parse(recordRaw);
      const now = Math.floor(Date.now() / 1000);
      if (!userRec.resetCode || typeof code !== "string" || code !== userRec.resetCode || !userRec.resetCodeExpires || now > userRec.resetCodeExpires) {
        return jsonResponse({ error: "รหัสยืนยันไม่ถูกต้องหรือหมดอายุ" }, 400, CORS_HEADERS);
      }
      const { salt, hash } = await hashPassword(newPin);
      userRec.salt = salt;
      userRec.hash = hash;
      userRec.mustResetPin = false;
      userRec.failedAttempts = 0;
      userRec.locked = false;
      delete userRec.resetCode;
      delete userRec.resetCodeExpires;
      await env.TRACKING_TASK_KV.put(`user:${username}`, JSON.stringify(userRec));
      return jsonResponse({ ok: true }, 200, CORS_HEADERS);
    }

    if (url.pathname === "/account" && request.method === "GET") {
      const username = await getAuthUser(request, env);
      if (!username) {
        return jsonResponse({ error: "Unauthorized" }, 401, CORS_HEADERS);
      }
      const recordRaw = await env.TRACKING_TASK_KV.get(`user:${username}`);
      if (!recordRaw) {
        return jsonResponse({ error: "Unauthorized" }, 401, CORS_HEADERS);
      }
      const userRec = JSON.parse(recordRaw);
      return jsonResponse({ username, email: userRec.email || "", linkedGoogleEmail: userRec.linkedGoogleEmail || "" }, 200, CORS_HEADERS);
    }

    if (url.pathname === "/account/link-google" && request.method === "POST") {
      const username = await getAuthUser(request, env);
      if (!username) {
        return jsonResponse({ error: "Unauthorized" }, 401, CORS_HEADERS);
      }
      if (!env.GOOGLE_CLIENT_ID) {
        return jsonResponse({ error: "ยังไม่ได้ตั้งค่า Google Sign-In บนเซิร์ฟเวอร์" }, 501, CORS_HEADERS);
      }
      let body;
      try {
        body = await request.json();
      } catch (e) {
        return jsonResponse({ error: "Invalid JSON" }, 400, CORS_HEADERS);
      }
      const payload = await verifyOAuthIdToken(
        body.credential,
        "https://www.googleapis.com/oauth2/v3/certs",
        env.GOOGLE_CLIENT_ID,
        (iss) => iss === "https://accounts.google.com" || iss === "accounts.google.com"
      );
      if (!payload || !payload.email || payload.email_verified !== true) {
        return jsonResponse({ error: "ยืนยันตัวตนกับ Google ไม่สำเร็จ" }, 401, CORS_HEADERS);
      }
      const email = payload.email.toLowerCase();
      const linkKey = `oauthlink:google:${email}`;
      const existingLink = await env.TRACKING_TASK_KV.get(linkKey);
      if (existingLink && existingLink !== username) {
        return jsonResponse({ error: "อีเมล Google นี้ถูกเชื่อมกับบัญชีอื่นไปแล้ว" }, 409, CORS_HEADERS);
      }
      // ถ้ามีบัญชีที่ถูกสร้างแยกไว้ก่อนหน้าด้วยอีเมลนี้เอง (sign in ตรงๆโดยไม่ผ่านการเชื่อม) แต่ยังไม่มีข้อมูลจริง ให้ลบทิ้งรวมเป็นบัญชีเดียว
      if (email !== username.toLowerCase()) {
        const dupRaw = await env.TRACKING_TASK_KV.get(`user:${email}`);
        if (dupRaw) {
          const dupRec = JSON.parse(dupRaw);
          const dupData = await env.TRACKING_TASK_KV.get(`data:${email}`);
          const dupSplit = await Promise.all([
            env.TRACKING_TASK_KV.get(menuDataKey(email, "task")),
            env.TRACKING_TASK_KV.get(menuDataKey(email, "tool")),
            env.TRACKING_TASK_KV.get(menuDataKey(email, "finance")),
          ]);
          const hasSplitData = dupSplit.some((raw) => raw && raw !== "{}");
          if (dupData || hasSplitData) {
            return jsonResponse({ error: "มีบัญชีอื่นที่ใช้อีเมลนี้อยู่แล้วและมีข้อมูลอยู่ กรุณาติดต่อผู้ดูแลระบบเพื่อรวมบัญชี" }, 409, CORS_HEADERS);
          }
          if (dupRec.authProvider) {
            await env.TRACKING_TASK_KV.delete(`user:${email}`);
          }
        }
      }
      await env.TRACKING_TASK_KV.put(linkKey, username);
      const recordRaw = await env.TRACKING_TASK_KV.get(`user:${username}`);
      const userRec = JSON.parse(recordRaw);
      userRec.linkedGoogleEmail = email;
      await env.TRACKING_TASK_KV.put(`user:${username}`, JSON.stringify(userRec));
      return jsonResponse({ ok: true, linkedGoogleEmail: email }, 200, CORS_HEADERS);
    }

    if (url.pathname === "/account/unlink-google" && request.method === "POST") {
      const username = await getAuthUser(request, env);
      if (!username) {
        return jsonResponse({ error: "Unauthorized" }, 401, CORS_HEADERS);
      }
      const recordRaw = await env.TRACKING_TASK_KV.get(`user:${username}`);
      if (!recordRaw) {
        return jsonResponse({ error: "Unauthorized" }, 401, CORS_HEADERS);
      }
      const userRec = JSON.parse(recordRaw);
      if (userRec.linkedGoogleEmail) {
        await env.TRACKING_TASK_KV.delete(`oauthlink:google:${userRec.linkedGoogleEmail}`);
        delete userRec.linkedGoogleEmail;
        await env.TRACKING_TASK_KV.put(`user:${username}`, JSON.stringify(userRec));
      }
      return jsonResponse({ ok: true }, 200, CORS_HEADERS);
    }

    if (url.pathname === "/account" && request.method === "POST") {
      const username = await getAuthUser(request, env);
      if (!username) {
        return jsonResponse({ error: "Unauthorized" }, 401, CORS_HEADERS);
      }
      let body;
      try {
        body = await request.json();
      } catch (e) {
        return jsonResponse({ error: "Invalid JSON" }, 400, CORS_HEADERS);
      }
      const { currentPin, newEmail, newPin } = body || {};
      if (typeof currentPin !== "string" || !PIN_RE.test(currentPin)) {
        return jsonResponse({ error: "กรุณายืนยัน PIN ปัจจุบัน (6 หลัก)" }, 400, CORS_HEADERS);
      }
      if (newEmail != null && !EMAIL_RE.test(newEmail)) {
        return jsonResponse({ error: "กรุณาใส่อีเมลให้ถูกต้อง" }, 400, CORS_HEADERS);
      }
      if (newPin != null && !PIN_RE.test(newPin)) {
        return jsonResponse({ error: "PIN ใหม่ต้องเป็นตัวเลข 6 หลักเท่านั้น" }, 400, CORS_HEADERS);
      }
      const recordRaw = await env.TRACKING_TASK_KV.get(`user:${username}`);
      if (!recordRaw) {
        return jsonResponse({ error: "Unauthorized" }, 401, CORS_HEADERS);
      }
      const userRec = JSON.parse(recordRaw);
      const ok = await verifyPassword(currentPin, userRec.salt, userRec.hash);
      if (!ok) {
        return jsonResponse({ error: "PIN ปัจจุบันไม่ถูกต้อง" }, 401, CORS_HEADERS);
      }
      if (newEmail != null) {
        userRec.email = newEmail;
      }
      if (newPin != null) {
        const { salt, hash } = await hashPassword(newPin);
        userRec.salt = salt;
        userRec.hash = hash;
      }
      await env.TRACKING_TASK_KV.put(`user:${username}`, JSON.stringify(userRec));
      return jsonResponse({ ok: true }, 200, CORS_HEADERS);
    }

    if (url.pathname === "/admin/unlock" && request.method === "POST") {
      // ช่องทางปลดล็อกชั่วคราวระหว่างที่ยังไม่มีระบบอีเมลจริง (ใช้ ADMIN_SECRET เป็น Worker secret)
      const adminSecret = request.headers.get("X-Admin-Secret") || "";
      if (!env.ADMIN_SECRET || adminSecret !== env.ADMIN_SECRET) {
        return jsonResponse({ error: "Unauthorized" }, 401, CORS_HEADERS);
      }
      let body;
      try {
        body = await request.json();
      } catch (e) {
        return jsonResponse({ error: "Invalid JSON" }, 400, CORS_HEADERS);
      }
      const { username } = body || {};
      const recordRaw = await env.TRACKING_TASK_KV.get(`user:${username}`);
      if (!recordRaw) {
        return jsonResponse({ error: "User not found" }, 404, CORS_HEADERS);
      }
      const userRec = JSON.parse(recordRaw);
      userRec.locked = false;
      userRec.failedAttempts = 0;
      await env.TRACKING_TASK_KV.put(`user:${username}`, JSON.stringify(userRec));
      return jsonResponse({ ok: true }, 200, CORS_HEADERS);
    }

    if (url.pathname === "/admin/users" && request.method === "GET") {
      const username = await getAuthUser(request, env);
      if (!username || !ADMIN_USERNAMES.has(username)) {
        return jsonResponse({ error: "Unauthorized" }, 401, CORS_HEADERS);
      }
      const users = [];
      let cursor;
      do {
        const page = await env.TRACKING_TASK_KV.list({ prefix: "user:", cursor });
        for (const key of page.keys) {
          const uname = key.name.slice("user:".length);
          const recordRaw = await env.TRACKING_TASK_KV.get(key.name);
          if (!recordRaw) continue;
          const rec = JSON.parse(recordRaw);
          const { task, tool, finance } = await readUserDataSplit(uname, env);
          const merged = mergeMenuData(task, tool, finance);
          users.push({
            username: uname,
            email: rec.email || "",
            disabled: !!rec.disabled,
            locked: !!rec.locked,
            allowedMenus: Array.isArray(rec.allowedMenus) ? rec.allowedMenus : ALL_MENUS.slice(),
            stats: computeUsageStats(JSON.stringify(merged)),
          });
        }
        cursor = page.cursor;
      } while (cursor);
      return jsonResponse({ users }, 200, CORS_HEADERS);
    }

    const adminUserMatch = url.pathname.match(/^\/admin\/users\/([^/]+)(?:\/(disable|enable|permissions))?$/);
    if (adminUserMatch && (request.method === "POST" || request.method === "DELETE")) {
      const adminUsername = await getAuthUser(request, env);
      if (!adminUsername || !ADMIN_USERNAMES.has(adminUsername)) {
        return jsonResponse({ error: "Unauthorized" }, 401, CORS_HEADERS);
      }
      const targetUsername = decodeURIComponent(adminUserMatch[1]);
      const action = adminUserMatch[2];

      if (targetUsername === adminUsername) {
        return jsonResponse({ error: "ไม่สามารถจัดการบัญชีของตัวเองได้" }, 400, CORS_HEADERS);
      }

      const recordRaw = await env.TRACKING_TASK_KV.get(`user:${targetUsername}`);
      if (!recordRaw) {
        return jsonResponse({ error: "User not found" }, 404, CORS_HEADERS);
      }

      if (request.method === "DELETE") {
        await env.TRACKING_TASK_KV.delete(`user:${targetUsername}`);
        await env.TRACKING_TASK_KV.delete(`data:${targetUsername}`);
        await env.TRACKING_TASK_KV.delete(menuDataKey(targetUsername, "task"));
        await env.TRACKING_TASK_KV.delete(menuDataKey(targetUsername, "tool"));
        await env.TRACKING_TASK_KV.delete(menuDataKey(targetUsername, "finance"));
        await env.TRACKING_TASK_KV.delete(`splitv2:${targetUsername}`);
        return jsonResponse({ ok: true }, 200, CORS_HEADERS);
      }

      const userRec = JSON.parse(recordRaw);

      if (action === "permissions") {
        let body;
        try {
          body = await request.json();
        } catch (e) {
          return jsonResponse({ error: "Invalid JSON" }, 400, CORS_HEADERS);
        }
        const { allowedMenus } = body || {};
        if (!Array.isArray(allowedMenus) || allowedMenus.length === 0 || !allowedMenus.every((m) => ALL_MENUS.includes(m))) {
          return jsonResponse({ error: "allowedMenus ต้องเป็นรายการเมนูที่ถูกต้อง อย่างน้อย 1 เมนู" }, 400, CORS_HEADERS);
        }
        userRec.allowedMenus = allowedMenus;
        await env.TRACKING_TASK_KV.put(`user:${targetUsername}`, JSON.stringify(userRec));
        return jsonResponse({ ok: true }, 200, CORS_HEADERS);
      }

      // POST .../disable or .../enable
      if (action !== "disable" && action !== "enable") {
        return jsonResponse({ error: "Not Found" }, 404, CORS_HEADERS);
      }
      userRec.disabled = action === "disable";
      await env.TRACKING_TASK_KV.put(`user:${targetUsername}`, JSON.stringify(userRec));
      return jsonResponse({ ok: true }, 200, CORS_HEADERS);
    }

    if (url.pathname === "/data") {
      const username = await getAuthUser(request, env);
      if (!username) {
        return jsonResponse({ error: "Unauthorized" }, 401, CORS_HEADERS);
      }
      const userRecRaw = await env.TRACKING_TASK_KV.get(`user:${username}`);
      const userRec = userRecRaw ? JSON.parse(userRecRaw) : null;
      if (userRec && userRec.disabled) {
        return jsonResponse({ error: "บัญชีนี้ถูกระงับการใช้งาน กรุณาติดต่อผู้ดูแลระบบ" }, 403, CORS_HEADERS);
      }
      if (userRec && userRec.mustResetPin !== false) {
        return jsonResponse({ error: "PIN_RESET_REQUIRED" }, 403, CORS_HEADERS);
      }

      if (request.method === "GET") {
        const { task, tool, finance } = await readUserDataSplit(username, env);
        const merged = mergeMenuData(task, tool, finance);
        const allowedMenus = Array.isArray(userRec && userRec.allowedMenus) ? userRec.allowedMenus : ALL_MENUS.slice();
        return jsonResponse(merged, 200, { "X-Allowed-Menus": allowedMenus.join(","), ...CORS_HEADERS });
      }

      if (request.method === "POST") {
        let body, data;
        try {
          body = await request.text();
          data = JSON.parse(body); // Validate it's valid JSON before storing
        } catch (e) {
          return jsonResponse({ error: "Invalid JSON" }, 400, CORS_HEADERS);
        }

        await writeUserDataSplit(username, data, env);
        return jsonResponse({ ok: true }, 200, CORS_HEADERS);
      }

      return new Response("Method Not Allowed", { status: 405, headers: CORS_HEADERS });
    }

    return new Response("Not Found", { status: 404, headers: CORS_HEADERS });
  },
};
