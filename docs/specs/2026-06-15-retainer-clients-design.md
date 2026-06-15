# Design — Retainer clients

Date: 2026-06-15
Status: approved (verbal), ready to implement

## Problem

Some clients are billed a **fixed monthly retainer** regardless of hours
worked. The owner still wants to **track time** for these clients (personal
insight) and to **invoice** them the fixed amount — not hours × rate.

## Decisions (from brainstorming)

1. Retainer is a client-level fixed monthly amount. If a client has a
   retainer, **all** their work is covered by it (tracked, not billed hourly).
2. Retainer invoice = **a single fixed line** ("Monthly retainer"), no hours
   breakdown.
3. In Reports/Dashboard, retainer clients show **time** plus a **"retainer"
   tag** where the hourly amount would be. Hourly money totals **exclude**
   retainers.
4. The Invoice total **includes** retainer amounts (it is the real bill). This
   asymmetry with Reports is intentional and documented.

## Approach (chosen: A — single field)

Add `retainerAmount: number | null` to `Client`.
- `null` → hourly client (current behaviour).
- positive number → retainer client.
- Derived helper `isRetainer(client)` = `retainerAmount != null && > 0`.

Rejected: (B) explicit `billingMode` enum — redundant given the amount implies
the mode; (C) per-month retainer table — over-engineered (new table + migration).

## Changes

### Data model — `src/types.ts`
- Add `retainerAmount: number | null` to `Client`.
- No Dexie schema/version change (field is not indexed). Existing rows read as
  `undefined` → treated as `null`. Backward compatible, no migration.

### Money — `src/lib/money.ts`
- `resolveRate(project, client)` returns `0` when the client is a retainer
  client, regardless of any stored hourly rate. This zeroes hourly money for
  retainer clients everywhere (Week, Dashboard, Reports, CSV) through the one
  existing code path. Add `isRetainer(client)` helper.

### Clients page — `src/components/Clients.tsx`
- Client modal: a billing-mode toggle **Hourly / Retainer (fixed monthly)**.
  - Hourly → existing "Default hourly rate" field; `retainerAmount = null`.
  - Retainer → "Monthly retainer amount" field; `hourlyRate = null`.
- Client card header: retainer clients show a `retainer` tag and
  `{amount}/mo retainer` instead of `{rate}/h default`.

### Reports — `src/components/Reports.tsx`
- Per-project rows and per-client subtotal of retainer clients show a
  `retainer` label instead of `$0` in the Amount column; their amount is not
  added to the grand Total.
- Enable the "Invoice" button when the filtered set has hourly amount > 0
  **or** contains at least one retainer client.

### Dashboard — `src/components/Dashboard.tsx`
- "This week by project" rows for retainer clients show a `retainer` tag
  instead of an amount.

### Invoice — `src/components/Invoice.tsx`
- For a retainer client, render one line "Monthly retainer" = `retainerAmount`
  (no project breakdown). Hourly clients unchanged.
- Grand total = sum of hourly amounts + retainer amounts of the clients in the
  invoice.

### Tests — `tests/time.test.ts`
- `resolveRate` returns 0 for a retainer client; `entryAmount` is 0 for their
  entries; `isRetainer` true/false cases.

## Out of scope (confirmed)
- CSV export unchanged (retainer rows show amount 0).
- No per-client "extra hourly project" alongside a retainer (can be added
  later if needed).
- Backup format: `retainerAmount` flows through `clients[]` automatically; old
  backups without the field load as `null`.
