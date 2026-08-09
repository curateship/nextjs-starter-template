---
name: Video port — actors, first frames and AI video generations
status: done
---

**What this is.** The three AI asset factories: actors (consistent AI-generated characters you can re-pose), first frames (AI-generated opening images, often featuring an actor), and full AI video generations (Veo — short generated clips). Each has a dashboard and a one-click path into a project. Sits on tasks 01, 02 and 04.

**The use case.** Build a recurring on-screen character once, generate on-brand opening images from it, generate a short AI clip when there's no footage — and drop any of them straight onto the timeline.

**Why it's a good idea.** These are the features that make content without a camera. They come after the credits meter (04) on purpose: image generation and Veo are the most expensive calls in the app, so they must be born metered.

**Reference code.** Behaviour: `apps/ai-video/src/server/{actors,actor-actions,first-frames,ai-video-generations}.ts`, `apps/ai-video/src/lib/{actor-models,first-frame-models}.ts`, dashboards `actor-dashboard.tsx`, `first-frame-dashboard.tsx` + `first-frame-create-dialog.tsx`, `ai-generations-dashboard.tsx`, and the image route `routes/api/v1/actors/$actorId/image.ts`. Shape: shell dashboard components, `lib/list-search.ts`, the modal form pattern. All model calls go through the shell's AI key plumbing; every generation charges the meter from task 04 (images 10, AI video 50).

## Tasks:

- **Tables.** `video_actors`, `video_first_frames`, `video_ai_generations` in `src/server/video/schema.ts` + the next free `00NN_video_asset_factories.sql`, each row pointing at shell media for its stored images/clips. Acceptance: commented migration; deleting an asset never orphans its media rows silently — the delete confirm says what goes with it. Verification: `npm run db:setup` + PGlite replay under `npm run test`.
- **Actors.** Dashboard (`/admin/video-editor/actors`): create from a text description or reference photo, edit/re-pose via image editing, image served through a session-checked binary route `src/routes/api/v1/video/actors/$actorId/image.ts`. Acceptance: a failed generation shows the provider's message plainly and charges nothing. Verification: create one actor for real, read the console.
- **First frames.** Dashboard + create dialog (`/admin/video-editor/first-frames`): pick a model, optionally an actor, generate variants, keep the good ones, insert into a project as the opening image. Acceptance: inserting lands the image at the start of the timeline as a normal editable clip. Verification: browser, end to end into a project.
- **AI video generations.** Dashboard (`/admin/video-editor/generations`): Veo clips at 4/6/8 seconds in 9:16 and 16:9, status polled from the dashboard, retry on failure, insert-into-project on success. Generation runs as a fire-and-forget server job that survives a page reload. Acceptance: a reload mid-generation loses nothing; retry never double-charges for the failed attempt. Verification: generate one clip for real, reload halfway through.
- **Server functions.** Everything in `src/lib/api/video/{actors,first-frames,generations}.ts`, each guarded, zod-validated, with honest error maps. Acceptance: `guards.test.ts` green with zero unguarded functions. Verification: `npm run test` and `npx tsc --noEmit -p tsconfig.app.json` against the pre-existing error list.

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

Actors, first frames and AI videos now have their own dashboards nested under
Video editor in the sidebar. An actor can be made from words or a reference photo, edited,
and re-posed. A first frame can make up to four choices from that actor, keep
the useful ones, and add one to the start of any project as a normal picture.

AI videos use a saved background job. The page may be closed or reloaded while
Google works, then the finished clip can be added to a project. Failed jobs can
be retried, and only a finished video is charged. All generated pictures and
clips also live in Media; deleting a factory record says plainly that those
files remain.

The three new tables and migration are in place. Every new server call checks
the signed-in person, validates its input, and keeps one person's work separate
from another's. Cards use the normal public Media address, while the actor image
API remains private and ownership-checked. The shared AI meter now knows the
current image and Veo prices.

Navigation correction: Projects is the Video editor index dashboard. Actors,
First frames and AI videos are nested routes and saved sidebar children beneath
Video editor; existing children such as Exports stay in place after them.

Reference images use a compact preview. Pressing one opens the normal Media
picker instead of expanding the whole library inside the actor or frame form.

Actor generation now also offers GPT Image 2 through the saved OpenAI key.
Both new actors and reference-photo re-poses use OpenAI when that model is
selected; first-frame model choices remain unchanged.

Actor cards now use the same direct Media address as every other stored image
in the app. The private download route remains ownership-checked for API use,
and temporary missing or signed-out responses are never cached.

Audit pass: actor pictures inside First Frames now use that same working Media
address, and card grids keep a single portrait from stretching across the
dashboard. Bulk deletion checks for running videos before removing anything.

Durable video work now uses a database lease. If two app processes tick at the
same time, only one can poll, save, or charge a Google job; expired work can be
claimed safely after a crash. The lease migration and an overlapping-worker
regression test cover that behavior.

Proved: database setup, production build, app and shared-shell type checks,
guard tests, pricing tests, focused asset tests, changed-file lint and route
responses all pass. A signed-in Playwright pass confirmed the actor picture
loads from Media, stays inside its card at desktop and narrow widths, survives
a reload, and produces no browser console or unexpected network errors. Paid
Google and OpenAI generations remain the manual checks listed in the handoff.
