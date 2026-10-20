# Longer AI clips, the video model and its price

Every AI shot is made with Google's Gemini Omni Flash (`gemini-omni-1.1-flash`),
in pieces of at most 8 seconds. A longer shot is several pieces joined end to
end. This doc covers the model, the three picture sizes and what they cost,
and how a longer shot is built.

## Why Omni Flash and not Veo

Google switches off every Veo 3.1 model on 22 Oct 2026: Veo 3.1, Veo 3.1 Fast
and Veo 3.1 Lite (the Gemini API price page and Veo page, read 19 Oct 2026).
Veo 3.1 was the only model the app used, at $0.40 a second. Tyler's answer on
19 Oct 2026 was "move to omni flash".

- **Shots asked for before the switch** keep "Veo 3.1" on their row, and what
  they cost stays on the meter.
- **A Veo shot still being made when the switch shipped** fails with "Google
  switched Veo off before this piece arrived. Press Try again to make it with
  Omni Flash." Try again makes that piece on Omni Flash, and so do the pieces
  waiting behind it.
- **Omni Flash on a free key:** Google gives a free Gemini key 0 Omni Flash
  shots a day ("limit: 0 requests per day on Free Tier"). The key in Settings
  must belong to a paid Google account.
- **What a free key looks like:** on 19 Oct 2026 Google accepted a free
  key's piece, then refused every check on it with "Rate limit exceeded ...
  (limit: 0 input tokens per minute on Free Tier)". The app used to treat
  that as Google being busy, so the piece sat for 15 minutes and failed as
  "took longer". Now any refusal with a limit of 0 on the free tier fails the
  piece at once: "Google refused because the Gemini key in Settings is a free
  key, and Google makes no AI videos on a free key. Add a key from a paid
  Google account, then press Try again." Nothing is charged
  (`isFreeTierRefusal` in `src/lib/video/asset-factories.ts`).

## The three sizes

Step 3 of the AI clip panel has a Quality list under Length. Tyler chose the
three on 19 Oct 2026, in place of a Full, Fast and Lite list of Veo models.

| Quality | Size | Price a second | 8 seconds | When to use it |
| --- | --- | --- | --- | --- |
| Draft | 360p | under $0.10, not priced | up to $0.81 | Trying directions side by side, then remaking the one that works |
| Normal | 720p | $0.10 | $0.81 | The usual take |
| Sharp | 1080p | not priced | not priced | A take that will be shown large. The file is bigger and takes longer |

- **Where the prices come from:** Google bills Omni Flash by tokens, $17.50 a
  million of video out and $1.50 a million in (the words and pictures sent).
  Google's page counts 5,792 tokens a second of 720p, which is $0.10 a second.
- **Draft and Sharp have no price on Google's page.** Google says Draft uses
  fewer tokens, so it costs less than Normal. Google calls Sharp "upscaled" and
  gives no figure. Until a real bill says otherwise, both are counted at the
  Normal price against the allowance and the project's limit, and the list
  says "up to $0.81" for Draft and "no price from Google yet" for Sharp.
- **What is actually charged** is Google's own count, read off Google's answer
  when the piece arrives: the tokens in, plus the video and thinking tokens
  out. An answer with no count is charged the Normal price for its seconds,
  so a piece is never free on the meter.
- **The shape is asked for natively.** A 9:16 project gets a 9:16 shot from
  Google, not a landscape one cropped down.
- **The last size picked is remembered** in `video_settings.ai_defaults`
  (`videoQuality`) when a shot is asked for, and the next shot starts on it.
  The setting is one for the whole site, like the other AI choices there.
- **Each shot says what it was made with** under its direction, such as
  "Omni Flash, Normal 720p, $0.81". The cost is what the meter holds for that
  shot once it arrives, "about $0.81" while it is being made, and "nothing
  charged" when it failed before any piece arrived.

## Not checked yet

The local Gemini key is a free key, so no real Omni Flash shot has been made.
Tyler chose to build without real shots on 19 Oct 2026. These wait for a paid
key:

- **The lengths Omni Flash makes.** Google's reference lists a `duration`
  setting without saying which values it takes. The app sends "4s", "6s" or
  "8s", and Google accepts the format without refusing it.
- **The real prices of Draft and Sharp**, and whether Normal's real bill is
  the $0.81 the page works out to.
