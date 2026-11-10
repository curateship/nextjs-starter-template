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

## 5 Nov 2026: Mass select in the header

Made in `apps/shell` and copied here unchanged, so neither forks: `src/components/shared/mass-select.tsx` gained `MassSelectButton`, and Contacts (`src/components/broadcasts/contacts-list-panel.tsx`) uses it, left of the search (Tyler, 5 Nov 2026: "Move the mass select button to here"). The other 12 apps get it at their next shell merge. Project's own task list uses the same button.

## Shell merge, 9 November 2026

Every shell change up to 860d43fa8 (9 Nov) is in Project, from the 7 Nov merge e69b7243e: 155 files replaced, 124 added and 62 deleted. Every replaced file was an unedited copy of the shell's file at e69b7243e, so none needed a three-way merge. Tyler asked for it on 9 Nov 2026 as the first half of "update the app's all 3 panel dashboard to match the improved shell's ui" (task `workspace/tasks/Shell look/three-panel-shell-look.md`).

**What arrived.**

- **The shell's Admin dashboard** at `/admin/dashboard`: Overview of widgets, Users, Feedback and the Media library as sections of one three-panel screen. The old `/admin/users`, `/feedback`, `/media`, `/notifications` and `/referrals` addresses go there.
- **The shell's CRM** at `/admin/crm`, a dashboard of sections (Overview, Inbox, People, Broadcasts). `/admin/contacts` goes to its People.
- **Changelog and Referrals are gone**, with the admin Notifications page. Project's Inbox card no longer has a changelog notice to show.
- **The pieces Project's own dashboards now use:** the block card, its rows with the sliding bar, the page cover and its tiles, the right panel's cover, the reopen and collapse buttons, and the middle's 24px gutter. How Project uses them is in [My dashboard](my-dashboard.md), [Notes and blocks](notes-and-blocks.md), [Projects and tasks](projects-and-tasks.md) and [Teams and invites](teams-and-invites.md).
- **No loading circles** in a panel's body: the shell's `LoadingRow` shows its words only, and Project's own `BlockLoading` follows it.
- **A lighter grey** on the picked link in the left menu and top bar.

**Migrations.** The shell's 0098 to 0110 are Project's 0160 to 0172, the same files renumbered, as Trade did. Applied to the local database only. **Warning for the next deploy:** 0168 (the shell's 0106) drops the referrals and changelog tables on the live database.

**One shell change made here.** `src/components/shared/three-panels.tsx` exports `SideTogglesProvider`, so Project's own frame (`src/components/project/three-panels.tsx`, which keeps `narrowStart`, the extra phone tab and the remembered task) can use the shell's `PanelReopenButton` and `SidePanelCollapseButton` unchanged. Made in `apps/shell` and copied here, so the two files match. The other 12 apps get it at their next merge.

**Kept as Project's own.** `src/app/` and `routeTree.gen.ts`, which the dev server rebuilt with the new and removed routes.

## Shell merge, 10 November 2026

Every shell change up to 33c87ec4b (10 Nov) is in Project, from the 9 Nov merge 860d43fa8: 170 files replaced, 56 added and 14 deleted. Every replaced file was an unedited copy of the shell's file at 860d43fa8, except `src/components/shared/three-panels.tsx`, whose one extra line (the `SideTogglesProvider` export) the shell now has too. Tyler asked for it on 10 Nov 2026: "merge shell to project".

**What arrived.**

- **Accounts, subscribers and leads are three separate lists.** Signing up no longer puts someone on the mailing list, and Leads is its own CRM section. Conversations lost open, closed and snooze.
- **Automations is one three-panel dashboard** at `/admin/automations`, with Automations and Waiting on you on its left page. The old `/admin/automations/<id>` and template addresses are gone, and the templates sit in the editor's Templates tab.
- **Pages, Styling and Navigations are sections of the Admin dashboard**, out of Settings.
- **Settings → Styling** gained Blocks (body shade, border, edge to edge), widget styling, Side panels widths with a Reset panels button, and "Modal and popover".
- **The header's Settings cog can hold links**, and every link editor in Navigations opens as a popover.
- **A widget's ⋮** holds the widget's own options, then Manage widgets.

**Two Project files changed to follow the shell.** The Inbox card's automation notice opens the run in the Automations dashboard, as the bell does: an approval in Waiting on you, a failure on its flow's Runs tab (`src/components/project/inbox-card.tsx`). `src/lib/layout/scaffold-styling.ts` keeps its values and takes the shell's renamed `ScaffoldStyling` type.

**Migrations.** The shell's 0111 to 0114 are Project's 0175 to 0178, the same files renumbered. Applied to the local database only. **Warning for the next deploy:** 0175 (the shell's 0111) deletes every mailing-list contact marked "Account" on the live database, and 0168 from the last merge drops the referrals and changelog tables.

**Kept as Project's own.** `src/app/`, `workspace/`, and `routeTree.gen.ts`, rebuilt without the two removed automation routes.
