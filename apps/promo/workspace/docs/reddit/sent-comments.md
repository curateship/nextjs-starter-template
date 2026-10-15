# What happened to your comments

The Comments tab, in the middle column of a project's Reddit module, lists
every comment the project's accounts have sent, with its upvotes, how
many replies sit under it, and whether it is still there. Before it existed the
app sent a comment and forgot it, so nothing showed whether a comment was read,
upvoted, replied to, or removed by a moderator twenty minutes later. Without
that, neither the ranking nor the drafts can be judged.

Three tabs since 12 Oct 2026: **Sent**, every comment that landed; **Posts**,
every post of your own that landed ([Posts of your own](your-own-posts.md));
and **Failed**, every comment, answer and post that did not reach Reddit (below).
`?list=posts` and `?list=failed` open the other two.

Each comment is counted against the account that sent it: the account picked
on the [Projects dashboard](../projects-dashboard.md) when Post was pressed,
stored on the comment as `promo_comments.account_id`. That is what makes an
account Working on the [Accounts dashboard](accounts-dashboard.md). A
retired account's comments stay on this tab.

## Where it is

A tab in each project's Reddit module, beside To look at, Replied, Skipped and
Today, since 14 Oct 2026. Tyler: "Why would reddit comments be on the
sidebar?" ([Networks as modules](../network-modules.md)). A comment is listed in
the project its account is in now, the rule the Projects table counts by, so a
comment from an account taken out of every project shows in no tab until the
account is put back in one.

- **The lists are read when the tab opens**, with a spinner until then.
- **Narrower than 82rem** the account and when it was sent fold into a line
  under the post's title, and **narrower than 68rem** the subreddit, whether it
  is still there, its upvotes and its replies fold into a second line, so
  nothing goes past the middle column's edge.
- **The old address** `/admin/comments` still answers: with `?replies=<id>` or
  `?comment=<id>` it opens the Comments tab of the comment's project, and
  without one the only project's, or the Projects table.

It was a page at `/admin/comments` under Projects in the left menu from 12 Oct
2026, and under Reddit before that. `drizzle/0118_promo_project_networks.sql`
took the link out of every saved left menu.

## What a row says

- **Post**: the title of the post the comment answered, with the comment's own
  words under it ("Edited ·" first once the app has edited it).
- **Account** and **Project**: who sent it, and the project that account is in
  now. With **Sent**, these show only on a window 1536px or wider. Narrower,
  the three fold into one line under the post's title, because at 1440px the
  columns needed 1332px against 1232px of room (measured 13 Oct 2026) and the
  switch and buttons went off the edge.
- **Subreddit**: where it went out. Hides on a phone. Under it, in amber,
  "2 of 5 removed" when checks have found any of your comments in that
  subreddit gone. Only checked comments count, and the words say what the
  checks saw, never "shadowbanned".
- **Project filter** in the toolbar, once there is more than one project to
  tell apart. The planned account filter is part 7 of the Reddit accounts
  dashboard task, not here.
- **Upvotes** and **Replies**: from the last reading. Replies counts every reply
  under the comment, however deep, including the ones Reddit folds away.
- **Still there**: one of the three answers below, with when it was last read.
- **Voice example**: the switch that decides whether drafts copy how this
  comment sounds. See below.
- **Actions**: the replies and answering them, read it again, Edit and Delete.
  Pressing the title, or anywhere else on the row, opens the comment on Reddit.
  The separate open-on-Reddit button went on 13 Oct 2026 to make room for Edit
  and Delete, since the row already does it.

Under the reply count, "2 to answer" says how many replies directly under the
comment have no answer from the app. It shows only once a check has read the
replies' words. [Answering replies](answering-replies.md) has the window the
reply arrow opens.

An answer the app sent to a reply is not a row of its own. It shows under the
reply it answers, in the comment's Replies window.

A comment a phone posted has no link at first, because the Reddit app does
not show one. The reader browser finds it in the post's newest replies a
minute or so later; until then the row has no link to open, and reading it
again, editing it or answering its replies waits for the link
([Reddit on phones](reddit-on-phones.md)).

Only comments that landed are listed on Sent. A failed attempt never reached
anybody, so it has no upvotes or replies to report; it is on the Failed tab.

## Three answers, never two, and one of your own

- **Not read yet.** Nobody has checked it since it went out. The upvotes and
  replies show a dash, never 0, the same rule the posts list follows for
  replies that were never read.
- **There.** A signed-out visitor can read it.
- **Deleted by you.** Promo deleted it on your press. It is never read again.
- **Gone.** A signed-out visitor sees "[removed]" or "[deleted]" in its place,
  or it is no longer in the thread.

A check waiting for the browser says **Reading**, and one that failed says
**Could not read** with Reddit's reason on hover, until a later reading
replaces it.

## Deleting and editing a comment

The last two buttons on a row change the comment on Reddit, from the account
that sent it, because a person pressed them.

- **Edit** (the settings button) opens a window with the words. Save changes
  queues an `edit_comment` job: the comment's own menu, Edit, the old words
  cleared and the new ones typed like a person, Save. Reddit marks it edited.
  The row keeps the words it first went out with (`original_text`), which the
  window shows, and the voice examples use the new words.
- **Delete** asks first, then queues a `delete_comment` job: the comment's own
  menu, Delete, confirm. The row stays, marked **Deleted by you**, and is never
  read again, so its going is never reported as a moderator's removal.
