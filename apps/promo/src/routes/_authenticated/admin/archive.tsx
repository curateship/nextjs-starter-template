import { createFileRoute, redirect } from "@tanstack/react-router"

import { projectsDashboardSearch } from "@/lib/social/projects-dashboard-search"

/**
 * The Archive's old address, which Video's Open in Promo, bell notices
 * stored before 12 Nov 2026 and older bookmarks use. Archive is a section of
 * the Projects dashboard now, so this opens it with the same `?project=`,
 * `?open=`, tab and filters.
 */
export const Route = createFileRoute("/_authenticated/admin/archive")({
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/admin/projects", search: projectsDashboardSearch("archive", search), replace: true })
  },
})
