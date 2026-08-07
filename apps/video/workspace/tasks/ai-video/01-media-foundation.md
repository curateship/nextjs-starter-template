---
name: Video port — media foundation on the shell library
status: todo
---

**What this is.** The ground floor of the ai-video port: video-aware extras layered onto the shell's existing media library — duration and audio metadata, collections, filmstrip frames for timeline clips, and smooth-playback copies — plus the background workers that build them. No editor screens yet.

**The use case.** The studio editor needs to know how long each video runs, show a strip of frames on every timeline clip, scrub smoothly, and let footage be grouped into collections ("B-roll", "Hooks") when picking media.

**Why it's a good idea to do this first.** Every later task leans on media: the editor (02) drags it onto tracks, the renderer (03) reads the originals, the AI tools (04) transcribe it. The shell's media library, storage bucket and file route already exist — this task adds only what video needs on top, so nothing is built twice.

**This is a re-build, not a copy-paste — and deliberately smaller.** ai-video owned its entire media stack; here the shell's media tables, storage and `/api/v1/media/$mediaId/file` route stay untouched and app tables point at shell media rows. Behaviour reference: `apps/ai-video/src/server/{media-storage,media-proxy,media-collections}.ts`, `apps/ai-video/src/components/media-library-page.tsx`, `apps/ai-video/src/pages/video-editor/video-thumbnails.ts`. Shape reference: shell `src/server/media/`, `src/lib/api/media/`, `src/lib/list-search.ts`, and migration comments like `drizzle/0040_custom_shell_written_pages.sql`.

## Tasks:

- **Prerequisite — the guard test's exact file count, fixed shell-first.** `src/server/guards.test.ts` line 153 asserts the exact number of endpoint files (`toHaveLength(34)`), so any new file under `src/lib/api/` fails a test this app must not edit. Make the floor fix (`toBeGreaterThanOrEqual(34)`, comment updated) in `apps/custom-shell`, prove the shell unchanged with `npm run test` and a browser open, then carry the byte-identical line in `apps/video` so the next shell merge auto-resolves. Note: workspace-16's custom-shell already carries this exact fix uncommitted — make the change byte-identical to it, never a different wording. Acceptance: video carries the floor assertion and its own tests pass. Verification: add a scratch file under `src/lib/api/`, see the guard test still pass, delete it.
- **Prerequisite — a shell door for app background work.** The shell starts its background work itself (`ensureBackgroundTicker()` via `src/server/guards.ts`); an app has no way to register its own long-running workers without editing shell boot files. Add an off-by-default server option to `apps/custom-shell` (a `background.workers` hook in `src/server/app-options.ts` — a list of functions run once at server start, default empty), following the app-option recipe in `apps/video/CLAUDE.md`: doc comment, reader as a `function` with today's behaviour as the default, shell call site reads through the reader. With the option unset, prove the shell unchanged (`npm run test` + browser), merge shell → video, then set it in `src/app/server-options.ts`. Acceptance: custom-shell behaves exactly as before with the option unset. Verification: video registers a scratch worker that logs once, sees it run at boot, then removes it.
- **Tables, in an app-owned schema file.** Create `src/server/video/schema.ts` (a new file — never touch the shell's `src/server/schema.ts`) and a hand-written migration `drizzle/0044_video_media_foundation.sql` (next free number today; the `video` infix keeps future shell migrations from colliding). Tables, each pointing at shell media ids: `video_media_meta` (duration ms, dimensions, has-audio), `video_media_collections` + `video_media_collection_items` (name up to 120 characters, duplicate-name guard), `video_media_proxies` and `video_media_filmstrips` (status queued/ready/failed so a worker can retry). Acceptance: comments explain every table; deleting a shell media row takes its add-ons with it. Verification: `npm run db:setup` applies cleanly, and the PGlite test database that replays every `drizzle/*.sql` still boots in `npm run test`.
- **Probing and workers.** ffprobe fills `video_media_meta` when a video or audio file first needs it; background workers build playback proxies and filmstrips with ffmpeg, concurrency from `VIDEO_PROXY_CONCURRENCY` (default 1), registered through the boot-hook door above. Behaviour reference: `apps/ai-video/src/server/media-proxy.ts`. Acceptance: a freshly uploaded video gets meta, a proxy and a filmstrip without any user action; a failure marks the row failed and is retried on a later tick, never looped hot. Verification: upload a real video in the browser and watch the rows appear.
- **Binary routes.** New files `src/routes/api/v1/video/media/$mediaId/proxy.ts` and `.../filmstrip.ts` streaming from storage with the same session checks the shell's file route performs. Acceptance: signed-out requests are refused. Verification: a signed-out request gets 401/403; the signed-in browser plays the proxy.
- **Server functions in `src/lib/api/video/media.ts`.** Collections create/rename/delete, add/remove items, set-collections-per-item, and a list read with an "Uncollected" filter — each a `createServerFn` with a guard from `src/server/guards.ts` and a zod validator, shaped like shell `src/lib/api/media/`. Acceptance: `guards.test.ts` passes with zero unguarded functions. Verification: `npm run test` and `npx tsc --noEmit -p tsconfig.app.json` (compare against the pre-existing error list, don't expect silence).

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
