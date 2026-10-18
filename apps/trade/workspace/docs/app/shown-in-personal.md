# Trade inside Personal

Personal is Tyler's one place to work every app from. Its middle panel shows
a real Trade screen in a frame, and every Trade button in it works, because
the panel is Trade itself. Personal lives at
`https://personal.barelycompany.com`, on the same site as
`https://trade.barelycompany.com`, so Trade's sign-in reaches the frame.
Tyler asked for this on 18 Oct 2026.

## What Trade does in the panel

- **Only the middle panel shows.** A Trade page inside a frame named
  `shell-panel` draws no left menu and no top bar, and it tells Personal its
  path and page name after every move. This is the shell's panel view,
  `src/lib/layout/panel-view.ts`, copied unchanged, plus the shell's lines in
  `src/components/shell/shell-layout.tsx`. The repo's
  `docs/shell/panel-view.md` explains it.
- **Trade opened on its own is unchanged.** The panel view only switches on
  inside Personal's frame.
- **Signing in:** the first time, the panel shows Trade's sign-in page. Sign
  in there once and it stays signed in. Trade's cookie is SameSite=Lax, which
  the browser sends into a frame when the page around it is on the same site
  (`src/server/auth/security.ts:188`).

## Who may put Trade in a frame

`src/start.ts` sets one rule on every answer: `Content-Security-Policy:
frame-ancestors 'self' <Personal>`.

- **On the live site:** Trade itself and `https://personal.barelycompany.com`.
- **On this Mac:** Trade itself and Personal's dev server,
  `http://localhost:3021`.
- **Every other site is refused.** A hidden frame is how a page tricks
  someone into clicking buttons they can't see, and Trade's buttons move
  money. Before 18 Oct 2026, live Trade sent no rule, so any site could
  frame it.
- **No `X-Frame-Options`:** it can name only one address, and a browser that
  follows both rules would refuse Personal.

## The CSRF check in the same file

TanStack Start adds its CSRF check on server functions by itself only when an
app has no `src/start.ts` (`createStartHandler.js` in
`@tanstack/start-server-core`). That check stops another site from calling
Trade's server functions with the visitor's sign-in. Trade now has a start
file, so the check is listed there again, unchanged. Removing it from
`start.ts` would switch it off.
