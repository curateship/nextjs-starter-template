import {
  parseMarketKey,
  type CandleBar,
  type CandleInterval,
} from "@/lib/protocols/contracts"
import { earliestAskable } from "@/lib/trade/chart-history"
import { getProtocol } from "@/server/protocols/registry"

/** Read one chart slice after resolving the market through the protocol fence. */
export async function loadProtocolCandles(
  marketKey: string,
  interval: CandleInterval,
  since?: number
): Promise<CandleBar[]> {
  const ref = parseMarketKey(marketKey)
  if (!ref) throw new Error("Not a market key.")
  const protocol = getProtocol(ref.protocol)
  try {
    return await protocol.markets.candles(
      ref.network,
      ref.marketId,
      interval,
      since === undefined ? undefined : earliestAskable(interval, since)
    )
  } catch (error) {
    const said = error instanceof Error ? error.message : String(error)
    if (!said.includes("EXCHANGE_BUSY")) throw error

    // Preserve the venue's own allowance detail when it supplied one. The
    // browser turns this stable code into the chart's plain-language message.
    const detail = /EXCHANGE_BUSY:(.+)$/.exec(said)?.[1]?.trim() ?? ""
    throw new Error(
      `EXCHANGE_BUSY:${protocol.label}${detail ? ` — ${detail}` : ""}`
    )
  }
}
