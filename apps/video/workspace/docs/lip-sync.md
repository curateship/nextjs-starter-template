# Making lips match a new voice

"Match the lips…" on a video clip's right-click menu sends the clip and a voice
laid over it to Sync Labs, which moves the person's mouth to the new words.
Tyler picked Sync Labs on 4 Nov 2026, and said it works on any clip with a new
voice over it: a language copy, a voiceover, or a voice line made again.

## Using it

- **The voice:** the window lists the sound clips over the clip, a voice the AI
  read first, then whichever shares the most time with it. Starter sound
  effects are left out, because they are no file of yours.
- **The price:** on the button before pressing. Sync Labs' billing page, read
  on 4 Nov 2026, charges $0.002 a frame at 25 frames a second, $0.05 a second.
  A 10 second clip is 10 × 5 = 50 cents.
- **The wait:** Sync Labs takes a minute or more. The window asks every 5
  seconds. It can be closed; the job carries on, and opening Match the lips on
  the same clip again picks it back up.
- **When it's done:** the matched video takes the clip's place as one Undo
  step, keeping its start, length, lane, size, place and colour. It plays
  silent, because the voice is still on its own lane and would otherwise be
  heard twice. The file is kept in the media library as "Face (lips
  matched).mp4". A clip deleted meanwhile leaves the file in Media.
- **Matched before:** the window offers the earlier result again.

## What is refused before anything is sent

- No Sync Labs key: "Add a Sync Labs key in Settings → Lip sync first".
- No sound clip over the clip.
- A clip or voice at a speed other than 1x.
- A clip longer than 5 minutes (split it first) or shorter than 1 second.
- Past the month's AI allowance or the video's spend limit, counting this job.
- A guest sent from Project never sees the menu item, like every AI tool
  outside the Thumbnail section.

A second press while a job is working gets that job back, not a second charge.
The database keeps one working job per clip, so two presses at the same moment
make one job too. Jobs still working count against the month's allowance and
the video's spend limit at their expected price, so several presses at once
can't spend past either. Each person can start 20 an hour.

## What is sent, and what is kept

The footage under the clip, from its trim point for its length and with its own
sound taken off, and the voice over exactly that stretch, with silence where
the voice hasn't started or has ended, are cut by ffmpeg into an MP4 and a WAV
of the same length. Both go into storage, where Sync Labs fetches them by
address, and both are deleted as soon as the job ends either way.

The job is a row of `video_lip_syncs` (migration 0150), written before
anything is sent, with the expected price until the real one is known. A
background sweep asks Sync about every job nobody's window is asking about,
once a minute, so a job whose window was closed still lands in the library
and on the meter, and a job that never reached Sync is ended after 10
minutes. The first check after Sync says it is finished downloads the video
with no redirects followed and at most 2GB, checks it really is a video, keeps it in the library, writes
the charge on the AI meter as "Lips matched" with the video's id, and marks the
job ready, all in one step, so two checks at once never keep it twice. A job
Sync turns down, or one still unfinished after 30 minutes, ends at no charge.
Video writes the meter row itself (`video-meter.ts`), as it does for Wan,
Seedance and AI music.

## The key

Settings → Lip sync holds the Sync Labs key, pasted and scrambled like the
Pexels key (the two tabs share `api-key-card.tsx`). "Test this key" asks Sync
which models the key can use, which costs nothing.

No real clip has been matched yet. The first one costs real money, so it waits
for Tyler to add a key and try it.

## Where it lives

- `src/lib/video/lip-sync.ts`: the price, which voices are offered, and where
  the voice falls in the clip.
- `src/server/video/lip-sync.ts`: cutting, sending, checking and landing.
- `src/components/video-editor/lip-sync-dialog.tsx` and the menu item in
  `remake-clips.tsx`.
- Test: `src/server/video/lip-sync.test.ts`, with real ffmpeg and Sync Labs
  stood in for.
