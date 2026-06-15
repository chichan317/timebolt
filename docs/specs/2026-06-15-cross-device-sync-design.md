# Design — Cross-device sync via self-hosted PHP

Date: 2026-06-15
Status: approved (verbal), ready to implement

## Problem

The owner wants the same TimeBolt data available on both their **computer
and phone**, updating automatically — not manual JSON backups. They have
**SiteGround** hosting (PHP + MySQL available).

This is **sync**, not backup. Approach C (a small self-hosted server) is the
only one of the earlier options that gives true cross-device availability.

## Decisions (from brainstorming)

1. **Automatic** sync: pull on app open + on tab refocus; push (debounced)
   on change. No manual button.
2. **Storage = flat JSON file** written by a single PHP script — no database,
   so server setup is just "upload one file" (easiest for a non-dev).
3. **Auth = a shared password/token** the user sets, entered on each device.
   Data lives on the user's own server, over HTTPS.
4. Conflict policy = **whole-dataset last-write-wins** by modified time.
   Acceptable because it's one user across devices used sequentially.
5. The app stays on **GitHub Pages**; the PHP server only stores data
   (cross-origin, handled with CORS).
6. Manual JSON backup/restore stays as the safety net.

## Server — `server/timebolt-sync.php` (+ `server/.htaccess`)

Single PHP file the user uploads to their SiteGround web space. Stores data in
a sibling JSON file with a non-guessable name; `.htaccess` denies direct web
access to `*.json` so only the token-gated script can read it.

Document shape stored on server: `{ version: int, updatedAt: int(ms), payload }`
where `payload` is the TimeBolt `BackupFile`.

Endpoints (token required via `Authorization: Bearer <token>` header; wrong/
missing token → 401):
- `GET  ?action=status` → `{ version, updatedAt }` (lightweight; for pull check)
- `GET  ?action=pull`   → `{ version, updatedAt, payload }`
- `POST ?action=push` body `{ baseVersion, updatedAt, payload }` →
  - if `baseVersion === server.version` (or server empty): store, `version++`,
    return `{ version }` (200)
  - else (server moved on since the client's last sync): return `409` with
    `{ version, updatedAt, payload }` so the client can resolve (LWW)
- `OPTIONS` → CORS preflight (204)

CORS: allow the app origin, `Authorization` + `Content-Type` headers, GET/POST/
OPTIONS. The token (a bearer secret) is what actually protects the data; CORS
is permissive on origin to keep setup simple.

Concurrency: `flock` around file read/write. Single user → negligible
contention.

## Client

### `lib/sync.ts`
- Talks to the server: `getStatus`, `pull`, `push(baseVersion, payload)`.
- **Pure decision function** (unit-tested):
  `decide({ dirty, lastSyncVersion, localModifiedAt, serverVersion, serverUpdatedAt })`
  → one of `noop | push | pull | conflict` where on `conflict` the newer of
  `localModifiedAt` vs `serverUpdatedAt` wins (push if local newer, else pull).
- Builds the dataset via a shared `buildBackupData()` and applies an incoming
  dataset via the existing `restoreBackup()`.

### `db.ts`
- Refactor: extract `buildBackupData(): Promise<BackupFile>` (used by both the
  existing `exportBackup` and sync).
- Add a lightweight change emitter: register Dexie `creating/updating/deleting`
  hooks on clients/projects/entries/settings that call `notifyDataChanged()`;
  expose `subscribeDataChanged(cb)`. Used to mark local data dirty + bump
  `localModifiedAt`.

### Config & sync state (per device, in `localStorage`)
- `sync.url`, `sync.token` — entered in Settings.
- `sync.lastSyncVersion` — server version this device last synced to.
- `sync.localModifiedAt` — ms of last local change (bumped by the emitter).
- `sync.dirty` — unpushed local changes exist.

### `hooks/useSync.ts`
- On mount and on `visibilitychange` (tab refocus) → status check → `decide` →
  pull/push/resolve.
- On `subscribeDataChanged` → mark dirty + debounce (~1.5s) → push.
- Exposes status: `disabled | syncing | synced | offline | error` + last sync
  time + actions `connect(url, token)`, `disconnect()`, `syncNow()`.
- Before applying a pulled dataset that overwrites local changes, save a
  one-slot safety snapshot to `localStorage` (`sync.safetySnapshot`).

### UI — `SettingsPage.tsx`
- New "Sync" section: server URL + password fields, Connect/Disconnect,
  status line ("Synced · 1 min ago" / "Offline" / error). Brief helper text
  pointing at the same values on the other device.

## Errors & edges
- Offline / server down → app keeps working locally, status shows "offline",
  retries on next trigger. No data loss (IndexedDB intact).
- Bad token → clear error, no changes.
- Simultaneous offline edits on both devices → LWW; the older edit is lost.
  Mitigated by frequent push/pull, the 409 version check, the safety snapshot,
  and manual backups. Documented limitation.

## Testing
- Unit-test the pure `decide(...)` function across the matrix (clean pull,
  dirty push, both-changed conflict either direction, noop).
- Integration: run the PHP server locally (`php -S`) and point the app at it to
  verify pull/push/CORS/token end to end (PHP 8.5 is installed locally).
- Final verification on the user's SiteGround is done by the user, guided.

## Out of scope
- Field-level merge (whole-dataset LWW only).
- Real-time simultaneous sync.
- Database storage (flat file is enough for one user).
- Moving the app off GitHub Pages.
