# Commenting inside a project

Each network in a project's left panel has two rows in the Networks block: **Posts**,
your own posts on it, and **Commenting**, the other people's posts its
keywords found and what you sent under them. Picking a row fills the middle
and right columns with it.

Tyler, 5 Nov 2026: "Every middle panel clicking from the left panel should
show my own posts but reddit, medium, x and linkedin are showing search to
comments. We either need to move the commenting to another dashboard or put it
somewhere thats more seperate from my post content." He first picked another
dashboard; the same day, once it was built: "I think its better that
commenting lives within its project. Make each network have its own card and
inside that cade have 2 rows, one for posts and one for commenting". The task
is `workspace/tasks/Projects/commenting-dashboard.md`.

## Tyler's answers, 5 Nov 2026

- **Commenting lives inside its project,** as a row of each network's card.
  There is no Commenting page in the left menu. The separate dashboard at
  `/admin/commenting` was built and taken out the same day.
- **Posts first.** A network opens on its Posts row.
- **Commenting opens on To look at.**
- **Pause commenting stops one network** on one project.
- **The same words on every network:** To look at, Replied, Skipped, Today,
  Sent, and "Comment as".
- **Instagram and TikTok have Posts alone.** They answer comments under your
  own posts, on their Posts row (Tyler, 16 Oct 2026: "IG and tiktok is not
  reddit").

## A network's rows

Since 12 Nov 2026 the networks are one fixed Networks block at the top of the
project's page, not a card each (Tyler: "Description page + Networks block";
[A project's own page](projects-dashboard.md#a-projects-own-page)). Tyler's
rows of 5 Nov 2026 stay.

- **Each network** is its mark and name, with Paused after it while the
  whole network is paused. Pause and Take off for the whole network are in
  the project's ⋮, under Networks.
- **Posts** has how many of your posts on it need you in its pill: failed
  ones and drafts not sent yet.
- **Commenting** has what waits in its pill: strong posts and replies to
  answer. Its Pause (below) shows while the row is pointed at, and it says
  Paused while it is.
- **Picked, Commenting lists its keywords under it,** under "Keywords · 3"
  with a + to add one: All keywords, then a row per keyword (part 11; below).
- **The picked row** has the sliding bar, as a Dashboards row does.

## Commenting's middle and right columns

- **Middle: the posts to comment on.** On Reddit since 12 Nov 2026 the one
  header holds the tabs, Search posts, the keyword picker and a "⋮" with
  Jobs; the other networks' headers still name the network, with Search
  posts, Jobs and a "⋮" on the right, until their part of the redesign. Under it the warnings about
  searching (no search account, the browser program not running), then the
  tabs: To look at, Replied, Skipped, Today and Sent. LinkedIn adds People.
- **Right: the post and the comment box.** With no post picked, the first one
  in the list opens by itself, so the column is never empty (part 14). It is
  worked out from the list rather than written to the address, so on a phone
  the list stays in front until a post is tapped.

## What sits on each row

| Network | Commenting | Posts |
| --- | --- | --- |
| Reddit | To look at, Replied, Skipped, Today, Sent (was Comments) with its Failed list of comments, Jobs, self-promotion threads, keyword ideas | Posts and Failed posts, New post in the right column |
| Medium | To look at, Replied, Skipped, Today, Sent (was Responses) | Posts (was Articles), Publications |
| X | To look at, Replied, Skipped, Today, Sent (was Replies, the replies you sent) | Posts, Replies (posts naming your accounts), Communities |
| LinkedIn | To look at, Replied (was Commented), Skipped, Today, Sent (was Comments), People | Posts |

Each tab keeps its old value in the address (`?tab=responses`, `?tab=commented`
and so on), and only its word changed. X's `?tab=mentions` is new: the Posts
row's Replies tab.

- **People goes with commenting** because Connect is pressed on a sent comment
  ([People on LinkedIn](linkedin/people.md)).
- **Communities and Publications go with your posts,** because they are where
  your own posts go.
- **A link to the other row switches to it.** X's Today pointing at a post of
  yours, a quote post's reply from X's Posts, Medium's Today pointing at an
  article, and LinkedIn's Repost each open the other row of the same card.
- **Post ideas still read what Commenting found.** LinkedIn's Post ideas and
  the "a Reddit comment of yours that did well" source on X, LinkedIn and
  Medium read the same stored finds and comments as before.

## The counts

- **Commenting's** is filled by `loadProject` in
  `src/lib/api/social/projects.ts` (`networkCounts`). Reddit's is Today's posts
  and its unanswered replies; Medium's and X's are strong posts plus replies to
  answer; LinkedIn's adds the connection requests waiting.
- **Posts'** is `readPostCounts` in `src/server/social/post-counts.ts`
  (`postCounts`).

## Pause commenting

The Pause on a card's Commenting row holds back that network's commenting on
that project, and only that (part 20). The project's own posts on the
network, its warm-up and its readings carry on.

- **What waits:** a Reddit comment and an answer to a reply, a Medium response,
  an X reply, quote or answer, a LinkedIn comment and a LinkedIn connection
  request (`COMMENTING_JOB_KINDS` in `src/lib/social/options.ts`).
- **Pressed while paused,** each is refused with "Commenting on Reddit is
  paused on this project. Resume it on the network's Commenting row in the
  project's left column first." (`refuseWhileCommentingPaused` in
  `src/server/social/pause.ts`).
- **Pressed before the pause,** it waits in the queue and goes once commenting
  is resumed, like a paused account's comment, and can still be cancelled.
- **Pause in the card's ⋮** is different: it stops the whole
  network on that project, posts and comments alike.

The column is `promo_projects.paused_commenting`, added by
`drizzle/0137_promo_commenting.sql`. The test is "refuses a comment while
commenting on Reddit is paused on the project, and a post of your own still
goes" in `src/server/social/posting.test.ts`.

## The address

`?network=` and `?side=commenting` for the Commenting row (none is Posts);
Reddit's tab as `?view=` and the other networks' as `?tab=` (none is To look
at); `?keyword=<id>`; `?open=<id>` the post or row open on the right;
`?list=failed` Sent's Failed list; `?replies=<id>` and `?comment=<id>` a sent
Reddit comment; `?window=jobs`; `?post=<id>` a Reddit post to open; and
`?retry=<job id>` a failed comment's words back in its box.

`sideOf` in `src/lib/social/project-address.ts` reads the row. Anything only
Commenting has also opens it, which is how addresses written before 5 Nov
2026 still land (part 22):

| Address | Opens |
| --- | --- |
| `?view=…` (Reddit's tabs), `?post=`, `?retry=`, `?replies=`, `?comment=` | Reddit's Commenting, on that tab |
| `?view=comments&list=posts` | Reddit's Posts |
| `?network=medium`, `x` or `linkedin` with a commenting `?tab=` | That network's Commenting, on that tab |
| `?network=x` or `linkedin` with `?open=` and no tab | That found post on Commenting, since your own posts always name their tab |
| `?keyword=` or `?window=jobs` | Commenting |
| `/admin/comments` | Reddit's Sent tab; `?tab=posts` Reddit's Posts |

`/admin/today` and `/admin/jobs` are gone since 13 Nov 2026
([Old addresses](old-addresses.md)).

New notices write the Commenting row's address straight away
(`commentingHref`): failed comments, responses and replies, found posts on X
and LinkedIn, sent replies and comments. A failed post of your own opens the
Posts row.

- **One old address cannot be told apart.** An X mention notice written before
  5 Nov 2026 said `tab=replies`, so it opens X's Sent tab on Commenting rather
  than the mention. New ones open the Posts row's Replies tab.

## Guests sent from Project

A guest's page is the project's dashboard, so they get both rows on each card.
They comment on Reddit as before; Medium, X and LinkedIn say they are worked by
the project's owner. They have no Pause and no Jobs.
[Guests sent from Project](project-guests.md) has the rest.

## Reddit's Commenting

### The keywords list

Tyler, 21 Oct 2026, with a picture of the chips taking two lines at three
keywords: "have to organize the keywords ui better". Of three drawings he
picked one dropdown in the middle column's header, for every network. On 5 Nov
2026 he picked the keywords as a list in the project's left column, under Commenting instead
(part 11), so the list that dropdown held is drawn there, open, under
**Keywords**. The same day the list took the left panel standard: the heading
counts the keywords ("Keywords · 3"), a + beside it adds one, and a row's
buttons show on hover (left-column-standards task, parts 16 to 19).

- **The list** has All keywords first, grey when picked, then a row per
  keyword. Picking a row lists that keyword's posts
  alone; All keywords goes back to every keyword's posts in one ranked list,
  which is what shows when the screen opens. The picked keyword is in the
  address as `?keyword=<id>`, so a reload keeps it. A post row then names the keyword that found it, once the project has
  more than one.
- **A keyword's row** shows its name and post count, and under them when it
  last searched and what it searches ("2 hours ago · Past week · All of
  Reddit", or "Watching · Newest first" for a watch). A failed last search says
  "search failed" in red, with the reason on hover. No hover on the name:
  Tyler asked for those tooltips to go on 13 Oct 2026.
- **Three buttons on the row's right,** shown while the row is pointed at or
  holds the keyboard's focus, so a keyword's name has the column's width; on
  a phone they always show. The timer switches its timed searches off and on
  (a timer while it searches by itself, a crossed-out timer and "timer off"
  in its line while it only searches when pressed); the arrow searches again;
  the "⋮", in the shell's one dropdown look, holds **Remove**, which removes
  the keyword and everything it found, at once, with no question asked. A
  search running shows its spinner after the count whatever the pointer does.
- **The + beside Keywords** opens the network's add form as a dropdown: the
  words, subreddits, Reddit's order and how far back, with **Add and search**.
  While the project has no keywords the form sits open under the heading
  instead. Pressing Add and search with both boxes empty says what is missing
  and marks the box.
- **While a search waits or runs** its row says "searching" and its arrow
  spins. When the browser program is not running, the row says "waiting"
  instead and nothing spins. On Reddit a small amber warning in the header
  says how many jobs are waiting and opens the Jobs window when pressed;
  Medium, X and LinkedIn still draw a red line under the header with **See
  the jobs** until their part of the redesign. Both open the same window as
  **Jobs** in the ⋮ ([The Jobs window](browser/jobs-dashboard.md)). Before
  that line, a search with no program to run it spun forever and looked the
  same as one about to finish.
- **Search posts** is the first box in the buttons on the right of the middle
  column's header, so the row beneath holds only the tabs and the ticked posts' buttons
  ([Finding a post you remember](reddit/finding-posts.md)).
- **The keyword rows** are drawn as the Networks block's rows: grey names,
  the picked one dark with the small bar, the count in the grey pill, and
  "Keywords · 3" as a quiet line over them with its +. A keyword's last search
  shows on hover, and in the row only while it searches or after it failed.
- **The same list draws Medium's, X's and LinkedIn's keywords.** It is
  `src/components/social/keyword-picker.tsx`; each network passes its own rows,
  its own "⋮" items and its own add box from its header, and the picker draws
  them into the left column through `KeywordListSlotContext`
  (`keyword-list-slot.ts`). On a phone the left column stays drawn behind its
  name, so the list is always there.

### The posts

Since 12 Nov 2026 Reddit's posts are the dashboard's table (Tyler, of the
list before: "this is a crazy ui ... i dont even know what to look at"):

- **Columns:** Post, Where (the subreddit, when it went up, where Reddit put
  it such as "match 9", and the keyword when several are listed together),
  Upvotes and Replies. A long title is cut short with "…", so the figures
  always show; Where drops out first as the middle narrows.
- **Groups:** Strong fit, Possible and Low fit, each folding from its
  heading. The Upvotes and Replies headings sort by that figure, most first
  or, pressed again, fewest first; sorted, the list is one list with no
  groups, since sorting inside them would put the most-upvoted Low fit post
  under every Strong fit one. The Post heading brings the groups back.
- **The open post** is dark with the small bar before it. A small
  speech-bubble mark after the title means the replies are already read.
- **Select** in the header, on To look at only, shows tick boxes; the
  ticked posts' "N selected" menu has Skip, one request, saying if any were
  left alone because they were already commented on.
- **A row's right-click menu** has Mass select, Skip (on To look at), Open
  on Reddit, and Block the subreddit in red (never for a post already replied
  to, nor for a guest). One post can also be skipped from the right panel.
- **When the browser program is not running,** a small amber warning sits
  in the header beside Select: the triangle and how many jobs wait (Tyler,
  12 Nov 2026: "this belong somewhere else so that it doesnt take up a row of
  space"). Pointing at it says the whole sentence; pressing it opens the Jobs
  window. A guest sees the warning with nothing to press.

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

### Today

**Today**, a tab in Commenting's middle column, is the morning round for the
picked project: its Strong fit posts, best first, and every reply to its
accounts' comments waiting for an answer. It was a page of its own across every
project until Tyler folded it into the project on 14 Oct 2026, and it moved
with the rest of commenting on 5 Nov 2026.

- **Posts**: each with its subreddit, when it went up and its replies. The
  same post found by two keywords is listed once. Pressing a post's title or
  anywhere on its row moves to To look at with the post open beside the list,
  where Post sends from one of the project's accounts as always. Skip, on a
  row or for ticked rows, moves posts out of the way.
- **Replies**: each sent comment with replies the app has not answered, how
  many, and the newest one's words. Pressing a row opens its Replies window on
  the Sent tab. Check again, for ticked rows, reads the comments again.
  Replies only show once a check has read them.
- **Nothing here sends anything.**
- **The list is read when the tab opens**, with a spinner in its place until
  then. Narrower than 56rem, the subreddit and when it went up fold into the
  line under the title, and a reply's account into the line under its words.

The read is `readToday` in `src/server/social/today.ts`, which takes the
project; the tab is `src/components/social/today/today-dashboard.tsx`.

### The accounts dropdown

The account that comments is picked from **Comment as**, the row right above
the comment box, the same words on every network. Tyler, 14 Oct 2026: "Accounts can be a dropdown in the right
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
- **Manage accounts** goes to [the Projects dashboard's Accounts](reddit/accounts-dashboard.md),
  filtered to Reddit, where an account is added, set by hand, paused, retired,
  and where its karma, age and last comment are.

The dropdown is `src/components/social/reddit/account-picker.tsx`.

### Who comments

Nothing is picked when the dashboard opens. Picking an account in the
dropdown above the box picks who comments.

- **No account picked:** the posts still show and drafts can still be written,
  but Post is off and says "Pick an account beside Post comment." It is never
  pressable with no account behind it.
- **Post sends from the picked account,** never the first one. Every rule that
  guards Post follows that account: the warm-up refusal, the pace limit for
  young accounts, and waking hours on its own clock. The comment row stores
  that account, so the Sent tab and the Projects dashboard's Accounts
  count it against the right one. A comment waiting for that account's morning
  shows under the post with Cancel comment, as before.
- **The server checks the account too.** It must be the person's own, not
  retired, and in the post's project. An account from another project is
  refused with "That account is not in this post's project"
  (`accountForFind` in `src/server/social/projects.ts`).

## What holds it up

- **The page** is the project's own, `src/routes/_authenticated/admin/projects_.$projectId.tsx`,
  and `src/components/social/projects/workspace.tsx` draws the picked row.
- **The cards** are `ProjectNetworks` in `project-panel.tsx`, which also holds
  the element the keywords are drawn into.
- **The networks** are their own modules with `side="commenting"` or
  `side="posts"` (`medium-module.tsx`, `x-module.tsx`, `linkedin-module.tsx`).
  Reddit's Commenting is `reddit-module.tsx` and its Posts
  `reddit-posts-module.tsx`. Which tab belongs to which row is each network's
  `options.ts`; the two sides are named in `src/lib/social/sides.ts`.
