# TrackingTask — CLAUDE.md

Project context and conventions for AI-assisted development.

---

## Project Overview

**TrackingTask** is a Thai-language personal management PWA covering:
- **Daily Task** — Kanban board with custom columns, task cards, priority filters, date navigation
- **Daily Log** — per-day mood, blocker, highlight, and note fields (collapsible section inside Task tab)
- **Note (QL)** — rich-text notes with tags, images, pin/hide/lock, related links, fleeting/permanent types
- **Finance** — bill tracking, income sources, manual expense/income entries, slip images

Hosted on **GitHub Pages** (static frontend) + **Cloudflare Workers** backend with KV storage.

---

## Architecture

```
index.html              — single-page app shell, all modals inline
admin.html              — admin panel UI
css/styles.css          — all styles (CSS custom properties for theming)
js/app.js               — all frontend logic (~3400+ lines, vanilla JS)
js/auth.js              — authentication flow (PIN, Google OAuth, Microsoft OAuth)
js/admin.js             — admin panel logic
src/index.js            — Cloudflare Worker (REST API + KV read/write)
sw.js                   — service worker (cache name: trackingtask-v2)
manifest.json           — PWA manifest
version.json            — { version, releaseDate, changelog }
CHANGELOG.md            — full version history (Keep a Changelog format)
_headers                — security headers (CSP, X-Frame-Options, etc.)
wrangler.example.toml   — KV config template (real wrangler.toml is gitignored)
```

---

## Tech Stack

- **Frontend**: Vanilla HTML/CSS/JS — no framework, no build step
- **Backend**: Cloudflare Worker (`src/index.js`) — REST API, JWT (HS256, 30-day TTL), KV storage
- **Storage**: Cloudflare KV split into 3 keys per user (task / tool / finance)
- **Auth**: PBKDF2-hashed PIN (100k iterations, 16-byte salt), Google OAuth (JWKS RS256), Microsoft OAuth (JWKS RS256)
- **Icons**: Lucide-style SVG — `stroke-width="2.2"`, `stroke-linecap="round"`, `stroke-linejoin="round"`, `fill="none"`, `viewBox="0 0 24 24"`
- **Theming**: CSS custom properties (`--bg`, `--surface`, `--surface2`, `--accent`, `--text`, `--text-2`, `--text-3`, `--border`, `--border-hover`)

---

## Key Conventions

### Icons
All icons are **inline SVG**, Lucide-style. Do NOT use emoji or external icon libraries.
Weather icons use `stroke-width="1.8"` (slightly lighter). Mood emoji are kept as emoji strings in `data-mood` attributes (data only, not visual).

### Theming
Always use CSS custom properties — never hardcode colors:
```css
color: var(--text);
background: var(--surface2);
border: 1px solid var(--border);
```
Light/dark toggled via JS adding `data-theme` on `<html>`. Key: `THEME_KEY = 'dailyTodoTheme'`.

### JavaScript Patterns
- No frameworks — pure DOM manipulation
- Global functions called from `onclick=` attributes in HTML
- Master data object: `DB` in memory, persisted via `writeFile()` → Cloudflare KV
- **Always** wrap user-controlled values with `esc()` before inserting into `innerHTML`
- `compressImageToDataURL(file, maxDim, quality, maxBytes)` — guarantees ≤ 500KB output via binary search
- `sanitizeRichHTML(html)` — strips unsafe tags/attrs; restricts `<img src>` to `data:image/` only

### Version Management
- Semver: PATCH (bug/security/UI), MINOR (new feature), MAJOR (breaking)
- On release: update `version.json` + prepend to `CHANGELOG.md` + update fallback in `index.html` (`id="appVersion"`)
- Version badge is clickable → `openChangelogModal()`

### Security Rules
- Always wrap user data in `esc()` before inserting into `innerHTML`
- Never use `Math.random()` for security values — use `crypto.getRandomValues()`
- Rate-limit sensitive endpoints (e.g. `/forgot-pin/confirm` — 5 attempts then lockout)
- Admin identity must come from server (`isAdmin` in login response) — never hardcode in frontend
- `wrangler.toml` is gitignored — use `wrangler.example.toml` as reference

### Git / Commits
- **Never commit** `.mcp.json` or `wrangler.toml`
- **Never commit** without explicit user instruction
- **Never push** without explicit user instruction (commit and push are separate)
- Never touch `.github/workflows/`
- Never use `--no-verify`

