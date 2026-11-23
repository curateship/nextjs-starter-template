import { createFileRoute } from "@tanstack/react-router"

import { AiGenerationsDashboard } from "@/components/ai-generations-dashboard"

export const Route = createFileRoute("/_authenticated/admin/ai-generations")({
  component: AiGenerationsDashboard,
})
