# Design — No-charge (pro bono) clients

Date: 2026-06-17
Status: approved (verbal), ready to implement

A third client billing mode for clients you never bill (track time only).

## Data
- `types.ts`: `Client.nonBillable?: boolean`. Optional → backward compatible;
  rides Settings/Client sync + backup. A client is "no charge" when `true`.

## Money (`lib/money.ts`)
- `isNoCharge(client)` = `client?.nonBillable === true`.
- `resolveRate` returns 0 when `isRetainer || isNoCharge` (client) or
  `isFixedPrice` (project) — so no hourly money anywhere.

## Clients (`components/Clients.tsx`)
- Client modal billing toggle becomes three options: **Hourly · Retainer ·
  No charge** (shorten the retainer button to "Retainer"; the "(fixed monthly)"
  note stays under the amount field). "No charge" stores
  `nonBillable = true, hourlyRate = null, retainerAmount = null`; the others
  clear `nonBillable`.
- Client card: a `no charge` tag + "no charge" instead of a rate.

## Reports + Dashboard
- `Reports.tsx`: `ClientGroup.noCharge`; show `no charge` in the amount cells
  (project rows + subtotal) and the entries-table amount, mirroring retainer.
  Excluded from the billable-amount total (already 0 via resolveRate). The
  Invoice button is unaffected (no-charge work adds no billable amount).
- `Dashboard.tsx`: "this week by project" shows a `no charge` tag instead of an
  amount for no-charge clients.

## Invoice (`components/Invoice.tsx`)
- Exclude no-charge clients from the `clientsWithWork` picker — they are never
  invoiced.

## Styles / tests
- `.tag-nocharge` (muted/neutral).
- `tests/time.test.ts`: `isNoCharge` true/false; `resolveRate` returns 0 for a
  no-charge client even with an hourly rate set.

## Out of scope (per the user's choice)
- A Reports billing-type filter or a separate billable-vs-tracked summary —
  tags only for now.
