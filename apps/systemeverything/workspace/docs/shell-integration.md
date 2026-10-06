# systemeverything and Custom Shell

systemeverything uses the shared Custom Shell code for accounts, billing,
automations, navigation, public pages and settings. Its own routes, tables,
migrations and app options belong to it.

## Shell merge, 5 October 2026

The shell was merged in again on 5 Oct 2026, from `apps/custom-shell` in ws-4.
Shell-origin files were replaced wholesale after each one was proved to be an
unmodified older shell version: the app's copy was hashed and matched against
every version of that file in the repository's history. A file with no match is
a real fork and was left alone.

**Never overwritten, in any app.** `src/app/options.ts`,
`src/app/server-options.ts`, `src/app/open-endpoints.ts`, `src/routeTree.gen.ts`
and `src/lib/layout/scaffold-styling.ts`. The first three are the app's own
answers to the shell, the route tree is generated per app, and the styling file
is the live Custom Shell styling that Personal IDE writes into a generated app.

**What arrived.** The CRM, page blocks, the front page editor at
`/admin/pages/edit`, the sliding tab pill, the three-tier dark canvas, blocked
senders, and the smaller fixes between the app's last merge and this one. Plus
the three changes made in the shell the same day: the external-link button that
appears when the pointer is on the workspace block at the top of the sidebar,
Members and Public moving back into the Platform settings card, and
`src/border-first.css`, which stops every divider being drawn near-black for the
first frames of a fresh page load.

**What was deleted.** The shell replaced the settings-based front page row
editor with the page-blocks editor, and moved two of its files into
`src/components/pages/`. The old copies were still sitting in this app, out of
step with the shell they were written against. Every file removed was proved to
have come from the shell, to be gone from the shell now, and to be imported by
nothing outside the group removed with it.

**The route tree was regenerated** with `@tanstack/router-generator` rather than
by starting a dev server. The generator drops the trailing
`declare module '@tanstack/react-start'` Register block that the Vite plugin
writes, and it typechecks fine without it, so the block was put back from the
committed file and the resulting diff checked to be purely additive.

**This app.** 41 shell files updated, 9 added and 1 removed. One migration was
carried: the shell's `0091_custom_shell_crm_blocked_senders.sql` keeps its own
number here, because systemeverything's next free number was also 0091.

The single removed file was `lib/hooks/use-app-notification-links.ts`, which the
shell no longer has and nothing here imported.

## Shell merge, 5 October 2026 (second)

A small one on top of the merge earlier the same day: eight files, no
migrations, no new routes, and nothing for the route generator to rebuild. Every
app was exactly seven files behind and gained one new file.

- **The Tag rule is a combobox.** Contacts → Filters → Tag, and the same field in
  the segment window, now picks from the tags contacts actually carry instead of
  taking comma-separated text. `src/components/ui/multi-combobox.tsx` is the new
  control, built from the Popover, ScrollArea and Badge already here rather than
  from a new dependency.
- **Each block in the page editor's list wears its kind's mark**, the same
  picture the cards on the left use.
- **Both states of the editor's right-hand panel have a button that shuts every
  card at once.** The cards hear it through an optional signal in
  `inspector-card.tsx`, so any panel that puts no button in its header — the
  newsletter editor, the automation panels — is unchanged.
- **The block list's header links to the page itself**, opening it in a new tab.

Nothing was deleted and nothing forked. CMS's `lib/format/bulk-result.ts` is no
longer a fork at all: the previous merge folded its "already that way" count
into the shell's own copy, and this merge confirms the two are identical again.

## Shell merge, 6 October 2026

Two shell changes came across together, because the second needs the first.

- **A page an admin adds has a picture of its own** (shell commit 40b3c3270),
  chosen in the Add a page window and in Page settings and drawn at the top of
  the page. This app had not taken it yet.
- **The Pages list block and a description on every added page**, built in the
  shell for this app on 6 Oct 2026. Pages list is a grid of cards for the pages
  ticked in its panel, each card showing the page's picture, name and
  description. The shell's `workspace/docs/content/building-the-front-page.md`
  describes both.

Every app copy replaced was proved to be an unmodified shell version first:
the app's file matched either the shell's last committed copy or the copy from
just before the picture change. Nothing here was a fork. 22 shell files updated
and 2 added (`written-page-picture.tsx`, `front-page-listed-pages-editor.tsx`).

**Two migrations, keeping the shell's numbers**, since this app's next free
number was 0092: `0092_custom_shell_written_page_picture.sql` and
`0093_custom_shell_written_page_description.sql`. Both have been applied to
the local database only.