- **A first frame and reference pictures together.** Google's Omni page shows
  both in one request with its tags (`[# Sources <FIRST_FRAME>@Image1]` and
  `[# References <IMAGE_REF_0>@Image2]`), which the app sends.
- **How a finished answer arrives.** Google says a check on a finished job
  carries the clip inline as base64. The app also takes a download address if
  one comes instead.

## How a longer shot is made

The app joins clips rather than using Google's extension. Tyler chose this on
24 Sep 2026, after being shown that Google does not say what an extension
costs and may refuse its people setting from some countries.

- **The lengths on offer:** 4, 6, 8, 16, 24 or 32 seconds, in the Length list
  of step 3 of the editor's AI clip panel (see `ai-clip.md`). 4, 6 and 8 are one clip. 16, 24 and 32 are
  two, three or four pieces of 8 seconds (`SHOT_LENGTHS` in
  `src/lib/video/asset-factories.ts`).
- **One direction per piece:** a longer shot shows one box for each 8
  seconds, labelled "What happens, seconds 0 to 8" and so on, and every box
  must be filled. That lets a shot start one way and end another.
- **Pieces run one at a time:** pressing Make the shot writes a row for every
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
- **Every piece keeps the person:** each piece is sent the same
  person board and backdrop as the frame the shot started from, not only the
  last frame of the piece before, so the actor and the outfit hold across the
  joins (`extras.md`).
- **One row per shot:** the AI clip panel shows a longer shot as one row
  with its full length. While it is being made the row says so.
- **Putting it on the timeline:** dragging the shot lays every piece on one
  lane, the first where it is dropped and each next one starting where the
  last ends, so there is no gap. It moves to a new lane when the one it was
  dropped on has no room, and one Undo takes all the pieces back. A shot can
  only be dragged once every piece is ready.
- **When a piece fails:** the shot stops there. The pieces before it are
  kept, the row says why, and Try again makes that piece
  again from the same picture, then carries on with the rest. A failed piece
  adds nothing to the meter. If it failed after Google finished it, because
  its last frame could not be read, Google has still charged for it.
- **Deleting:** deleting a shot in the AI clip panel removes every piece of
  it from the list. Clips already on the timeline stay there.
- **Shots at once:** a long shot takes one of the project's three places
  while any of its pieces is being made, and none once a piece has failed.
  Try again is refused while the project is already making three (see
  `several-ai-clips.md`).

## Why the job limits did not move

Every piece is its own Google job with its own clock, so a 32 second shot
never needs longer limits than an 8 second clip.

- **The 15 minute limit:** counts from when that piece started. Veo's slowest
  was 6 minutes a piece; Google gives no figure for Omni Flash yet.
- **The 5 minute lease:** is held only while the worker is starting, checking
  or saving one piece, never for the whole shot. A shot is never taken over
  halfway, because between pieces there is nothing to take over.
- **The 100 MB cap:** applies to one piece of at most 8 seconds, never to a
  whole shot. Google sends a finished piece inside its answer as base64, a
  third bigger than the file, so the answer may be up to about 134 MB.

## What it costs

- **The price:** about $0.10 a second at Normal, so a 32 second shot is 4
  pieces × $0.81 = $3.24, where Veo made the same shot for $12.80. The line
  under Quality shows the total before anything is pressed.
- **How it is recorded:** each piece lands in `/admin/ai` as its own row when
  it arrives, priced from Google's token count. The rows carry the shot's id
  in their details, which is where a shot's cost in the panel is read from.
- **Pieces that never arrive:** add nothing to the meter. A shot stopped at
  piece 2 of 3 shows one piece in `/admin/ai`.

## Omni Flash's own extend, not used

Omni Flash can continue a clip it made in 10 second steps, up to 40 seconds,
keeping the motion and the voice running (Google's Omni page, 19 Oct 2026).
Tyler chose on 19 Oct 2026 to keep the 8 second pieces for now; the extend
can be its own task.

## Veo 3.1, as it was (24 Sep 2026)

The app chose joined pieces over Veo's own extension on 24 Sep 2026, after
Google's pages did not say what an extension cost and Veo's people setting
for an extension could be refused from some countries. Veo is switched off on
22 Oct 2026, so the rest of what was read about it is no longer kept here.
