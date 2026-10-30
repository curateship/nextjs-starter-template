# Cleaning up the voice

A switch on any sound or video clip that takes hum, hiss and steady room noise
out of its sound, at one of three strengths.

## Using it

**Clean up the voice** is in the **Sound** card on the right, under Volume.
Switched on, it starts at **Medium**, with **Light** and **Strong** beside it.
Switching it off takes the clip back to its sound as recorded.

## What it does

Two ffmpeg stages, the same in the preview's copy and in the export
(`src/lib/video/voice-clean.ts`):

- **Hum and rumble:** a `highpass` at 80 cycles a second takes out mains hum
  (50 or 60) and rumble, which sit below any voice.
- **Hiss and room noise:** `afftdn` learns the steady noise as the file plays
  and takes it down. Light takes it down by 12 decibels, Medium by 24 and
  Strong by 40, with what it treats as noise set at -40, -35 and -30 decibels.

## The three strengths, measured

The numbers were picked by measuring, not by ear. The test file was a
220-cycle tone over pink noise and a 60-cycle hum. In the stretch with no tone,
the noise went from -39.7 decibels to:

- **Light:** -46.1, about half as loud.
- **Medium:** -49.0.
- **Strong:** -53.4, about a fifth as loud.

The tone moved by 0.6 decibels or less at every strength. A real voice is not
a steady tone, and noise reduction this strong can make a voice sound thin or
watery. Strong is the one to listen to on a real phone recording before
trusting it. Nobody has done that yet.

## Why the preview waits for a copy

A browser cannot run ffmpeg's filter while it plays. So when a clip is switched
on, the background worker makes a copy of the file's whole sound, cleaned at
that strength, and the preview plays the copy in place of the clip's own
sound. A video keeps its picture and is silent while the copy plays beside it,
cut and timed the same.

- **While it is being made:** the clip on the timeline says "Cleaning the
  voice", and the panel says the sound is being got ready. The preview plays
  the sound as recorded until then. The export cleans the sound itself either
  way, so an export started before the copy is ready is still cleaned.
- **How long it takes:** one ffmpeg run over the file's sound. A smooth copy
  of a video is read when there is one, because it is a far smaller file.
- **One copy per file and strength:** every clip of a file shares it, however
  each one is trimmed. Switching strength asks for another copy.
- **When it fails:** after three tries the panel says why, the preview plays
  the sound as recorded, and **Try again** puts it back in the queue with
  three fresh tries. A file with no sound says so at once, without the
  retries. A copy still not ready after ten minutes of asking reads as failed
  too, so **Try again** shows rather than a spinner that never ends.
- **Where the preview and the export can differ:** the filter learns the
  noise as the sound plays. The copy is cleaned from the file's start, but
  the export cleans only the trimmed piece. So a clip trimmed to start well
  into its file can have a second or so more hiss at its very start in the
  export than in the preview. A video's copy is also made from the smooth
  copy's sound rather than the original's.
- **Stored:** a row per file and strength in `video_media_clean_sounds`
  (migration 0144), and the copy as an M4A in storage under
  `video/clean-sound/`. Deleting the file removes its rows. The copies stay in
  storage, the same as the smooth copies under `video/proxies/` always have.

## Checked

- **A real export:** a noisy recording exported with Strong had its hiss
  down to under a third of its level, and the tone at more than 85 out of 100
  of its level (`src/server/video/render-editor-features.test.ts`).
- **The worker:** a real run made the Strong copy and stored it
  (`src/server/video/media-workers-sound.test.ts`). The dev server's worker
  also made a Medium copy of a real voiceover on this machine.
- **The browser:** switching it on showed "Cleaning the voice" on the clip
  until the copy was ready.
