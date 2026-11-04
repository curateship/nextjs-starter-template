# Send to Promo

Send to Promo copies a finished video, carousel or thumbnail into a project's Archive in the Promo app. Promo keeps its own copy, so deleting the export in Video never breaks what is in Promo (Tyler, 4 Nov 2026: "Own copy"). The task is `workspace/tasks/promo/01-send-to-promo-and-archive.md`. Promo's side is in Promo's `workspace/docs/archive.md`.

## Setting it up

- **Promo makes the key.** On Promo's Settings → Video, Make a key, then Copy.
- **Video keeps the address and the key** on Settings → Promo. Both save themselves as they are typed or pasted. The key is scrambled before it is stored, and only its last four characters show again.
- **Test this key tells Promo where this Video is.** Promo only fetches files from, and only calls back to, the Video address that last pressed Test. So Test has to be pressed once before the first send, and again if Video moves to a new address.
- **The key decides whose Promo projects you see.** Things sent land in the projects of the Promo admin who made the key.
- **Sending is admin only**, because the key is the site's and puts files into Promo. A guest sent in from the Project app never sees the buttons.

## Where the button is

- **Exports page:** the paper plane in the actions column of a finished row, on Exports and on Carousel exports. Ticking rows shows "Send to Promo (3)" in the toolbar, which sends them all at once.
- **The editor's Exports panel:** the same paper plane on each finished export.
- **The Videos tab and the Carousels tab:** Send to Promo in a row's menu sends that video's or carousel's newest finished export. With none yet it says "Export it first".
- **The Thumbnail board:** the paper plane on a version's tile sends that thumbnail as a picture. Any version can go, starred or not. Video draws it as a JPEG at 1280 × 720 or 1080 × 1920 when the send starts.

## The send window

- **Promo project:** every Promo project, with tick boxes. Any number may be ticked, and each gets its own copy. It opens on the projects picked last time for the same video or carousel project.
- **Leave a draft in:** the networks the ticked projects use, out of Instagram, TikTok, LinkedIn and X. A ticked network gets a draft waiting in its post writer in Promo. X is greyed out for a video, because X takes pictures only.
- **With every language copy:** shown for a video that has language copies, and ticked to start with. Each copy's newest export in the same shape goes too, and Promo keeps them together. A copy with no export in that shape is skipped and named.
- **Also as a PDF for LinkedIn:** for a carousel. The carousel's PDF, one slide a page, goes with it for a LinkedIn document post.
- **Also as a slideshow video:** for a carousel. Video makes a tall 9:16 video with a new slide every 3 seconds and sends it as a video of its own, kept together with the carousel in Promo. The sound is one of your music tracks, or none (Tyler, 4 Nov 2026: "Pick a sound"). The music fades over the last second. A picture slide holds for its 3 seconds; a video slide plays its first 3. Making it takes a few seconds, so the window shows "Making the slideshow and sending it" while it works.
- **Already in Promo:** when the same export was sent to a ticked project before, the window asks to "Replace the one in the archive" or "Send as new". Replace puts the new file, words and subtitles on the same archive item, and its drafts and posted marks stay. Posts already made keep the old video.
- **After Send:** one line per project, with a bar while Promo fetches the file, then "Sent to Launch week" and Open in Promo, or why it did not arrive and Try again.

## What goes with the file

- **The words:** the export's title and description, and a carousel's caption.
- **The cover:** the export's cover, which is the starred thumbnail when there is one.
- **Subtitles:** the video's captions as an .srt file, for a LinkedIn video. Captions are the text clips written from speech, the ones with word times or a voice line behind them. Words typed by hand, such as a title, are left out. An export of part of a project gets only the captions inside that part, timed from its start. They are read from the video as it is when the send starts, because an export keeps no copy of its timeline.
- **A carousel's slides,** one file each, in order. Promo never gets the ZIP.
- **Where to edit it:** a link back to the video or carousel in Video, for Edit in Video in Promo.

## On the Exports row

- **Under the name:** "Sent to Promo · Launch week" with Open in Promo, "Sending to Launch week, 40 out of 100" while it goes, or "Didn't reach Launch week" with the reason and Try again. A carousel's slideshow has its own line.
- **Try again** sends the same send again under the same id, with a new token. Promo deleted everything from the failed copy, so it starts clean.
- **The bell** rings in Video when a send didn't reach Promo. Promo's bell rings when something arrives.

## Posted and asked for

- **Posted marks:** when a post goes out in Promo from something this Video sent, Promo tells Video, and the video or carousel turns to Posted, the same as setting it by hand on its menu. Only an export that really arrived in Promo can be turned to Posted this way, and only its owner's video or carousel changes.
- **Open in Promo** is kept only when its address is on the Promo address saved on Settings → Promo.
- **Try again** starts a send's three-hour clock again, and two presses at once send it once. A send that fails keeps Promo's own words, or "The send to Promo failed. Try again." when the reason was the server's own text, which goes to the log instead.
- **Ask for a video:** a Promo project can ask for a video with a short brief and a Video project to put it in. Video makes a draft video there named after the brief's first line, keeps the brief, and rings the project owner's bell ("Launch teaser was asked for in Promo", "From Launch week."). The Videos tab shows "Asked for in Promo:" and the brief's first line under its name, with the whole brief on hover. Promo is offered every active admin's projects that are not archived, newest first, and never a member's.

## How the two apps talk

Every call carries the key as `Authorization: Bearer <key>`. A wrong key gets 401 and nothing else.

- **Video → Promo `POST /api/connect/video/hello`:** Test, with Video's address.
- **Video → Promo `GET /api/connect/video/projects`:** the send window's project list.
- **Video → Promo `POST /api/connect/video/items`:** one send. Promo answers at once and copies after.
- **Video → Promo `GET /api/connect/video/sends/<id>`:** how a send is doing.
- **Promo → Video `GET /api/connect/promo/file/<token>?part=main|cover|pdf|slide-N`:** a file of the send. The token is the guard: 32 random bytes, only its hash kept, one send's files only, good for 2 hours or until the send arrives.
- **Promo → Video `POST /api/connect/promo/events`:** `arrived`, `failed` or `posted`.
- **Promo → Video `GET /api/connect/promo/projects`** and **`POST /api/connect/promo/requests`:** Ask for a video.

## Limits

- **The bar is Video's own count** of the bytes Promo has fetched, written every 2 seconds. The window looks every 2 seconds, and asks Promo itself at most every 20 seconds a send, because Promo's own news usually lands first.
- **A send still on its way after 3 hours** is taken as failed, with a bell.
- **One press takes at most 50 exports and 10 projects.** Sending is limited to 60 presses an hour per person.
- **Files Video makes only for a send,** a drawn thumbnail or a slideshow, are kept under `video/promo-sends/` and deleted once Promo has its copy. One whose send failed stays until it is tried again.

The sends are `video_promo_sends` and the remembered picks `video_promo_picks` (`drizzle/0151_video_promo.sql`). A requested video's brief is `video_project_videos.promo_brief` (`drizzle/0152_video_promo_more.sql`). The code is `src/server/video/promo-*.ts`, `src/lib/api/video/promo.ts` and `src/components/video-promo/`.
