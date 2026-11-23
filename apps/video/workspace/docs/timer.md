# Timer

A timer counts down over its own length on the timeline, with a ring round
the time that empties as it runs and a line of words above and below the
time, such as FOCUS and Round 2/6. It was added on 14 Nov 2026 for study
videos (the Pomodoro flow, `workspace/tasks/flow/02-pomodoro-flow.md`; Tyler
picked "Ring + time + Focus/Break + round").

## Where it is

- **Elements → Shapes → Timer** (`studio-panels.tsx`) puts one at the
  playhead: five minutes, white, in Fredoka, square in the middle of the
  frame on any shape of video.
- **Its length is its time.** A 25-minute timer clip reads 25:00 at its start
  and 00:01 in its last second. Stretch or trim it on the timeline to change
  the time.
- **On the preview** it is dragged whole and resized by its two dots, the
  same way as a circle: its box is the one its two corners make, and the
  ring is the largest circle in that box.
- **The Timer card** in its inspector: Words above the time, Words below the
  time (40 characters each), Count up (from 00:00 instead of down to it),
  Ring, Font, Colour and Ring thickness. Fades and following something work
  as they do on any shape.

## How it is drawn

`src/lib/video/timer.ts` draws it for both ends, so the preview and the
export are the same picture.

- **It steps once a second,** in the preview and the export alike. The time
  shown in second k of a countdown is the clip's whole seconds minus k, as
  mm:ss, or h:mm:ss for a timer an hour or longer.
- **The ring** is drawn from the top, clockwise, with a faint whole ring
  behind it (a quarter as solid). Its share is the time left over the whole
  time, or the time gone when it counts up.
- **The words** are set in the timer's font, the time at about a quarter of
  the ring's width and the two lines at about a twelfth.
- **The export** (`render.ts`) draws one picture per whole second, at the
  timer's own box size rather than the whole frame, and draws each distinct
  picture once however many seconds and timers show it. So six identical
  focus rounds would share their pictures; with the round number in the
  words below, a three-hour study video is about 10,800 small pictures. They
  are laid at the timer's box through the same `concat` reader captions use.
  Whole seconds fall on whole frames at 30 and 60 frames a second, so the
  time never drifts over hours.
- It isn't drawn by ffmpeg's own text drawing: the server's ffmpeg may lack
  it, and it would not match the preview.

## Checked

`timer.test.ts` checks the time, the ring and the windows, and that the
preview's drawing is the export's for the same second.
`render-loop.test.ts` exports a three-second timer for real and checks the
picture holds through each second and moves on at the next.
