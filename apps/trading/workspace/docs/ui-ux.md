# UI-UX Design Guide

Read before building or changing any page. One rule above all: **reuse the existing UI — never invent a parallel version.**

## Spacing

- The site gap is defined once, in `DashboardContent` (`src/components/ui/dashboard-content.tsx`): `p-3 space-y-4 sm:p-4 sm:space-y-6 md:p-6` → **24px on desktop**.
- Every layout gap (between columns, cards, sections) must match it: `gap-4 sm:gap-6` / `space-y-4 sm:space-y-6`.
- Never invent other layout gaps (`gap-3`, `gap-8`, ad-hoc margins) and never add a padding wrapper around a page — `DashboardContent` already provides the gutter.
- Small gaps inside a card (`gap-1`/`gap-2` between label and value) are fine.
- Wrong vs right: ![wrong](assets/pasted-image-1783710798036774000.png) ![site gap to match](assets/pasted-image-1783710819371950000.png)

## Tables

- Use `DashboardTable` (`src/components/dashboard-table.tsx`) for every dashboard table — never hand-roll one.
- **Every column header must be sortable**, using `TableSortButton` from `src/components/ui/table.tsx`.

## Action icons

- Use the same lucide icons already in use everywhere: `PencilIcon` = edit, `Trash2Icon` = delete, `PlusIcon` = add, `Loader2Icon` = loading. Don't pick new icons for these actions.

## Modals

- Always `DialogContent variant="admin"`; copy the anatomy from `sidebar-settings.tsx` (header / scrollable body / footer). Never invent a modal layout.

## Scrolling

- Any scrollable UI must use `ScrollArea` (+ `ScrollBar` for horizontal) from `src/components/ui/scroll-area.tsx` — never raw `overflow-auto`/`overflow-scroll` divs.

## Components

- Use the shadcn components in `src/components/ui/` and the shared chart/toolbar/card patterns from existing dashboards.
