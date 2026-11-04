# Music made to fit

The Music panel's + opens a menu with "Make music with AI" and "Upload
music" (Tyler, 4 Nov 2026). "Make music with AI" opens a window asking "What
should it sound like?". Type a few words, such as "calm piano, hopeful", and
ElevenLabs Music makes an instrumental track exactly as long as the video. Tyler picked ElevenLabs on
4 Nov 2026.

## What you get

- **The length:** the video's length when you press, from 3 seconds to 5
  minutes. A video longer than 5 minutes gets a 5 minute track, which the
  Music panel lays down again from the top until the video is covered, the
  way it does any track (background-music.md).
- **No singing:** every track is asked for as instrumental, because music
  under a video is there to be talked over.
- **Where it lands:** in the media library as "Music - calm piano.mp3", on the
  Music list, and straight under the video on a lane of its own, ducked under
  voice and at a quarter volume like any track laid from the Music panel. One
  Undo takes the lane off; the track stays on the Music list.
- **Its beats** are found like any music's, so clip edges snap to them
  (beat-snapping.md).

## What it costs

ElevenLabs' API price page, read on 4 Nov 2026, says $0.30 a minute. A
42 second video's track is 42 ÷ 60 × 30 = 21 cents, rounded up to a whole
cent. The button shows the price before pressing, worked out from the
timeline as it is then.

- The month's AI allowance and the video's own spend limit are checked first,
  with this track counted in. Past either, nothing is asked.
- Video writes the charge on the AI meter itself (`video-meter.ts`), as it
  does for Wan and Seedance, filed as "AI music" with the video's id, so the
  project's spend counts it. A refused or failed track is written as failed at
  no charge.
- Making a track takes up to a couple of minutes; the request waits at most 5.

No real track has been made yet. The first one costs real money on the local
key, so it waits for Tyler's go.

## Where it lives

- `src/lib/video/ai-music.ts`: the length, price and name sums.
- `src/server/video/ai-music.ts`: the ask, the library row and the meter.
- `MakeMusicDialog` in `src/components/video-editor/studio-music-panel.tsx`.
- Test: `src/server/video/ai-music.test.ts`, with ElevenLabs stood in for.
