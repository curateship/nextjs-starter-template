# UI-UX Design Guide

Read before building or changing any page. One rule above all: **reuse the existing UI — never invent a parallel version.**

## Spacing

- The site gap is defined once, in `DashboardContent` (`src/components/ui/dashboard-content.tsx`): `p-3 space-y-4 sm:p-4 sm:space-y-6 md:p-6` → **24px on desktop**.
- Every layout gap (between columns, cards, sections) must match it: `gap-4 sm:gap-6` / `space-y-4 sm:space-y-6`.
- Never invent other layout gaps (`gap-3`, `gap-8`, ad-hoc margins) and never add a padding wrapper around a page — `DashboardContent` already provides the gutter.
- **Exception (Tyler's call, July 2026): the full-screen Trade terminal uses HALF the site gap** — 8px/12px (`w-2 sm:w-3` gap handles, `p-1.5 sm:p-2 md:p-3` page padding) — so the dense floating-panel layout keeps its screen space. This applies only to the trade terminal's panel grid, not to regular dashboards.
- Small gaps inside a card (`gap-1`/`gap-2` between label and value) are fine.
- Wrong vs right: ![wrong](assets/pasted-image-1783710798036774000.png) ![site gap to match](assets/pasted-image-1783710819371950000.png)

## Full-bleed pages (padding on navigation)

- A few pages drop the `DashboardContent` gutter and manage their own edges: the live Trade terminal, the bot workspace, an automation editor, and the backtest chart. This opt-out is decided in ONE place — `isFullBleedLocation` in `src/components/shell-layout.tsx`. Add a page there; don't wrap or unwrap padding per route.
- **Decide padding from the page that is actually rendered, never the page you are navigating to.** During a navigation the old page stays mounted until the new one's data loads, so `shell-layout` reads the *settled* location (`resolvedLocation` while `status === "pending"`, otherwise `location`). Judging the pending target instead strips padding off the still-visible old page for a frame — a visible flash when leaving a padded table for the full-bleed chart. (Fixed July 2026; don't reintroduce the target-location check.)

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
- Small action states such as saving a form or submitting a button may still use a compact spinner and text.

## Components

- Use the shadcn components in `src/components/ui/` and the shared chart/toolbar/card patterns from existing dashboards.
