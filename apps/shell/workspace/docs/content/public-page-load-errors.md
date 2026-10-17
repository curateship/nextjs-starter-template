# Public page load errors

Public page failures have two distinct outcomes:

- A failed data load keeps the visitor at the same address inside the signed-out
  page frame. The view says what failed, offers Try again, and links to sign in.
- An address with no written or app-owned page uses the not-found view. The
  catch-all route does not present a missing page as a load failure.
