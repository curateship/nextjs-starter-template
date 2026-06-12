import { createFileRoute } from "@tanstack/react-router"

import { TemplatesDashboard } from "@/components/templates-dashboard"

export const Route = createFileRoute("/_authenticated/admin/templates/")({
  component: TemplatesDashboard,
})
