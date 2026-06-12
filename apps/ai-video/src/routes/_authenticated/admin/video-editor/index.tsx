import { createFileRoute } from "@tanstack/react-router"

import { ProjectsDashboard } from "@/components/projects-dashboard"

export const Route = createFileRoute("/_authenticated/admin/video-editor/")({
  component: ProjectsDashboard,
})
