import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import {
  CANDLE_INTERVALS,
  parseMarketKey,
  type CandleBar,
  type CandleInterval,
} from "@/lib/protocols/contracts"
import { userGet } from "@/server/guards"
import { getProtocol } from "@/server/protocols/registry"

import { createErrorMessage } from "./error-message"

/**
 * Price history for the chart. The market arrives as a full market key, so
 * this file resolves which protocol to ask through the registry and never
 * needs to know an exchange by name.
 */

const candlesInputSchema = z.object({
  // Refused, never guessed at: a key that does not parse is an error, not an
  // invitation to fall back to some market that does exist.
  marketKey: z
    .string()
    .max(120)
    .refine((key) => parseMarketKey(key) !== null, {
      message: "Not a market key.",
    }),
  interval: z.enum(CANDLE_INTERVALS),
})

const loadCandlesFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(candlesInputSchema)
  .handler(async ({ data }): Promise<{ candles: CandleBar[] }> => {
    // The validator proved this parses; asserting keeps the types honest.
    const ref = parseMarketKey(data.marketKey)
    if (!ref) throw new Error("Not a market key.")
    const protocol = getProtocol(ref.protocol)
    return {
      candles: await protocol.markets.candles(
        ref.network,
        ref.marketId,
        data.interval
      ),
    }
  })

export function loadCandles(marketKey: string, interval: CandleInterval) {
  return loadCandlesFn({ data: { marketKey, interval } })
}

export const getCandlesErrorMessage = createErrorMessage(
  {
    // The exchange rations requests, and the chart's own pull is what gets
    // refused when browsing spends the minute's allowance. Named, because
    // "could not load" sent people hunting for a broken chart.
    "429":
      "Hyperliquid is asking us to slow down — give it a few seconds and try again.",
    "rate limit":
      "Hyperliquid is asking us to slow down — give it a few seconds and try again.",
  },
  "The chart could not load. Nothing is wrong on your side — try again in a moment."
)
