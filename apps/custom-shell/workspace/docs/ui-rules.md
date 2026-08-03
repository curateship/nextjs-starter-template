# UI Rules

Use these rules for every new or modified interface. App-specific UI guides may add stricter rules. One rule comes first: reuse the existing UI instead of inventing a parallel version.

## Core Components and Surfaces

- Reuse components from `src/components/ui/`, existing app shells, and established chart, toolbar, and card patterns. Do not hand-roll parallel buttons, forms, tables, modals, cards, or scroll areas.
- Prefer the app's existing shadcn components and keep shared styling in primitives, not repeated page-level classes.
- Match neighboring screens and use semantic theme tokens instead of hardcoded colors.
- The default page canvas is `bg-muted/60`. Content surfaces use `bg-card` with `rounded-xl border border-foreground/5`; use shared `Card`, `TableSurface`, and `WorkspacePanel` components instead of restating that shell.

## Spacing and Page Layout

- The app shell owns page padding. Where an app uses `DashboardContent`, it is the single source of truth for the page gutter and section spacing. In Trading, `src/components/ui/dashboard-content.tsx` defines `p-2 space-y-2 md:p-3 md:space-y-3`, or 8px on narrow screens and 12px on desktop.
- Use the same site gap between page sections, cards, columns, and full-screen workspace panels: `gap-2 md:gap-3` or `space-y-2 md:space-y-3`.
- Do not add page-level padding wrappers or invent other layout gaps such as `gap-3`, `gap-8`, or ad-hoc margins. Small internal gaps such as `gap-1` and `gap-2` are allowed inside a card.
- Centralize full-bleed page exceptions in one app-level route predicate instead of wrapping or unwrapping individual routes. In Trading, use `isFullBleedLocation` in `src/lib/full-bleed-location.ts` for the Trade terminal, bot workspace, Automation editor, and backtest chart.
- Derive page spacing from the currently mounted route so navigation and content change together. Do not use a destination or delayed resolved URL that can carry the previous page's spacing into the next page.
- Design narrow and desktop layouts together. Avoid arbitrary widths, radii, shadows, gradients, pills, or badges.

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
- Align a divergent shared primitive in a focused design-system change instead of adding local exceptions.

## Buttons, Forms, and Action Icons

- Standard buttons are always 32px (`h-8`) by default, including table-toolbar buttons. The one exception is modal footers: the shared `DialogFooter` forces its buttons to 36px (`h-9`) — accept that, do not override it. Use another documented size only for a clear compact or prominent context.
- Use one primary button per action group, `outline` for secondary actions, `ghost` for low-emphasis actions, and destructive styling only for irreversible actions.
- Order footer actions as Cancel, then primary or destructive. Disable running actions and show a compact loading indicator.
- Icon-only buttons require an accessible name and a tooltip when their meaning is not obvious.
- Use the established Lucide action icons consistently: `PencilIcon` for edit, `Trash2Icon` for delete, `PlusIcon` for add, and `Loader2Icon` for loading.
- Give every field a visible label. Keep help and error text beside the field and preserve entered values after errors.
- Draggable or repeatable text-field lists start with one default row. Users add more rows explicitly; do not create multiple empty rows by default.
- Use `gap-1` label-to-control, `gap-2` within field groups, and `gap-4` between form sections.

## Tabs

- Use the shared `Tabs` default segmented style for tab groups: a rounded muted container with the selected tab on a raised background.
- The muted tab-list background may fill the available width, but each tab trigger must stay content-width instead of stretching to divide that width.
- Do not use line, underline, or plain-text tabs for new or modified tab groups unless an app-specific guide explicitly requires that navigation style.

## Tables

