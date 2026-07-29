# Architecture Overview

`ai-video` is an AI reel-generation app.

It ingests high-performing short-form videos from creators, analyzes their
structure with Gemini, turns the best performers into reusable templates, and
lets a user assemble and export their own vertical reel in a timeline editor.

The app is built on a config-driven admin shell (sidebar/header/theme via
`ShellConfig`) so the layout, navigation, and shared UI come "for free" — but
the product itself is the reel pipeline described below, not a blank scaffold.

## Tech Stack

- **TanStack Start + Vite + React 19** — file-based routing under `src/routes`,
  server functions via `createServerFn`, nitro server output (`npm start`).
- **Tailwind v4 + shadcn/ui** — all UI primitives live in `src/components/ui`.
- **Drizzle + Postgres** — schema in `src/server/schema.ts`; hand-written SQL
  migrations in `drizzle/` (applied with `docker compose exec -T postgres psql`).
  Local Postgres runs in docker (`npm run db:up`, port 54322, db `ai_video`).
- **Gemini** (Files API + `generateContent`) for video analysis, captions, and
  script writing. Key from `AI_VIDEO_GEMINI_API_KEY`.
- **yt-dlp** (with curl_cffi) to download source reels; **ffmpeg/ffprobe** to
  composite exports and cover thumbnails; **@resvg/resvg-js** to rasterize text
  overlays (bundled Inter font, since the container's ffmpeg lacks freetype).
- **R2 / S3** object storage for media, thumbnails, and rendered exports. Client
  media URLs go through authenticated app routes; do not expose raw bucket URLs
  to the browser.

## The Pipeline

The product is one end-to-end flow. Each stage has its own route, server
module, and `lib/api` wrapper.

1. **Creator Watch** (`creators.ts`, `creator-watch.ts`) — track creators;
   optionally "watch" one to auto-ingest their new uploads on a schedule, and
   periodically re-sync engagement stats so the archive can sort by
   views-per-day velocity. New synced uploads create unread bell-tray
   notifications that link back to the creator archive.
2. **Viral Archive** (`viral-videos.ts`, `video-download.ts`) — download a
   creator's reels via yt-dlp, store the file + cover thumbnail, capture
   engagement stats. Background work is **in-process, no job queue**:
   `void processViralVideo(...)` after a status write; the dashboard polls
   `status` (downloading → analyzing → ready/error).
3. **Gemini Analysis** (`video-analysis.ts`) — upload the reel to the Files API,
   then `generateContent` returning zod-validated `transcript` (`startMs/endMs/
   text`) and `segments` (role: hook|problem|agitation|solution|proof|cta|other).
   The shared `generateJson(parts, schema, label)` helper backs all Gemini calls.
4. **Templates** (`video-templates.ts`) — turn an analyzed reel into a reusable
   template that links back to its source viral video, preserving the beat
   structure (segment roles + timings) so projects can inherit it.
5. **First Frames** (`first-frames.ts`) — create and organize actor-linked
   opening-frame image assets. First frames are saved in `first_frames`, point to
   generated media-library images, and feed the editor's AI Video element.
6. **AI Video Element** (`ai-video-generations.ts`) — turns a saved First Frame
   asset into a short Veo image-to-video clip. Jobs are stored in
   `ai_video_generations`, poll in-process, save completed MP4s as generated
   project media, and insert reviewed clips through the normal video path.
7. **Projects + Editor** (`video-projects.ts`, `src/pages/video-editor/`) — a
   project holds a timeline (`tracks` of `EditorClip`s: video|audio|image|text)
   plus its aspect ratio. The editor is the dnd-kit timeline + a 1080p
   design-space preview. Built-in sound effects are audio clips backed by
   generated WAVs in `public/sound-effects`. Timeline edits autosave on a debounce.
   Every timeline write goes through `writeProjectTimeline`, a compare-and-swap
   on the `video_projects.version` column: savers send the version they loaded
   and a stale write is rejected instead of overwriting. The editor turns that
   rejection into a conflict banner, stops autosaving, and keeps the unsaved
   edits on screen until the user reloads.
8. **Captions** (`captions.ts`) — one click transcribes the project's audible
   media via Gemini into short caption-sized chunks and inserts a new track of
   text clips, undoable as a single action.
9. **AI Jump-Cut Assistant** (`jump-cuts.ts`) — analyzes the selected audible
   clip with OpenAI word timestamps plus ffmpeg silence detection, then either
   shows reviewable dead-air cuts or applies them automatically through the
   normal editor undo path.
10. **AI Script Writer** (`script-writer.ts`) — for a project created from a
   template, the user enters a topic and Gemini writes a beat-matched script
   mirroring the source reel's segment roles/timings; insertable as captions.
11. **Export** (`video-render.ts`, `routes/api/v1/projects/$projectId/render.ts`)
   — see below.

## Export / Render

The editor's **Export** button opens a modal to pick a quality preset (High
1080p / Medium 720p / Low 480p — scales both resolution and x264 CRF) and a
file name. "Export File" kicks off a server-side ffmpeg render that mirrors the
preview (object-contain scale, centered text overlays, track-0-on-top stacking,
gated audio mixing), using the same fire-and-forget + poll pattern as ingest.
The modal shows live status and **auto-downloads** the MP4 when ready; closing
the modal leaves the render running with a toolbar "Exporting…" indicator. One
active render per project — render state lives as columns on `video_projects`
(`render_status`, `render_storage_path`, etc.), not a separate table.

Finished exports are streamed back through the app route (not the public R2
URL) so a re-export at the same key can't serve stale bytes from the CDN, and
the download filename comes from the editor via `?filename=`.

