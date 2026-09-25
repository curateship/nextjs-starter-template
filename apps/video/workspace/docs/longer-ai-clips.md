# Longer AI clips

An AI video clip from Google's Veo 3.1 is 4, 6 or 8 seconds long, and no
setting makes a single clip longer. A longer shot has to be built from more
than one generation.

## What Google's Veo 3.1 will do

Read from Google's own pages on 24 Sep 2026: the Veo guide at
`ai.google.dev/gemini-api/docs/veo`, the Gemini API price list at
`ai.google.dev/gemini-api/docs/pricing`, and the Vertex "Extend videos" page.

- **Length of one clip:** `durationSeconds` takes "4", "6" or "8" and nothing
  else. The check `video_ai_generations_duration_check` in
  `src/server/video/schema.ts` already matches that, so there is no limit to
  raise.
- **Extending a clip Google made:** Veo 3.1 can continue a clip it generated,
  adding 7 seconds each time, up to 20 times. Google continues from the clip's
  last second, so the motion and the sound carry on.
- **What an extension sends back:** one file holding the old clip and the new
  7 seconds together, up to 148 seconds in all. An 8 second clip extended
  twice is one 22 second file.
- **What an extension needs:** the input must be a Veo clip made or extended in
  the last 2 days, at 720p, 9:16 or 16:9, and 141 seconds or shorter. The first
  clip must be 8 seconds. The app already asks for 720p.
- **The people setting for an extension:** Google's table allows only
  `personGeneration: "allow_all"` for an extension. The app sends
  `"allow_adult"` today (`generations.ts:417`). Google also says that in the
  EU, UK, Switzerland and the Middle East only `"allow_adult"` is allowed, so
  an extension may be refused from a server in those places.
- **Price:** $0.40 for each second of video from `veo-3.1-generate-preview` at
  720p, charged only when the video arrives. The app's price table has the
  same figure (`src/lib/ai/ai-models.ts:136`).
- **Price of an extension, not settled:** none of Google's pages says whether
  an extension is charged for the 7 new seconds or for the whole file it sends
  back. Only a real extension, read off Google's bill, will say.
- **How long Google takes:** between 11 seconds and 6 minutes for one
  generation, by Google's own figures.

## How a longer shot is made

The app joins clips rather than using Google's extension. Tyler chose this on
24 Sep 2026, after being shown that Google does not say what an extension
costs and may refuse its people setting from some countries.

- **The lengths on offer:** 4, 6, 8, 16, 24 or 32 seconds, in the Length list
  of the Generate AI video window. 4, 6 and 8 are one clip. 16, 24 and 32 are
  two, three or four pieces of 8 seconds (`SHOT_LENGTHS` in
  `src/lib/video/asset-factories.ts`).
- **One direction per piece:** a longer shot shows one box for each 8
  seconds, labelled "Direction for seconds 0 to 8" and so on, and every box
  must be filled. That lets a shot start one way and end another.
- **Pieces run one at a time:** pressing Generate writes a row for every
  piece. The first is queued and the rest wait. When a piece arrives, the
  worker takes its very last frame with ffmpeg, saves it as a picture, marks
  the piece ready and queues the next piece with that picture as its first
  frame, all in one database step.
- **The frame pictures stay in Media:** each one is named "AI shot frame 1",
  "AI shot frame 2" and so on, beside the "AI video" clips.
- **What the joins look like:** each piece starts from the exact last frame
  of the one before, so the picture lines up. The movement can still change
  speed at a join, and the sound starts afresh, because Google sees a
  picture and not the clip.
- **One card per shot:** the AI videos page shows a longer shot as one card
  with its full length and "2 pieces", "3 pieces" or "4 pieces". While it is
  being made the card says which piece is running. The player plays the
  pieces one after another.
- **Adding it to a project:** Add to project puts every piece on one new
  track, the first at 0 seconds and each next one starting where the last
  ends, so there is no gap. It is refused until every piece is ready.
- **When a piece fails:** the shot stops there. The pieces before it are
  kept, the card says "Stopped at piece 2 of 3", and Retry makes that piece
  again from the same picture, then carries on with the rest. A failed piece
  adds nothing to the meter. If it failed after Google finished it, because
  its last frame could not be read, Google has still charged for it.
- **Deleting:** Delete removes every piece of the shot from the list. The
  finished clips and frame pictures stay in Media.
- **One shot per project at a time:** a new video for a project is refused
  while a shot for it is running or stopped with pieces still waiting. Retry
  or delete the stopped shot first. Retry is refused the same way while
  another video runs on the project, which can happen when a shot's last
  piece is the one that failed.

## Why the job limits did not move

Every piece is its own Google job with its own clock, so a 32 second shot
never needs longer limits than an 8 second clip.

- **The 15 minute limit:** counts from when that piece started. Google's
  slowest is 6 minutes a piece.
- **The 5 minute lease:** is held only while the worker is starting, checking
  or saving one piece, never for the whole shot. A shot is never taken over
  halfway, because between pieces there is nothing to take over.
- **The 100 MB download cap:** applies to one piece of at most 8 seconds,
  never to a whole shot.

## What it costs

- **The price:** $0.40 a second, so a 32 second shot is 4 pieces × $3.20 =
  $12.80. The Generate window shows the total under the directions before
  anything is pressed.
- **How it is recorded:** each piece lands in `/admin/ai` as its own row when
  it arrives, at $3.20 for 8 seconds. The rows carry the shot's id in their
  details, and they add up to the figure the window showed.
- **Pieces that never arrive:** add nothing to the meter. A shot stopped at
  piece 2 of 3 shows one piece in `/admin/ai`.
