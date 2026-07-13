import { ClientOnly, createFileRoute } from "@tanstack/react-router"
import { z } from "zod"

import {
  PAPER_WALLET_PREFIX,
  TradingWorkspace,
} from "@/components/trading/trading-workspace"
import { loadIndicators } from "@/lib/api/indicators"
import { loadTradingContext } from "@/lib/api/trading"
import { useShellRuntime } from "@/components/shell-layout"
import {
  WorkspaceLoadBoundary,
  WorkspaceLoadingSkeleton,
} from "@/components/loading-skeleton"

const tradeSearchSchema = z.object({
  market: z.string().default("ETH"),
  wallet: z.string().optional(),
})

export const Route = createFileRoute("/_authenticated/trade")({
  validateSearch: tradeSearchSchema,
  loader: async () => {
    const [context, indicators] = await Promise.all([
      loadTradingContext(),
      loadIndicators(),
    ])
    return { ...context, indicators }
  },
  component: TradeRoute,
})

function TradeRoute() {
  const runtime = useShellRuntime()
  const { network, wallets, paperWallets, workerOnline, indicators } =
    Route.useLoaderData()
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
    <ClientOnly fallback={<WorkspaceLoadingSkeleton />}>
      <WorkspaceLoadBoundary>
        <TradingWorkspace
          network={network}
          wallets={wallets}
          paperWallets={paperWallets}
          market={market}
          selectedValue={selectedValue}
          workerOnline={workerOnline}
          initialIndicators={indicators}
          orderConfirmation={runtime.config.orderConfirmation}
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
      </WorkspaceLoadBoundary>
    </ClientOnly>
  )
}
