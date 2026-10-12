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

- **Left: the project.** An arrow back to the Projects table, a picker to move
  between projects, and New project (+) and Delete beside the title. Under it the name and the description, both
  saving as they are typed, with no Save button. Under those, the project's
  accounts, then an "Add an account" picker.
- **Middle: the keywords above the posts.** The same keywords panel and posts
  list the Reddit dashboard had, showing only this project's keywords and their
  posts. Everything means every keyword in this project. A keyword made here
  goes in this project.
- **Right: the post and the comment box**, the same panel as before. It now says
  who it posts as: "Posts as u/name." above the buttons.

The layout is the Reddit dashboard's, carried over whole: the side columns
collapse to nothing and leave a tab to bring them back, double-clicking a side's
empty space shuts it, every divider drags, and the widths are remembered in the
browser (`promo-projects-workspace` for the columns, `promo-projects-middle` for
the keywords and posts). The project picked lives in the address, so a reload
keeps it. Under 1280px the columns stack: project, keywords, posts. A picked
post then takes the whole screen, with an arrow back to the list.

## The accounts on the left

Each account is a row with its name, its status badge from the Reddit accounts
dashboard, and its pace for today: "2 of 6 comments today" for a young account,
which has a limit, or the count alone for an older one. An asleep account adds
"asleep until" and the time. Rows are built by hand rather than with the
dashboard table, because a side column's table forces a width and clips the
figures.

**The list is ordered best to comment from first.** Awake with room left in
today's pace comes first, then awake with no room, then asleep, then warming up
(or never read), then banned. Accounts that tie keep their oldest-first order.
This only orders the list. Nothing is picked for the person and nothing posts
by itself. The rule is `commentReadiness` in `src/lib/social/account-status.ts`.

**Add an account** offers only accounts in no project and not retired. Moving an
account to another project means taking it out with the X on its row first.
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

- **New project**, on the table or the + in a project, asks only for a name
  and opens the new project.
- **Deleting is refused** while the project holds accounts in use or keywords,
  and the message says how many of each, such as "Second product still holds 1
  keyword. Remove its keywords first, then delete it." Nothing is deleted along
  with a project. A retired account still pointing at it is let go.
- **Two projects may save the same words.** One saved search per set of words,
  and one watch per subreddit, is now a rule inside a project, not across
  everything.

## What holds it up

- **Tables.** `promo_projects` holds the name and description.
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
  `project-panel.tsx`. Endpoints are
  `src/lib/api/social/projects.ts`, and the server is
  `src/server/social/projects.ts`.

Browser profiles and proxies stay app-wide. A project points at accounts, never
at profiles or proxies (Tyler's rule of 5 Oct 2026).
