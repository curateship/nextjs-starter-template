# Finding content

Viral finds videos three ways: YouTube keyword searches, followed creators on
YouTube and TikTok, and links pasted in by hand. This code was copied from
Video's Viral section (`apps/video/workspace/docs/viral-projects.md`), with
its tables renamed from `video_viral_*` to `viral_*`.

## YouTube keyword search

- **The cost.** One search is three YouTube Data API calls, 102 units. A
  project set to both short and long videos searches twice, 204 units.
- **The allowance.** YouTube gives 10,000 free units a day, starting again at
  midnight Pacific time. That is about 98 searches a day.
- **Where the units are counted.** Every call writes a row in
  `viral_youtube_unit_spend`. Settings → YouTube shows today's total.
- **The queue.** Search marks a keyword `queued`. The `viral-search` worker
  takes 5 keywords every 15 seconds, each with a 2-minute claim, so a
  restart never strands one.
- **The key.** Settings → YouTube, kept scrambled in `viral_settings`. The
  `VIRAL_YOUTUBE_API_KEY` env var is used when none is saved.

## Followed creators

- **YouTube.** A creator's 10 newest uploads cost 2 units.
- **TikTok.** Uploads are read with `yt-dlp --impersonate chrome
  --flat-playlist`, which needs no key and costs nothing.
- **TikTok covers.** A TikTok cover address expires, so the
  `viral-creator-covers` worker keeps a copy.
- **Their pictures.** A creator's picture is served from
  `/api/v1/viral/creators/<id>/avatar`, after a sign-in check.

## Posts on X, Reddit and LinkedIn

These are found by Promo, not by Viral (Tyler, 4 Nov 2026: "Ask Promo to
read them").

- **The ask.** Adding a search, account, person, company or subreddit asks
  Promo for one read (`POST /api/connect/viral/reads`). Promo runs it in its
  own X or LinkedIn search account, or its Reddit reader, and calls back with
  the posts (`promo-connection.md`).
- **What a read brings.** Up to 100 posts, each with its writer, words,
  numbers and link, kept in `viral_social_posts` under the project. A post
  found again keeps its replies and gets fresh numbers.
- **What it costs.** Nothing in money. Each read is one job in Promo's queue,
  so it uses Promo's accounts and takes as long as Promo's browser does.
- **Again on their own.** Searches daily, people every 6 hours, through the
  `viral-social-watch` worker (`projects-and-socials.md`).

## Pasted links

The link button in the middle panel takes one YouTube, TikTok or Instagram
video by its address (`pasteVideoLink`). The video is downloaded with yt-dlp
and shown with a "Pasted" chip. Instagram profiles can't be read, but yt-dlp's
reader for one Instagram video is not marked broken. That read has not been
measured against a real reel yet.

## The New mark

Tyler, 4 Nov 2026: "Opening that video".

- **When it shows.** A video says New when a search found it for the first
  time in the project, or a followed creator posted it after they were
  followed here. A project's first search marks nothing, so a new project
  isn't a wall of New.
- **When it clears.** Opening the video on the right panel clears New for
  that person alone (`viral_seen_videos`, `src/server/viral/seen.ts`).
  Another person still sees it.
- **Opened videos look dimmer.** Their title turns grey, in the list and
  the grid, in every project.

## Top comments

The right panel has a Top comments card under Details. Tyler, 4 Nov 2026:
"20 comments only", with no AI reading them (`src/server/viral/comments.ts`).

- **YouTube.** The first time a video opens, one `commentThreads` read costs
  1 unit and brings up to 20 comments, most-liked first. They are kept for a
  day, so opening the video again costs nothing.
- **Switched off.** A video with comments switched off says so.
- **TikTok and Instagram.** Neither shares comments without signing in. On
  4 Nov 2026, yt-dlp read 0 of a public TikTok video's 5,484 comments signed
  out. The card says so and points to the video on TikTok or Instagram.
- **The sample project** shows four made-up comments.

## Trending sounds

The middle panel's Sounds tab lists each sound under the project's videos,
with how many winners use it. Tyler, 4 Nov 2026: "A Sounds tab".

- **A winner.** A video with the Outlier badge (twice its channel's usual
  views or more), or a score of 70 or more (`src/lib/viral/sounds.ts`).
- **The order.** Most winners first, then most videos.
- **Picking a sound** keeps the list to the videos that use it (`?sound=`).
  The back arrow returns to every sound.
- **Where sounds come from.** A followed TikTok creator's posts carry the
  sound's name and maker, read by yt-dlp as `track` and `artist`
  (`viral_creator_posts.sound_name` and `sound_artist`). On 4 Nov 2026 one
  public video read gave "original sound" by "tiff". YouTube and pasted
  links carry no sound.
- **Unproven.** Reading a whole creator's posts through yt-dlp failed for
  every profile tried from a developer's machine that day, so whether the
  profile read also carries the sound is not measured yet.
- **The sample project** has made-up sounds.

## Same idea, other creators

One hit can be luck, and ten creators winning with the same idea means the
format repeats. "Same idea, other creators" is a row in the right panel's ⋮
(`src/server/viral/same-idea.ts`).

- **What happens.** The AI reads the video's title, and what is said in it
  once it has been broken down, and writes one YouTube search line. YouTube
  is searched with it, as far back as a year, for videos of the same length
  kind.
- **What shows.** The middle panel lists the other creators' versions, with
  a line such as "6 other creators made this, 4 doubled their usual". The
  original's own channel is left out. Opening one plays it on the right.
- **Cost.** About 1 cent for the AI, metered as `viral_same_idea` against
  the project's spend limit. The search costs 102 units. Each channel's
  Outlier figure is read for the channels Viral doesn't have yet, at 2 units
  each, at most 25.
- **Kept.** The last search for each video is kept (`viral_same_idea`), so
  the list comes back on a reload for nothing. Search again runs it fresh.
- **The sample project** refuses, because its videos are made up.

## Hiding a channel

Hide channel takes one channel's videos out of one project, from the list
and from its daily re-checks. Every other project still shows them.

## The daily re-check and its bell

Tyler, 4 Nov 2026: "Daily, with a bell".

- **What runs.** Once a day, the `viral-daily-recheck` worker queues every
  keyword of a project whose last run was over 24 hours ago
  (`src/server/viral/daily-checks.ts`).
- **What it skips.** Samples, archived projects, and projects without
  YouTube or with YouTube paused. Those are left out before the day's
  projects are picked, so however many there are they never hold up the
  rest. The project that has waited longest goes first.
- **The bell.** When the run's last keyword finishes, the bell rings once
  for that project, such as "4 new videos above 70 in Meal prep". The bar is
  the project's minimum score.
- **Nothing twice.** A run with nothing new rings nothing. A search somebody
  pressed never rings. A video already named is kept in
  `viral_notified_videos`, so it never rings twice, even if it drops out of
  a search and comes back.
- **The reserve.** A run never starts if it would leave fewer than 1,000 of
  the day's 10,000 units, so a search somebody presses still works. Each
  keyword is priced at its search plus the most its Outlier reads can cost
  (50 units), because those reads happen after the search finishes.
- **A run that loses its keywords.** If the last waiting keyword of a run is
  removed before it is searched, the next tick ends that run and rings for
  whatever it found, so the project is re-checked again the next day.
- **The creator watch.** Followed creators are read every 6 hours by the
  `viral-creator-watch` worker. It skips a creator whose every project has
  paused their social, and keeps the same 1,000-unit reserve for YouTube.
  It rings once per person per pass.
- **The switch.** Both run only with `VIRAL_WATCH_ENABLED=1`, so a
  developer's machine never searches on its own.
