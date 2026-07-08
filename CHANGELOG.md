# Changelog — TrackingTask

TrackingTask is a Progressive Web App (PWA) for daily personal management, covering task tracking, note-taking, and personal finance (bill payments and income logging). It is built as a mobile-first web application with Thai-language UI, offline support via a service worker, and Cloudflare Workers backend.

All notable changes to this project will be documented in this file.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) and this project adheres to [Semantic Versioning](https://semver.org/).

---

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