### Keyboard Shortcuts (global)
- `Ctrl/Cmd+Enter` — submits any open modal (task, note, column, finance)
- `Escape` — closes all modals

---

## DB Schema

```js
DB = {
  // Task data — keyed by 'YYYY-MM-DD'
  [dateKey]: Task[],

  // Daily log — keyed by 'YYYY-MM-DD'
  _logs: {
    [dateKey]: { mood: string, blocker: string, highlight: string, note: string }
  },

  // Note system
  _ql: Note[],
  _qlTags: Tag[],

  // Finance
  _finance: { [dateKey]: FinanceEntry[] },
  _bills: Bill[],
  _billPayments: { [month: 'YYYY-MM']: BillPayment[] },
  _incomeSources: IncomeSource[],
  _incomeLogs: IncomeLog[],
  _finPM: string[],   // custom payment method names
  _finTags: string[], // custom finance tag names
}
```

### Task Object
```js
{
  id: string,        // Date.now().toString(36) + random suffix
  title: string,
  note: string,      // rich HTML (sanitized) or ''
  status: string,    // column id
  priority: string,  // 'critical'|'high'|'medium'|'low'|'lowest'|''
  timeStart: string, // 'HH:MM' or ''
  timeEnd: string,
  createdAt: string, // ISO 8601
  updatedAt: string,
}
```

### Column Object (stored in `localStorage`, NOT KV)
```js
{ id: string, name: string, color: string }
// color: 'purple'|'amber'|'green'|'blue'|'pink'|'teal'|'gray'
```

### Note Object
```js
{
  id: string,         // base-36 timestamp + random suffix
  name: string,       // note title
  url: string,        // optional link URL
  tag: string,        // tag id from QL_TAGS (or '')
  detail: string,     // rich HTML body
  images: string[],   // compressed data: URIs (≤500KB each)
  noteType: 'fleeting'|'permanent',
  relatedIds: string[], // ids of linked notes
  color: string,      // 'plain'|'red'|'yellow'|'green'|'blue'|'purple'
  pinned: boolean,
  hidden: boolean,    // requires PIN unlock to view
  createdAt: number,  // Date.now()
}
```

### Tag Object
```js
{ id: string, label: string }
```

### Finance Entry
```js
{
  id: string,
  type: 'income'|'expense',
  amount: number,
  note: string,
  tag: string,
  paymentMethod: string,
  slip: string,              // dataURL or ''
  linkedBillId: string,      // if auto-created from bill payment
  linkedIncomeSourceId: string,
}
```

### Bill Record
```js
{
  id: string, name: string, amount: number,
  dueDay: number,  // day of month (1-31)
  paymentMethod: string, image: string, active: boolean
}
```

### Bill Payment Record
```js
{
  billId: string, amount: number, slip: string,
  paymentMethod: string, note: string, paidAt: string // ISO date
}
```

### Income Source
```js
{ id: string, name: string, amount: number, paymentMethod: string, active: boolean }
```

### Income Log
```js
{
  id: string, sourceId: string, amount: number,
  date: string, time: string, paymentMethod: string,
  note: string, slip: string, linkedFinanceId: string
}
```

### User Record (KV key `user:<username>`)
```js
{
  salt: string, hash: string, email: string,
  mustResetPin: boolean, failedAttempts: number,
  locked: boolean, disabled: boolean,
  allowedMenus: ['task','tool','finance'],
  linkedGoogleEmail: string, authProvider: string,
  resetCode: string, resetCodeExpires: number, resetCodeAttempts: number
}
```

---

## KV Storage Layout

| KV Key | Contents |
|--------|---------|
| `user:<username>` | User record (auth, permissions) |
| `data:<username>:task` | `DB[dateKey]` task arrays + `DB._logs` |
| `data:<username>:tool` | `DB._ql` + `DB._qlTags` |
| `data:<username>:finance` | `DB._finance`, `_bills`, `_billPayments`, `_incomeSources`, `_incomeLogs`, `_finPM`, `_finTags` |
| `splitv2:<username>` | Migration flag — absent = lazy-migrate from old single blob |
| `oauthlink:google:<email>` | Maps Google email → username for linked-account login |

---

## Worker API Routes (`src/index.js`)

