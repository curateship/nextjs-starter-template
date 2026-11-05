# A project holds everything about its videos

On 17 Oct 2026 Tyler found the editor, Actors, First frames and AI videos too
scattered: four screens, joined only by an "Add to project" button. Since then
the project is the place you work in. Since 1 Nov 2026 a project holds many
videos (`project-videos.md`). This doc says what belongs to a project, what is
shared, and what the projects list and the editor show about it. The AI clip
panel itself is in `ai-clip.md`.

## What belongs to a project

- **First frames and AI shots.** Made in the project, kept with it, deleted
  with it.
- **Its look and picked extras,** shared by every video in it.
- **Each video's own pieces:** the viral video it copies, when it was made with
  Make this a template before Viral moved to its own app
  (`video_project_videos.source_viral_video_id`), its spend limit and its
  exports.

Actors are shared, because one face is used in many videos. Deleting a project
never deletes an actor.

## The left rail

- **AI tools** holds Captions, Tighten, Voice, Hook and Another language.
- **AI clip** sits under it (see `ai-clip.md`).
- **Copy** and **Exports** are pinned to the foot of the rail (Tyler, 17 Oct
  2026), with **History** under them (`project-history.md`). The rail scrolls
  when the window is too short for every icon.
- **The open panel's button** has a black line down its left side, at the
  edge of the screen (Tyler, 20 Oct 2026: "the black border on editor and
  caurosel should be on the left edge"). The line is one piece that slides
  to the next button on the tabs' curve (Tyler: "make the tab animation
  slide"). The carousel studio's rail does the
  same. The line is the text colour, so it is white in the dark theme
  (`src/lib/video/rail.ts`).

## Project settings

The project's settings window holds Name and Look. Opened from the editor it
also holds Spending, which is the open video's own limit. Each card folds
from its header, the arrow showing on hover, and this browser remembers
which cards were left shut (Tyler, 20 Oct 2026). A shut card opens by itself
while a field in it is refused, such as an empty name or a spend limit that is
not a number, so the field the error names is always in view. The New project
window keeps every card open. The cards are
`src/components/video-assets/settings-fold-card.tsx`.

## Copy

The Copy panel plays the viral video the open video copies and shows what
Gemini made of it underneath (`src/components/video-editor/studio-copy-panel.tsx`).

- **Which videos copy one.** Only videos made with Make this a template, a
  button in Video's old Viral section. Viral research moved to its own app on
  4 Nov 2026 and that section was removed, so no new video starts copying one
  (Tyler picked "Keep the Copy panel" for the videos that already do).
- **A video that copies nothing.** The panel says so, and points to the
  Viral app: press Send to Video there, and the draft arrives with its script
  and the original on the Media shelf (`viral-connection.md`).
- **The breakdown.** Three folding sections, each clickable to jump the
  player there (`src/components/video-editor/breakdown-panel.tsx`). The
  browser remembers which were left shut.
  - **How it is built:** the parts of the video's story, such as the hook,
    with their times and a line on what each part does.
  - **Shots:** where each new shot starts.
  - **What is said:** every line spoken and any words written on screen.
- **Open the original** opens the video where it was posted.
- **The original was deleted.** When the saved video was deleted, before
  the Viral section went, the panel says "The original video, <title>, was
  deleted" instead. The title was written onto each copying video at the
  delete (`video_project_videos.source_viral_video_title`). A duplicate carries
  it too.

### The worker behind it

A saved viral video is a row of `video_viral_videos`, and its status is the
job (`src/server/video/viral/saved-videos.ts`, worker `video-viral-breakdown`).

1. yt-dlp downloads it, capped at `VIDEO_MAX_DOWNLOAD_BYTES` (100MB by
   default), and keeps the title, channel, length and counts it reports.
2. The file goes in the media library, and ffmpeg takes a cover frame.
3. A row that wants no analysis stops at `downloaded`.
4. Otherwise Gemini watches the file and writes the breakdown, metered as
   `viral_breakdown`.

- **Try again.** A failed row shows its reason and a Try again button. Try
  again on a breakdown that failed after the download landed reads the stored
  file, so it is never downloaded twice.
- **Closing the browser stops nothing.** A row left half done by a restart
  goes back in the queue once its claim runs out.
- **While it works** the panel says what it is doing and asks again every 3
  seconds.
- **The file stays** while a saved video points at it (`media-in-use.ts`).

## Exports

The Exports panel lists the open video's exports, newest first, with download,
Send to Promo, share link, details, Try again and delete. Under each name it
says where the export went in Promo ([send-to-promo.md](send-to-promo.md)). New exports are still started from
the Export button at the top. The Exports page in the left menu lists every
video's, naming the project and the video.

## AI spend and the spend limit

Each video has its own spend limit since 1 Nov 2026 (Tyler's pick). The full
rules are in `project-videos.md`, "AI spend".

- **What it counts:** every AI call made in the editor writes the project's id
  and the open video's id into its row on the AI meter
  (`ai_usage_events.metadata.projectId` and `videoId`). A video's spend is the
  sum of the rows naming it, read by `readVideoSpend` in
  `src/server/video/project-spend.ts`. Nothing else is stored.
- **Where it shows:** as "AI spend" in the inspector's Project card, beside
  the shape and length. Hovering lists it by tool and gives the whole
  project's total; clicking opens the settings, where the video's limit is.
- **What is not counted:** pictures, AI clips and voices made before 17 Oct
  2026 named no project. Captions, Tighten and Hook already did.
- **The limit:** a dollar figure, empty for no limit. Before an AI call,
  `requireVideoBudget` refuses it when the video's spend plus what the call
  costs would pass the limit. A picture, a shot or a voice has a known price,
  so with a $5.00 limit and $4.50 spent, a $1.00 call is refused. A call
  priced by the words it writes has no price until it is made, so it is
  refused only once the limit is reached.
- **The refusal:** says what is spent, what the call costs, the limit and how
  far short the limit is: "This video has spent $4.50 of its $5.00 limit". In
  the AI clip panel the message has a Raise limit button that opens the
  settings.
- **Shots still being made:** an AI shot is charged when it arrives, so a shot
  check adds the price of every shot the video is still paying for, and says
  so: "shots still being made will add $0.81". Several shots started back to
  back cannot pass the limit between them (see `several-ai-clips.md`).

## The projects list

- **Folders** are one dropdown beside New project (see `project-folders.md`).
- **Each row** shows the faces of the actors with a first frame in the project
  and, when its last edited copying video copies a viral video, that video's
  cover and title. The columns count its videos, add up their lengths and list
  their shapes.
- **All actors** filters the list to projects with a first frame of one actor,
  kept in the address as `?actor=<id>`.
- **Pin** keeps a project at the top whatever the sort. The earliest pin
  comes first. A pinned row has a light yellow background (Tyler, 17 Oct
  2026), in the amber the app already uses for notices, fainter in dark mode.
- **Archive** takes a project off the list without deleting anything. Archived
  in the folder dropdown lists them, and Bring back returns one. Archiving
  takes the pin off. Several ticked projects archive in one press.
- **While Pin, Duplicate or Archive runs**, only that row's buttons lock and
  the pressed one spins. Every other row stays usable.

## Deleting and duplicating

- **Delete** says what goes with the project before it goes: its videos, first
  frames, AI clips and exports, counted, and that actors, the copied video and library
  footage stay. The first frames' pictures and the shots' clips leave storage
  afterwards unless another project, an actor or its character sheet, a
  carousel, a collection or a timeline still uses them (`mediaStillInUse` in
  `src/server/video/media-in-use.ts`). One that will not come out is logged
  and left in the library.
- **Duplicate** copies every video in it, with its edit, status, spend limit
  and copied viral video, plus the first frame records, which show the same
  pictures, and the look and extras. Shots are not copied; the ones already
  on a timeline come with the timeline. Tyler chose
  sharing the pictures over copying them on 17 Oct 2026.

## First frames from before this change

Migration `0112` gave every older first frame the project whose timeline
already used its picture. On the local database there were none. A frame that
no timeline used has no project; nothing shows it, and it stays until Tyler has
seen the list on the live site and says to delete them.
