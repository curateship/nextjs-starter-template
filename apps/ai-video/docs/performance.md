## Performance rules

These cover the editor's playback engine, which is the hot path. The supporting
code lives in `src/pages/video-editor/playback-clock.ts`, `editor-preview.tsx`,
and `editor-timeline.tsx`.

### The sound source is the clock — never seek it to chase the clock

- `PlaybackClock` advances by wall time only when nothing is driving it. During
  playback the preview registers a `timeSource` and the clock follows that
  element's `currentTime`.
- Pick the element that carries the heard audio: an **unmuted audio track**
  wins (a reel's soundtrack — and what captions are transcribed from), otherwise
  the **topmost playing video** (its own audio, or just its frames when silent).
  Keying the clock to the sound is what keeps caption text locked to the audio;
  driving it from a muted video while the soundtrack plays separately desyncs
  them.
- Do **not** re-seek the chosen element for drift correction while playing.
  Setting `currentTime` mid-play interrupts the decoder (stutters video, clicks
  audio) — and a wall clock under main-thread jank (especially in dev mode)
  drifts ahead and triggers exactly those corrective seeks.
- Everything else (other tracks, the playhead, the readout, captions) follows
  the clock. A buffering source pauses the clock with it instead of letting time
  run ahead.
- Seeking is still correct when **paused** (scrubbing) — that's the only time
  `currentTime` should be set during normal use.

### Do no React rendering on the per-frame path

- Nothing should re-render via React on every clock tick. The preview renders
  its element tree once (from the clip lists) and a single `clock.subscribe`
  loop does all per-frame work imperatively: play/pause/seek/mute and toggling
  each element's `visibility`.
- The playhead line, ruler flag, and time readout update through direct DOM
  writes (`el.style.left`, `el.textContent`) in their own clock subscriptions —
  not through `usePlaybackTime`. Reserve `usePlaybackTime`/`usePlaybackPlaying`
  for low-frequency UI (e.g. the play/pause button state).
- React re-renders of the preview/timeline should happen only on edits, resize,
  or when the windowed video set changes — never as a function of the playhead.

### Dragging is a per-frame path too

- A clip drag fires a pointer move per frame, so the same rule applies: the chip
  moves by direct `el.style.left` writes and commits to the store once, on
  release. Snapping follows suit — the guide line is positioned through a stable
  imperative handle (`SnapGuideApi` in `studio-timeline.tsx`), never state.
- Anything a drag needs from the rest of the project is gathered **once, on
  pointer-down**, not per move. `buildSnapIndex` (`timeline-snapping.ts`) walks
  every track a single time and leaves a sorted array per lane; each move then
  binary-searches it. Rebuilding that per move would make a long timeline
  stutter, and nothing it reads can change mid-drag anyway.
- The same applies to the preview's text-overlay drag: position and centre-guide
  visibility are written straight to the DOM, because a re-render there would
  remount the `<video>` elements.

### Mount only the media you need

- Keep a live `<video>` only for clips near the playhead (active plus a short
  lookahead). One decoder per clip is wasteful — a template's slots are often
  the same source file, so a long timeline can mount dozens otherwise.
- Audio elements stay mounted (the soundtrack plays continuously); images and
  text are cheap and stay mounted with visibility toggled by the sync loop.
- Tradeoff: scrubbing into a clip that left the window reloads briefly. The
  lookahead keeps forward playback seamless; tune `MOUNT_LOOKAHEAD_MS` if
  needed.

### Cache immutable media

- A media id's bytes never change. The media proxy route
  (`/api/v1/media/$mediaId/file`) sends `Cache-Control: private, max-age=…,
  immutable` so the browser reuses bytes across elements, seeks, and reloads
  instead of re-fetching from remote storage. Use `no-store` only for responses
  that can actually change (e.g. re-rendered exports at a reused key).

### Judge performance on a production build

- `npm run dev` is unminified, runs React in dev mode, and carries HMR/source-map
  overhead — typically 2–5× slower to render than production. Assess real
  playback smoothness with `npm run build && npm start`.
- If playback is still heavy on weak hardware in production, the next step is
  generating low-resolution proxy media for the editor preview and using
  full-resolution only for export.
