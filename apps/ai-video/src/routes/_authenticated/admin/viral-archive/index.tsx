import { createFileRoute } from "@tanstack/react-router"

import { ViralArchiveDashboard } from "@/components/viral-archive-dashboard"

export const Route = createFileRoute("/_authenticated/admin/viral-archive/")({
  component: ViralArchiveDashboard,
})
