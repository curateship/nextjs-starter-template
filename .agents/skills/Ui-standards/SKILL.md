---
name: Ui-standards
description: UI standards for building or modifying any interface in this monorepo — reuse shared components, spacing, control sizes, tables, modals, tabs, scrolling, loading states, and accessibility rules. Read before creating or changing any UI.
tags: ui, design-system, standards
---

# UI Rules

Use these rules for every new or modified interface, in every app in this monorepo. The Trading app is the reference implementation; all other apps copy its visual design exactly. App-specific UI guides may add stricter rules. One rule comes first: reuse the existing UI instead of inventing a parallel version.

## Core Components and Surfaces

- Reuse components from `src/components/ui/`, existing app shells, and established chart, toolbar, and card patterns. Do not hand-roll parallel buttons, forms, tables, modals, cards, or scroll areas.
- Prefer the app's existing shadcn components and keep shared styling in primitives, not repeated page-level classes.
- Match neighboring screens and use semantic theme tokens instead of hardcoded colors.
- The default page canvas is `bg-muted/60`. Content surfaces use `bg-card` with `rounded-xl border border-foreground/5`; use shared `Card`, `TableSurface`, and `WorkspacePanel` components instead of restating that shell.

## Spacing and Page Layout

- The app shell owns page padding. Where an app uses `DashboardContent`, it is the single source of truth for the page gutter and section spacing. In Trading, `src/components/ui/dashboard-content.tsx` defines `p-2 space-y-2 md:p-3 md:space-y-3`, or 8px on narrow screens and 12px on desktop.
- Use the same site gap between page sections, cards, columns, and full-screen workspace panels: `gap-2 md:gap-3` or `space-y-2 md:space-y-3`.
- Full-bleed workspace pages keep the same gutter on their own wrapper (`p-2 md:p-3` on a `bg-muted/60` canvas). In resizable workspaces, the space between panels is the transparent drag handle, not a flex gap: `ResizableHandle` with the `gap` prop renders `w-2 md:w-3` (8px / 12px) so panel gaps always match the page gutter. Each panel body is a `WorkspacePanel` (`rounded-xl border border-foreground/5 bg-card`).
- Do not add page-level padding wrappers or invent other layout gaps such as `gap-3`, `gap-8`, or ad-hoc margins. Small internal gaps such as `gap-1` and `gap-2` are allowed inside a card.
- Centralize full-bleed page exceptions in one app-level route predicate instead of wrapping or unwrapping individual routes. In Trading, use `isFullBleedLocation` in `src/lib/full-bleed-location.ts` for the Trade terminal, bot workspace, Automation editor, and backtest chart.
- Derive page spacing from the currently mounted route so navigation and content change together. Do not use a destination or delayed resolved URL that can carry the previous page's spacing into the next page.
- Design narrow and desktop layouts together. Avoid arbitrary widths, radii, shadows, gradients, pills, or badges.

## Subheader

- Pages or workspaces with a context strip above the content (market info, account selector, page-level actions) use a full-width flat bar, not a floating card: `flex flex-wrap items-center gap-x-5 gap-y-2 border-b bg-card px-4 py-2`. In Trading, `src/components/trading/account-strip.tsx` is the reference.
- Keep identity and stats on the left, account or wallet controls and settings on the right (`ml-auto`), with `gap-x-5` between stat groups.

## Sidebar

- A resizable desktop sidebar must support both click-to-collapse and drag-to-resize. Keep its expanded width between 144px and 420px, save it in the current workspace's database settings, and let a focused resize edge move in 8px steps with the arrow keys.

## Control Sizes

| Size | Height |
| --- | ---: |
| Extra small | 24px (`h-6`) |
| Small | 28px (`h-7`) |
| Default | 32px (`h-8`) |
| Large | 36px (`h-9`) |

- Inputs, selects, and standard buttons use the default height. Icon buttons are square at the matching size.
- Use component size props; never override heights at individual call sites.
- A control keeps one height at every breakpoint. Never add responsive height escalations such as `h-8 sm:h-9`; tab groups size the whole control to 32px (`h-
8 p-[3px]` list, `h-full` triggers).
- Align a divergent shared primitive in a focused design-system change instead of adding local exceptions.

## Buttons, Forms, and Action Icons

- Standard buttons and dropdowns are always 32px (`h-8`) by default, including table-toolbar buttons. The one exception is modal footers: the shared `DialogFooter` forces its buttons to 36px (`h-9`) — accept that, do not override it. Use another documented size only for a clear compact or prominent context.
- Use one primary button per action group, `outline` for secondary actions, `ghost` for low-emphasis actions, and destructive styling only for irreversible actions.
- Order footer actions as Cancel, then primary or destructive. Disable running actions and show a compact loading indicator.
- Icon-only buttons require an accessible name and a tooltip when their meaning is not obvious.
- Use the established Lucide action icons consistently: `PencilIcon` for edit, `Trash2Icon` for delete, `PlusIcon` for add, and `Loader2Icon` for loading.
- Give every field a visible label. Keep help and error text beside the field and preserve entered values after errors.
- Draggable or repeatable text-field lists start with one default row. Users add more rows explicitly; do not create multiple empty rows by default.
- Use `grid gap-2` between a label and its control, `gap-4` between fields and between columns in a field row, and `gap-6` between form sections (the `DialogBody` default in modals).

## Tabs

- Use the shared `Tabs` default segmented style for tab groups: a rounded muted container with the selected tab on a raised background.
- Tabs must be h-8
- The muted tab-list background may fill the available width, but each tab trigger must stay content-width instead of stretching to divide that width.
- Do not use line, underline, or plain-text tabs for new or modified tab groups unless an app-specific guide explicitly requires that navigation style.

