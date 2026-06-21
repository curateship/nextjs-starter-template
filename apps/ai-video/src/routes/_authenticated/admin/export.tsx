import { createFileRoute } from "@tanstack/react-router"

import { ExportDashboard } from "@/components/export-dashboard"

export const Route = createFileRoute("/_authenticated/admin/export")({
  component: ExportDashboard,
})
