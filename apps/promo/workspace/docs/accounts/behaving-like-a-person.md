# Behaving like a person

Every account acts the way a person would, wherever it runs. It never searches,
it visits Reddit around each comment instead of jumping straight to the post,
it keeps waking hours, it warms up before its first comment, a young account
has a pace limit, and its clicks and scrolls look like a hand. The numbers all
live in Settings → Behaviour, which saves as it changes.

## Why

Tyler, 9 Oct 2026: "the finger print is probably not the issue but the behavior
of the account is." Reddit sees an account's whole history. An account that
never browses and goes straight to posting, at speed, looks like a bot on any
device. Before this, Promo's account searched in its own signed-in browser,
asked Reddit for the results as raw data, opened each post by its address and
posted, with nothing before or after.

These rules belong to every account, on a browser profile or on a phone, so they
live here and not in the phone farm's task files. On a phone, since 14 Oct
2026, the comment's visit, its typing and its taps follow them
([Reddit on phones](../reddit/reddit-on-phones.md)); the daily warm-up still
runs on browser profiles only.

## Tyler's answers, 12 Oct 2026

- Warm-up lasts 3 days.
- An account under 90 days old is young: at most 2 comments an hour and 6 a day.
- A visit never upvotes. Upvoting looks more human, but it is a public action no
  person pressed.
- One reader browser serves every account.

## The reader browser

The account Reddit sees commenting never searches. A browser profile signed in
to nobody, the reader, does it instead, picked once in Settings → Behaviour.
Make it on the Browser profiles dashboard with a proxy of its own and leave it
signed out.

- **What runs in the reader:** keyword searches and subreddit watches, reading a
  post's replies, a subreddit's rules, the checks on sent comments, and the
  stranger's half of the account's health reading.
- **What runs in the account's own browser:** only the visit around a comment,
  the daily warm-up, and the account's own half of the health reading.
- **Raw data stays in the reader.** Asking Reddit for results as data (`.json`)
  is fine from a browser signed in to nobody. An account's browser now only
  visits pages. It still reads Reddit's "who am I" after each job to see who is
  signed in.
- **No reader, no search.** A search, a reply read, a rules read or a comment
  check pressed with no reader picked is refused at once, saying to pick one. It
  is never quietly run in the account's browser instead.
- **A reader must stay signed out.** A profile holding an account is not offered
  as the reader, and the account's picker leaves the reader out. If the reader
  is found signed in to Reddit, before or after a job, the job is refused and
  says so.

Reader jobs run in the reader's own lane, so a search never waits behind a
comment visit, which can take ten minutes.

## A visit around every comment

After Post is pressed, the account's browser:

1. Opens Reddit's home feed and scrolls it for 1.5 to 3.5 minutes, opening one
   or two posts along the way, reading each for a few seconds and going back.
2. Goes to the post through its subreddit's newest posts, pressing its title
   when it shows up within a few scrolls. An older post usually does not, and
   then the browser goes to the post's address, as before.
3. Reads the post, types the comment at a person's pace and presses Comment.
4. Scrolls the feed for another 25 to 75 seconds.

Every length is drawn fresh, so two visits never take the same time or path.

- **A failure in the feed before never stops the comment.** It is written into
  the visit's record and the comment carries on.
- **Nothing after the comment can fail it.** The comment is on Reddit by then.
  It is still sent once and never retried.
- **The record:** each sent comment keeps its visit (`promo_comments.visit`):
  seconds in the feed before and after, posts opened, how it reached the post
  (through the subreddit or by address), how many scrolls, and any step that
  failed. The browser's log has the same line, starting `comment visit:`.
- **Time:** the browser allows a visit 15 minutes and plans to finish by about
  13; the app waits 15.5, and a comment's claim on the queue lasts 25.

Measured on 12 Oct 2026 in the real browser image, signed out: two visits took
82 and 104 seconds in the feed, opened one post each, made 31 and 37 scrolls of
different sizes, and both reached their target post through r/AskReddit's
newest posts with nothing failing. A comment itself is still to be proved by one
real comment Tyler presses.

## Waking hours

Every account has waking hours on its own clock, 8:00 to 23:00 unless changed.
The clock is the one its browser shows: the time zone of the proxy's outside
address, from the proxy's last test, then the time zone the browser last showed
a site, then UTC. An account behind a German proxy wakes at German morning.

- **A comment pressed outside the hours waits.** It is not refused. The post on
  the Projects dashboard says when it goes, with a Cancel comment button until
  then, and a second Post on that post is refused while it waits.
- **The warm-up runs only inside the hours.**
- **A health reading may run at any hour,** because it only reads.
- A comment taken off the queue outside the hours, because the hours changed
  after it was pressed, goes back to wait without counting as a try.

## Warm-up

An account Reddit made fewer than 3 days ago (the setting) is warming up.

- **Post is refused** with the day and time the warm-up ends. An account whose
  age Promo has never read is refused too, with how to read it (Check now on
  the Accounts dashboard), because nobody can tell when its warm-up ends.
- **Once a day,** at a time picked at random within the next four hours of its
  waking day, a signed-in warming account visits Reddit: 3 to 7 minutes of
  feed, two to four posts opened, and one or two subreddits joined in the middle
  of the visit. The subreddits are the ones Promo has found the most posts in
  for the saved keywords, leaving out blocked ones and ones already joined. It
  never comments and never votes.
