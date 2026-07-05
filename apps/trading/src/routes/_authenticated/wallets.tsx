import { createFileRoute } from "@tanstack/react-router"

import { PaperWalletsSection } from "@/components/trading/paper-wallets-section"
import { WalletsDashboard } from "@/components/trading/wallets-dashboard"
import { loadTradingContext } from "@/lib/api/trading"

export const Route = createFileRoute("/_authenticated/wallets")({
  loader: () => loadTradingContext(),
  component: WalletsRoute,
})

function WalletsRoute() {
  const { wallets, paperWallets, mainnetEnabled } = Route.useLoaderData()
  return (
    <div className="w-full">
      <WalletsDashboard
        initialWallets={wallets}
        mainnetEnabled={mainnetEnabled}
      />
      <PaperWalletsSection paperWallets={paperWallets} />
    </div>
  )
}
