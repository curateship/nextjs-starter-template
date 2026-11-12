import { createFileRoute, redirect } from "@tanstack/react-router"

import { projectsDashboardSearch } from "@/lib/social/projects-dashboard-search"

/**
 * The Voices dashboard's old address, which the Reddit account tab's "Open
 * Main voice" link and older bookmarks use. Voices is a section of the
 * Projects dashboard since 12 Nov 2026, so this opens it with the same
 * `?open=`.
 */
export const Route = createFileRoute("/_authenticated/admin/voices")({
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/admin/projects", search: projectsDashboardSearch("voices", search), replace: true })
  },
})
