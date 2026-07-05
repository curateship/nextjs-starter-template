import { ClientOnly, createFileRoute } from "@tanstack/react-router"
import { z } from "zod"

import {
  PAPER_WALLET_PREFIX,
  TradingWorkspace,
} from "@/components/trading/trading-workspace"
import { loadTradingContext } from "@/lib/api/trading"

const tradeSearchSchema = z.object({
  market: z.string().default("ETH"),
  wallet: z.string().optional(),
})

export const Route = createFileRoute("/_authenticated/trade")({
  validateSearch: tradeSearchSchema,
  loader: () => loadTradingContext(),
  component: TradeRoute,
})

function TradeRoute() {
  const { network, wallets, paperWallets, workerOnline } = Route.useLoaderData()
  const { market, wallet } = Route.useSearch()
  const navigate = Route.useNavigate()

  const validValues = new Set([
    ...wallets.map((item) => item.id),
    ...paperWallets.map((item) => `${PAPER_WALLET_PREFIX}${item.id}`),
  ])
  const selectedValue =
    wallet && validValues.has(wallet)
      ? wallet
      : (wallets.find((item) => item.is_active)?.id ??
        (paperWallets[0] ? `${PAPER_WALLET_PREFIX}${paperWallets[0].id}` : null))

  return (
    <ClientOnly
      fallback={
        <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
          Loading trading workspace…
        </div>
      }
    >
      <TradingWorkspace
        network={network}
        wallets={wallets}
        paperWallets={paperWallets}
        market={market}
        selectedValue={selectedValue}
        workerOnline={workerOnline}
        onMarketChange={(coin) =>
          void navigate({
            search: (current) => ({ ...current, market: coin }),
            replace: true,
          })
        }
        onWalletChange={(value) =>
          void navigate({
            search: (current) => ({ ...current, wallet: value }),
            replace: true,
          })
        }
      />
    </ClientOnly>
  )
}
