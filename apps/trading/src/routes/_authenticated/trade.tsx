import * as React from "react"
import { ClientOnly, createFileRoute } from "@tanstack/react-router"
import { z } from "zod"

import {
  PAPER_WALLET_PREFIX,
  TradingWorkspace,
} from "@/components/trading/trading-workspace"
import { loadIndicators } from "@/lib/api/indicators"
import { loadDashboardWatchlistTabOrder } from "@/lib/api/shell-settings"
import { loadTradingContext } from "@/lib/api/trading"
import { useShellRuntime } from "@/components/shell-layout"
import { resolveSelectedWalletValue } from "@/lib/trading/wallet-selection"
import { usePersistedState } from "@/lib/use-persisted-state"

const tradeSearchSchema = z.object({
  market: z.string().default("ETH"),
  wallet: z.string().optional(),
})

export const Route = createFileRoute("/_authenticated/trade")({
  validateSearch: tradeSearchSchema,
  loader: async () => {
    const [context, indicators, watchlistTabOrder] = await Promise.all([
      loadTradingContext(),
      loadIndicators(),
      // Cosmetic tab order must never break the trade page — fall back to the
      // built-in order if it can't be read.
      loadDashboardWatchlistTabOrder().catch(() => ({ order: [] as string[] })),
    ])
    return { ...context, indicators, watchlistTabOrder: watchlistTabOrder.order }
  },
  component: TradeRoute,
})

function TradeRoute() {
  const runtime = useShellRuntime()
  const { network, wallets, paperWallets, workerOnline, indicators, watchlistTabOrder } =
    Route.useLoaderData()
  const { market, wallet } = Route.useSearch()
  const navigate = Route.useNavigate()
  const [savedWallet, setSavedWallet] = usePersistedState<string | null>(
    "trading:selected-wallet",
    null
  )

  const validValues = new Set([
    ...wallets.map((item) => item.id),
    ...paperWallets.map((item) => `${PAPER_WALLET_PREFIX}${item.id}`),
  ])
  const fallbackValue =
    wallets.find((item) => item.is_active)?.id ??
    (paperWallets[0] ? `${PAPER_WALLET_PREFIX}${paperWallets[0].id}` : null)
  const selectedValue = resolveSelectedWalletValue(
    wallet,
    savedWallet,
    validValues,
    fallbackValue
  )

  React.useEffect(() => {
    if (selectedValue && selectedValue !== savedWallet) {
      setSavedWallet(selectedValue)
    }
  }, [savedWallet, selectedValue, setSavedWallet])

  return (
    <ClientOnly fallback={null}>
      <TradingWorkspace
        network={network}
        wallets={wallets}
        paperWallets={paperWallets}
        market={market}
        selectedValue={selectedValue}
        workerOnline={workerOnline}
        initialIndicators={indicators}
        initialWatchlistTabOrder={watchlistTabOrder}
        orderConfirmation={runtime.config.orderConfirmation}
        orderDefaults={runtime.config.orderDefaults}
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
