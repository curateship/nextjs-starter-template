# UI Rules

Use these rules for every new or modified interface. App-specific UI guides may add stricter rules. One rule comes first: reuse the existing UI instead of inventing a parallel version.

## Core Components and Surfaces

- Reuse components from `src/components/ui/`, existing app shells, and established chart, toolbar, and card patterns. Do not hand-roll parallel buttons, forms, tables, modals, cards, or scroll areas.
- Prefer the app's existing shadcn components and keep shared styling in primitives, not repeated page-level classes.
- Match neighboring screens and use semantic theme tokens instead of hardcoded colors.
- The default admin page canvas is a full-height light gray surface (`bg-foreground/8 dark:bg-background`), owned by `AdminLayout` together with the 12px page gutter (`p-3`). Content surfaces are borderless white cards (`bg-card`, no ring/border) floating on that canvas; use shared `Card` and `TableSurface` components instead of restating that shell.

## Spacing and Page Layout

- The app shell owns page padding. In Directory, `AdminLayout` is the single source of truth: a 12px gutter (`p-3`) on the gray canvas, with `CardGroup` providing the matching 12px gap (`gap-3`) between cards.
- Use the same site gap between page sections, cards, columns, and full-screen workspace panels: `gap-2 md:gap-3` or `space-y-2 md:space-y-3`.
- Do not add page-level padding wrappers or invent other layout gaps such as `gap-3`, `gap-8`, or ad-hoc margins. Small internal gaps such as `gap-1` and `gap-2` are allowed inside a card.
- Centralize full-bleed page exceptions in one app-level route predicate instead of wrapping or unwrapping individual routes.
- Derive page spacing from the currently mounted route so navigation and content change together. Do not use a destination or delayed resolved URL that can carry the previous page's spacing into the next page.
- Design narrow and desktop layouts together. Avoid arbitrary widths, radii, shadows, gradients, pills, or badges.

## Sidebar

- A resizable desktop sidebar must support both click-to-collapse and drag-to-resize. Keep its expanded width between 144px and 420px, save it in the current workspace's database settings, and let a focused resize edge move in 8px steps with the arrow keys.
- Sidebar editor safety: every Reset and Delete Section goes through `ConfirmDestructive` with a policy key, and the copy counts the damage ("**Administration** and its 3 links will be removed."). A reset that restores all defaults is labeled "Reset all to defaults", never a bare "Reset". New links start with an empty label and address, and a link whose label is blank never renders in the live nav (`isAdminSidebarEntryNamed` in `src/lib/utils/admin-sidebar.ts`) — the editor shows it as muted "Name this link" and focuses the Label field on open.

## Control Sizes

| Size | Height |
| --- | ---: |
| Extra small | 24px (`h-6`) |
| Small | 28px (`h-7`) |
| Default | 32px (`h-8`) |
| Large | 36px (`h-9`) |

- Inputs, selects, and standard buttons use the default height. Icon buttons are square at the matching size.
- Use component size props; never override heights at individual call sites.
- Align a divergent shared primitive in a focused design-system change instead of adding local exceptions.

## Buttons, Forms, and Action Icons

- Standard buttons are always 32px (`h-8`) by default, including modal footer and table-toolbar buttons. Use another documented size only for a clear compact or prominent context.
- Use one primary button per action group, `outline` for secondary actions, `ghost` for low-emphasis actions, and destructive styling only for irreversible actions.
- Order footer actions as Cancel, then primary or destructive. Disable running actions and show a compact loading indicator.
- Icon-only buttons require an accessible name and a tooltip when their meaning is not obvious.
- Use the established Lucide action icons consistently: `PencilIcon` for edit, `Trash2Icon` for delete, `PlusIcon` for add, and `Loader2Icon` for loading.
- Give every field a visible label. Keep help and error text beside the field and preserve entered values after errors.
- Color fields use the shared `HexColorInput` (`src/components/ui/hex-color-input.tsx`): a swatch plus a hex text box. Only a full 6-digit `#rrggbb` is ever saved; leaving the box with anything else marks the field, reports through the shared error toast, and keeps the last good color in force. Never wire a bare color input + text input pair by hand.
- Draggable or repeatable text-field lists start with one default row. Users add more rows explicitly; do not create multiple empty rows by default.
- Use `gap-1` label-to-control, `gap-2` within field groups, and `gap-4` between form sections.

## Tabs

- Use the shared `Tabs` default segmented style for tab groups: a rounded muted container with the selected tab on a raised background.
- The muted tab-list background may fill the available width, but each tab trigger must stay content-width instead of stretching to divide that width.
- Do not use line, underline, or plain-text tabs for new or modified tab groups unless an app-specific guide explicitly requires that navigation style.

## Tables

