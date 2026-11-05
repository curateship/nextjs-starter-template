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
