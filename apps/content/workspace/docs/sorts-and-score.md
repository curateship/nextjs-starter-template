# Sorts and the score

## The twelve sorts

The middle panel's Sort menu (`VIRAL_SORTS` in `src/lib/viral/viral-view.ts`)
has Video's five sorts, then the six Tyler added on 4 Nov 2026 ("Outlier",
"Views per follower", "Engagement", "Likes, comments, length"), then Rising
fast.

- **Score:** the 0 to 100 score below.
- **Views.**
- **Views per day.**
- **Newest.**
- **Fits the topic:** the AI's 0 to 100 for how well the title fits the
  project's description.
- **Outlier:** views against the channel's typical video (below).
- **Views per follower:** a 50,000-follower creator with 1,000,000 views
  shows 20.
- **Engagement:** likes plus comments for every 100 views. 450 likes and 50
  comments on 10,000 views is 5.
- **Likes**, **Comments** and **Length.**
- **Rising fast:** how many times as many views as the day before (below).

Every sort breaks a tie by views. A video missing the number being sorted
on, because the platform hides it, goes to the bottom.

## Rising fast

Tyler, 4 Nov 2026: "Doubled in a day". A video is rising when its views at
least doubled since the day before, such as 40,000 yesterday and 80,000
today. One at 40,000 and then 79,000 is not.

- **The figures.** Every keyword search and every creator read already
  carries each video's views, so Viral writes one figure per video per day
  in `viral_view_history` and spends no extra YouTube unit. Two readings on
  one day keep the higher one (`src/server/viral/view-history.ts`).
- **Two days needed.** A video needs figures on two days next to each
  other, so it can show Rising from the day after Viral first saw it. The
  newer figure must be from today or yesterday, so a video nobody has seen
  for a week stops saying it is rising (`src/lib/viral/rising.ts`).
- **Where it shows.** A Rising badge on the list's Rising column, on a grid
  card's cover, and in the right panel's Numbers as "Since yesterday". Below
  the bar, those places show the views gained, such as "+12k", muted.
- **The sample project.** Its videos have made-up figures, so sample videos
  2, 6 and 10 show as rising.

## Small creators, big hits

Filter has a Followers row with From and Up to, the same steps as the
creators card: 1,000, 10,000, 50,000, 100,000, 500,000, 1,000,000 and
10,000,000. "Up to 50k" with a 30,000-follower creator at 1,000,000 views
shows that video and hides a 2,000,000-follower one. A video whose follower
count is hidden is left out while a range is set. The range lives in the
address (`?fmin=` and `?fmax=`) and in saved views.

## The score

Copied unchanged from Video (`apps/video/workspace/docs/viral-score.md`).
It is worked out each time a project is read and never stored, so it moves
as a video ages.

## The Outlier figure

The Outlier figure answers "did this beat the creator's usual?". A channel
that usually gets 10,000 views and has a video at 400,000 shows "40x usual",
with "typical video: 10,000 views" on hover.

- **The usual.** The middle value of the channel's recent views, leaving out
  the video being compared. The middle value is used, not the average,
  because one huge hit would drag an average up with it
  (`src/lib/viral/outlier.ts`).
- **Too few videos.** A channel with fewer than 5 other videos shows no
  figure.
- **Under 2x.** Below 2x the badge shows nothing, so the badge means
  something.
- **YouTube's cost.** After each keyword search, the channels it found are
  read for their 30 newest uploads: 2 units each, at most 25 channels a
  search (`src/server/viral/outliers.ts`). A channel's figure is kept for 7
  days in `viral_channel_usual`, so searching the same keyword again within
  the week costs nothing more. These reads only spend what is left after the
  keywords still waiting to be searched, so a run is never left half
  searched for the sake of an Outlier figure.
- **TikTok's cost.** A followed creator's listed posts already hold their
  views, so their figure is free.
- **Pasted videos.** A pasted YouTube video's channel gets its figure the
  next time a search in that project finds the channel.
