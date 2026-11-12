# Travel and the shell

Travel is a copy of `apps/shell`. Shell changes reach it by a merge from the shell's workspace, one way, as `docs/shell/shell-and-apps.md` explains. Each merge is recorded here.

## Shell merge, 5 November 2026

Every shell change up to 5 Nov is in Travel: 83 files replaced and 22 added, with nothing deleted. Each replaced file was first matched against every version of that file in the shell's history, and each was an unedited older shell copy.

**What arrived.**

- **Big uploads pick up where they stopped.** An upload carries on after a closed tab and can be paused. A line at the edge of the screen shows it on every page. The Media library shows storage used and its monthly cost. One video is still capped at 5GB unless the app sets `media.videoMaxBytes`, as `docs/shell/big-uploads.md` explains.
- **The Views button keeps the picked view picked.** It remembers the view last opened on each screen in this browser. It opens that view again on arrival, and has a "No view" row to leave it.
- **The 3 Nov shell clean-up.** The Settings cards share one auto-save hook, one secret key box and one dropdown row. The email and automation editors share one frame. Menu upgrade steps 1 to 12 are gone from `src/lib/workspaces.ts`. On 3 Nov every live site counted (Trade, Fitness, Video, Project, Date, Note, Flowfly, Course and course-de) was on step 12 or later.
- **The Overview's widget tabs follow Settings → Styling → Dashboard tabs.**
- **`homeScreen.shareTarget`**, which can put the app in an Android phone's share menu. It does nothing until the app sets it.

**No migration was new.** The shell has added none since 0097, and Travel already had every one.

**Kept as Travel's own.** `src/app/` stays Travel's own.

## Shell merge, 11 November 2026

Every shell change since the 7 Nov merge (`e69b7243e`) is in Travel, up to the shell at `5131991aa`: 244 files replaced, 179 added and 75 deleted. Each was an unedited older shell copy.

**What arrived.**

- **The CRM is one three-panel dashboard**, with accounts, subscribers and leads as three separate lists and Leads as its own section, lead tags, unanswered and forwarded mail, and files on messages.
- **Automations is one three-panel dashboard**: Automations and Waiting on you, with each flow's runs on its own tab and templates in the editor's palette. The old `/admin/automations/<id>` and template addresses are gone.
- **Pages, Styling and Navigations sit inside the Admin dashboard.** Navigations' link editors open as popovers, and the header's Settings cog can hold links.
- **Settings → Styling gained Blocks, widgets, Side panels and Panel cards**, with every Blocks setting on panel cards, edge to edge, Reset panels, and each widget's ⋮ holding its own options.
- **Referrals and the changelog are gone**, along with their tables.

**Migrations.** Shell 0098 to 0114 are this app's 0109 to 0125. 0117 drops the referral and changelog tables, and 0122 deletes the mailing-list contacts marked Account. They run on the local database the next time the dev server starts, and on live at the next deploy.

**One Travel file follows the shell.** `src/lib/layout/scaffold-styling.ts` keeps its values and takes the shell's renamed `ScaffoldStyling` type.

**Kept as Travel's own.** `src/app/`, `scripts/setup-database.mjs` and the route list's own routes; the route list was rebuilt with the router generator. The shell's migrations follow Travel's own 0108, so they are numbered from 0109.

**Checked.** Typecheck is clean, and 2,669 of 2,685 tests pass. These failed before the merge too: delivery and public-branding, which fail in the shell as well, and the styling test expecting no Sidebar shade, which Travel's own saved styling sets to 100. features-4 (10 tests) and unsubscribe timed out in the full run and pass when run alone. Not checked in a browser.

## Shell merge, 12 November 2026

Every shell change since `5131991aa` is in Travel, up to the shell at `9757749ff`: 85 files replaced. Each was an unedited copy of the shell at `5131991aa`.

**What arrived.**

- **Nothing pops up when something works** on the shell's screens: Admin, the CRM, Automations, Settings and the rest. Success toasts and Undo bars are gone. Failures still raise the red error toast. Tyler, 11 Nov 2026: "remove success toast across all these active apps".
- **No space under side panel headers**, and **Panel cards → Opacity**, which lets the panel's cover photo show through the first card in each side panel.
- **The Automations dashboard block has a ⋮** to hide or drag Automations and Waiting on you, saved with the site's styling.
- **Dashboards block rows are 34px tall instead of 36px.**

**No migration was new**, no file was added or deleted, and no route changed.

**Checked.** Typecheck is clean, and 2,679 of 2,684 tests pass, with 2 skipped. The 3 failures were there before the merge: delivery and public-branding, which fail in the shell too, and the styling test expecting no Sidebar shade, which Travel's own saved styling sets to 100. Not checked in a browser: no dev server on this app's port runs from workspace-4.
