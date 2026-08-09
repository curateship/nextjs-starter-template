import type { NetworkId, ProtocolId } from "@/lib/protocols/contracts"
import {
  BASE_STOP_BAR_MS,
  BASE_STOP_BARS,
  BASE_STOP_INTERVAL,
  baseStopDetection,
} from "@/lib/trade/dca"
import { baseInForce } from "@/lib/trade/indicators/base"
import { getProtocol } from "@/server/protocols/registry"

/**
 * The confirmed base a market is standing on right now.
 *
 * One answer, read the same way by everything that needs it: the window that
 * draws a ladder, the placement that writes one, and the stop that rests under
 * it. A ladder measured from one base while its stop watches another would be
 * a trade with two different opinions about where the floor is.
 */
export async function marketBaseInForce(
  protocol: ProtocolId,
  network: NetworkId,
  marketId: string,
  now: number
): Promise<number | null> {
  const bars = await getProtocol(protocol)
    .markets.candles(
      network,
      marketId,
      BASE_STOP_INTERVAL,
      now - BASE_STOP_BARS * BASE_STOP_BAR_MS
    )
    // A market too new to have history, or an exchange that would not answer.
    // Either way there is no base, which the callers already handle.
    .catch(() => [])

  // The bar still being filled in is left out: it cannot have confirmed a
  // level, so counting it would only make the answer flicker.
  const closed = bars.filter((bar) => bar.openTime + BASE_STOP_BAR_MS <= now)
  if (closed.length === 0) return null
  return baseInForce(closed, baseStopDetection())
}
