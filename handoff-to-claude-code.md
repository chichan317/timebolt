# Handoff to Claude Code — TimeBolt

This document hands off the **TimeBolt** project so development can continue in **Claude Code** (terminal). It describes what the app is, how it's built, the conventions to follow, and what's already been done. Read this first before making changes.

> Owner note (Cristian): I'm not a developer. Please explain steps in plain English and give clear, numbered instructions when I need to do something.

---

## 1. What the app is

TimeBolt is a **local-first time-tracking web app** for freelancers/agencies. It tracks hours by **client → project**, shows the week visually, calculates **billable totals**, and exports data for invoicing.

- **All data lives in the browser** (IndexedDB via Dexie). There is no backend, no login, no server. Nothing leaves the user's machine.
- The running timer is also persisted (to `localStorage`) so a reload or closed tab never loses time.
- Backups are manual: export/import a JSON file.

---

## 2. Tech stack

| Area | Choice |
|------|--------|
| Framework | React 18 + TypeScript |
| Build tool | Vite 5 |
| Storage | Dexie 4 (IndexedDB) + `dexie-react-hooks` (`useLiveQuery`) |
| Routing | Hash-based, hand-rolled in `App.tsx` (`#/week`, `#/dashboard`, …). **No router library.** |
| Styling | A single global CSS file: `src/styles.css`. **No Tailwind, no CSS-in-JS, no component library.** |
| Tests | `tsx` runs `tests/time.test.ts` (plain assertions, no Jest/Vitest) |

Keep it dependency-light. Don't introduce a router, state manager, or UI kit unless there's a strong reason.

---

## 3. How to run it

From the project folder:

```bash
npm install      # first time only
npm run dev      # start dev server (http://localhost:5173)
npm run build    # typecheck (tsc --noEmit) + production build to dist/
npm run typecheck# types only, no build
npm test         # run tests/time.test.ts
```

**Note on environments:** `npm run build` and `npm test` rely on platform-native binaries (rollup / esbuild). If you ever run them on a different OS/CPU than where `node_modules` was installed, you'll get `MODULE_NOT_FOUND` (rollup) or esbuild platform errors. Fix by reinstalling for the current platform (e.g. `npm install @rollup/rollup-<platform> @esbuild/<platform>` or just delete `node_modules` and `npm install`). On the owner's own Mac this is not an issue.

---

## 4. Project structure

```
src/
  App.tsx              # Shell: sidebar nav, hash routing, theme application, page switch
  main.tsx             # React entry; wraps app in ToastProvider
  styles.css           # ALL styling (design tokens + every component). ~1350 lines.
  types.ts             # Data model + constants (Client, Project, TimeEntry, Settings, colors, currencies)
  db.ts                # Dexie schema + all DB queries/mutations (cascade deletes, ranges, wipe)
  components/
    ui.tsx             # Shared primitives: Modal, ConfirmDialog, ToastProvider/useToast,
                       #   EmptyState, BoltIcon, and the SVG Icon set (Icon, IconName)
    TimerBar.tsx       # Top-bar timer: start/pause/resume/stop/discard, note, billable
    WeekView.tsx       # 7- or 5-day grid; add/edit time inline; week totals
    Dashboard.tsx      # Today/week/month stat cards; "by project" bars; recent entries
    Reports.tsx        # Filterable table + CSV export for invoicing
    Clients.tsx        # CRUD for clients & projects (rates, colors, archive)
    SettingsPage.tsx   # Currency, week start, rounding, time format, theme, backup, danger zone
    EntryModal.tsx     # Create/edit a single time entry
    BackupBanner.tsx   # Reminder to export a backup
  hooks/
    useData.ts         # useClients/useProjects/useSettings/useClientMap/useProjectMap (live queries)
    useTimer.ts        # Running-timer state machine, persisted to localStorage
  lib/
    time.ts            # Date keys (YYYY-MM-DD), week/month math, formatMinutes, formatClock
    money.ts           # resolveRate, entryAmount, rounding, formatMoney, sumTotals
    csv.ts             # CSV string builder for Reports export
    storage.ts         # requestPersistence() + storage estimate helpers
    backup.ts          # JSON export/import (BackupFile)
tests/time.test.ts     # Unit tests for time/money helpers
```

### Data model (see `src/types.ts`)
- **Client** → has many **Project** → has many **TimeEntry**.
- Rate resolution: a project's `hourlyRate` overrides its client's `hourlyRate`; `null` means inherit/none.
- **Retainer clients:** a `Client.retainerAmount` (monthly fixed) marks a retainer client (`isRetainer` in `lib/money.ts`). Their work is still tracked, but `resolveRate` returns 0 for them so they never bill hourly anywhere. Reports/Dashboard show their time with a "retainer" tag instead of an amount and exclude them from hourly money totals; the **Invoice** bills them one fixed "Monthly retainer" line and includes it in the total. (Reports excludes the retainer, the invoice includes it — intentional: Reports = hourly earnings, invoice = the real bill.)
- `TimeEntry.minutes` is whole minutes; `date` is a local `YYYY-MM-DD` string.
- **Settings** is a single row (`id: 'settings'`); rounding/time-format/currency/week-start/theme.
- Cascade deletes live in `db.ts` (`deleteClientCascade`, `deleteProjectCascade`) — always use them so no orphan entries remain.

