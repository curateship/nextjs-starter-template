---
name: admin-3-panel-design
description: "Admin - 3 panel design. Turns a chosen dashboard into the three-panel design Tyler built on Project's site admin My dashboard (6 Nov 2026): a left panel with a page under the header and a footer of folding cards, a middle list with a ⋮ toolbar menu, a right record panel with a bell, a tabbed ⋮ menu of grouped rows and an Add row above its footer, and My settings as a tabbed ⋮ dropdown. Use when Tyler asks to apply, copy or transform a dashboard into this 3 panel design, or names this skill."
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

1. **Pick the target.** Tyler names the dashboard. Read its route, its screen
   component, its left, middle and right panels, its settings menu or cog, and
   its docs in the app's `workspace/docs/`.
2. **Map it.** Write a short table: each thing the dashboard has today, and the
   slot it takes below (left page, left footer card, middle toolbar ⋮, record
   ⋮ tab, Add row, My settings tab, and so on). Anything that fits no slot is
   listed as a question, never dropped.
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

- **Header:** the record or person's avatar, name and one muted line, then
  icon buttons. Here that is Look back (graph), the inbox (tray that morphs
  into a cross, red count bubble) and **⋮ My settings** (see My settings). There is no cog and no
  pencil. Settings that used to sit behind a pencil move into My settings.
- **Banner:** a picture or drawn sky lies faintly behind the header and the
  top of the panel and fades into it (`DailySkyBanner` in `daily-card.tsx`).
  The header's bottom line goes see-through over it.
- **Page under the banner:** the only thing above the footer is a page of the
  person's own with the "/" blocks, saved 700ms after typing stops
  (`AdminPageNotes` and `PageNoteEditor` in `project-page-notes.tsx`, at the
  panel's 14px through `small`). It is stored as one column on the person's
  own prefs row, cleaned by the same rule as a project's page
  (`pageNotesSchema` in `src/lib/project/rules.ts`), and only its owner can
  save it.
- **Right-click opens the blocks** in the page, and in the record's notes on
  the right: the same "/" list, at the pointer, putting the block where the
  click was (`openAt` in `notes/use-note-blocks.ts`, the handler on
  `data-note-box` in `notes/note-editor.tsx`). With words selected, the
  browser's own menu stays, for Copy.
- **The Inbox and Look back** replace the page in place, and the footer stays.
  The page and the inbox stay mounted while hidden, so counts stay right.
- **Footer of folding cards:** fixed at the bottom of the panel, holding the
  dashboard's cards one under another (here: Pinned projects, Need your
  attention, Daily card).
  - **Layout:** the panel is a flex column. The body above takes
    `flex-[1_0_6rem]` (keeps at least 6rem for the page), or `flex-[1_0_50%]`
    while the Inbox or Look back is open. The footer is
    `relative flex min-h-0 flex-col border-t` holding one `ScrollArea`. So the
    footer takes what its cards need and only scrolls once the panel is full.
    Never cap the footer at a fixed share of the screen.
  - **Strips:** the cards sit in `grid divide-y`, one strip each, with no
    padding on the strip itself. A strip whose card draws nothing is
    `empty:hidden`, so there is no empty band and no extra line.
  - **Each card** is a `Collapsible` with `FoldHeading band icon={...}` as its
    heading (`apps/project/src/components/project/fold-heading.tsx`), and its
    body (`CollapsibleContent`) brings its own `PANEL_FOOTER_PADDING`. So a
    folded card is its band alone.
  - **FoldHeading:** the heading is the button that folds. Icon (`size-4`,
    muted) before the title, title `text-base font-semibold`, count after the
    words on a `bg-muted` patch (`rounded-md px-1.5 py-0.5 text-xs`), optional
    muted `line`, and the chevron as a ghost `icon-sm` button shown only on
    hover or focus, and always on a phone. Items are centred, so a one-line
    heading has no extra room under it. `band` gives a `bg-muted/25` band with
    `px-3.75 py-2.5`. If a band ever hides the divider, lighten the band and
    keep the line at the Divider lines strength.
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
  - a **⋮** ("More for …", tooltip naming what it holds).
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
  - under a grouping (status, priority, due date, type, tags), a drop under
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
- **Header:** the record's title on the left, then a **bell** and the **⋮**.
  - The bell is a ghost icon button for Follow: `BellIcon`, or `BellRingIcon`
    while followed, with `aria-pressed` and a tooltip ("Follow this task",
    "Following. Press to stop"). It has no words.
- **The record ⋮** is the tabbed menu (see Tabbed ⋮ menu), 20.4rem wide, with
  tabs **General** and **Versions**.
  - **General** is grouped lists (`PickGroup` and `PickRow` in
    `apps/project/src/components/project/pick-rows.tsx`, Tyler's drawing
    `assets/pasted-image-1793985847218883000.png`). A small muted heading, then
    one bordered list (`divide-y overflow-hidden rounded-xl border`).
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
      by once there is a due date, Remind me), Details (Priority, Template, the
      template's fields, Video or Promo, Plan).
    - **Under the groups,** the action rows as ghost buttons with icons: a
      review tick box, lock, duplicate, move, save as template, then Delete in
      red under a line of its own.
  - **Versions:** the notes' earlier versions listed in the tab, with Bring
    back (`NoteVersionsList bare`).
  - There is **no History tab**, and no text toolbar row.
- **Add row above the footer:** a strip just above the footer with icons and a
  word under each (here: Tags, Comment, Files, Steps, Time), `TaskAddRow`.
  - The picked one opens a titled box above the strip: a `Popover` anchored to
    the strip through `PopoverPrimitive.Anchor` from `radix-ui`, `side="top"`.
    The app's `ui/popover` has no Anchor, and it is a shell file.
  - The strip is a `@container`. Under 20rem the words hide and the icons
    stay, each named by a shadcn tooltip.
- **Footer:** the record's state and its main actions, pinned to the bottom
  (here: status, Start, Completed).

## Tabbed ⋮ menu (My settings and the record menu)

Reference: `TabbedMenu` and `MySettingsMenu` in
`apps/project/src/components/project/my-settings-menu.tsx`.

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
