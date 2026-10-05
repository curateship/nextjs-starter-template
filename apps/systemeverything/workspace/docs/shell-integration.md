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