### Cross-device sync (optional, off by default)
- The app is still local-first; sync is opt-in via **Settings → Sync across devices**.
- A tiny self-hosted PHP server (`server/timebolt-sync.php` + `.htaccess`, no DB — stores the `BackupFile` as one JSON doc with a `version`) holds the data; the user uploads it to their own host and enters its URL + a secret token on each device. Setup guide: `server/README.md`.
- Client pieces: `lib/sync.ts` (server calls + the pure, unit-tested `decideSync` last-write-wins logic), `hooks/useSync.ts` (pull on open/refocus, debounced push on change, status), `components/SyncSettings.tsx` (the Settings UI). `db.ts` exposes `subscribeDataChanged` (via Dexie table hooks) and `backup.ts` exposes `buildBackupData()` — both reused by sync.
- Conflict policy is whole-dataset last-write-wins by modified time with a `localStorage` safety snapshot before an overwriting pull. Per-record merge is intentionally out of scope.

---

## 5. Conventions to follow

- **TypeScript strict.** No `any`. Run `npm run typecheck` before claiming done.
- **Styling = `src/styles.css` only.** Use the existing CSS custom properties (design tokens) — never hardcode hex colors in components. Add a new token if you need a new color.
- **Data access goes through `db.ts` and the hooks in `hooks/useData.ts`.** Don't call Dexie directly from components.
- **Live data via `useLiveQuery`** so the UI auto-updates after writes.
- **Icons are SVG, never emoji.** Use the `Icon` component / `IconName` union in `components/ui.tsx`; add new icons there (1.8px stroke, rounded, 24×24 viewBox) rather than inlining one-off SVGs.
- **Money/time math lives in `lib/money.ts` and `lib/time.ts`** and is unit-tested. If you change rounding or formatting, update `tests/time.test.ts`.
- Keep accessibility intact: `aria-label` on icon-only buttons, visible focus rings, ≥4.5:1 text contrast in both themes.

---

## 6. Design system (current look)

The UI was redesigned to a **refined glassmorphism** style while keeping the original **indigo + amber ("bolt")** identity. Key ideas, all driven by tokens in `src/styles.css`:

- **Frosted glass on the chrome only** — sidebar, top bar, stat cards, panels, filters, week summary, and modals use translucent backgrounds + `backdrop-filter: blur(...)`. Tokens: `--glass`, `--glass-strong`, `--glass-border`, `--glass-shadow`, `--glass-blur`.
- **Data stays on solid surfaces** (`--surface`) for readability — day columns, time-entry cards, and tables are NOT frosted. Keep this rule when adding data-dense UI.
- **Background glows**: three soft radial blobs (`body::before`, `body::after`, `#root::before`) give the glass something to frost over. Colors via `--bg-blob-1/2/3`.
- **Light + dark** are both defined (`:root` and `[data-theme='dark']`). Theme is applied in `App.tsx` from `Settings.theme` (`system`/`light`/`dark`). Always test both.
- **Mobile**: below 760px the floating sidebar collapses into a bottom nav bar (see the media queries at the bottom of `styles.css`). Test at 375px.

There is a standalone reference mockup at **`docs/dashboard-preview.html`** (open in a browser) showing the approved Dashboard look with a light/dark toggle. It's only a reference — the real styles live in `src/styles.css`. Safe to delete.

---

## 7. Status & suggested next steps

**Done recently:** full visual redesign (glassmorphism + indigo) applied across all 5 pages; emoji/unicode glyphs replaced with a consistent SVG icon set; build + typecheck pass. Project moved into a git repo and cleaned up (removed leftover Vite temp artifacts + stale `dist/`; reference mockup moved to `docs/`).

**Done in the Claude Code continuation:**
1. ✅ Text `+` on "New entry" / "New client" / "Add project" buttons replaced with the `plus` SVG icon (`.btn-icon`).
2. ✅ Reports: per-client **subtotal** rows + a grand **total** row in the "By client & project" table. (Date-range presets and the grouped summary already existed — the earlier note here was stale.)
4. ✅ Invoicing export: a **printable invoice** view (`components/Invoice.tsx`) opened from Reports. Built from the active filters, grouped by client/project with billed hours, rate, amount, subtotals and total. Uses `window.print()` → browser "Save as PDF" (no PDF dependency). Print styles live in the `@media print` block at the end of `styles.css`. The invoice sheet is intentionally paper-styled (fixed light colours) — a documented exception to the tokens-only rule.
6. ✅ Added rounding edge-case tests plus `entryAmount` / `resolveRate` coverage in `tests/time.test.ts`.

**Open / nice-to-have ideas (not started):**
3. Dashboard: optional donut chart of time-by-project (keep it accessible — legend + values, not color-only).
5. Keyboard shortcuts for the timer (start/stop/pause).

**Before finishing any task:** run `npm run typecheck` (and `npm test` / `npm run build` if the platform binaries are installed), and visually check both light and dark themes plus mobile width.
