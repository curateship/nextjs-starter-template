---
name: Video port — the four-panel studio editor
status: done
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

[x] Brief in plain english
[x] Edge cases handled
[x] Error paths handled
[x] Update documents (if applicable)
[x] Add brief and what you changed below.

## Brief

Done 7 Aug 2026. The editor is at `/admin/video-editor`, with a sidebar link
added through the app's own navigation settings (not in code).

**What is on screen.** A list of projects, and the editor itself: a rail of
three panels on the left (Media, Text, Brand), the picture in the middle, the
inspector on the right and the timeline along the bottom.

It is the app's own resizable workspace — the same panels, drag handles, gaps
and collapse behaviour as the automation editor, through the shared
`ResizablePanelGroup`, `WorkspacePanel` and `WorkspacePanelHeader`. Double-click
a panel's empty space to shut it, drag the timeline all the way down to leave
just its toolbar, and every size comes back the way you left it. The shape of
the video sits dead centre at the top of the picture panel; saving says so in
the app's own sticky header, alongside every other auto-save.

**What it can do.** Drag a file from the media panel onto a lane, or click it to
drop it at the playhead. Move, trim, split, duplicate and delete clips. Add
lanes, mute them, reorder them by their grip. Undo and redo. Zoom, or fit the
whole project across the window. Add a title or a sticker, then drag it around
the frame — it locks to the centre lines, and Alt ignores them. Set a blend
between two touching clips (crossfade, dip to black, slide) and the seam gets a
badge. Swap the footage in a clip without moving it. Mark a lane to duck, and
its sound drops while any other lane is playing — audibly, while editing, not
only in the finished film. Play, step a frame, change speed. Space plays,
Delete removes the selected clip, Escape lets go.

**How it is put together.**

- `src/lib/video/*` — the parts with no screen of their own: the timeline
  schema, snapping, windowing, the playback clock, transitions, fonts,
  filmstrip loading. All ported with their tests (91 of them, rewritten from
  node:test to vitest and living beside the code they check).
- `src/components/video-editor/*` — the editor. The store and its reducer, the
  auto-save provider, the preview renderer, and the five screens. The chrome is
  all the app's own: workspace panels and headers, the shared inspector cards,
  sliders, colour rows and switches the newsletter editor uses, shared buttons,
  inputs and dialogs. Only the timeline's clips and the viewer behind the
  picture have a look of their own, in `studio.css`.
- `src/server/video/{projects,settings,media-urls}.ts` + endpoints in
  `src/lib/api/video/{projects,settings}.ts`. Every one guarded, every query
  scoped to the person who is signed in.
- Migration `0045_video_projects.sql`: `video_projects` and a single-row
  `video_settings`.

**Decisions worth knowing.**

- **A clip is exactly what the schema allows.** `EditorClip` is read off the
  timeline schema rather than written out again, so what the editor holds and
  what the database accepts cannot drift.
- **The aspect column is a copy, written by the same statement as the
  timeline.** It exists so the list can be drawn without reading every
  timeline, and it is never accepted from the browser on its own.
- **A clip's address is worked out fresh on every open** from its media id —
  the smooth copy when one exists, the original otherwise — so a file that has
  since been processed starts playing without anybody re-adding it.
- **The proxy is served straight from the storage bucket, and its private app
  route is gone.** A `<video>` element asking an app route for byte ranges is
  refused outright by the dev server (the shell's own media route behaves the
  same way), so a copy served that way would never play while developing. The
  originals were already public addresses; a copy of the same footage is no
  more exposed, and each rebuild writes a new name so nothing can serve a stale
  one.
- **The brand kit is one saved document, not columns**, read through a
  normalizer — the way the shell keeps its own styling. A later feature adds a
  field without a migration. Its logo is stored as a media address because that
  is what the shared image picker hands back everywhere else in this app.
- **The duck switch really ducks.** It would otherwise have been a switch that
  does nothing until the renderer arrives, so the volume maths came across with
  it (`src/lib/video/audio-ducking.ts`, with its tests) and the preview drops a
  ducked lane by 12 dB whenever another lane is making a sound. The renderer in
  task 03 reads the same curve, so what you hear while editing is what gets
  made.
- **The panels scroll and space like every other panel here.** The shared
  `ScrollArea` does the scrolling, and a card of one-line facts (Project,
  Timing) sits at the tight list spacing rather than the airy field spacing.
- **One face, the app's own.** The old app bundled five typefaces; none of them
  came over. Text clips are set in the same Inter every other screen uses, so
  there is nothing extra to ship and a video looks like this app made it. The
  brand kit is colours and a logo — a font choice with one font in it is not a
  choice. Clicking a brand colour paints the words you have selected.
- **Left out on purpose:** the export button (task 03), captions and their
  word-by-word timing (04), template slots (06), and the Audio panel — the
  shell's library only accepts pictures and video, so there is nothing to put
  in it until the voiceover work opens it up. The timeline itself already draws
  and plays audio clips.

**Two real bugs found and fixed on the way.**

- Reading a plain value out of `src/server/*` from an endpoint file drags that
  whole module — and the password hashing it imports — into the browser, and
  the page dies before it can even sign in. The few facts both sides need now
  live in `src/lib/video/projects.ts`.
- Opening a project used to save it. Auto-save skipped its first run by
  counting renders, and React runs an effect twice in development, so simply
  looking at a project rewrote it — which is how a sample project quietly grew
  empty lanes. It now compares what is on screen with what is stored, so
  nothing is sent unless something actually changed, and an edit undone back to
  where it started sends nothing either.

**Audited before finishing** (`.agents/skills/audit-change`). Fixed on the
spot: every icon-only button on the timeline and the transport now has a name a
screen reader reads, the Delete button is properly disabled instead of merely
faded, a leftover reference to a deleted typeface was removed, two swatches
with the same name and colour no longer share a React key, and the dead
spinner/grip rules and unused exports went. Left as they are, with reasons: a
clip's saved address is only ever the owner's own to see, projects are never
shared, and the shared inspector cards remember their open/shut state under the
newsletter's namespace (no title collides today).

**Verified**: 1055 tests green (136 new), typecheck clean, eslint clean, and a
real browser on this app's port — sample project made and opened, a video
dragged onto a lane and trimmed and split, the picture loaded and played, the
filmstrip drawn along the clip, all three drag handles resized, the brand kit
saved, footage replaced, dark theme and a narrow window checked, all three
shared drag handles resized, and two tabs on the same project: the slower one
is refused and says so rather than overwriting. Opening a project and touching
nothing sends no save at all. No console errors and no failed requests on the
final pass.
