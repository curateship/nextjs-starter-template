# Personal docs

## What this app is for

Personal is the one place Tyler works every app from. In his words, 16 Oct
2026: "this app's idea is to pull dashboards from all my other apps", "so that
I can control all the apps in one place", showing "middle content panels, not
the sidebars or top nav".

- **Personal keeps its own left menu and top bar.** The middle panel shows a
  real screen from another app, such as CMS's Listings.
- **The other app's screen is the app itself, in a frame.** Every button, form
  and pop-up works, and nothing is drawn twice. Redrawing each dashboard in
  Personal was turned down on 16 Oct 2026, because every dashboard and button
  would be built twice.
- **It is a small app on purpose.** It began as a copy of Custom Shell, 962
  files and about 202,000 lines. Tyler had it rebuilt the same day: "We dont
  want a 200k LOC for a simple iframe app. Also we'll need a more robust system
  to add navigation directly inline from the sidebar and top navigation
  anyways."
- **Live at `https://personal.barelycompany.com`** since 18 Oct 2026, on the German
  server next to Trade, so apps on `barelycompany.com` can sign in inside its
  panel. `launch.md` has the setup; `app-panels.md` says why the domain
  matters.
- **One password guards it.** Nothing shows until it is typed, and a sign-in
  lasts 30 days. `sign-in.md` has the rest.

## Docs

- [App panels](app-panels.md): how another app's screen fills the middle
  panel, how Personal's address follows it, keeping the last three screens
  loaded, the top bar's name, Back, Forward, Reload, pop-out, recent screens,
  pin, zoom and phone view, signing in once per app, and why it only works on
  this Mac today.
- [The menu](menu.md): the edit switch, folding sections, sub-links and the
  top bar row that mirrors them, resizing the menu, adding, editing, renaming
  in place, dragging links between lists and sections into order, links that
  open in their own tab, the start screen, and the file the menu is kept in.
- [Signing in](sign-in.md): the one password, where it is kept, 30-day
  sign-ins, wrong passwords and the 15-minute lock-out, signing out, and what
  the sign-in does not cover.
- [Going live](launch.md): where live Personal runs, its three settings, the
  Docker build and live server, deploying, changing the password, the live
  menu, and the release record.
