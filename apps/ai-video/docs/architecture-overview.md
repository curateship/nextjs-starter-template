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
- **R2 / S3** object storage for media, thumbnails, and rendered exports.

## The Pipeline

The product is one end-to-end flow. Each stage has its own route, server
module, and `lib/api` wrapper.

1. **Creator Watch** (`creators.ts`, `creator-watch.ts`) — track creators;
   optionally "watch" one to auto-ingest their new uploads on a schedule, and
   periodically re-sync engagement stats so the archive can sort by
   views-per-day velocity.
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
5. **Projects + Editor** (`video-projects.ts`, `src/pages/video-editor/`) — a
   project holds a timeline (`tracks` of `EditorClip`s: video|audio|image|text)
   plus its aspect ratio. The editor is the dnd-kit timeline + a 1080p
   design-space preview. Timeline edits autosave on a debounce.
6. **Captions** (`captions.ts`) — one click transcribes the project's audible
   media via Gemini into short caption-sized chunks and inserts a new track of
   text clips, undoable as a single action.
7. **AI Script Writer** (`script-writer.ts`) — for a project created from a
   template, the user enters a topic and Gemini writes a beat-matched script
   mirroring the source reel's segment roles/timings; insertable as captions.
8. **Export** (`video-render.ts`, `routes/api/v1/projects/$projectId/render.ts`)
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
