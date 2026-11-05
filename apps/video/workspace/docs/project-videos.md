# A project holds many videos

A video project holds as many videos as you like, hundreds if need be. Each
video has its own edit. What a series shares is set once on the project.
Tyler, 1 Nov 2026: "Right now every project can only have one piece of content
and its timeline but a project can have hundreads of content."

## Tyler's rules

- "the project dashboard stays the same with its table"
- "clicking a project open 3 panel dashboard with the last video selected. the
  left panel lists the videos called "Videos" as the first selected rail tab.
  If its the first time the project open then it would select the first video,
  after that it remembers the last video"
- "why would we combine them both in projects when they're completely
  different things". Video projects hold videos. Carousels are kept apart.

## What belongs to the project, and what to each video

- **Set once on the project:** its name, its look, its picked extras, its
  guests, its first frames and AI shots, and the media shelf of files uploaded
  in it.
- **Set on each video:** its edit, its name, its shape, its status, its pin,
  its archive, its history, its picture, its exports, its AI spend limit, and
  the viral video it copies.
- **Where it is stored:** each video is a row of `video_project_videos`, with
  the project's id on it. The project row is `video_projects`
  (`src/server/video/schema.ts`). Saving is `writeVideoTimeline` in
  `src/server/video/project-videos.ts`, the one place a timeline is written.

## Opening a project

- **From the projects table:** clicking a project opens the editor with the
  Videos tab picked on the left rail.
- **Which video opens:** the one you had open last in that project. The first
  time, it is the first one in the Videos tab, which is the last edited.
- **Where that is remembered:** on the server, per person and per project, in
  `video_project_last_videos`. So it holds across browsers. A guest sent from
  Project has their own last video.
- **The address:** `/admin/video-editor/<project>?video=<video>`. An address
  with no `?video=` opens the remembered one, so every old link still works.
- **Archived videos:** opened only when named in the address, or when every
  video in the project is archived.
- **A project with no video left:** opening it writes nothing. It shows "has
  no videos" with a New video button, which asks for a name first. Opening never makes a row, because a
  link can load a page just by being pointed at.

## The Videos tab

The Carousels tab in the carousel editor is the same panel, `PiecesPanel`
(`src/components/video-assets/pieces-panel.tsx`), handed carousel calls
([carousel-project-carousels.md](carousel-project-carousels.md)).

- **Each row:** the video's picture on the left, 48px square, and beside it
  its name, then its length, status, shape and last edited date (Tyler, 4 Nov
  2026: "the title should be beside the thumbnail ... and make the thumbnail
  bigger"). The Carousels tab draws its rows the same way. The open video's
  row is shaded.
- **Clicking a row:** saves the open video's last edit, then opens the other
  one in the player.
- **The header:** the rail's icon and the title, then three icons, as the
  Media tab has: search, filter and +, 8px apart, the same as Media's.
- **Search:** the magnifying glass opens a box that filters by name. A dot on
  it says a search is set.
- **Filter:** the funnel opens a menu drawn as the Media tab's: Sort (Last
  edited, Newest, Name), Status (Any, Draft, Ready, Posted) and Show (Videos
  or Archived), each with a tick on the one picked, and Clear filters under a
  line once one is set. Pinned videos stay on top whatever the sort.
- **New video:** the + opens a small window asking for a name, a shape and a
  status, then Create video makes it and opens it. It never makes a video by
  itself or with a made-up name (Tyler, 1 Nov 2026: "Click add should not
  automatically add a video with a random name"). The shape starts on the
  open video's. A project with no videos asks the same from its New video
  button.
- **The count line:** "Videos · 12" in small capitals with Select beside it,
  as the Media tab has. Select turns on the tick boxes and becomes Done.
- **A row's menu:** Rename, Duplicate, Move to project, Pin, Archive (or Bring
  back), the three statuses, Send to Promo, and Delete. Send to Promo sends
  the video's newest finished export ([send-to-promo.md](send-to-promo.md)),
  and is left off for a guest.
- **A video asked for in Promo** shows "Asked for in Promo:" and the first
  line of the brief under its name, with the whole brief on hover.
- **Duplicate:** the copy goes in the same project, named "copy". It takes a
  moment before its original's last edited time, so under Last edited it sits
  right under it. Under Newest it is at the top.
- **Move to project:** lists your other projects. The video's history,
  exports and briefs go with it. Its first frames and AI shots stay with the
  old project. Clips already on its timeline keep playing.
- **Mass select:** Select on the count line. Ticked videos can be archived,
  moved or deleted in one press.
- **Delete:** says how many videos and exports go, and that first frames, AI
  shots and the media library stay.
- **A long list:** 200 at a time, with Load more.
- **Guests:** a guest sees the tab and can open any video in the project.
  Making, renaming, moving and deleting videos are the owner's alone.

## AI spend

- **Per video:** each video has its own limit, set in the settings window
  opened from the editor. The Spending card names the open video.
- **What counts:** every AI call writes the project's id and the open video's
  id onto its row of the AI meter. A first frame or AI shot is paid for by the
  video that was open when it was made, though it belongs to the whole
  project.
- **The project's total:** hovering the video's AI spend in the inspector
  shows the whole project's total under the video's own lines.
- **A picture made from the Actors page** in a project's look names the
  project only. It counts toward the project's total and no video's limit.

## The projects table

- **Same table:** each row now shows how many videos the project has, their
  lengths added together, and the shapes they are in.
- **Its picture:** the picture of its last edited video. The "Copies" line
  shows the viral video its last edited copying video copies.
- **Duplicate:** copies every video, with its edit, status and spend limit,
  plus the look, extras and first frames.
- **Delete:** says how many videos go, then everything else as before.

## Another language and kept work

- **A language copy** is a new video in the same project, named "My Short
  (Spanish)", and remembers the video it came from.
- **A refused save** (another window saved first) is kept as a new video in the
  same project, named "(unsaved edits)".

## The move from one video per project

Migration `drizzle/0145_video_project_videos.sql` did it.

- **Every old project** became a project with one video. That video has the
  project's own id, so old links, guest links and handoffs still find it.
- **Its history, picture, exports, briefs and AI meter rows** were given that
  video's id.
- **Left for one release:** the old columns on `video_projects` (timeline,
  aspect, version, spend limit, copied video, language) and the old
  `video_project_thumbnails` table. Nothing reads them. The release before
  0145 still does, for the minute or two a deploy runs both.
- **The trigger `video_id_from_project`** fills in a video id when that older
  release writes a history row, export, brief or editor window during the
  deploy.
- **Deploy web and worker back to back.** Between the two, the older worker
  could render an export from the frozen old timeline. Try again on that
  export fixes it.
- **Owed:** a later release drops the old columns, the old thumbnails table
  and the trigger, once this release is live everywhere.
