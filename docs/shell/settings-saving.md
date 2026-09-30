# How the Settings screen saves

There is no Save button. Every Settings screen writes the whole settings record
at once, and the header says where the save stands: **Saving…**, **Saved**, or
**Not saved** with the reason.

## The loop

- **One record, not a field.** Every handler on the page hands the shell a
  complete `ShellConfig`. There is no per-field endpoint, so two cards on the
  same screen are two writers of one record.
- **An edit schedules a save 700ms later**, and a new edit within that window
  replaces the timer, so typing a name saves once at the end rather than once
  per letter.
- **A window with a Done button does not wait for the timer.** It writes and
  then calls the save straight away, because the window has to know whether it
  may close. A refused save puts the list back as it was and the window stays
  open, so pressing Done again does not add a second copy of the link.
- **Saves run one after another**, on a queue, so two quick edits reach the
  database in the order they were made.

## Two rules that keep edits from eating each other

A save takes long enough to type in another box, and both of these were real
bugs before 30 Sep 2026: editing the public menu took the public footer back
with it, and an edit that said Saved was gone after a reload.

- **The answer is applied to the settings as they are now, never to the copy
  that was sent.** Only three things in the answer come from the server: the
  dark logo, the browser-tab icons and the stored font. Everything else in it
  is what the browser sent a moment ago. Putting that whole copy back on screen
  undid anything changed while the request was in the air, and the auto-save
  that edit had scheduled then wrote the older copy to the database.
  `src/components/shell/shell-layout.tsx` holds this.
- **A handler always builds on the newest settings, not the ones its render
  held.** Handlers on the Settings page spread the record they were given, and
  some of them run long after that render: one runs when a save comes back,
  another when a font upload finishes. They read the current record through a
  ref instead. `src/components/settings/settings-page.tsx` holds this, and
  `settings-page-writes.test.tsx` is the test that fails without it.

**The check before calling a settings change done.** Make one change, and while
the header still says Saving…, make a second change on another card. Reload.
Both have to be there.

## What a site owns and what the deployment owns

A multisite app splits the record in two when
`CUSTOM_SHELL_WORKSPACE_BASE_DOMAIN` is set: the public menu, the public
footer, its copyright line and the front page rows are saved on the site's own
row, and everything else on the app-wide row. `docs/shell/shell-and-apps.md`
lists the split. Both halves travel in the one record the screen saves, so the
rules above cover them equally.

**Three places read that switch and all three must agree**: the public page,
the Settings screen and the save. They did not until 30 Sep 2026. The public
page read the site's own row whenever the address belonged to a site, and a
custom domain belongs to a site with no base domain set, so a one-site app on
its own domain drew a menu the Settings screen was not editing. "Does this
address answer for its own public pages" is now one value,
`siteOwnsPublicPages`, and whether a front page with no rows means the site has
built none or the deployment's own page should draw follows it too.
