# Actors and their character sheets

An actor is a person who appears in your AI clips. Each actor has a character
sheet: several pictures of the same person, such as front, side, full body or
smiling. One of those pictures is the main picture. Actors are shared across
every project, so the sheet is set once and used in every video.

Every first frame used to be drawn from one picture, so a character drifted
from video to video. Sending a front and a side view gives the picture model
more to hold the face steady.

## The sheet

- **Where it is:** Actors in the left menu. Click an actor's card (or its
  cog) to open the actor window. The Character sheet card sits under
  Character. A new actor's sheet starts with the picture it was made from, so
  the card appears once the actor exists.
- **Each picture's settings:** a cog shows in the picture's top right corner
  when the pointer is over it, and always on a phone. Its menu holds the
  Label box, Make main (or a ticked "Main picture" on the main one) and
  Remove from sheet. One picture's menu is open at a time.
- **Adding a picture:** the dashed "Add a picture" box, the same size as the
  pictures beside it, opens the Media library. Pick a file
  already there or upload one. The same file goes on one actor's sheet once.
  A sheet holds up to 12 pictures (`MAX_SHEET_PICTURES` in
  `src/lib/video/asset-factories.ts`).
- **Labels:** each picture has an optional label of up to 60 characters,
  saved when you press Enter or close the menu. Clearing the box clears the
  label.
- **The main picture:** it is the face on the actor's card, on the projects
  list and in the AI clip panel's actor picker. It is always the first
  picture on the sheet. "Make main" in another picture's menu switches it.
- **Each change saves at once.** Adding, labelling, making main and removing
  do not wait for Save changes, which still saves the name, description,
  model, status and tags.
- **The card on the dashboard** says how many pictures the sheet holds.
- **Tags** in the actor window are pills. Enter or a comma turns what was
  typed into one, the x on a pill removes it, and Backspace in an empty box
  removes the last one. Tags are lowercased and kept once each, up to 30
  (`MAX_ASSET_TAGS`). They save with Save changes, like the name.

## Which pictures a first frame uses

- **By default, the main picture alone.** A one-picture actor sends exactly
  what it sent before sheets existed, with the same prompt.
- **Picking more:** when the actor's sheet has more than one picture, step 2
  of the AI clip panel shows "Pictures of <name> to send". Tap a picture to
  add it or take it off. At least one stays picked.
- **Order:** the main picture goes first when it is picked, then the others,
  oldest on the sheet first. A project's look picture always goes last.
- **The prompt** gains one sentence when more than one picture is sent: "The
  first 2 pictures all show Mia: keep that one person's face, hair and
  build."
- **The record:** each first frame keeps the Media ids of the actor pictures
  it was sent, in order (`video_first_frames.actor_media_ids`). Under its name
  in the panel it says "From main picture, Side". Frames made before 19 Oct
  2026 show no such line, because what they used was never written down.
- **A picture taken off the sheet later** still shows on the frames made from
  it, as "a removed picture".

## How many pictures a model takes

From Google's pages, read 19 Oct 2026. The numbers live in
`actorPicturesPerRequest` in `src/lib/video/asset-factories.ts`.

| Model | Pictures of the actor at once |
| --- | --- |
| Nano Banana (`gemini-2.5-flash-image`), used for every first frame | 3, or 2 when the project has a look picture, because the look picture takes one of the 3 places |
| Nano Banana 2 (`gemini-3.1-flash-image`) | 4, apart from a look picture |

The panel refuses a pick past the limit and says the number. The server
checks the same number again before anything is paid for.

Each extra picture is billed by Google as a little more input on a request
that costs $0.039 a picture anyway.

## Re-pose

Re-pose makes a new picture and makes it the main one. The picture it
replaces stays on the sheet, where it can be made main again or taken off.

## What removing and deleting keeps

- **Taking a picture off the sheet** removes it from the sheet only. The file
  stays in Media.
- **The main picture cannot be taken off.** "Pick another main picture before
  removing this one." An actor always has one.
- **Deleting an actor** removes its sheet and its first frames, never the
  files. The pictures stay in Media.
- **Deleting a file from Media** takes it off every sheet it was on. The main
  picture cannot be deleted from Media while it is an actor's main picture.
- **Deleting a project** never deletes a file that sits on a sheet, even one
  that started as that project's first frame (`mediaStillInUse` in
  `src/server/video/media-in-use.ts`).

## Where it lives

- The table is `video_actor_sheet_pictures`, added by
  `drizzle/0119_video_actor_sheet_pictures.sql`. That migration gave every
  existing actor a one-picture sheet of its main picture.
- The main picture is still `video_actors.image_media_id`, so everything that
  showed an actor's face reads the same column as before.
- Server code: `src/server/video/asset-factories/actors.ts`. The window's card:
  `src/components/video-assets/actor-sheet-card.tsx`.

## Not built yet

These are later parts of task `features/42-actor-character-sheets.md`:
making the sheet's missing angles in one press, adding a first frame to the
sheet, sending the sheet on Re-pose and to Veo, the same-person check, and a
description kept apart from the pose.
