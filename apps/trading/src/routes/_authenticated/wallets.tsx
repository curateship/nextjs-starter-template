import { createFileRoute } from "@tanstack/react-router"

import { WalletsUnified } from "@/components/trading/wallets-unified"
import { loadTradingContext } from "@/lib/api/trading"

export const Route = createFileRoute("/_authenticated/wallets")({
  loader: () => loadTradingContext(),
  component: WalletsRoute,
})

function WalletsRoute() {
  const { wallets, paperWallets, mainnetEnabled } = Route.useLoaderData()
  return (
    <WalletsUnified
      wallets={wallets}
      paperWallets={paperWallets}
      mainnetEnabled={mainnetEnabled}
    />
  )
}
