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
- Plans get no table: "The plans doesnt need a full table". Plans are also a
  block: "the plans should go in top left dropdown as well as a block for
  it". Announcements started the same way ("The announcement also doesnt
  need a table. It can live in the top left 3 dots dropdown in a tab"), until
  Tyler's rule below of 9 Nov.
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

## Tyler's rules (9 Nov 2026)

- "Move the announcement from the top left settings into its own
  dashboard": Announcements is a section of its own, beside Feedback, and
  the ⋮ no longer has its tab.
- "I want to consolidate the pages, navigation and styling into the admin
  dashboard. Create a new link called "Pages" under overview and below that
  a link called "Styling. We'll pull the styling from settings here
  including platform and public styling. Also add another link called
  "Navigations" and add the platforms navigation, members navigation and
  public navigation. The right panel is where we'll adjust all the
  settings." The task is `workspace/tasks/admin-pages-styling-navigations.md`.
- Navigations, after a list with each link's settings on the right was
  tried: "that doesnt work either. It should just look and work the same as
  it was before". So it draws Settings' own editors.
- "fix the pages settings footer"; of the Navigations cards, "wire the
  background to card background setting", then "redesign the navigation
  page" with a drawing and "unwire the card to setting".

## What each panel holds

| Section | Middle | Right |
| --- | --- | --- |
| Overview | Widgets, in up to two rows, with no panel of their own | None |
| Pages | Every public page, a tab each for Your pages and System pages | The page picked: who can see it, its address, visits, Open and Edit page |
| Styling | The style groups as a grid of drawn tiles, a tab each for Platform and Public | The group picked: its sliders, pickers and preview |
| Navigations | Settings' navigation editors, a tab each for Platform, Members, each app role and Public | None |
| Users | Every account, a tab per role, with Filter (Status) | The person picked |
| Feedback | Every piece of feedback, with Filter (Type) | The thread picked, with a reply box |
| Announcements | Every announcement, with Filter (Status) | The announcement picked, changed in place, or a new one |
| Media library | Every account's files, as a list or a gallery | The file or orphan picked |

- **Left:** the Admin page, one per site, beside every section. Its header
  has the title, a **+** and the ⋮.
- **The +** (Tyler, 9 Nov 2026: "Add a + icon here with a dropdown to add
  announcements and users") opens a dropdown with New page, New
  announcement and New user. Picking one turns the dropdown into its form, and nothing moves to
  another section or opens a window ("Add new announcemtn here should be a
  dropdown instead of forwarding me to the right panel").
  - **New announcement:** title, message, kind, and where it shows (the
    banner, the tray, or both). It starts at once with no end; dates and
    showing it to visitors are set on it in Announcements
    (`new-announcement-form.tsx`).
  - **New user:** the same form as Users' Add account.
  - **New page:** the same form as Pages' New page. Creating it opens the
    page builder.
- **The ⋮** is 20.4rem wide, 10% under the menu's usual 22.7rem ("reduce
  the left panel dropdown width by 10%"), and has three tabs. General holds
  Cover photo (None, Sky, the page's pictures and +,
  `docs/shell/page-blocks.md`), then Overview's Date range (Today, 7 days,
  30 days, 90 days or Year). Plans lists every plan; a row opens its window.
  Archive is in the window. Widgets sets Overview's rows and spots.
- **The ⋮'s footers:** General ends with Lock blocks ("this should be in the
  bottom and rename it to \"Lock blocks\"") and Plans with New plan. Both
  are the menu's one footer shape: a line across the menu, then a
  full-width row with its icon ("make both footer the same ui"), with no
  shade of its own (a light grey was tried and taken off the same day). It
  stays in view when the tab's rows scroll. The CRM's ⋮ has Lock blocks the
  same way.
