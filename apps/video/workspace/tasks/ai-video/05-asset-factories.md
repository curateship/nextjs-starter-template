---
name: Video port — actors, first frames and AI video generations
status: todo
---

**What this is.** The three AI asset factories: actors (consistent AI-generated characters you can re-pose), first frames (AI-generated opening images, often featuring an actor), and full AI video generations (Veo — short generated clips). Each has a dashboard and a one-click path into a project. Sits on tasks 01, 02 and 04.

**The use case.** Build a recurring on-screen character once, generate on-brand opening images from it, generate a short AI clip when there's no footage — and drop any of them straight onto the timeline.

**Why it's a good idea.** These are the features that make content without a camera. They come after the credits meter (04) on purpose: image generation and Veo are the most expensive calls in the app, so they must be born metered.

**Reference code.** Behaviour: `apps/ai-video/src/server/{actors,actor-actions,first-frames,ai-video-generations}.ts`, `apps/ai-video/src/lib/{actor-models,first-frame-models}.ts`, dashboards `actor-dashboard.tsx`, `first-frame-dashboard.tsx` + `first-frame-create-dialog.tsx`, `ai-generations-dashboard.tsx`, and the image route `routes/api/v1/actors/$actorId/image.ts`. Shape: shell dashboard components, `lib/list-search.ts`, the modal form pattern. All model calls go through the shell's AI key plumbing; every generation charges the meter from task 04 (images 10, AI video 50).

## Tasks:

- **Tables.** `video_actors`, `video_first_frames`, `video_ai_generations` in `src/server/video/schema.ts` + the next free `00NN_video_asset_factories.sql`, each row pointing at shell media for its stored images/clips. Acceptance: commented migration; deleting an asset never orphans its media rows silently — the delete confirm says what goes with it. Verification: `npm run db:setup` + PGlite replay under `npm run test`.
- **Actors.** Dashboard (`/admin/video-actors`): create from a text description or reference photo, edit/re-pose via image editing, image served through a session-checked binary route `src/routes/api/v1/video/actors/$actorId/image.ts`. Acceptance: a failed generation shows the provider's message plainly and charges nothing. Verification: create one actor for real, read the console.
- **First frames.** Dashboard + create dialog (`/admin/video-first-frames`): pick a model, optionally an actor, generate variants, keep the good ones, insert into a project as the opening image. Acceptance: inserting lands the image at the start of the timeline as a normal editable clip. Verification: browser, end to end into a project.
- **AI video generations.** Dashboard (`/admin/video-generations`): Veo clips at 4/6/8 seconds in 9:16 and 16:9, status polled from the dashboard, retry on failure, insert-into-project on success. Generation runs as a fire-and-forget server job that survives a page reload. Acceptance: a reload mid-generation loses nothing; retry never double-charges for the failed attempt. Verification: generate one clip for real, reload halfway through.
- **Server functions.** Everything in `src/lib/api/video/{actors,first-frames,generations}.ts`, each guarded, zod-validated, with honest error maps. Acceptance: `guards.test.ts` green with zero unguarded functions. Verification: `npm run test` and `npx tsc --noEmit -p tsconfig.app.json` against the pre-existing error list.

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
