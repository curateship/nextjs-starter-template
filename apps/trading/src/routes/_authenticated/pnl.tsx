import { createFileRoute } from "@tanstack/react-router"

import { PnlCalendarDashboard } from "@/components/pnl/pnl-calendar-dashboard"
import { loadPnlCalendar } from "@/lib/api/pnl"
import { loadWallets } from "@/lib/api/wallets"

export const Route = createFileRoute("/_authenticated/pnl")({
  loader: async () => {
    const [pnl, walletList] = await Promise.all([
      loadPnlCalendar(),
      loadWallets(),
    ])
    return { pnl, wallets: walletList.wallets }
  },
  component: PnlRoute,
})

function PnlRoute() {
  const { pnl, wallets } = Route.useLoaderData()
  return <PnlCalendarDashboard wallets={wallets} initial={pnl} />
}
