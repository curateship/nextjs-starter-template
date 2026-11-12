# Fitness and the shell

Fitness is a copy of `apps/shell`. Shell changes reach it by a merge from the shell's workspace, one way, as `docs/shell/shell-and-apps.md` explains. Each merge is recorded here.

## Shell merge, 30 October 2026

Every shell change up to 30 Oct is in Fitness: 35 files replaced, 24 added and 7 deleted. Each replaced file was first matched against every version of that file in the shell's history, and each was an unedited older shell copy.

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

**Migrations owed:** `0096_custom_shell_contact_notes.sql` (shell 0096), `0097_custom_shell_saved_views.sql` (shell 0097). None is applied, locally or live.

**Kept as Fitness's own.** `src/app/` stays Fitness's own.

## Shell merge, 5 November 2026

Every shell change up to 5 Nov is in Fitness: 85 files replaced and 25 added, with nothing deleted. Each replaced file was first matched against every version of that file in the shell's history, and each was an unedited older shell copy.

**What arrived.**

- **Big uploads pick up where they stopped.** An upload carries on after a closed tab and can be paused. A line at the edge of the screen shows it on every page. The Media library shows storage used and its monthly cost. One video is still capped at 5GB unless the app sets `media.videoMaxBytes`, as `docs/shell/big-uploads.md` explains.
- **The Views button keeps the picked view picked.** It remembers the view last opened on each screen in this browser. It opens that view again on arrival, and has a "No view" row to leave it.
- **The 3 Nov shell clean-up.** The Settings cards share one auto-save hook, one secret key box and one dropdown row. The email and automation editors share one frame. Menu upgrade steps 1 to 12 are gone from `src/lib/workspaces.ts`. On 3 Nov every live site counted (Trade, Fitness, Video, Project, Date, Note, Flowfly, Course and course-de) was on step 12 or later.
- **One folding menu for every ⋮ and "+ Add" dropdown**, `src/components/shared/folding-menu.tsx`. See `docs/shell/folding-menu.md`.
- **Pages that open with no signal**, through `useOfflinePages` and `public/offline-worker.js`. Nothing switches it on until the app calls the hook, as `docs/shell/offline-pages.md` explains.
- **The Overview's widget tabs follow Settings → Styling → Dashboard tabs.**
- **`homeScreen.shareTarget`**, which can put the app in an Android phone's share menu. It does nothing until the app sets it.
- **The dev server leaves `playwright-core` out of its start-up scan**, in `vite.config.ts`. That package's Mac add-on stopped the dev server starting.
- **The document editor takes an app's own `clean` rule**, so an app can add kinds of content to a document. Leaving it out keeps today's rules. See `docs/shell/document-editor.md`.

**No migration was new.** The shell has added none since 0097, and Fitness already had every one.

**Kept as Fitness's own.** `src/app/` stays Fitness's own, and so does `src/app/open-endpoints.ts`, which lists Fitness's own open endpoints.

## Shell merge, 12 November 2026

Every shell change since the 7 Nov shell at `e69b7243e` is in Fitness, up to the shell at `9757749ff`: 267 files replaced, 179 added and 75 deleted. Each replaced or deleted file was an unedited older shell copy, so nothing Fitness changed was lost.

**What arrived.**

- **The Admin dashboard is one three-panel screen.** Overview, Users, Plans, Feedback, Announcements, Analytics and the Media library are sections of its Dashboards block, and Pages, Styling and Navigations sit inside it too. Their old separate screens are gone.
- **The CRM is one three-panel dashboard**, with accounts, subscribers and leads as three separate lists, Leads as its own section, lead tags, and Newsletter, Contacts, System emails and Dev outbox inside it.
- **Automations is one three-panel dashboard**, Automations and Waiting on you, with each flow's runs on its own tab and templates in the editor's palette. The old `/admin/automations/<id>` and template addresses are gone.
- **Settings → Styling gained Blocks, widgets, Side panels and Panel cards**, with Reset panels, Opacity for the first card in a side panel, and a border shade of its own for the left menu and top bar under Sidebar & Top navigation.
- **The header's Settings cog can hold links**, and Navigations' link editors open as popovers.
- **Nothing pops up when something works.** Success toasts and Undo bars are gone from the shell's screens. Failures still raise the red error toast.
- **Referrals and the changelog are gone**, along with their tables.

**Migrations.** Shell 0098 to 0114 are this app's 0102 to 0118. 0110 drops the referral and changelog tables, and 0115 deletes the mailing-list contacts marked Account. They run on the local database the next time the dev server starts, and on live at the next deploy.

**One Fitness file follows the shell.** `src/lib/layout/scaffold-styling.ts` keeps its values and takes the shell's renamed `ScaffoldStyling` type.

**Kept as Fitness's own.** `src/app/`, `scripts/setup-database.mjs` and the route list's own routes; the route list was rebuilt with the router generator, and the shell's `@tiptap/extension-list` package was added. The shell's sample scripts `crm-samples.mjs`, `crm-samples.test.mjs` and `send-sample-inbound.mjs` were already in Fitness and stay.

**Checked.** Typecheck is clean in both the app and node configs. Tests were not run. Not checked in a browser: no dev server on this app's port runs from workspace-4.
