# The Automations dashboard

Automations is one dashboard at `/admin/automations`, in the Admin 3 panel
design (`.agents/skills/Design/admin-3-panel-design/SKILL.md`), built like
Trade's Bots dashboard and the shell's CRM. Tyler asked for it on 9 Nov 2026:
"We have to turn the automation dashboard into the 3 panel design pattern.
The dashboard block can have: Automations, Runs and Waiting on you ... we
should have a dashboard that records all the runs as well as a dashboard that
list all the waiting on me steps." The task is
`workspace/tasks/automations-dashboard.md`.

```
              Left: page          Middle                                   Right
Automations   Dashboards block    flows table (a line opens its canvas)    none
Open flow     Dashboards block    step list | canvas: Canvas and Runs      the step picked; none until
                                  tabs first, Live, Test, Run, ⋮ last      a step is clicked
Flow's Runs   Dashboards block    this flow's runs, tests included         the run open
Template      Dashboards block    step list | canvas, "Template, <name>"   the step picked
Waiting on you Dashboards block   runs stopped at an approval step         the run, Reject and Approve
```

## Tyler's picks (9 Nov 2026)

- **Canvas in the middle.** An automation opens its canvas in the middle and
  the page stays on the left. Header tabs **Canvas** and **Runs** replace the
  old bottom Runs panel. The right panel shows only once a step is picked.
- **The step list is its own panel again** (Tyler, 9 Nov 2026: "dont put the
  add steps button in the bottom, return the left panel as it was before",
  then "where is the other left panel?"). The + Add step button by the zoom
  bar, built first, is gone: an open flow has four panels, the page, the step
  list, the canvas, and the picked step.
