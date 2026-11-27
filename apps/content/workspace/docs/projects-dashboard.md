# The Projects dashboard

A project is one thing being promoted. It holds a description of what you make,
the networks it is promoted on, the accounts that post and comment for it, and
the keywords that find other people's posts for them. There are two screens:

- **The Projects dashboard** at `/admin/projects`, reached from **Projects** in
  the left menu: one three-panel dashboard whose sections are Overview,
  Projects, Accounts and Messages, and in Content Vault, Hooks and Formats in
  a Viral block. Tyler, 12 Nov 2026: "We need to consolidate projects,
  voices, accounts, archive and messages into one cohesive 3 panel design."
  On 27 Nov 2026 Content took Voices and the Archive out: each is a
  project's own now ([content-app.md](content-app.md), "The Projects
  dashboard"). It is described under [The dashboard](#the-dashboard) below.
- **A project's own page** at `/admin/projects/<project id>`, opened from a
  project's row on the Projects list. Since 27 Nov 2026 it keeps the
  dashboard's left panel as it is and fills the middle and right (Tyler: "When
  clicking on a project. I dont want the left panel to change"). The middle
  starts with the project's tabs, Content, Research and Promote, and opens on
  Content. Promote has a tab per network, and each network a Posts /
  Commenting switch. It replaced the Reddit dashboard on 12 Oct 2026. How a
  network fills it is in [Networks as modules](network-modules.md), and its
  Commenting in [Commenting inside a project](commenting.md). Content's own
  parts are in [content-app.md](content-app.md), "A project's own page".

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
  Archive, Messages. Overview has no right panel. In Content since 27 Nov
  2026: Overview, Projects, Accounts and Messages, with Vault, Hooks and
  Formats in a Viral block (Tyler: "The voice should not be its own sidebar
  link", "Archive should also not have its own link either").
- **Widgets:** Posts that need you, Messages waiting, Accounts by status,
  Bans in the last 30 days and Archive room. Content adds Found today and
  Videos in progress, and starts Overview with them
  ([content-app.md](content-app.md), "The Projects dashboard").
- **One project:** a Projects block on the left page narrowed whichever
  section was open to one project. Content took it out on 27 Nov 2026 (Tyler:
  "Remove projects block. List row only"): a row of the Projects list opens
  the project, and the sections show every project's rows.
- **A project's row:** the project's summary opens on the right, with Open
  project at its foot leading to the project's own page. Since the same day
  a press on the row goes straight to the project's page, and the summary
  opens from the eye in the row's actions column.

### The left panel

- **The page** is each person's own, under a cover, written on like any page
  of "/" blocks and saved 700ms after typing stops. Its ⋮ holds General (Cover
  photo, and Lock the notes at its foot) and Widgets, Overview's rows and
  spots. It is stored in `promo_projects_pages`, one row per person
  (`drizzle/0233_promo_projects_dashboard.sql`).
- **The Dashboards block** lists Overview, Projects, Accounts and Messages
  with a count each: Overview's widgets, the projects, the accounts in use
  and the open conversations. The block is fixed: it is never in the "/"
  list, the page can't lose it, and its ⋮ moves it up or down and hides or
  reorders every section but Overview, kept per person.
- **The Viral block**, under it, lists Vault, Hooks and Formats, with no
  count, since they are read when they show. It is fixed in the same way, a
  page saved before it existed gets it under Dashboards, and its ⋮ shows,
  hides and orders its three rows.
- **There is no Projects block** since 27 Nov 2026. A page saved with it is
  read and saved without it, as any block the page does not know.
- **The same left panel shows on a project's page** and its Research, with
  Projects picked in the Dashboards block (`useProjectsLeft` in
  `src/components/content-app/projects-left.tsx`). Its counts are read there
  too, starting from the dashboard's last ones, so they never flash empty.
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
- **Accounts and Messages** are described in their own docs:
  [Accounts](reddit/accounts-dashboard.md) and [Messages](messages-dashboard.md).
  [Voices](voices-dashboard.md) are a tab on each network of a project's
  page, and [the Archive](archive.md) is each project's Content tab.

### Deleting a project

Delete, from a row's right-click menu, the selected rows or the project's ⋮,
asks first, then deletes the empty projects and keeps any that still hold
accounts or keywords, saying what each one holds.

### Addresses

- **The address holds the place:** `?section=` (none is Projects), `?open=`
  and each section's filters, read by
  `src/lib/social/projects-dashboard-search.ts`. `?project=` is read only on
  Vault, Hooks and Formats, where a saved view can hold one; elsewhere an old
  address holding it opens the section for every project.
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
`src/server/social/projects-dashboard.ts`. The Dashboards and Viral blocks and the left
page panel are drawn by `src/components/dashboard-page/`, which [the Anti
Detect dashboard](anti-detect-dashboard.md) shares, with its Projects block;
`projects-blocks.tsx` and `projects-page-panel.tsx` only name the Projects
dashboard's sections, blocks and endpoints. The left panel itself, with its
page read, its ⋮ and Overview's layout, is `useProjectsLeft`
(`src/components/content-app/projects-left.tsx`), so the dashboard and a
project's page draw one and the same.

## A project's own page

Since 12 Nov 2026 the project's own page is in the same three-panel design as
the dashboard (Tyler: "the project page itsel is not updated to the new
design"; `workspace/tasks/Projects/project-page-design.md`). Since 27 Nov 2026
its left panel is the dashboard's own (Tyler: "When clicking on a project. I
dont want the left panel to change so that means we can remove the project's
overview and its widgets"; `workspace/tasks/Content/03-project-in-the-middle-panel.md`).

### The frame

- **The left panel** is the Projects dashboard's, unchanged, with Projects
  picked in its Dashboards block. A row there goes to that section of the
  dashboard.
- **The sides** open at the widths in Settings → Styling → Side panels and
  drag no narrower, slide shut from the collapse button at their header's
  edge or a double-click on blank space, and come back from the reopen
  buttons in the middle's header. Widths are remembered in this browser
  (`promo-projects-workspace-2`, with the two widths added; a shape with a
  column left out keeps its own).
- **It is Project's own frame**, not the shell's `ThreePanels`
  (`src/components/social/projects/project-columns.tsx`): a guest from
  Project opens this page outside the signed-in area, where the shell's frame
  cannot read where it was.
- **The right panel carries the left page's cover** behind its header,
  whichever record is open, as on the dashboard.
- **Under 1280px** one panel shows at a time behind the pill row: what the
  middle shows, Projects, and Open. A post pressed, or New post, shows Open;
  one that opened by itself waits behind it.

### The one header

Tyler, 27 Nov 2026, after a first build with two rows above each list: "remove
the name", "I dont like the 2 extra subheader. Lets put them all in the top
header so we have just one header. The tabs can now be either dropdowns or
filter". So every list on a project's page has one header, in this order.
Since the same day's `workspace/tasks/Misc/misc.md` it is Content's
`ListHeader`, the same on every dashboard ([list-header.md](list-header.md)):
search is an icon, the dropdowns come right after it, and Select is in the ⋮.

- **The arrow back** to the Projects list, with this project's row open. A
  guest has none.
- **Content, Research and Promote** (`src/components/content-app/project-top.tsx`).
  They are tabs in a window 1500px wide or more, and a dropdown below it,
  where the list's own buttons need the room. The project's name is not shown.
  The tabs are Content's own (`project-tabs.tsx`), in the style Settings →
  Styling picks, for two reasons (Tyler, 27 Nov 2026: "fix the gap here and
  the tabs are miissing the transition animation"). Their line sits on the
  header's divider, which the shell's tabs missed by 3px inside the back
  arrow's row. And each tab draws a header of its own, so the new header's
  line starts where the last one's was and slides to the tab pressed.
  How the line stays one line (Tyler, 27 Nov 2026: "CLicking on promote tab
  has a bug that flashes the tab", then "fix the tabs. it kept flashging"):
  - **It moves at the press**, before the page it opens has loaded.
    Research takes about half a second to arrive.
  - **A header drawn again mid-slide carries the line on** from where it
    had got to: a list's header once the list is read, or Research's page
    arriving late. It never starts over from the tab left.
  - **It is placed from the first draw.** An unplaced row has the chosen tab
    draw a line of its own, which showed as a second line.
  - **It does not move until its first frame**, so its first placing never
    shows as a slide back from the press.
  - Tests: `src/components/content-app/project-tabs.test.tsx`.
- **On the right, the search icon**, then **the tab's own dropdown**, the shell's `ViewMenu`: Content's All items or
  Videos; Research's Found videos, Hooks, Sounds or Creators, one dropdown for what were the Research block's rows and the videos'
  own tabs; Promote's network and side together, "Reddit · Posts", "Reddit ·
  Commenting", "X · Posts" and so on.
- **The list's own dropdown** of which list shows: a network's own lists
  (To look at, Replied, Sent and the rest) with Voices and Accounts after
  them (`NetworkTabs` in `src/components/content-app/network-panes.tsx`), and
  the Archive's kind (Every kind, Videos, Carousels, Pictures).
- **The list's buttons**: Filter, Views, its keyword picker and its New
  button. YouTube's and Instagram's tables draw this same header above
  themselves, with the shell table's own toolbar hidden (Tyler, 27 Nov 2026:
  "fix ui for promote dashboard").
- **The project's ⋮, last** (`ProjectMenuButton`; Tyler: "the 3 dot ...
  should be here", pointing past Add). A header has one ⋮: a list's own
  actions are a tab of it (below).

When a header runs out of room, the dropdowns cut their words short with
"…" before anything is pushed off the edge. Below 1280px, where the page shows
one column at a time, the project's controls scroll sideways inside the header
instead. Checked on the sample at 1600 and 1280 wide and on a phone: every
list's header is one 57px line with nothing past its edge.

### Addresses

- **Content is the plain address** (Tyler: "middle panel first load will be
  it's content archive"). `?content=videos` is its Videos, and `?archive=1`
  carries the Archive's filters (a guest's Content too).
- **Research** is `/admin/projects/<id>/research`, its list in `?view=`.
- **Promote** is `?network=` with `?side=commenting` for Commenting, the first
  network it shows when none is named, or `?promote=1` on a project with no
  network yet. Every older address that names a network, a side or a post
  still opens Promote on it (`projectTabOf` in
  `src/lib/social/project-address.ts`).

### Promote's networks

- **The dropdown** lists each network the project uses, in the order the ⋮'s
  Networks tab sets. A network with Posts and Commenting (Reddit, Medium, X,
  LinkedIn) has two choices; one with Posts alone (YouTube, Instagram, TikTok,
  Threads) has one. They were the Posts and Commenting rows of each network's
  card (Tyler, 27 Nov 2026: "A Posts / Commenting switch", then "The tabs can
  now be either dropdowns or filter"). A paused network says "(paused)".
- **Posts carries** how many need you (failed posts and drafts,
  `readPostCounts`); Commenting has no count (Tyler, 14 Nov 2026: "remove
  it"). Pause commenting is in a network's keywords dropdown
  ([Pause commenting](commenting.md#pause-commenting)).
- **Hidden networks** are left out of the dropdown but stay on the project and
  keep running: their posts, comments and readings go on. One named in the
  address still shows. The order is the project's `networks` list and the
  hidden ones `hidden_networks` (`drizzle/0237_promo_hidden_networks.sql`),
  both saved by `arrangeProjectNetworks` in `src/server/social/projects.ts`.
- **No network yet:** Promote says so, with Add a network, which opens the
  ⋮ at Networks.

### The ⋮

The project's ⋮ is the tabbed menu
(`src/components/social/projects/project-menu.tsx`):

- **General:** Name, **Description**, **AI spend cap** (below) and **Cover
  photo**, each a row that opens its field and saves itself. Description
  opens the "/" editor (Tyler, 27 Nov 2026: "move discritption to general. it
  dfoesnt need its own tab"). Cover photo is the shell's row every page has
  (Tyler, 12 Nov 2026: "the picture is missing the 3 selection standard"):
  None, Sky, each picture the project has had (up to 8, each with an ×), and
  + to add one from the media library. Then the list's **Select** (Hide
  select while rows are ticked; "Move all the mass select button to here")
  and the network's **Jobs** with how many run or wait ("Move jobs button
  here"); then Pin; Pause this project (or Resume); Lock description (or
  Unlock); New project; Duplicate; and Delete project in red under a line.
- **Networks:** each network the project uses, in Promote's order, with Move
  up, Hide or Show (Tyler, 14 Nov 2026, of the block the dropdown replaced: "i
  should be able to hide and drag and drop networks here"), Pause (or Resume)
  for that network alone, and Take off, which the server refuses while the
  project still holds that network's accounts or keywords. Then the networks
  it does not use yet, each a row to add it.
- **On Research**, Research's own settings follow as **Research** (Search
  and AI) and **Socials** (Tyler, 27 Nov 2026, of the two ⋮ there: "should
  be merged"). Research settings has no ⋮ of its own.
- **On Content, the Bin** is a tab ("Bin · 2" while it holds two): the
  deleted items with Put back and Delete for good ([archive.md](archive.md)).
- **On YouTube, Templates** is a tab: the description templates with their
  section counts, and New template, each opening the Templates window
  (Tyler: "This should be in here").
- **A list's own actions** are a last tab, named for them: Reddit
  Commenting's **Commenting** tab (Ideas and the self-promotion threads), and
  Research's **Hidden** tab (each hidden channel's Show again) while any
  channel is hidden.
- **Its width:** 22.7rem, and 26rem with four tabs (Research), so the tab
  row never scrolls sideways (Tyler: "reduce the padding a bit so we dont
  get this areascroll"). The 32px between tabs is the shell's own rule, so
  the menu widens instead.
- **A guest** gets General with the Description row alone, and a list's
  actions.

### The description

- **It is written from the Description row** of the ⋮'s General tab, in the
  "/" editor. Its row shows its first words, or None. It saves
  700ms after the last letter and when it is left, with Saving… and Saved in
  the page header. Empty, it reads "Describe what you make. The AI is told
  this." It is Research's topic too ([content-app.md](content-app.md)).
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
  words and formatting only, reads the same. The fixed blocks the project's
  own left panel drew in it until 27 Nov 2026 (Networks, and Content's
  Dashboards, Viral, Content, Research and Videos) are dropped when it is
  read and saved, as any block it does not know
  (`src/lib/social/project-description.ts`).
- **Lock description** makes it read only for everyone, a guest included.
  The server refuses any change while it is locked.
- **A guest** sent from Project writes the words but gets no "/" list and no
  right-click list of blocks, since blocks upload pictures and read web
  pages, which a guest can't. "/" is not typed at all on a guest's page.

### What went on 27 Nov 2026

- **The project's own left panel**, with its Dashboards, Viral, Content,
  Research, Videos and Promote blocks, its Networks block's folding rows and
  sliding bar, and its own ⋮.
- **The rows above each list** that the first build of the same day had (the
  project's name and tabs, then a row of sub-tabs). They are one header now.
- **The project's Overview** and its widgets, with the ⋮'s Widgets tab. The
  Projects dashboard's own Overview stays, and its widgets open a project's
  Content or Promote.

### Reddit

- **Posts:** the one header, with Posts and Failed (and Voices and Accounts)
  in the list dropdown with their counts, search, and New post. Posts lists each post of yours that landed, with the
  account, the subreddit and when it went; a press, or Open on Reddit in its
  right-click menu, opens it on Reddit. Failed lists each post that did not
  go out with why, and "May be on Reddit already" when the browser stopped
  part-way; a press or Try again opens New post with its words, and Select
  ticks several to Dismiss.
- **New post** stays on the right as a record: its header says which
  account it posts as, and Post to Reddit is at its foot. Nothing is sent
  until it is pressed.
- **Commenting:** the one header, with To look at, Replied, Skipped, Today
  and Sent in the list dropdown, search, Select and the keyword picker; Jobs
  (with how many run or wait), Ideas and the self-promotion threads are the
  project ⋮'s Commenting tab. Then the posts as the dashboard's table
  ([the posts](commenting.md#the-posts)).
- **The post on the right** ends its header with the collapse button.
- **The list dropdown draws once** its counts are read (Tyler, 12 Nov 2026,
  of the tabs it replaced: "this border and tab here loads twice").

## Pausing a project

**Pause this project**, in the project's ⋮ at the end of its tab row, pauses every account
in it: none of them posts, warms up or takes a health reading until the
project is resumed. A paused project says "Paused" after its name in the
header, and **Resume this project** is in the same ⋮. Searches still run,
because searching is the reader's work, not an account's.

- **Post is off** for its accounts and says "This account's project is paused.
  Resume the project on its dashboard to post from it again."
- **Pause on the ⋮'s Networks tab** pauses that network alone, its posts and its
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
  `drizzle/0230_promo_project_column.sql`, which turned each older plain
  description into a paragraph per line), Lock description
  (`description_locked`), the pin (`pinned_at`), the
  cover (`image_url`: "", "sky" or a media address, added by
  `drizzle/0209_promo_project_image.sql`; the pictures it has had are
  `cover_images`, added by `drizzle/0234_promo_project_cover_images.sql`) and the networks it uses
  (`networks`, added by `drizzle/0216_promo_project_networks.sql`).
  `promo_keywords.project_id` is required; `promo_accounts.project_id` may be
  empty. Migration `drizzle/0206_promo_projects.sql`.
- **The first project.** That migration made one project called "My project"
  for everybody who had keywords or accounts, put every keyword and Reddit
  account in it, and copied in the product text of the voice the oldest account
  used, so the AI is told what it was told before. `promo_voices.product`
  stays in the table and nothing reads it.
- **The left menu.** The same migration turned the saved Reddit entry into
  Projects, kept what sat under it (Comments, and Voices where it was put
  there) and added Reddit accounts. A left menu with no Reddit entry got
  Projects at the end of its Administration section. Since
  `drizzle/0216_promo_project_networks.sql`, Today, Comments, Reddit accounts
  and Jobs have left every saved left menu. Since
  `drizzle/0233_promo_projects_dashboard.sql`, Voices, Accounts, Archive and
  Messages have too, as sections of the Projects dashboard.
- **The warm-up joins subreddits from its own project.** The daily warm-up
  visit joins subreddits Promo found posts in for the keywords of the
  account's project, so an account reads as one person with one interest.
- **Code.** The dashboard is under
  `src/components/social/projects-dashboard/` ([The dashboard](#the-dashboard)).
  A project's page is `src/components/social/projects/workspace.tsx`, its ⋮
  `project-menu.tsx`, the controls first in each header
  `project-header-lead.tsx` and `content-app/project-top.tsx`, and its three
  columns `project-columns.tsx`. Reddit's posts are
  `src/components/social/reddit/reddit-posts-module.tsx`, with New post in
  `reddit-new-post.tsx`, and its Commenting `reddit-module.tsx`. Medium, X and
  LinkedIn draw Posts and Commenting from their modules with `side="posts"` or
  `side="commenting"`. The address is read by
  `src/lib/social/project-address.ts`. Endpoints are
  `src/lib/api/social/projects.ts`, and the server is
  `src/server/social/projects.ts`.

Browser profiles and proxies stay app-wide. A project points at accounts, never
at profiles or proxies (Tyler's rule of 5 Oct 2026).
