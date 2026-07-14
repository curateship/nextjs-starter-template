import { createFileRoute } from "@tanstack/react-router"

import { PnlDashboard } from "@/components/pnl/pnl-dashboard"
import { loadPnlOverview } from "@/lib/api/pnl"

export const Route = createFileRoute("/_authenticated/pnl")({
  loader: async () => {
    const pnl = await loadPnlOverview()
    return { pnl }
  },
  component: PnlRoute,
})

function PnlRoute() {
  const { pnl } = Route.useLoaderData()
  return <PnlDashboard initial={pnl} />
}
