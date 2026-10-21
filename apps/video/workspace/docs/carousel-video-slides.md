# Video slides

A carousel slide can hold one short clip. The editor plays it muted and on a
loop, the export makes that slide an MP4 with the slide's other layers drawn
over it, and a shared link plays it.

## Putting a clip on a slide

- **Upload or drop** an MP4, MOV or WEBM in the Image panel, or on the slide
  (see [carousel-pictures.md](carousel-pictures.md)). Tyler chose uploaded
  clips only on 20 Oct 2026.
- **One clip a slide.** A second is refused with "A slide can hold one
  video." The saved slides are checked for this too, so a paste cannot get
  round it.
- **Fit and crop** work as for a picture: Fill, Crop or Fit, and Crop
  position.
- **In thumbnails** a clip shows its first frame and stays still. On the
  canvas and in the preview it plays muted and loops.

## What the export makes

- **The slide's file** is `slides/slide-03.mp4` in the ZIP, in place of the
  PNG. The other slides stay PNGs.
- **How it is drawn:** the layers under the clip are drawn as one picture,
  the clip goes into its box, cropped or fitted as on the canvas, and the
  layers over it are drawn on top. Text over a clip stays over it.
- **How long:** as long as the clip, up to a minute, which is the most
  Instagram plays on a carousel slide. A longer clip is cut there.
- **Sound** is kept when the clip has any.
- **Where a still is needed**, the clip's first frame stands in: the cover on
  Carousel exports and the page in the PDF.
- **Time:** the server makes the MP4 with ffmpeg while the export runs, so a
  carousel with a clip takes longer to export than one without, roughly as
  long as the clip runs.
- **A clip that is gone** fails the export like a missing picture, and
  nothing is kept.

## On a shared link

The share page plays a video slide with its own controls, muted to start. The
link answers `?slide=3` with the MP4 for a video slide (`type: "video"` in the
export's `slide_ranges`) and a PNG for the rest.

## Where it lives

`src/server/video/carousel-video-slides.ts` loads the clips and makes the
MP4s; `keepCarouselExport` in `src/server/video/carousel-exports.ts` puts them
in the ZIP.
