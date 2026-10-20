---
name: Ui-standards
description: UI standards for building or modifying any interface in this monorepo. Custom Shell is the reference for shared primitives, spacing, controls, tables, modals, loading states, and accessibility.
tags: ui, design-system, standards
---

# UI standards

Custom Shell (`apps/shell`) is the reference implementation. Reuse its
working patterns instead of inventing parallel buttons, forms, tables, cards,
modals, loaders, or scroll areas.

## What is exact and what uses judgement

- A primitive that exists in more than one app under `src/components/ui/` must
  match Custom Shell's version. Change the Custom Shell primitive first, then
  carry that finished change to other apps.
- Feature components outside `src/components/ui/` use judgement. Preserve the
  app's purpose while following the spacing, form, table, modal, loading, and
  accessibility patterns below.
- File components by feature. Custom Shell uses `account/`, `admin/`,
  `automations/`, `feedback/`, `media/`, `settings/`, `shell/`, and `shared/`.
  Only move a component into `shared/` after a second feature uses it.

## Shared building blocks

- Use the primitives in `src/components/ui/` and the established wrappers in
  `src/components/shared/`.
- Use `src/components/ui/field-label.tsx` when a field needs help text. Help is
  a tooltip beside the label, not a paragraph under the control.
- Use `src/lib/hooks/use-table-sort.ts` for sortable tables and
  `src/lib/hooks/use-selection.ts` for row selection.
- Every image field uses `src/components/shared/image-upload.tsx`. Choose its
  shape through `aspect` and its crop through `fit`; do not hand-roll upload
  buttons or file inputs.
- Use semantic theme tokens. Do not hardcode light or dark colors in a feature
  component.

## Page surfaces and spacing

- The default page canvas is `bg-muted/60`. Cards and tables sit above it using
  the shared `Card` and `TableSurface` primitives.
- `src/components/shell/dashboard-content.tsx` owns page padding and the gap
  between page-level blocks. Do not add a second page-padding wrapper.
- Custom Shell's content gutter comes from `--shell-gutter`. Card stacks use
  that same value through `CardGroup` in `src/components/ui/card.tsx`.
- Public fixed layouts use 8px on narrow screens and 12px on desktop:
  `gap-2 md:gap-3` or `space-y-2 md:space-y-3`.
- Small gaps inside a card may use `gap-1` or `gap-2`. Do not use page-level
  ad-hoc margins or unrelated gaps.
- Design narrow and desktop layouts together. Avoid arbitrary widths, radii,
  shadows, gradients, pills, and badges.

## The public frontend has one left and right edge

Signed-out pages drift because each new block picks its own horizontal padding.
One container sets the left and right edge for the whole page and everything
inside it is flat. This covers every public screen in every app, including the
components under a `public/` folder.

- **`src/components/shell/public-page-frame.tsx` owns the edge.** Its `<main>`
  sets the left and right padding, and the column inside it sets the page
  width. No other file on a public page sets either one.
- **Everything the frame renders starts at zero.** A page, hero, section, row
  or block inside it gets no `px-*`, no `mx-auto`, no `max-w-*`, no
  `container`, and no responsive ramp such as `sm:px-6 lg:px-8`. Vertical
  spacing and gaps are still the block's own. The left and right edge is not.
- **The edge is 16px and never moves.** `px-4` on `<main>`, on the header and
  on the footer, at every width and whatever the settings say. Those three are
  the only places that may set it.
- **The Spacing setting does not touch the edge.** It is for the gaps between
  blocks and inside the grids of cards, and nothing else. It used to write the
  edge as well, so moving the slider walked the whole page in from the window
  and a spacing of 0 put the content against the glass. Tyler's call on
  30 Sep 2026: that spacing belongs to the page wrapper, so the slider ignores
  it. Flat mode is no exception, and it keeps the 16px while losing its gaps.
- **The header and footer carry their own `px-4`**, because they render
  outside `<main>` and it is the same number. Their capped box carries no
  padding at all. A header that sets `px-6` inside a `max-w-6xl` box puts the
  logo 24px further in than the card below it, which is the stagger visitors
  notice first.
