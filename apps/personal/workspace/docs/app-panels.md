# App panels

Opening a link puts that app's real screen in Personal's middle panel. Personal
keeps its own left menu and top bar around it. The frame is
`src/components/panel-frame.tsx`.

## Addresses

- **Personal's address names the screen.** `http://localhost:3021/localhost:3015/admin/listings`
  shows `http://localhost:3015/admin/listings`. The first part after Personal's
  own is the app's host, and the rest is the screen's path. A local host
  (`localhost`, `127.0.0.1`) is opened over http and any other host over https.
  `personalPath` and `appUrlFromPersonalPath` in `src/lib/menu.ts` do the
  conversion.
- **A reload lands on the same screen**, because the address says which one.
- **`http://localhost:3021/` with nothing after it** shows a line asking you to
  pick a screen from the menu.

## The frame

- **The framed app hides its own menu.** The frame is named `shell-panel` and
  its first address carries `?panel=1`. Every app built on Custom Shell then
  draws only its middle panel. The repo's `docs/shell/panel-view.md` is that
  side. An app without that shell change shows its full menu inside the panel.
- **Personal's address follows the frame.** After every move inside the frame,
  the app reports its path and page name. Personal swaps its own address to
  match, without reloading the frame, and the browser tab reads like
  "Notifications · Personal". Personal only listens to reports from the open
  app's address and its own frame (`readPanelReport` in `src/lib/panel.ts`).
- **Only Personal's own moves reload the frame**: a menu click, or Back and
  Forward. Clicking the link of the screen already open reloads it.
- **"Opening localhost:3015"** with a spinner shows until the frame's page has
  loaded.
- **An app that refuses frames** shows "localhost refused to connect" in the
  panel. CMS refused every frame from another address, so in development it
  now lets `http://localhost:3021` frame it (CMS's `who-may-frame-cms.md`).
  Project, Trade and Video send no such rule.

## Signing in

Each app has its own accounts, and Personal has none. The first time a panel
shows an app, it shows that app's sign-in page. Sign in there once and the
frame stays signed in.

This only works locally. The browser treats `localhost:3021` and
`localhost:3015` as one site, because ports don't count, so it sends the app's
sign-in into the frame. On the live sites each app has its own domain, and the
browser keeps an app's sign-in out of a frame on a different domain, so the
panel would only ever show the sign-in page. The fix is to give each app a
second address under one domain of Tyler's, such as `cms.<his domain>`: a DNS
entry and a Coolify domain per app, no code. That decision waits for Tyler.
