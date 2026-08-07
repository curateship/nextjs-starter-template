---
name: Video port — export and the render queue
status: todo
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
