# Design — Invoice details + shared timer

Date: 2026-06-16
Status: approved (verbal), ready to implement

Two approved features.

## A. Invoice improvements (saved business profile + client details)

### Data
- `types.ts`: `BusinessProfile { name, abn, address, email, payment }` (all
  strings). Add `business?: BusinessProfile` to `Settings`. Add optional
  `address?`, `email?`, `abn?` to `Client`.
- Both ride the existing Settings/Client → backup + sync (no schema bump).

### Settings → new "Business details" section (`SettingsPage.tsx`)
- Inputs: business name, ABN, address (multiline), email, payment details
  (multiline). Saved to `Settings.business` on change via `saveSettings`.

### Clients → modal fields (`Clients.tsx`)
- Add Address, Email, ABN inputs to the client modal; persist on the client.

### Invoice (`Invoice.tsx`)
- Header reads the saved profile: business name, ABN, address, email (no more
  retyping). Footer shows the profile's payment details.
- Bill-to shows the client's name + address + email + ABN (single-client
  invoices; multi-client keeps per-section names).
- Keep the per-invoice Notes box. If the profile name is empty, show a hint
  linking to Settings → Business details.
- Out of scope (deferred): GST/Tax-invoice, sequential numbering, due dates.

## B. Shared running timer across devices

Goal: start the timer on one device, see it active (and controllable) on the
other. Updates on app open/focus, like the rest of sync. No PHP change.

### Mechanism
- Move timer persistence into `lib/timerStore.ts`: `loadTimer()`, `saveTimer()`,
  `TIMER_SYNC_EVENT`, `applyExternalTimer(state)` (saves + dispatches the event).
- `BackupFile.timer?: TimerState | null` (optional, **transient**). The sync
  payload is built by `buildBackupData()`, which now includes `loadTimer()`.
- `useTimer.ts` uses `timerStore`. Every user action (start/pause/resume/stop/
  discard/note/billable) saves **and** calls `notifyDataChanged()` so a sync
  push is scheduled. A listener on `TIMER_SYNC_EVENT` reloads state from storage.
- On pull, `useSync.applyServerDoc` applies `doc.payload.timer` via
  `applyExternalTimer` (raw save, no notify → no loop). `restoreBackup` ignores
  `backup.timer` (manual restores never resurrect a timer).
- Elapsed time stays correct on any device because `TimerState.startedAt` is an
  absolute epoch-ms timestamp.

### Behaviour & edges
- Either device can pause/stop the shared timer; the change syncs back.
- Two concurrent timers on two devices → last-write-wins (one user: rare).
- Not live second-by-second; refresh on open/focus is the contract.

## Testing
- Invoice: verify in the preview with a filled profile + client details
  (light/dark).
- Timer: verify the timer object round-trips through the sync payload (start →
  pushed payload includes timer; applying a payload sets the local timer) in the
  preview against a local PHP server.
