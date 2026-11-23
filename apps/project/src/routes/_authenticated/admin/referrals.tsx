import { createFileRoute, redirect } from "@tanstack/react-router"

/**
 * Referrals were removed from the shell (Tyler, 8 Nov 2026); the address lands
 * on the Admin dashboard. This address stays so old links and bookmarks land.
 */
export const Route = createFileRoute("/_authenticated/admin/referrals")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/dashboard", replace: true })
  },
})
