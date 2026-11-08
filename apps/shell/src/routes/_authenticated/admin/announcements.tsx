import { createFileRoute, redirect } from "@tanstack/react-router"

/**
 * Announcements are in the Admin dashboard's ⋮ (Tyler, 8 Nov 2026: "The
 * announcement also doesnt need a table"). This address stays so old links and
 * bookmarks land.
 */
export const Route = createFileRoute("/_authenticated/admin/announcements")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/dashboard", replace: true })
  },
})
