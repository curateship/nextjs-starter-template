# Personal docs

What is true of this app. What is true of every app is in the repo's `docs/`.

## What this app is for

Personal is the one place Tyler works every app from. In his words, 16 Oct
2026: "this app's idea is to pull dashboards from all my other apps", "so that
I can control all the apps in one place", showing "middle content panels, not
the sidebars or top nav".

- **Personal keeps its own left menu and top bar.** The middle panel shows a
  real screen from another app, such as Project's My dashboard.
- **The other app's screen is the app itself, in a frame.** Every button, form
  and pop-up works, and nothing is drawn twice. Redrawing each dashboard in
  Personal from the other app's numbers was weighed and turned down on 16 Oct
  2026: every dashboard and every button would be built twice and drift apart.
- **Local only for now.** Live use waits for every app to be reachable under
  one domain of Tyler's. `app-panels.md` says why.

## Docs

- [App panels](app-panels.md): how another app's screen fills the middle
  panel, how Personal's address follows it, the one sign-in per app, how to add
  an app or a screen, and why it only works locally today.
