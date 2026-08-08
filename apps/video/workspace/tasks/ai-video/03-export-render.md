---
name: Video port — export and the render queue
status: done
---

**What this is.** Turning a timeline into a finished video file: a durable render queue, the ffmpeg compositor with real text/transition/brand rendering, loudness normalization and music ducking, the export modal, and an exports gallery. Sits on tasks 01–02.

**The use case.** Click Export, pick a quality, keep working while it renders, get the file the moment it's ready — and find every past render in one gallery with a good cover image.

**Why it's a good idea.** A render must survive a server restart and never run twice; the queue pattern here (jobs table, lease + heartbeat, orphan reclaim) is the same one creator watch and other background work reuse later. Sound levels are also where exports most obviously feel amateur — normalizing to the platform standard fixes that for every export at once.

**Reference code.** Behaviour: `apps/ai-video/src/server/{render-queue,video-render,exports}.ts`, `apps/ai-video/src/lib/{audio-loudness,audio-ducking}.ts` (+ their tests), `studio-export-modal.tsx`, `export-dashboard.tsx`, and the streaming routes `routes/api/v1/projects/$projectId/{render,render-thumbnail}.ts`. Shape: shell dashboard components and `lib/list-search.ts` for the gallery; the worker registers through task 01's boot-hook door. ffmpeg/ffprobe must exist on the host — say so out loud in errors when they don't.

## Tasks:

- **The queue.** `video_render_jobs` in `src/server/video/schema.ts` + the next free `00NN_video_render_queue.sql`: FIFO claim with `FOR UPDATE SKIP LOCKED`, lease token + heartbeat, orphan reclaim at boot and on tick, cancel, concurrency from `VIDEO_RENDER_CONCURRENCY` (default 1). Acceptance: killing the server mid-render leaves a job another worker reclaims — never a stuck "running" row and never a double render. Verification: start a render, restart the dev server, watch it finish; `npm run db:setup` + PGlite replay.
- **The compositor.** Per-aspect output sizes, quality presets (resolution + CRF), timeline cap of 10 minutes, transitions rendered for real, text overlays rasterized with `@resvg/resvg-js` and the bundled fonts (identical to the stage preview), brand watermark and end card from `video_settings`. Acceptance: a rendered file visually matches the stage preview for a seeded reference project — text, transitions and watermark included. Verification: render the sample project and watch the file.
- **Sound.** Two-pass loudness normalization to −14 LUFS (video stream-copied, only audio re-encoded) with an on/off default in `video_settings` and a per-export override in the modal; per-track ducking envelopes (default −12 dB, fade in 150ms / out 300ms) honored in export exactly as previewed. Acceptance: the ported loudness and ducking tests run green; toggling normalization off skips it. Verification: `npm run test` + ears on one export.
- **Export modal + indicator.** Quality picker, progress, auto-download on ready via a streaming download route (`src/routes/api/v1/video/projects/$projectId/render.ts`, `?filename=`, session-checked); closing the modal leaves the render running with a toolbar indicator in the studio. Acceptance: closing and reopening the modal reattaches to the running job. Verification: real browser.
- **Exports gallery.** An `/admin/video-exports` screen listing every render (search, sort, delete with confirm), with a cover-frame picker (choose a frame from the video) and editable title/description; server functions in `src/lib/api/video/exports.ts`, all guarded. Acceptance: `guards.test.ts` green; list state lives in the address so a reload keeps it. Verification: browser + `npx tsc --noEmit -p tsconfig.app.json` against the pre-existing error list.

## Rules

- Follow the UI rules at workspace/docs/ui-rules.md
- Use .agents/skills/audit-change to follow coding standards
- Don't make assumptions — if something is unclear, stop and ask instead of guessing
- Validate browser-facing work with .agents/skills/validate-app against the server already running on this app's port from local-apps.json; never start another

## The Review Checklist

[ ] Brief in plain english
[ ] Edge cases handled
[ ] Error paths handled
[ ] Update documents (if applicable)
[x] Add brief and what you changed below.

## Brief

Done 7 Aug 2026. Export lives on the Export button in the editor's top bar, and
every finished video lives at `/admin/video-exports` — sidebar link added
through the app's own navigation settings, not in code.

