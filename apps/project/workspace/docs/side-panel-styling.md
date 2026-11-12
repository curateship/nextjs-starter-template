# Side panels and Settings → Styling

Project's four three-panel dashboards follow Admin → Styling's panel settings
the same way the shell's dashboards (Admin, the CRM, Automations) do. Those
four are the site admin's My dashboard, an employee's My dashboard, a
project's page and the Team dashboard. Tyler asked for it on 11 Nov 2026: "my
dashboard and project dashboardd left and right panel is not fully wired in
the styling settings".

The settings themselves are described once, for every app, in the shell's
`workspace/docs/settings/block-styling.md` and `side-panel-widths.md`. This
file says how Project's own panels pick them up.

- **Side panels widths:** the left and right panels open at Left panel width
  and Right panel width, 10% and 12% unless changed. Neither drags narrower
  than that. Project's own frame (`src/components/project/three-panels.tsx`)
  reads them as the shell's `ThreePanels` does. Before this it opened both
  sides at a fixed 16%.
- **Reset panels:** each Project dashboard keeps its dragged widths under its
  key in `src/lib/project/panel-keys.ts` with the two widths added
  (`project-my-dashboard-horizontal-3:10-12`). So a changed setting reaches
  every browser, and Reset panels forgets Project's widths along with the
  shell's.
- **Panel spacing:** the side panels use the shell's `PANEL_GUTTER`
  (`src/lib/layout/panel-gutter.ts`); Project's own copy is gone. That means
  15px at a panel's sides and bottom, the first card
  straight under the header, and no space between one card and the next.
- **Advanced blocks reach the panel's edges:** each panel body carries
  `--panel-gutter`, and Project's own live blocks sit in
  `ADVANCED_BLOCK_FRAME` (`notes/note-block-drawings.tsx`), which reads it.
  Those blocks are Projects, Daily card, Rating calendar and trend, Inbox,
  Look back, the five team blocks and Milestones. A locked page, drawn read
  only, reaches the edges the same way (`ADVANCED_READER_FRAME` in
  `notes/note-reader.tsx`); until 11 Nov 2026 its blocks sat 15px in while
  locked (Tyler: "it changes depending on lock or unlock thats why"). Image, Callout, Checklist and the other basic
  blocks keep the 15px.
- **Panel cards → Opacity:** each side panel's body is marked
  `data-side-panel-body`. So the first block on the site admin's page, on a
  project's page and on a team's page lets the cover show through it at the
  Opacity set.
- **Panel cards on the right:** an open task's notices are drawn as shell
  panel cards (`PanelNotice`, `src/components/project/panel-notice.tsx`).
  Every Panel cards setting reaches them: corners, grey, tile, border,
  shadow, reaching the panel's edges, and Opacity when one is first. The
  notices are "… handed you this task", "Waiting for review", "Asked for
  …", Move to project, Ask for more time and Remind me. Move to project
  stacks its picker over its buttons, because the right panel is narrow at
  any screen size.
- **Opacity on a page read, not written:** a locked page, or one the reader
  can't change, is not drawn in an editor, so the shell's rule misses it.
  `PAGE_BLOCK_STYLES` in `project-page-notes.tsx` gives its first block the
  same rule. An employee's Daily card has no card box, only its words on the
  sky, so Opacity has nothing to change there.

## The rest of the shell's three-panel behaviour

Tyler, 11 Nov 2026: "I dont want to have to list everything. Check shell and
fill in missing features." These match the shell's dashboards now.

- **Folding slides:** a side panel folds and opens over 240ms rather than
  snapping (`usePanelFold` in Project's frame).
- **Blocks sit flush:** two blocks in a row on a page sit one straight under
  the other ([Notes and the "/" blocks](notes-and-blocks.md)).
- **The ⋮ menus are the shell's** `TabbedMenu`: Lock blocks sits in the
  General tab's footer on My dashboard, a team's page and a project's page,
  and the left panels' menus are 20.4rem wide.
- **The Inbox card's tabs** follow Settings → Styling → Dashboard tabs
  (`DashboardTabs`).
- **On a phone,** a task opened by itself on arrival is forgotten once
  another is opened (`use-remembered-task.ts`). So pressing it again later
  shows it instead of staying on the list.

Still different from the shell:

- **Coming back to where you were:** the shell restores a dashboard's whole
  address (filters, sort, the open record), per person and per site.
  Project restores only the open task. Matching it means a shell change or
  renaming `?task=` across Project, notice links included.
- **Delete block on a locked page:** the shell asks, then unlocks and
  deletes. Project's locked pages show no ⋮ on their blocks.
