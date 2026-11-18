# The Projects dashboard

A project is one thing being promoted. It holds a description of what you make,
the networks it is promoted on, the accounts that post and comment for it, and
the keywords that find other people's posts for them. There are two screens:

- **The Projects dashboard** at `/admin/projects`, reached from **Projects** in
  the left menu: one three-panel dashboard whose sections are Overview,
  Projects, Voices, Accounts, Archive and Messages. Tyler, 12 Nov 2026: "We
  need to consolidate projects, voices, accounts, archive and messages into
  one cohesive 3 panel design." It is described under
  [The dashboard](#the-dashboard) below.
- **A project's own page** at `/admin/projects/<project id>`, opened from a
  project's Open project, puts its description and networks on the left, each
  network a card with a Posts row and a Commenting row, and the picked row's
  panels beside them. It replaced the Reddit dashboard on 12 Oct 2026. How a
  network fills it is in [Networks as modules](network-modules.md), and its
  Commenting row in [Commenting inside a project](commenting.md).

Tyler, 12 Oct 2026: "Build a new dashobard (3 col) for "Projects" this is where
we combine everything together to manage a project. Left panel holds project
discription, under it shows all the accounts under this project. Clicking on the
account opens up in the middle panel to search for keywords and showing all the
posts and the right col shows the post and comment box"

## Tyler's rules

- **Projects replaces the Reddit dashboard.** The Reddit entry in the left menu
  is gone, and so is `/admin/reddit` since 13 Nov 2026
  ([Old addresses](old-addresses.md)).
- **Keywords belong to the project.** Every account in the project sees the same
  keywords and posts. Clicking an account only changes who comments.
- **An account belongs to one project only.**
- **The AI is told the project description.** It replaces the voice's "what you
  make" box. The voice keeps only how it sounds and its comment rules.

14 Oct 2026, in [Networks as modules](network-modules.md):

- **Project first.** "social networks are modules so that means we don't have
  reddit on its own route that sit in the sidebar."
- **Reddit's screens fold into its module.** "Today and comments can be part of
  the views tabs. Accounts can be a dropdown in the right panel to select
  accounts to use. Jobs can be a button in middle header panel that opens up a
  modal"
- **Comments is not a left menu screen.** "Why would reddit comments be on the
  sidebar?" Still true: commenting is a row inside the project.

5 Nov 2026, in [Commenting inside a project](commenting.md):

- **A project's dashboard shows your own posts.** "Every middle panel clicking
  from the left panel should show my own posts but reddit, medium, x and
  linkedin are showing search to comments. We either need to move the
  commenting to another dashboard or put it somewhere thats more seperate from
  my post content."
- **Commenting lives inside its project.** "I think its better that commenting
  lives within its project. Make each network have its own card and inside
  that cade have 2 rows, one for posts and one for commenting", then "cards
  should be collapsible" and "use ui standard card".

## The dashboard

Built as the Admin dashboard, the CRM and Travel's Trips dashboard are, from
the "Admin - 3 panel design" skill, with the shell's pieces imported and never
edited. Tyler's answers of 12 Nov 2026 are in
`workspace/tasks/Projects/projects-dashboard.md`.

### Tyler's answers

- **Sections:** Overview of widgets first, then Projects, Voices, Accounts,
  Archive, Messages. Overview has no right panel.
- **Widgets:** Posts that need you, Messages waiting, Accounts by status,
  Bans in the last 30 days and Archive room.
- **One project:** a Projects block on the left page narrows whichever
  section is open to one project. With none picked, every project's rows
  show.
- **A project's row:** the project's summary opens on the right, with Open
  project at its foot leading to the project's own page. Since the same day
  a press on the row goes straight to the project's page, and the summary
  opens from the eye in the row's actions column.

### The left panel

- **The page** is each person's own, under a cover, written on like any page
  of "/" blocks and saved 700ms after typing stops. Its ⋮ holds General (Cover
  photo, and Lock the notes at its foot) and Widgets, Overview's rows and
  spots. It is stored in `promo_projects_pages`, one row per person
  (`drizzle/0157_promo_projects_dashboard.sql`).
- **The Dashboards block** lists the six sections with a count each:
  Overview's widgets, the projects, the voices, the accounts in use, the
  Archive's items and the open conversations. The block is fixed: it is never
  in the "/" list, the page can't lose it, and its ⋮ moves it up or down and
  hides or reorders every section but Overview, kept per person.
- **The Projects block** lists every project, pinned ones first, with how many
  of the open section's rows are that project's (its accounts on Projects).
  Pressing one narrows Overview, Accounts, Archive and Messages to it, and
  Projects to its own row; pressing it again lets it go. It is `?project=` in
  the address. Voices belong to no project, so on Voices its rows have no
  count and nothing narrows.
- **The first block follows Panel cards → Opacity** in Settings → Styling,
  as every side panel's does: at 0 it is clear and the cover shows through
  (Tyler, 12 Nov 2026: "the opacity is not connected to the setting"). The
  page's body carries the shell's `data-side-panel-body` mark, which is what
  the setting reaches.

### The sections

Every section has one header: its name or tabs, a search box, Select, Filter
where there is something to filter, and its New button. A row opens on the
right, and its right-click menu holds Mass select and the row's actions. The
right panel is never empty: a section opens its first row on arrival, and the
dashboard goes back to the section and row it was on.

- **Overview:** the widgets in the shell's grid, laid out per person.
  Posts that need you lists failed posts and unsent drafts by project and
  network, each opening that network on the project's page. Messages waiting
  opens the conversation in Messages. Accounts by status opens Accounts
  filtered to that status. Bans opens the Anti Detect dashboard's Bans for the project and
  the last 30 days. Archive room opens the project's Archive.
- **Results**, a sixth widget Tyler picked on 18 Nov 2026 (part 4 of
  `workspace/tasks/New features/new-features-18-nov.md`), is added from
  Manage widgets; a layout saved before it keeps its five. One row per project
  and network: what went out in the period ("12 sent"), then its upvotes,
  claps, likes or reactions and its replies, as each network's last daily read
  counted them. Comments on other people's posts and posts of your own count
  together; failed, waiting and deleted ones never count. The period is Last 7
  days or Last 30 days, picked in the widget's ⋮, 7 on every new visit. A row
  opens that network on the project's page. It is per project and network,
  never per keyword (Tyler declined "which keywords pay off" on 12 Oct 2026)
  and never per account (the Reddit accounts dashboard's own task). A Reddit
  comment belongs to the project whose keyword or thread found its post, so a
  help-only post's comment is left out. Reddit posts of your own count as sent
  with their upvotes and comments once Promo reads them
  (`src/server/social/results.ts`).
- **Projects:** each project's name, accounts, Posts and Last post, pinned
  first, with "3 banned" when a counted ban hit its accounts in the last 30
  days. Posts counts its own posts that went out on every network and Last
  post says when the newest did; a failed or deleted post does not count
  (`readProjectPosts` in `src/server/social/post-counts.ts`). New project asks
  for a name and the networks it uses. Pressing a row, or its name, opens
  the project's own page (Tyler, 12 Nov 2026: "clicking on the name goes
  straight to project"). Its actions column has an eye, which shows the
  project's summary on the right, and a bin, which deletes it after asking.
  The right panel is the project's summary: its picture and description, each network with "2 need you" or
  "1 to answer", its Archive's items and the bans line. Its ⋮ holds Pin,
  Pause this project and Delete; Open project is at its foot.
- **Voices, Accounts, Archive and Messages** are described in their own docs:
  [Voices](voices-dashboard.md), [Accounts](reddit/accounts-dashboard.md),
  [the Archive](archive.md) and [Messages](messages-dashboard.md).

### Deleting a project

Delete, from a row's right-click menu, the selected rows or the project's ⋮,
asks first, then deletes the empty projects and keeps any that still hold
accounts or keywords, saying what each one holds.

### Addresses

- **The address holds the place:** `?section=` (none is Projects), `?project=`,
  `?open=` and each section's filters, read by
  `src/lib/social/projects-dashboard-search.ts`.
- **The old addresses are gone** since 13 Nov 2026: `/admin/voices`,
  `/admin/accounts`, `/admin/reddit-accounts`, `/admin/messages` and
  `/admin/archive`. Bell notices that held them now hold the section's
  address ([Old addresses](old-addresses.md)).
- **The left menu** has Projects alone. Migration 0157 took Voices, Accounts,
  Archive and Messages out of every saved left menu.

### Where the code is

The frame is `src/components/social/projects-dashboard/projects-dashboard.tsx`,
with the left page in `projects-page-panel.tsx`, its blocks in
`projects-blocks.tsx`, Overview in `projects-overview.tsx` and one file per
section beside them. The records on the right are `account-record.tsx`,
`voice-record.tsx`, the Archive's `archive-item-panel.tsx`, and the project
summary (grey cards: What it makes, Networks, Archive, as the shell's
records are) and conversation inside their sections. The page's server is
`src/server/social/projects-dashboard.ts`. The Dashboards and Projects blocks and the left
page panel are drawn by `src/components/dashboard-page/`, which [the Anti
Detect dashboard](anti-detect-dashboard.md) shares; `projects-blocks.tsx` and
`projects-page-panel.tsx` only name the Projects dashboard's sections, blocks
and endpoints.

## A project's own page

Since 12 Nov 2026 the project's own page is in the same three-panel design as
the dashboard (Tyler: "the project page itsel is not updated to the new
design"; `workspace/tasks/Projects/project-page-design.md`). His answers:
"Description page + Networks block", "Collapse, back, name, bans, ⋮",
"Everything, in one task, in parts" (frame, left panel and Reddit first, then
Medium, X, LinkedIn, Instagram and TikTok, the Archive), and New post "Stays
in the right panel".

### The frame

- **The sides** open at the widths in Settings → Styling → Side panels and
  drag no narrower, slide shut from the collapse button at their header's
  edge or a double-click on blank space, and come back from the reopen
  buttons in the middle's header (a knob on the middle's edge for a network
  whose header has none yet). Widths are remembered in this browser
  (`promo-projects-workspace-2`, with the two widths added).
- **It is Project's own frame**, not the shell's `ThreePanels`
  (`src/components/social/projects/project-columns.tsx`): a guest from
  Project opens this page outside the signed-in area, where the shell's frame
  cannot read where it was.
- **Under 1280px** one panel shows at a time behind the pill row: the picked
  network or Archive, Project, and Open. A post pressed, or New post, shows
  Open; one that opened by itself waits behind it.

### The left panel

- **The header:** the collapse button, the name (cut short with "…",
  all of it on hover), Paused while there is room, and the ⋮. The pin and
  the + for adding a network moved into the ⋮. The red bans mark is gone from
  it (Tyler, 12 Nov 2026: "remove this"); the dashboard's Projects row and
  Overview's Bans widget still say how many accounts were banned.
- **The arrow back** to the Projects dashboard, with this project's row open,
  starts the middle's header, before its tabs (Tyler, 12 Nov 2026: "put the
  arrow back again", pointing there). A guest has none.
- **The cover** lies faintly behind the header and the top of the panel,
  fading into it: a picture, or the drawn sky that follows the time of day.
  None, no cover. It is the shell's `PageCover`. The right panel carries it
  on behind its header, the sky without its sun and moon, whichever network
  or record is open (Tyler, 12 Nov 2026: "the right panel is missing the bg
  thats connect to the left panel"). The first block, Networks, follows Panel
  cards → Opacity, as on the dashboard.
- **The ⋮** is the tabbed menu. **General:** Name, a row that opens its
  field and saves itself, and **Cover photo**, the shell's row every page has
  (Tyler, 12 Nov 2026: "the picture is missing the 3 selection standard"):
  None, Sky, each picture the project has had (up to 8, each with an ×), and +
  to add one from the media library, saving the moment one is picked; Pin; Pause this project (or Resume);
  Lock description (or Unlock); New project; Duplicate; and Delete project
  in red under a line. Under Name sits **AI spend cap** (below). **Networks:** each network the project uses with Pause (or Resume)
  for that network alone and Take off, which the server refuses while the
  project still holds that network's accounts or keywords; then the networks
  it does not use yet, each a row to add it.
- **The page** is the description, written in place in the "/" editor, with
  the fixed **Networks** block at its top. "/" blocks can go under it. It
  saves 700ms after the last letter and when it is left, with Saving… and
  Saved in the page header. Empty, it reads "Describe what you make. The AI is
  told this."
- **A stale copy can't write over it.** Each save says which page it
  started from, and the server refuses one whose start is no longer what is
  stored, saying to reload: a tab left open while the description changed
  elsewhere, or a guest and the owner writing at once (12 Nov 2026, after an
  old tab twice saved an empty page in development).
- **Saves go one at a time,** each waiting for the one before, so a save
  sent while the last is still on its way is not taken for a stale copy.
- **A page is never emptied unasked.** A save that would take away every
  word is sent only after the person typed, cut, pasted or dropped something
  in the page since it opened. On 12 Nov 2026 a tab being left sent an empty
  page four times without anyone emptying it, and the cause was not found;
  deleting the words by hand still saves.
- **What the AI is told** is the page's words alone, a line per paragraph,
  heading or list item; never a block, and never words inside a block such
  as a Callout or a Checklist (`projectDescriptionText`). Those words hold up
  to 4,000 letters; a longer page is refused with its length, never cut
  short. The saved page is capped at 64,000 characters too.
- **Saved descriptions:** `promo_projects.description` holds the page as the
  "/" editor's document since 12 Nov 2026. A description saved before then,
  words and formatting only, reads the same, with the Networks block added
  above it (`projectDescriptionPage` in
  `src/lib/social/project-description.ts`).
- **The Networks block** is one list in the block's white tile. Each
  network with both a Posts and a Commenting row (Reddit, Medium, X,
  LinkedIn) is a toggle (Tyler, 12 Nov 2026: "each network its a toggle", then
  his drawing, "style it like this"): its mark and its name in dark, with an
  arrow at the end pointing down while open and right while shut, its rows
  hanging from a thin line under the mark, grey and regular until picked,
  then dark and bold with the bar;
  pressing it folds its rows away and back, each project remembering its own
  folds in this browser, and folded, its name carries its Posts count in a pill.
  The picked network opens by itself. Under it, indented to line up with the
  name, its **Posts** row with how many need you (failed posts and drafts,
  `readPostCounts`) and its **Commenting** row, with no count since
  14 Nov 2026, and Paused after its name while its commenting is paused. Pause
  commenting is in that network's keywords dropdown
  ([Pause commenting](commenting.md#pause-commenting)).
- **A network with Posts alone** (Instagram, TikTok) is one line with no
  arrow and no rows under it, and pressing it opens its posts (Tyler,
  14 Nov 2026: "Only the network that have both post and commenting link
  should have the toggle, if not then just link the network straight to its
  posts"). Its pill is the posts that need you.
- **The picked row or line has the sliding bar.** Each network draws the
  project's columns afresh, so a press on another network brings a new
  Networks block. A row drawn within 1.5 seconds of its own press starts its
  bar empty and grows it over 220ms, as the shell's slide does (Tyler,
  14 Nov 2026: "the pill is missing the sliding animation";
  `useSlideIn` in `project-networks-block.tsx`).
- **The block's ⋮ lists every network**, each with a grip and an eye, above
  Move up and Move down (Tyler, 14 Nov 2026: "i should be able to hide and
  drag and drop networks here"). Dragging a network by its row reorders the
  block. Pressing a row hides that network from the block, or shows it
  again, and the menu stays open for the next press. A hidden network stays
  on the project and keeps running: its posts, comments and readings go on,
  and only its line is left out. While picked, a hidden network still shows
  its line. With no network named in the address, the project opens on the
  first network the block shows. A guest has no ⋮ rows. The order is the
  project's `networks` list and the hidden ones are `hidden_networks`, added
  by `drizzle/0161_promo_hidden_networks.sql`, both saved by
  `arrangeProjectNetworks` in `src/server/social/projects.ts`. The block's
  count is the networks it shows.
- **Like the Dashboards block**, the Networks block is never in the "/"
  list, can't be deleted, is put back at the top of a page saved without it,
  and moves with Move up and Move down in its ⋮.
- **The Archive block** sits under the Networks block (Tyler, 12 Nov 2026:
  "move the archive to its own block"), its count on its heading and one row,
  All items, that opens the project's Archive in the middle and right panels.
  It is fixed as the Networks block is: a page saved without it gets it back
  under the Networks block.
- **Lock description** makes the page read only for everyone, a guest
  included, at full strength; the Networks block still works. The server refuses any change while it is locked.
- **A guest** sent from Project writes the words but gets no "/" list and no
  right-click list of blocks, since blocks upload pictures and read web pages,
  which a guest can't. "/" is not typed at all on a guest's page. A guest
  has no ⋮.

### Reddit

- **Posts:** one header, with Posts and Failed as tabs and their counts,
  search, and New post. Posts lists each post of yours that landed, with the
  account, the subreddit and when it went; a press, or Open on Reddit in its
  right-click menu, opens it on Reddit. Failed lists each post that did not
  go out with why, and "May be on Reddit already" when the browser stopped
  part-way; a press or Try again opens New post with its words, and Select
  ticks several to Dismiss.
- **New post** stays on the right as a record: its header says which
  account it posts as, and Post to Reddit is at its foot. Nothing is sent
  until it is pressed.
- **Commenting:** the shell's one list header, with To look at, Replied,
  Skipped, Today and Sent as tabs (a dropdown when the middle is narrow),
  search, Select, and a ⋮ holding Jobs (with how many run or wait), Ideas and
  the self-promotion threads; then the posts as the dashboard's table
  ([the posts](commenting.md#the-posts)).
- **The post on the right** ends its header with the collapse button.
- **The tabs draw once.** Posts' and Commenting's tabs appear when their
  counts are read, so the line under the picked tab lands once in its place
  instead of sliding wider when the counts arrive (Tyler, 12 Nov 2026: "this
  border and tab here loads twice").
- **Still in the older shape until their part:** Medium, X, LinkedIn,
  Instagram and TikTok, and the Archive.

## Pausing a project

**Pause this project**, in the ⋮ at the top of the left column, pauses every account
in it: none of them posts, warms up or takes a health reading until the
project is resumed. A paused project says "Paused" after its name in the
header, and **Resume this project** is in the same ⋮. Searches still run,
because searching is the reader's work, not an account's.

- **Post is off** for its accounts and says "This account's project is paused.
  Resume the project on its dashboard to post from it again."
- **Pause in a network card's ⋮** pauses that network alone, its posts and its
  comments. **Pause commenting**, at the foot of the network's keywords dropdown, holds back only
  the comments ([Commenting inside a project](commenting.md#pause-commenting)).
- **A comment pressed before the pause waits** and can still be cancelled. The
  browser program looks again every ten minutes and sends it once the
  project is resumed.
- **One account alone** is paused from its row on the
  [the Projects dashboard's Accounts](reddit/accounts-dashboard.md).

It sat under a cog from the 13 Oct 2026 design until the ⋮ took its place on 5 Nov 2026. Unlike retiring, a pause is meant to end. The rules are
`src/server/social/pause.ts`; the column is `promo_projects.paused_at`.

## What the AI is told about what you make

The project's description as plain words, a line per paragraph, heading or
list item, with no formatting, under "WHAT I MAKE, if it is genuinely
relevant" (`projectDescriptionText` in `src/lib/social/project-description.ts`).

- **The picked account's project is the one that counts.** Its voice and its
  sent comments are used too.
- **Before an account is picked,** Write with AI uses the post's own project's
  description, with no voice and no example comments.
- **An account in no project drafts with no product text,** the same as an empty
  product box did before. It is never refused.

## The AI spend cap

The most a project's AI may cost in a calendar month, in dollars, from AI
spend cap in the project's ⋮, under Name. Tyler picked it on 18 Nov 2026
(part 2 of `workspace/tasks/New features/new-features-18-nov.md`).

- **The row says** "None", or what was spent against the cap: "$12.40 of
  $20". Opened, it is one box, Dollars a month, saving itself 700ms after
  typing stops, with this month's spend under it. Empty is no cap; the most is
  $10,000.
- **At the cap, every AI button for the project is refused** before anything
  is sent or counted, with "Taskly has used its $20 of AI this month. Raise
  the cap in the project's ⋮, under AI spend cap." That covers every network's
  drafts, rewrites, rules checks, answers, ideas, articles, newsletter issues,
  connection notes, captions, Messages' suggested answers, Voices' try-out and
  Medium's AI cover. Raising the cap lets it go on at once.
- **What counts** is this calendar month's spend (UTC), read off the shell's
  own AI meter, where every Promo call names its project. The check is
  `refuseOverProjectCap` in `src/server/social/spend-cap.ts`, called by
  `askModel` in `src/server/social/drafts.ts`, which every call goes through,
  and by the Medium cover. `askModel` will not take a call that does not say
  which project it is for, so a new AI button can't skip the cap.
- **Reddit's calls named no project before 18 Nov 2026**, so Reddit spend from
  before then is not counted in a project's month.
- **A help-only Reddit post belongs to an account, not a project**, so its
  drafts are never capped.
- **The shell's own monthly allowance per person still applies.** The cap only
  ever stops a project sooner. The shell's meter is only read, never changed.

## Making and deleting

- **New project**, on the dashboard's Projects section or in a project's ⋮, asks for a name and
  the networks it uses, and opens the new project.
- **Duplicate**, in a project's ⋮ and in a project row's right-click and ⋮
  on the dashboard, makes "<name> (copy)" and opens it. The copy has the
  first one's page, cover, networks and their order, every network's keywords
  with their kinds and marks, LinkedIn's buyer titles, and the Medium
  publications, X communities and LinkedIn groups picked for it. It never
  copies accounts, since an account belongs to one project only, and nothing
  that happened: finds, comments, posts, archive items and messages stay with
  the first project. The copy starts with no pin and not paused. A keyword
  keeps its own on or off switch, so one that searches by itself starts on the
  next timed run. Everything is written at once, so a failure leaves no
  half-made project (`duplicateProject` in `src/server/social/projects.ts`).
- **Deleting is refused** while the project holds accounts in use or keywords,
  and the message says how many of each, such as "Second product still holds 1
  keyword. Remove its keywords first, then delete it." Nothing is deleted along
  with a project. A retired account still pointing at it is let go.
- **Two projects may save the same words.** One saved search per set of words,
  and one watch per subreddit, is now a rule inside a project, not across
  everything.

## What holds it up

- **Tables.** `promo_projects` holds the name, the description (the
  editor's document as JSON, or "" for none, since
  `drizzle/0138_promo_project_column.sql`, which turned each older plain
  description into a paragraph per line), Lock description
  (`description_locked`), the pin (`pinned_at`), the
  cover (`image_url`: "", "sky" or a media address, added by
  `drizzle/0111_promo_project_image.sql`; the pictures it has had are
  `cover_images`, added by `drizzle/0158_promo_project_cover_images.sql`) and the networks it uses
  (`networks`, added by `drizzle/0118_promo_project_networks.sql`).
  `promo_keywords.project_id` is required; `promo_accounts.project_id` may be
  empty. Migration `drizzle/0108_promo_projects.sql`.
- **The first project.** That migration made one project called "My project"
  for everybody who had keywords or accounts, put every keyword and Reddit
  account in it, and copied in the product text of the voice the oldest account
  used, so the AI is told what it was told before. `promo_voices.product`
  stays in the table and nothing reads it.
- **The left menu.** The same migration turned the saved Reddit entry into
  Projects, kept what sat under it (Comments, and Voices where it was put
  there) and added Reddit accounts. A left menu with no Reddit entry got
  Projects at the end of its Administration section. Since
  `drizzle/0118_promo_project_networks.sql`, Today, Comments, Reddit accounts
  and Jobs have left every saved left menu. Since
  `drizzle/0157_promo_projects_dashboard.sql`, Voices, Accounts, Archive and
  Messages have too, as sections of the Projects dashboard.
- **The warm-up joins subreddits from its own project.** The daily warm-up
  visit joins subreddits Promo found posts in for the keywords of the
  account's project, so an account reads as one person with one interest.
- **Code.** The dashboard is under
  `src/components/social/projects-dashboard/` ([The dashboard](#the-dashboard)).
  A project's page is `src/components/social/projects/workspace.tsx`, its left column with the
  network cards `project-panel.tsx`, and its three columns
  `project-columns.tsx`. Reddit's posts are
  `src/components/social/reddit/reddit-posts-module.tsx`, with New post in
  `reddit-new-post.tsx`, and its Commenting `reddit-module.tsx`. Medium, X and
  LinkedIn draw both rows from their modules with `side="posts"` or
  `side="commenting"`. The address is read by
  `src/lib/social/project-address.ts`. Endpoints are
  `src/lib/api/social/projects.ts`, and the server is
  `src/server/social/projects.ts`.

Browser profiles and proxies stay app-wide. A project points at accounts, never
at profiles or proxies (Tyler's rule of 5 Oct 2026).
