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

- Always `DialogContent variant="admin"` (header / scrollable body / footer). Never invent a modal layout.
- Admin modals have **one uniform light-gray shell** — built into `ui/dialog.tsx` (half-muted mixed over popover, theme-aware). Never re-tint the header, body, or footer separately, and never override the shell color per dialog.
- **Group the body into white section cards**: `<Card size="sm">` with the section title INSIDE the card (`CardHeader` → `CardTitle`, optional `CardDescription` for a hint), fields in `CardContent`. Every field belongs to a card — no stray fields sitting on the gray shell.
- Don't override `DialogBody`'s gap — the modal's own `gap-6` spaces the cards.
- **Dropdowns in modals are `h-8`**: every `SelectTrigger` inside a dialog gets `className="h-8 …"` (compact, matching modal inputs).
- **Footers sit directly on the shell**: no border, no background band (the admin default footer is already borderless — don't add one back).
- Tiny confirmation dialogs (title + description + buttons, no fields) need no cards.
- Reference implementation: `src/components/backtest/new-run-dialog.tsx`.

## Scrolling

- Any scrollable UI must use `ScrollArea` (+ `ScrollBar` for horizontal) from `src/components/ui/scroll-area.tsx` — never raw `overflow-auto`/`overflow-scroll` divs.

## Components

- Use the shadcn components in `src/components/ui/` and the shared chart/toolbar/card patterns from existing dashboards.
