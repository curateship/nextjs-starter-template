# Admin

Admin is one three-panel dashboard at `/admin/dashboard` in place of the
Overview, Users, Plans, Feedback, Announcements, Analytics and Media library
screens. Tyler asked for it on 8 Nov 2026: "consolidate analytics with
everything else (except images) into a dashboard called "Admin" because its
a big dashboard, we have to remove a lot of panels we dont need". The same
day he moved its sections into a block and brought the media library in. The
tasks are `workspace/tasks/features/admin/admin.md` and
`workspace/tasks/admin-changes.md`.

## Tyler's rules (8 Nov 2026)

- The sections are a block on the left, not tabs: "we're moving the 3 tabs
  (overview, users, feedback) to the left side as a block and we add media
  library to it too. This means we remove the middle header tabs."
- The block is fixed but moves: "It can be a fixed block but I'd need to be
  able to move it too. Like if I want to put something above it I can".
- Overview is widgets: "I want to make it widget based. Widget is almost like
  blocks but with some small differences. One, it will have a different ui
  styling (we use the same styling as currant block but seprate them)".
- "all of the currant stats based blocks can be moved to widgets."
- "I want ability to customize col. For example I want top row to have 2 col
  and bottom row to have 3 col (2 row max)".
- "each individual app can add its own block and widget without having to
  modify shell". How: `docs/shell/admin-blocks-and-widgets.md`.
- No block for a handful of figures: "We dont need these 4 blocks as they are
  not important enough to have its own block."
- Plans and announcements get no table. "The plans doesnt need a full table",
  and "The announcement also doesnt need a table. It can live in the top left
  3 dots dropdown in a tab". Plans are also a block: "the plans should go in
  top left dropdown as well as a block for it".
- "Clicking on the feedback thread should open its thread on the right panel
  to see all the replies and I can also reply to it in the footer."
- "For users dashboard, clicking the user should open its user data on the
  right panel." A media file opens the same way (picked 8 Nov 2026).
- "Middle panel analytic card should be edge to edge design." This holds for
  Users, Feedback and Media library. Overview's widgets are cards.
- Overview has two panels: "Remove the right panel for overview dashboard",
  and "Take it widgets out of its overview container and move the date
  filter into general settings options".
- "Move the widgets into the right panel dropdown beside plans": the Widgets
  tab of the Admin ⋮.
- An empty spot: "This part should be clickable to add a widget right
  there". A widget's heading: "Remove the label and add a 3 vertical dots
  dropdown here to replace a widget".
- "redesign the block ui", drawn on the Plans block, and New plan "Move this
  into the dropdown".

## What each panel holds

| Section | Middle | Right |
| --- | --- | --- |
| Overview | Widgets, in up to two rows, with no panel of their own | None |
| Users | Every account, a tab per role, with Filter (Status) | The person picked |
| Feedback | Every piece of feedback, with Filter (Type) | The thread picked, with a reply box |
| Media library | Every account's files, as a list or a gallery | The file or orphan picked |

- **Left:** the Admin page, one per site, beside every section. Its ⋮ has
  four tabs. General holds Cover photo (None, Sky, the page's pictures and
  +, `docs/shell/page-blocks.md`) and Lock the notes, then Overview's
  Date range (Today, 7 days, 30 days, 90 days or Year). Announcements and
  Plans list theirs; a row opens that one's window, and each list ends with
  New announcement or New plan. Retire, Delete and Archive are in the
  windows. Widgets sets Overview's rows and spots. A new site's page starts
  with Dashboards, then Plans.
