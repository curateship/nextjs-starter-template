import { createFileRoute, redirect } from "@tanstack/react-router"

/**
 * Analytics is the Admin dashboard's Overview tab (Tyler, 8 Nov 2026: "Rename
 * analytic to overview"). This address stays so old links and bookmarks land.
 */
export const Route = createFileRoute("/_authenticated/admin/analytics")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/dashboard", search: { tab: "overview" }, replace: true })
  },
})