- **The profile's label follows it.** A profile with no label gets Warming while
  it warms, and Warming moves to Ready when the warm-up ends. Banned and any
  label a person made are never touched. The labels are the ones the Browser
  profiles dashboard makes on its first visit.
- 0 days switches the warm-up off.

The joined subreddits are kept on the account (`joined_subreddits`) so none is
asked for twice. Reddit draws a joined subreddit's button with a `subscribed`
mark, and the warm-up presses Join only when that mark is missing, since
pressing it again would leave.

## Helpful comments that build karma

An account whose comments all point at one product reads as a salesman. Help-only
posts give it a life beyond the product: the newest posts in the subreddits it
has joined, answered with help and never a word about what you make. Its
comments then read like a person's, get removed less, and earn the karma some
subreddits ask for before anyone may post. Tyler picked this on 12 Oct 2026, and
said where it lives: on the Accounts dashboard, the hand button on each
row.

- **Read new posts** reads up to five of the account's joined subreddits
  (`joined_subreddits`, the ones its warm-up joined), newest first over the
  past day, in the reader browser. A blocked subreddit is never read. An
  account that has joined none is told so.
- **The posts belong to that account alone,** not to a project or a keyword
  (`promo_finds.help_account_id`), and only it answers them. They never show
  on a project's dashboard.
- **A post opens in the same comment box** the Projects dashboard has, inside
  the window, with an arrow back to the list.
- **Drafts only help.** They are never told what you make and are told never
  to mention a product or link to anything. The box says so above the drafts.
- **Every rule Post has applies:** warm-up, pace, waking hours, pause. A help
  comment counts against the pace like any other.
- **Nothing posts without a press.**

The read is `src/server/social/reddit/help-posts.ts`; the window is
`src/components/social/accounts/help-posts-dialog.tsx`.

## Pace

The line beside Post always says how many comments went out: "3 comments in the
last hour, 11 today." A failed attempt never reached Reddit, so it is not
counted. A post of your own counts as one, since it is the account writing on
Reddit too.

- **Any account:** past 4 comments in an hour (the setting) the line turns amber
  and says "That would be the 5th comment this hour. New accounts get banned for
  less." Post still works. Pace is a judgement, and blocking it would stop the
  one comment that mattered.
- **A young account,** under 90 days: Post is refused past 2 comments an hour or
  6 a day, with when the next one is allowed. Comments waiting for the
  account's morning count too, or five pressed at 3am would all go at 8:00.
- 0 young days means no account is young.

The reason beside a refused Post gives its time on your own clock. If the
figures moved since the dashboard last looked and the server refuses instead,
its message gives the time on the account's clock and names it ("tomorrow at
8:00 Europe/Berlin time"), because the server cannot know yours.

## Hands like a person

- **Clicks** land a little off the middle of the button, at a different point
  each time, after a short look. The mouse itself presses: it moves there, pauses,
  holds the button down for 45 to 140 thousandths of a second, and lets go.
  Camoufox moves the cursor along a curve on its own.
- **Scrolls** are a few wheel turns of different sizes in quick succession, with
  uneven gaps between scrolls, now and then a stop to read, and now and then a
  little way back up.
- **Typing** already had a person's rhythm (`docker/browser/human.py`).

On a phone the rack does the same with the same numbers (`rack/promo_rack.py`):

- **Taps** land a little off the middle of a button, never in its outer fifth,
  after a short look (`tap_point`).
- **Swipes** bow to one side and speed up and slow down, sent as several points
  on a bent line (`swipe_path`), in uneven lengths with uneven gaps.
- **Typing** is one key at a time with the browser's gaps, a stop after each
  sentence, and the occasional pause to think (`typing_plan`). Accents and
  emoji go through uiautomator2, which Android's own key typing cannot do.

The rack's tests check 100 taps on one button land at many points, all inside
it, and that two swipes are never the same line. Nothing has been measured on a
real phone yet.

Measured on 12 Oct 2026 in the real browser: 100 clicks on one 160 by 40 button
all landed inside it at 97 different points, across 32 to 128 of its width and
8 to 32 of its height. A typical trip of the cursor bent about 38 pixels away
from a straight line. Playwright's own element click was dropped after it waited
forever for Reddit's feed links to count as "stable" while a mouse press on them
opened the post at once.

## Where it lives

- Settings tab: `src/components/social/behaviour-settings.tsx`, listed in
  `src/app/options.ts`.
- The rules: `src/server/social/behaviour.ts` (settings, reader, clock),
  `src/server/social/posting.ts` (what Post may do), `src/server/social/warm-up.ts`
  (the daily visit and the label), `src/lib/social/waking.ts` and
  `src/lib/social/pace.ts` (the arithmetic).
- The browser side: `docker/browser/routines/reddit.py` (`reddit_comment`,
  `reddit_warm_up`, `reddit_stranger_profile`) and `docker/browser/human.py`.
- The table: `promo_behaviour_settings`, made by
  `drizzle/0106_promo_behaviour.sql`, which also adds `promo_jobs.run_after`.
