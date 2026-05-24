import { createFileRoute } from "@tanstack/react-router"

import { AiVideoDashboard } from "@/components/ai-video-dashboard"

export const Route = createFileRoute("/_authenticated/")({
  component: AiVideoDashboard,
})
