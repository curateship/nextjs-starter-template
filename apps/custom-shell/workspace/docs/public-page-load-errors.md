# Public page load errors

Every public route that loads data has its own error view. A failed load keeps
the visitor at the same address inside the signed-out page frame. The view says
what failed, offers Try again, and links to sign in.

The catch-all route keeps missing pages separate from failed pages. An address
that has no written or app-owned page still uses the not-found view.