- **A new site's page** starts with Dashboards, then Plans.
- **Middle:** on Users, Feedback, Announcements and Media library, one header: the section's
  icon and name, then its own toolbar (Tyler, 8 Nov 2026: "Every panel needs
  an icon"). Users has role tabs there instead, All roles first, then each
  role, and no icon, since a header with tabs has none ("dashboards with
  middle header tabs does not [need] icon"). The tabs sit on the header's
  bottom line ("underline should be at the edge"). The middle has 24px at
  its left and right, the header's first icon or tab and the table's first
  column lined up ("Add more padding on left and right side for middle
  panel").
- **Table rows** in Users, Feedback, Announcements and Media library are the CRM's
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
  and anything being typed there carry on across a switch. A page or plan
  list that could not be read says so, with Try again.

## Pages

The `/admin/pages` screen until 9 Nov 2026.

- **Middle:** every public page, one row each: its name (with how many
  blocks a page built from blocks holds), Address, Who can see it and
  Visits over the last 30 days, the most visited first. The header has the
  tabs Your pages and System pages with their counts (`lib/pages/page-groups.ts`
  says which is which), the search box and New page. A row's cog opens a
  page built from blocks in the builder (Tyler, 9 Nov 2026: "in pages table
  clicking on the cog should go to the editor"); any other page's cog opens
  it on the right, as pressing the row does. A row's right-click
  has Open in a new tab, Edit page and, for a page an admin wrote, Delete
  page.
- **New page** is a dropdown form under the button: name, address,
  description and an optional picture (`new-page-form.tsx`). Creating it
  opens it in the builder, because everything on a page is built there.
- **Right:** the page picked (`page-panel.tsx`). The Page card has Who can
  see it (Everyone, Members only, Switched off; a page that is how people
  reach the app cannot be hidden, and says so), the address, visits,
  blocks, who made it and its line of description. The not-found and
  maintenance pages add What it says, their heading and message, saved as
  they are typed, with a preview; empty uses the shell's own words.
- **Its footer** has Open and, for a page built from blocks, Edit page,
  which opens the builder in this section. They sit side by side
  once the panel is 15rem wide and stack full width below that, so neither
  word is ever cut (Tyler: "fix the pages settings footer", when the
  footer also said who could see the page and pushed Edit page onto a
  second line).
- **Its ⋮:** the address and visits, Open in a new tab, and Delete page for
  a page an admin wrote, which asks first.
- **The builder opens here, as an open automation does** (Tyler, 9 Nov 2026:
  "Clicking on editing a page should not forward me to an isolated page
  editor. Look at how automation does it ... copy its patter (except the
  canvas middle is the pages drag and drop)"; `page-builder.tsx`). The left
  page stays. The middle, with no card of its own, holds Add a block, the
  kinds you can add, as a panel at the automation step list's width, then
  the page's blocks in the order a visitor reads them, dragged into order.
  The right holds the picked block's fields, or Page settings with none
  picked. There is no way back in its header: pressing Pages in the
  Dashboards block goes back to the list.
- The address is `?edit=` and the page's address beside `?open=`.
  `/admin/pages/edit?path=…` forwards there, and a page not built from
  blocks opens the list instead.

## Styling

Settings → Styling and Settings → Public → Styling until 9 Nov 2026.

- **Middle:** the tabs Platform and Public, then the side's groups as a grid
  of tiles (Tyler, 9 Nov 2026: "The styling table works better as grid with
  an image graphic mockup showing what each styling changes", then a
  drawing of the tiles, "something like this ui",
  `workspace/docs/assets/pasted-image-1794279350967868000.png`). Each tile
  is a light grey picture with faint guide lines and a small white window
  in the middle, named in a typewriter face, the part the group changes in
  the darker grey; a window's backdrop is dimmed for Modal and Cards inside
  modals (`styling-mockups.tsx`). Under it, the name and a muted line of up
  to two lines. Tiles are at least 11rem wide, as many to a row as fit, and
  the picked one lifts on a soft shadow. Platform: Spacing & borders,
  Divider lines, Dashboard tabs, Dark mode, Gutter shade, Side panels,
  Blocks, Widgets, Panel cards, Sidebar & Top navigation, Modal, Cards inside modals.
  Public: Presets, Brand, Page frame, Spacing & borders, Header & footer,
  Modal.
- **Right:** the group picked, its own words, sliders, pickers and preview,
  saved as they change with the rest of the site's settings. The panel
  draws the whole Styling screen with only that group's card showing
  (`SettingsCardOnly` in `collapsible-settings-card.tsx`), so the values two
  groups share, such as Widgets starting from Blocks, stay in one place.
- The address keeps the side (`?side=public`) and the group (`?open=`, the
  card's id).

## Navigations

Settings → Navigation, Members → Navigation, each role's Navigation and
Public → Navigation until 9 Nov 2026.

- **Two panels:** the left page, then the middle with a tab per navigation
  in its header: Platform, Members, a tab per role the app declares, and
  Public. There is no right panel.
- **The middle is Settings' own editors, unchanged** (Tyler: "It should
  just look and work the same as it was before"). Platform: Your sidebar
  (with Top left shows and Top left max items), Top left shortcuts and Your
  top right menu. Members: the member sidebar and member top right menu.
  A role: that role's sidebar. Public: Header layout with the menu and
  action items, Breadcrumbs and Public footer. Links drag into order and
  open their own windows, as they did.
- **The look** is Tyler's drawing of the same day ("redesign the navigation
  page"): white cards 16px apart with a faint edge of their own on a light
  grey,
  sections as bordered boxes with a grey heading row, switches in place of
  tick boxes, dashed "+ Add" chips and Add section, and each card's reset at
  the right of its heading. `../settings/administration-and-personalization.md`
  has the detail. The cards were tied to Panel cards' grey for a time; "unwire
  the card to setting" undid it.
- **Reset to defaults** on Your sidebar resets every setting, as Reset all to
  defaults did, keeping saved public presets.
- The address keeps the tab (`?nav=members`, `?nav=public`,
  `?nav=role-<role>`).

## Announcements

- **Middle:** one row per announcement: a dot for its status (green
  Showing, blue Scheduled, grey Ended) and its title, its Kind, where it
  shows (Banner, Tray, Visitors), Starts and Ends. Newest start first.
  Filter is Status; Search (title and message) and Select (Mass select) are
  header buttons, as on every list since 9 Nov 2026.
  Ticked rows can be retired or deleted together. A row's own ⋮ or a
  right-click has Retire now (not on an ended one) and Delete.
- **Right:** the announcement picked, written and changed in place in three
  cards: What you want to say (Title, Message, Kind), Where it shows
  (banner, tray notice, visitors) and When it shows (Starts on, Ends on).
  Its ⋮ has its status and dates, Retire now and Delete. The footer says
  its status, or "Unsaved changes", and has Save changes. Nothing goes live
  until Save is pressed, so a half-written banner never shows; this is why
  it is not saved as you type, as the CRM's emails are.
- **New announcement** in the header puts a blank one on the right, with
  Create announcement in its footer. Once created it is the row open.
- **Unsaved changes:** opening another row or a new one asks first ("Throw
  away your changes?"). Switching section or leaving the page does not ask.
- **Retire** sets the end to now on the server, and the list reads every
  announcement again to show it.
- **Live** (Tyler, 9 Nov 2026: "The announcement and tray notification
  doesnt show up until I refresh the page. Isnt it supposed to show in real
  time?"): a create, save, retire or delete sends one nudge to every open
  tab over the bell's live connection (`publishToEveryone` in
  `src/server/notifications/events.ts`). Each tab then asks for its own
  banners (`loadMyAnnouncements`), which also writes the tray notice it is
  owed, and then counts its bell. Measured: the banner and the bell's
  "1 new" showed in another tab about half a second after Create, and went
  half a second after Delete. One that starts on a later day shows within a
  minute of its start, on the bell's minute check. With live notifications
  switched off, everything waits for that minute check. Visitors' banners on
  the public site still change on their next page load.

## The Dashboards block

- **What it holds:** a row each for Overview, Pages, Styling, Navigations,
  Users, Feedback, Announcements and Media library. Overview counts the widgets it shows
  ("the overview should have a number too (number of widgets)"). Pages
  counts every public page, both tabs. Styling counts its groups, both
  tabs. Navigations counts its tabs. Users counts accounts, Feedback counts
  pieces of feedback, Announcements counts the site's announcements whatever
  their dates, and Media library counts files, each as its list counts
  them with nothing filtered.
  Names are grey and the section showing is dark, all at one weight so the
  name never jumps. Every row has a small dark bar before its name, with no
  width until the row is picked: then its width and the gap after it grow
  over 220ms on cubic-bezier(0.2, 0.8, 0.2, 1), sliding the name over, while
  the last row's bar shrinks away (Tyler, 8 Nov 2026: "animation is not
  smooth. Follow this"). The bar never shrinks to fit (`flex: none`). No row
  is shaded. Only a bar already on screen when a person presses slides. A
  bar drawn after a refresh, or picked by the page itself on arrival, snaps
  in (Tyler, 9 Nov 2026: "whenever i load a page, the black pill animation
  pushes in every time. We have to disable that", then "if it has to
  refresh then dont add animation"; `src/lib/layout/press-motion.ts`).
- **A press switches after the bar.** The row picked changes at once, and
  the section switch waits the bar's 220ms: drawing a new section keeps the
  browser busy for 100 to 185ms, and a bar growing then skipped most of its
  frames. With less motion asked for, the switch does not wait. A press on
  any block's row also stays out of the page editor, which would otherwise
  select the whole block.
- **Pressing a row** shows that section. On a phone the middle comes forward.
- **Order:** the rows in the block's ⋮ drag into a new order, and the block
  follows (Tyler, 9 Nov 2026: "I want to be able to drag and drop dashboard
  item positions"). Overview stays first. The order is the site's, saved
  with its look as `adminSectionOrder` beside `hiddenAdminSections`; a
  section it does not name keeps its own place after the named ones
  (`orderSections` in `lib/layout/styling-values.ts`). A press still shows
  or hides a row; a drag of 6px or more moves it instead. The CRM's block
  does the same, saved as `crmSectionOrder`.
- **Show and hide:** the block's ⋮ lists every section but Overview, an open eye on one that shows and an eye with a slash on one
  that is hidden (Tyler, 9 Nov 2026: "the dashboard block is missing the 3
  dot dropdown and need to add the hide/show dashboards", drawn on Trade's
  Protocols block). One press swaps it and the menu stays open. Overview is
  never hidden. The section showing keeps its row until another is picked.
  The list is the site's, saved with its look as `hiddenAdminSections` in
  Admin → Styling's values, so it works whether the page is locked or
  not. A hidden section's address still opens it.
- **Lined up with the header:** the rows start 12px in, so the bar and the
  names start where the header's and the block's icons are drawn (a 16px
  icon is drawn 2px inside its box), and the block's ⋮ has 14px at its
  right, so its dots sit under the header ⋮'s ("this should also be
  aligned", "the right padding here should be the same so its aligned").
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
  one line; the menu is as wide as its longest. It is always on
  screen (Tyler, 8 Nov 2026: "put the 3 dots icon always appear on widgets").
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
  corners, grey and edge in Admin → Styling → Widgets
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

Every list in a block or widget is drawn the same way, here and on the CRM's
page (`SideRows` in `components/shared/notes/side-rows.tsx`):

- **One line a row**, with no line between rows. The name, then a coloured
  dot and a muted line where the row has them, then its figure at the right
  in the lightest grey pill with a grey number, in every block (Tyler,
  8 Nov 2026: "its for all blocks").
- **Narrow:** the muted line gives way first, down to its dot, then the
  name. The pill always shows.
- **Plans** have dots by where they show: blue for the default plan, green
  for one on the pricing page, amber for hidden, grey for archived. After
  the dot is the plan's price, and the pill holds how many accounts are on
  it (Tyler, 9 Nov 2026: "replace all these text label with the priceing
  instead and where the pricing was put the amount of users in that plan").
  The count follows the Users list's Plan column: an account paying for a
  plan is on it, everyone else, paused included, on the default plan
  (`planMemberCounts` in `src/server/billing/plan-members.ts`). So the
  counts across every plan, archived ones too, add up to the Users count.
- **The Plans block** shows active plans only ("only show active plans.
  dont show archived plans in the block"), so its counts can add up to less
  than Users. The Admin ⋮'s Plans tab lists archived ones too, and ends with
  New plan. The block has New plan in its ⋮, above Delete block.
- **Pressed rows** shade while pointed at.
- **A list that picks** (the CRM's Stages, Segments, Follow up today and
  Waiting on you) takes the Dashboards block's look instead: grey names, the
  picked one dark with the same sliding bar before it, no shade (Tyler,
  8 Nov 2026, of the CRM's blocks: "Only the dashboard ones are the new
  ui"). A row's own ⋯ shows in its pill's place while it is pointed at.
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
  and Add account, a dropdown form under the button, not a window ("In users
  add account button, make it a dropdown instead of modal"): name, email,
  role, and an optional password. Left empty, they are emailed a link to set
  their own; typed, no email goes. Clicking away keeps what was typed except
  the password (`add-account-dropdown.tsx`). Paging and the search ask the server again in place. A
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

- **Header:** "N selected" while files are ticked (Delete), the search box,
  Select (Mass select), Filter (Type and Owner), List or Gallery and Upload.
  The storage used and its cost were taken off on 9 Nov 2026 ("remove
  this"). List and Gallery are one control with the header's light grey line
  round it, the one showing solid black ("fix this ui"). Uploads land in
  your own library whatever the Owner filter says, and Upload's tooltip says
  so.
- **Gallery tiles** show the picture and its kind (Image, Video), with no
  file name (Tyler, 9 Nov 2026: "in media library, remove the file name on
  image"). The name is the tile's label to a screen reader, and shows on the
  right once the file is open; a picture that fails to load leaves the tile
  blank rather than printing the name.
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

Moving between Admin and the CRM draws the left page, its cover and its
counts in the first frame (Tyler, 9 Nov 2026: "clicking through the
dashboards kept loading the top header and its background. It should load
instantly"). Each dashboard keeps its last read of the page in the tab's
memory (`useLoad`'s `remember`), starts from that copy and reads again
behind it. The first visit after a full page load still waits for the read
once.

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

`/admin/pages` forwards to Pages (carrying `?open=` with a page's
address), and Settings' old Navigation and Styling rows forward to
Navigations and Styling on the matching tab (since 9 Nov 2026).
`/admin/users`, `/admin/feedback`, `/admin/plans`, `/admin/announcements`,
`/admin/analytics`, `/admin/traffic`, `/admin/ai`, `/admin/ai-usage`,
`/admin/referrals` and `/admin/media` forward to Admin, to the matching
section (`/admin/announcements` to Announcements since 9 Nov 2026), carrying `?open=` for Users and Feedback, and `?owner=`, `?media=`
(as `?open=`) and `?orphan=` for the Media library, so older links land on
the same record. The four Analytics addresses land on Overview; Plans and
Referrals land on Admin's last place.
`/admin/notifications` lands on Admin and `/changelog` on the home page.

The left menu's version 23 step makes the Overview link "Admin" (keeping a
name somebody gave it) and takes out every link to a screen Admin holds or
that was removed with it. Version 24 takes the Media link out the same way,
moving any link hung under it into its place. Version 26 does the same
with the Pages link (`removePagesLink`), and a new site's sidebar no longer
has one.

## Where it lives

- Route: `src/routes/_authenticated/admin/dashboard.tsx`, address keys in
  `src/lib/admin-dashboard/admin-search.ts`, Overview's three readers in
  `src/lib/admin-dashboard/overview-figures.ts`.
- Screen: `src/components/admin-dashboard/`: the frame
  (`admin-dashboard.tsx`), the page (`admin-page-panel.tsx`), its blocks
  (`admin-blocks.tsx`), one file per section, the shell's nine widgets
  (`overview-tab.tsx`) and the file panel (`media-file-panel.tsx`).
- Shared with the CRM's Overview since 8 Nov 2026
  (`workspace/docs/crm/inbox-and-leads.md`): the Dashboards block's rows
  (`components/shared/notes/dashboards-rows.tsx`), the fixed-block rule
  (`lib/notes/fixed-block.ts`), the middle's heading and 24px gutter
  (`MiddleHeading`, `middleGutterClassName` in
  `components/shared/three-panels.tsx`), and the widgets
  (`components/shared/widgets/`: the grid, the card, the menus, the layout
  hook and the boundary round an app's own).
- Two panels: `ThreePanels` with no `right` and a `bare` middle
  (`components/shared/three-panels.tsx`).
- Page: `src/server/admin-dashboard/page.ts`, table `admin_pages`, one row
  per site. The Dashboards block's rules are in
  `src/lib/admin-dashboard/admin-page.ts`.
- Widgets: the layout rules in `src/lib/admin-dashboard/overview-widgets.ts`,
  stored by `src/server/admin-dashboard/widgets.ts` in `admin_widget_layouts`,
  one row per site and dashboard (migration 0107; the `board` column, `admin`
  or `crm`, from 0110).
- Counts: `src/server/admin-dashboard/section-counts.ts`; Pages reads the
  site whose public pages are built (`publicPagesWorkspaceId`), so its count
  matches its list.
- Pages, Styling and Navigations: `pages-tab.tsx` and `page-panel.tsx`,
  `styling-tab.tsx`, `navigation-tab.tsx` in `components/admin-dashboard/`.
  They write the site's settings through `useShellConfigPatch`
  (`components/settings/use-shell-config-patch.ts`), which always builds on
  the newest copy, so a write that lands late never undoes a newer one.
- An app's own blocks and widgets: `admin.blocks` and `admin.widgets` in its
  `src/app/options.ts` (`src/lib/admin-dashboard/admin-additions.ts`).
- Windows: `components/admin/plan-dialog.tsx`. The announcement window was
  replaced on 9 Nov 2026 by the section's right panel,
  `components/admin-dashboard/announcement-panel.tsx`, beside its list,
  `announcements-tab.tsx`.
