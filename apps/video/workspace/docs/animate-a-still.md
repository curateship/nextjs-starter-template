# Animate a still where it sits

Right-click a picture on the timeline, say what should move, and press Make it
move. Gemini Omni Flash makes a moving shot from that exact picture, and when
it arrives it takes the picture's place: same lane, same start, same length.
Nothing else on the timeline moves.

The point is cost. A still costs 3 to 13 cents to try. Motion costs about 10
cents a second, so it is paid for once, only on the stills that need it.

## Two ways in

- **Right-click a picture clip** for a menu with **Make it move…**, and Try
  again and Clear the failed try when the last try failed.
- **The inspector's Make it move card**, under The footage when a picture is
  selected (Tyler asked for it on 20 Oct 2026). It shows the cheapest price
  for that picture and a Make it move… button that opens the same window.
  While a shot is being made it says "Making it move" instead. After a failed
  try it gives the reason with Try again and Clear the failed try. A picture
  that cannot move gets the reason in place of the button. The code is
  `MakeItMoveCard` in `src/components/video-editor/moving-stills.tsx`.

Only pictures have either, not video, sound or words. A guest sent from
Project has neither, and no marker either, because a guest uses no AI
(`project-guests.md`). A shot an owner started still lands once the guest
closes the editor, since the worker waits while any window is editing.

## The window

The window holds:

- **The picture**, with how long it runs and where it starts.
- **What moves**, such as "waves crashing, the lamp turning". A shot longer
  than 8 seconds has one box for each 8 seconds, the same as the AI clip
  panel.
- **Length:** 4, 6 or 8 seconds, at least as long as the picture, starting on
  the shortest that covers it. The shot is trimmed back to the picture's
  length when it lands.
- **Quality:** Draft 360p, Normal 720p or Sharp 1080p, with prices, starting
  on the size the last shot used (`longer-ai-clips.md`).
- **The style line**, shown as "Sent with it" when the project has one
  (`visual-style.md`). The look picture is not sent, the same as every shot.
- **The price on the button**, such as "Make it move · $0.41".

The code is `src/components/video-editor/moving-stills.tsx`. The rules for
lengths, the shape and the swap are `src/lib/video/moving-still.ts`.

## Pictures longer than 8 seconds

One piece of a shot is at most 8 seconds. A longer picture asks for the
shortest run of 8 second pieces that covers it, made one after another the
way `longer-ai-clips.md` describes (Tyler, 19 Oct 2026). A 10 second still
asks for 16 seconds: two pieces, $1.62 at Normal. The two pieces land end to
end in the picture's place and the second is cut off at 10 seconds. Longer
runs are not offered, because they would only be cut off.

## What it refuses

- **A picture over 32 seconds:** "Make it move works on pictures up to 32
  seconds long. Shorten this one first." Four pieces is the most a shot has.
- **A picture smaller than the frame** (its Size under 100%, such as a
  sticker): "A moving shot always fills the frame. Set this picture's Size to
  100% first." A video clip is always the whole frame (`clip-frame-fit.md`).
- **A second try while one is being made:** "This picture is already being
  made to move."
- **The usual shot limits:** three shots at once in a project, six per
  person, the monthly allowance and the project's spend limit, counted
  exactly as for the AI clip panel (`several-ai-clips.md`).

## What is sent

- **The picture itself, as the first frame.** It is the person's own file,
  at any size and in any format, so it goes as a JPEG of at most 1536 pixels
  on its longest side, with see-through parts turned white.
- **The shape of the picture.** A wide picture asks for 16:9 and a tall one
  for 9:16, so the moving shot sits in the frame the way the picture did. A
  square picture asks for the project's shape, or 9:16 when the project is
  square or 4:3.
- **The words:** Google's tag naming the picture as the first frame, the
  style line, what moves, and "do not add captions or on-screen text".
- **No actor and no extras.** Those belong to first frames made in the AI
  clip panel.

## Where it lands

When every piece is ready, the picture clip becomes video clips:

- **The first piece keeps the picture's clip**, its name, its transition in
  and its picture fade in. The last piece keeps its fade out. Every piece
  keeps the fit and the colour.
- **The slow move goes**, because the shot moves on its own.
- **It lands muted** (Tyler, 19 Oct 2026). The picture had no sound, so a
  voice or music under it is not talked over. The inspector turns the sound
  on.
- **Nothing else moves.** The pieces fill exactly the picture's stretch of
  the lane.
- **The shot is on the project's Media panel too**, so an Undo back to the
  picture never loses it.

Who does the swap depends on whether the project is open:

- **Open in an editor:** the editor asks every 5 seconds while a shot is being
  made. When it is ready, the editor swaps it in as one change, so one Undo
  brings the still back, and says "The picture moves now. Undo brings the
  still back."
- **Not open:** the background worker swaps it in and saves the project in
  one step (`movingStillTick` in
  `src/server/video/asset-factories/moving-stills.ts`, every 15 seconds).
  History keeps the version before it when one is due (`project-history.md`).
- **Why two ways:** a save from the worker would clash with an open editor's
  next save, and the editor would stop saving (`two-windows.md`). So the
  worker stays out while a window is editing the project, and an editor
  open read-only leaves it to the worker. The server lets only one of the
  two land a shot.

## While it works

- **The marker:** "Making it move", with a small spinner, along the bottom of
  the picture clip, drawn like "Getting frames ready" on a video clip
  (`getting-media-ready.md`). A narrow clip shows the spinner alone.
- **Closing the tab never stops it.** The worker makes the shot, and the
  worker lands it if no editor is open when it arrives.
- **When it fails:** the picture stays as it is. The marker says "Couldn't
  make it move", the reason shows on hover, and Try again sits beside it. The
  right-click menu has Try again and Clear the failed try too. Pressing Make
  it move again replaces the failed try.

## When the picture is gone

If the picture was deleted, or swapped for another file, while the shot was
being made:

- **The shot goes to the project's Media panel** and is not put on the
  timeline.
- **A notice says so.** An open editor shows "A moving shot arrived after its
  picture was deleted. It is in Media." With no editor open, the bell gets "A
  moving shot arrived after its picture was gone", naming the project.
- **It is still charged**, because Google made it.

## What it costs

The same as any shot: about $0.10 a second at Normal, charged at Google's own
count when each piece arrives (`longer-ai-clips.md`). A 4 second still costs
$0.41 and a 10 second still $1.62. The cost lands on the project's AI spend
line and the meter's row carries the shot's id.

## Where it is kept

A shot made this way is a row of `video_ai_generations` like any other, with
four more columns (migration `0126_video_animate_still.sql`):

- **`clip_id`:** the timeline clip it is for.
- **`clip_start_ms` and `clip_duration_ms`:** where the picture sat and how
  long it ran when Make it move was pressed.
- **`clip_outcome`:** empty until it lands, then `replaced` or `gone`.

It has no first frame row, so it never shows in the AI clip panel's lists.
Shots made in the AI clip panel have the four columns empty.

## Limits worth knowing

- **The length of a piece is taken as asked.** A 4 second piece is laid as
  4.0 seconds. If Google's file runs a few frames short, the export holds its
  last frame for them, because ffmpeg's overlay repeats a finished input's
  last frame.
- **A tab closed in the second after a shot lands** may not have saved the
  swap yet. The shot is still on the Media panel, and dragging it into the
  picture's place puts it back.
- **A project opened in the same moment the worker lands a shot** can meet
  the clash described in `two-windows.md`: that window keeps its work as an
  "(unsaved edits)" project.
