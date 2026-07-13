# UI-UX Design Guide

Read before building or changing any page. One rule above all: **reuse the existing UI — never invent a parallel version.**

## Spacing

- The site gap is defined once, in `DashboardContent` (`src/components/ui/dashboard-content.tsx`): `p-2 space-y-2 md:p-3 md:space-y-3` → **8px on smaller screens and 12px on desktop**.
- Every layout gap between columns, cards, sections, and full-screen workspace panels must match it: `gap-2 md:gap-3` / `space-y-2 md:space-y-3`.
- Never invent other layout gaps (`gap-3`, `gap-8`, ad-hoc margins) and never add a padding wrapper around a page — `DashboardContent` already provides the gutter.
- Small gaps inside a card (`gap-1`/`gap-2` between label and value) are fine.
- Wrong vs right: ![wrong](assets/pasted-image-1783710798036774000.png) ![site gap to match](assets/pasted-image-1783710819371950000.png)

## Full-bleed pages (padding on navigation)

- A few pages drop the `DashboardContent` gutter and manage their own edges: the live Trade terminal, the bot workspace, an automation editor, and the backtest chart. This opt-out is decided in ONE place — `isFullBleedLocation` in `src/components/shell-layout.tsx`. Add a page there; don't wrap or unwrap padding per route.
- **Decide padding from the page that is actually rendered, never the page you are navigating to.** During a navigation the old page stays mounted until the new one's data loads, so `shell-layout` reads the _settled_ location (`resolvedLocation` while `status === "pending"`, otherwise `location`). Judging the pending target instead strips padding off the still-visible old page for a frame — a visible flash when leaving a padded table for the full-bleed chart. (Fixed July 2026; don't reintroduce the target-location check.)

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

## Loading

- Dashboard data loads must show the shared skeletons from `src/components/loading-skeleton.tsx`; never leave a blank panel or centered “Loading…” sentence.
- Route-backed dashboards use the router's default `DashboardLoadingSkeleton`. Full-screen workspaces, charts, tables, and market lists use their matching shared skeleton.
- Wrap full-screen trade, bot, automation, and backtest workspaces in `WorkspaceLoadBoundary`. It mounts panels invisibly behind `WorkspaceLoadingSkeleton` and reveals them only after fonts and panel sizing have settled, preventing a shrunken first frame.
- Small action states such as saving a form or submitting a button may still use a compact spinner and text.

## Components

- Use the shadcn components in `src/components/ui/` and the shared chart/toolbar/card patterns from existing dashboards.
- The default page canvas is `bg-muted/40`. Content surfaces are white `bg-card` cards with `rounded-xl border border-foreground/5`; use the shared `Card`, `TableSurface`, and `WorkspacePanel` components instead of restating that shell.
