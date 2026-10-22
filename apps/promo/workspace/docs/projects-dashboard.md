# The Projects dashboard

A project is one thing being promoted. It holds a description of what you make,
the networks it is promoted on, the Reddit accounts that comment for it, and the
keywords that find posts for them. There are two screens:

- **The Projects table** at `/admin/projects`, reached from **Projects** in the
  left menu, lists every project. Tyler, 12 Oct 2026: "project needs a table
  dashboard".
- **A project's own dashboard** at `/admin/projects/<project id>`, opened from a
  row, puts its description and networks on the left and the picked network's
  panels beside them. It replaced the Reddit dashboard on 12 Oct 2026. How a
  network fills it is in [Networks as modules](network-modules.md).

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
  sidebar?"

## The Projects table

Built like the Voices dashboard, from the shell's table. Each row is a project:
its name with the first line of its description, then how many accounts it
holds (retired ones not counted), its keywords, the posts still waiting to be
looked at, the comments its accounts have sent, and when the last one went.
Comments count toward the project the sending account is in now.

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
- **The picture** is the shared image field: pressing it opens the media
  library to upload or pick one, and the X on its corner removes it. It saves
  the moment it changes. A project with none shows "Add a picture". The server
  takes only an image you uploaded, the same check as the shell's profile
  photo, and refuses any other address.
- **Middle: keywords across the top, posts under them.** The column's header
  names the network (Reddit), and on the right holds **Search posts**, the
  keywords dropdown, **Jobs**, **Create post** and a "⋮" menu. The menu
  holds **Ideas** and **Self-promotion threads**, each of which opens a window.
  Under the header, the To look at, Replied, Skipped, Today and Comments tabs,
  then the posts in their three bands, or Today's or Comments' own lists.
- **Right: the post and the comment box.** The header names the subreddit, with
  Skip and the way to Reddit. Under the post, "Replies not read yet" with Read
  the replies beside it. At the bottom, the subreddit's rules line, then
  **Comment as** with the accounts dropdown, then one box holding the words,
  **Write with AI** and **Check** along its bottom, and **Post comment**.

### The keywords dropdown

Tyler, 21 Oct 2026, with a picture of the chips taking two lines at three
keywords: "have to organize the keywords ui better". Of three drawings he
picked one dropdown, for Reddit and Medium alike. Until then the keywords were
a row of chips, his design of 13 Oct 2026. The same day he moved the dropdown
from the header's start to its buttons on the right, after the search box,
and the network's name took its place.

- **The button**, after the search box, names the keyword whose posts are
  listed, or **All keywords**, with its count, and spins while any search runs.
  With nothing saved it reads **Add keyword**.
- **Its list** has All keywords first, ticked when picked, then a row per
  keyword, then **Add keyword** under a line. Picking a row lists that
  keyword's posts alone and closes the list; All keywords goes back to every
  keyword's posts in one ranked list, which is what shows when the screen
  opens. A post row then names the keyword that found it, once the project has
  more than one.
