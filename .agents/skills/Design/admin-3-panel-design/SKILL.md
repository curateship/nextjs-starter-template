---
name: admin-3-panel-design
description: "Admin - 3 panel design. Turns a chosen dashboard into the three-panel design Tyler built on Project's site admin My dashboard (6 Nov 2026): a left panel with a page under the header and a footer of folding cards, a middle list with a ⋮ toolbar menu, a right record panel with a tabbed ⋮ menu of grouped rows and Comments as a "/" block in its notes, and My settings as a tabbed ⋮ dropdown. Use when Tyler asks to apply, copy or transform a dashboard into this 3 panel design, or names this skill."
---

# Admin - 3 panel design

Turn a dashboard into the three-panel design that Project's site admin My
dashboard shows (`apps/project`, built 6 Nov 2026). This file lists every
pattern, with the file in Project that is the working reference, so the
transformed screen matches it piece for piece.

Read these first and follow them: `.agents/skills/Ui-standards/SKILL.md` (the
one UI standard, including the three-column dashboard rules), the target app's
`CLAUDE.md`, and `.agents/skills/unslop/SKILL.md` for every word on screen and
in the docs. Where this file and the UI standard disagree, ask Tyler. Do not
pick one quietly.

## How to run it

1. **Pick the target.** Tyler names the dashboard. It is a screen already in
   three panels. Never turn a table or a list page into three panels unless
   he asks for exactly that (Tyler, 6 Nov 2026, after Travel's Trips table
   was made into three panels: "I never said to do that. I said to fix the 3
   panel dashboard"). In Travel, "the trips dashboard" is the trip page,
   `/trips/<id>`. When the name could mean two screens, ask which one first. Read its route, its screen
   component, its left, middle and right panels, its settings menu or cog, and
   its docs in the app's `workspace/docs/`.
2. **Map it.** Write a short table: each thing the dashboard has today, and the
   slot it takes below (left page, left footer card, middle toolbar ⋮, record
   ⋮ tab, a "/" block in the record's notes, My settings tab, and so on). Anything that fits no slot is
   listed as a question, never dropped.
   - **Fix what's there; anything new is a "/" block** (Tyler, 6 Nov 2026,
     on Travel: "fix whats already there and anything new
     to add should just be blocks"). Never offer invented cards or panels as
     options.
   - **Find every mismatch yourself** across the app's screens on this
     pattern: every settings ⋮, every Mass select, every header ("Dont make
     me list them all. find them yoyurself"). Settings menus become the
     tabbed ⋮ of grouped rows; menus of actions ("+ Add", a "More" ⋮) stay
     the shell's `folding-menu.tsx`.
3. **Ask.** One round of at most four questions through the option tool. Each
   question names the screen and offers a recommended first option with an
   ASCII preview. Typical questions:
   - Which cards go in the left footer, in what order?
   - What do the record ⋮'s tabs hold?
   - What does the left page store: one page that stays, or one per day?
   - Do employees or other roles get the same?
4. **Write one task file** in the app's `workspace/tasks/`, holding Tyler's
   words, his answers and the map. One request is one file, with no file per
   piece. Status `active` while building, `validating` when done.
5. **Build** in the order of the sections below: frame, left, middle, right,
   menus. Only edit app files. A shell-origin file (`src/components/ui/*`,
   `src/components/shell/*`, `src/components/settings/*`) is never edited from
   an app. Style it from outside or use the library underneath (see Popover
   anchor below).
6. **Reuse, copy, or import.** In Project, import the reference parts. In any
   other app, copy the app-level parts named here into that app's own
   `src/components/<feature>/`, keeping their comments. Say in the task file
   which were copied. The shell's own primitives are imported, never copied.
7. **Docs in the same turn**, in the app's `workspace/docs/`: what each panel
   holds and why, in Tyler's words. Remove every doc line about what was
   taken away.
8. **Prove it** with `.agents/skills/validate-app/SKILL.md` (the Measuring
   section below says what to measure). Report in Tyler's shape: the answer
   first, then bullets, links to the local screens, and the decisions left
   open.

## The frame

- **Three panels**: `ThreePanels` (`apps/project/src/components/project/three-panels.tsx`).
  - **Widths:** left and right open at 16%, the narrowest they drag to, and go
    up to 36%. The middle takes the rest, at least 32%.
  - **Widths are remembered** per browser under a layout key in
    `src/lib/project/panel-keys.ts`. Changing a default means bumping the
    number on the key (`...-horizontal-2` becomes `-3`), or old browsers keep
    the old widths.
  - **Under 1280px**, one panel at a time behind a pill row: left, middle,
    right. `narrowStart="left"` shows the left panel first. `showMiddleFor`
    jumps to the middle when a filter is picked, and `showRightFor` jumps to
    the record. No extra phone tab for something the footer already holds.
- **Every panel starts with `DashboardCardHeader`** (57px). Side panel bodies
  use the panel gutter `PANEL_GUTTER` (`gap-3.75 p-3.75`, in
  `src/lib/project/panel-gutter.ts`), and footers use `PANEL_FOOTER_PADDING`
  (`p-3.75`).
- **Lines:** every dividing line is a plain `border`, `border-t` or
  `divide-y` with no colour class, so it follows Settings → Styling → Divider
  lines. Lines run edge to edge. A line between two things is drawn once.

## Left panel

Reference: `AdminPanel` in `apps/project/src/components/project/admin-dashboard.tsx`.
Second example: `ProjectDetailsPanel` in
`apps/project/src/components/project/project-details-panel.tsx` (the project
page, 6 Nov 2026: footer cards Details and Milestones, and the project ⋮ as a
`TabbedMenu` with General and Members in `project-menu.tsx`).

- **Header:** the record or person's avatar, name and one muted line, then
  icon buttons. Here that is Look back (graph), the inbox (tray that morphs
  into a cross, red count bubble) and **⋮ My settings** (see My settings). There is no cog and no
  pencil. Settings that used to sit behind a pencil move into My settings.
- **Banner:** a picture or drawn sky lies faintly behind the header and the
  top of the panel and fades into it (`DailySkyBanner` in `daily-card.tsx`).
  The header's bottom line goes see-through over it. **Every side panel with a
  page has a cover photo** (Tyler, 7 Nov 2026, of Trade's two panels: "both
  panel is missing cover photo"): a "Cover photo" row in the page's ⋮ under a
  "Page" group, None until one is added, the upload in its small box.
  Reference: `PageCover` and `CoverRow` in `apps/trade/src/components/trade/notes/`.
- **A side panel's header line follows Divider lines.** The shell draws a
  table's line under a header whose next element holds a table, and the
  tables inside blocks set that off. Wrap the side panel's header in its own
  `div` so the rule never matches (Tyler, 7 Nov 2026: "this left panel header
  divider is not wired to the styling setting").
- **Each side panel's header has a collapse button at its outer edge**: the
  left starts with `PanelLeftCloseIcon`, the right ends with
  `PanelRightCloseIcon`, each a ghost icon button with a tooltip that shuts
  the panel, as a double-click on its blank space does (Tyler, 7 Nov 2026:
  "add a collasible icon here to collapse the left panel", then the same for
  the right).
- **The first and last icon in a side header sit 16px from the panel's
  edge** (the collapse button with `-ml-1` or `-mr-1`, a record's own icon
  with `ml-1`), so both side headers line up (Tyler, 7 Nov 2026: "padding is
  not consistence"). Measure the drawn icon, not the button box.
- **A record's own icon leads its name** on the right panel, such as a
  market's icon (Tyler, 7 Nov 2026: "Add the market favicon").
- **Page under the banner:** the only thing above the footer is a page of the
  person's own with the "/" blocks, saved 700ms after typing stops
  (`AdminPageNotes` and `PageNoteEditor` in `project-page-notes.tsx`, at the
  panel's 14px through `small`). It is stored as one column on the person's
  own prefs row, cleaned by the same rule as a project's page
  (`pageNotesSchema` in `src/lib/project/rules.ts`), and only its owner can
  save it.
- **Lock the notes:** the page's ⋮ (My settings, or the record's settings ⋮
  such as Team settings) has a "Lock the notes" row under its General groups,
  a ghost button with `LockIcon`, reading "Unlock the notes" with
  `LockOpenIcon` while locked. Locked, the page reads only, blocks and all,
  even for its owner, and the server refuses a save (Tyler, 7 Nov 2026, of
  the team page: "the lock blocks button is missing"). Every page in this
  design has it.
- **Every card folds by its heading** (Tyler, 7 Nov 2026: "the header should
  be here on the same row as the trashcan icon. Also clicking on the header
  toggles the card. Update the skill that all cards must have this
  function"). This holds for footer cards and for card-shaped "/" blocks on a
  page alike:
  - The card is a `Collapsible` whose heading is `FoldHeading band`: pressing
    the title folds and opens it. A footer card shows the arrow at the right
    as the same press; a "/" block card shows no arrow (Tyler, 7 Nov 2026:
    "dont need to show this"), the title alone folds it
    (`[&>button[aria-hidden]]:hidden` on `FoldHeading`). The fold is remembered in this browser per card
    (`useRememberedCollapse(collapseStorageKey.settingsCard(...))`).
  - A block's bin sits in the heading row, as `FoldHeading`'s children,
    at the row's right end, its middle level with the title's
    (measure both). It shows while the block is pointed at or focused, and
    always on a phone. Never a bin floating over the card's corner above the
    title.
  - Inside the editor, the page's own heading styles reach the card's `h2`,
    so the heading resets them (`!m-0 !p-0 !text-base !leading-tight`).
  - **Every block card is styled the same** (Tyler, 7 Nov 2026, on Trade's
    dashboard blocks: "Add this card styling to the skill"). Reference:
    `BlockCard` in `apps/trade/src/components/trade/notes/trade-block-views.tsx`.

    ```
    ╭──────────────────────────────╮  grey block, rounded-2xl
    │ ⊞ Grid trades        ⚙  🗑   │  heading band
    │╭────────────────────────────╮│  white tile, 3px in
    ││ Ticker  Type  Value  PnL   ││  white heading row
    ││────────────────────────────││
    ││ AMZN    Long  $42   +$0.68 ││  rows
    ││ 9 trades      $785  -$20.65││  white totals row
    │╰────────────────────────────╯│
    ╰──────────────────────────────╯
    ```

    - **The block:** one solid light grey box,
      `bg-[color-mix(in_oklab,var(--muted)_50%,var(--background))]`,
      `rounded-2xl`, `overflow-hidden`, with no border of its own.
    - **The heading band:** `FoldHeading band`, padding `py-2.5 pr-2.5 pl-4`.
      The icon is `size-4` and muted, then the title in `text-base
      font-semibold`, then a count on a white patch when there is one. The
      block's own buttons (a cog, a plus, a broom) sit in the heading row,
      before the bin. The bin shows while the block is pointed at or
      focused, and always on a phone. Pressing the title folds the block;
      there is no arrow.
    - **The tile:** everything the block shows sits in one white tile,
      `bg-background`, 3px inside the grey block on its sides and bottom
      (`px-[3px] pb-[3px]` on the body), a thin grey frame round it. Its
      corners are the block's less those 3px, `rounded-[calc(1rem-3px)]`, so
      the frame stays even all the way round (Tyler, 7 Nov 2026: "reduce the
      padding ehre by 50%", "try 100%", "try it so that we only see a
      border", "try 90%", then "Make padding 70% instead").
    - **A table inside the tile is all white.** Its heading row and totals
      row turn `bg-background` inside the tile; a grey heading melts into the
      grey block and the tile's corners read as square (Tyler, 7 Nov 2026:
      "THis should be rounded corner"). The line under the heading row stays.
    - **Height:** the tile is capped at `max-h-[28rem]` and its list scrolls
      inside it, so one long block never pushes the rest of the page away.
    - **Folded,** the block is its heading band alone. The body stays mounted
      (`forceMount`, hidden while closed), so counts and live reads keep
      going, and the fold is remembered in this browser per block.
    - The tile never repeats the block's title: a panel moved into a block
      drops its own title row (a `bare` form).
    - Project's team blocks hold several small white cards
      (`apps/project/src/components/project/notes/team-blocks.tsx`, tiles
      `rounded-xl bg-background p-3`). They were built before this style;
      ask Tyler before bringing them onto it.
- **Block gutters are the panel gutter, 15px, everywhere** (Tyler, 7 Nov 2026:
  "This should be the gutter size for the blocks"): 15px from the panel's
  sides, 15px between two blocks, and a block that opens the page sits 15px
  under the header, never lower.
  - Each block's frame carries `data-note-block` and takes 15px above and
    below (`[&_.tiptap_[data-note-block]]:my-3.75`), so two blocks meet in one
    15px gap. A block that is the page's first takes none above. The writing
    area adds no padding of its own (`!px-0 !pt-0`).
  - **An empty line above a block goes with Backspace or Delete**, so a block
    can always be brought to the very top (Tyler, 7 Nov 2026: "The blocks cant
    go all the way to the top"). Reference: `EmptyLineAboveBlock` in
    `apps/trade/src/components/trade/notes/note-block-nodes.ts`.
  - **The space above the first block is the page's, not the panel's**, so a
    click there lands in the page: the writing area carries the 15px top edge
    (`!pt-3.75`, the panel body `pt-0`). A click there, or between two blocks
    with no line between them, starts a new line at that spot (Tyler, 7 Nov
    2026: "cant click here"). Reference: `lineBetweenBlocks` in
    `apps/trade/src/components/trade/notes/saving-document.tsx`.
  - Measure all four: left, right, top and between, each 15px.
- **Right-click opens the blocks** in the page, and in the record's notes on
  the right: the same "/" list, at the pointer, putting the block where the
  click was (`openAt` in `notes/use-note-blocks.ts`, the handler on
  `data-note-box` in `notes/note-editor.tsx`). With words selected, the
  browser's own menu stays, for Copy.
- **A locked page reads at full strength, never faded.** The shell's
  `DocumentEditor` fades anything passed `disabled` to 60%
  (`src/components/shared/rich-text-editor.tsx`, `opacity-60`), which looks
  like a shade laid over the panel (Tyler, 7 Nov 2026: "Why is there a shade
  overlay when the left panel is locked?"). So a lock never goes to the
  editor as `disabled`:
  - **Project** draws a locked page with the reading view `NoteView`
    (`project-page-notes.tsx`), not the editor.
  - **Travel** passes `locked` to `SavingDocument`
    (`apps/travel/src/components/travel/saving-document.tsx`). The editor
    stops taking writing, and `opacity-100` on its box undoes the fade.
  - **Keep the fade only for "No signal"**, where it says nothing could be
    saved.
  - Don't change the shell file to fix this in one app. That forks it.
  - Check it in the browser: lock the page, then read
    `getComputedStyle(...).opacity` on the editor's box. It must be `1`.
- **The Inbox and Look back** replace the page in place, and the footer stays.
  The page and the inbox stay mounted while hidden, so counts stay right.
- **Footer of folding cards:** fixed at the bottom of the panel, holding the
  dashboard's cards one under another (here: Pinned projects, Need your
  attention, Daily card).
  - **Use `PanelFooter`** (`apps/project/src/components/project/panel-footer.tsx`)
    and pass each card as a child. Don't redraw the footer by hand. My
    dashboard and the project page both use it.
  - **Layout:** the panel is a flex column. The body above takes
    `PANEL_BODY_ABOVE_FOOTER` (`flex-[1_0_6rem]`, keeps at least 6rem for the
    page), or `PANEL_BODY_ABOVE_FOOTER_WIDE` (`flex-[1_0_50%]`) while the
    Inbox, Look back or a notes list is in its place, both in
    `panel-gutter.ts`. `PanelFooter` is `relative flex min-h-0 flex-col`
    holding one `ScrollArea`. So the footer takes what its cards need and
    only scrolls once the panel is full. Never cap the footer at a fixed
    share of the screen.
  - **Boxes:** `PanelFooter` puts each child in a rounded light grey box of
    its own (`grid overflow-hidden rounded-2xl bg-muted/50 empty:hidden`),
    10px apart and 10px from the panel's edges (`gap-2.5 p-2.5`), with no
    lines between them. A null child draws no box, and a box whose card draws
    nothing is `empty:hidden`. Light inner boxes, such as the Daily card's
    sections, turn white inside it (`[&_[data-daily-section]]:bg-background`).
  - **A card that was a `PanelCard`** (such as the project's Milestones)
    becomes a `Collapsible` with `FoldHeading band`, keeping its old
    `storageId` as the `collapseStorageKey.settingsCard(...)` key so a fold
    already remembered stays. Its heading button (the "+") goes in as
    `FoldHeading`'s children, before the arrow.
  - **Name and value facts** (the project's Lead and Client) become a
    Details card: rows with the name muted on the left and the value on the
    right (`ProjectDetailsCard` in `project-details-panel.tsx`).
  - **Each card** is a `Collapsible` with `FoldHeading band icon={...}` as its
    heading (`apps/project/src/components/project/fold-heading.tsx`), and its
    body (`CollapsibleContent`) brings `FOOTER_CARD_BODY` (`px-4 pb-4`, in
    `panel-gutter.ts`). So a folded card is its heading alone.
  - **FoldHeading:** the heading is the button that folds. Icon (`size-4`,
    muted) before the title, title `text-base font-semibold`, and the count
    after the words on a patch (`rounded-md px-1.5 py-0.5 text-xs`: white with
    `band`, `bg-muted` without), plus an optional muted `line`. With `band`
    the heading has the card's padding (`py-2.5 pr-2.5 pl-4`) and the chevron
    always shows, muted. Without it the chevron is a ghost `icon-sm` button
    shown only on hover or focus, and always on a phone. Items are centred,
    so a one-line heading has no extra room under it.
  - **Inside a card,** every list grid is `grid-cols-[minmax(0,1fr)]`, so a
    long name truncates instead of running past the box's edge.
  - **Each card starts open** and remembers a fold in this browser
    (`useRememberedCollapse(collapseStorageKey.settingsCard(...))`).
  - **Inside a card,** links that lead away (such as "All projects") sit at the
    bottom of the card's body as a ghost `sm` button, not in the heading. The
    filter a card sets is named on the heading's muted line ("Showing only
    Website") so it shows while folded.
- **Rows inside cards** (`admin-cards.tsx`):
  - Each record row is one button: the project's colour dot (`ProjectDot`),
    the title, and a muted line under it.
  - The record open on the right looks picked:
    `bg-background shadow-[inset_2px_0_0_var(--foreground)]` and
    `aria-current="true"`.
  - Cards are tinted by urgency (`bg-red-500/10` now, `bg-amber-500/10` soon,
    `bg-blue-500/10` to know, `bg-emerald-500/10` done).
  - A save waits only on its own row: keep a `Set` of saving row ids
    (`useRowSave`), and spin and disable only that row's button.
  - Time-bound rows follow the clock (`useNow` in `src/lib/project/use-now.ts`,
    every 30s from the page load's moment). The one happening now comes first
    with a "Now" badge, and finished ones fade (`opacity-60`) to the bottom.
  - Five rows, then "Show all 12".

## Middle panel

Reference: `MyTasksPanel` in `apps/project/src/components/project/my-tasks-panel.tsx`.

- **Header, left to right:**
  - the view tabs (`DashboardTabs`: List, Board, Calendar, Timeline);
  - the "N selected" slot while rows are ticked;
  - Filter, then Views;
  - the one primary **New …** button, which opens a dropdown;
  - a **⋮** ("More for …", tooltip naming what it holds), always the last
    thing in the header, after the New button, never after the tabs
    (Tyler, 6 Nov 2026, on Travel's trip page: "The 3 dots icon is supposed
    to be here", pointing past "+ Add").
- **One header only.** The middle panel never gets a second header row under
  its tabs. Controls that belong to what a tab shows, such as a chart's
  timeframe, sit in that one header after the tabs (Tyler, 7 Nov 2026, on
  Trade: "There should only be one middle header"). Reference: Trade's
  `activity-panel.tsx`: the primary Browse market button before the tabs,
  then the timeframe, Indicators, View options and a ⋮ with Wallet and Close
  all. A header slot before the tabs is built from the shell's
  `DashboardCardHeader` and `TabsList`, never by editing the shell's tab
  header.
- **The ⋮ holds Search and Mass select.** They are not buttons in the header.
  - Search opens its box in the header with the cursor in it. Open it from the
    menu's `onCloseAutoFocus`, after the menu has closed, because an open menu
    keeps the focus.
  - Mass select is held by the panel and handed to the list as
    `massSelect={{ on, onToggle, tick }}`. The list then draws no button of
    its own. The item reads "Hide select" while on, and leaving the List turns
    it off.
- **A row's right-click menu** (`TaskRightClickMenu` in `task-right-click.tsx`)
  starts with Mass select ("Hide select" while on), then Duplicate, then
  Delete under a line. Turned on from a row, that row starts ticked: the panel
  keeps the row's id and hands it to the list as `tick`, and the list ticks it
  as Mass select comes on. Turning it on from the ⋮ clears that id, so
  nothing is ticked. Offer it only where the list has Mass select.
- **Mass select shows tick boxes and drag handles.** With it on, rows drag:
  - under the list's own headings, to reorder or move to another heading;
  - under a grouping (status, priority, due date, type), a drop under
    another heading takes that heading's value, as on a project's List. A drop
    inside its own heading does nothing for groupings with no order of their
    own.
  - groupings where a drop would hand the record over or move it elsewhere
    (assignee, project) do not drag.
  - Stuck asks why first.
- **No matches:** "No tasks match "x"." with a **Clear filters** button
  (`NO_TASK_FILTERS` in `src/lib/project/task-filters.ts`), never plain text
  telling the person what to do.

## Right panel (the open record)

Reference: `SidePanel` in `apps/project/src/components/project/task-side-panel.tsx`
and the parts built in `task-body.tsx`.

- **No ×, never emptied by hand.** On arrival it shows the record last open, or
  the list's first. Only a list with no records leaves it empty, with a
  centred icon and one line.
- **It remembers the record, and a first visit lands on the first row**
  (Tyler, 6 Nov 2026, on the project page: "it should always land on the
  first task on the list"). Every page in this design wires it the same way:
  - `useRememberedTask({ storageKey, taskId, ids })` in
    `apps/project/src/lib/project/use-remembered-task.ts`. `taskId` is the
    address's record id; `ids` is the list's ids in the order shown, `null`
    until the list has drawn. It reopens the record last open here, or the
    first row when there is none or it is gone, by replacing the address.
  - `storageKey` names the page, and per record holder when the page shows
    one holder's list (the project page uses `projectOpenTaskKey(projectId)`
    in `panel-keys.ts`, so each project remembers its own). The hook adds the
    person's id.
  - The middle reports its rows: `TaskList`'s `onRows` gives the rows in view
    (headings, sort and filters applied, folded headings left out). Tabs
    without rows (Board, Calendar, Timeline) report the list's own order.
  - Pass the returned id to `ThreePanels` as
    `showRightFor={taskId === quietTask ? undefined : taskId}`, so a phone
    stays on the list instead of jumping to a record nobody pressed.
  - Key the page component by its holder's id (the route does
    `key={page.project.id}`), so moving to another project starts fresh and
    never opens the last project's first row.
- **Header:** the record's title on the left, then the **⋮**. No bell: the
  bell beside Project's task ⋮ is Project's own Follow, not part of this
  design (Tyler, 7 Nov 2026: "its only specific to project app").
- **The record ⋮** is the tabbed menu (see Tabbed ⋮ menu), 20.4rem wide, with
  tabs **General** and **Versions**.
  - **General** is grouped lists (`PickGroup` and `PickRow` in
    `apps/project/src/components/project/pick-rows.tsx`, Tyler's drawing
    `assets/pasted-image-1793985847218883000.png`). A small muted heading, then
    one bordered, light grey list (`divide-y overflow-hidden rounded-xl
    border bg-muted/50`; Tyler, 6 Nov 2026: "make this bg light gray", and for
    Project: "The project app settings white bg needs to be change to light
    gray too"). Rows have no ground of their own and turn `bg-muted` while
    pointed at or open. Every bordered list in a settings menu is the same
    grey: the Notifications switches and a card's own lists too. An icon tile
    inside a grey row is white (`bg-background`) so it still stands out.
    - **Each row** is `min-h-11 px-3`: the name on the left, muted; the value
      on the right; then a `ChevronRight`. An empty value is
      `text-muted-foreground/70` "None". A person's value carries their small
      avatar and "(you)".
    - **One press picks.** A row with choices is `PickMenuRow`: its list
      drops straight from the row, the current one ticked. A row with a day is
      `PickDayRow`: the quick days and month open straight away
      (`DayChoices` in `due-day-picker.tsx`), with a Clear button. A pick saves
      and closes. Never put a select or a date button inside a box that the
      row opens. Only typed values and whole cards use `PickRow`, a small box
      (20rem). Escape closes what opened and leaves the menu open.
    - **Notes a field needs** (a hand-over's note, "Date moved 3 times", a
      day-off warning) sit under the group's list (`after`).
    - **Groups here:** Person (Assigned to), Dates (Start day, Due date, Due
      by once there is a due date, Remind me), Details (Priority, Video or
      Promo, Plan).
    - **Under the groups,** the action rows as ghost buttons with icons: a
      review tick box, lock, duplicate, move, then Delete in
      red under a line of its own.
  - **Versions:** the notes' earlier versions listed in the tab, with Bring
    back (`NoteVersionsList bare`).
  - There is **no History tab**, and no text toolbar row.
- **No Add row.** Nothing sits between the body and the footer. Adding to a
  record happens in its notes, through "/" blocks (Tyler, 6 Nov 2026: "Make
  comments a block"; the Add to task row went the same day).
- **Comments are a "/" block** (`noteComments`, `CommentsDrawing` in
  `apps/project/src/components/project/notes/note-block-drawings.tsx`):
  - The block holds nothing; it draws the record's stored chat with its write
    box from the note setup (`NoteTask.comments`: `count`, `thread`,
    `placed`). One per record: picking it again only takes away the "/".
  - A drawn block calls `placed()` and its cleanup on unmount, so the panel
    knows one shows. With none showing, the panel draws the same
    `CommentsBox` under the notes once there are comments, or from the start
    when the notes are locked and take no block.
  - Files come in through the File block, which uploads, and are deleted from
    it too: its corner has Remove block and, for whoever may, Delete file
    (asks first). The project's Files tab lists every file; there is no
    separate Files box on the record.
- **Footer:** the record's state and its main actions, pinned to the bottom
  (here: status and Completed, `TaskFooter` in `task-footer.tsx`).

## Tabbed ⋮ menu (My settings and the record menu)

Reference: `TabbedMenu` and `MySettingsMenu` in
`apps/project/src/components/project/my-settings-menu.tsx`.

- **Every settings window on the screen becomes one of these**, even where
  the app's docs record an older choice of a window (Tyler, 7 Nov 2026: "the
  teams settings is not following the skill", after Team settings was kept
  as a window opened from ⋮). Only a table's row may still open the same
  settings as a window, as the Projects and Teams tables do. Reference for
  a record's settings with lists: `TeamMenu` in
  `apps/project/src/components/project/team-menu.tsx` (General, Check-ins,
  Joining; lists end with "+ Add …").
- **Trigger:** a ghost `icon` button with `EllipsisVerticalIcon`, its
  `aria-label` and shadcn tooltip naming the menu ("My settings", "Task
  menu"). Grey while open.
- **Box:** a `Popover`, `gap-0 p-0`, 22.7rem wide for My settings and 20.4rem
  for a record menu, never past the screen less 2rem.
- **Tabs:** underlined `DashboardTabs style="underline"`, starting from the
  left, 32px apart (`[&_[role=tablist]]:gap-8`), in a row `h-12 border-b px-4`.
  It opens on its first tab every time. Under the tabs, one `ScrollArea`
  capped at `min(75vh, 44rem)`.
- **Saving:** every field saves itself. There is no Save button. Closing blurs
  the field being typed in first, so its save lands.
- **Escape:** a box inside that uses Escape itself carries `data-own-escape`,
  and the menu's `onEscapeKeyDown` checks the key's own `event.target`, not
  the focused element.
- **General is grouped rows**, the same `PickGroup` and rows the record ⋮
  uses: a grey heading over a bordered list. A value with a short list of
  choices opens it straight away (`PickMenuRow`). A long list opens with a
  search box over it (`PickChoicesRow` with `ZoneChoices`), and the list
  scrolls inside its box (the height limit goes on the `ScrollArea`'s
  viewport, never its root). A typed value opens a small box with its field
  (`PickRow`). No email line at the top.
- **My settings tabs here:** General (Location: time zone, weather city; Daily
  card: sky. For employees You: job title, check-in time; Daily card: city,
  their hours), Notifications, and a tab per card the person sets up (Daily
  card).
- **Notifications tab:** a small muted heading per group, and each group's
  switches in one bordered list, a row being the name and a `Switch` on the
  right (`my-notice-switches.tsx`). Times that belong to a switch sit under it
  as pills (`h-8 rounded-full border px-3 text-sm`). An off pill is dashed.
  Switch names are short ("Daily routine"), with no explaining line under them.
  Pressing one opens its own switch and time in a small box
  (`routine-reminder-times.tsx`).
- **A card's own settings tab** (`daily-settings.tsx`):
  - **Every list's heading is the grey group heading**
    (`text-sm font-medium text-muted-foreground`), with no title or
    explaining line above the lists.
  - **Card layout:** the card's sections in one bordered list. Each row has a
    grip, the name, a muted line saying when it shows, and a `Switch` to show
    or hide it.
  - **Lists of items by group** (here, habits by part of the day): the group's
    grey heading with its setting right beside it (an hour after a small
    `ClockIcon`, in a borderless time box). Then the items in one bordered
    list. Each row has a
    grip (`GripVertical`, `text-muted-foreground/60`), its icon on a grey tile
    (`size-9 rounded-lg bg-muted`), the name with a small muted detail ("4× a
    day"), and a `⋯` (`EllipsisIcon`) with Change and Retire.
  - **Adding:** the list's last line is "+ Add …" ("Add afternoon habit" while
    the group is empty), which turns into a name box and Add. Escape puts the
    line back.
  - **Moving:** items drag within a group and into another group (one
    `DndContext`, a `useDroppable` per group list so an empty group takes a
    drop).
  - **Retired items** fold at the foot, closed by default, with no line above.
  - **Item forms** stack in a narrow box: the name on its own row, then two
    fields side by side. Never use `sm:` grid columns inside a dropdown,
    because they follow the screen, not the box.

## The "/" list

Reference: `NoteBlocksMenu` in
`apps/project/src/components/project/notes/note-blocks-menu.tsx`, copied into
Travel on 6 Nov 2026 (Tyler: "travel is missing some basic blocks. This is
project blocks").

- **Two groups,** a small grey heading each: Basic blocks, then Advanced
  blocks under one line edge to edge.
- **Basic blocks are the same in every app,** in this order: Image, Video,
  Checklist, Callout, Divider, Fold section, Web page, Links. Copy any the
  app is missing, with their save rules (`note-blocks.ts`), their views,
  `note-folds.ts` and the editor styles for the tick list, the line and a
  folded section. Checklist needs `@tiptap/extension-list` in the app.
- **Advanced blocks** are the app's own live ones: Project's Task card,
  File, Comments; Travel's Place and Map.
- **Each row is the icon and the name alone,** with no line under it (Tyler,
  6 Nov 2026: "remove the sub label").
- **Right-click** in a note opens the same list at the pointer. On a block
  itself, or with words selected, the browser's own menu stays.

## Words on screen

- No em dashes. Sentence case. Plain words: "None", "Show all 12",
  "Retire, keeping its ticks".
- Tooltips are shadcn's, never `title=`, and only where an icon alone doesn't
  say what it does.

## Measuring before calling it done

Use Playwright through `validate-app/browser.mjs`, one script per check, and
print numbers:

- At 1440, 1920 and 390 wide, every element in each changed panel and menu:
  `scrollWidth` is not more than `clientWidth`. Check text that ellipsizes
  with a `Range` width, because the rounding hides 0.1px cuts.
- Footer: the body's height, the footer's height, and whether the footer's
  viewport scrolls with all cards open and with them folded.
- Folded headings: the space above and below the title is equal.
- Dividers on a band: screenshot one 1px column through the line and read the
  pixel shades. The line must be darker than the bands on both sides.
- Menus: the tab names, each tab's content, Escape inside a box, and focus
  after the menu closes.
- A drag that saves real data is done once and undone, and the report says so.
- Light and dark, and Tab and Enter reaching every control.
- Note any pre-existing errors separately, such as the phone-width hydration
  mismatch from `three-panels.tsx`.
