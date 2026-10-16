# App panels

`http://localhost:3021/apps/project/dashboard` shows Project's My dashboard in
Personal's middle panel, with Personal's own left menu and top bar around it.
The left menu's Project section links there.

## How it works

- **The address.** `/apps/<app>/<path>` shows `<path>` of that app. The apps
  Personal knows are listed in `src/lib/personal/app-panels.ts`, each with its
  local address from the repo's `local-apps.json`. Today that is Project at
  `http://localhost:3020`. An unknown app, such as `/apps/nope`, shows the
  not-found page.
- **The frame.** `src/components/personal/app-panel.tsx` loads
  `http://localhost:3020/dashboard?panel=1` in a frame that fills the middle
  panel to its edges. Project's own page already has the page gutter, so the
  frame cancels Personal's, or the gap would be doubled. "Opening Project" with
  a spinner shows until the frame's page has loaded.
- **The other app hides its menu.** The frame is named `shell-panel` and its
  first address carries `?panel=1`, which makes the shell in Project draw only
  its middle panel. That is a shell feature every app has, described in
  the repo's `docs/shell/panel-view.md`.
- **Personal's address follows the frame.** After every move inside the frame,
  Project reports its path and page name. Personal swaps its own address to
  match, for example to `/apps/project/projects`, without loading the frame
  again, so a reload lands on the same screen. The browser tab reads
  "Projects · Project". Personal only listens to notes from the app's own
  address and its own frame.
- **Only Personal's own moves reload the frame.** Clicking My dashboard in the
  left menu loads the dashboard into the frame, even after clicking around
  inside it.
- **Search values inside the frame are not kept in Personal's address.** A
  reload keeps the frame's page but not, say, a filter Project holds in its own
  address.

## Signing in

Each app has its own accounts. The first time Personal shows Project, the
middle panel shows Project's sign-in page. Sign in there once and the frame
stays signed in.

This only works locally. The browser treats `localhost:3021` and
`localhost:3020` as one site, because ports don't count, so it sends Project's
sign-in into the frame. On the live sites each app has its own domain, and the
browser keeps an app's sign-in out of a frame on a different domain, so the
panel would only ever show the sign-in page. The fix is to give each app a
second address under one domain of Tyler's, such as `project.<his domain>`: a
DNS entry and a Coolify domain per app, no code. That decision waits for Tyler.

## Adding a screen or an app

- **Another screen of Project:** add a link in Settings → Navigation (or
  Members → Navigation for the members' menu) pointing at
  `/apps/project/<path>`, such as `/apps/project/projects`. No code.
- **Another app:** add a line to `CONNECTED_APPS` in
  `src/lib/personal/app-panels.ts`, such as
  `{ id: "trade", name: "Trade", address: "http://localhost:3014" }`, then add
  menu links in Settings. The app must have the shell's panel view, which
  arrives with a shell merge. Without it the panel shows that app's full menu
  and top bar inside Personal's.

## The left menu link

`src/server/personal/navigation.ts` runs on the background loop and adds the
Project section with My dashboard to each left menu once: the members' menu and
each workspace's. It records each menu in the `personal_navigation_added` table
(`drizzle/0094_personal_navigation_added.sql`), so an admin who removes the link
in Settings keeps it removed. It is the same job Project uses for its own menu.