- **A keyword's row** shows its name and post count, and under them when it
  last searched and what it searches ("2 hours ago · Past week · All of
  Reddit", or "Watching · Newest first" for a watch). A failed last search says
  "search failed" in red, with the reason on hover. No hover on the name:
  Tyler asked for those tooltips to go on 13 Oct 2026.
- **Three buttons on the row's right:** the timer switches its timed searches
  off and on (a timer while it searches by itself, a crossed-out timer and
  "timer off" in its line while it only searches when pressed); the arrow
  searches again; the "⋮" holds **Remove**, which removes the keyword and
  everything it found, at once, with no question asked.
- **Add keyword** turns the list into the words, subreddits, Reddit's order
  and how far back, with **Add and search**, and a Keywords link back. It opens
  on that box by itself while the project has no keywords. Pressing Add and
  search with both boxes empty says what is missing and marks the box.
- **While a search waits or runs** its row says "searching" and its arrow
  spins. When the browser program is not running, the row says "waiting"
  instead and nothing spins, and a red line under the header says how many jobs
  are waiting, with **See the jobs** opening the Jobs window, the same one the
  **Jobs** button opens ([The Jobs window](browser/jobs-dashboard.md)). Before
  that line, a search with no program to run it spun forever and looked the
  same as one about to finish.
- **Search posts** is the first box in the buttons on the right of the header,
  so the row beneath holds only the tabs and the ticked posts' buttons
  ([Finding a post you remember](reddit/finding-posts.md)).
- **One line.** The network's name and the header's buttons share one line; on
  a phone the buttons take a line of their own under the name, the search box
  keeping room to type and the dropdown's name shortening first.
- **The same dropdown draws Medium's keywords**
  ([The Medium module](medium/medium-module.md)). It is
  `src/components/social/keyword-picker.tsx`; each network passes its own rows,
  its own "⋮" items and its own add box.

### The posts

Each row is the title, then the subreddit, when it went up and where Reddit
put it ("match 9", or "newest 3" for a watch), then the upvotes, the replies and
Block. The arrows over the upvotes and the replies, at the right of the tabs
row, sort by that figure, most first or, pressed again, fewest first. Sorted, the
list is one list with no band headings, because sorting inside the bands
would put the most-upvoted Low fit post under every Strong fit one. An X over
the Block column clears the sort and brings the bands back. A small
speech-bubble mark after the line means the replies are already read. The open
post has a grey ground and a dark line down its left edge.

Under **To look at** each post has a tick box. Ticking one brings in, on the
right of the tabs row, a box that ticks every post listed, "2 ticked",
**Clear** and **Skip 2**. Skip moves them all to Skipped in one request and says if any were
left alone because they were already commented on. The Replied and Skipped
tabs have no tick boxes, because their posts are never skipped. One post can
also be skipped from the right column's Skip.

### The comment box

- **Post comment** stays pressable while the box is empty, and pressing it then
  says to write the comment first. It is greyed out, with the reason on hover,
  only for a reason typing cannot fix: no account picked, the replies not read
  yet, a comment already waiting, or a rule from the account's pace or warm-up.
- **Who it posts as** is the **Comment as** row right above the box, the
  accounts dropdown ([The accounts dropdown](#the-accounts-dropdown)). Past the
  per-hour number, the amber warning shows above the box.
- **Check** shows once there are words to check. Write with AI says in its
  tooltip when no voice is picked and drafts are plain.
- **A narrow box shows the icons alone.** Below 20rem, Write with AI drops its
  words for its sparkle, and below 24rem Check drops its words for its shield,
  each with its name on hover. At a 1440px window the box is 261px, and with
  both words Post sat 7px past the box's edge, measured 15 Oct 2026.

The layout is the Reddit dashboard's, carried over whole: the side columns
collapse to nothing and leave a tab to bring them back, double-clicking a side's
empty space shuts it, the two dividers drag, and the widths are remembered in
the browser (`promo-projects-workspace`). The project lives in the address, so
a reload keeps it, and so do the picked network, the tab and an open window
([Networks as modules](network-modules.md)). Under 1280px the columns stack:
the project, then the keywords and posts. A picked post then takes the whole
screen, with an arrow back to the list. On a phone the five tabs wrap onto a
second line, and Jobs shows its icon alone.

## Pausing a project

**Pause this project**, under the cog at the top of the left column, pauses every account
in it: none of them posts, warms up or takes a health reading until the
project is resumed. A paused project says so at the top of the column, with
**Resume** beside it. Searches still run, because searching is the reader's
work, not an account's.

- **Post is off** for its accounts and says "This account's project is paused.
  Resume the project on its dashboard to post from it again."
- **A comment pressed before the pause waits** and can still be cancelled. The
  browser program looks again every ten minutes and sends it once the
  project is resumed.
- **One account alone** is paused from its row on the
  [Accounts dashboard](reddit/accounts-dashboard.md).

It sits under the cog since the 13 Oct 2026 design. Unlike retiring, a pause is meant to end. The rules are
`src/server/social/pause.ts`; the column is `promo_projects.paused_at`.

## Today

**Today**, a tab in the middle column, is the morning round for this project:
its Strong fit posts, best first, and every reply to its accounts' comments
waiting for an answer. It was a page of its own across every project, first
under Projects in the left menu, until Tyler folded it into the project on 14
Oct 2026, so the morning round across several projects means opening each one.

- **Posts**: each with its subreddit, when it went up and its replies. The
  same post found by two keywords is listed once. Pressing a post's title or
  anywhere on its row moves to To look at with the post open beside the list,
  where Post sends from one of the project's accounts as always. Skip, on a
  row or for ticked rows, moves posts out of the way.
- **Replies**: each sent comment with replies the app has not answered, how
  many, and the newest one's words. Pressing a row opens its Replies window on
  the Comments tab. Check again, for ticked rows, reads the comments again.
  Replies only show once a check has read them.
- **Nothing here sends anything.**
- **The list is read when the tab opens**, with a spinner in its place until
  then. Narrower than 56rem, the subreddit and when it went up fold into the
  line under the title, and a reply's account into the line under its words.

The read is `readToday` in `src/server/social/today.ts`, which takes the
project; the tab is `src/components/social/today/today-dashboard.tsx`.

## The accounts dropdown

The account that comments is picked from **Comment as**, the row right above
the comment box. Tyler, 14 Oct 2026: "Accounts can be a dropdown in the right
panel to select accounts to use". Until then each account was a card in the
left column.

- **Each account** shows a dot, its name, and a line with its status and its
  comments today: "Ready · 0 of 6 today" for a young account, which has a daily
  limit, and "Ready · 3 today" for an older one. The dot is green for Ready or
  Working, amber for Warming up, red for Banned and grey for Not read yet; the
  status is always written beside it, so the colour is never the only sign. The
  picked one has a tick.
- **Under Important and Throwaway.** The accounts sit under "Comment as ·
  Important" and "Comment as · Throwaway". A project holds one kind only, so
  this is usually one heading.
- **Best to comment from first.** Awake with room left in today's pace comes
  first, then awake with no room, then asleep, then warming up (or never read),
  then banned. Accounts that tie keep their oldest-first order. This only
  orders the list. Nothing is picked for the person and nothing posts by
  itself. The rule is `commentReadiness` in `src/lib/social/account-status.ts`.
- **Hovering the picked account** shows its counts in plain figures: "3
  comments in the last hour, 11 today."
- **Add to this project** lists the accounts in no project and not retired.
  When every account is in a project, it says so and points at Manage
  accounts.
- **Take u/name out of this project** shows once an account is picked. Taking
  an account out keeps its comments and settings. Moving an account to another
  project means taking it out first.
- **Manage accounts** goes to the [Accounts dashboard](reddit/accounts-dashboard.md),
  filtered to Reddit, where an account is added, set by hand, paused, retired,
  and where its karma, age and last comment are.

The dropdown is `src/components/social/reddit/account-picker.tsx`.

## Who comments

Nothing is picked when the dashboard opens. Picking an account in the
dropdown above the box picks who comments.

- **No account picked:** the posts still show and drafts can still be written,
  but Post is off and says "Pick an account beside Post comment." It is never
  pressable with no account behind it.
- **Post sends from the picked account,** never the first one. Every rule that
  guards Post follows that account: the warm-up refusal, the pace limit for
  young accounts, and waking hours on its own clock. The comment row stores
  that account, so the Comments tab and the Accounts dashboard
  count it against the right one. A comment waiting for that account's morning
  shows under the post with Cancel comment, as before.
- **The server checks the account too.** It must be the person's own, not
  retired, and in the post's project. An account from another project is
  refused with "That account is not in this post's project"
  (`accountForFind` in `src/server/social/projects.ts`).

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
  A project's page is `workspace.tsx` beside it, its left column
  `project-panel.tsx` and its three columns `project-columns.tsx`. Reddit's
  middle and right columns are `src/components/social/reddit/reddit-module.tsx`:
  `keywords-panel.tsx` (the keywords dropdown) above `finds-panel.tsx` (the tabs and the
  posts), and `answer-panel.tsx` on the right. Endpoints are
  `src/lib/api/social/projects.ts`, and the server is
  `src/server/social/projects.ts`.

Browser profiles and proxies stay app-wide. A project points at accounts, never
at profiles or proxies (Tyler's rule of 5 Oct 2026).
