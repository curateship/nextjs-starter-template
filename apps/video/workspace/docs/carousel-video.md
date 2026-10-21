# A carousel made into a video

The Export window's Video choice turns a carousel into a reel: every slide in
turn in a 9:16 video, with the change you pick between slides and music
under it. It is made as a new project and exported like any video.

## The choices

Tyler, 20 Oct 2026: "you pick" for both the seconds and the change.

- **Seconds each slide stays up:** 1 to 15, 3 to start.
- **Between slides:** Cut, Fade or Slide. Fade is a half-second crossfade and
  Slide a half-second slide-in, the editor's own transitions.
- **Music:** any track on your music shelf, from the video editor's Music
  panel, or none. It is laid under the whole video by the editor's own rule:
  ducked, at a quarter of its level, repeated when short and faded out when
  cut (see [background-music.md](background-music.md)).

## How long it runs

Slides times seconds. 7 slides at 3 seconds is 21 seconds. Fade and Slide add
nothing: each blend happens across the seam between two slides, so it borrows
its half second from them rather than adding one. A slide with a clip plays
for the clip's own length, up to a minute.

## What is made

- **A new project** named after the carousel, "Tips video", 9:16, with one
  lane of slides and, with music, a second lane for it. It opens in the video
  editor like any project, so a slide can be moved or held longer by hand.
- **Each slide** is drawn as a picture and kept in the media library. A 4:5 or
  square slide sits in the middle of the tall frame, with the slide's own
  background colour above and below.
- **A video slide** is made as its MP4 first (see
  [carousel-video-slides.md](carousel-video-slides.md)), padded the same way.
- **The export** is queued at high quality, 30 frames a second, and shows on
  the video Exports page when it is ready.
- **A failure part way** removes the slide pictures already kept, so nothing
  is left in the library with no project using it.

The code is `makeCarouselVideo` and `carouselVideoTimeline` in
`src/server/video/carousel-video.ts`.