- **Read the runtime gutter through `pageGutter`.** The gaps between blocks
  are a Settings → Styling number. Import `pageGutter` from
  `src/lib/layout/shell-gutter.ts` instead of writing `var(--shell-gutter)`
  again, or the fallbacks drift apart file by file. It is the gaps, never the
  edge.
- **A phone's gap is the 16px edge, or the setting when that is smaller.**
  Below 640px, where the card grids stop being one per line, the gutter is
  capped so the gaps match the edge and a phone is never more spaced out than
  the desktop. Tyler asked for the two to match on 30 Sep 2026. Flat mode needs
  no exception, because 0 is already under the ceiling.
- **Never write `--shell-gutter` as an inline number.** An inline value beats a
  media query, so a number set on the element could never change with the
  window. `public-page-frame.tsx` sets `--shell-gutter-phone` and
  `--shell-gutter-wide`, and `theme.css` picks one and writes
  `--shell-gutter`.
- **A full-width block pulls out, it never pushes the others in.** A row that
  must touch the window edge uses `-mx-4`, the value the frame set, and
  restores the inset on its own content, the same move as the divider rule.
  Never a fresh number such as `-mx-6`, and never the gutter.
- **Padding inside a card belongs to the card.** `Card`, `TableSurface` and
  `DashboardCardHeader` bring their own. Adding padding to a page wrapper so a
  card looks right means the wrong component is holding the content.
- **The check before calling it done.** Open the page wide and read down the
  left edge. The header logo, the first heading and the first footer link sit
  on one vertical line. If one is further in, a wrapper inside the frame added
  padding of its own.

## Custom Shell runtime styling

Custom Shell lets each workspace adjust its gutter, content background, card
borders, chrome, and modal appearance. The saved values live on `ShellConfig`
in `src/lib/custom-shell.tsx` and are applied by
`src/components/shell/shell-layout.tsx` and `src/theme.css`.

- New page containers consume `--shell-gutter` instead of hardcoding spacing.
- Content surfaces use `Card` or `TableSurface` so runtime border settings reach
  them.
- Workspace card headers use `DashboardCardHeader` from
  `src/components/shared/dashboard-card-header.tsx`. The component owns the
  57px height, 12px padding and bottom divider. Title, tab and custom
  header rows compose it instead of repeating those values.
- **An editor's right-hand options panel uses `InspectorCard`** from
  `src/components/shared/inspector-card.tsx`, not the white
  `CollapsibleSettingsCard`. It is a grey box with a border, a 15px heading and
  an arrow that is always drawn. The difference is what the card sits on: a
  settings page is a column of white cards on a grey canvas, while an options
  panel is a white panel beside a canvas, and a white card on a white panel
  reads as one long list rather than a set of groups. The newsletter editor and
  the page editor both use it; a third panel joins them rather than inventing a
  card of its own. A three-column dashboard's side panels use `PanelCard`
  instead (see Three-column dashboards).
- **Every border follows the border settings in Settings → Styling. No
  component draws its own.** Divider and frame lines are a plain `border`,
  `border-b`, or `border-t` with no color class. They then take `--border`,
  which is what the Divider lines setting writes. Naming a shade —
  `border-foreground/10`, `border-foreground/5`, `border-black/10` — looks
  right at the default and then never moves when the setting changes.
  `src/components/shared/dashboard-card-header.tsx` is the reference.
- **Every scrolling box uses `ScrollArea`** from `src/components/ui/scroll-area`,
  never a native `overflow-auto` / `overflow-y-auto` box — the native scrollbar
  is the fat grey browser one and looks foreign next to the thin themed thumb.
  For a table with a sticky heading, the ScrollArea viewport must be the one
  box that scrolls both ways: switch off `Table`'s own sideways container
  (`containerClassName="overflow-visible"`) and add
  `<ScrollBar orientation="horizontal" />` — `TradeTablePanel` in
  `apps/trade/src/components/trade/trade-table.tsx` is the reference.