| Method + Path | Auth | Purpose |
|---|---|---|
| `POST /register` | — | Create account (username, PIN, email); sends welcome email |
| `POST /login` | — | PIN login; returns JWT, `mustResetPin`, `isAdmin`, `allowedMenus`; locks after 5 failures |
| `POST /oauth/google` | — | Verify Google ID token (JWKS RS256), login or auto-register |
| `POST /oauth/microsoft` | — | Verify Microsoft ID token (JWKS RS256), login or auto-register |
| `POST /verify-pin` | JWT | Verify current PIN |
| `POST /reset-pin` | JWT | Forced PIN reset for legacy accounts (clears `mustResetPin`) |
| `POST /forgot-pin` | — | Step 1: send 6-digit OTP to email (15-min TTL); always 200 |
| `POST /forgot-pin/confirm` | — | Step 2: validate OTP + set new PIN; 5-attempt lockout |
| `GET /account` | JWT | Returns username, email, linkedGoogleEmail |
| `POST /account` | JWT | Update email and/or PIN (requires `currentPin`) |
| `POST /account/link-google` | JWT | Link Google account to existing PIN account |
| `POST /account/unlink-google` | JWT | Remove Google link |
| `POST /admin/unlock` | Secret header | Emergency unlock via `X-Admin-Secret` (bypasses JWT) |
| `GET /admin/users` | JWT (admin) | List all users with status, stats, permissions |
| `POST /admin/users/:u/disable` | JWT (admin) | Suspend user |
| `POST /admin/users/:u/enable` | JWT (admin) | Re-enable user |
| `POST /admin/users/:u/permissions` | JWT (admin) | Update `allowedMenus` |
| `DELETE /admin/users/:u` | JWT (admin) | Delete account + all KV data |
| `GET /data` | JWT | Load user's full merged data blob |
| `POST /data` | JWT | Save full data blob (split internally into 3 KV keys) |

---

## Key Functions Reference

### Global / Utility (`js/app.js`)

| Function | Description |
|----------|-------------|
| `esc(str)` | HTML-escapes user strings before `innerHTML` insertion |
| `showStatus(msg, type)` | Floating badge (`ok`/`warn`) at bottom-right, auto-fades 2.5s |
| `showToast(msg, ms)` | Toast notification |
| `switchTab(tab)` | Switches task/tool/finance tabs; updates sidebar, bottom nav, topbar title |
| `writeFile()` | Persists `DB` to Cloudflare KV via POST `/data` |
| `sessionExpired()` | Clears token → `lockShow()` on 401 response |
| `loadAppVersion()` | Fetches `version.json` → updates `#appVersion` badge |
| `openChangelogModal()` / `closeChangelogModal()` | Version history popup |
| `loadWeather()` | GPS → Open-Meteo → renders weather icon+°C in `#dlWeather` and `#dlWeatherTopbar`; 30-min sessionStorage cache |
| `compressImageToDataURL(file, maxDim, quality, maxBytes)` | Canvas compress with binary-search quality guarantee ≤ 500KB |
| `sanitizeRichHTML(html)` | Strips unsafe tags/attrs; blocks external img URLs |
| `rteExec(cmd, val)` | Wraps `document.execCommand` for RTE |
| `rteGetHTML(id)` / `rteSetHTML(id, html)` / `rteClear(id)` | Get/set/clear contenteditable RTE element |
| `rteSaveSelection()` / `rteApplyColor(color)` | Save selection then apply foreColor |
| `rteHandlePaste(e)` | Intercepts paste; compresses pasted images; strips external img src |

### Daily Task

