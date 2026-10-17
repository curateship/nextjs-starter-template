# The AI clip panel

AI clip is the icon under AI tools on the editor's left rail. It walks one AI
shot from start to finish in four steps, each waiting for the one before,
because each needs what the last one made. Tyler drew it this way on 17 Oct
2026, in place of separate First frames and AI videos pages.

## The four steps

Each step is a grey card like the inspector's on the right, and each can be
shut. A shut card stays shut for that browser.

1. **Pick an actor.** Your active actors, as small faces. If there are none,
   or you press New actor, the same window as the Actors dashboard opens on
   top of the editor, and the new actor is picked when it saves. An actor made
   here is made in this project's look and its picture goes on this project's
   spend line.
2. **Make a first frame.** Type the scene, such as "Holding a coffee in a
   bright kitchen", and pick how many, 1 to 4. The frame comes out in the
   project's shape and look without asking. A square or 4:3 project asks for
   9:16 or 16:9, because the picture models and Veo make only those two. The
   line above the button says which shape and look it will use and what it
   costs: $0.039 a picture, so two are about $0.08.
3. **Make the shot.** Veo brings the picked first frame to life. Pick the
   length (4 to 32 seconds) and say what happens; a shot longer than 8 seconds
   asks what happens in each 8 seconds (see `longer-ai-clips.md`). The price
   shows first: $0.40 a second, so 8 seconds is $3.20.
4. **Drag it onto the timeline.** The finished shot drags onto a lane and
   lands where it is dropped, the same way a Media file does. A long shot's
   pieces land end to end on one lane, and one Undo takes them all back.

## Made in this project

Under the steps is everything this project has made, newest first: each first
frame with the shots made from it underneath.

- **Dragging again:** a first frame drags onto the timeline as a 4-second
  still, and a ready shot drags as a clip, as many times as you like.
- **Use:** picks that first frame for step 3.
- **Try again:** on a shot that failed, makes the failed piece again.
- **Delete:** a first frame takes its shots with it. Anything already on the
  timeline stays there.
- **Make a carousel:** ticks first frames in order and makes a new carousel,
  one slide per frame, each picture filling its slide. A picture in a
  different shape from the slide loses its edges and keeps its middle (Tyler's
  call, 17 Oct 2026). It opens in the carousel builder.

## Where things are kept

- **Actors are shared** across every project. The Actors dashboard in the
  left menu is where one is renamed, re-posed or deleted.
- **First frames belong to one project** (`video_first_frames.project_id`).
  Deleting the project deletes them, and their pictures leave storage unless
  something else still uses them, such as a duplicate of the project.
- **Shots belong to one project** (`video_ai_generations.project_id`), as they
  always did.
- **Made pictures stay in this panel.** They reach the Media panel only once
  they are on the timeline.

## Closing the panel

A shot is made by the background worker on the server. Closing the panel,
switching icons or closing the tab never stops it. While a shot is being made
the panel asks again every 5 seconds; reopening it shows the shot making or
finished. A project makes one shot at a time.

## What it costs

Every picture, actor and shot made here names the project on the AI meter, so
the project's AI spend line counts it and its spend limit can stop it before
it starts (see `project-first.md`).
