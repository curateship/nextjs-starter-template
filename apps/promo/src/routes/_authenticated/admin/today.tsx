import { createFileRoute, redirect } from "@tanstack/react-router"

import { findProjectForOldScreen } from "@/lib/api/social/projects"

/**
 * Today's old address. Today became a tab in each project's Reddit module on
 * 14 Oct 2026, so this sends to the only project's Today tab, or to the
 * Projects table when there are several to pick from.
 */
export const Route = createFileRoute("/_authenticated/admin/today")({
  beforeLoad: async () => {
    const { projectId } = await findProjectForOldScreen("today")
    if (!projectId) throw redirect({ to: "/admin/projects", replace: true })
    throw redirect({ to: "/admin/projects/$projectId", params: { projectId }, search: { view: "today" }, replace: true })
  },
})