| Function | Description |
|----------|-------------|
| `loadCols()` / `saveCols()` | Load/save COLS array from localStorage (per-user, NOT synced to KV) |
| `getColById(id)` / `getColColor(id)` / `getNextColId(id)` / `isLastCol(id)` | Column lookup helpers |
| `openColAdd()` / `openColEdit(id)` / `colSave()` / `colDelete()` | Column CRUD |
| `colSelectColor(color)` / `colClose()` | Column modal UI helpers |
| `getTasks(d)` / `setTasks(d, t)` | Read/write task array for date `d` |
| `openModal(status, id)` / `closeModal()` | Task add/edit modal |
| `saveTask()` | Create or update task; calls `writeFile()` + `render()` |
| `deleteTask(id)` | Delete task for current date |
| `moveTask(id, newStatus)` | Move task to next column (cycles in order; last col → first col) |
| `openReschedule(id)` / `rschedClose()` / `rschedConfirm()` | Move task to a different date |
| `render()` | Master re-render: groups tasks by column, updates all UI zones |
| `renderBoard()` | Builds desktop Kanban board DOM from COLS |
| `renderCard(t)` | Generates card HTML (handles legacy plain-text vs rich HTML notes) |
| `renderStats(g)` | Stat cards row above board (count + color per column) |
| `renderMobileBoard(g, tasks)` | Mobile tab-switch board with per-col priority filters |
| `renderPriorityFilterBar(tasks)` | Priority filter chips; hidden when no priority-tagged tasks |
| `setPriorityFilter(p)` | Toggle priority filter (same value clears) |
| `mbSwitchTab(colId)` / `mbSetPriority(colId, priority)` | Mobile board tab/filter |
| `shiftDay(delta)` | Navigate date by ±delta days; triggers full re-render |
| `renderDateStrip()` | 7-chip horizontal date strip (±3 days) in `#dateStripBar` |
| `setDateFromStrip(ds)` | Navigate from date strip chip click |

**Task sort**: by `timeStart` ascending; no `timeStart` → bottom. Progress bar: denominator excludes "backlog" columns; done column matched by `id==='completed'` or `/complet/i.test(name)`.

### Daily Log

| Function | Description |
|----------|-------------|
| `loadDL()` / `saveDL()` | Load/save log data (merges `DB._logs` + localStorage; file wins on conflict) |
| `renderDL()` | Populates `#dlBlocker`, `#dlHighlight`, `#dlNote` + mood badge for `currentDate` |
| `dlSave(field, val)` | Save single field on textarea blur |
| `dlSetMood(emoji)` | Toggle mood emoji for current day |
| `dlToggle()` | Collapse/expand daily log section |
| `dlResize(el)` | Auto-resize textarea to content |

### Note / QL System

| Function | Description |
|----------|-------------|
| `loadQL()` / `saveQL()` | Load/save `QL` array; `loadQL` backfills missing fields on old records |
| `loadQLTags()` / `saveQLTags()` | Load/save `QL_TAGS`; seeds defaults if empty |
| `qlTagColor(id)` / `qlTagLabel(id)` | Tag display helpers |
| `qlTagAdd()` / `qlTagRemove(id)` | Tag CRUD |
| `qlSetSearch(value)` | Update search query, reset page to 1, re-render |
| `qlStripHTML(html)` | Strip HTML tags for full-text search |
| `qlMatchesSearch(item)` | Match against name, stripped detail, tag label |
| `qlSetFilter(filter)` | Set active filter (all/pinned/hidden/tag), reset page |
| `qlLoadMore()` | Increment `qlPage`, re-render (only normal group is paginated) |
| `qlCardHtml(item, i)` | Build note card HTML |
| `qlSectionLabel(label, icon)` | Section divider between pinned/normal groups |
| `qlOpenRead(i)` / `qlReadClose()` | Open/close read-mode panel |
| `qlOpenAdd(prefill)` / `qlOpenEdit(i)` / `qlSave()` / `qlClose()` | Note editor CRUD |
| `qlShowPage(page)` | Switch overlay pane: `'list'`/`'edit'`/`'read'` |
| `qlTogglePin(i)` / `qlToggleEditPin()` | Pin/unpin note |
| `qlHideNote(i)` / `qlUnhideNote(i)` | Hide/unhide note |
| `qlRequestUnlock(i)` / `closeQlUnlock()` / `submitQlUnlock()` | PIN-lock/unlock for hidden notes (session-only `qlUnlockedIds` Set) |
| `qlDelete(i)` | Confirm + delete note |
| `qlImagesChange(e)` / `qlImageRemove(i)` | Image upload to `qlPendingImages` |
| `qlSetColor(color, el)` | Set `qlSelectedColor`, update color strip live |
| `qlToggleEditHide()` | Toggle `qlEditHidden` in editor |
| `qlResetEditToggles(pinned, hidden, color)` | Reset editor toggles when opening |
| `qlSummarizeToPermanent(i)` | Open editor pre-filled from fleeting note, forced `noteType='permanent'` |
| `qlRelatedSearchInputHandler(value)` | Live-search autocomplete for related notes (max 8) |
| `qlPickRelated(id)` / `qlRemoveRelatedPick(id)` | Manage `selectedQlRelated` array |
| `qlRelatedChipsHtml(item, max)` | Render related-note chips with overflow badge |
| `qlFmtDate(ts)` | Format Unix timestamp for card display |
| `selectQlTag(tag)` / `selectQlType(type)` | Set editor tag/type state |
| `qlIndexById(id)` | Lookup note index by id |
| `qlToggle()` | Collapse/expand note grid body |

