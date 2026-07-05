import { createFileRoute } from "@tanstack/react-router"

import { FleetDashboard } from "@/components/bots/fleet-dashboard"
import { loadBots } from "@/lib/api/bots"

export const Route = createFileRoute("/_authenticated/bots/")({
  loader: () => loadBots(),
  component: BotsRoute,
})

function BotsRoute() {
  const initial = Route.useLoaderData()
  return <FleetDashboard initial={initial} />
}