- **Dividers run edge to edge.** A divider inside a padded container stops
  short of the surface's edges and reads as a broken line. Pull it out to the
  edges with negative margins matching the container's padding (`-mx-3` inside
  `p-3`) and restore the content inset on the section itself (`px-3`). — popovers, dropdown menus,
  selects, sheets, toasts — get the settings from CSS variables that
  ShellLayout writes on the document root (`useBorderStyleVars`), and theme.css
  redraws the popover and dropdown hairline from the card border settings the
  way it already does for modals. Do not restate a ring or border on their
  content, and do not copy computed styles across the portal by hand.
- Selected-state outlines and deliberate drawings, such as a measuring overlay
  or an annotation on a chart, keep their own color. Everything meant to read as
  a dividing line does not.
- A canvas or chart library that cannot read CSS still uses the same token:
  resolve it off the page and hand the result to the library, the way
  `apps/trade/src/lib/trade/chart-theme.ts` does for its axis lines. A fixed
  alpha of the foreground is the same mistake in a different place.
- The sidebar and sticky header both use `bg-sidebar`; do not color them
  separately.
- Modal rules use the shared dialog slots. Do not restate modal padding,
  borders, backgrounds, or overlay opacity in a feature component.

## Three-column dashboards

Tyler, 19 Oct 2026: every three-column dashboard follows one pattern, as alike
as possible, and the project page in Project is the reference
(`apps/project/src/components/project/project-workspace.tsx`). Where a screen
needs something this pattern doesn't cover, or the pattern needs a piece that
doesn't exist yet, he picks between building it and leaving it off; the open
picks are in the shell's task "Three-column dashboards" (workspace-4,
`apps/shell/workspace/tasks/three-column-dashboards.md`).

**Which screens.** Project's project page, My dashboard, Team dashboard and
Task types; Contacts with its segments (`/admin/contacts`, every app, once
rebuilt as one three-column page, before CRM) and CRM (`/admin/crm`, every app); Trade's social feed, creator
dashboard, backtest run and live flow run; Video's viral project and
favourites. Editors are not dashboards and are left out: the automation,
broadcast and system email editors, Video's studio and carousel studio,
Trade's recipe editor, the front page editor, and Trade's exchange desk.

- **Layout.** Left 22% (16 to 36), middle 54% (at least 32), right 24% (16 to
  36). A side panel collapses to nothing and comes back from a
  `PanelReopenTab` on the middle panel's edge; a double-click on blank space
  toggles it. Widths are remembered per browser through
  `useRememberedPanelLayout`, with the key listed in `panelLayoutKey`
  (`src/lib/layout/panel-layout.ts`). Each panel is a `WorkspacePanel`. The
  reference is `ThreePanels` in
  `apps/project/src/components/project/three-panels.tsx`.
- **Under 1280px, one panel at a time.** A pill row of the three panel names
  sits above them; all three stay mounted and the hidden two are `inert`.
  Opening a record switches to the right panel. This row is navigation, not
  content tabs, so it stays pills whatever the tab rule below says.
- **Every panel starts with `DashboardCardHeader`** (57px). The left panel's is
  `DashboardCardTitleHeader`: a back arrow or an icon, the title, then the pin
  and the cog. Tabs sit inside a header, never in a second row under it.
