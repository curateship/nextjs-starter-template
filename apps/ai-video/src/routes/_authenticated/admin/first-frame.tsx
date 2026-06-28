import { createFileRoute } from "@tanstack/react-router"

import { FirstFrameDashboard } from "@/components/first-frame-dashboard"

export const Route = createFileRoute("/_authenticated/admin/first-frame")({
  component: FirstFrameDashboard,
})