**Loudness.** Every export is levelled to -14 LUFS unless "Normalize loudness"
is turned off (workspace setting, also in Settings → General; the export modal's
toggle saves it). After the render, two quick ffmpeg passes over the output
measure the mix and apply the correction as a single fixed gain — video is
stream-copied, so only the AAC track is re-encoded. Targets and the measurement
parsing live in `lib/audio-loudness.ts`, which documents why it is two passes
and why the loudness-range target is wide (a narrow one makes ffmpeg compress
the ducking away).

## Automation Canvas

A node-based workflow builder (`/admin/automations`) that chains pipeline
steps into runnable automations: trigger nodes (Manual, Schedule, Creator
Posts) feed pipeline nodes (Find New Videos → Download & Analyze → Create
Template → Create Project). The canvas shell is ported from the trading app's
automation editor (hand-rolled SVG canvas, registry-driven nodes/ports/rules —
`src/lib/automations/`, `src/components/automations/`); the graph document
lives as jsonb on `automations` and is snapshotted onto every run.

Runs are durable, modeled on the render queue: `automation_runs` is the queue
unit (FIFO claim via `FOR UPDATE SKIP LOCKED`, lease token + heartbeat,
orphan reclaim on tick, `attempts` capped at 2) and `automation_run_steps`
holds per-node status/output — a reclaimed run resumes after its completed
steps. Node executors (`src/server/automation-nodes.ts`) wrap the session-free
pipeline functions (`listRecentUploads`, `ingestViralVideoForUser`,
`createTemplateFromViralVideo`, `createProjectFromTemplate`); AI usage is
metered by those functions, so automations spend the same credits as manual
use. Data flows between steps as merged upstream outputs
(`videoUrls`/`videoIds`/`templateIds`/`projectIds`).

The scheduler mirrors creator-watch: opt-in via `AI_VIDEO_AUTOMATIONS_ENABLED=1`,
a 60s timer enqueues automations whose denormalized `next_run_at` elapsed
(recomputed on save/toggle from the Schedule trigger's interval). The worker
itself is always-on (registered in `security.ts`), so manual Run works without
the flag. The creator watcher fires Creator Posts triggers after ingesting new
reels (`enqueueCreatorPostedRuns`). Concurrency via
`AI_VIDEO_AUTOMATION_CONCURRENCY` (default 1).

## Playback Engine

The editor preview is tuned so playback stays smooth even on modest hardware in
dev mode. Four design choices, all in `playback-clock.ts`, `editor-preview.tsx`,
and `editor-timeline.tsx` (see `docs/performance.md` for the rules):

- **The sound source is the clock.** `PlaybackClock` normally advances by wall
  time, but during playback the preview registers a `timeSource` — the element
  carrying the heard audio (an unmuted audio track if present, since captions
  are transcribed from it; otherwise the topmost playing video). The clock
  follows that element's decoded position; it's never seeked to chase the clock
  (seeking mid-play is what stuttered the picture and desynced captions). The
  playhead, captions, and other media follow the clock, so caption text stays
  locked to the sound, and a buffering source just pauses the clock instead of
  letting it run ahead.
- **No React renders during playback.** The preview renders its elements once
  and a single clock-subscribed loop drives all per-frame work imperatively
  (media play/seek/mute + visibility). The playhead line, ruler flag, and time
  readout likewise update via direct DOM writes, not per-tick re-renders.
- **Windowed video elements.** Only video clips near the playhead (active +
  ~2.5s lookahead) keep a live `<video>`, so a timeline of many clips — or a
  template whose slots are all the same file — mounts a few decoders, not one
  per clip.
- **Immutable media caching.** The media proxy route serves `Cache-Control:
  private, max-age=…, immutable` (a media id's bytes never change), so filmstrip
  extraction and the media panel don't re-download from R2 on every load.

## Server Function Layering

Every feature follows the same three layers:

- `src/server/*.ts` — the real implementation. Mutations call `requireUser()` +
  `requireAppOrigin()`; all queries are scoped to the current `userId`.
- `src/lib/api/*.ts` — `createServerFn` wrappers with zod input validators, a
  dynamic `import("@/server/...")` of the implementation, and a safe-error set
  controlling which messages reach the client.
- Components/pages call only the `lib/api` wrappers.

## Shell Architecture (inherited)

The app frame, sidebar/header layout, navigation patterns, theme/font presets,
and shared UI primitives are owned by the config-driven shell, not by product
code. The shell stays separate from business logic so the reel pipeline can
evolve without touching layout.

Workspace settings also carry the Brand Kit. Brand Kit data is stored in the
current workspace JSON, not the global settings row, and includes named color
swatches, bundled text font ids, caption defaults, an optional logo media id,
watermark options, CTA phrases, and the export filename pattern. New editor
text/caption flows read these defaults; existing timelines are not rewritten.
Exports apply the saved watermark when enabled and use CTA phrases only for
AI-written marketing copy.

### Navigation Model

- The sticky header top-left area is local navigation for the current context.
- Clicking a sidebar parent opens that section's landing page; when active, the
  header top-left shows section-local nav as `[parent] [child] [child]`.
- A plain sidebar destination without children is just a page — it does not get
  fake sticky-header child nav.

## Conventions

- Routes regenerate (`routeTree.gen.ts`) on `vite build` — **build before
  typecheck** when adding routes.
- Repo-wide lint has pre-existing errors; lint new files individually.
- Browser validation uses a minted session row + `playwright-cli -s=aivideo`.
- Prod deploy debt: prod needs migrations 0006–0013 applied, plus yt-dlp
  (curl_cffi), ffmpeg/ffprobe, @resvg/resvg-js, the Gemini key, and
  `AI_VIDEO_WATCH_ENABLED=1` to enable the creator-watch scheduler.