## Tables

- Use the app's established dashboard table wrapper (`DashboardTable` in Trading), shared `Table` primitives, and `TableSurface`. Do not build tables from raw div grids or one-off styling.
- Every table must have mass selection: a checkbox column first, with a select-all checkbox in the header (indeterminate when only some rows are selected) and a checkbox on every row. Selecting rows reveals the multi-selection actions (such as `Delete (n)`) at the start of the toolbar.
- Every column must be sortable except the selection checkbox and actions columns. Use the shared `TableSortButton` in each sortable header; do not ship a data column without sorting.
- Use a 40px header (`h-10`), compact cells (`px-5 py-2`), a muted header, and the shared rounded surface.
- Keep the main column flexible, metadata compact, and actions in the final column.
- The item title in the main column is always interactive, never plain text. If the item has its own dashboard or detail page, the title links there; otherwise clicking the title opens the item's edit modal.
- Every row's actions column ends with the same two ghost icon buttons: `SettingsIcon` (opens the row's settings or edit modal) followed by `Trash2Icon` (delete, behind a confirmation). Both need accessible names; add other row actions before these two, never after or between them.
- Order table-card toolbar controls left to right: mass delete (or any multi-selection action), then the search field, then filter or view dropdowns, then secondary buttons, then the single primary button last. Omit unavailable controls without changing the order of the remaining controls.
- Multi-selection actions appear only while rows are selected and show the selected count in their label, such as `Delete (3)`, styled as a soft destructive button. The primary create button uses `PlusIcon` plus a label.
- Use horizontal scrolling for real overflow and hide low-priority columns on narrow screens.
- Keep loading, empty, error, and pagination states inside the table surface.

## Modals

- Use shared `Dialog` for forms and `AlertDialog` or the established confirmation component for destructive actions. Do not nest modals.
- Form modals use the app's established admin variant, with a visible header, scrollable body, and footer. In Trading, use `DialogContent variant="admin"`; do not invent shells, overlays, close buttons, or footer layouts.
- The admin shell (defined in the shared `dialog.tsx`, never restated per modal) is: one uniform theme-aware light gray (`bg-[color-mix(in_oklab,var(--muted)_50%,var(--popover))]`), `rounded-xl ring-1 ring-foreground/10`, `p-0 gap-0`, capped at `max-h-[calc(100vh-4rem)]`, full-screen on mobile. Default width is `sm:max-w-3xl`; narrow one-column forms may pass a smaller cap such as `sm:max-w-lg` on `DialogContent`.
- Header is `DialogHeader` (`px-6 pt-6 pb-0`) with `DialogTitle`, a one-line `DialogDescription` in muted text, and the built-in ghost X close button top-right. Do not add your own close button.
- The body is `DialogBody` — a `ScrollArea` with `grid gap-6 px-6 pt-6 pb-6` and cards forced shadowless. Keep that spacing; do not override it.
- Group the body into white `<Card size="sm">` sections. Put each section title inside `CardHeader`/`CardTitle`, optional help in `CardDescription`, and fields in `CardContent className="grid gap-4"`; do not leave form fields loose on the shell.
- Inside a card: each field is `grid gap-2` (`Label` + control), side-by-side fields use `grid gap-4 sm:grid-cols-2` (or `sm:grid-cols-3`), and every control gets an `id` its `Label` points to with `htmlFor`. Helper text below a field group is `text-sm text-muted-foreground`.
- Modal inputs and dropdowns use the default 32px height (`h-8`); selects add `w-full` so they fill their grid column.
- Footer is `DialogFooter` sitting directly on the gray shell — no border or background band. It right-aligns buttons with `gap-2` and forces them to 36px (`h-9`); do not fight that height. Order is Cancel (`outline`), then the primary action; while submitting, disable both and show a `Loader2Icon` spinner inside the primary button.
- Show submit errors inline at the bottom of the body as `<p role="alert" className="text-sm text-destructive">`; keep entered values.
- Keep confirmations compact and explain the consequence in plain English. Tiny title-and-description confirmations do not need cards.
- Support Escape, focus trapping, focus restoration, and accessible titles. Block closing (including overlay and Escape paths) while a submit is in flight.
- In Trading, use `src/components/automations/create-automation-dialog.tsx` and `src/components/backtest/new-run-dialog.tsx` as the reference form-modal implementations.

## Scrolling

- Use shared `ScrollArea`, plus `ScrollBar` for horizontal overflow. Do not create raw `overflow-auto` or `overflow-scroll` containers.
- Avoid nested scrolling.

## Loading and States

- Do not use skeletons anywhere. Do not add new skeleton components or placeholder shimmer blocks; remove existing ones when you touch a surface that still has them.
- Render the page when its route data is ready instead of showing a loading placeholder for first load or route changes.
- For elements that load or refresh independently (tables, charts, lists, media grids), keep the surface's real frame and show a compact centered `Loader2Icon` spinner inside it, or keep showing the previous data while it refreshes. The loading state stays inside the same panel and footprint; never cover the app shell or whole page.
- Small actions such as saving a form or submitting a button may use a compact spinner and text.
- Every data surface needs intentional loading, empty, error, and populated states. Errors must explain what failed and how to recover.

## Accessibility and Verification

- Use semantic elements, keyboard interaction, visible focus, sufficient contrast, and reduced-motion support.
- Do not communicate state with color alone. Associate form errors with their fields.
- Verify loading, empty, error, disabled, success, long-content, narrow-screen, dark-theme, and keyboard behavior when relevant.
- Validate the changed workflow in the running app when browser or native validation is available.


