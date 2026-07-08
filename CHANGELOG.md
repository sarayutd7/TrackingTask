# Changelog — TrackingTask

TrackingTask is a Progressive Web App (PWA) for daily personal management, covering task tracking, note-taking, and personal finance (bill payments and income logging). It is built as a mobile-first web application with Thai-language UI, offline support via a service worker, and Cloudflare Workers backend.

All notable changes to this project will be documented in this file.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) and this project adheres to [Semantic Versioning](https://semver.org/).

---

## [1.0.7] — 2026-07-08

### Fixed — Aurora CSS audit fixes

- `.dl-section`: background changed from old `rgba(15,17,23,0.82)` + backdrop-filter → solid `var(--surface)`
- `.ql-card`: background changed from `rgba(20,22,35,0.9)` → solid `var(--surface)`
- `.fin-card` (entry rows): background changed from `rgba(20,22,35,0.9)` → solid `var(--surface)`
- `.app-sidebar` (desktop): background changed from `rgba(10,12,20,0.88)` + blur → solid `var(--bg2)`
- Added missing CSS classes: `.ql-card-inner`, `.ql-type-badge.type-permanent/.type-fleeting`, `.sb-user-wrap`, `.sb-weather-wrap`, `.bill-paid`, `.bill-due`, `.fin-card.income/.expense/.balance`
- Fixed color swatch values to exact Aurora palette: purple `#8b5cf6`, green `#10b981`, yellow `#f59e0b`, red `#f43f5e`

## [1.0.6] — 2026-07-08

### Changed — Aurora UI Full Remodel (matches demo exactly)

**Design System (`css/styles.css` — complete rewrite)**
- `:root` tokens now exactly match Aurora demo: `--bg: #0f1117`, `--surface: #1a1d2e`, `--surface2: #1f2235`, `--surface3: #252840`, `--border: rgba(255,255,255,0.07)`, `--grad-accent: linear-gradient(135deg,#6366f1,#8b5cf6)` plus all gradient variants (indigo/cyan/amber/green/red)
- Body: `background: var(--bg)` — solid dark, no more transparent rgba surfaces
- Stat cards: solid gradient backgrounds per color class (`.stat-card.indigo`, `.amber`, `.green`) with matching glow icon circles — exactly as demo
- Sidebar active item: full `linear-gradient(135deg,#6366f1,#8b5cf6)` background with glow shadow — replaces old border-left approach
- Kanban columns: `background: var(--surface)`, 4px gradient header accent strip via `::before`
- Task cards: `background: var(--surface2)`, per-column-color hover glows + translateY lift
- Note cards: left 4px accent strip via `border-left`, corner decoration via `::before`, pinned amber glow border
- Finance summary cards: gradient backgrounds (green/red/indigo) per income/expense/net type
- Modals: `rgba(20,23,38,.96)` + `backdrop-filter:blur(24px)` + `rgba(99,102,241,.2)` border
- Daily Log: 2px rainbow top strip via `::before`, mood pill circular glow active state
- All Aurora keyframes: `auroraShimmer`, `glowPulse`, `strip-slide`, `progress-shimmer`

**`js/app.js`**
- `renderStats()`: maps column colors to Aurora classes (`purple→indigo`, `amber→amber`, `green→green`) — stat cards now use `.stat-card.indigo/amber/green` for gradient backgrounds
- `renderBoard()`: column body wrapped in `.col-body` for correct padding
- `qlCardHtml()`: added `.ql-card-inner` wrapper with left-padding offset for accent strip, type badges use CSS classes `ql-type-badge type-permanent/type-fleeting`
- `renderFinance()`: summary cards use `.stat-card.green/.red/.indigo` matching Aurora gradient pattern
- `billRowHtml()`: bill status badges use `.bill-paid` / `.bill-due` classes

**`index.html`**
- Sidebar user section wrapped in `.sb-user-wrap` div with gradient avatar
- `#dlWeather` moved into sidebar footer as `.sb-weather-wrap`
- `#aurora-top-bar` 3px rainbow strip already present (confirmed)

**`admin.html` + `js/admin.js`**
- Full Aurora admin panel rewrite: 4-column stat grid with glow icon circles
- 2-column user card grid with gradient avatars, status pills (active/locked/disabled), permission chips, Aurora action buttons
- All existing IDs preserved for JS compatibility

## [1.0.5] — 2026-07-08

### Changed
- Removed weather canvas background animation (`#weatherBg { display: none }`) — weather still shows as icon+temperature in topbar
- Body background changed to static Aurora radial gradient: indigo glow top-left + violet glow bottom-right on `#0f1117`
- All card surfaces updated to solid `rgba(20,22,35,0.9)` — no longer need backdrop-filter blur

## [1.0.4] — 2026-07-08

### Fixed — Aurora UI Readability

- `#weatherBg` canvas opacity reduced to `0.45` so animation doesn't overwhelm content
- `.card` (task cards): background changed from near-transparent `rgba(255,255,255,0.03)` → `rgba(15,17,23,0.82)` + `backdrop-filter: blur(8px)` for readable frosted-glass look
- `.col` (kanban columns): `rgba(15,17,23,0.72)` + blur + indigo border — prevents weather bleed-through
- `.stat-card`: `rgba(15,17,23,0.80)` + stronger indigo border `rgba(99,102,241,0.2)`
- `.ql-card` (note cards): `rgba(15,17,23,0.82)` + indigo border — same treatment
- `.fin-card` (finance rows): `rgba(15,17,23,0.82)` + indigo left accent `rgba(99,102,241,0.3)`

## [1.0.3] — 2026-07-08

### Changed — Aurora UI Redesign (all 4 menus)

**Design System (`css/styles.css` — full rewrite)**
- New Aurora color tokens: `--bg: #0f1117`, indigo-violet gradient accent (`#6366f1` → `#8b5cf6`), cyan `#06b6d4`, amber `#f59e0b`
- Glassmorphism cards: `rgba(99,102,241,0.055)` surface + `rgba(255,255,255,0.07)` border
- Stat icon circles: 44px with per-color glow `box-shadow`
- Kanban columns: 3px gradient top strip per column color via `::before` pseudo-element
- Task cards: Aurora indigo hover glow + `translateY(-1px)` lift
- Progress bar: 3-stop indigo→violet→cyan gradient with shimmer animation
- Priority badges: Aurora glow with matching border
- Note cards: left 4px accent strip (replaces top bar), amber shimmer border for pinned
- Finance rows: glass surface + Aurora indigo hover; income/expense amounts in green/red bold
- Daily log: Aurora glass panel, mood pill active state glows with mood color
- Sidebar: `rgba(10,12,20,0.88)` + `blur(20px)`, active item with indigo gradient + left border
- Added keyframes: `auroraShimmer`, `glowPulse`, `progressShimmer`

**`index.html`**
- Fixed 3px animated Aurora shimmer bar at very top of page
- Sidebar gradient avatar (`#6366f1` → `#8b5cf6`)
- Admin nav item red pill badge

**`js/app.js`**
- `renderBoard()` + `renderMobileBoard()`: column div now has `col-color-{color}` class → activates gradient strip
- `qlCardHtml()`: added permanent/fleeting type badge (purple/cyan) in card footer
- Finance summary cards: `fin-card-income`, `fin-card-expense`, `fin-card-net` classes → colored top accent
- `billRowHtml()`: `fin-entry-row` class for Aurora hover
- `incomeSourceRowHtml()`: `income-source-card` + `fin-amount income` classes

**`admin.html` + `js/admin.js`**
- Full Aurora admin panel: glass header with shield icon + ADMIN badge, 4-column stat grid with icon circles + glow
- User cards: gradient avatar, status pills (green/amber/red), permission chips, hover transitions

## [1.0.2] — 2026-07-08

### Added
- **Weather wallpaper animation:** canvas-based background that changes dynamically with the current weather (sun, cloud, rain, fog, thunder, snow) using GPS + Open-Meteo. Includes crepuscular rays, aurora borealis, branching lightning, 6-arm snowflake crystals, city silhouette, and splash ripples. Previous weather state restored immediately from `sessionStorage` on page load.
- **Frosted glass UI:** sidebar, topbar, cards, modals, and daily-log section now use `backdrop-filter: blur` over the weather canvas for a cohesive layered look.
- **Weather icon in mobile topbar:** `#dlWeatherTopbar` shows live temperature + WMO icon next to the page title on mobile.
- **Premium mood icons:** 6 SVG face icons (44×44 px) with springy `cubic-bezier(.34,1.56,.64,1)` transition and per-mood colour variables, replacing the previous emoji buttons.
- **Changelog modal:** version badge (`#appVersion`) is now clickable and opens a full changelog overlay.

### Changed
- **Performance — stale-while-revalidate:** `loadFile()` now renders from `localStorage` cache instantly, then fetches the KV snapshot in the background and re-renders only when data has changed. Result: app is interactive immediately on login instead of waiting for the Cloudflare round-trip.
- **Continuous sync:** tab becomes visible → re-fetch from KV (silent); 60-second polling interval while the tab is active.
- **DL debounce:** `saveDL()` debounces `writeFile()` to 1.5 s — avoids a KV write on every keystroke in the daily-log textareas.
- Version badge (`#appVersion`) changed from `<span>` to `<button>` element for accessibility and click handling.
- Topbar search button hidden by default.

## [1.0.1] — 2026-07-08

### Security Patch

**Backend (Cloudflare Worker — `src/index.js`)**
- **Brute-force protection on PIN reset:** `/forgot-pin/confirm` now tracks failed attempts per user; locks and invalidates the OTP after 5 consecutive wrong codes
- **Cryptographically secure OTP:** replaced `Math.random()` with `crypto.getRandomValues()` for 6-digit reset code generation
- **Admin status server-side:** login response now returns `isAdmin` field determined by Worker — admin identity is no longer derivable from public frontend JS

**Frontend (`js/auth.js`)**
- Removed hardcoded `ADMIN_USERNAME = 'Yut'` constant from public JavaScript
- Admin privilege now read from `isAdmin` field in login response, stored in localStorage and cleared on logout

**Frontend (`js/app.js`)**
- Fixed stored XSS: wrapped `e.slip` and `image` values with `esc()` before inserting into `<img src>` in Finance and Bill views
- `sanitizeRichHTML` now restricts `<img src>` to `data:image/` URIs only — blocks external URL image tracking in Note rich content

**Config & Infrastructure**
- Added `_headers` file with `Content-Security-Policy`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, and `Referrer-Policy` headers
- Added `wrangler.toml` to `.gitignore` to prevent KV namespace ID from being committed to public repository; added `wrangler.example.toml` as setup template
- Bumped service worker cache from `trackingtask-v1` to `trackingtask-v2` to force clients to fetch security-patched JS files

**Why this version was incremented:** Security-only patch — no new features or breaking changes. All fixes address vulnerabilities identified in a full security audit (brute-force, XSS, information disclosure, missing CSP).

---

## [1.0.0] — 2026-07-08

### MAJOR — Initial Versioned Release

- Daily task management with to-do list and status tracking
- Note system with rich content, image attachments, and load-more pagination (20 per page)
- Personal finance module: bill payment logging and income recording
- Image compression enforced at 500 KB limit across all upload points
- PWA support: installable, offline-capable via service worker, manifest configured
- Mobile-first responsive UI with Thai-language interface
- Cloudflare Workers backend with KV and D1 storage
- Admin panel for content management
- Add-new-note card pinned to first position in note grid
- Action buttons right-aligned in Note detail view header
- Bill pay and income log modals close correctly after save

**Why this version was incremented:** Establishes the first formally versioned release of TrackingTask, capturing the full feature set present at the time version management was introduced.

### Git Tag
```
git tag v1.0.0
git push origin v1.0.0
```
