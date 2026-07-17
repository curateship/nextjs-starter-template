import { createFileRoute } from "@tanstack/react-router"

import { HomeDashboard } from "@/components/home-dashboard"

export const Route = createFileRoute("/_authenticated/home")({
  component: HomeDashboard,
})
