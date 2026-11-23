import * as React from "react"

import { buildBotRoundTrips } from "@/components/bots/bot-round-trips"
import type { BotDetailResponse } from "@/lib/api/bots"
import { useMarketRows } from "@/lib/hl/hooks"
import type { TradingNetwork } from "@/lib/hl/network"

/**
 * The live view of one of a bot's markets, derived from the polled detail +
 * the websocket price feed. Shared by the editor's Bot mode and the standalone
 * run dashboard so both read identical numbers. With no run loaded yet the
 * caller supplies the network (the setup form's selected wallet).
 */
export function useBotLive(
  detail: BotDetailResponse | null,
  market: string,
  fallbackNetwork: TradingNetwork = "testnet"
) {
  const network = (
    detail ? (detail.bot.network === "mainnet" ? "mainnet" : "testnet") : fallbackNetwork
  ) as TradingNetwork
  const marketRows = useMarketRows(network)
  const marketRow = marketRows.find((row) => row.coin === market)
  const markPrice = Number(marketRow?.markPx ?? 0)
  const dayChangePct =
    marketRow && Number(marketRow.prevDayPx) > 0
      ? (Number(marketRow.markPx) / Number(marketRow.prevDayPx) - 1) * 100
      : null

  const state = detail?.states.find((row) => row.market === market) ?? null
  const openOrders = React.useMemo(
    () =>
      (detail?.open_orders ?? []).filter((order) => order.market === market),
    [detail?.open_orders, market]
  )
  const marketTrades = React.useMemo(
    () => (detail?.trades ?? []).filter((trade) => trade.market === market),
    [detail?.trades, market]
  )
  // Fills paired into entry → exit round trips, shaped like backtest trades.
  const trips = React.useMemo(
    () => buildBotRoundTrips(marketTrades, markPrice),
    [marketTrades, markPrice]
  )

  return { network, markPrice, dayChangePct, state, openOrders, marketTrades, trips }
}

