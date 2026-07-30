# UI Rules

Use these rules for every new or modified interface. App-specific UI guides may add stricter rules. One rule comes first: reuse the existing UI instead of inventing a parallel version.

## Core Components and Surfaces

- Reuse components from `src/components/ui/`, existing app shells, and established chart, toolbar, and card patterns. Do not hand-roll parallel buttons, forms, tables, modals, cards, or scroll areas.
- Prefer the app's existing shadcn components and keep shared styling in primitives, not repeated page-level classes.
- Match neighboring screens and use semantic theme tokens instead of hardcoded colors.
- The default page canvas is `bg-muted/60 dark:bg-background`. In dark mode the canvas must track the true Background color (near black at 0% dark-theme brightness) so it matches the Appearance settings preview and darkens with the brightness slider; translucent muted stays light-gray and does not. Content surfaces use `bg-card` with `rounded-xl border border-foreground/5`; use shared `Card`, `TableSurface`, and `WorkspacePanel` components instead of restating that shell.

## Numbers

- **Every displayed dollar amount, price, or percent goes through `src/lib/format.ts`** — `usd`/`usdWhole`/`signedUsd`, `compactUsd`/`signedCompactUsd`, `formatPrice`, `pct`/`signedPct`, `toneClass`. Never hand-roll `toFixed` money or percents in a component, and never create a page-local formatter; the canonical rules (uppercase K/M/B, three meaningful digits, ASCII minus, sign-after-rounding, dash only for missing data) are documented in that module's header.
- Percent *changes* (24h move, returns) use `signedPct`; percent *magnitudes* (win rate, margin used, distance) use `pct`. Profit/loss text colour comes from `toneClass`, not ad-hoc class conditions.

## Spacing and Page Layout

- The app shell owns page padding. Where an app uses `DashboardContent`, it is the single source of truth for the page gutter and section spacing. In Trading, `src/components/ui/dashboard-content.tsx` defines `p-2 space-y-2 md:p-3 md:space-y-3`, or 8px on narrow screens and 12px on desktop.
- Use the same site gap between page sections, cards, columns, and full-screen workspace panels: `gap-2 md:gap-3` or `space-y-2 md:space-y-3`.
- Do not add page-level padding wrappers or invent other layout gaps such as `gap-3`, `gap-8`, or ad-hoc margins. Small internal gaps such as `gap-1` and `gap-2` are allowed inside a card.
- Centralize full-bleed page exceptions in one app-level route predicate instead of wrapping or unwrapping individual routes. In Trading, use `isFullBleedLocation` in `src/lib/full-bleed-location.ts` for the Trade terminal, bot workspace, Automation editor, and backtest chart.
- Derive page spacing from the currently mounted route so navigation and content change together. Do not use a destination or delayed resolved URL that can carry the previous page's spacing into the next page.
- Design narrow and desktop layouts together. Avoid arbitrary widths, radii, shadows, gradients, pills, or badges.

## Resizable Workspaces

The Trade terminal, the backtest run workspace, the bot run workspace, and the trade journal are one design. Copy it; do not invent a variant. The full cross-app standard — panel sizes, toggle placement, collapse behaviour — is in `.agents/skills/Ui-standards`; this section is the Trading-specific summary and must not drift from it.

- The gap between panels is the drag handle itself (`ResizableHandle` with `gap`), never a flex gap. It carries a small grey knob so it reads as grabbable.
- Hiding a side panel closes its gap: pass `collapsed` to the handle next to it, so the remaining panels sit flush instead of leaving a stripe of empty canvas.
- Panels are hidden and shown from one row of three toggles — left panel, right panel, bottom panel — built from the shared `PanelToggle` (`src/components/panel-toggles.tsx`): 24px ghost buttons in the normal text colour, grouped in a `flex items-center gap-1` row. A solid panel outline means showing, a dashed one means hidden; the bottom toggle uses the double chevron. Never hand-roll these buttons, their size, their colour, or their icons.
- **The toggles live in the bottom panel's tab bar**, pushed right with `ml-auto` — never in the page header. The bottom panel collapses to exactly that row using the shared `BOTTOM_COLLAPSED_HEIGHT` (`src/components/ui/resizable.tsx`), so the buttons that reopen the panels never disappear with them.
- Because the bottom panel is still on screen when collapsed, **the handle above it keeps its gap: pass `gap` alone, never `collapsed`.** The `collapsed` prop is only for a neighbour that collapses to nothing (the left and right panels); on the bottom handle it leaves the collapsed tab bar flush against the chart.
- A panel that collapses to zero reads its collapsed state from its size (`size.asPercentage < 0.5`); one that collapses to a fixed height must ask the panel instead (`ref.current?.isCollapsed()`).
- Do not put a record-count badge in the workspace header. The counts already live in the panels that show them.
- Toggle with the shared `togglePanel` helper (`src/lib/panel-collapse.ts`) and pass the panel's default size. Reopening always returns the panel to exactly that size. Left to itself the library restores whatever width the panel last had, which is a useless sliver for a panel that was already closed when the page loaded, and a stale hand-dragged width that squeezes the chart otherwise. Reopening is a fresh start, not a restore.
- Wherever the toggles live, they must stay reachable when the panel they control is closed. The Trade terminal keeps them in the bottom panel's tab bar, so that panel collapses to exactly its tab bar rather than to nothing.
- Every bottom panel wears the same header, exported once as `BOTTOM_PANEL_HEADER` from `src/components/ui/resizable.tsx`: a 56px plain card-coloured row with a divider under it, content on the left and the panel's own actions pushed right with `ml-auto`. Tabs, when the panel has them, sit on the left of that row and use the shared `Tabs` `pill` variant — the market watchlist's look, where the active tab is a solid dark pill and the rest are plain muted text on no container. Never a muted or coloured band, and never a local copy of the row's classes — import the constant so the four panels can't drift in height again.

