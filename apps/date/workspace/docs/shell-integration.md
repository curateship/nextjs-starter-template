# Date and the shell

Date is a copy of `apps/shell`. Shell changes reach it by a merge from the shell's workspace, one way, as `docs/shell/shell-and-apps.md` explains. Each merge is recorded here.

## Shell merge, 30 October 2026

Every shell change up to 30 Oct is in Date: 10 files replaced, 1 added and 2 deleted. Each replaced file was first matched against every version of that file in the shell's history, and each was an unedited older shell copy.

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

**No migration was new.** Date already had every shell migration.

**Kept as Date's own.** `src/app/` stays Date's own.
