# A project holds everything about one video

On 17 Oct 2026 Tyler found the editor, Actors, First frames and AI videos too
scattered: four screens, joined only by an "Add to project" button. Since then
the project is the place you work in. This doc says what belongs to a
project, what is shared, and what the projects list and the editor show
about it. The AI clip panel itself is in `ai-clip.md`.

## What belongs to a project

- **First frames and AI shots.** Made in the project, kept with it, deleted
  with it.
- **The viral video it copies,** when it was made with Copy this
  (`video_projects.source_viral_video_id`). Deleting the saved video blanks it
  and the project stays.
- **Its look, its spend limit, its exports,** as before.

Actors are shared, because one face is used in many videos. Deleting a project
never deletes an actor.

## The left rail

- **AI tools** holds Captions, Tighten, Voice, Hook and Another language.
- **AI clip** sits under it (see `ai-clip.md`).
- **Copy** and **Exports** are pinned to the foot of the rail (Tyler, 17 Oct
  2026). The rail scrolls when the window is too short for every icon.

## Copy

The Copy panel plays the viral video this project copies and shows its
breakdown underneath: its parts with the hook marked, its cuts and every word.
Clicking a line jumps the player there. While the video is downloading or
being read, the panel says so and asks again every 3 seconds. A failed
download offers Try again.

A project starts copying a video from **Copy this** under a video in a Viral
project or a favourites collection. It makes a new project named after the
video and opens it in the editor with the Copy panel showing. Made from a
Viral project, it remembers that project, and the Copy panel's Open Viral goes
back to it with the video playing (`viral-projects.md`). Pressing it twice makes two projects
on one saved video, so the video downloads once. A project made from scratch
copies nothing, and the panel says where to find a video.

Flow, the six steps that copy a viral video, is planned to live in this panel
rather than on a dashboard of its own (`workspace/tasks/flow/`).

## Exports

The Exports panel lists this project's exports, newest first, with download,
share link, details, Try again and delete. New exports are still started from
the Export button at the top. The Exports page in the left menu lists every
project's.

## AI spend and the spend limit

- **What it counts:** every AI call made for a project writes the project's id
  into its row on the AI meter (`ai_usage_events.metadata.projectId`). The
  project's spend is the sum of those rows, read by `readProjectSpend` in
  `src/server/video/project-spend.ts`. Nothing else is stored.
- **Where it shows:** as "AI spend" in the inspector's Project card, beside
  the shape and length. Hovering lists it by tool; clicking opens the
  project's settings.
- **What is not counted:** pictures, AI clips and voices made before 17 Oct
  2026 named no project. Captions, Tighten and Hook already did.
- **The limit:** a dollar figure in the project's settings, empty for no limit.
  Before an AI call, `requireProjectBudget` refuses it when the spend plus
  what the call costs would pass the limit. A picture, a shot or a voice has a
  known price, so with a $5.00 limit and $4.50 spent, a $1.00 call is
  refused. A call priced by the words it writes has no price until it is
  made, so it is refused only once the limit is reached.
- **The refusal:** says what is spent, what the call costs, the limit and how
  far short the limit is. In the AI clip panel the message has a Raise limit
  button that opens the project's settings.
- **Shots still being made:** a Veo shot is charged when it arrives, so a shot
  check adds the price of every shot the project is still making, and says
  so: "shots still being made will add $3.20". Several shots started back to
  back cannot pass the limit between them (see `several-ai-clips.md`).
- **Why a call can still pass the limit a little:** a call priced by the
  words it writes has no price until it is made, so it is refused only once
  the limit is already reached.

## The projects list

- **Folders** are one dropdown beside New project (see `project-folders.md`).
- **Each row** shows the faces of the actors with a first frame in the project
  and, when it copies a video, that video's cover and title.
- **All actors** filters the list to projects with a first frame of one actor,
  kept in the address as `?actor=<id>`.
- **Pin** keeps a project at the top whatever the sort. The earliest pin
  comes first. A pinned row has a light yellow background (Tyler, 17 Oct
  2026), in the amber the app already uses for notices, fainter in dark mode.
- **Archive** takes a project off the list without deleting anything. Archived
  in the folder dropdown lists them, and Bring back returns one. Archiving
  takes the pin off. Several ticked projects archive in one press.

## Deleting and duplicating

- **Delete** says what goes with the project before it goes: its first frames,
  AI clips and exports, counted, and that actors, the copied video and library
  footage stay. The first frames' pictures and the shots' clips leave storage
  afterwards unless another project, an actor, a carousel, a collection or a
  timeline still uses them (`mediaStillInUse` in
  `src/server/video/media-in-use.ts`). One that will not come out is logged
  and left in the library.
- **Duplicate** copies the first frame records, which show the same pictures,
  and keeps the copied video, the look and the spend limit. Shots are not
  copied; the ones already on the timeline come with the timeline. Tyler chose
  sharing the pictures over copying them on 17 Oct 2026.

## First frames from before this change

Migration `0112` gave every older first frame the project whose timeline
already used its picture. On the local database there were none. A frame that
no timeline used has no project; nothing shows it, and it stays until Tyler has
seen the list on the live site and says to delete them.