**Pagination**: `qlPage` starts at 1, `QL_PAGE_SIZE = 20`. Pinned group always renders fully; only normal group is paginated.

### Finance

| Function | Description |
|----------|-------------|
| `getFinance(d)` / `setFinance(d, arr)` | Read/write `DB._finance[dateKey]` |
| `findFinanceById(id)` | Search all date-keyed arrays for entry by id |
| `getBills()` / `setBills(arr)` | Read/write `DB._bills` |
| `getBillPayments(month)` / `setBillPayments(month, arr)` | Read/write `DB._billPayments[month]` |
| `findBillPayment(month, billId)` | Find payment record for a bill in a month |
| `getBillMonthAmount(bill, month)` | Returns override amount from payment or bill default |
| `getBillMonthImage(bill, month)` | Returns slip from payment (priority) or bill image |
| `loadFinPM()` / `saveFinPM()` | Load/save payment methods (`DB._finPM`) |
| `loadFinTags()` / `saveFinTags()` | Load/save finance tags (`DB._finTags`); merges with reserved tags |
| `finFmtMoney(n)` | Format number as Thai locale money string |
| `finSetFilter(filter)` | Filter chips: all/income/expense |
| `finSetSubTab(tab)` | Switch sub-tabs: `list`/`bills`/`income` |
| `renderFinance()` | Full re-render: summary cards + filtered entry list |
| `billRowHtml(...)` / `renderBills()` | Render bill row and full bills pane |
| `billsChangeMonth(delta)` / `incomeChangeMonth(delta)` | Navigate month |
| `openBillModal(id)` / `closeBillModal()` / `saveBill()` / `deleteBill(id)` | Bill CRUD |
| `billImageChange(e)` / `billRemoveImage()` | Bill image upload/removal |
| `toggleBillPaid(billId)` | Quick toggle paid/unpaid for current month |
| `openBillPayModal(billId)` / `closeBillPayModal()` / `confirmBillPay()` | Log a bill payment (writes to `_billPayments` + creates linked `_finance` entry) |
| `billPaySlipChange(e)` / `billPayRemoveSlip()` | Slip image for bill payment |
| `getIncomeSources()` / `setIncomeSources(arr)` | Read/write `DB._incomeSources` |
| `getIncomeLogs()` / `setIncomeLogs(arr)` | Read/write `DB._incomeLogs` |
| `openIncomeSourceModal(id)` / `closeIncomeSourceModal()` / `saveIncomeSource()` / `deleteIncomeSource(id)` | Income source CRUD |
| `openIncomeLogModal(sourceId)` / `closeIncomeLogModal()` / `confirmIncomeLog()` | Log income received |
| `recordIncomeReceipt(source, data)` | Creates linked `_finance` entry when income logged |
| `deleteIncomeLog(logId)` | Delete log (can cascade-delete linked finance entry) |
| `incomeSourceRowHtml(...)` / `renderIncomeSources()` | Render income source cards + monthly total |
| `openIncomeHistory(sourceId)` / `closeIncomeHistory()` / `renderIncomeHistory(sourceId)` | Income source history drawer |
| `openFinanceModal(id)` / `closeFinanceModal()` / `saveFinance()` / `deleteFinance(id)` | Manual finance entry CRUD |
| `selectFinType(type)` / `renderFinPMRow()` / `selectFinPM(pm)` / `renderFinTagRow()` / `selectFinTag(tag)` | Finance modal UI helpers |
| `unlinkFinanceBill(billId)` / `unlinkFinanceIncomeSource(sourceId)` | Unlink auto-created entries from source |
| `finSlipChange(e)` / `finRemoveSlip()` | Slip image in finance modal |
| `openFinTagModal()` / `closeFinTagModal()` / `finTagAdd()` / `finTagDelete(i)` | Finance tag CRUD |
| `openFinPMModal()` / `closeFinPMModal()` / `finPMAdd()` / `finPMDelete(i)` | Payment method CRUD |

