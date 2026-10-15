import { createFileRoute, redirect } from "@tanstack/react-router"

import { findProjectForOldScreen } from "@/lib/api/social/projects"

/**
 * The Jobs dashboard's old address. Jobs became a window opened from the
 * Jobs button on a project's Reddit module on 14 Oct 2026. Every job shows
 * from any project, so this opens the window on the first one.
 */
export const Route = createFileRoute("/_authenticated/admin/jobs")({
  beforeLoad: async () => {
    const { projectId } = await findProjectForOldScreen("jobs")
    if (!projectId) throw redirect({ to: "/admin/projects", replace: true })
    throw redirect({ to: "/admin/projects/$projectId", params: { projectId }, search: { window: "jobs" }, replace: true })
  },
})
