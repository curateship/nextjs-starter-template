# The Projects dashboard

A project is one thing being promoted. It holds a description of what you make,
the Reddit accounts that comment for it, and the keywords that find posts for
them. There are two screens:

- **The Projects table** at `/admin/projects`, reached from **Projects** in the
  left menu, lists every project. Tyler, 12 Oct 2026: "project needs a table
  dashboard".
- **A project's own dashboard** at `/admin/projects/<project id>`, opened from a
  row, puts its description, accounts, keywords and posts on one screen. It
  replaced the Reddit dashboard on 12 Oct 2026.

Tyler, 12 Oct 2026: "Build a new dashobard (3 col) for "Projects" this is where
we combine everything together to manage a project. Left panel holds project
discription, under it shows all the accounts under this project. Clicking on the
account opens up in the middle panel to search for keywords and showing all the
posts and the right col shows the post and comment box"

## Tyler's rules, 12 Oct 2026

- **Projects replaces the Reddit dashboard.** The Reddit entry in the left menu
  is gone, and `/admin/reddit` sends to `/admin/projects`, so an old bookmark
  still lands.
- **Keywords belong to the project.** Every account in the project sees the same
  keywords and posts. Clicking an account only changes who comments.
- **An account belongs to one project only.**
- **The AI is told the project description.** It replaces the voice's "what you
  make" box. The voice keeps only how it sounds and its comment rules.

## The Projects table

Built like the Voices dashboard, from the shell's table. Each row is a project:
its name with the first line of its description, then how many accounts it
holds (retired ones not counted), its keywords, the posts still waiting to be
looked at, the comments its accounts have sent, and when the last one went.
Comments count toward the project the sending account is in now.

- **A row opens the project's own dashboard,** a page of its own because that
  is where the work is done. The arrow at the top of the project's left column
  comes back here.
- **New project** asks for a name and opens the new project.
- **Delete,** on a row or for the ticked rows in one request, deletes the empty
  projects and keeps any that still hold accounts or keywords, saying what each
  one holds.

## The three columns

Tyler sent the design on 13 Oct 2026, and the dashboard was rebuilt to match
it.

- **Left: the project.** An arrow back to the Projects table, the project's
  name, and a cog. Under them the project's picture, its name in large type
  and its description, then **Accounts** with **Add account**.
- **The cog** opens a box with the name and the description, both saving as
  they are typed with no Save button, then **New project**, **Pause this
  project** (or Resume) and **Delete project**. Another project is picked from
  the Projects table, which the arrow goes back to.
- **The picture** is the shared image field: pressing it opens the media
  library to upload or pick one, and the X on its corner removes it. It saves
  the moment it changes. A project with none shows "Add a picture". The server
  takes only an image you uploaded, the same check as the shell's profile
  photo, and refuses any other address.
- **Middle: keywords across the top, posts under them.** The keywords are chips
  in the column's header with **Add keyword** after them, and **Search
  posts**, **Create post** and a "⋮" menu on the right. The menu holds
  **Ideas** and **Self-promotion threads**, each of which opens a window.
  Under the header, the To look at, Replied and Skipped tabs, then the posts
  in their three bands.
- **Right: the post and the comment box.** The header names the subreddit, with
  Skip and the way to Reddit. Under the post, "Replies not read yet" with Read
  the replies beside it. At the bottom, the subreddit's rules line, then one
  box holding the words, **Write with AI** and **Check** along its bottom, who
  it posts as, and **Post comment**.

### Keyword chips

- **A chip** shows the keyword, how many posts it lists, and when it last
  searched ("· 6 days ago").
- **Pressing the name** lists that keyword's posts alone. Pressing it again
  goes back to every keyword's posts in one ranked list, which is what shows
  when no chip is chosen. A row then names the keyword that found it, once the
  project has more than one.
