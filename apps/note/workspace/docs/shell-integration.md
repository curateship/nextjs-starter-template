# Note and the shell

Note is a copy of `apps/shell`. Shell changes reach it by a merge from the shell's workspace, one way, as `docs/shell/shell-and-apps.md` explains. Each merge is recorded here.

## Shell merge, 30 October 2026

Every shell change up to 30 Oct is in Note: 27 files replaced, 11 added and 2 deleted. Each replaced file was first matched against every version of that file in the shell's history, and each was an unedited older shell copy.

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

**Note's own files changed.** The library dashboard now uses the shell's
`place` instead of its own copy of the same logic, as
[the library dashboard](library-dashboard.md) says, so each browser's
remembered place starts over once. Its panel cards drop `quiet`, because
the shell made hover-only buttons every card's rule on 20 Oct.

**Migrations owed:** `0096_custom_shell_contact_notes.sql` (shell 0096), `0097_custom_shell_saved_views.sql` (shell 0097). None is applied, locally or live.

**Kept as Note's own.** `src/app/` stays Note's own.