- **A left panel about one record has a banner and an avatar**, drawn as the
  project page does (`project-details-panel.tsx`). A record is one project,
  team, person, creator and the like.
  - The banner lies behind the header and the top of the panel at 30 out of
    100 strength, fading into the panel, so the header still reads over it.
  - The avatar is a circle with a 2px edge at the banner's foot. Beside it are
    the record's name, one muted line (its client, team or handle) and its
    status if it has one.
  - Both are set in the record's settings window, in a Pictures card holding
    the shell's `ImageUpload` fields, by whoever may change the record's
    settings, from pictures they uploaded to the media library.
  - With neither picture there is no banner and no avatar row; nothing stands
    in for them. An avatar from elsewhere (a creator's X picture) shows with no
    upload.
  - A left panel that is a list or figures (an inbox, a list of types, a run's
    stats) has neither.
- **Tabs are a site's choice, pills or underlined.** Tyler, 20 Oct 2026:
  "Line tab or pill tabs should be a choice all apps can make." Settings →
  Styling → Dashboard tabs picks one for every dashboard on the site, and a
  site that never chose gets pills. This replaced the rule of 19 Oct 2026
  that the count decided (3 or more underlined, 1 or 2 pills).
  - Every tab row in a dashboard's panel header is the shell's
    `DashboardTabs` (`src/components/shared/dashboard-tabs.tsx`), so it
    follows the setting. A "More" dropdown drawn as a tab is
    `DashboardTabButton`.
  - Either way the marker slides to the tab picked: the pill, or the line
    under it (Tyler, 20 Oct 2026: "line tab should use the sliding animation
    too like pill").
  - Words only, no icons. A count goes after the word, as the tab's `count`.
- **The middle header's toolbar**, right of the tabs, in this order: the "N
  selected" button while rows are ticked, the search toggle, Filter, Views,
  the people filter, then the one primary "New …" button. In a narrow panel
  (`@max-3xl`) the button keeps its icon and drops its word, and Filter and
  Views keep their icons.
- **The primary "New …" button opens a dropdown, not a window** (Tyler, 19 Oct
  2026: "Every dashboard probably need to add something that belongs to it").
  It names the thing the screen holds: New task, New meeting, New field.
  - The dropdown holds the title first, then the thing's own fields in pairs:
    who, when, its status and priority where it has them, then its tags and
    the like. "Create …" sits at the bottom right; Enter in the title makes it.
  - It has no "More options". The full window opens on its own only for what a
    dropdown can't hold: pasting several lines at once, or a kind that asks
    for fields when it is made.
  - A "+" on a column, a group heading or a person's row opens the same
    dropdown already set to that column, group or person.
  - Clicking away keeps the typed title for the next opening; the rest starts
    again from where it was opened.
  - Adding something small inside a side panel's card (a milestone, a step) is
    that card's own + with a `CardDropdown`, not this button.
  - A screen whose records only arrive from outside (incoming messages,
    imported posts, a finished run) has no New button.
  - The reference is `QuickNewTask`
    (`apps/project/src/components/project/quick-new-task.tsx`) until its frame
    moves to the shell.
- **A middle panel that lists records has search, Filter and Views** (Tyler,
  19 Oct 2026: "I think most dashboard needs those"). Records are tasks,
  conversations, posts, videos and the like. A middle panel that is a chart, a
  calendar or a canvas has none, and a list short enough to read whole may
  leave them off.
  - **Filter** is a ghost button that counts the filters set ("Filter 2") and
    opens a popover: a row per filter (a label, then its Select), then the
    Group row where the panel groups, then Clear and "Save as view". Clear
    empties the filters and leaves Group alone. The filters live in the
    address, so a pasted link opens the same view. The people filter stays a
    dropdown of its own in the toolbar.
  - **Views** are filter sets saved per person with a name. The Views button
    lists them and applies one, "Save as view" in Filter makes one, and a view
    whose person or tag has since gone says so instead of failing.
  - Views are the shell's `SavedViewsControls` and `SaveViewDialog`
    (`src/components/shared/saved-views.tsx`), kept in the shell's
    `saved_views` table. The app registers each screen's kind in
    `savedViews.screens` (`src/server/app-options.ts`). They moved there from
    Project on 20 Oct 2026, when Tyler asked for them on Video's Viral project
    and said "Fix project too".
  - The Filter frame is the shell's `FilterPopover`
    (`src/components/shared/filter-popover.tsx`); Project's
    `TaskFilterPopover` is the drawing it was taken from.
- **A middle list whose rows can change together has mass select** (Tyler,
  19 Oct 2026: "the mass select function as well"). It replaces the Tables
  rule's always-shown tick box column on these screens.
  - The tick boxes, and drag handles where rows reorder, stay hidden until a
    "Mass select" chip is pressed. The chip sits beside the first column's
    heading and shows while that heading is pointed at; on a phone it always
    shows. Pressed, it reads "Hide select", which hides them again and clears
    the ticks.
  - Ticked rows gather in one "N selected" button in the header, left of the
    search, with a 1px moving rainbow edge that holds still for anyone whose
    device asks for less motion.
  - Its menu holds the most common change first (Mark Done), then each other
    change as a row that steps into its own list with a back arrow, then
    "Clear selection". Escape on a list goes back; on the first page it closes.
  - Each change is one request; the result names how many changed and each
    one refused with its reason.
  - A list nobody changes in bulk (a read-only feed, a run's results) has
    none.
  - The reference is `TaskList` (`task-list.tsx`) and `TaskBulkMenu`
    (`task-bulk-bar.tsx`) in `apps/project/src/components/project/`, until
    they move to the shell.
- **Side panel bodies** are a `ScrollArea` holding `grid gap-3 p-3`. Groups in
  them are the shell's `PanelCard` (`src/components/shared/panel-card.tsx`;
  Project still has its own copy): a grey box that folds and remembers it,
  with a note after the title, a badge, a cog or + of its own, and a footer of
  buttons. Small-caps headings use one shared heading, never a copied class.
  - **One screen is trying flat sections instead.** Video's Viral project
    draws its left panel as sections with no box or grey, split by a line
    running to the panel's edges (Tyler's design, 20 Oct 2026;
    `apps/video/src/components/video-viral/flat-section.tsx`). Every other
    dashboard keeps `PanelCard` until Tyler decides.
- **A card's header buttons show on hover only.** Tyler, 20 Oct 2026,
  pointing at a card's cog, + and arrow: "all these should be hover to show
  only." The cog, the card's own buttons and the fold arrow stay hidden until
  the card is pointed at or holds the keyboard's focus, folded or open. A
  button whose dropdown or footer is open stays in view, and a screen with no
  pointer (a phone) always shows them. `PanelCard` does this for every card;
  there is no switch to turn it off. The title, its note and its badge always
  show.
- **The right panel** with nothing open has a `DashboardCardTitleHeader` naming
  what will show there, then a centred icon and one line, such as "Click a task
  to see its steps and chat here." With a record open, its header holds the
  status or title on the left, the record's action icons, a cog, then an × that
  closes it.
- **Every three-column dashboard opens a record on arrival and goes back to
  where it was.** Tyler, 19 Oct 2026: "Make the first load on contact to load
  the first contact on the load so that the right sidebar has something to
  load. And then the dashboard remembers where it was before and make this
  mandatory for all 3 col dashboards".
  - Opened at its bare address, from the left menu or a bookmark, the
    dashboard returns to the address it last had: its search, filters, picked
    group, sort, page and open record. An address that already says
    something, such as a shared link, wins.
  - With no record open after that, the first row of the list opens, so the
    right panel is never empty on arrival. A remembered record that has gone
    gives way to the first row.
  - Only on arrival: closing the record afterwards leaves the empty right
    panel above.
  - On a narrow screen the list stays in front; the record opened by itself
    waits behind its pill.
  - The place is kept per browser, per person and per site, and the open
    record is `?open=<id>`. `ThreePanels` will not draw without its `place`
    (`src/lib/layout/dashboard-place.ts`), so a dashboard built on it cannot
    leave this out.
- **Settings.** The cog in a panel's header opens the settings window for the
  panel's subject (a project, a team, a type). A card's own small options open
  a `CardDropdown` from the card's cog or +.
- **Loading, empty and error states** stay inside the panel: `LoadingRow`
  (`src/components/ui/loading-row.tsx`) while loading, a muted line saying what
  is missing and what to do when empty, never a page-level spinner.

## Controls and forms

| Size | Height |
| --- | ---: |
| Extra small | 24px (`h-6`) |
| Small | 28px (`h-7`) |
| Default | 32px (`h-8`) |
| Large | 36px (`h-9`) |

- Inputs, selects, tabs, and standard buttons stay 32px at every breakpoint.
  Modal footer buttons are the deliberate 36px exception.
- Use component size props. Do not override control heights at call sites or
  add responsive height changes.
- Use one primary button per action group. Use `outline` for secondary actions,
  `ghost` for low-emphasis actions, and destructive styling only for actions
  that remove data.
- Icon-only buttons need an accessible name and, outside repeated table rows, a
  shared tooltip. Use `DisabledReason` for a disabled control's explanation.
- Every hover hint is the shared shadcn `Tooltip`, never a native `title`
  attribute. Tyler, 13 Oct 2026: "tooltips should be using shadcn ui". A
  `title` draws the browser's own grey box, late and in its own font, and never
  shows on a disabled button. A component prop called `title` (a table, card or
  dialog heading) and an `<iframe title>` are names, not hovers, and stay.
- Use `SettingsIcon` for edit, `Trash2Icon` for delete, `PlusIcon` for add, and
  `Loader2Icon` for loading. Do not use a pencil icon for edit.
- Every field has a visible label linked with `id` and `htmlFor`.
- Use `gap-2` from label to control, `gap-4` between fields, and `gap-6` between
  cards in a modal body.
- Short fields may sit side by side on desktop and stack on mobile. Inputs and
  textareas fill their row; selects are content-width on desktop.
- Textareas start at one row and grow with content. Use the shared `Textarea`.
- Each checkbox or switch gets its own row.
- Validation runs when the field is left or when the action is attempted. Keep
  the action enabled, mark the field with `aria-invalid`, preserve the entered
  value, and report the problem through `src/lib/toast/error-toast.ts`.

## Settings

Tyler, 9 Oct 2026, about Pomoder's own admin settings page: "This settings
page should be here and it has to be auto save." "Here" is the App settings
card in the rail on `/admin/settings`.

- **An app's own settings live in Settings → App settings.** Each group is a
  tab the app lists in `settings.tabs` in its `src/app/options.ts`
  (`defineSettingsTab` from `src/lib/settings-tab.ts`), so it shows in the rail
  under App settings at `/admin/settings/<id>`. Never a page of its own such as
  `/admin/<app>-settings`, and never a card stacked on a page somewhere else.
  The rail saying "This app has no settings of its own." while the app has
  settings is this rule broken.
- **Settings save themselves. There is no Save button.** A change saves 700ms
  after the last edit, at once when a field is left or Enter is pressed, and a
  switch or a pick saves the moment it changes. The page header says
  Saving…, Saved or Not saved, through `useReportedSaveStatus` from
  `src/components/settings/use-reported-save-status.ts`, the way
  `src/components/settings/ai-settings.tsx` does for a pasted key.
  `docs/shell/settings-saving.md` is the shell's side of the same rule.
- **A refused save keeps what was typed** and says why in the error toast. A
  value that fails its check is marked `aria-invalid` and not sent.
- **Moving between Settings tabs never shows a load.** Tyler, 9 Oct 2026:
  "why is there a load when i click through the tabs? make sure you follow
  shell patterns". The shell's own tabs draw from the settings record the
  shell layout already holds, and write each edit into it before the save goes
  out (`src/components/shell/shell-layout.tsx`). An app's tab does the same:
  read its settings from the server once per page, hold them in memory, put
  every edit into the held copy as it is made (and take it back out if the
  save is refused), and draw from it on every later open. The first open of
  the first tab may show one loading row, because the shell gives an app's tab
  no loader. `src/components/pomodoro/admin-settings-tabs.tsx` in Pomoder is
  the reference.
- **Only a destructive step asks first.** Removing a saved key or deleting a
  record goes through the shared confirm dialog. Nothing else on a Settings tab
  waits for a button.

## Tabs

- Use the shared segmented `Tabs` style: a muted container with a raised active
  tab.
- The list may fill available width, but triggers stay content-width.
- Tabs in a dashboard card header have words only and no icons (Tyler, 25 Sep
  2026).
- **In a three-column dashboard, the site decides.** A panel header's tabs
  are `DashboardTabs`, drawn as these pills or underlined as Settings →
  Styling → Dashboard tabs says, pills by default (Tyler, 20 Oct 2026; see
  Three-column dashboards). Elsewhere, tabs are pills, and no other screen
  draws underline or plain-text tabs.
- **One exception outside a dashboard: Video's Extras box** in the AI clip
  panel (Clothing, Backdrop, Props, Hair and makeup) uses underlined tabs with
  the search as a magnifying glass at the row's right end. Tyler asked for it
  on 19 Oct 2026 by pointing at the Project tabs ("use this type of tabs"). It
  is `apps/video/src/components/video-editor/ai-clip-extras.tsx`.
- **The project page's tasks header (List, Board, Calendar, Timeline, More)
  has the one bottom line that names its own shade**
  (`border-b-muted-foreground/10`, `project-tasks-panel.tsx`). At the Divider
  lines setting Tyler keeps (5), it vanished against the List's grey table
  header; he asked for that line alone to show and every other line to stay as
  it was (19 Oct 2026: "revert to the way it was but make that header divider
  appear"). No other border copies it.

## Tables

- Use `src/components/shared/dashboard-table.tsx`, the primitives in
  `src/components/ui/table.tsx`, and `TableSurface`. The reference screen is
  `src/components/admin/admin-users-dashboard.tsx`.
- Every table has a selection checkbox first, sortable data columns, and an
  actions column last. Selection and actions are not sortable. A three-column dashboard's
  middle list hides its checkboxes behind Mass select instead (see
  Three-column dashboards).
- The header checkbox selects all visible rows and shows an indeterminate state
  when only some are selected.
- Use `TableSortButton` with `useTableSort`; do not build a separate sorting
  rule in each screen.
- Use a 40px header, `px-5 py-2` cells, a muted header, and the shared rounded
  surface.
- The main title is interactive. If it opens a detail or edit view, pass that
  same action to `TableRow` as `rowAction`.
- Mark the actions cell with `column="actions"` so a row click never steals a
  click intended for a row control.
- Row actions end with a Settings button and then a Delete button.
- Toolbar order is: multi-row actions, search, filters, secondary actions, then
  the single primary create action.
- A multi-row change is one server request. Return completed and skipped ids,
  then describe the result with `src/lib/format/bulk-result.ts`.
- Cap or clamp long text. Use horizontal scrolling only for real table
  overflow, and hide low-priority columns on narrow screens.
- Rows grouped under headings use `TableGroupRow` from
  `src/components/ui/table.tsx`, never a hand-styled `TableRow` with its own
  band, lines or padding.
- Loading, empty, error, populated, and pagination states stay inside the table
  surface.

## Modals

- Use shared `Dialog` for forms and the shared confirmation dialog for
  destructive actions. Do not nest modals.
- Form windows use `DialogContent variant="admin"` from
  `src/components/ui/dialog.tsx`.
- Use `DialogHeader`, `DialogBody`, and `DialogFooter`; do not create a second
  modal shell or close button.
- Every logical body section is a `Card size="sm"`. Put its title in
  `CardHeader` and its fields in `CardContent className="grid gap-4"`.
- Footer order is Delete at far left when present, then Cancel, then the primary
  action. Editing uses “Save changes”; creation uses “Create <thing>”. A
  read-only window ends with one “Done” button.
- Use `src/components/ui/form-dialog.tsx` when a window holds typed work. Pass
  `dirty` and `busy`, and wire Cancel through its `requestClose` callback.
- Report failures through the persistent error toast. Successes from dashboard
  changes use a success toast; account-window actions may confirm inline beside
  the action.
- A record with several tabs opens from its list and keeps the open record in
  `?open=<id>`. `src/lib/hooks/use-open-from-link.ts` owns that address behavior.
- Preserve Escape, focus trapping, focus restoration, and accessible titles.

## Scrolling and loading

- Use `src/components/ui/scroll-area.tsx`; do not create raw `overflow-auto` or
  nested scrolling regions.
- Do not use skeletons or shimmer placeholders.
- Route data loads before the page renders. A surface that refreshes on its own
  keeps its real frame and uses `src/components/ui/loading-row.tsx` or a small
  centered `Loader2Icon`.
- Every data surface has intentional loading, empty, error, and populated
  states. Explain failures and how to retry.

## Accessibility and verification

- Use semantic elements, keyboard interaction, visible focus, sufficient
  contrast, and reduced-motion support.
- Do not communicate state with color alone. Associate field errors with their
  controls.
- Check loading, empty, error, disabled, success, long-content, narrow-screen,
  dark-theme, and keyboard behavior when relevant.
- Validate changed browser workflows in the running app and inspect console and
  failed network requests before reporting them complete.
