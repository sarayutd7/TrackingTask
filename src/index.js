const LEGACY_KV_KEY = "daily-todo-data";
const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;
const TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

const ALLOWED_ORIGINS = new Set([
  "https://sarayutd7.github.io",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
]);

function corsHeaders(request) {
  const origin = request.headers.get("Origin");
  const headers = {
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
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
      const { username, password } = body || {};
      if (typeof username !== "string" || !USERNAME_RE.test(username)) {
        return jsonResponse({ error: "Username must be 3-20 characters (letters, numbers, underscore)" }, 400, CORS_HEADERS);
      }
      if (typeof password !== "string" || password.length < 4) {
        return jsonResponse({ error: "Password must be at least 4 characters" }, 400, CORS_HEADERS);
      }

      const existing = await env.TRACKING_TASK_KV.get(`user:${username}`);
      if (existing) {
        return jsonResponse({ error: "Username already exists" }, 409, CORS_HEADERS);
      }

      const { salt, hash } = await hashPassword(password);
      await env.TRACKING_TASK_KV.put(`user:${username}`, JSON.stringify({ salt, hash }));
      await migrateLegacyDataTo(username, env);

      const now = Math.floor(Date.now() / 1000);
      const token = await signJWT({ sub: username, iat: now, exp: now + TOKEN_TTL_SECONDS }, env.JWT_SECRET);
      return jsonResponse({ token, username }, 200, CORS_HEADERS);
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

      const record = await env.TRACKING_TASK_KV.get(`user:${username}`);
      if (!record) {
        return jsonResponse({ error: "Invalid credentials" }, 401, CORS_HEADERS);
      }
      const { salt, hash } = JSON.parse(record);
      const ok = await verifyPassword(password, salt, hash);
      if (!ok) {
        return jsonResponse({ error: "Invalid credentials" }, 401, CORS_HEADERS);
      }

      const now = Math.floor(Date.now() / 1000);
      const token = await signJWT({ sub: username, iat: now, exp: now + TOKEN_TTL_SECONDS }, env.JWT_SECRET);
      return jsonResponse({ token, username }, 200, CORS_HEADERS);
    }

    if (url.pathname === "/data") {
      const username = await getAuthUser(request, env);
      if (!username) {
        return jsonResponse({ error: "Unauthorized" }, 401, CORS_HEADERS);
      }

      if (request.method === "GET") {
        const value = await env.TRACKING_TASK_KV.get(`data:${username}`);
        return new Response(value || "{}", {
          status: 200,
          headers: { "Content-Type": "application/json", ...CORS_HEADERS },
        });
      }

      if (request.method === "POST") {
        let body;
        try {
          body = await request.text();
          // Validate it's valid JSON before storing
          JSON.parse(body);
        } catch (e) {
          return jsonResponse({ error: "Invalid JSON" }, 400, CORS_HEADERS);
        }

        await env.TRACKING_TASK_KV.put(`data:${username}`, body);
        return jsonResponse({ ok: true }, 200, CORS_HEADERS);
      }

      return new Response("Method Not Allowed", { status: 405, headers: CORS_HEADERS });
    }

    return new Response("Not Found", { status: 404, headers: CORS_HEADERS });
  },
};
