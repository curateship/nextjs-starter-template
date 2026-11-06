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

- **Lost accounts.** A project whose accounts a counted ban hit in the last 30
  days says "2 accounts banned in the last 30 days" under its name, and at
  the top of its own left column. Clicking it opens the Bans dashboard
  filtered to that project and the last 30 days. Nothing shows when there
  are none ([Bans](bans.md), part 18).
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
([Networks as modules](network-modules.md)).

- **Left: the project.** An arrow back to the Projects table, the project's
  name, and a cog. Under them the project's picture, its name in large type
  and its description, then **Networks** with **Add network**.
- **The cog** opens a box with the name and the description, both saving as
  they are typed with no Save button, then **New project**, **Pause this
  project** (or Resume) and **Delete project**. Another project is picked from
  the Projects table, which the arrow goes back to.
- **Each network is a card** with two rows, Posts and Commenting, and
  Instagram and TikTok Posts alone. The card is the UI standard's `PanelCard`
  and folds from its title. **Posts** counts your posts on it that need you:
  failed ones and drafts not sent yet ("2 of your posts need you: failed, or
  drafts not sent yet" on hover, `readPostCounts` in
  `src/server/social/post-counts.ts`, part 8 of the Commenting task).
  **Commenting** counts the posts and replies waiting
  ([Commenting inside a project](commenting.md)).
- **The picture** is the shared image field: pressing it opens the media
  library to upload or pick one, and the X on its corner removes it. It saves
  the moment it changes. A project with none shows "Add a picture". The server
  takes only an image you uploaded, the same check as the shell's profile
  photo, and refuses any other address.
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
tab and the open post. Under 1280px the columns stack: the project, then your
posts. A picked post or New post then takes the whole screen, with an arrow
back to the list.

## Pausing a project

**Pause this project**, under the cog at the top of the left column, pauses every account
in it: none of them posts, warms up or takes a health reading until the
project is resumed. A paused project says so at the top of the column, with
**Resume** beside it. Searches still run, because searching is the reader's
work, not an account's.

- **Post is off** for its accounts and says "This account's project is paused.
  Resume the project on its dashboard to post from it again."
- **Pause on a network's card** pauses that network alone, its posts and its
  comments. **Pause commenting**, on the card's Commenting row, holds back only
  the comments ([Commenting inside a project](commenting.md#pause-commenting)).
- **A comment pressed before the pause waits** and can still be cancelled. The
  browser program looks again every ten minutes and sends it once the
  project is resumed.
- **One account alone** is paused from its row on the
  [Accounts dashboard](reddit/accounts-dashboard.md).

It sits under the cog since the 13 Oct 2026 design. Unlike retiring, a pause is meant to end. The rules are
`src/server/social/pause.ts`; the column is `promo_projects.paused_at`.

## What the AI is told about what you make

The project's description, under "WHAT I MAKE, if it is genuinely relevant".

- **The picked account's project is the one that counts.** Its voice and its
  sent comments are used too.
- **Before an account is picked,** Write with AI uses the post's own project's
  description, with no voice and no example comments.
- **An account in no project drafts with no product text,** the same as an empty
  product box did before. It is never refused.

## Making and deleting

- **New project**, on the table or under a project's cog, asks for a name and
  the networks it uses, and opens the new project.
- **Deleting is refused** while the project holds accounts in use or keywords,
  and the message says how many of each, such as "Second product still holds 1
  keyword. Remove its keywords first, then delete it." Nothing is deleted along
  with a project. A retired account still pointing at it is let go.
- **Two projects may save the same words.** One saved search per set of words,
  and one watch per subreddit, is now a rule inside a project, not across
  everything.

## What holds it up

- **Tables.** `promo_projects` holds the name, the description, the
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
