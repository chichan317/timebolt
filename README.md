# ⚡ TimeBolt

Local-first time tracking for solo freelancers. Track hours by client and project, see your week at a glance, and export clean data for invoicing — with **zero backend**. Everything is stored in your browser's IndexedDB and never leaves your machine.

Inspired by the best parts of Harvest, Toggl Track and Clockify: a color-coded weekly view you can edit in place, a one-click timer that survives page reloads, and billable totals visible everywhere.

## Features

- **Weekly view as the home screen** — seven color-coded day columns, click any entry to edit, `+` on any day to add time, 5-day/7-day toggle, and a "copy last week" shortcut for recurring schedules.
- **Timer** — start/pause/stop from the always-visible top bar. The running time is saved to localStorage, so closing the tab or reloading never loses it. The tab title shows the running clock.
- **Manual entry** — flexible duration parsing: `1:30`, `1.5h`, `90m`, `1h 30m`, `8` (hours) or `45` (minutes) all work.
- **Clients & projects** — projects belong to clients, each with optional hourly rates (project rate overrides client rate). Archive anything to hide it without losing history; deletion always warns about affected entries.
- **Billable tracking** — per-entry billable flag with per-project defaults; billable amounts shown on entries, day totals, dashboard and reports.
- **Dashboard** — today / this week / this month totals with billable amounts, a per-project breakdown, and recent entries.
- **Reports** — filter by date range (presets or custom), client, project and billable status; grouped client/project summary plus a detailed entry list.
- **CSV export** — invoicing-ready columns: date, client, project, note, billable, exact hours, rounded billed hours, rate, amount, currency.
- **JSON backup** — one-click full export and restore of all data and settings.
- **Data safety** — the app requests persistent storage from the browser (so IndexedDB isn't auto-evicted), shows storage durability and usage in Settings, and displays a reminder banner when you have 3+ entries and your last backup is more than 7 days old (snoozable for 3 days).
- **Settings** — currency, billing rounding (none / 5 / 6 / 10 / 15 / 30 / 60 min, nearest or always-up), week start day, time display (1:30 vs 1.50), light/dark/system theme.
- **Mobile-friendly** — the sidebar becomes a bottom tab bar, day columns stack vertically.

Rounding only affects billed amounts in reports and exports; tracked minutes are always stored exactly.

## Quick start

```bash
npm install
npm run dev       # local dev server
npm run build     # typecheck + production build into dist/
npm test          # unit tests for time parsing, rounding, week math
```

Requires Node 18+. The app starts completely empty — add your first client under **Clients**, add a project, then track time from the **Week** page or the timer bar.

## Deployment

See [DEPLOYMENT.md](DEPLOYMENT.md) for GitHub Pages instructions (automatic via GitHub Actions, or manual). The included workflow in `.github/workflows/deploy.yml` deploys on every push to `main`.

## Architecture

| Layer | What it does |
|---|---|
| `src/types.ts` | All domain types: `Client`, `Project`, `TimeEntry`, `Settings`, backup format |
| `src/db.ts` | Dexie (IndexedDB) schema and data helpers, cascade deletes, usage counts |
| `src/lib/time.ts` | Date keys, week math, duration parsing/formatting, billing rounding |
| `src/lib/money.ts` | Rate resolution, entry amounts, totals |
| `src/lib/csv.ts` / `src/lib/backup.ts` | CSV building/escaping, JSON backup export/validate/restore |
| `src/hooks/useTimer.ts` | Timer state machine persisted to localStorage |
| `src/hooks/useData.ts` | Live (reactive) queries via `dexie-react-hooks` |
| `src/components/` | Week view, dashboard, reports, clients, settings, timer bar, modals |

Stack: React 18 + TypeScript (strict) + Vite + Dexie. No CSS framework — a single hand-rolled stylesheet with CSS variables for theming.

Dates are stored as local `YYYY-MM-DD` strings and durations as whole minutes, which avoids every timezone pitfall a start/end-timestamp model brings and matches how timesheets are actually edited.

## Your data

All data lives in this browser's IndexedDB (database name `timebolt`). Nothing is transmitted anywhere. Two consequences:

1. **Different browser or device = different data.** Use Settings → *Download JSON backup* / *Restore from backup* to move between machines.
2. **Browsers can evict local storage** (clearing site data, private windows, storage pressure). Back up regularly — it's one click.

## License

MIT — do whatever you like with it.
