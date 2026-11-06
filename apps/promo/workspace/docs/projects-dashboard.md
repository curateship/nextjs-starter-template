# The Projects dashboard

A project is one thing being promoted. It holds a description of what you make,
the networks it is promoted on, the accounts that post and comment for it, and
the keywords that find other people's posts for them. There are two screens:

- **The Projects table** at `/admin/projects`, reached from **Projects** in the
  left menu, lists every project. Tyler, 12 Oct 2026: "project needs a table
  dashboard".
- **A project's own dashboard** at `/admin/projects/<project id>`, opened from a
  row, puts its description and networks on the left, each network a card
  with a Posts row and a Commenting row, and the picked row's panels beside
  them. It replaced the Reddit dashboard on 12 Oct 2026. How a network fills
  it is in [Networks as modules](network-modules.md), and its Commenting row in
  [Commenting inside a project](commenting.md).

Tyler, 12 Oct 2026: "Build a new dashobard (3 col) for "Projects" this is where
we combine everything together to manage a project. Left panel holds project
discription, under it shows all the accounts under this project. Clicking on the
account opens up in the middle panel to search for keywords and showing all the
posts and the right col shows the post and comment box"

## Tyler's rules

- **Projects replaces the Reddit dashboard.** The Reddit entry in the left menu
  is gone, and `/admin/reddit` sends to `/admin/projects`, so an old bookmark
  still lands.
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

## The Projects table

Built like the Voices dashboard, from the shell's table. Each row is a project:
its name with the first line of its description, then how many accounts it
holds (retired ones not counted), **Posts**, how many of its own posts went out
on every network, and **Last post**, when the newest did. A failed or deleted
post does not count. Tyler, 5 Nov 2026: Posts and Last post replace Keywords,
To look at, Comments sent and Last comment, which belong to each network's
Commenting row. The figures are `readProjectPosts` in
`src/server/social/post-counts.ts`.

- **Pinned projects come first,** whatever the sort, with a yellow pin
  before the name. A project is pinned from the pin in its own left column's
  header, as in Project (Tyler, 5 Nov 2026). The pin is the project's, kept
  in `promo_projects.pinned_at`.
- **Lost accounts.** A project whose accounts a counted ban hit in the last 30
  days says "2 accounts banned in the last 30 days" under its name, and shows
  a small red mark with the number after its name in its own left column.
  Clicking either opens the Bans dashboard filtered to that project and the
  last 30 days. Nothing shows when there are none ([Bans](bans.md), part 18).
- **A row opens the project's own dashboard,** a page of its own because that
  is where the work is done. The arrow at the top of the project's left column
  comes back here.
- **New project** asks for a name and the networks it uses, Reddit ticked to
  begin with, and opens the new project.
- **Delete,** on a row or for the ticked rows in one request, deletes the empty
  projects and keeps any that still hold accounts or keywords, saying what each
  one holds.

## The three columns

Tyler sent the design on 13 Oct 2026, and the dashboard was rebuilt to match
it. On 14 Oct 2026 the accounts left the left column for a dropdown beside
Post, and the left column lists the project's networks instead
([Networks as modules](network-modules.md)). On 5 Nov 2026 the left column
took the shape of Project's left panel ("Left panel needs to use left panel
standards, look at project app";
`workspace/tasks/Projects/left-column-standards.md`).

### The left column

- **The header** holds an arrow back to the Projects table, the project's
  name once, then "Paused" while the project is paused and the red bans mark,
  then the pin, the + that adds a network, and the ⋮ (Tyler, 5 Nov 2026:
  "move the add network + here"). The three are the small button size, so
  the name keeps the room. A name cut short with "…" shows all of it on hover.
  Another project is picked from the Projects table.
- **The picture** lies behind the header and the top of the column at 30 out
  of 100 strength, fading into the column, and the header's line turns
  see-through over it, as on Project's project page. No picture, no banner.
- **The ⋮** is the shell's one dropdown look (`FoldingMenu`), opening over
  the middle column. **Name** and **Picture** fold open and save themselves:
  the name 700ms after the last letter, on Enter and when its box is left;
  the picture the moment one is picked or removed, through the shared image
  field, which takes only an image you uploaded. Under a line: **New
  project**, **Pause this project** (or Resume), **Lock description** (or
  Unlock), and **Delete project** in red.
- **The description** is written in place at the top of the column, in the
  editor Project's page notes use, with headings, lists, bold and links from
  the bar over selected words. It saves 700ms after the last letter and when
  it is left, with Saving… and Saved in the page header. Empty, it reads
  "Describe what you make. The AI is told this." It holds up to 4,000
  letters; a longer one is refused with its length, never cut short. The
  saved document is capped at 64,000 characters too, so thousands of empty
  lines can't get round the letters rule. The server also refuses a save
  while the description is locked, checked in the same write.
