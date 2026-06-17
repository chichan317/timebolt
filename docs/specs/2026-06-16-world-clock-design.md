# Design — World clock + timezone converter

Date: 2026-06-16
Status: approved (verbal), ready to implement

A new "Clocks" page: live world clock + a timeanddate-style converter with
per-city day/night colour bars and a shared time scrubber. DST-correct via IANA
timezones + `Intl` (no hardcoded offsets).

## Data
- `types.ts`: `ClockCity { id, label, timeZone }`; `Settings.clocks?: ClockCity[]`.
  Stored in Settings → synced + backed up. Default = Adelaide, Perth, Medellín.

## `lib/clock.ts` (pure, unit-tested)
- `CITY_PRESETS: { label, timeZone }[]` — curated city list to add from.
- `DEFAULT_CLOCKS: ClockCity[]`.
- `partsInTz(ms, tz)` → numeric Y/M/D/h/m via `Intl.formatToParts`.
- `dayStartUtc(dateStr, tz)` → UTC ms of 00:00 local on that date (DST-safe
  offset trick).
- `formatTime(ms, tz)`, `formatDate(ms, tz)`, `weekday(ms, tz)`,
  `offsetLabel(ms, tz)` (`Intl timeZoneName: 'shortOffset'`).
- `localHourAt(ms, tz)` → 0..23; `hourCategory(h)` → `night | fringe | day`
  (night ≈22–07, day ≈09–18, else fringe).
- `localDateKey(ms, tz)` → `YYYY-MM-DD` (for the day-difference badge).

## `components/Clocks.tsx` (the page)
- Controls: reference-city select, date field, **Now** button, prev/next day.
- **Window** = 24h from `dayStartUtc(date, refTz)`. A range slider (0..1439 min,
  step 15) sets the selected minute-of-day; **Now** = live (ticks each second).
- **Per-city row:** name, GMT offset, big date + time at the selected instant,
  a +1/today/−1-day badge vs the reference, and a **24-segment bar** coloured by
  that city's local hour (night/fringe/day). A shared **vertical marker** crosses
  all bars at the selected instant.
- Dragging the slider (or changing date) leaves live mode; **Now** re-enters it.
- **Manage cities:** add from `CITY_PRESETS` (those not already shown), remove
  with an ×. Persisted via `saveSettings({ clocks })`.

## App wiring
- `App.tsx`: new route `clocks` + sidebar item (new `clock` icon in `ui.tsx`).
  Render `<Clocks settings={settings} />`.

## Testing
- `tests/time.test.ts`: `dayStartUtc`/offset for Adelaide in June (ACST +9:30)
  vs January (ACDT +10:30) — proves DST handling — plus Perth (+8) and Bogotá
  (−5) constants. Visual check of the page (light/dark/mobile) in the preview.

## Out of scope
- Per-city custom working-hour ranges (sensible default for now).
- Sub-15-minute slider steps; "add to calendar"/export.
