# Public page load errors

Public page failures have two distinct outcomes:

- A failed data load keeps the visitor at the same address. The view says what
  failed, offers Try again, and links to sign in.
- An address with no written or app-owned page uses the not-found view. The
  catch-all route does not present a missing page as a load failure.
- Both show their card alone in the middle of the page, with no public menu and
  no footer (Tyler, 9 Nov 2026: "The 404 page should only show the card in the
  middle and not the navigation and footer"). The not-found card keeps its own
  search box and Main pages list when the site has them. `BareAuthPage` in
  `src/components/shell/auth-shell.tsx` draws the page. A signed-in address
  that matches no page inside the app keeps the left menu.
