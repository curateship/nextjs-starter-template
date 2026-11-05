# Timeline markers

A marker is a pin on the timeline's ruler. You drop one while you watch, name
it, and a dragged clip edge snaps to it. A named marker is also a chapter in an
export's Chapters card ([youtube-chapters.md](youtube-chapters.md)).

## Dropping, naming, moving and deleting

- **Drop one:** press M anywhere in the editor, playing or paused, or press
  the pin button on the timeline's toolbar. The pin lands at the playhead. M
  is ignored while you type in a box, while a window is open, and while a
  thumbnail is being designed.
- **The first one explains itself.** Dropping the first pin on a video shows
  a message saying what a pin is for and how to name, move and delete it,
  because a bare pin on the ruler doesn't say.
- **Name it:** double-click the pin, or right-click it and pick Rename. A
  small box opens under it. Its name shows beside the pin on the ruler,
  cut short when it is long.
- **Move it:** drag the pin along the ruler. A press on a pin never scrubs the
  playhead.
- **Delete it:** right-click and pick Delete.
- **Undo:** every drop, rename, move and delete is one Undo step. Markers are
  undone together with the clips, because the teaser
  ([teaser.md](teaser.md)) moves both at once.

## Rules

- **At most 100 per video.** A 101st press says so in an error toast instead
  of dropping nothing.
- **One pin per moment.** A second press on the same millisecond adds nothing.
- **Names are up to 100 characters.** An unnamed pin is still a snap point,
  but it is not a chapter.
- **Clip edges snap to pins** the same way they snap to the playhead, the
  start of the video and music beats. Holding Alt while dragging turns all
  snapping off.

## Where they are kept

- In the video's timeline JSON as `markers`, a list of `id`, `atMs` and
  `name` (`src/lib/video/timeline-markers.ts`). A timeline with no markers
  leaves the field out, which is how every timeline made before markers reads.
- An export of one stretch keeps only the pins inside it, counted from the
  stretch's start (`markersInStretch`, used by `timelineStretch`).
- A History version holds the markers too, so restoring one brings its pins
  back.
- Share-link viewers never see markers.
