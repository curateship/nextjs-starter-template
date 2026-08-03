import { createFileRoute, redirect } from "@tanstack/react-router"

/**
 * The Revenue page moved into Membership, which now shows the money and the
 * members together. The address stays as a redirect: it has been in the sidebar
 * and in people's bookmarks, and a link that used to work should not start
 * saying "not found".
 */
export const Route = createFileRoute("/_authenticated/admin/billing")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/membership", replace: true })
  },
})