**Finance sub-tabs**: `list` (manual entries by date), `bills` (recurring bills by month), `income` (income sources + logs by month). Bill payment and income logging both auto-create linked entries in `_finance`.

### Auth (`js/auth.js`)

| Function | Description |
|----------|-------------|
| `initOAuthSignIn()` | Initialises Google GIS button + MSAL Microsoft button |
| `handleGoogleCredential(response)` | Receives Google ID token → POST `/oauth/google` → `afterAuthSuccess()` |
| `handleGoogleLinkCredential(response)` | Links Google to existing PIN account via `/account/link-google` |
| `renderAccountGoogleLink(linkedEmail)` | Renders linked-email badge or "link" button in Account modal |
| `unlinkGoogleAccount()` | POST `/account/unlink-google`, refresh display |
| `microsoftSignIn()` | MSAL popup → POST `/oauth/microsoft` |
| `getAllowedMenus()` | Reads `trackingTaskAllowedMenus` from localStorage; admins get all |
| `applyMenuPermissions()` | Show/hide tab buttons; auto-switches if active tab removed |
| `lockShow()` / `lockHide()` | Show/hide lock screen; `lockHide` shows user greeting |
| `lockApp()` | Clear JWT + user, clear DB, re-render, call `lockShow()` |
| `lockSubmit()` | Handle register (`/register`) and login (`/login`); handles `mustResetPin` redirect |
| `lockLoginMode()` / `lockRegisterMode()` | Switch lock screen between login/register state |
| `afterAuthSuccess()` | Post-auth: hide lock, apply permissions, load all data, full re-render |
| `showResetPinScreen()` | Show `#resetPinScreen` (forced PIN change for legacy accounts) |
| `submitResetPin()` | POST new PIN to `/reset-pin`; calls `afterAuthSuccess()` on success |
| `openAccountModal()` / `closeAccountModal()` | Account settings modal (fetches `/account` for current data) |
| `saveAccount()` | POST `{ currentPin, newEmail, newPin }` to `/account` |
| `showForgotPinScreen()` / `hideForgotPinScreen()` | Two-step forgot-PIN flow |
| `submitForgotPinRequest()` | Step 1: POST username+email to `/forgot-pin` |
| `submitForgotPinConfirm()` | Step 2: POST username+OTP+newPin to `/forgot-pin/confirm` |

**Token**: JWT stored in `localStorage` key `trackingTaskToken`. Payload: `{ sub: username, iat, exp }`.
**Admin flag**: stored in `localStorage` key `trackingTaskIsAdmin` ('1'/'0'); set from `isAdmin` in login response.
**Allowed menus**: stored in `localStorage` key `trackingTaskAllowedMenus`.

### Admin (`js/admin.js`)

| Function | Description |
|----------|-------------|
| `initAdminPage()` | Check token + isAdmin; show denied banner or load users |
| `loadAdminUsers()` | GET `/admin/users`; store in `adminUsersCache`; render stats + list |
| `renderAdminStats()` | Render 3-stat grid (total/disabled/locked) |
| `adminSearch(q)` | Filter `adminUsersCache` by username/email substring |
| `renderAdminUsers()` | Render user cards with status, stats, perm chips, action buttons |
| `adminToggleDisabled(username, disable)` | POST to `/admin/users/:u/disable` or `/enable` |
| `adminTogglePermission(username, menu, checked)` | POST updated `allowedMenus`; enforces minimum 1 menu |
| `adminDeleteUser(username)` | confirm() → DELETE `/admin/users/:u` |
| `denyAccess()` | Show `#adminDenied`, hide `#adminContent` |

---

## Key HTML IDs

### Global / Layout
| ID | Purpose |
|----|---------|
| `appVersion` | Version badge in sidebar (clickable → changelog modal) |
| `changelogModal` | Changelog popup modal |
| `appSidebar` | Desktop sidebar `<aside>` |
| `mobileTabTitle` | Page title in mobile topbar |
| `dlWeather` | Weather widget in Daily Log header |
| `dlWeatherTopbar` | Weather widget in mobile topbar |
| `userGreeting` | Greeting text above tabs |
| `datePicker` | Hidden `<input type="date">` — canonical date state (`currentDate`) |
| `dateDisplay` | Large date heading above task board |
| `sbDateDisplay` | Date label inside sidebar |
| `dateStripBar` | 7-chip horizontal date strip (mobile, task tab only) |
| `topbarSearchWrap` / `topbarSearchBtn` / `topbarSearchInput` | Topbar search (currently hidden) |

