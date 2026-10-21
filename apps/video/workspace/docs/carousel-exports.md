# Carousel exports

Exporting a carousel downloads a ZIP, or its PDF, and also keeps both on the
Carousel exports dashboard, `/admin/video-carousel-exports`. From there it works like a
video export: download it again, share it by link, delete it, or let Clear out
old remove it. Tyler asked for "the same as video exports" on 18 Oct 2026, and
on 19 Oct 2026 for a page of their own: "The carousel export should be on its
own dashboard". The video Exports page lists video exports only.

## What Export does

- **Where:** the Export button at the top of the carousel editor
  (`/admin/video-carousels`, open a carousel), then Export slides.
- **What it saves first:** the carousel. The server builds the ZIP from the
  saved slides, so the editor saves what is on screen before it asks.
- **What the ZIP holds:** every slide as a full-size PNG, named
  `slides/slide-01.png` onwards in the carousel's slide order, plus
  `caption.txt` with the post caption. A slide with a clip is an MP4 instead,
  `slides/slide-03.mp4` (see [carousel-video-slides.md](carousel-video-slides.md)).
  Drag a slide to a new place and the next export's files follow the new
  order.
- **The PDF:** every export also keeps a PDF beside the ZIP, one slide to a
  page at one point per pixel, which is how LinkedIn takes a carousel. A video
  slide's page is its first frame. The Export window's "PDF for LinkedIn"
  downloads it at once. On the dashboard, the page icon beside Download saves
  it. An export kept before 21 Oct 2026 has no PDF; asking for one builds it
  from the ZIP's slides and keeps it.
- **The Export window** also offers Video, which makes a reel from the slides
  instead (see [carousel-video.md](carousel-video.md)), and "Write it with
  AI" for the caption (see [carousel-writing.md](carousel-writing.md)).
- **What happens after:** the browser downloads the ZIP straight away, and a
  message says a copy is kept in Carousel exports, with a button that opens
  it.
- **When it fails:** nothing is downloaded and nothing is kept. The Export
  window says why, for example that a slide's picture is no longer in the media
  library.

The server draws all the slides in one go. Five slides of text took just over a
second locally, from pressing the button to the download starting, so there is
no queue and no "waiting" row.

## On the Carousel exports dashboard

- **Where:** the left menu, Exports under Carousels. Migration 0123 adds the
  link to every menu that has a Carousels link. When Carousels is a top-level
  link, Exports is its last sub-link. When Carousels is itself a sub-link, the
  menu has no third level, so Exports sits straight after it. A new site's
  menu comes from the shell and has no Video links at all, so there is nothing
  more to add there.
- **The row:** the carousel's name as the title, "5 slides" under it, and the
  first slide as the cover picture.
- **Carousel column:** the carousel's name. It says "Carousel deleted" once
  the carousel is gone.
- **Shape:** 4:5, 1:1 or 9:16, the carousel's shape when it was exported.
- **Size:** the ZIP's size.
- **Slides:** the number of slides, on screens wide enough to show that
  column.
- **Download:** the same ZIP again, saved as `<title>.zip`. The page icon
  beside it saves the PDF, `<title>.pdf`.
- **Settings:** the title and "What it is about" can be changed, as for a
  video. The cover is always the first slide, so there is no moment to pick
  and no Save as a picture. To change the cover, move another slide to the
  front and export again.
- **Search:** finds a carousel export by its title, its description, its
  caption, or the carousel's name. It never finds a video export.
- **Clear out old:** counts and deletes carousel exports only. The video
  Exports page has its own, which never touches a carousel export.
- **Delete:** a page only deletes its own kind. An id of the other kind sent
  to it is skipped.

The dashboard is the video Exports page component, `exports-page.tsx`, handed
`kind="carousel"`. The columns, buttons, windows and paging are the same code,
so a fix to one page reaches both.

## What a kept export keeps

A kept export is a copy of the carousel as it was at that moment. Editing the
carousel afterwards changes nothing in it. The caption that the share page
shows is the caption in the ZIP, and it cannot be edited on the export.

**Deleting the carousel leaves its exports.** The ZIP, the cover and any share
link keep working, and the row says "Carousel deleted" where the carousel's
name was. This is the opposite of a project, whose exports go when the project
is deleted (see `export-storage.md`). The task asked for the carousel's exports
to stay, so they do; whether projects should match is Tyler's call.

## Why a carousel export is a row in `video_render_jobs`

The task left a choice between a table of its own and a kind of row in the
video exports table. It is a kind of row, `kind = 'carousel'`, and each page
asks for its kind. The reasons:

- **One list, one query.** Both dashboards list, search and page with the same
  query on `video_render_jobs`, filtered by kind. A second table would have
  needed a second copy of that query and its search.
- **The clear-out stays one query.** It picks finished exports of one kind
  older than a date, so each dashboard's clear-out is the same code asked a
  different question.
- **Share links need nothing new.** A link points at a row of this table. A
  second table would have needed a second kind of link.
- **Deleting is the same code.** The video file and the cover are removed from
  storage before the row, for both kinds.

The cost is a few columns only carousels use, and `project_id` may be empty.
A check in the database keeps every video export tied to a project and every
carousel export without one. A carousel row is written finished in one step,
so the render worker, which only claims waiting rows, never sees it.

## How the share page reads one slide

The ZIP is stored without compression, which costs almost nothing because PNGs
are already compressed. That leaves each slide's bytes in one unbroken run
inside the file. The row records where each run starts and how long it is
(`slide_ranges`), so the share page asks storage for exactly one slide's
bytes instead of fetching the whole ZIP for every picture.

The cover is a separate small PNG of the first slide, 360 pixels wide, so the
Exports list never pulls a full slide for a thumbnail.

## Where it lives

- `src/routes/_authenticated/admin/video-carousel-exports.tsx`: the
  dashboard, and `drizzle/0123_video_menu_carousel_exports.sql`: its menu
  link.
- `drizzle/0122_video_carousel_exports.sql`: the `kind`, `carousel_id`,
  `caption` and `slide_ranges` columns, `project_id` made optional, and 4:5
  allowed as a shape.
- `src/server/video/carousel-exports.ts`: building and keeping the ZIP, and
  reading one slide back out of it.
- `src/lib/video/stored-zip.ts`: the ZIP writer.
- `src/server/video/carousel-pdf.ts`: the PDF writer, and where the PDF sits
  beside its ZIP. Deleting or clearing out an export removes the PDF too.
- `src/server/video/carousel-export.ts`: drawing one slide as a PNG.
- `exportCarousel` in `src/lib/api/video/carousels.ts`: the endpoint the
  Export button calls.
