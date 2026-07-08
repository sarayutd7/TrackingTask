# TrackingTask — CLAUDE.md

Project context and conventions for AI-assisted development.

---

## Project Overview

**TrackingTask** is a Thai-language personal management PWA covering:
- Daily task board (Kanban-style columns)
- Daily log (mood, blockers, notes per day)
- Note system (rich text, images, pinned/normal/hidden, load-more pagination)
- Finance module (bill payment tracking, income logging with sources)

Hosted on **GitHub Pages** (static frontend) + **Cloudflare Workers** backend with KV storage.

---

## Architecture

```
index.html          — single-page app shell, all modals inline
css/styles.css      — all styles (CSS custom properties for theming)
js/app.js           — all frontend logic (~3400+ lines, vanilla JS)
js/auth.js          — authentication flow (PIN login, Google/Microsoft OAuth)
js/admin.js         — admin panel logic
admin.html          — admin panel UI
src/index.js        — Cloudflare Worker (REST API + KV read/write)
sw.js               — service worker (cache: trackingtask-v2)
manifest.json       — PWA manifest
version.json        — current version { version, releaseDate, changelog }
CHANGELOG.md        — full version history (Keep a Changelog format)
_headers            — Cloudflare Pages/GitHub Pages security headers (CSP etc.)
wrangler.example.toml — template (real wrangler.toml is gitignored)
```

---

## Tech Stack

- **Frontend**: Vanilla HTML/CSS/JS — no framework, no build step
- **Backend**: Cloudflare Worker (`src/index.js`) — REST API, JWT auth, KV storage
- **Storage**: Cloudflare KV (per-user JSON blobs keyed by username)
- **Auth**: PBKDF2-hashed PIN (100k iterations), Google OAuth (JWKS verify), Microsoft OAuth
- **Icons**: Lucide-style SVG — stroke-width="2.2", stroke-linecap="round", stroke-linejoin="round", fill="none", viewBox="0 0 24 24"
- **Theming**: CSS custom properties (`--bg`, `--surface`, `--surface2`, `--accent`, `--text`, `--text-2`, `--text-3`, `--border`, `--border-hover`)

---

## Key Conventions

### Icons
All icons are **inline SVG**, Lucide-style:
```html
<svg width="16" height="16" fill="none" stroke="currentColor"
     stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"
     viewBox="0 0 24 24">
  <!-- paths -->
</svg>
```
- Do NOT use emoji or external icon libraries
- Mood emoji in `data-mood` attributes are kept as emoji strings (for data only)
- Weather icons use stroke-width="1.8" (slightly lighter)

### Theming
Always use CSS custom properties — never hardcode colors directly in components:
```css
color: var(--text);
background: var(--surface2);
border: 1px solid var(--border);
```
Light/dark theme is toggled via JS adding `data-theme` on `<html>`.

### JavaScript
- No frameworks — pure DOM manipulation
- Global functions called from `onclick=` attributes in HTML
- Data stored in `DB` object in memory, synced to KV via `writeFile()`
- `esc()` helper must be used on ALL user-controlled values inserted into innerHTML
- `compressImageToDataURL(file, maxDim, quality, maxBytes)` — guarantees ≤ 500KB output

### Version Management
- Versions follow semver: PATCH (bug/security/UI), MINOR (new feature), MAJOR (breaking)
- On any release: update `version.json` + prepend entry to `CHANGELOG.md` + update fallback in `index.html` (`id="appVersion"`)
- Version badge in sidebar is clickable → opens changelog modal (`openChangelogModal()`)

### Security Rules
- Always wrap user data in `esc()` before inserting into innerHTML
- Never use `Math.random()` for security-sensitive values — use `crypto.getRandomValues()`
- Rate-limit sensitive endpoints (e.g. `/forgot-pin/confirm` — 5 attempts max)
- Admin identity must come from server (`isAdmin` field in login response) — never hardcode in frontend
- `wrangler.toml` is gitignored — use `wrangler.example.toml` as reference

### Git / Commits
- **Never commit** `.mcp.json` or `wrangler.toml`
- **Never commit** without explicit user instruction
- **Never push** without explicit user instruction (commit and push are separate)
- Never touch `.github/workflows/`
- Never use `--no-verify`

---

## Key Functions (js/app.js)

| Function | Description |
|----------|-------------|
| `renderTasks()` | Re-renders task board |
| `renderQL()` | Re-renders Note grid (pinned/normal/hidden groups + pagination) |
| `qlPage`, `QL_PAGE_SIZE=20` | Load-more pagination state for notes |
| `renderIncomeSources()` | Re-renders income source list with monthly totals |
| `compressImageToDataURL()` | Image compression with binary-search quality guarantee |
| `loadWeather()` | GPS → Open-Meteo → renders weather icon+temp in `#dlWeather` and `#dlWeatherTopbar` |
| `loadAppVersion()` | Fetches version.json → updates `#appVersion` badge |
| `openChangelogModal()` | Shows changelog popup (called from version badge click) |
| `dlSetMood(emoji)` | Sets mood for current day (stores emoji string in DB) |
| `writeFile()` | Persists `DB` to Cloudflare KV via Worker API |
| `esc(str)` | HTML-escapes user-controlled strings before innerHTML insertion |
| `sanitizeRichHTML(html)` | Strips dangerous attrs/tags from rich text; allows only data:image/ in img src |

---

## Key HTML IDs

| ID | Purpose |
|----|---------|
| `appVersion` | Version badge in sidebar (clickable) |
| `dlWeather` | Weather widget in Daily Log header |
| `dlWeatherTopbar` | Weather widget in mobile topbar |
| `dlMoodBadge` | Mood emoji shown in Daily Log collapsed header |
| `dlMoodRow` | Container for 6 mood SVG pill buttons |
| `changelogModal` | Changelog popup modal |
| `appSidebar` | Desktop sidebar (`<aside>`) |
| `mobileTabTitle` | Page title in mobile topbar |

---

## Mood Pill Buttons

6 moods with per-mood accent color via `--mood-color` CSS var:

| data-mood | Color | Meaning |
|-----------|-------|---------|
| 😄 | `#f59e0b` | สุขมาก |
| 🙂 | `#84cc16` | สุข |
| 😐 | `#94a3b8` | ปกติ |
| 😔 | `#60a5fa` | เศร้า |
| 😴 | `#a78bfa` | เหนื่อย |
| 😡 | `#f87171` | โกรธ |

SVG face icons at 44×44px with springy `cubic-bezier(.34,1.56,.64,1)` transition.

---

## Weather Widget

- Source: [Open-Meteo](https://api.open-meteo.com/) — free, no API key
- Trigger: `navigator.geolocation.getCurrentPosition()`
- Cache: `sessionStorage` key `wx_cache`, 30-minute TTL
- Renders in two places: `#dlWeather` (Daily Log header) and `#dlWeatherTopbar` (mobile topbar)
- Silent failure on GPS deny or network error

---

## Security Posture (v1.0.1)

- ✅ Brute-force protection on PIN reset (5-attempt lockout)
- ✅ Cryptographically secure OTP (crypto.getRandomValues)
- ✅ XSS-safe image rendering (esc() on slip/image fields)
- ✅ sanitizeRichHTML blocks external img URLs
- ✅ Content-Security-Policy via `_headers`
- ✅ Admin identity server-side only
- ✅ wrangler.toml gitignored
- ⚠️ JWT stored in localStorage (known risk — HttpOnly cookie migration planned)

---

## Current Version

**v1.0.1** — Security patch (2026-07-08)
See `CHANGELOG.md` for full history.
