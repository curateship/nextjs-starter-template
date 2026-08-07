---
name: Video port — the four-panel studio editor
status: todo
---

**What this is.** The heart of the app: the studio video editor with its four-panel layout — tool rail and context panel on the left, preview stage in the middle, inspector on the right, timeline along the bottom — with drag-resize between them, plus projects that autosave. Sits on task 01.

**The use case.** Open a project, drag media onto tracks, trim, split and reorder clips, add styled text, play it back smoothly, and never lose work — including a plain warning if the same project was changed somewhere else.

**Why it's a good idea.** This screen is why the app exists; every later task (rendering, AI tools, templates, assets) plugs into it. Porting it early on real media proves the foundation before anything fancier arrives.

**This is a port of the current studio only.** ai-video carries two generations of editor UI; only the `studio/` generation and the flat-file core it still imports come over. The AI panel and its dialogs (task 04), the Slots and Transcript panels (tasks 06 and 04), and everything automation-related stay behind. Behaviour reference: `apps/ai-video/src/pages/video-editor/studio/{studio-editor,studio-panels,studio-stage,studio-inspector,studio-timeline}.tsx` and the flat core `editor-store.ts`, `editor-provider.tsx`, `editor-preview.tsx`, `playback-clock.ts`, `timeline-snapping.ts`, `timeline-virtualization.ts`, `use-audio-preview.ts`, `replace-media-dialog.tsx`, plus `src/lib/{clip-transitions,timeline-schema,text-fonts}.ts`. Shape reference: shell dialogs/toasts (`ConfirmDialog`, sonner), `workspace/docs/ui-rules.md`.

## Tasks:

- **Tables.** In `src/server/video/schema.ts` + the next free migration `00NN_video_projects.sql`: `video_projects` (name, aspect `16:9|9:16|1:1|4:3`, timeline JSON, `version` for conflict detection, thumbnail media id, timestamps) and a single-row `video_settings` table for the brand kit (colors, fonts, watermark media id + position, CTA phrases) — app settings live here, never in the shell's settings tables. Acceptance: commented migration; timeline stored as validated structured JSON (`timeline-schema`), never trusted raw. Verification: `npm run db:setup` + PGlite replay under `npm run test`.
- **The studio shell, ported as app files.** New folder `src/pages/video-editor/` holding the four-panel layout with the hand-rolled pointer-drag resize (context panel 210–440, inspector 240–460, timeline 150–560 with auto-fit to track count), top bar, status bar, and the keyboard shortcuts (Space play/pause, Delete removes the selected clip, Escape deselects). Acceptance: all three drag handles work and committed sizes survive within the session; no shell file touched. Verification: real browser on this app's port — drag each handle, read the console.
- **Timeline and store.** Port the reducer store with its full action set (move/trim/split/duplicate/replace clip, tracks add/delete/reorder/mute/duck flag, undo/redo, zoom 18–90 px/s, cut mode), snapping (8px threshold, Alt bypasses, visible guide line), windowed rendering so hundreds of clips stay smooth, transitions (crossfade/dip/slide, 100–2000ms, seam badges + inspector section), filmstrips from task 01's routes, waveform fill on audio. Acceptance: the ported pure-logic tests (snapping, virtualization, transitions, playback clock, timeline schema) run green under vitest beside the modules. Verification: `npm run test`.
- **Playback and stage.** The imperative playback engine: audible element as the time source, no React renders during playback, windowed video mounting, precise/fast seek, rate control (0.5–2×), the 1080p design-space preview renderer, aspect switching. Acceptance: scrubbing and playback stay smooth on a project with 30+ clips. Verification: seeded sample project in the browser.
- **Media and Text panels + inspector.** Media panel (filter by type, collections filter from task 01, upload, drag-to-timeline, replace media), Text panel (presets, sticker emoji, bundled fonts copied to `public/fonts/`), Brand panel reading `video_settings`, inspector (project props, text styling with brand swatches, media props, timing, transitions). Acceptance: fonts render identically in panel and stage. Verification: browser.
- **Projects, autosave and conflict.** Routes `/admin/video-editor` (list: create, duplicate, delete with confirm) and `/admin/video-editor/$projectId` (the studio); debounced autosave doing a compare-and-swap on `version` with the conflict banner when it loses; save status in the top bar; server functions in `src/lib/api/video/projects.ts`, each guarded. A sample project is seeded so the screen can be looked at on first open; the sidebar entry is added through the running app's Settings, not code. Acceptance: two tabs editing the same project — the slower save shows the conflict banner and never silently overwrites. Verification: exactly that, in a real browser; `guards.test.ts` green.

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
