# Viral and the shell

Viral is a copy of `apps/shell`. Shell changes reach it by a merge from the shell's workspace, one way, as `docs/shell/shell-and-apps.md` explains. Each merge is recorded here.

## Shell merge, 5 November 2026

Every shell change up to 5 Nov is in Viral: 7 files replaced and 0 added, with nothing deleted. Each replaced file was first matched against every version of that file in the shell's history, and each was an unedited older shell copy.

**What arrived.**

- **The Overview's widget tabs follow Settings → Styling → Dashboard tabs.**
- **The dev server leaves `playwright-core` out of its start-up scan**, in `vite.config.ts`. That package's Mac add-on stopped the dev server starting.
- **The document editor takes an app's own `clean` rule**, so an app can add kinds of content to a document. Leaving it out keeps today's rules. See `docs/shell/document-editor.md`.

**No migration was new.** The shell has added none since 0097, and Viral already had every one.

**Kept as Viral's own.** `src/app/` stays Viral's own.

## Shell merge, 12 November 2026

Every shell change since the 7 Nov shell at `e69b7243e` is in Viral, up to the shell at `9757749ff`: 267 files replaced, 179 added and 75 deleted. Each replaced or deleted file was an unedited older shell copy, so nothing Viral changed was lost.

**What arrived.**

- **The Admin dashboard is one three-panel screen.** Overview, Users, Plans, Feedback, Announcements, Analytics and the Media library are sections of its Dashboards block, and Pages, Styling and Navigations sit inside it too. Their old separate screens are gone.
- **The CRM is one three-panel dashboard**, with accounts, subscribers and leads as three separate lists, Leads as its own section, lead tags, and Newsletter, Contacts, System emails and Dev outbox inside it.
- **Automations is one three-panel dashboard**, Automations and Waiting on you, with each flow's runs on its own tab and templates in the editor's palette. The old `/admin/automations/<id>` and template addresses are gone.
- **Settings → Styling gained Blocks, widgets, Side panels and Panel cards**, with Reset panels, Opacity for the first card in a side panel, and a border shade of its own for the left menu and top bar under Sidebar & Top navigation.
- **The header's Settings cog can hold links**, and Navigations' link editors open as popovers.
- **Nothing pops up when something works.** Success toasts and Undo bars are gone from the shell's screens. Failures still raise the red error toast.
- **Referrals and the changelog are gone**, along with their tables.

**Migrations.** Shell 0098 to 0114 are this app's 0110 to 0126. 0118 drops the referral and changelog tables, and 0123 deletes the mailing-list contacts marked Account. They run on the local database the next time the dev server starts, and on live at the next deploy. Viral's own 0107 to 0109 wait in workspace-28's commit `41bb8ad94`, which is not in develop yet, so the shell's migrations start at 0110 and the two never share a number.

**One Viral file follows the shell.** `src/lib/layout/scaffold-styling.ts` keeps its values and takes the shell's renamed `ScaffoldStyling` type.

**Kept as Viral's own.** `src/app/`, `scripts/setup-database.mjs` and the route list's own routes; the route list was rebuilt with the router generator, and the shell's `@tiptap/extension-list` package was added. The shell's sample scripts `crm-samples.mjs`, `crm-samples.test.mjs` and `send-sample-inbound.mjs` were already in Viral and stay.

**Checked.** Typecheck is clean in both the app and node configs. Tests were not run. Not checked in a browser: no dev server on this app's port runs from workspace-4.