- **Middle:** on Users, Feedback and Media library, one header: the section's
  icon and name, then its own toolbar (Tyler, 8 Nov 2026: "Every panel needs
  an icon"). Users has role tabs there instead, All roles first, then each
  role, and no icon, since a header with tabs has none ("dashboards with
  middle header tabs does not [need] icon"). The tabs sit on the header's
  bottom line ("underline should be at the edge"). The middle has 24px at
  its left and right, the header's first icon or tab and the table's first
  column lined up ("Add more padding on left and right side for middle
  panel").
- **Table rows** in Users, Feedback and Media library are the CRM's
  (`workspace/docs/crm/inbox-and-leads.md`): grey names, black while pointed
  at and while open, and a small bar that grows in before the open row's
  name, the record opening once it has.
- **A shut side panel** comes back from a button in the middle's header,
  PanelLeftDashed first and PanelRightDashed last, in place of the knob on
  the middle's edge ("Put the uncollapse icon here ... and remove this
  knob"). Overview has no middle panel and keeps the knob. Overview has no middle panel and no header:
  its widgets sit straight on the dashboard beside the left panel and take
  the right panel's room too. Its widths are remembered apart from the
  three-panel sections'.
- Every Filter dropdown here is 240px wide ("filter dropdown is too wide").

The left panel stays put while the section changes: only the middle and
  the record on the right belong to the section, so the left page, its ⋮
  and anything being typed there carry on across a switch. A page, plan or
  announcement list that could not be read says so, with Try again.

## The Dashboards block

- **What it holds:** a row each for Overview, Users, Feedback and Media
  library. Overview counts the widgets it shows ("the overview should have a
  number too (number of widgets)"). Users counts accounts, Feedback counts
  pieces of feedback and Media library counts files, each as its list counts
  them with nothing filtered.
  Names are grey and the section showing is dark, all at one weight so the
  name never jumps. Every row has a small dark bar before its name, with no
  width until the row is picked: then its width and the gap after it grow
  over 220ms on cubic-bezier(0.2, 0.8, 0.2, 1), sliding the name over, while
  the last row's bar shrinks away (Tyler, 8 Nov 2026: "animation is not
  smooth. Follow this"). The bar never shrinks to fit (`flex: none`). No row
  is shaded.
- **A press switches after the bar.** The row picked changes at once, and
  the section switch waits the bar's 220ms: drawing a new section keeps the
  browser busy for 100 to 185ms, and a bar growing then skipped most of its
  frames. With less motion asked for, the switch does not wait. A press on
  any block's row also stays out of the page editor, which would otherwise
  select the whole block.
- **Pressing a row** shows that section. On a phone the middle comes forward.
- **It is fixed.** The "/" list never offers it, and the page editor refuses
  any change that takes it off: Backspace, Delete, cut, or select all and
  type. A paste never makes a second one.
- **It moves.** Its ⋮ has Move up and Move down, each offered only when there
  is a line or block on that side, in place of Delete block. Words and blocks
  can also go above it like anywhere else on the page.
- **The server keeps it there.** A page saved without it, such as one saved
  before it existed, gets it back at the top when read or saved. A second
  copy is dropped.
- A locked page still switches sections; only the moves go.

## Overview's widgets

- **The widgets:** Views per day, Daily AI spend, By person, Top pages,
  Devices, Top referrers, By feature, By model and By meter, then any the app
  adds. Each counts the Date range picked in the Admin ⋮'s General tab. The
  two charts' More details tabs went, because their lists are widgets of
  their own now.
- **Where they sit:** two rows at most. The top row has 1 to 4 columns. The
  bottom row has None (one row only) or 1 to 4. Each column is a spot holding
  one widget or nothing.
- **A site starts with** Views per day and Daily AI spend on top, then Top
  pages, By feature and By person under them.
- **The Widgets tab of the Admin ⋮**, after Plans: Rows sets each row's
  columns, and under it each row lists its spots, each picking a widget or
  Empty. It works from every section.
- **A widget's own ⋮**, at the right of its heading, lists every widget to
  swap in, this one ticked and any already shown elsewhere marked "Moves
  here", then Remove widget, which leaves the spot empty. Each row stays on
  one line; the menu is as wide as its longest. It shows while the
  widget's heading is pointed at, and always on a phone.
- **An empty spot** reads "Add a widget". Pressing it opens the same list,
  and the pick goes right there.
- **Saving:** a change shows at once and saves for the whole site, so every
  admin sees the same layout. Changes are written one after another, so two
  quick ones land in order. A failed save says so and puts back the layout
  last stored.
- **A widget shows once.** Placing it in a second spot empties the first.
  Fewer columns take away the last spots and the widgets in them. More columns
  add empty spots.
- **The look:** a widget is its own card (`widget-card.tsx`), with its own
  corners, grey and edge in Settings → Styling → Widgets
  (`workspace/docs/settings/block-styling.md`), following the blocks' until
  set. It is drawn like a page block: the grey box, the heading band with its icon, title,
  count and ⋮, and a white tile 3px inside. It has no fold. Being its own
  component, its look can change without touching blocks.
- **Height:** when wide, the rows share the height, so the whole of Overview
  fits with no page scroll, and a long list scrolls inside its own card.
  Narrow, or on a phone, the widgets stack at their own height and Overview
  scrolls. A phone shows two pills, Overview and Page.
- **By person:** each person's AI spend, AI calls, AI allowance this month,
  metered units and last use, sorted by any column's heading, columns dropping
  as the card narrows. A name opens that person in Users.
- **The "/" blocks:** the page offers Plans and any the app adds. The six
  figure blocks of 8 Nov (Top pages, Devices, Top referrers, By feature, By
  model, By meter) became widgets, so a page that still held one loses it the
  next time it is read. The Notes page that stood on Overview's right went
  with its panel, its stored rows too (migration 0108).

## How the lists look

Every list in a block or widget is drawn the same way (`SideRows` in
`admin-parts.tsx`):

- **One line a row**, with no line between rows. The name, then a coloured
  dot and a muted line where the row has them, then its figure at the right
  in the lightest grey pill with a grey number, in every block (Tyler,
  8 Nov 2026: "its for all blocks").
- **Narrow:** the muted line gives way first, down to its dot, then the
  name. The pill always shows.
- **Plans** have dots by where they show: blue for the default plan, green
  for one on the pricing page, amber for hidden, grey for archived.
- **The Plans block** has New plan in its ⋮, above Delete block. The Admin
  ⋮'s Plans tab still ends with New plan.
- **Pressed rows** shade while pointed at. The Dashboards block is drawn its
  own way, as above.
- **Headings:** a block's and a widget's heading are as tall as the panel's
  header, 57px (Tyler, 8 Nov 2026: "Make the block header the same height as
  the panel's header"), so Overview's top row of headings lines up with the
  left panel's. Their titles are dark grey ("blocks header should be dark
  gray").

## Users

- **Columns:** Name is only as wide as it needs, and Email takes the rest,
  right-aligned so each address sits beside Role (Tyler, 8 Nov 2026: "there
  is a lot more space for the email to show more", then "align email to
  right"). Status and Plan chips are grey; only an admin's Role chip is dark
  ("the status col and these are not gray").
- **List:** every account, with the role tabs, search, Filter (Status, which
  includes Locked out), Mass select for deleting or restoring the ticked rows,
  and Add account. Paging and the search ask the server again in place. A
  right-click on a row offers View as member, Restore and Delete; your own
  account has no Delete anywhere.
- **The person on the right:** pressing a row opens them; with nothing open,
  the first row shows. The body holds Profile, Security reports (only when
  there are any), Plan, Storage (with "Open their files", which opens the
  Media library filtered to them) and Billing history, as folding cards.
- **The person's ⋮:** Access (Role, Status), Plan (Granted plan, Ends on, AI
  allowance) and Member tags, then Pause or Start their plan again, Cancel
  their paid plan, View as member, Restore, and Delete in red. Each field
  saves when it is picked or left, with no Save button, and role, status and
  plan changes email the person as they always did.

## Feedback

- **List:** every piece of feedback, with search, Filter (Type), Mass select
  for deleting, and New feedback, which opens the shell's feedback window.
  The route reads the whole board once; search, sort and paging then run on
  that copy, and a new piece sent from the feedback window reads it again.
- **The thread on the right:** pressing a row opens it; with nothing open,
  the first row shows. It holds the message, its tags and screenshot, then
  every reply oldest first. A reply its writer or an admin may delete has a
  bin.
- **The thread's ⋮:** Feedback settings and Merge open their windows; Delete
  asks first.
- **The reply box** sits in the panel's footer. Enter sends and Shift+Enter
  starts a new line. Sending notifies the author, unless you are the author,
  and the row's Replies count goes up at once.

## Media library

- **Header:** "N selected" while files are ticked (Delete), the storage used
  and its cost once the middle is wide enough, Filter (Type and Owner), List
  or Gallery, Upload, and the ⋮ with Search and Mass select. Uploads land in
  your own library whatever the Owner filter says, and Upload's tooltip says
  so.
- **Orphans** are choices in Type: Orphaned files, No record in DB, and
  Missing in storage. Picking one scans the bucket once. While they show, the
  ⋮ also has Scan storage again and Delete all, which clears only the orphans
  listed.
- **The file on the right:** pressing a file opens it; with nothing open, the
  first file shows. It holds the picture or video, then Details: owner, type,
  size, when it was added, its alt text and where it is stored.
- **The file's ⋮:** Alt text (Description for a video), saved when the box is
  left, and only on your own files, since it saves through the owner's own
  endpoint. Then Delete file, which asks first. A logo already sent in email
  cannot be deleted, and says why.
- **An orphan on the right** shows its picture if it has one, what is wrong,
  and its details. Its ⋮ holds Delete orphan. With orphans listed and none
  picked, the first shows.
- Whose files show is `?owner=`, the file open `?open=` and the orphan open
  `?orphan=`. The search, type, sort and page stay in the browser.

## Arriving and the address

Opened at its bare address, Admin goes back to the section, range and record
it last had in this browser. A section picked starts the address again with
only the range kept, so a search on Users never filters Feedback. On a phone
the list stays in front when a record opens by itself on arrival; pressing a
row brings the record forward.

## How the range counts

Every range is whole days in UTC, today included: 7 days is today and the six
before it, and Today is since midnight UTC (`lib/analytics/range.ts`).

Two figures do not follow the range, and say so:

- **AI allowance, this month.** By person's allowance column is the calendar
  month's spend against the member's monthly allowance, whatever the range,
  because the allowance resets each month.
- **Stripe reports to review.** By meter counts every usage report still
  pending or failed, whatever its date, because a report stuck since last
  month still needs looking at.

Usage rows are never pruned, so a Year of AI and metered usage can show.
Traffic keeps its daily totals after the detailed visits are removed, so a
Year shows there too.

## The old addresses

`/admin/users`, `/admin/feedback`, `/admin/plans`, `/admin/announcements`,
`/admin/analytics`, `/admin/traffic`, `/admin/ai`, `/admin/ai-usage`,
`/admin/referrals` and `/admin/media` forward to Admin, to the matching
section, carrying `?open=` for Users and Feedback, and `?owner=`, `?media=`
(as `?open=`) and `?orphan=` for the Media library, so older links land on
the same record. The four Analytics addresses land on Overview; Plans,
Announcements and Referrals land on Admin's last place.
`/admin/notifications` lands on Admin and `/changelog` on the home page.

The left menu's version 23 step makes the Overview link "Admin" (keeping a
name somebody gave it) and takes out every link to a screen Admin holds or
that was removed with it. Version 24 takes the Media link out the same way,
moving any link hung under it into its place.

## Where it lives

- Route: `src/routes/_authenticated/admin/dashboard.tsx`, address keys in
  `src/lib/admin-dashboard/admin-search.ts`, Overview's three readers in
  `src/lib/admin-dashboard/overview-figures.ts`.
- Screen: `src/components/admin-dashboard/`: the frame
  (`admin-dashboard.tsx`), the page (`admin-page-panel.tsx`), its blocks
  (`admin-blocks.tsx`), one file per section, the widgets (`overview-tab.tsx`,
  `widget-card.tsx`, `widget-menus.tsx`, `use-widget-layout.ts`) and the file
  panel (`media-file-panel.tsx`).
- Two panels: `ThreePanels` with no `right` and a `bare` middle
  (`components/shared/three-panels.tsx`).
- Page: `src/server/admin-dashboard/page.ts`, table `admin_pages`, one row
  per site. The Dashboards block's rules are in
  `src/lib/admin-dashboard/admin-page.ts`.
- Widgets: the layout rules in `src/lib/admin-dashboard/overview-widgets.ts`,
  stored by `src/server/admin-dashboard/widgets.ts` in `admin_widget_layouts`,
  one row per site (migration 0107).
- Counts: `src/server/admin-dashboard/section-counts.ts`.
- An app's own blocks and widgets: `admin.blocks` and `admin.widgets` in its
  `src/app/options.ts` (`src/lib/admin-dashboard/admin-additions.ts`).
- Windows: `components/admin/plan-dialog.tsx` and
  `components/admin/announcement-dialog.tsx`.
