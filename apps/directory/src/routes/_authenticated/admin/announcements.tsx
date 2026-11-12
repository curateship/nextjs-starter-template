import { createFileRoute, redirect } from "@tanstack/react-router"

/**
 * Announcements are a section of the Admin dashboard (Tyler, 9 Nov 2026:
 * "Move the announcement from the top left settings into its own
 * dashboard"). This address stays so old links and bookmarks land there.
 */
export const Route = createFileRoute("/_authenticated/admin/announcements")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/dashboard", search: { tab: "announcements" }, replace: true })
  },
})
