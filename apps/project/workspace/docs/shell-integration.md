# Project and the shell

Project is a copy of `apps/shell`. Shell changes reach it by a merge from the shell's workspace, one way, as `docs/shell/shell-and-apps.md` explains. Each merge is recorded here.

## Shell merge, 30 October 2026

Every shell change up to 30 Oct is in Project: 9 files replaced, 1 added and 2 deleted. Each replaced file was first matched against every version of that file in the shell's history, and each was an unedited older shell copy.

**What arrived.**

- **Every table line is drawn from one rule**, and a panel header's bottom line
  becomes the table's top line when a table sits right under it.
- **Settings → Styling → Left menu shade**, a slider that sets the left menu
  and top bar between the page colour and a card's colour.
- **The panel view is gone.** Personal no longer frames apps that way, so the
  shell deleted `src/lib/layout/panel-view.ts` and its test, and the shell
  layout always draws the left menu and top bar.
- **A three-column dashboard's `place` can say `ready`**, for a screen that
  loads its own list. Nothing changes for a dashboard that does not pass it.

**No migration was new.** Project already had every shell migration.

**Kept as Project's own.** `scripts/setup-database.mjs` stays Project's own, because the shell's copy names the shell's own database; `src/app/` stays Project's own.

## Shell merge, 5 November 2026

Every shell change up to 5 Nov is in Project: 83 files replaced and 25 added, with nothing deleted. Each replaced file was first matched against every version of that file in the shell's history, and each was an unedited older shell copy.

**What arrived.**

- **Big uploads pick up where they stopped.** An upload carries on after a closed tab and can be paused. A line at the edge of the screen shows it on every page. The Media library shows storage used and its monthly cost. One video is still capped at 5GB unless the app sets `media.videoMaxBytes`, as `docs/shell/big-uploads.md` explains.
- **The 3 Nov shell clean-up.** The Settings cards share one auto-save hook, one secret key box and one dropdown row. The email and automation editors share one frame. Menu upgrade steps 1 to 12 are gone from `src/lib/workspaces.ts`. On 3 Nov every live site counted (Trade, Fitness, Video, Project, Date, Note, Flowfly, Course and course-de) was on step 12 or later.
- **One folding menu for every ⋮ and "+ Add" dropdown**, `src/components/shared/folding-menu.tsx`. See `docs/shell/folding-menu.md`.
- **Pages that open with no signal**, through `useOfflinePages` and `public/offline-worker.js`. Nothing switches it on until the app calls the hook, as `docs/shell/offline-pages.md` explains.
- **The Overview's widget tabs follow Settings → Styling → Dashboard tabs.**
- **`homeScreen.shareTarget`**, which can put the app in an Android phone's share menu. It does nothing until the app sets it.
- **The dev server leaves `playwright-core` out of its start-up scan**, in `vite.config.ts`. That package's Mac add-on stopped the dev server starting.
- **The document editor takes an app's own `clean` rule**, so an app can add kinds of content to a document. Leaving it out keeps today's rules. See `docs/shell/document-editor.md`.

**No migration was new.** The shell has added none since 0097, and Project already had every one.

**Kept as Project's own.** `src/app/` stays Project's own, and so does `src/app/open-endpoints.ts`, which lists Project's own open endpoints.