- Use the admin's established table wrapper `AdminTableShell` (`src/components/admin/layout/list/components.tsx`), shared `Table` primitives, and `TableSurface`. Do not build tables from raw div grids or one-off styling.
- Every data column header must be sortable when it represents a sortable value. Use the shared `TableSortButton`; selection and action columns are not sortable.
- Use a 40px header (`h-10`), compact cells (`px-5 py-2`), a muted header, and the shared rounded surface.
- Keep the main column flexible, metadata compact, and actions in the final column.
- Order table-card toolbar controls from left to right: mass delete, search, filters, settings, edit actions, then create buttons. Omit unavailable controls without changing the order of the remaining controls.
- **Long text never widens a table, and cut-off text is never unreadable.** One rule, three cases. **Identifier values** (a name, an email, a filename, a domain) sit on one line with `truncate` and a `title` carrying the full value; outside the flexible main column, cap the cell (`className="max-w-56"` on the `TableCell`, with a `block truncate` span inside). **Message columns** — the main free-text column — clamp to two lines with `line-clamp-2 whitespace-normal`, also with a `title`. **Preview columns** with a fixed width hold a one-line `block truncate` span with a `title`. Never leave a text cell `whitespace-nowrap` without a width cap. The `title` is the whole point: a cell that ends in "…" with no hover text is text the user simply cannot read.
- Use horizontal scrolling for real overflow and hide low-priority columns on narrow screens.
- Keep loading, empty, error, and pagination states inside the table surface.
- **Ticked rows clear when the list underneath them changes.** Any change to what the table shows — search, filter, sort, page, rows-per-page, or site — empties the selection, through `useClearSelectionOnListChange` (`src/lib/use-clear-selection.ts`) keyed on a string of exactly those values. A refetch with unchanged parameters (such as the reload after a delete) keeps the remaining ticks. No screen keeps its own ad-hoc clear-selection effects for these cases.
- The select-all-across-pages banner (`AdminSelectionBanner`) stays — but a banner-driven selection clears on the same rule as ordinary ticks. That trade-off is deliberate and settled: giving up ticks that survive a page change is the only way a bulk delete cannot act on rows that moved out from under it.

## Modals

- Use shared `Dialog` for forms and `AlertDialog` or the established confirmation component for destructive actions. Do not nest modals.
- Form modals use the shared `DashboardModalContent` shell (`src/components/admin/layout/dashboard/modals.tsx`), with a visible header, scrollable body, and footer. Do not invent shells, overlays, close buttons, or footer layouts. The `<form>` sits inside the modal, never wrapped around it, and the modal takes `busy` while a save is in flight — `workspace/docs/admin-action-feedback.md` is the source of truth for how failures and successes report.
- Keep the admin modal shell one uniform theme-aware light gray. Do not separately tint or override the header, body, or footer.
- Group the body into white `<Card size="sm">` sections. Put each section title inside `CardHeader`, optional help in `CardDescription`, and fields in `CardContent`; do not leave form fields loose on the shell.
- Keep the modal's established body gap (`gap-6`) and do not override `DialogBody` spacing.
- Modal dropdowns use the default 32px height (`h-8`) to match inputs.
- Keep footers directly on the shell without a border or separate background band.
- Keep confirmations compact and explain the consequence in plain English. Tiny title-and-description confirmations do not need cards.
- Support Escape, focus trapping, focus restoration, and accessible titles.
- Reference form modal: `src/components/admin/directory-builder/layout/CreateDirectoryModal.tsx`, built on the shared `useCreateContent` helpers in `src/components/admin/layout/dashboard/content-modal-shared.tsx`.

## Scrolling

- Use shared `ScrollArea`, plus `ScrollBar` for horizontal overflow. Do not create raw `overflow-auto` or `overflow-scroll` containers.
- Avoid nested scrolling.

## Loading and States

- **No skeletons, anywhere.** Do not add shimmer placeholder blocks or reintroduce a `Skeleton` component — it was deliberately deleted (Jul 2026). A skeleton promises content that may never arrive and drifts out of step with the layout it imitates.
- **No page or surface spinners either.** A surface that is loading keeps its real frame and draws nothing in it, through the shared `AdminLoading` (`src/components/admin/layout/loading.tsx`): it holds the footprint so nothing jumps when content lands and announces "Loading" to screen readers. Table bodies get it via `AdminListPending`. If a loading signal is ever wanted back, it goes into `AdminLoading` — one place — never per screen.
- **A loading list never shows its empty message.** Render "nothing here yet" only once the fetch has finished with no rows (`!loading && rows.length === 0`); otherwise the empty state flashes before the data arrives and makes users doubt their data.
- Render the page when its route data is ready instead of showing a placeholder for first load or route changes. The loading state stays inside the panel that owns it; never cover the app shell or whole page.
- In-flight actions are the one place a spinner lives: a saving button shows a compact `Loader2Icon` beside its unchanged label.
- Every data surface needs intentional loading, empty, error, and populated states. Failed loads and failed actions each have exactly one home — see `workspace/docs/admin-action-feedback.md`.
- **An `/admin` address with no page behind it keeps the dashboard around it.** The `/admin/$` route's `notFoundComponent` is `AdminNotFound` (`src/components/admin/layout/admin-not-found.tsx`), a normal content card inside `AdminLayout`, so the sidebar, header and site switcher all stay put and the selected site is not lost. It names the address that was not found and offers the dashboard plus the nearest real sidebar section (`getClosestAdminSidebarLink`). The way back is the fixed `ADMIN_DASHBOARD_HREF`, never the configurable `home_route` — a stale `home_route` is exactly what sends people here. A thrown error is not a not-found and still surfaces as an error; the public site's 404 is a separate page and unaffected.

## Accessibility and Verification

- Use semantic elements, keyboard interaction, visible focus, sufficient contrast, and reduced-motion support.
- Do not communicate state with color alone. Associate form errors with their fields.
- Verify loading, empty, error, disabled, success, long-content, narrow-screen, dark-theme, and keyboard behavior when relevant.
- Validate the changed workflow in the running app when browser or native validation is available.
