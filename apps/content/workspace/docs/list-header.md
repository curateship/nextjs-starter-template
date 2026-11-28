# A list's header

Every list on a dashboard in Content has one header, built the same way
(`ListHeader` in `src/components/content-app/list-header.tsx`). It is the
shell's `CrmListHeader`, unchanged, with search, the dropdowns and Select
moved. The task is `workspace/tasks/Misc/misc.md`.

Tyler, 27 Nov 2026: "Make all the search field into icon like this", "Move all
the mass select button to here" (the project's ⋮), "This should be on the
right side after search icon (same goes for other tabs too)" (of "All items ⌄
Every kind ⌄"), "All buttons should look like this" (the outlined Select,
Filter and Views), and of where it applies: "All dashboard has it including
projects".

## Left to right

- **On the left:** the list's tabs or name. On a project's page, the arrow
  back and Content, Research and Promote.
- **The search icon**, the shell's `SearchToggle`. Pressed, it opens into the
  box. It stays open while something is typed; Escape empties and closes it.
  Typing waits 300ms before the list is asked again, as the box always did.
- **The dropdowns**, right after it: on a project's page the tab's own
  (Promote's "Reddit · Commenting"), then the list's own (a network's "Which
  list", Research's lists, Content's kind and Status).
- **Then** Filter, Views, the list's other buttons and its New button.
- **The ⋮ last.** On a project's page it is the project's ⋮
  ([projects-dashboard.md](projects-dashboard.md), "The ⋮").

## Select and Jobs are in the ⋮

- **Select** is no button of its own. On a project's page it is the first of
  the actions on the project ⋮'s General tab, above Pin, and says Hide
  select while rows are ticked. On any other dashboard it is the first row of
  the list's own ⋮ (the Projects list's "More for projects", Anti Detect
  Phones' "More for phones"). The "N selected" menu stays in the header while
  rows are ticked.
- **Jobs**, with how many run or wait, is the next action on General (Tyler,
  27 Nov 2026: "Move jobs button here"), on every network that has a Jobs
  window: Reddit, Medium, X, LinkedIn, YouTube, Instagram, TikTok and
  Threads.
- **Content's Bin** and **YouTube's description templates** are tabs of the
  project's ⋮ too ([archive.md](archive.md), `youtube/youtube-module.md`).

## Every button has a line round it

The shell's header gives every ghost button a light grey line and a white
fill. A toolbar drawn outside it, as Anti Detect's Phones, takes the same look
from `OUTLINED_TOOLBAR`. The New button stays filled.

## How a dropdown lands after the search icon

A list's own dropdown can be handed to the header as `choices`, or drawn
anywhere inside it wrapped in `HeaderChoice`, which moves it there. A network
module hands its "Which list" dropdown down with its tabs, as it always did,
so its many headers did not need rewriting. Outside a `ListHeader` it draws
where it stands.

YouTube's and Instagram's lists are the shell's `DashboardTable`, whose own
toolbar cannot be changed from Content. They draw `ListHeader` above the table
and hide its toolbar (`[&>:first-child]:hidden`), so their header is the same
57px line with the same outlined dropdowns (Tyler, 27 Nov 2026: "fix ui for
promote dashboard"). Their selection, Clear and Call off or Skip, sits where
the "N selected" menu does.

## Moving between a project's tabs

Each of Content, Research and Promote draws its own columns, so a press draws
a new header (Tyler, 27 Nov 2026: "why does cliucking on promote flashes the
page. and the overview amount kept flashing as well"). Three things keep that
from showing:

- **The header is there while the list is read.** YouTube's and Instagram's
  lists drew only "Reading this project's YouTube videos" for about 100ms,
  with no header; they draw the header first now.
- **Overview's count is remembered** (`projects-left.tsx`), so the left
  panel's Dashboards block never shows "Overview" without its number while
  the widget layout is read again.
- **The line under Content, Research or Promote slides** from where the last
  header's was to the tab pressed, as one line (`project-tabs.tsx`; how, in
  `projects-dashboard.md`).

The left panel is drawn again too, from what it last read, and measured frame
by frame it looks the same before, during and after a press.

## Narrow headers

The dropdowns cut their words short with "…" before anything is pushed off
the edge: down to 56px in a header under 768px wide, as on a phone, and 96px
otherwise.

Content's two dropdowns, the kind and Status, have an icon for each choice
(`content-kind-menu.tsx`). In a header under 768px wide they show the icon
alone: both of their words start with "All", so cut to 56px they read "A…"
and "A…" and could not be told apart. The words stay in the list that opens
and in what a screen reader says. Measured at 390 wide: each is 33px, the tab
dropdown reads Content in full, and the header is one 57px line.

## Not changed

- **The shell's own dashboards** (Admin, CRM, Automations) keep the search box
  and the Select button. They are shell files, which an app never edits; the
  change belongs in the shell (workspace-4).
- **Lists without a header of this kind** that had a search box (Carousels,
  Actors, Video's projects and exports, Reddit's comments) now have the search
  icon too.
- **LinkedIn People's Requests waiting** keeps its Mass select button: it sits
  on a section of the right panel, not on a list's header.
- **Medium, X and LinkedIn's Commenting** keep a ⋮ of their own beside the
  project's, holding Search every keyword now, ideas, the AI spend and what is
  hidden. Only Jobs moved out of it.