- **No back arrow and no title** in the canvas header ("Remove the arrow and
  title to go back"). Canvas and Runs take the title's place at the header's
  start ("Tabs move here"). In the step list's header, Hide the steps is at
  the left edge and Fav, All nodes and Templates at the right ("switch over
  the hide the steps to the left side", "tabs moves here").
- **A step card is its name, then its description on one line** cut short
  with "…" ("Remove subheader", then "return the subheader but make it
  shorter").
- **The step list's tabs are words, drawn as Settings → Styling → Dashboard
  tabs says** (pills or underlined), with icons only when the panel is under
  17rem (272px) and the words would not fit ("remove icons and wire the tabs
  styling to the setting", then "return back the icons for when theres no
  room for the tabs text").
- **A step's settings card is a panel card:** its grey, border and border
  colour come from Settings → Styling → Panel cards ("the right panel card
  should be wired to the card settings").
- **A press on the empty canvas keeps the step picked** ("when i tap on the
  canvas, it unslect the node. change that back so it doesnt"). A press on a
  connection, or Escape, still lets go of it.
- **Everything at the step list's left lines up 16px in:** the collapse
  button's icon, the group headings and each card's icon ("the items has to
  align with the collapse toggle"). Shut, the button that brings the list
  back sits 16px in at the canvas header's start ("The uncollapse icon left
  padding has to be the same as when it was uncollapsed").
- **Runs live only on each flow's Runs tab.** A Runs section of every flow
  was built first, beside the flow's own tab; Tyler found the two confusing
  ("The 2 runs panel is really confusing") and picked "Only the flow's Runs
  tab". The open run lists each step and what it did, with Delete in its ⋮.
- **A run's line starts with when and how it ended,** "Aug 11, 12:54 PM ·
  Failed", so two runs of one flow never look alike (Tyler picked "When and
  how it ended").
- **The step list stays on the Runs tab** ("clicking on the runs tab should
  not close the left panel").
- **The step list's width is a setting**, Settings → Styling → Side panels
  → Automation step list width, in pixels, 280 unless changed ("this panel
  save is inconsistent ... add a panel size setting in settings"). It opens
  at that width every time and keeps its pixels while the right panel opens
  and shuts. A drag holds while the flow is open; it is not remembered,
  because a remembered share of the middle grew and shrank with the right
  panel and came back at another width on another screen.
- **Waiting on you is a table with Approve in the footer.** Oldest deadline
  first. Columns: Flow, Who, Step waiting, Deadline. The run opens on the
  right with what Approve does, and Reject and Approve in its footer.
  Approval bell notices open the run here.

## The left panel

- **The page:** one per site (`automation_pages`, migration 0114), written on
  like every page in the design, with the shell's basic "/" blocks. Its ⋮
  holds General: Cover photo, then Lock the notes at the foot.
- **The + before the ⋮** makes an automation, as a dropdown form (Tyler,
  9 Nov 2026: "Add a + icon here to add automation (dropdown)"), from either
  section. Start from (Blank canvas or a template, which names the flow
  after itself and says what it does) and Name; a flow from a template
  starts turned off. Making it opens its canvas in the middle
  (`new-automation-dropdown.tsx`).
- **The Dashboards block:** fixed at the top of a new page, never in the "/"
  list, moved with its ⋮. Its rows are Automations and Waiting on you.
  Automations counts every flow, and Waiting on you every
  run stopped at an approval step. The counts are read again after each
  section switch and after a change.
- **Pressing Automations while a canvas is open** goes back to the table with
  the same line picked, as on Bots ("if im in the canvas, clicking the
  sidebar link here doesnt work"). `DashboardsRows` takes `onRepick` for it.
- There is no Overview, so there are no widgets.

## Automations

- **The table:** the CRM's table shape, two panels. A press on a line opens
  its canvas at once. Names are grey, dark when pointed at or picked, with
  the sliding bar before the picked one and a dot: green when live, grey when
  off. Columns: Name, Live (its switch, or "Runs by hand"), Steps, Next run,
  Updated. Every column sorts. On a narrow middle the name gives way and the
  columns after Live drop out.
- **The header:** Search, Select (Mass select), the "Delete (N)" button
  while lines are ticked, Pause all (Resume all while paused), and New
  automation, the same dropdown form as the page's +. The window with
  picture cards it opened before is gone, so a flow is made one way.
- **A line's right-click:** Mass select, Run now (a flow that can run by
  hand), Test with one person, Duplicate, Rename, then Delete automation in
  red. Run now and Test are left out while automations are paused or the
  flow has a step to fix.

## An open flow

- **Four panels on a wide screen:** the page, the step list (Fav, All nodes,
  Templates), the canvas, and the picked step's settings. The middle is drawn
  bare, with the step list and the canvas as two cards and a line between
  them to drag (`panelLayoutKey.automationSteps`). Hide the steps, at the step
  list's left edge, shuts it; Show the steps at the start of the canvas
  header, 16px in, brings it back. A narrow screen draws the canvas alone.
- **The step list:** a press on a step does not add it (Tyler, 9 Nov 2026:
  "clicking on the nodes should not be adding it automatically"). It shows
  the step's settings on the right, "Not added yet", with Add node and
  Cancel; Add node puts it in the middle of the view. The + on a card, and a
  drag onto the canvas, add it at once. Pressed from the Runs tab, the canvas
  comes back. Each card is the step's icon, its name, and one line of its
  description.
- **The header:** no back arrow and no title. The Canvas and Runs tabs first
  (Runs with its count), then on the right the live switch, the app's own status
  (`canvasHeaderStatus`), Test, Run, and the ⋮ with Rename, Duplicate, and
  Delete under a line. Automations in the Dashboards block, or the browser's
  Back, returns to the table with the same line picked.
- **Canvas:** the steps, saved 700ms after the last change, and again on
  leaving. A right-click on a step opens its menu at the pointer with Delete
  step, which asks first, as the Delete key does (Tyler, 9 Nov 2026: "enable
  right click to delete node").
- **The right panel:** the picked step's settings, with the step's star
  (favourite) and the collapse button in its header. A press on the empty
  canvas keeps the step picked and its settings open (Tyler, 9 Nov 2026:
  "when i tap on the canvas, it unslect the node. change that back so it
  doesnt"); the collapse button shuts the panel. The step is `?node=` in the
  address, so a reload keeps it.
- **Runs tab:** this flow's runs, tests included, since a flow being built is
  mostly tested. Each line is when it started and how it ended, then Who and
  Steps as the middle widens. It is the only list of runs. The run open shows on the right, the newest
  when none is picked.
- **Run and Test** save first, start the run, and switch to the Runs tab with
  that run open. The Dashboards block's counts are read again.
- **Send email's "Open email builder"** takes the middle until Back to flow.
  Its ⋮'s Runs tab lists this flow's runs, each opening in place
  (`automation-runs-panel.tsx`). The middle stays bare for as long as a flow
  is open, whatever it shows: switching the middle between bare and boxed
  started the editor over and lost an open email builder.
- **A template opens on a step** (Tyler, 9 Nov 2026: "in template, clicking
  the template auto select the first node if it doesnt remember its last
  node"): the one last picked on it in this browser, or else its first, the
  leftmost on the canvas. The step goes into the address, so a reload opens
  on the same one.
- **A template** opens the same way from the step list's Templates tab
  (`?template=<key>`), with "Template, <name>" in the header and no tabs,
  switch, Test, Run or ⋮. Its card's ⋮ still has Edit details and Reset to
  built-in.

## Waiting on you, and the open run

- **Waiting on you:** every run stopped at an approval step, the closest
  deadline first, 50 at a time with Load more. Each line is when it started
  and "Waiting for approval", then the flow, who, the step waiting and the
  deadline as the middle widens. Search looks through the flow's name and who
  the run was about.
- **The open run** (`run-record.tsx`): its status icon, the flow's name and
  who it was about; its ⋮ has Open the flow, and Delete run once it has
  finished. The body says what Approve does (while waiting), what started it,
  then each step in order with its summary, its emails and the app's own
  result, then how it ended. The footer has the status and when it started,
  and Reject and Approve while it waits. A run still going is read again
  every 3 seconds; a finished one is not.
- **A decision** sends the list round again and opens the next waiting run.

## The address

`/admin/automations?tab=automations|waiting&open=<id>`, read by
`src/lib/automations/automations-search.ts`. Each section reads only its own
keys:

- Automations: `full=1` opens the picked flow's canvas, `template=<key>` a
  template's, `pane=runs` the Runs tab, `run=<id>` the run open there,
  `node=<id>` the step picked, `q`, `sort` and `direction` the table.
- Waiting on you: `q`.

A bare `/admin/automations` goes back to the place last open in this browser
(a remembered Runs section address opens Automations);
a first visit opens Automations. The old addresses
`/admin/automations/<id>` and `/admin/automations/templates/<key>` are gone,
not forwarded, as `/admin/automations/templates` went. The saved left-menu
link was already `/admin/automations`, so no menu change was needed.

## Bell notices

An approval notice opens its run in Waiting on you; a failure notice opens it
on its flow's Runs tab, where the failed step is marked (`notification-action.ts`). A run
decided since the notice opens all the same, showing how it ended.

## For the apps

The dashboard is the shell's, so each app gets it at its next shell merge.
App code that links to the old addresses must move to the new one at that
merge: Project's `src/components/project/inbox-card.tsx`, and the old copies
of `admin-overview-dashboard.tsx`, `notifications-page.tsx` and
`activity-feed.tsx` in Video, Pomodoro and Promo.
