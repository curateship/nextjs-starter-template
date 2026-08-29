import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import {
  CANDLE_INTERVALS,
  parseMarketKey,
  type CandleBar,
  type CandleInterval,
} from "@/lib/protocols/contracts"
import { userGet } from "@/server/guards"
import { loadProtocolCandles } from "@/server/trade/candles"

import { createErrorMessage } from "../error-message"

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
  /**
   * The oldest moment worth asking for, in epoch milliseconds. The chart
   * sends it for its FIRST look at a timeframe that loads in full: two years
   * arrives in well under a second where the whole history takes a second or
   * two, so something is on screen while the rest is still coming.
   *
   * Pulled forward to a sane limit below before it reaches an exchange — the
   * value arrives from a browser, and a far enough past turns one request
   * into a hundred thousand. See `earliestAskable`.
   */
  since: z.number().int().positive().optional(),
})

const loadCandlesFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(candlesInputSchema)
  .handler(async ({ data }): Promise<{ candles: CandleBar[] }> => {
    return {
      candles: await loadProtocolCandles(
        data.marketKey,
        data.interval,
        data.since
      ),
    }
  })

export function loadCandles(
  marketKey: string,
  interval: CandleInterval,
  since?: number
) {
  return loadCandlesFn({ data: { marketKey, interval, since } })
}

/**
 * `EXCHANGE_BUSY` means the venue would not answer right now, and NOT
 * necessarily that a limit was reached: Aster throws the same code when a
 * request simply times out. The old wording said the allowance was spent,
 * which was a guess dressed as a fact, and it cost a day of looking at the
 * wrong exchange. It names the venue and stops short of naming a cause.
 */
function busyMessage(said: string): string | null {
  if (!said.includes("EXCHANGE_BUSY")) return null
  const named = /EXCHANGE_BUSY:(.+)$/.exec(said)?.[1]?.trim()
  if (!named) {
    return "That exchange would not answer just now. The chart will draw itself as soon as it does."
  }
  // "Lighter — spent 34 of 34 this minute (22 read, 12 socket)"
  const [venue, detail] = named.split(" — ")
  return detail
    ? `${venue} would not answer just now — ${detail}. The chart will draw itself as soon as there is room.`
    : `${venue} would not answer just now. The chart will draw itself as soon as it does.`
}

const candlesMessage = createErrorMessage(
  {
    ASTER_IP_BANNED:
      "Aster has blocked this internet address. Trade has stopped asking Aster. Check Aster before restarting the app.",
    // The exchange rations requests, and the chart's own pull is what gets
    // refused when browsing spends the minute's allowance. Named, because
    // "could not load" sent people hunting for a broken chart.
    //
    // It says "the exchange" rather than naming one: this chart draws three
    // of them now, and being told Hyperliquid is busy while looking at a
    // KuCoin coin sends somebody hunting for the wrong problem.
    "429":
      "The exchange is asking us to slow down — give it a few seconds and try again.",
    "rate limit":
      "The exchange is asking us to slow down — give it a few seconds and try again.",
  },
  "The chart could not load. Nothing is wrong on your side — try again in a moment."
)

export function getCandlesErrorMessage(error: unknown): string {
  const said =
    typeof error === "string"
      ? error
      : error instanceof Error
        ? error.message
        : ""
  return busyMessage(said) ?? candlesMessage(error)
}
