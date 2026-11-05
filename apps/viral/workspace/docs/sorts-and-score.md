# Sorts and the score

## The eleven sorts

The middle panel's Sort menu (`VIRAL_SORTS` in `src/lib/viral/viral-view.ts`)
has Video's five sorts, then the six Tyler added on 4 Nov 2026 ("Outlier",
"Views per follower", "Engagement", "Likes, comments, length").

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

Every sort breaks a tie by views. A video missing the number being sorted
on, because the platform hides it, goes to the bottom.

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