### Daily Task
| ID | Purpose |
|----|---------|
| `board` | Desktop Kanban board container |
| `mobileBoard` / `mbTabBar` / `mbPanes` | Mobile board structure |
| `statsGrid` | Stat cards row above board |
| `progressFill` / `progressLabel` | Progress bar |
| `priorityFilterBar` | Priority filter chip bar |
| `overlay` | Task add/edit modal overlay |
| `colOverlay` | Column add/edit modal |
| `rschedOverlay` | Reschedule modal |
| `taskTitle` / `taskNoteBody` / `taskTimeStart` / `taskTimeEnd` | Task modal fields |
| `statusRow` / `priorityRow` | Status/priority pill containers in task modal |
| `colName` / `colColorPicker` / `colDeleteBtn` | Column modal fields |
| `rschedTaskName` / `rschedDate` | Reschedule modal fields |

### Daily Log
| ID | Purpose |
|----|---------|
| `dlBody` / `dlChevron` | Collapsible log body + chevron |
| `dlMoodBadge` | Mood emoji in collapsed header |
| `dlMoodRow` | Container for 6 mood SVG pill buttons |
| `dlBlocker` / `dlHighlight` / `dlNote` | Log textareas (blocker / วันนี้ทำสำเร็จ / note) |

### Note / QL
| ID | Purpose |
|----|---------|
| `qlBody` | Note card grid container |
| `qlFilterBar` | Filter button bar (all/pinned/hidden/per-tag) |
| `qlTagRow` / `qlNewTagInput` | Tag management pills + input |
| `qlTypeRow` | Fleeting/Permanent type picker cards |
| `qlColorStrip` / `qlColorStripName` | Live color preview strip in editor |
| `qlPinToggle` / `qlHideToggle` | Pin/Hide toggle cards in editor |
| `qlDetailBody` | Contenteditable RTE body |
| `qlImagesRow` | Pending image previews in editor |
| `qlRelatedSuggestions` / `qlRelatedChipsEdit` | Related-note autocomplete + chips |
| `qlOverlay` | Editor modal overlay |
| `qlReadOverlay` / `qlReadTitle` / `qlReadMeta` / `qlReadDetail` / `qlReadImages` / `qlReadRelated` | Read-view elements |
| `qlReadEditBtn` / `qlReadDelBtn` / `qlReadPinBtn` | Read-view action buttons |
| `qlUnlockOverlay` / `qlUnlockPin` / `qlUnlockError` | PIN-unlock overlay for hidden notes |

### Finance
| ID | Purpose |
|----|---------|
| `finSubTabBar` | Sub-tab bar (list/bills/income) |
| `finListPane` / `finBillsPane` / `finIncomePane` | Sub-tab panes |
| `finFilterBar` | Filter chips (all/income/expense) |
| `finOverlay` | Main finance entry modal |
| `finSlipInput` / `finSlipPreview` | Slip upload in main modal |
| `billOverlay` / `billPayOverlay` | Bill add/edit + bill payment modals |
| `billImageInput` / `billImagePreview` | Bill image upload/preview |
| `billPaySlipInput` | Slip upload for bill payment |
| `incomeSourceOverlay` / `incomeLogOverlay` | Income source + income log modals |
| `finTagOverlay` / `finPMOverlay` | Tag management + PM management modals |

### Auth / Lock
| ID | Purpose |
|----|---------|
| `lockScreen` / `lockBox` | Lock overlay + inner form box |
| `lockUser` / `lockEmail` / `lockPw` / `lockPwConfirm` | Login/register fields |
| `lockError` / `lockSubmitBtn` / `lockForgotLink` | Lock screen error + buttons |
| `oauthSignInSection` / `googleSignInBtn` / `msSignInBtn` | OAuth buttons |
| `resetPinScreen` / `resetPinNew` / `resetPinConfirm` / `resetPinError` | Forced PIN reset screen |
| `forgotPinScreen` / `forgotPinStep1` / `forgotPinStep2` | Forgot-PIN overlay + steps |
| `accountOverlay` / `accountEmail` / `accountNewPin` / `accountCurrentPin` | Account settings modal |
| `accountGoogleLinked` / `accountGoogleLinkBtn` | Google link UI |
| `headerLockBtn` / `headerAccountBtn` / `headerAdminBtn` | Header action buttons |
| `sbUserName` / `sbAvatar` | Sidebar user display |

