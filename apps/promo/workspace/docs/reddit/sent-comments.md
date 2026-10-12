# What happened to your comments

The Comments screen lists every comment the app has sent, with its upvotes, how
many replies sit under it, and whether it is still there. Before it existed the
app sent a comment and forgot it, so nothing showed whether a comment was read,
upvoted, replied to, or removed by a moderator twenty minutes later. Without
that, neither the ranking nor the drafts can be judged.

## Where it is

`/admin/comments`, under Reddit in the left menu. The left menu is a saved list
on each workspace, so `drizzle/0105_promo_comment_checks.sql` adds the link to
the saved lists: under the Reddit link where there is one, and otherwise as a
Reddit link with Comments under it at the end of the Administration section. A
menu that already links to `/admin/comments`, or has never been saved, is left
alone.

## What a row says

- **Post**: the title of the post the comment answered, with the comment's own
  words under it.
- **Subreddit** and **Sent**: where and when it went out. Both hide on a phone.
- **Upvotes** and **Replies**: from the last reading. Replies counts every reply
  under the comment, however deep, including the ones Reddit folds away.
- **Still there**: one of the three answers below, with when it was last read.
- **Voice example**: the switch that decides whether drafts copy how this
  comment sounds. See below.
- **Actions**: read it again, and open it on Reddit. Pressing anywhere else on
  the row also opens the comment on Reddit.

Only comments that landed are listed. A failed attempt never reached anybody, so
it has no upvotes or replies to report.

## Three answers, never two

- **Not read yet.** Nobody has checked it since it went out. The upvotes and
  replies show a dash, never 0, the same rule the posts list follows for
  replies that were never read.
- **There.** A signed-out visitor can read it.
- **Gone.** A signed-out visitor sees "[removed]" or "[deleted]" in its place,
  or it is no longer in the thread.

A check waiting for the browser says **Reading**, and one that failed says
**Could not read** with Reddit's reason on hover, until a later reading
replaces it.

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

Nothing here deletes, edits or posts anything. Checking happens only when a
person presses a button; there is no schedule.

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
- `src/components/social/comments/comments-dashboard.tsx` and
  `src/routes/_authenticated/admin/comments.tsx`: the screen.
- The readings are five columns on `promo_comments`: `upvotes`, `reply_count`,
  `still_visible`, `checked_as` and `checked_at`, all null until the first
  reading.
