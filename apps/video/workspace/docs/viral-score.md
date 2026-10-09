# The viral score

Every result on the Viral page gets a score from 0 to 100 for how viral it
is, and the table sorts by it unless you pick another column. The formula is
the old app's (`apps/ai-video/src/server/trend-score.ts`), copied with every
weight and threshold unchanged. It lives in `src/lib/video/viral-score.ts`.

## The five parts

Each part is scored 0 to 100 on its own, then counts for its share of the
total.

| Part | Worth | How it scores |
| --- | ---: | --- |
| Views per day | 30 | Views divided by days since posting. Full marks at 200,000 a day. |
| Views against followers | 25 | Views divided by the channel's followers, counting any channel under 1,000 as 1,000. Full marks at 50 times. |
| Likes and comments per view | 20 | Likes plus comments, divided by views. Full marks at 1 in 10. |
| How recent | 15 | 100 for 2 days old or less, 85 up to a week, 65 up to two weeks, 40 up to a month, 20 up to two months, 5 after that. |
| Breakdown | 10 | 20 each for a transcript, parts, scene cuts, a hook, and an ask or proof. |

- **The first two use a log scale:** 2,000 views a day scores about 62 out of
  100, not 1, so a mid-sized Short is not flattened by a huge one.
- **A video less than a day old counts as one day old**, so a Short posted an
  hour ago cannot claim a million views a day off its first thousand.
- **A number the channel hides scores 0 for its part.** It is never treated as
  a real zero, and it is listed as missing.

## One worked example

A Short with 1,200,000 views, posted 4 days ago, from a channel with 40,000
followers, with 90,000 likes and 3,000 comments, never broken down.

- **Views per day:** 1,200,000 ÷ 4 = 300,000 a day. That is past 200,000, so
  full marks, 30 points.
- **Views against followers:** 1,200,000 ÷ 40,000 = 30 times. On the log scale
  that is 87.3 out of 100, so 87.3 × 0.25 = 21.8 points.
- **Likes and comments per view:** 93,000 ÷ 1,200,000 = 0.0775, or 7.75 in 100.
  That is 77.5 out of 100, so 15.5 points.
- **How recent:** 4 days old scores 85, so 85 × 0.15 = 12.75 points.
- **Breakdown:** none yet, so 0 points.
- **Total:** 30 + 21.8 + 15.5 + 12.75 + 0 = 80.05, which rounds to 80.
- **What the hover shows:** 12.75 appears as 12.8, because the hover rounds
  each part to one decimal. The unit test pins this exact video
  (`viral-score.test.ts`).

## How sure

Beside each score is how sure it is: high, medium or low. It starts at 100
sureness points and loses some for each missing number.

- **No post date:** loses 15.
- **No views, or zero views:** loses 25.
- **No follower count:** loses 20.
- **No likes, or no comments:** loses 5 each.
- **No breakdown:** loses 25.
- **90 or more is high, 60 to 89 is medium, under 60 is low.**

A YouTube result with every number but no breakdown therefore reads medium.
The task file asked for "low" there as well as "identical to the old app",
and those two disagree. Tyler chose the old app's rule on 9 Oct 2026, so a
row only reads low when something else is missing too, such as a hidden
follower count.

## When the breakdown counts

The breakdown part scores 0 for every result until the video has been saved
and broken down (Save & break down, in `creator-research.md`). Once that
person's saved copy of the video reaches "ready", its breakdown counts on
the next read, and "Missing breakdown" drops off the hover list. A saved
copy still downloading or being watched counts as missing. Somebody else's
saved copy never counts.

## Worked out on read, never stored

The score is calculated each time results are read, in
`src/server/video/viral/saved-searches.ts`, and there is no score column in
the database. That is why it moves as a video ages: the views and likes are
the snapshot from when the search ran, but "days since posting" and "how
recent" are measured from now.

## On screen

- **The Score column** shows the number and "sure: medium" beside it.
- **Hovering, tabbing to it or tapping it** shows each part's points out of its
  share, such as "Views against followers 21.8 of 25", and lists what was
  missing.
- **Ties** on score are broken by views, most first.

## What the old function did differently

The old app refused to score a saved video whose download was not finished.
Here every search result is scored, so that check is gone, and its
"Missing analysis" now reads "Missing breakdown". Nothing else changed: a
check over 20,000 random inputs on 9 Oct 2026 gave the same score, the same
how-sure level and the same part scores as the old function every time.

Comparing a video against the channel's own usual numbers is task 04, not
part of this score.