### Admin
| ID | Purpose |
|----|---------|
| `adminContent` / `adminDenied` | Content vs access-denied panel |
| `adminStatsGrid` / `adminUserList` | Stats row + user card list |
| `adminSearchCount` / `adminError` | Search count + error area |

---

## Mood Pill Buttons

44×44px SVG face icons with springy `cubic-bezier(.34,1.56,.64,1)` transition. `data-mood` stores emoji string (unchanged for data compatibility).

| `data-mood` | `--mood-color` | Label |
|-------------|----------------|-------|
| 😄 | `#f59e0b` | สุขมาก |
| 🙂 | `#84cc16` | สุข |
| 😐 | `#94a3b8` | ปกติ |
| 😔 | `#60a5fa` | เศร้า |
| 😴 | `#a78bfa` | เหนื่อย |
| 😡 | `#f87171` | โกรธ |

---

## Weather Widget

- Source: Open-Meteo (`api.open-meteo.com`) — free, no API key
- Trigger: `navigator.geolocation.getCurrentPosition()`
- Cache: `sessionStorage` key `wx_cache`, 30-minute TTL
- Renders in: `#dlWeather` (Daily Log header) and `#dlWeatherTopbar` (mobile topbar)
- Silent failure on GPS deny or network error

---

## localStorage Keys

| Key (via `userKey()` per-user prefix) | Contents |
|--------------------------------------|---------|
| `dailyTodoCols` | COLS array (columns NOT synced to KV) |
| `dailyTodoLog` | Daily log fallback (primary: `DB._logs`) |
| `dailyTodoQL` | Note array fallback |
| `dailyTodoQLTags` | Tags fallback |
| `trackingTaskToken` | JWT bearer token |
| `trackingTaskIsAdmin` | `'1'` or `'0'` |
| `trackingTaskAllowedMenus` | JSON array of allowed tab names |
| `trackingTaskUser` | Username string |
| `dailyTodoTheme` | `'light'` or `'dark'` |
| `wx_cache` | Weather cache `{ ts, temp, code }` (sessionStorage) |

---

## Auth Flows

**PIN Login**: username + 6-digit PIN → POST `/login` → JWT + `allowedMenus` + `isAdmin`. After 5 failures, account locked.

**OAuth (Google/Microsoft)**: Google GIS or MSAL popup → id_token → POST `/oauth/google` or `/oauth/microsoft` → auto-register if new user (username = email), return JWT.

**Google Link**: Existing PIN user → Account modal → link Google email → `oauthlink:google:<email>` KV key → future Google logins map to PIN account.

**Forgot PIN (two-step)**:
1. POST `/forgot-pin` (username + email) → 6-digit crypto-random OTP sent to email (15-min TTL); always 200 (no enumeration)
2. POST `/forgot-pin/confirm` (username + OTP + newPin) → max 5 attempts before OTP invalidated

**Forced PIN Reset**: `mustResetPin=true` in login response → `showResetPinScreen()` → must POST `/reset-pin` before accessing any data.

---

## Security Posture (v1.0.1)

- ✅ Brute-force protection on PIN reset (5-attempt lockout per OTP)
- ✅ Cryptographically secure OTP (`crypto.getRandomValues`)
- ✅ XSS-safe image rendering (`esc()` on slip/image fields)
- ✅ `sanitizeRichHTML` blocks external img URLs
- ✅ Content-Security-Policy via `_headers`
- ✅ Admin identity server-side only (`isAdmin` from login response)
- ✅ `wrangler.toml` gitignored
- ✅ Login rate-limited (5 failed attempts → account lock + email alert)
- ⚠️ JWT stored in `localStorage` (known risk — HttpOnly cookie migration planned)

---

## Current Version

**v1.0.1** — Security patch (2026-07-08)
See `CHANGELOG.md` for full history.
