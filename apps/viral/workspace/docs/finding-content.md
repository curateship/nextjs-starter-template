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

## Pasted links

The link button in the middle panel takes one YouTube, TikTok or Instagram
video by its address (`pasteVideoLink`). The video is downloaded with yt-dlp
and shown with a "Pasted" chip. Instagram profiles can't be read, but yt-dlp's
reader for one Instagram video is not marked broken. That read has not been
measured against a real reel yet.

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
