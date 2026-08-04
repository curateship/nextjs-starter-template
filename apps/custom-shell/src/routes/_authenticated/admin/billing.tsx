import { createFileRoute, redirect } from "@tanstack/react-router"

/**
 * The Revenue page moved into Membership, and Membership has since gone too —
 * the Overview shows the money and the members together now. Pointed straight
 * at the Overview rather than hopping through `/admin/membership`, which is
 * only a redirect itself. The address stays because it has been in the sidebar
 * and in people's bookmarks, and a link that used to work should not start
 * saying "not found".
 */
export const Route = createFileRoute("/_authenticated/admin/billing")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/dashboard", replace: true })
  },
})
