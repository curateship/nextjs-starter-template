# The teaser at the start

The Teaser tile in the AI panel picks the best 1 to 3 second moments of the
video and puts them at the very start, as a preview of what's coming. It's for
walking videos, food videos and the like. Tyler, 4 Nov 2026: "For walking
videos or food videos etc.. Ai can chop 1-3 sec clips highlights and match it
to a music beat (optional) for preview". He picked the start of the video, the
whole video, and "I should be able to pick any seconds I want".

## The window

- **How long, in seconds:** any whole number from 3 up to the video's own
  length. It starts at 10. Anything else is marked and refused with a
  sentence.
- **How many moments:** optional. Empty lets Video choose, about one every
  2 seconds. A number must keep each moment between 1 and 3 seconds, so a
  10 second teaser takes 4 to 10 (`teaserCountRange`). Tyler, 5 Nov 2026:
  "I should be able to set how many teaser clips".
- **The music line** says which music the cuts follow, or that there's none.
- **The button shows the price** before the press.
- **Cancel works while it runs.** Pressing Cancel, or closing the window,
  stops waiting and lays nothing. The server checks before each ask it
  sends Gemini, so the asks still to come are never sent and never charged.
  An ask already sent is charged.
- A guest sent from Project doesn't get it, because it uses AI.

## Picking the moments

- **Stills along the video clips.** The server draws a still every second, or
  further apart on a long video so there are never more than 300. It draws
  only the video clips, so words and stickers over them never sway a score.
  It's one drawing pass (`teaserStillGrid` in `src/lib/video/teaser.ts`,
  `scoreTeaserMoments` in `src/server/video/teaser.ts`).
- **Gemini scores each still** from 0 to 100 for how well a moment around it
  would work in a teaser: high for a striking, sharp, well-lit frame with
  something worth seeing, low for blurry, dark, empty or in-between frames.
  Each score comes with a few words of reason. Stills go in asks of 30.
- **The best ones that don't overlap** are taken, as many as there are cuts,
  at least the longest cut apart, so no two share footage. When fewer good
  ones are found than asked for, the teaser is shorter and the message says
  so. They play in the order they happen in the
  video. Each is centred on its still and kept inside the clip it comes
  from.

## Cuts and music

- **With music:** the music is the first sound clip on the timeline whose
  beats the worker has found ([beat-snapping.md](beat-snapping.md)). Its
  opening, from where its clip starts in the file, plays under the teaser,
  and each cut ends on the beat nearest 2 seconds on, as long as that keeps
  it between 1 and 3 seconds. The moments' own sound is off, so the cuts land
  on beats you can hear. The music fades out over the last 0.3 seconds.
- **Without music:** every cut is 2 seconds, and the moments keep their own
  sound with a short fade at each cut.
- **With a count:** each cut aims for an even share of what's left, and with
  music lands on the beat nearest that, while leaving the cuts still to come
  room to stay between 1 and 3 seconds.
- **The last cut** ends exactly at the length typed. Without a count, one that
  would be under a second is folded into the cut before it.

Worked example: a 10 second teaser with no music is five 2 second moments. A
5.5 second one is 2, 2 and 1.5 seconds. Asking for 4 moments in 10 seconds
gives four of 2.5 seconds.

## Laying it

- **Everything moves later** by the teaser's length, every clip on every lane,
  captions and markers included.
- **The moments go on a new lane at the top**, starting at 0:00. With music,
  the music's opening goes on a new lane at the bottom.
- **They are trims of the same files.** Nothing is uploaded. Each keeps its
  clip's look and zooms, and drops its transitions, picture fades and
  following.
- **One Undo step** takes the whole teaser out and puts everything back.

## What it costs

`teaserCostCents` in `src/lib/video/ai-estimates.ts`: each still sent to
Gemini once, plus a short reason back for each. It goes on the AI meter as
`teaser_moments`, against the video's spend limit.

## Not included

Picking moments by what's said, and making the teaser as a separate video.
