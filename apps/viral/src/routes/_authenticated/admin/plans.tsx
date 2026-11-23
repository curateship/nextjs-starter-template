import { createFileRoute, redirect } from "@tanstack/react-router"

/**
 * Plans are in the Admin dashboard's ⋮ and Plans block (Tyler, 8 Nov 2026:
 * "The plans doesnt need a full table"). This address stays so old links and
 * bookmarks land.
 */
export const Route = createFileRoute("/_authenticated/admin/plans")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/dashboard", replace: true })
  },
})