- Use the app's established dashboard table wrapper (`DashboardTable` in Trading), shared `Table` primitives, and `TableSurface`. Do not build tables from raw div grids or one-off styling.
- Every data column header must be sortable when it represents a sortable value. Use the shared `TableSortButton`; selection and action columns are not sortable.
- Use a 40px header (`h-10`), compact cells (`px-5 py-2`), a muted header, and the shared rounded surface.
- Keep the main column flexible, metadata compact, and actions in the final column.
- Where the row's title opens something, the whole row opens the same thing: pass it to `TableRow` as `rowAction`, which adds the pointer cursor and the grey `hover:bg-muted/50` tint. A row with nothing to open gets no `rowAction` and stays flat. Mark the actions column `TableCell column="actions"` so the row never claims a click meant for a button there.
- Order table-card toolbar controls from left to right: mass delete, search, filters, settings, edit actions, then create buttons. Omit unavailable controls without changing the order of the remaining controls.
- Use horizontal scrolling for real overflow and hide low-priority columns on narrow screens.
- Keep loading, empty, error, and pagination states inside the table surface.

## Modals

- A record with more to say than a row opens as a window from its list, not as a page of its own. Tabs sit beside the title in the header; the window takes only an id and loads its own data; `?open=<id>` in the address is what makes it linkable and lets Back close it. Give the window one fixed height so switching tabs does not resize it, and keep the tab holding typed work mounted so edits survive a switch.

- Use shared `Dialog` for forms and `AlertDialog` or the established confirmation component for destructive actions. Do not nest modals.
- Form modals use the app's established admin variant, with a visible header, scrollable body, and footer. In Trading, use `DialogContent variant="admin"`; do not invent shells, overlays, close buttons, or footer layouts.
- Keep the admin modal shell one uniform theme-aware light gray. Do not separately tint or override the header, body, or footer.
- Group the body into white `<Card size="sm">` sections. Put each section title inside `CardHeader`, optional help in `CardDescription`, and fields in `CardContent`; do not leave form fields loose on the shell.
- Keep the modal's established body gap (`gap-6`) and do not override `DialogBody` spacing.
- Modal dropdowns use the default 32px height (`h-8`) to match inputs.
- Keep footers directly on the shell without a border or separate background band. Footer buttons are the app's one sanctioned 36px (`h-9`) control; `DialogFooter` applies that itself, so never set a height at the call site.
- Every footer reads the same way, left to right: `[Delete] ……… [Cancel] [Primary]`. The button that throws something away sits hard left (`className="mr-auto"`) so it cannot be mistaken for the primary. Cancel sits directly left of the primary and carries the same `disabled`, so a half-finished save cannot be walked away from. Primary labels follow one scheme: "Save changes" for an edit, "Create <thing>" for a create, the action's own verb otherwise. A window with nothing to save ends with a single "Done" and no Cancel. Titles are sentence case; confirmations ask a question and name what goes in the confirm button.
- Keep confirmations compact and explain the consequence in plain English. Tiny title-and-description confirmations do not need cards.
- A modal that holds typed work uses the shared `FormDialog` (`src/components/ui/form-dialog.tsx`) instead of `Dialog` directly: pass `dirty` and it asks "Discard changes?" before the backdrop, Escape, the X or Cancel can throw the edits away, and `busy` while a save runs. Wire the footer's Cancel to the `requestClose` it hands to its children, or that one path skips the question. Read-only and pick-something modals stay on plain `Dialog`.
- Support Escape, focus trapping, focus restoration, and accessible titles.
- In Trading, use `src/components/backtest/new-run-dialog.tsx` as the reference form-modal implementation.

## Scrolling

- Use shared `ScrollArea`, plus `ScrollBar` for horizontal overflow. Do not create raw `overflow-auto` or `overflow-scroll` containers.
- Avoid nested scrolling.

## Loading and States

- Do not show a skeleton for the first page load or while changing routes. Render the page when its route data is ready.
- Use skeletons only inside elements that load or refresh independently, such as tables, charts, market lists, and media grids.
- Keep each skeleton inside the same panel and footprint as the content it replaces. Do not cover the app shell or whole page.
- Small actions such as saving a form or submitting a button may use a compact spinner and text.
- Every data surface needs intentional loading, empty, error, and populated states. Errors must explain what failed and how to recover.

## Accessibility and Verification

- Use semantic elements, keyboard interaction, visible focus, sufficient contrast, and reduced-motion support.
- Do not communicate state with color alone. Associate form errors with their fields.
- Verify loading, empty, error, disabled, success, long-content, narrow-screen, dark-theme, and keyboard behavior when relevant.
- Validate the changed workflow in the running app when browser or native validation is available.
