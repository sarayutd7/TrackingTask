# Changelog — TrackingTask

TrackingTask is a Progressive Web App (PWA) for daily personal management, covering task tracking, note-taking, and personal finance (bill payments and income logging). It is built as a mobile-first web application with Thai-language UI, offline support via a service worker, and Cloudflare Workers backend.

All notable changes to this project will be documented in this file.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) and this project adheres to [Semantic Versioning](https://semver.org/).

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
