# Design — UX/UI feature batch

Date: 2026-06-16
Status: approved (verbal), ready to implement

Four independent UX features, built in this order. Each is validated
(typecheck/test/build) and visually checked before the next.

## 1. Timer keyboard shortcuts (`components/TimerBar.tsx`)
- **Space**: start (if a project is selected) / pause / resume.
- **S**: stop & save (when running or paused).
- Ignored while typing (focus in input/textarea/select) or when a modal is
  open (`.modal-backdrop` present). A small hint shows the keys in the bar.
- A global `keydown` listener on `window`, guarded; calls the existing
  `useTimer` actions. No data-model change.

## 2. Donut chart on the Dashboard (`components/Dashboard.tsx`)
- New reusable `components/Donut.tsx`: SVG donut from `slices: {label,value,color}[]`.
- Fed by the existing "this week by project" aggregation.
- **Accessible:** a legend lists colour + name + time + **percent** (not
  colour-only); the donut has an `aria-label` summary and `role="img"`.
- Lives in the "This week by project" panel (donut + existing list). Hidden
  when there's no tracked time. One slice → full ring; percentages rounded.

## 3. Common-work templates
- **Data:** new Dexie table `templates` (bump schema to version 2; Dexie
  migrates automatically). Type `WorkTemplate { id, projectId, note, minutes,
  billable, createdAt }` in `types.ts`. db helpers in `db.ts`.
- **Create:** a "Save as quick template" button in `EntryModal` saves the
  current project + note + duration + billable as a template.
- **Use:** a "Quick add" chip row on the Week page lists templates as
  `+ {client} · {project} · {note?} · {duration}`. One click creates a complete
  `TimeEntry` on today's date (editable after), toasts, and auto-syncs.
- **Manage:** an "×" on each chip deletes it (with a confirm).
- Live data via `useLiveQuery`. Cascade: deleting a project should not break
  templates — a template whose project was deleted is filtered out / cleaned.

## 4. Drag-and-drop in the Week view (`components/WeekView.tsx`)
- Entry cards are `draggable`; day columns are drop targets (HTML5 DnD).
- **Drop on a day** → update the entry's `date` to that day (move).
- **Hold Alt/Option on drop** → duplicate to the target day instead (new id +
  `createdAt`), leaving the original.
- Target day highlights on drag-over; dropping on the same day is a no-op.
- Desktop/mouse only (HTML5 DnD doesn't fire on touch); mobile keeps
  tap-to-edit, which can still change the date via the modal. Documented.

## Testing
- Pure/logic bits where they exist (e.g. donut percent math, template→entry
  construction) get unit coverage. Browser-only behaviour (shortcuts, DnD) is
  verified in the preview across light/dark/mobile.

## Out of scope
- Dashboard comparisons / goals / activity chart (user picked donut only).
- Touch drag-and-drop.
- Reordering entries within a day (no start/end times, order isn't meaningful).