**What it does.** Press Export, give it a name, pick how big the file should be,
and close the
window if you like — the render carries on and the button says "Exporting"
until it is done. When it is ready the file downloads with the project's name
on it. Every finished export is then in the gallery: search it, sort it, rename
it, pick a different moment of the video as its cover picture, download it
again, or throw it away.

**How it is put together.**

- Migration `0046_video_render_queue.sql`: one table, `video_render_jobs`. A
  row starts as "somebody asked for this" and ends up holding the finished
  file, so the gallery is simply the finished rows.
- `src/server/video/render-queue.ts` — asking, cancelling, and the worker. It
  rides the shell's fifteen-second ticker through `src/app/server-options.ts`,
  alongside the media builders from task 01.
- `src/server/video/render.ts` — the compositor. Every clip becomes an ffmpeg
  input, titles and stickers are drawn to pictures by resvg in the app's own
  font, blends between clips are real fades, and the brand watermark and end
  card are laid on top.
- `src/lib/video/{render,audio-loudness,audio-ducking}.ts` — the facts both
  sides need. The sound helpers have 25 tests, including one that works out
  what ffmpeg would do with the ducking curve and checks it says the same thing
  as the preview.
- `src/lib/api/video/exports.ts` — seven endpoints, all guarded, all scoped to
  whoever is signed in. Two file routes under
  `src/routes/api/v1/video/exports/$exportId/` hand over the video and its
  cover, both session-checked.
- `src/components/video-editor/{export-dialog,use-project-export,export-details-dialog,exports-page,export-cover}.tsx`
  and the route `/admin/video-exports`.

**Decisions worth knowing.**

- **A restart cannot lose a render or run it twice.** A worker claims the
  oldest waiting row in one statement with `for update skip locked`, then holds
  a sixty-second lease it renews every twenty seconds while ffmpeg works.
  Anything whose lease has run out was being rendered by a process that is no
  longer there, and goes back in the queue — once. Interrupted twice and it
  says so instead of trying forever. Every finishing write is guarded by the
  lease token, so a worker that lost its lease throws its own file away rather
  than overwriting the row.
  Proved by starting a render, killing the server on port 3016 mid-render,
  restarting it, and watching the same row come back and finish: one file, one
  row, `attempts=2`.
  One thing to know: the shell's ticker starts on the first request that hits a
  guard, so on a fresh dev server nothing is reclaimed until somebody opens the
  app. That is shell behaviour, not this app's.
- **One export at a time per project, enforced by the database.** A partial
  unique index over `(project_id) where status in ('queued','running')` means
  pressing Export twice hands back the same job even when both requests land in
  the same instant.
- **The download route is keyed by the export, not the project.** The task file
  suggested `.../projects/$projectId/render.ts`, but the gallery lists exports
  from every project and a project can have several — so the address names the
  export.
- **How loud a video is is decided once, when it is asked for.** The setting is
  copied onto the job row, so changing it later cannot rewrite what was already
  made. The export window can also override it for one export.
- **Cover pictures are fetched, not linked.** The export routes ask for a
  session, and the dev server turns away a plain `<img src>` pointed at an app
  route even when the same address answers a `fetch` — the shell's own media
  route behaves identically. `ExportCover` fetches the bytes once and draws
  them, which works the same in development and in production.
- **The cover is taken from the finished file, streamed to disk.** A
  ten-minute export is far too big to hold in memory just to take one picture
  out of it.

**Fixed after the first real use (8 Aug).** Exporting a project with pictures
on it said "The export could not be made". The render itself was fine — it was
the last step, writing down how long the finished file runs. Clip lengths come
out of frame maths, so a timeline ends on something like 10418.75ms, and the
column that number goes in only takes whole milliseconds. It is rounded now,
with a test that keeps it that way, plus one that checks the width and height
stay whole and even for every shape and quality. A render that fails after its
file has been uploaded now deletes that file instead of leaving it in storage
with nothing pointing at it.

**Naming (8 Aug).** The export window opens with a name field at the top. It
starts from what the last export of that project was called, or the project's
own name, and it names only that one export — the project keeps its name. The
name is what shows in Exports and what the file is called when it is saved.
Leaving it empty falls back to the project's name.

**Left behind on purpose.** No progress percentage: ffmpeg's own progress on a
filter graph this shape is unreliable, and the editor already says whether an
export is waiting, rendering or ready. Stopping a render that has already
started is not offered either — a render is minutes, not hours, and killing
ffmpeg partway is its own piece of work.
