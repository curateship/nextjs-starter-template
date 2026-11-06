import { createFileRoute, redirect } from "@tanstack/react-router"

import { findProjectForOldScreen } from "@/lib/api/social/projects"

/**
 * Today's old address. Today became a tab in each project's Reddit module on
 * 14 Oct 2026, under Reddit's Commenting row since 5 Nov 2026
 * (`workspace/tasks/Projects/commenting-dashboard.md`). This sends to it on
 * the only project, or to the Projects table when there are several.
 */
export const Route = createFileRoute("/_authenticated/admin/today")({
  beforeLoad: async () => {
    const { projectId } = await findProjectForOldScreen("today")
    if (!projectId) throw redirect({ to: "/admin/projects", replace: true })
    throw redirect({ to: "/admin/projects/$projectId", params: { projectId }, search: { network: "reddit", side: "commenting", view: "today" }, replace: true })
  },
})
