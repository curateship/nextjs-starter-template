import { createFileRoute, redirect } from "@tanstack/react-router"

/**
 * The Membership page is gone — the Overview shows the members and the money,
 * and Users and Plans hold the detail it linked out to. The address stays as a
 * redirect because it sat in the sidebar for a long time and is in people's
 * bookmarks, and a link that used to work should not start saying "not found".
 */
export const Route = createFileRoute("/_authenticated/admin/membership")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/dashboard", replace: true })
  },
})
