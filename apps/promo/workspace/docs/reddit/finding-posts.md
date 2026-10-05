# Finding Reddit posts worth answering

Promo searches Reddit for a keyword and puts the results in the order that
answers "where would a comment of mine actually be read". That is a different
question from the one Reddit's own search answers, and the difference is the
whole point of the screen.

## Why there is no Reddit API

Reddit will not answer a plain request any more, and the official way in is
closing.

- **A plain request gets nothing.** Asking `reddit.com/search.json` for results
  with an ordinary browser's name on the request comes back 403. Asking for the
  normal search page comes back 200, but the page is a JavaScript puzzle Reddit
  wants solved before it will show anything, not the results.
- **The official API shuts in March 2027.** Reddit announced on 30 September
  2026 that it stops accepting new applications on 31 October 2026, ends RSS on
  13 November 2026, cuts off unregistered apps on 12 January 2027, and closes
  the public API altogether in March 2027.

So every read goes through a real browser, which solves the puzzle the way a
person's browser does. `browser/isolated-sessions.md` describes that browser.
One engine does the reading and the posting, rather than two.

## What a keyword is

A saved search: the words, which subreddits to look in, Reddit's own order, and
how far back to look. Running it again adds whatever is new and leaves alone
every decision already made about the posts it found before.

**Reddit's order defaults to Best match**, and that was measured rather than
guessed. Against "project management tool" over one week on 5 October 2026:

- **Best match** put 25 of 25 posts on topic, with a typical 8 replies.
- **Newest** put 0 of 25 on topic. It is recency with no relevance at all.
- **Most replied to** put 22 of 25 on topic, typically 538 replies deep.
- **Most upvoted** put 23 of 25 on topic, typically 301 replies deep.

The last two match the words well and bury a new comment at reply 302.

## The three bands

The list groups under three headings rather than showing a score, because a
score is a sort order and not something to read.

- **Strong fit** is a post Reddit matched well that is fresh and still quiet.
- **Possible** is worth a look.
- **Low fit** matched the words and is either old, buried under replies, or
  both.

The two thresholds were set against a real run of "reddit marketing tool" on 5
October 2026, which returned 15 posts scoring 2.00 down to 0.13. They split it
3 strong, 7 possible and 5 low, and reading the groups back those are the right
three: the strong ones were all posted today with one or two replies, and the
low ones were a Tesla story with 135 replies and a horror story with 28.

## How the order is worked out

Three things decide where a post sits, and upvotes are not one of them:

- **Where Reddit put it.** Reddit returns its results in its own relevance
  order, and that order is the only measure of relevance the app has. First
  place keeps all of it, tenth keeps half, twenty-fifth keeps about a quarter.
- **How many replies are already there.** Few replies means a comment sits near
  the top instead of collapsed under "load more comments". No replies keeps all
  of it, three replies keeps half, twenty-seven keeps a tenth.
- **How old the post is.** People read a thread for a day or so and then stop.
  Under six hours keeps all of it, under a day keeps 0.6, under three days 0.3,
  older than that 0.1.

The three multiply together, times ten so the column reads as 2.0 rather than
0.2.

Two worked numbers:

- Reddit's fourth result, posted today, 5 replies: `1/1.3 × 0.6 × 3/8 × 10` is
  **1.73**.
- Reddit's second result, three weeks old, 400 replies: `1/1.1 × 0.1 × 3/403 ×
  10` is **0.0068**.

The fresh quiet post comes out 255 times higher than the old buried one, even
though the buried one matched the words better. That is the right answer: the
busy one has had its conversation.

## Why upvotes were taken out

The first version multiplied the post's upvotes in, on the reasoning that a post
people are reading is worth answering. Run against "reddit marketing tool" on 5
October 2026 it put a horror story from r/nosleep at the top, 314 upvotes and 28
replies, and the two posts actually worth answering tenth and eleventh: an
r/SaaS post with 3 upvotes and 5 replies, and an r/SocialMediaMarketing post
with 1 upvote and 1 reply.

Upvotes measure how big and busy a subreddit is far more than how relevant a
post is to you. With them gone, the same keyword put five on-topic posts in the
top five, with 2, 6, 1, 5 and 7 replies.

## The screen

Three panels in a row, built from the same parts as the Automation Canvas and
the CRM rather than a second system.

- **Keywords**, on the left. Each saved search is a card saying what it searches
  — "25 posts · Past week · All of Reddit" — with a button to run it again and
  one to remove it. The box that adds a keyword is pinned to the bottom of the
  panel, because a keyword is added once and pressed many times.
- **The posts**, in the middle, under the keyword's own name in quotes. Three
  counts across the top say where the work is: To look at, Replied, Skipped.
  Pressing one shows those posts.
- **The post and your comment**, on the right. One panel, because they are one
  piece of work: the post, its replies and the drafts scroll together and the
  box you send from stays at the bottom where it can always be reached.

There is no bottom panel.

Both side panels shut all the way to nothing, either by dragging their divider
across or by double-clicking their blank space, and a slim tab appears on the
middle panel's edge where each one went. Where the dividers are left is
remembered in this browser. Below 1280px the panels are dropped entirely and the
list takes the screen, because three columns on a phone is three unreadable
columns.

## What a row says

Title, subreddit, when it went up, upvotes and replies. The line under each
title says why it is where it is in plain words: "Reddit's best match, posted in
the last few hours, no replies yet". The chosen row carries a line down its left
edge rather than a filled background, so it reads as chosen without fighting the
band headings above it.

The date is said the way a person would: Today, Yesterday, 5 days ago, Last
week. Whole days apart, not hours, or a post from 11pm last night would read as
a day older than one from 1am this morning.

**There is no status column.** It said "To look at" against almost every row,
and every row in the list is one to look at, so it said nothing. Where a post
has got to is now the three counts at the top of the panel, which also filter.

**The score itself is not shown**, and that is deliberate. It was a column
called "Worth it" until Tyler asked what it meant on 5 Oct 2026, which was the
answer: a bare 2.0 on no scale tells a reader nothing. The number only ever
drove the sort. The list is already in its order and each row says why it is
there, so the column was removed rather than renamed.

Upvotes are still shown, because they tell you whether a subreddit is alive.
They just do not move the order.

## Where a post can get to

- **To look at** is where every post starts.
- **Shortlisted** is one you mean to come back to.
- **Skipped** is one you have decided against. Ticking rows and pressing Skip
  moves many at once, in one request, and says how many moved.
- **Commented** is set by a comment actually going out, never by hand. A post
  that got there is left alone by Skip, so a comment cannot be sent twice by
  accident.

A re-run of the keyword never moves any of these. It only brings the figures and
the score up to date.