- **The timer icon**, beside the arrow, switches its timed searches off and
  on: a timer while it searches by itself, a crossed-out timer while it only
  searches when pressed. The time before it is plain text. A failed last
  search says "· search failed" in red, with the reason on hover.
- **No hover on the name or on a post row.** Tyler asked for both tooltips to
  go on 13 Oct 2026.
- **The arrow** searches again; **the X** removes the keyword and everything it
  found, at once, with no question asked.
- **Add keyword** opens the words, subreddits, Reddit's order and how far back
  in a box under it, with **Add and search**. It opens by itself while the
  project has no keywords. Pressing Add and search with both boxes empty says
  what is missing and marks the box.
- **While a search waits or runs** the chip says "· searching" and its arrow
  spins. When the browser program is not running, the chip says "· waiting"
  instead and nothing spins, and a red line under the chips says how many jobs
  are waiting, with **See the jobs** opening the Jobs dashboard
  ([The Jobs dashboard](browser/jobs-dashboard.md)). Before that line, a search with no
  program to run it spun forever and looked the same as one about to finish.
- **Search posts** is the first box in the buttons on the right of this row,
  so the row beneath holds only the tabs and the ticked posts' buttons
  ([Finding a post you remember](reddit/finding-posts.md)).
- **A narrow column:** when the chips and the buttons do not both
  fit, the chips keep at least 28rem and the buttons move to a row of their
  own under them, on the right.

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
- **Who it posts as** sits beside Post comment ("as u/name"), with today's
  counts in its tooltip. Past the per-hour number, the amber warning shows
  above the box. The account's comments today are on its card on the left.
- **Check** shows once there are words to check. Write with AI says in its
  tooltip when no voice is picked and drafts are plain.

The layout is the Reddit dashboard's, carried over whole: the side columns
collapse to nothing and leave a tab to bring them back, double-clicking a side's
empty space shuts it, the two dividers drag, and the widths are remembered in
the browser (`promo-projects-workspace`). The project lives in the address, so
a reload keeps it. Under 1280px the columns stack: the project, then the
keywords and posts. A picked post then takes the whole screen, with an arrow
back to the list.

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
  [Reddit accounts dashboard](reddit/accounts-dashboard.md).

It sits under the cog since the 13 Oct 2026 design. Unlike retiring, a pause is meant to end. The rules are
`src/server/social/pause.ts`; the column is `promo_projects.paused_at`.

## Today

`/admin/today`, first under Projects in the left menu, is the morning round in
one place: every project's Strong fit posts, best first, and every reply
waiting for an answer.

- **Posts**: each with its project, subreddit, when it went up and its
  replies. The same post found by two keywords is listed once. Pressing a
  post's title or anywhere on its row opens it on its project's dashboard (`?post=<id>`), where Post sends
  from one of that project's accounts as always. Skip, on a row or for ticked
  rows, moves posts out of the way.
- **Replies** (`?tab=replies`): each sent comment with replies the app has not
  answered, how many, and the newest one's words. Pressing a row opens its
  Replies window on the Comments screen. Check again, for ticked rows, reads
  the comments again. Replies only show once a check has read them.
- **Nothing here sends anything.**

`drizzle/0110_promo_new_features.sql` adds the Today link to every saved left
menu that has a Projects entry. The read is `readToday` in
`src/server/social/today.ts`; the screen is
`src/components/social/today/today-dashboard.tsx`.

## The accounts on the left

Each account is a card: a dot and its name, its status with a small arrow, and
its comments today. The dot is green for Ready or Working, amber for Warming
up, red for Banned and grey for Not read yet; the status is always written
beside it, so the colour is never the only sign. A young account, which has a
daily limit, shows a bar filling toward it and "1 of 6". An older account has
no daily limit, so it shows the count alone ("0 today") and no bar. The mock
drew a bar on the Ready account too; with no limit there is nothing for it to
fill toward.

**The status opens the card** (the small arrow turns up), as Tyler drew it on
13 Oct 2026. The card then lists:

