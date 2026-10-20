# The AI clip panel

AI clip is the icon under AI tools on the editor's left rail. It walks one AI
shot from start to finish in four steps, each waiting for the one before,
because each needs what the last one made. Tyler drew it this way on 17 Oct
2026, in place of separate First frames and AI videos pages.

## The four steps

Each step is a grey card like the inspector's on the right, and each can be
shut. A shut card stays shut for that browser.

1. **Pick an actor.** Your active actors, as small faces. New actor drops a
   box down from the button rather than opening a window (Tyler, 19 Oct
   2026), with Name, Description, an optional Photo from Media and the Model.
   The new actor is active with no tags, and both can be changed on the
   Actors dashboard. What is typed stays when the box shuts, until Create
   actor makes the actor, which is then picked. An actor made here is made in
   this project's look and its picture goes on this project's spend line
   (`src/components/video-editor/ai-clip-new-actor.tsx`). Under them, the Extras button picks one clothing item,
   backdrop, prop and hair look for the frames, kept on the project
   (`extras.md`).
2. **Make a first frame.** Type the scene, such as "Holding a coffee in a
   bright kitchen", and pick how many, 1 to 4. The frame comes out in the
   project's shape and look without asking. A square or 4:3 project asks for
   9:16 or 16:9, because the picture models and the video model make only
   those two. The
   line above the button says which shape and look it will use and what it
   costs: $0.039 a picture, so two are about $0.08. An actor with more than
   one picture on its character sheet shows "Pictures of <name> to send":
   the main picture is picked to start with, and others can be added until
   the person board holds 4 pictures with the extras (see `extras.md`). Each
   frame says under its name which pictures and extras it was made from.
3. **Make the shot.** Gemini Omni Flash brings the picked first frame to
   life. Pick the length (4 to 32 seconds), the quality (Draft 360p, Normal
   720p or Sharp 1080p) and say what happens; a shot longer than 8 seconds
   asks what happens in each 8 seconds. The price shows first: about $0.10 a
   second at Normal, so 8 seconds is $0.81 (`longer-ai-clips.md` has the
   sizes and their prices). The shot is sent the actor's pictures and the
   extras the frame was made with, at every length (`extras.md`). Each shot
   then says what it was made with and what it cost, such as "Omni Flash,
   Normal 720p, $0.81".
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
  left menu is where one is renamed, re-posed or deleted, and where its
  character sheet is filled (`actors.md`).
- **First frames belong to one project** (`video_first_frames.project_id`).
  Deleting the project deletes them, and their pictures leave storage unless
  something else still uses them, such as a duplicate of the project.
- **Shots belong to one project** (`video_ai_generations.project_id`), as they
  always did. A shot made from a picture on the timeline with Make it move has
  no first frame, so it never shows in this panel (`animate-a-still.md`).
- **Made pictures stay in this panel.** They reach the Media panel only once
  they are on the timeline.

## Closing the panel

A shot is made by the background worker on the server. Closing the panel,
switching icons or closing the tab never stops it. While a shot is being made
the panel asks again every 5 seconds; reopening it shows the shot making or
finished. A project makes up to three shots at once, so several directions
for one frame can be tried side by side, and step 4 shows the picked frame's
newest three, each with its direction (see `several-ai-clips.md`).

## What it costs

Every picture, actor and shot made here names the project on the AI meter, so
the project's AI spend line counts it and its spend limit can stop it before
it starts (see `project-first.md`).