## Charts

- **The equity/P&L curve is one component**, `PnlCurveCard` (`src/components/backtest/pnl-curve-card.tsx`): the "P&L curve" heading, its date range, the area chart (green above the starting balance, red below), the dashed starting-balance line, and the "not enough data" state. It is used by the backtest run workspace, the automation editor's backtest rail, and the trade journal. Never paste a second copy of this chart into a page — change the card and all three move together.
- Every chart keeps one flat bar above it (`ChartToolbar`) for timeframes, the indicator menu, the legend, and page actions. Drawing tools do not go there.
- Drawing tools live in the floating toolbar that sits on top of the chart itself (`src/components/chart/chart-draw-toolbar.tsx`): a `bg-card rounded-lg ring-1 ring-foreground/10` bar with a grip on the left and 28px icon buttons. It is rendered once inside `PriceChartView`, so every chart that can save what you draw gets the same tools; do not add a second copy per page.
- The bar can be dragged anywhere inside the chart by its grip (arrow keys nudge it 8px), is clamped to stay inside the chart on resize, and remembers its spot in this browser under `trading:chart-draw-toolbar`. It starts top-right, inset by the chart's measured price-axis width so it never covers the price labels (they get wider on bigger prices).
- New drawing tools are added as buttons inside that one toolbar, and only appear on charts that can persist their result.
- Every drawing behaves the same way: arm its tool, click the chart to place it, then drag it to adjust, double-click for its settings, and Delete or Backspace to remove it. A press selects and grabs in the same gesture — never make the user click once to select before a drag will take — and a drawing with a body is grabbable anywhere on it, not only on its handles. Every line the user can see is draggable on its own; only the body moves the whole drawing. Its readouts show only while it is selected, so a chart full of drawings is not a chart full of labels. Escape or a right-click cancels an armed tool. Saved drawings are keyed by network + market (one row per chart), so the same drawing shows on the live, backtest, and bot charts for that market.
- A drawing is stored in chart values (time + price) and re-projected to pixels on every pan, zoom, and resize. Its visual layer stays `pointer-events-none`; all hit-testing happens on the chart itself, so the pointer never gets caught on an overlay.
- The long/short position tools draw a planned trade: a green reward zone from entry to target stacked on a red risk zone from entry to stop, labelled with just the percentage on each leg and the risk/reward ratio in the middle.

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

## Saving

- **A modal is the only place a save button belongs.** Pages and full-screen workspaces auto-save: the edit goes into state immediately and a debounced write follows once typing stops (700ms, the same everywhere). Never add a page-level Save button, a dirty flag the user has to clear, or an "unsaved changes" prompt.
- The only feedback is the shared `SaveStatusIndicator` (`src/components/ui/save-status.tsx`): nothing while idle, "Saving…" during the write, a "Saved" tick that clears itself after two seconds. The settings page shows it in the sticky header; the Automation editor shows it in its own toolbar. Do not build a second version of this.
- Auto-save must never disable the field being edited. A control greyed out mid-write steals focus and drops keystrokes; reserve `disabled` for things genuinely switched off (a border colour when the border is 0).
- Never write a server response back over state the user has kept typing into. Compare what was sent against current state first and adopt the normalized copy only if they still match.
- Skip the write while a required field is empty rather than flashing a validation error at someone who just cleared it, and don't retry a failed save until the next edit — otherwise a rejected value loops every 700ms.
- Anything that reads the *saved* record (starting a backtest, deploying a bot) flushes the pending write first and stops if it fails. Gate those buttons on whether the thing is valid, never on whether it is saved.
- Leaving a surface flushes what the debounce never got to, keyed on the pending snapshot rather than on a live timer — an effect cleanup may already have cleared the timer by then.

## Buttons, Forms, and Action Icons

- Standard buttons are always 32px (`h-8`) by default, including modal footer and table-toolbar buttons. Use another documented size only for a clear compact or prominent context.
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
- Order table-card toolbar controls from left to right: mass delete, search, filters, settings, edit actions, then create buttons. Omit unavailable controls without changing the order of the remaining controls.
- Use horizontal scrolling for real overflow and hide low-priority columns on narrow screens.
- Keep loading, empty, error, and pagination states inside the table surface.

## Modals

- Use shared `Dialog` for forms and `AlertDialog` or the established confirmation component for destructive actions. Do not nest modals.
- Form modals use the app's established admin variant, with a visible header, scrollable body, and footer. In Trading, use `DialogContent variant="admin"`; do not invent shells, overlays, close buttons, or footer layouts.
- Keep the admin modal shell one uniform theme-aware light gray. Do not separately tint or override the header, body, or footer.
- Group the body into white `<Card size="sm">` sections. Put each section title inside `CardHeader`, optional help in `CardDescription`, and fields in `CardContent`; do not leave form fields loose on the shell.
- Keep the modal's established body gap (`gap-6`) and do not override `DialogBody` spacing.
- Modal dropdowns use the default 32px height (`h-8`) to match inputs.
- Keep footers directly on the shell without a border or separate background band.
- Keep confirmations compact and explain the consequence in plain English. Tiny title-and-description confirmations do not need cards.
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
