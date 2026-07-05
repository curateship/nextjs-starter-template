import { createFileRoute } from "@tanstack/react-router"

import { PortfolioDashboard } from "@/components/portfolio/portfolio-dashboard"
import { loadPortfolio } from "@/lib/api/portfolio"
import { loadWallets } from "@/lib/api/wallets"

export const Route = createFileRoute("/_authenticated/portfolio")({
  loader: async () => {
    const [portfolio, walletList] = await Promise.all([
      loadPortfolio(),
      loadWallets(),
    ])
    return { portfolio, wallets: walletList.wallets }
  },
  component: PortfolioRoute,
})

function PortfolioRoute() {
  const { portfolio, wallets } = Route.useLoaderData()
  return <PortfolioDashboard wallets={wallets} initial={portfolio} />
}
