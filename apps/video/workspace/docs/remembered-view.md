# The editor remembers where you were

Close a project and open it again, and it comes back as you left it: the same
panel open on the left, the playhead on the same moment of the video, and the
timeline at the same zoom, scrolled to the same place, with the same clip
selected.

## What is remembered

- **The left panel:** Media, Music, Text, Brand, AI or Transcript. A panel
  that has since been removed from the editor opens Media instead.
- **The playhead:** the moment of the video you were on, so the picture above
  the timeline shows the same frame. A project that has since got shorter
  opens with the playhead at its end.
- **Zoom:** how far the timeline is zoomed in.
- **Scroll:** where the timeline is scrolled to, across and down.
- **The selected clip:** the one the inspector is showing. A group picked with
  Shift or Cmd comes back as just that last clip.

Nothing else. The cut tool starts off, and a project never opens playing.

## Where it lives

- **This browser's localStorage:** the same place the editor keeps its panel
  sizes. It is never sent to the server.
- **One record per person per project:** the key is
  `video-editor-view:<person's id>:<project id>`, written in
  `src/lib/video/editor-view-memory.ts`.
- **Why the person's id is in the key:** signing out does not empty
  localStorage. Without the id, the next person on the same browser would open
  the project where somebody else left it.
- **Two halves in one record:** the timeline writes its half and the left
  panel writes its own, and neither wipes the other.
- **When it is written:** the panel is saved as soon as you switch. The
  timeline is saved a moment after you stop scrolling, zooming, selecting,
  playing or dragging the playhead, and again as the editor closes or the tab goes away. The work is in
  `src/components/video-editor/use-remembered-view.ts`.

## What it does not survive

- **Another computer or another browser.** Each browser keeps its own copy, so
  a project opened on a laptop starts where the laptop last left it.
- **Clearing site data or a private window.** Either one empties localStorage,
  and the project opens the ordinary way.
- **Undo and redo.** They never touch any of it. Undo only steps back
  through changes to the clips themselves.

## How a project opens

- **With something remembered:** the zoom, scroll and selection are put back
  before the first frame is drawn, so the timeline never flashes at another
  zoom first. The remembered zoom replaces the fit-to-width a project otherwise
  gets on opening.
- **With nothing remembered:** the timeline fits the whole project across the
  visible width, as it always has.
- **When the remembered clip is gone:** a clip deleted in another tab or on
  another machine opens with nothing selected. There is no toast. Zoom and
  scroll still come back.
- **When the project fits the screen:** there is nothing to scroll, so only
  the playhead, the zoom, the clip and the panel visibly come back. On a wide window a short
  project fits at full zoom, and so does the fit-to-width, so the zoom looks
  the same either way.
- **When the project got shorter:** the browser stops the scroll at the end of
  the timeline.
- **When the stored value is damaged or storage is blocked:** the project opens
  the ordinary way, with no error.