- **Lock description** makes it read only for everyone, its owner and a
  guest included, until Unlock description. A locked, empty description
  shows nothing. The server refuses any change while it is locked
  (`promo_projects.description_locked`).
- **The + in the header** lists the networks the project does not use yet,
  in the shared dropdown look. **Networks**, the shared small heading, sits
  over the cards. A project with none shows an icon, "Add a network to post
  and comment from this project" and **Add network**.
- **A row's count** reads "2 need you" or "2 to answer" when the row has room
  for the words, and the number alone at the column's narrowest.
- **Each network is a card,** the UI standard's `PanelCard`, with the
  network's mark before its name and two rows, Posts and Commenting;
  Instagram and TikTok have Posts alone. **Posts** says how many of your posts
  on it need you, as "2 need you": failed ones and drafts not sent yet
  (`readPostCounts` in `src/server/social/post-counts.ts`). **Commenting** says
  "2 to answer" ([Commenting inside a project](commenting.md)). The two are
  added together on the card's title, "Reddit · 4", which shows folded too.
- **A card folds from its title,** and each project remembers its own cards
  in this browser (`promo-network-<project id>-<network>`). The card holding
  the picked row opens by itself, whatever was remembered, so a notice that
  opens Reddit's Commenting never lands in a folded card; folding it again is
  allowed. Its ⋮, shown while it is pointed at, holds **Pause** (or Resume)
  for that network on this project, then a line, then **Take off** in red,
  which the server refuses while the project still holds that network's
  accounts or keywords.
- **The counts change as soon as something is sent.** A post sent, a comment
  queued, or a failed post cleared reads the project again.
- **The Archive** is a card like the networks', its title counting the items
  not in the Bin ("Archive · 12"), its one row opening the project's Archive
  in the middle and right columns.
- **Middle: the picked row.** On Posts, the network's own tabs: Reddit's Posts
  and Failed, Medium's Posts and Publications, X's Posts, Replies and
  Communities, LinkedIn's Posts, Instagram's and TikTok's Posts and Comments.
  On Commenting, the posts its keywords found
  ([Commenting inside a project](commenting.md)).
- **Right: one post of yours, or New post.** Every network writes a new post
  in this column. On Reddit it always holds New post, because a Reddit post is
  read on Reddit itself; elsewhere it holds the post picked in the list.
- **An empty Posts list** says "No posts of your own yet. Press New post to
  write one." on every network, with New post beside it.

The side columns collapse to nothing and leave a tab to bring them back,
double-clicking a side's empty space shuts it, the two dividers drag, and the
widths are remembered in the browser (`promo-projects-workspace`). The project
lives in the address, so a reload keeps it, and so do the picked network, the
tab and the open post.

Under 1280px one column shows at a time, as on every three-column dashboard:
a row of the three column names above them (the picked network or Archive,
Project, Open), the hidden two kept drawn so each keeps its tab and scroll.
Picking a row in the Project column shows the middle one. A post pressed, or
New post, shows Open, and its back arrow or the middle column's name closes
it. A post that opened by itself, such as Commenting's first post or the
Archive's first item, waits behind Open while the list stays in front.

## Pausing a project

**Pause this project**, in the ⋮ at the top of the left column, pauses every account
in it: none of them posts, warms up or takes a health reading until the
project is resumed. A paused project says "Paused" after its name in the
header, and **Resume this project** is in the same ⋮. Searches still run,
because searching is the reader's work, not an account's.

- **Post is off** for its accounts and says "This account's project is paused.
  Resume the project on its dashboard to post from it again."
- **Pause in a network card's ⋮** pauses that network alone, its posts and its
  comments. **Pause commenting**, on the card's Commenting row, holds back only
  the comments ([Commenting inside a project](commenting.md#pause-commenting)).
- **A comment pressed before the pause waits** and can still be cancelled. The
  browser program looks again every ten minutes and sends it once the
  project is resumed.
- **One account alone** is paused from its row on the
  [Accounts dashboard](reddit/accounts-dashboard.md).

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

## Making and deleting

- **New project**, on the table or in a project's ⋮, asks for a name and
  the networks it uses, and opens the new project.
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
  picture (`image_url`, a media address or "", added by
  `drizzle/0111_promo_project_image.sql`) and the networks it uses
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
  and Jobs have left every saved left menu, and Voices stays.
- **The warm-up joins subreddits from its own project.** The daily warm-up
  visit joins subreddits Promo found posts in for the keywords of the
  account's project, so an account reads as one person with one interest.
- **Code.** The table is `src/components/social/projects/projects-table.tsx`.
  A project's page is `workspace.tsx` beside it, its left column with the
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
