---
name: Video port — the carousel studio
status: in_progress
---

**What this is.** The Instagram-carousel builder: a second, smaller studio with its own slide list, canvas, inspector, zoom and undo, plus a dashboard of saved carousels and export to images. Sits on tasks 01 and 04.

**The use case.** Build a swipeable multi-slide post — text, images, video frames, soft shadows — in the same visual language as the video editor, and export the slides as images ready to post.

**Why it's a good idea.** Carousels reuse everything already proven: shell media (01), the brand kit and fonts (02), metered AI text help (04), and image rasterization from the export pipeline (03). Coming last, it's mostly assembly.

**Reference code.** Behaviour: `apps/ai-video/src/pages/carousel-builder/{carousel-builder-page,carousel-route-page,carousel-export}.ts(x)`, `apps/ai-video/src/lib/carousel-schema.ts`, `apps/ai-video/src/server/carousels.ts`, dashboard `carousels-dashboard.tsx`. Shape: the studio conventions established in task 02 (panel resize feel, autosave + version conflict, shell dialogs/toasts, `workspace/docs/ui-rules.md`).

## Tasks:

- **Table.** `video_carousels` in `src/server/video/schema.ts` + the next free `00NN_video_carousels.sql`: name, format `4:5|1:1|9:16`, slides as validated structured JSON (`carousel-schema` — item types text/image/video/gradient-shadow, 20-slide cap), `version` for conflict detection, timestamps. Acceptance: commented migration; slides validated on save, never trusted raw. Verification: `npm run db:setup` + PGlite replay under `npm run test`.
- **The builder.** Route `/admin/video-carousels/$carouselId`: slide list, canvas with zoom (0.1–4×), inspector with its own resizable panels, text presets and stickers, shadow presets, layer ordering, brand swatches and fonts from `video_settings`; debounced autosave with the same compare-and-swap conflict banner as the video editor; undo capped at 50. Acceptance: undo/redo cover every edit type; a stale save shows the conflict banner and never silently overwrites. Verification: real browser — two tabs on one carousel.
- **Dashboard.** `/admin/video-carousels`: list, create, duplicate, delete with confirm, format badge, slide count; sidebar entry added through Settings, not code. Acceptance: list state (search/sort/page) lives in the address and survives a reload. Verification: browser.
- **Export.** Render each slide to an image (resvg + bundled fonts, same text fidelity as the video renderer) and download them; any AI slide-text help charges the meter from task 04. Acceptance: exported slides match the canvas pixel-for-pixel at the chosen format. Verification: export a real carousel and open the files.
- **Server functions.** `src/lib/api/video/carousels.ts`, guarded and zod-validated, with an honest error map. Acceptance: `guards.test.ts` green with zero unguarded functions. Verification: `npm run test` and `npx tsc --noEmit -p tsconfig.app.json` against the pre-existing error list.
- **Close the port.** Write the final leftover list into the brief — everything from ai-video deliberately not carried over (automation canvas/engine/approval checkpoint, `creator_posted` trigger, ai-video's own auth/sessions/workspaces/feedback/notification plumbing, the pre-studio editor generation, YouTube Studio) — so nobody "helpfully" restores them later. Acceptance: the list is written and dated. Verification: read it.

## Rules

- Follow the UI rules at .agents/skills/Ui-standards/SKILL.md
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

Built on 8 August 2026:

- Added a saved carousel record owned by one user. It keeps the slide shape,
  caption, validated slide content and a version number that protects work
  when the same carousel is open in two tabs.
- Added a carousel dashboard using the existing dashboard table. Search,
  sorting and page number stay in the address. People can create, rename,
  copy and delete carousels.
- Added the studio using the video editor's panels, resize handles and visual
  language. It has a slide list, canvas, inspector, 0.1–4× zoom, text styles,
  stickers, media, shadows, layer order, preview and 50-step undo and redo.
- Added automatic saving and a clear conflict message. A stale tab stops
  saving instead of replacing newer work.
- Added ZIP export with one full-size PNG per slide and a caption text file.
  The server draws slides with resvg and the bundled Inter font. Slide images
  are read only from the signed-in person's media library.
- Added optional AI text polishing through the existing AI meter. It checks
  that the selected text belongs to the signed-in person's carousel before it
  spends from their allowance.
- Added owner checks, input checks and plain error messages to every new server
  action. The database migration can be replayed safely.

Corrected on 9 August 2026:

- Removed the hand-built carousel panel chrome and its separate grey theme.
  The studio now copies the video editor's real workspace pattern: remembered
  panel sizes, collapsible side panels, reopen tabs, shared panel headers,
  shared scroll areas and the same tool rail.
- Rebuilt the carousel inspector with the same collapsible inspector cards,
  inputs, text areas, sliders, tabs and buttons used by the video editor.
- Fixed the two-row shadow direction control so it grows with its shared tabs.
  Preview now hides an empty post caption instead of drawing a blank field.
- The audit made export wait for automatic saving, capped each slide at 50
  layers in the editor, and explains when the dashboard shows only the newest
  100 carousels.

Checks completed:

- Database setup and migration replay passed.
- All 74 test files passed, covering 1,235 checks.
- The type check and production build passed.
- Focused lint passed without errors or warnings.
- Playwright passed the real workflow: panel layout, empty and filled caption
  previews, ZIP contents, two-tab conflict handling, and a clean console and
  network log. Temporary carousels were removed afterward.

Still required before changing this task to `done`:

- Add the Carousel Studio sidebar link through Settings. No sidebar code was
  changed.

Deliberately left behind as of 8 August 2026:

- The old automation canvas, automation engine and approval checkpoint.
- The old `creator_posted` automation event.
- The old app's own sign-in, sessions, workspaces, feedback and notification
  plumbing.
- The editor generation flow that existed before the current studio.
- YouTube Studio.
