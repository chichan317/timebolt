# Design — Fixed-price projects + invoice editing

Date: 2026-06-17
Status: approved (verbal), ready to implement

## 1. Fixed-price projects
A project can be billed one flat price for the whole project (time still tracked).

- `types.ts`: `Project.fixedPrice?: number | null`.
- `lib/money.ts`: `isFixedPrice(project)` = `fixedPrice != null && > 0`. `resolveRate`
  returns 0 when the project is fixed-price (as it already does for retainer
  clients) → hourly money is zeroed for fixed-price projects everywhere.
- `Clients.tsx` ProjectModal: a Hourly / Fixed-price toggle. Hourly → existing
  rate field (`fixedPrice = null`). Fixed → a "Fixed project price" field
  (`hourlyRate = null`, `fixedPrice = amount`).
- `Clients.tsx` project row: fixed-price projects show a `fixed` tag and
  `{price} fixed` instead of the `/h` rate.
- `Reports.tsx` + `Dashboard.tsx`: fixed-price project rows/entries show a
  `fixed` label instead of an hourly amount and are excluded from hourly totals
  (same treatment as retainer).
- Invoice: a fixed-price project becomes one line `{project} (fixed price)` =
  `fixedPrice` (handled in the invoice rewrite below).

## 2. Invoice: one client + editable lines

Rewrite `Invoice.tsx` to bill a single chosen client with editable lines.

- **Client selector:** the invoice shows a dropdown of clients that have work in
  the filtered range; it bills only the selected client. Default = the Reports
  client filter if set, else the first such client. (Reports passes its
  `clientFilter` as `initialClientId`.)
- **Editable lines** (`Description | Amount`), seeded from the chosen client:
  - hourly project → `{project} — {h} h @ {rate}/h`, amount = computed;
  - retainer client → one `Monthly retainer` line = `retainerAmount`;
  - fixed-price project → `{project} (fixed price)` = `fixedPrice`.
  - Each line's description and amount are editable; lines can be deleted; an
    "+ Add line" adds a blank line (negative amount = discount). Total = sum,
    recomputed live. Lines re-seed when the client changes.
  - Amount stored as a string for editing; parsed for the total. A currency
    symbol prefixes the field. In print the inputs render borderless as text.
- Header (business profile), Bill-to (now always the single selected client's
  details), Payment, and Notes are kept.
- `Reports.tsx`: the Invoice button is enabled when any client has work in the
  range; it passes the clients-with-work + initial client id.

## Testing
- `tests/time.test.ts`: `isFixedPrice` true/false; `resolveRate` returns 0 for a
  fixed-price project even with an hourly rate set.
- Preview: a fixed-price project shows `fixed` in Clients/Reports and a fixed
  line on the invoice; invoice client selector limits to one client; editing an
  amount and adding a line updates the total; print renders inputs as text.

## Out of scope
- Saving/numbering invoices; tax/GST; per-line tax.
