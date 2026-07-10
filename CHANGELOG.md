# Changelog — TrackingTask

TrackingTask is a Progressive Web App (PWA) for daily personal management, covering task tracking, note-taking, and personal finance (bill payments and income logging). It is built as a mobile-first web application with Thai-language UI, offline support via a service worker, and Cloudflare Workers backend.

All notable changes to this project will be documented in this file.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) and this project adheres to [Semantic Versioning](https://semver.org/).

---

## [1.2.14] — 2026-07-10

### Changed

- Date strip's "today" indicator changed from a small inline `•` character (easy to miss) to a distinct colored dot (`.ds-today-dot`) next to the day/month label — accent-colored normally, white when that chip is also the currently-selected date. The chip also gets an accent-colored border when today isn't the selected date, so it stands out even when browsing other days.

---

## [1.2.13] — 2026-07-10

### Changed

- Toggle switches (`.ql-toggle-switch`, used by the Note pin/hide toggles and the new Task hide toggle) enlarged from 30×17px to 46×26px, with a bigger thumb and icon, for an easier tap target.
- Date strip (`#dateStripBar`) now shows a different range depending on screen size: **3 days (today ±1) on mobile** (`window.innerWidth <= 768`) so no chip gets cut off at the screen edge, and **7 days (today ±3) on desktop** as before.

---

## [1.2.12] — 2026-07-10

### Fixed — Stale cached JS/CSS/HTML across devices

- The production domain (trackingtask.online) is served via Cloudflare Pages. Since this project has no build step, `index.html`/`js/app.js`/`css/styles.css`/`sw.js` keep the exact same filenames on every deploy — without explicit cache headers, browsers and Cloudflare's edge cache can keep serving an old cached copy indefinitely, even after a new version is deployed and the version badge would otherwise show the latest number (the badge text itself lives in `index.html`, which can update independently of a stale cached `app.js`, silently breaking newly-added JS behavior with no visible error).
- Added `Cache-Control: no-cache, must-revalidate` in `_headers` for `*.html`, `*.js`, `*.css`, and `sw.js` so every load revalidates with the server (a cheap 304 when nothing changed) instead of trusting a possibly stale cached copy.
- **Devices already stuck on a stale cache from before this fix need one manual hard-refresh / "clear website data" to escape it** — this fix only prevents the problem going forward.

---

## [1.2.11] — 2026-07-10

### Added

- **Daily Task: hide individual tasks behind a PIN**, mirroring the existing hidden-Note feature. Task editor (`#overlay`) has a new "ซ่อนงานนี้" toggle; hidden tasks render as a locked placeholder card (lock icon + "ปลดล็อก" button) on both desktop and mobile boards instead of showing their title/note. Unlocking requires the account PIN (`POST /verify-pin`) and is session-only (`taskUnlockedIds` Set — resets on next app load, same as `qlUnlockedIds` for Notes). A quick lock/unlock icon button was also added to each card's action row for one-tap hide/unhide without opening the editor.

---

## [1.2.10] — 2026-07-10

### Added

- Finance modal (`#finOverlay`) now has a **วันที่ทำรายการ** date field — new/edited entries can be assigned to any date instead of always using whichever date the Daily Task tab happens to be on. Editing an entry and changing its date moves it between `DB._finance[dateKey]` buckets; linked recurring-bill payments and income logs now also use the picked date.

### Fixed

- Date strip (`#dateStripBar`) on iPhone portrait only showed ~3 days before requiring a scroll. The `← ก่อนหน้า` / `ถัดไป →` nav buttons took up a large share of the strip's width; replaced them with compact icon-only arrow buttons, freeing enough room for ~5 date chips to be visible at once (horizontal scroll still available for the rest). Also removed a stray `.ds-chip { flex:1 }` mobile override that fought the strip's intended content-sized, horizontally-scrollable chip layout.

---

## [1.2.9] — 2026-07-10

### Fixed

- **Sidebar drawer footer invisible on mobile**: `.app-layout` had `position:relative; z-index:1`, which trapped `.app-sidebar`'s `z-index:300` inside a stacking context capped at `1` — so the theme-toggle and logout buttons in the sidebar footer rendered *behind* `.bottom-nav-bar` (`z-index:200`) and were invisible even though they were correctly positioned in the DOM. Removed the unneeded `z-index` from `.app-layout` so the sidebar's own `z-index:300` applies as originally intended.
- **Mood badge showed a raw OS emoji**: the collapsed Daily Log header (`#dlMoodBadge`) displayed the stored mood as a literal emoji character, which looked inconsistent with the custom SVG face icons used on the mood picker pills. Added a `MOOD_ICONS`/`moodIconHtml()` mapping so the badge now renders the same custom SVG icon (in the mood's color) instead of the native emoji glyph.
- **Changelog was a small centered popup**: converted to a full-page view on mobile (100vw/100dvh, no border radius) with a back-arrow button instead of a close (✕) button, matching in-app page navigation instead of a modal dialog.

---

## [1.2.8] — 2026-07-10

### Fixed — Mobile usability

- Viewport meta tag no longer disables pinch-zoom (`user-scalable=no, maximum-scale=1.0` removed)
- Topbar date pill is now centered in the topbar instead of sitting left-aligned next to the page title
- Add-task button (`.add-btn`/`.mb-add-btn`) made larger and higher-contrast (solid accent border/background instead of faint dashed muted style, bigger icon and text) for easier tapping on mobile

---

## [1.2.7] — 2026-07-10

### Changed — Faster cross-device sync

- `POLL_INTERVAL_MS` reduced from 15s to 5s (`js/app.js`) — changes made on one device/tab now show up on other open sessions of the same account much sooner, without needing a manual refresh

---

## [1.2.4] — 2026-07-10

### Changed
- Topbar: ชื่อเมนูและวันที่อยู่บรรทัดเดียวกัน วันที่เป็น pill badge มีขอบโค้งมน (`.topbar-titles` row layout)
- Finance: ลบ `#finSubTabBar` ออกจาก HTML เนื่องจาก sub-tabs ถูก render โดย JS แล้ว

---

## [1.2.3] — 2026-07-10

### Fixed
- Finance summary cards: เปลี่ยนจาก `fin-card-new` เป็น `fin-card` พร้อม override ใน `.finance-summary .fin-card`
- Finance donut: เปลี่ยนจาก SVG เป็น CSS `conic-gradient` พร้อม `::before` cutout circle
- Finance bills preview: ใช้ `.bill-icon/.bill-name/.bill-amount` พร้อม emoji icon และ inline bg color
- CSS: เพิ่ม `.fin-bills-preview .bill-card` override ไม่มี border-left

---

## [1.2.2] — 2026-07-10

### Changed
- **Finance tab**: summary cards (`.fin-card-new`) แสดงรายรับ/รายจ่าย/คงเหลือ พร้อม gradient top border
- **Finance tab**: transaction list ใช้ `.txn-row` พร้อม icon, ชื่อ, tag, payment method, จำนวนเงิน signed, วันที่
- **Finance tab**: donut chart SVG แสดงสัดส่วน income vs expense + legend
- **Finance tab**: bills preview sidebar (sticky) แสดง 5 บิลล่าสุดพร้อมสถานะ จ่ายแล้ว/รอจ่าย
- **Finance tab**: sub-tabs เป็น `.sub-tab` pill style; filter chips เป็น `.filter-chip` พร้อม chip-dot
- **Finance tab**: layout 2-column (`.two-col`) บน desktop

---

## [1.2.1] — 2026-07-10

### Fixed
- Topbar: ซ่อน hamburger บน desktop (sidebar always visible), ซ่อน weather จาก topbar
- Topbar: title "Note (QL)" และ "Finance" แสดงถูกต้องเมื่อ switchTab
- Topbar: update topbarDate เมื่อเปลี่ยน tab

---

## [1.2.0] — 2026-07-10

### Changed
- **Topbar**: เพิ่ม title+date stacked layout, topbar-spacer, ใช้ topbar-btn class
- **Stat cards**: ใช้ `.stat-icon-wrap` พร้อม color background tint; stat-card ได้รับ color class
- **Progress bar**: เพิ่ม `.progress-header` แสดง label "ความคืบหน้าวันนี้" และ % ขนาด 6px
- **Priority filter**: เปลี่ยน pf-btn เป็น `filter-chip` รูป pill พร้อม `chip-dot` สีสัน
- **Kanban columns**: เพิ่ม color gradient bar บนสุดของ column, ใช้ `.col-bar` + `.col-body`
- **Note cards**: redesign เป็น `.note-card` + `.note-card-inner` + `.note-accent` bar ซ้าย, background tint ตามสี, แสดง tag chip + type badge + date ใน footer
- **bnb-badge**: แสดง task count badge บน Daily Task bottom nav

---

## [1.1.1] — 2026-07-09

### Fixed — UI polish: col-header padding, changelog scroll, date strip desktop

- `col-header`: added `padding-top: 7px` so column title doesn't sit flush against the gradient accent strip
- Changelog modal: `.changelog-body` now has `flex: 1; min-height: 0` so long changelogs are scrollable inside the modal
- Date strip bar: now visible on desktop (was hidden via `display:none` in desktop media query) with transparent background

---

## [1.1.0] — 2026-07-09

### Changed — Remove weather background animation

- Removed canvas-based weather animation (`initWeatherBg` IIFE, ~330 lines) — was causing JS errors and breaking the app
- Removed `<canvas id="weatherBg">` element from `index.html`
- Removed `window.setWeatherBg()` calls from `loadWeather()` (weather icon+temperature in topbar still works)
- Body background remains static Aurora dark (`#0f1117`) — stable and performant

---

## [1.0.12] — 2026-07-09

### Fixed — Service worker stuck on old cached versions

- `sw.js` used a cache-first `fetch` strategy with a `CACHE` name that never changed across releases (`trackingtask-v2` since v1.0.1). Since the file's bytes never changed, browsers never detected an update, so installed devices stayed stuck forever on whatever version was cached the first time the PWA was installed — even after new versions were deployed to `main`.
- Bumped `CACHE` to `trackingtask-v3` (forces a one-time re-install and purge of stale caches on next visit)
- Switched the `fetch` handler to network-first: always try the network first (so deployed updates are visible immediately) and only fall back to the cache when offline

---

## [1.0.11] — 2026-07-09

### Reverted — Back to v1.0.5 baseline

- Superseded the v1.0.2 revert below: reverted `index.html`, `css/styles.css`, `js/app.js`, `js/admin.js`, `admin.html` to their v1.0.5 state, removing the Aurora UI redesign introduced in v1.0.6–v1.0.9 (full dark-theme remodel, gradient stat cards, Finance 2-column layout with donut chart, etc.) while keeping the v1.0.3–v1.0.5 changes (weather wallpaper removal, static Aurora background)
- v1.0.6–v1.0.9 entries below remain in this changelog for historical record but no longer reflect the current UI

---

## [1.0.10] — 2026-07-09

### Reverted — Back to v1.0.2 baseline

- Reverted `index.html`, `css/styles.css`, `js/app.js`, `js/admin.js`, `admin.html` to their v1.0.2 state, removing the Aurora UI redesign introduced in v1.0.3–v1.0.9 (dark theme overhaul, gradient stat cards, Finance 2-column layout with donut chart, etc.)
- v1.0.3–v1.0.9 entries below remain in this changelog for historical record but no longer reflect the current UI

---

## [1.0.9] — 2026-07-09

### Changed — Aurora UI complete rewrite + Finance 2-column layout

**`css/styles.css` — full clean rewrite (5 sections, ~920 lines)**
- Replaced 4720-line hybrid file (old CSS + Section 5 appended) with clean 5-section Aurora CSS
- Added missing sidebar class mappings: `.sb-dot`, `.sb-name`, `.sb-item-icon`, `.sb-item-label`, `.sb-footer`, `.sb-user-name`, `.sb-user-info`, `.sb-date-box`, `.sb-divider`, `.app-version-badge`
- Note (QL) filter bar: `.ql-filter-btn` with CSS variable support (`--tag-color`, `--tag-bg`), `.ql-filter-dot`, `.ql-filter-count`, `.ql-tag-badge`
- Note card left accent: switched from `.note-accent` div (not generated by JS) to `.ql-card-inner::before` pseudo-element with 4px colored strip per `nc-{color}`
- Finance 2-column layout: `.fin-content-grid` (1fr + 280px side panel), `.fin-side-card`, `.fin-donut-wrap`, `.fin-donut-legend`, `.fin-bills-mini-item`
- Finance stat cards: `min-height:110px`, vertical flex, larger font (`26px`) for Finance context
- Finance sub-tab bar: underline style (not pill), `.fin-subtab-bar .ql-filter-btn` with `border-bottom` active indicator
- Finance filter chips: `#finFilterBar [data-filter="income"]::before` and `[data-filter="expense"]::before` add colored dots
- Task card: added `margin:8px`, `word-break:break-word`, `max-width:100%`, `box-sizing:border-box`
- Admin badge in sidebar: changed from inline red style to `.sb-badge` (indigo)

**`index.html`**
- Finance `#finListPane`: wrapped in `.fin-content-grid` with `.fin-main-col` (left) and `.fin-side-panel` (right)
- Added side panel HTML: donut chart `<canvas id="finDonutCanvas">`, legend `#finDonutLegend`, bills mini widget `#finBillsMini`
- Admin nav badge: replaced inline red style with `class="sb-badge"` for indigo Aurora styling
- Version badge updated to v1.0.9

**`js/app.js`**
- Added `renderFinSidePanel(income, expense)` hook at end of `renderFinance()`
- Added new functions: `renderFinSidePanel()`, `_drawFinDonut()` (Canvas donut chart), `_renderFinBillsMini()` (bills widget)

---

## [1.0.8] — 2026-07-08

### Fixed — Stat card gradients + sidebar active state

- Added `.stat-card.indigo/.amber/.green/.cyan/.red` CSS rules — JS outputs these class names but CSS only had `:has()` selectors; now both work
- Added `.stat-icon-wrap` base size rule (same as `.stat-icon`) — new JS render uses this class
- Added `.stat-card.{color} .stat-icon-wrap` glow backgrounds
- Added `.stat-card.{color} .stat-num` color rules (indigo=#818cf8, amber=#fbbf24, green=#34d399)
- Sidebar active item (desktop): fixed second-half override back to semi-transparent — now correctly full gradient `linear-gradient(135deg,#6366f1,#8b5cf6)` with `border-left:none`

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