- **Daily limit:** "6 comments" for a young account, "No limit" for an older one.
- **Asleep until:** the time it wakes, on its own clock. While it is awake the
  row reads "Awake: Now".
- **Karma** and **Account age:** the last reading, or "Not read yet". Karma is
  never shown as 0 when nobody has read it.
- **Last comment:** when its last comment reached Reddit, or "None yet".

Under the rows sit any warning, **Open on Reddit** (the account's Reddit page
in a new tab) and an **X** that takes the account out of this project. An
account never seen signed in has no Reddit page, so the card says so where the
button would be.
Cards are built by hand rather than with the dashboard table, because a side
column's table forces a width and clips the figures.

**The list is ordered best to comment from first.** Awake with room left in
today's pace comes first, then awake with no room, then asleep, then warming up
(or never read), then banned. Accounts that tie keep their oldest-first order.
This only orders the list. Nothing is picked for the person and nothing posts
by itself. The rule is `commentReadiness` in `src/lib/social/account-status.ts`.

**Add account** offers only accounts in no project and not retired, in a menu.
When every account is in a project, the menu says so and links to the Reddit
accounts dashboard. Moving an account to another project means taking it out
with the X on its opened card first.
Taking an account out keeps its comments and settings.

## Who comments

Nothing is clicked when the dashboard opens. Clicking a row picks the account
that comments, and the row turns grey.

- **No account clicked:** the posts still show and drafts can still be written,
  but Post is off and says "Pick an account on the left." It is never pressable
  with no account behind it.
- **Post sends from the clicked account,** never the first one. Every rule that
  guards Post follows that account: the warm-up refusal, the pace limit for
  young accounts, and waking hours on its own clock. The comment row stores
  that account, so the Comments dashboard and the Reddit accounts dashboard
  count it against the right one. A comment waiting for that account's morning
  shows under the post with Cancel comment, as before.
- **The server checks the account too.** It must be the person's own, not
  retired, and in the post's project. An account from another project is
  refused with "That account is not in this post's project"
  (`accountForFind` in `src/server/social/projects.ts`).

## What the AI is told about what you make

The project's description, under "WHAT I MAKE, if it is genuinely relevant".

- **The clicked account's project is the one that counts.** Its voice and its
  sent comments are used too.
- **Before an account is clicked,** Write with AI uses the post's own project's
  description, with no voice and no example comments.
- **An account in no project drafts with no product text,** the same as an empty
  product box did before. It is never refused.

## Making and deleting

- **New project**, on the table or under a project's cog, asks only for a name
  and opens the new project.
- **Deleting is refused** while the project holds accounts in use or keywords,
  and the message says how many of each, such as "Second product still holds 1
  keyword. Remove its keywords first, then delete it." Nothing is deleted along
  with a project. A retired account still pointing at it is let go.
- **Two projects may save the same words.** One saved search per set of words,
  and one watch per subreddit, is now a rule inside a project, not across
  everything.

## What holds it up

- **Tables.** `promo_projects` holds the name, the description and the
  picture (`image_url`, a media address or "", added by
  `drizzle/0111_promo_project_image.sql`).
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
  Projects at the end of its Administration section.
- **The warm-up joins subreddits from its own project.** The daily warm-up
  visit joins subreddits Promo found posts in for the keywords of the
  account's project, so an account reads as one person with one interest.
- **Code.** The table is `src/components/social/projects/projects-table.tsx`.
  A project's page is `workspace.tsx` beside it, its left column
  `project-panel.tsx`. The middle column is
  `src/components/social/reddit/keywords-panel.tsx` (the chips) above
  `finds-panel.tsx` (the posts); the right is `answer-panel.tsx`. Endpoints are
  `src/lib/api/social/projects.ts`, and the server is
  `src/server/social/projects.ts`.

Browser profiles and proxies stay app-wide. A project points at accounts, never
at profiles or proxies (Tyler's rule of 5 Oct 2026).
