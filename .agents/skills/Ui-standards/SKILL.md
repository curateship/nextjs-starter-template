---
name: Ui-standards
description: UI standards for building or modifying any interface in this monorepo — reuse shared components, spacing, control sizes, tables, modals, tabs, scrolling, loading states, and accessibility rules. Read before creating or changing any UI.
tags: ui, design-system, standards
---

# UI Rules

Use these rules for every new or modified interface, in every app in this monorepo. **Custom Shell (`apps/custom-shell`) is the source of truth**: its `src/components/ui/*` primitives, tables, modals, and forms are the canonical implementation every other app matches. When an app needs a shared component or pattern changed, change it in Custom Shell first so every app inherits it — never fork a primitive or add an app-local rule that diverges from this document. One rule comes first: reuse the existing UI instead of inventing a parallel version.

## Core Components and Surfaces

- Reuse components from `src/components/ui/`, existing app shells, and established chart, toolbar, and card patterns. Do not hand-roll parallel buttons, forms, tables, modals, cards, or scroll areas.
- The shared behavior helpers below must exist as their own files in every app that has forms or tables. If a file is missing, **create it** (copy the canonical version from Custom Shell) — never re-implement its logic inline in a dashboard, which is exactly how the same code gets duplicated across screens:
  - `src/components/ui/field-label.tsx` — the `FieldLabel` component (a label plus a hover-tooltip hint). Required wherever a form field needs help text; never fall back to a bare `Label` + a helper paragraph.
  - `src/lib/use-table-sort.ts` — the `useTableSort` hook that owns a table's sort column/direction state and the toggle rule. Required by every sortable table, paired with `TableSortButton`.
  - `src/lib/use-selection.ts` and `src/lib/use-bulk-delete.ts` — the `useSelection` / `useBulkDelete` hooks for multi-row selection and bulk delete. Required by every table with mass selection.

  See [Forms](#buttons-forms-and-action-icons) and [Tables](#tables) for how each is applied.
- **Every image upload field uses the shared `ImageUpload` component** (`src/components/image-upload.tsx`, canonical in Custom Shell) — favicons, logos, avatars, covers, banners, any "pick an image" control. Never hand-roll a thumbnail button, bare `<input type="file">`, or a bespoke `MediaPicker` trigger. It renders the standard dashed dropzone (in-box icon + label, a corner remove-X badge) and opens the shared `MediaPicker` for upload + library selection, so the stored value is always a persisted media URL. Keep every field at the component's standard size and dimensions: set the shape only through its `aspect` prop (`"square"` for favicons/logos/icons, `"video"` for covers/banners) and `fit` prop — never invent per-field widths, heights, or aspect ratios.
- Prefer the app's existing shadcn components and keep shared styling in primitives, not repeated page-level classes.
- Match neighboring screens and use semantic theme tokens instead of hardcoded colors.
- The default page canvas is `bg-muted/60` — in every app, not just Trading. Both the app-shell root wrapper (`min-h-screen bg-muted/60`) and the `DashboardContent` main region default to `bg-muted/60`; never `bg-background` for the shell or main content area. `bg-background` is reserved for surfaces that deliberately sit on the base (e.g. sidebars, popovers), not the page canvas. In the Custom Shell app the canvas, chrome, and modal colors are user-configurable at runtime — see [Runtime styling (Custom Shell)](#runtime-styling-custom-shell).
- Content surfaces use `bg-card` with `rounded-xl` and a hairline border, drawn by the shared `Card` and `TableSurface` as `ring-1 ring-foreground/10`; use those shared components instead of restating the shell. In Custom Shell the content border width and color are variable-driven (see Runtime styling), so never hardcode a `border`/`ring` on a content surface — rely on the shared primitive so user styling reaches it.

## Spacing and Page Layout

- The app shell owns page padding. Where an app uses `DashboardContent`, it is the single source of truth for the page gutter and section spacing. In Trading, `src/components/ui/dashboard-content.tsx` defines `p-2 space-y-2 md:p-3 md:space-y-3`, or 8px on narrow screens and 12px on desktop. In Custom Shell, `DashboardContent` instead derives the gutter from the `--shell-gutter` CSS variable (per-workspace Styling settings) and card-stacking containers consume it — see [Runtime styling (Custom Shell)](#runtime-styling-custom-shell); do not hardcode gaps there.
- Use the same site gap between page sections, cards, columns, and full-screen workspace panels: `gap-2 md:gap-3` or `space-y-2 md:space-y-3`.
- Full-bleed workspace pages keep the same gutter on their own wrapper (`p-2 md:p-3` on a `bg-muted/60` canvas). In resizable workspaces, the space between panels is the transparent drag handle, not a flex gap: `ResizableHandle` with the `gap` prop renders `w-2 md:w-3` (8px / 12px) so panel gaps always match the page gutter. Each panel body is a `WorkspacePanel` (`rounded-xl border border-foreground/5 bg-card`).
- Do not add page-level padding wrappers or invent other layout gaps such as `gap-3`, `gap-8`, or ad-hoc margins. Small internal gaps such as `gap-1` and `gap-2` are allowed inside a card.
- Centralize full-bleed page exceptions in one app-level route predicate instead of wrapping or unwrapping individual routes. In Trading, use `isFullBleedLocation` in `src/lib/full-bleed-location.ts` for the Trade terminal, bot workspace, Automation editor, and backtest chart.
- Derive page spacing from the currently mounted route so navigation and content change together. Do not use a destination or delayed resolved URL that can carry the previous page's spacing into the next page.
- Design narrow and desktop layouts together. Avoid arbitrary widths, radii, shadows, gradients, pills, or badges.

## Runtime styling (Custom Shell)

The Custom Shell app has a per-workspace **Styling** settings tab (`/admin/settings/styling`, `src/components/styling-settings.tsx`) that retunes spacing, borders, backgrounds, and modal chrome at runtime. Values live on `ShellConfig.styling` (`src/lib/custom-shell.tsx`), persist per-workspace (jsonb, no migration), and apply through CSS variables. The defaults below reproduce the standard look — only the mechanism changed. **New UI in this app must consume these variables (with the documented fallback) instead of hardcoding spacing/border/background, or the user's styling silently won't reach it.**

The default settings, defined by `createDefaultStyling()` in `src/lib/custom-shell.tsx`, are the standard every app inherits: content gutter **24px**, content card border **1px**, content background muted at **60%** strength, chrome (sidebar + header) on the theme token, and modal padding **24px**, modal border **1px**, backdrop dimming **10%**. Treat these numbers as the baseline; change them in `createDefaultStyling()` (so every app follows), not per screen.

- **Content spacing (gutter).** `DashboardContent` (`src/components/demo/dashboard-content.tsx`) sets `--shell-gutter` on its `<main data-content-styling>` and uses it for both the outer padding and the gap between children. Card-stacking containers consume it: `CardGroup` (`src/components/ui/card.tsx`), `DashboardRow`, and the settings page use `style={{ gap: "var(--shell-gutter, <fallback>)" }}`. Any new container that stacks cards must do the same. `--shell-gutter: 0` is "flat mode" — no gaps, and content cards lose their border and rounding (`[data-flat="true"]`).
- **Card & table borders (content).** Inside `[data-content-styling]`, `[data-slot="card"]` and `[data-slot="table-surface"]` draw their border from a box-shadow built on `--shell-card-border-width` (px, 0 = off) and `--shell-card-border-color` (`src/theme.css`), overriding the primitive's `ring`. Use the shared `Card`/`TableSurface` (they carry the `data-slot`) so the setting reaches them; never hardcode a `border`/`ring` on a content surface.
- **Content background.** `DashboardContent`'s background comes from the content styling and falls back to `bg-muted/60` only when no explicit color is set.
- **Sidebar + sticky header.** Both render with `bg-sidebar` (`var(--sidebar)`); recolor them together by overriding `--sidebar` on the shell wrapper (`src/components/shell-layout.tsx`). Never give them separate backgrounds.
- **Modals.** Dialogs portal to `<body>`, so modal styling is applied as `--shell-modal-*` variables on the document root (`useModalStyleVars` in `shell-layout.tsx`) and consumed by rules on `[data-slot="dialog-overlay"|"dialog-content"|"dialog-header"|"dialog-body"|"dialog-footer"]` and `[data-slot="dialog-content"] [data-slot="card"]` (`src/theme.css`). `--shell-modal-padding` drives both the inner padding **and** the gap between the modal's stacked cards (default 24px = the documented `gap-6`/`px-6`); `--shell-modal-overlay-opacity` is the backdrop dimming. These are unlayered CSS rules so they win over Tailwind utilities.
- **Colors** everywhere resolve through `resolveBackground(bg, { base, opaque })` (`src/lib/custom-shell.tsx`) with three modes: `default` (keep the theme token), `muted` (theme token at an adjustable strength via `color-mix`), or `custom` (a fixed color).

## Subheader

- Pages or workspaces with a context strip above the content (market info, account selector, page-level actions) use a full-width flat bar, not a floating card: `flex flex-wrap items-center gap-x-5 gap-y-2 border-b bg-card px-4 py-2`. In Trading, `src/components/trading/account-strip.tsx` is the reference.
- Keep identity and stats on the left, account or wallet controls and settings on the right (`ml-auto`), with `gap-x-5` between stat groups.

## Three-panel resizable workspaces

A full-screen workspace with a **left rail, a centre chart, a right table and a bottom panel** is
one single design. In Trading that is the Trade terminal, the backtest run workspace
(`/backtest/$groupId`), the bot run workspace (`/bots/$botId`) and the trade journal (`/journal`).
**Copy it exactly; never invent a variant.** When one of these needs a change, change the shared
primitive so all of them move together.

**Structure.** Outer `ResizablePanelGroup orientation="vertical"` holding a `main` panel
(`defaultSize="68%" minSize="35%"`) and the bottom panel; inside `main`, a horizontal group of
summary → chart → markets. Every panel body is a `WorkspacePanel`. The whole group sits in
`p-[var(--shell-gutter,0.75rem)]`, and the route must be registered in the app's full-bleed
predicate (`isFullBleedLocation`) or the page will double up on padding.

**Gaps are handles, never flex gaps.** The space between panels is `ResizableHandle` with the
`gap` prop, carrying a small grey knob so it reads as grabbable.

**Panel sizes** — keep these the same across all four so the pages feel identical:

| Panel | default | min | max | collapsedSize |
| --- | ---: | ---: | ---: | --- |
| summary (left) | 21% | 16% | 34% | `0%` |
| chart (centre) | ~53% | 30% | — | not collapsible |
| markets (right) | 26% | 18% | 42% | `0%` |
| bottom | 32% | 15% | — | `BOTTOM_COLLAPSED_HEIGHT` |

**The three toggles live in the bottom panel's tab bar**, pushed right with `ml-auto`, built from
the shared `PanelToggle` (24px ghost buttons in the normal text colour, `flex items-center gap-1`;
solid outline = showing, dashed = hidden, double chevron for the bottom one). Never hand-roll
these buttons, their size, colour or icons, and never put them in the page header — a header row
is not guaranteed to exist and the toggles must sit with the panel they survive in.

**The bottom panel collapses to its own header, not to nothing.** Use the shared
`BOTTOM_COLLAPSED_HEIGHT` (`src/components/ui/resizable.tsx`, 58px = the 56px header row plus the
card's two hairlines). Collapsing to `0%` would take away the very buttons that reopen the panels.

**Therefore the handle above the bottom panel keeps its gap: pass `gap` alone, never
`collapsed`.** The `collapsed` prop closes the gutter and exists only for a neighbour that
collapses to nothing — the left and right panels. Passing it to the bottom handle leaves the
collapsed tab bar sitting flush against the chart with no gap.

**Collapsed state.** A panel that collapses to zero can detect it from its size
(`onResize={(size) => setX(size.asPercentage < 0.5)}`). A panel that collapses to a fixed height
cannot — ask the panel instead: `onResize={() => setX(ref.current?.isCollapsed() ?? false)}`.

**Reopening always returns a panel to its default size.** Toggle with the shared `togglePanel`
helper (`src/lib/panel-collapse.ts`) and pass that default. Left to itself the library restores
whatever width the panel last had: a useless sliver for a panel that was already closed on load,
or a stale hand-dragged width that squeezes the chart. Showing a panel is a fresh start, not a
restore.

**Layout persistence.** Widths *and* collapsed state ride along in the saved layout via
`usePanelLayout` under a key per workspace (e.g. `journal-workspace-horizontal` / `-vertical`), so
the workspace reopens the way it was left.

**Header.** Back `IconButton`, `Breadcrumbs`, then `flex-1` and any page-level controls on the
right. Do not put a record-count badge there — the counts already live in the panels that show
them, and a second copy in the header only drifts.

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
- Give every field a visible label with an `id`/`htmlFor` pair, and preserve entered values after errors.
- Field help belongs in a hover tooltip on the label, never in a paragraph under the control. Use the shared `FieldLabel` (`src/components/ui/field-label.tsx`): it renders the label with a small `InfoIcon` that reveals the hint on hover. Helper text under an input reads like an error, pushes the next field down, and makes side-by-side fields different heights. The icon is not a form control (`tabIndex={-1}`); it never takes focus from the field.
- Prefer packing short fields side by side on desktop to reduce a form's height, stacking them full-width on mobile; reserve a full-width single-column field for genuinely wide content. Never leave one field occupying half of a two-column row — either fill the row or drop to one column.
- Multi-line fields use the shared `Textarea`, which starts at one row and grows with its content (`field-sizing-content min-h-9`). Pass `rows={1}`; do not reserve empty rows with a tall `min-h` or a large `rows` value.
- Each checkbox gets its own full-width row (`grid gap-2` stack of `Checkbox` + `Label`). Never pack checkboxes into a grid column beside other fields.
- Draggable or repeatable text-field lists start with one default row. Users add more rows explicitly; do not create multiple empty rows by default.
- Spacing ladder: `gap-2` (8px) label to control, `gap-4` (16px) between fields and between a card's header and its content, `gap-6` (24px) between the stacked cards in a modal body (the `DialogBody` default).
- Range/slider controls use the shared `Slider` primitive (`src/components/ui/slider.tsx` in Custom Shell), styled monochrome (foreground track and thumb) and constrained (not full width); do not hand-roll a native `<input type="range">` or color its track with `accent-primary`.

## Tabs

- Use the shared `Tabs` default segmented style for tab groups: a rounded muted container with the selected tab on a raised background.
- Tabs must be h-8
- The muted tab-list background may fill the available width, but each tab trigger must stay content-width instead of stretching to divide that width.
- Do not use line, underline, or plain-text tabs for new or modified tab groups unless an app-specific guide explicitly requires that navigation style.

## Tables

- Use the shared `DashboardTable` wrapper (`src/components/dashboard-table.tsx` in Custom Shell), the `Table` primitives, and `TableSurface`. Do not build tables from raw div grids or one-off styling. Reference table: `src/components/admin-users-dashboard.tsx`.
- Every table must have mass selection: a checkbox column first, with a select-all checkbox in the header (indeterminate when only some rows are selected) and a checkbox on every row. Selecting rows reveals the multi-selection actions (such as `Delete (n)`) at the start of the toolbar. Hold selection in the shared `useSelection` hook and drive the multi-row delete with `useBulkDelete` — do not hand-roll a selection `Set` or a bespoke bulk-delete flow. The header checkbox's `checked` comes from `useSelection`'s `selectAllState` (`true | "indeterminate" | false`), which is what makes it indeterminate on a partial selection.
- Every column must be sortable except the selection checkbox and actions columns. Use the shared `TableSortButton` in each sortable header; do not ship a data column without sorting. The sort chevron is hidden until the header is hovered or focused; the actively-sorted column always shows its up/down arrow. The `TableSortButton` handles this — do not add your own always-visible sort icon. Hold the active column and direction in the shared `useTableSort` hook — it owns the column/direction state and the toggle rule (same column flips direction, a new column resets to ascending), so every table sorts identically; keep only the data-specific comparator in the dashboard, applied to the filtered rows before pagination.
- Use a 40px header (`h-10`), compact cells (`px-5 py-2`), a muted header, and the shared rounded surface.
- Keep the main column flexible, metadata compact, and actions in the final column.
- The item title in the main column is always interactive, never plain text. If the item has its own dashboard or detail page, the title links there; otherwise clicking the title opens the item's edit modal.
- Every row's actions column ends with the same two ghost icon buttons: `SettingsIcon` (opens the row's settings or edit modal) followed by `Trash2Icon` (delete, behind a confirmation). Both need accessible names; add other row actions before these two, never after or between them.
- Order table-card toolbar controls left to right: mass delete (or any multi-selection action), then the search field, then filter or view dropdowns, then secondary buttons, then the single primary button last. Omit unavailable controls without changing the order of the remaining controls.
- Multi-selection actions appear only while rows are selected and show the selected count in their label, such as `Delete (3)`, styled as a soft destructive button. The primary create button uses `PlusIcon` plus a label.
- Long free text never widens a table. One rule, three cases: **identifier values** (emails, names, filenames) render on one line with `truncate` and a `title` attribute carrying the full value — outside the flexible main column, cap the cell (e.g. `className="max-w-56"` on the `TableCell` with a `block truncate` span inside); **message columns** (the main free-text column) clamp to two lines (`line-clamp-2 whitespace-normal`) with a `title`; **`preview` columns** (already capped at `w-44`) hold a one-line `block truncate` span with a `title`. Never leave a text cell `whitespace-nowrap` without a width cap.
- Use horizontal scrolling for real overflow and hide low-priority columns on narrow screens.
- Keep loading, empty, error, and pagination states inside the table surface.

## Modals

- Use shared `Dialog` for forms and `AlertDialog` or the established confirmation component for destructive actions. Do not nest modals.
- Form modals use the shared admin variant, with a visible header, scrollable body, and footer: `DialogContent variant="admin"` (`src/components/ui/dialog.tsx` in Custom Shell). Do not invent shells, overlays, close buttons, or footer layouts.
- The admin shell (defined in the shared `dialog.tsx`, never restated per modal) is: one uniform theme-aware light gray (`bg-[color-mix(in_oklab,var(--muted)_50%,var(--popover))]`), `rounded-xl ring-1 ring-foreground/10`, `p-0 gap-0`, capped at `max-h-[calc(100vh-4rem)]`, full-screen on mobile. Default width is `sm:max-w-3xl`; narrow one-column forms may pass a smaller cap such as `sm:max-w-lg` on `DialogContent`.
- Header is `DialogHeader` (`px-6 pt-6 pb-0`) with `DialogTitle`, a one-line `DialogDescription` in muted text, and the built-in ghost X close button top-right. Do not add your own close button.
- The body is `DialogBody` — a `ScrollArea` with `grid gap-6 px-6 pt-6 pb-6` and cards forced shadowless. Keep that spacing; do not hardcode a different value. In Custom Shell the 24px padding and the inter-card gap both come from `--shell-modal-padding` (configurable via the Styling settings, `gap-6`/`px-6` as the default) and the modal surface, border, overlay dimming, and inner-card styling are variable-driven — see [Runtime styling (Custom Shell)](#runtime-styling-custom-shell).
- **Every section is its own `<Card size="sm">`.** All modal content lives in cards — no exceptions. Each logical group of fields is a separate card with its title in `CardHeader`/`CardTitle`, optional context in `CardDescription`, and the fields in `CardContent className="grid gap-4"` (or `flex flex-col gap-4`). Do not lump unrelated groups into one card, and never leave a paragraph, field, image, control, or error loose on the modal shell — if it is in the body, it is inside a card. (The inline submit error at the very bottom of the body is the one thing that sits outside the cards; see below.) A `size="sm"` card's header sits `gap-4` (16px) above its content.
- Field width follows the control type, and rows pack side by side on desktop to keep modals short, stacking full-width on mobile:
  - **Dropdowns / selects** are as wide as their text — `SelectTrigger className="w-full sm:w-fit"` (content-width on desktop, full on mobile). Never stretch a select to fill a column. Group two or more in a `flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-start` so they sit side by side on desktop.
  - **Text and number inputs and textareas are full width** — they fill their row. Date fields use the shared `DatePicker` (`src/components/ui/date-picker.tsx`) — a button that opens a `Calendar` in a popover — not a native `<input type="date">`, so the picker looks identical in every browser; it is full width like the other inputs. Alone, the field spans the container. Sharing a row with a dropdown, wrap the input's field in `sm:flex-1` so it fills the space beside the content-width select (`flex flex-col gap-4 sm:flex-row sm:items-start`, dropdown first, input `flex-1`). On mobile the row stacks and both are full width.
  - **Checkboxes and switches are content-width and each take their own row** — never full width, never packed into a field grid.
- Each field is `grid gap-2` (`FieldLabel` + control). Field help is a tooltip on the label, never a paragraph under the control (see Forms). Textareas start at one row.
- Modal inputs and dropdowns use the default 32px height (`h-8`). Text/date inputs and textareas fill their column. A form select is `className="w-full sm:w-fit"` — full width on mobile, sized to its content on desktop. Selects use the shared `Select`'s default overlay menu, which opens on top of the trigger — do not pass `position="popper"` unless the menu must escape a clipping or zoom context (as `directory` does), and never to make it drop below the trigger.
- Footer is `DialogFooter` sitting directly on the modal surface — no border, no background band, and no top padding (the body-to-footer gap comes from the body's own bottom padding). It right-aligns buttons with `gap-2` and forces them to 36px (`h-9`); do not fight that height. Order is Cancel (`outline`), then the primary action; while submitting, disable both and show a `Loader2Icon` spinner inside the primary button.
- Submit and mutation failures never render inside the modal body: report them with the shared error toast (`showErrorToast` in `src/lib/error-toast.ts`, Custom Shell) — a red toast in the same fixed position as the success toasts that stays until dismissed, where a repeat failure replaces the previous one and starting a new attempt dismisses it. Keep entered values. Never call `toast.error` directly and never hand-roll an error paragraph or boxed alert. The two placements that stay in the page: data-surface load failures use `ErrorBanner` (with retry where a reload exists), and live while-you-type field validation uses `InlineError` beside its field.
- Success feedback: dashboard mutations confirm with a `toast.success` after every create/update/delete. Actions that live *inside* the account modal are the one exception — they confirm inline instead, as muted text beside the action that ran (`role="status"`, e.g. the footer "Saved" on Profile or "Password updated." next to the Security buttons), never with a toast, so the confirmation appears where the user is looking.
- A confirmation uses the shared `ConfirmDialog` (`src/components/ui/confirm-dialog.tsx` in Custom Shell). Its header holds only the title; the consequence, stated in plain English, is the `DialogDescription` rendered as the first item of the body so it sits clearly apart from the title. Do not add a second paragraph that just restates the title.
- Support Escape, focus trapping, focus restoration, and accessible titles. Block closing (including overlay and Escape paths) while a submit is in flight.
- Reference form modal: `src/components/admin-plans-dashboard.tsx` in Custom Shell (card sections, `FieldLabel` hints, full-width and paired fields, checkbox rows, footer). Its edit-account sibling `admin-users-dashboard.tsx` is the reference for a modal that only sends the fields that changed.

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


