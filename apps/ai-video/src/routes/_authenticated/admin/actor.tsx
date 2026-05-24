import { createFileRoute } from "@tanstack/react-router"

import { ActorDashboard } from "@/components/actor-dashboard"

export const Route = createFileRoute("/_authenticated/admin/actor")({
  component: ActorDashboard,
})