- **Each is proved by Reddit's own record afterwards:** the comment reading
  "[deleted]", or holding the new words. Without that the job fails and says
  the change may not have saved.
- **Refused** for a comment that never landed, is already deleted, or has a
  change on its way, and for an account that is retired, paused or has no
  browser profile. A change that failed says why under the row's state.
- **Tried once,** like a comment, because the browser may have stopped after
  Reddit took it.

The browser steps are `reddit_delete_comment` and `reddit_edit_comment` in
`docker/browser/routines/reddit.py`, built from what a comment's own page
looked like when the reply routine was measured. They are unproven until a
signed-in account has run them.

## The Failed tab

Every comment, answer and post that did not reach Reddit, newest first, read
off its job rather than a comment row, because most failures never make one: a
comment refused before it reached the browser (retired, no profile, already
commented) only fails its job. Before 12 Oct 2026 a failed comment was saved
and then shown nowhere.

- **A row says** what it was, the post or the title, the account, why, and
  when.
- **"May be on Reddit already"** in amber when the browser stopped part-way.
  The title, or anywhere on the row, opens the post on Reddit, the same as a
  row on the Sent tab, so it can be checked by eye before trying again.
- **Try again** puts the words back where they were written and sends
  nothing: a comment opens its post on its project's dashboard with the words
  in the box and its account picked (`?post=&retry=`), an answer opens its
  comment's Replies window, and a post of your own opens New post with its
  words (`?newPost=`).
- **Dismiss**, on a row or for ticked rows, takes it off the tab. The job stays,
  marked with `promo_jobs.dismissed_at`.

The list is `listFailures` in `src/server/social/failures.ts`; the table is
`src/components/social/comments/failed-table.tsx`.

## What rings the bell

A new reply directly under a comment, a comment going from there to gone, and
a comment that failed each ring the bell, once for each thing:
[Promo's bell notices](../notices.md). A reply's notice opens the comment's
Replies window (`?replies=<id>`); a removal's shows that one comment on its own
(`?comment=<id>`), with "Show every comment" beside it. Replies and removals
are only found by a check, and checks only run on a press, so their notices
come after Check.

## How a comment is read

Reading needs the browser, so the round-arrow button on a row, or ticking rows
and pressing Check in the toolbar, writes one `comment_check` job per comment
and returns. The screen asks again every two seconds while any check is waiting
or running, and stops when none is. A press checks at most 50, and a comment
already being read is skipped and counted as skipped.

The check runs in the reader browser, signed in to nobody (Settings >
Behaviour), never in the account's own. With no reader picked, Check is
refused and says to pick one. The reader asks Reddit for the comment twice from
inside a Reddit page: once with no cookies, and once with its own, which are a
stranger's too. **The stranger's answer decides whether it is there**, because
a moderator's removal shows to everybody except the person who wrote the
comment, who still sees their own words. **There for you** can only appear on
checks taken before 12 Oct 2026, when checks still ran in the account's own
browser. One thing is lost by moving: where a subreddit hides new scores, only
the author could see the number, so that comment's upvotes stay "not shown yet"
until Reddit shows them to everybody.

Measured on 11 Oct 2026 against a real r/SaaS comment: Reddit refused the
cookie-less request and answered the browser's own, which was signed out. The
reading was 2 upvotes and 3 replies. Reddit's page showed the same 2 upvotes
and drew 2 replies, because it only draws two levels deep until "continue this
thread" is pressed; Reddit's own data had all 3.

A check has 120 seconds, because a browser that has just opened may spend 45 of them loading Reddit first. A check that runs out is tried again, up to three times, like any read.

Reddit hides a new comment's score in some subreddits. The account sees its own
score anyway, so that is used; if neither view has it, Upvotes says **Hidden**.

The job kind is `comment_check`, not `check`, because `check` already means a
person's look at a profile's browser.

Reading never deletes, edits or posts anything. Checking happens only when a
person presses a button; there is no schedule. Deleting and editing are their
own buttons, above.

## The voice-example switch lives here now

Drafts copy how up to three of your sent comments sound
([writing-comments.md](writing-comments.md)). The switch on each row is the tick
that used to sit on Settings → Reddit account under "Comments the AI copies your
voice from", which existed only because there was no screen of sent comments.
That card is gone, so there is one place to change it.

Switching one off stops the next draft using it; the comment itself is kept.
"Next draft" beside the switch marks the comments the next draft will carry,
worked out per account.

## Where the code is

- `docker/browser/routines/reddit.py`: `reddit_comment_check`, registered as
  `comment_check`.
- `src/server/browser/command.ts`: `redditCommentCheck`.
- `src/server/social/reddit/comment-check.ts`: stores a reading. Only an address
  the app itself wrote, starting `https://www.reddit.com/`, is handed to the
  browser.
- `src/server/social/comments.ts`: the list, and queueing checks.
- `src/components/social/comments/comments-dashboard.tsx`: the tab, which
  reads every list and keeps this project's rows.
  `src/routes/_authenticated/admin/comments.tsx` only sends the old address on.
- The readings are five columns on `promo_comments`: `upvotes`, `reply_count`,
  `still_visible`, `checked_as` and `checked_at`, all null until the first
  reading.
- The same check keeps the words of up to 20 replies directly under the
  comment in `incoming_replies`, null until read, so they can be answered.
  An image built before 12 Oct 2026 does not send them, and the last ones read
  are kept.
