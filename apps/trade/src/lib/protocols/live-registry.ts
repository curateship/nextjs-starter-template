import type {
  CandleBar,
  CandleInterval,
  LiveFigures,
  NetworkId,
  ProtocolId,
} from "@/lib/protocols/contracts"
import * as hyperliquidStream from "@/lib/protocols/hyperliquid/stream"
import * as kucoinStream from "@/lib/protocols/kucoin/stream"
import * as phemexStream from "@/lib/protocols/phemex/stream"
import * as asterStream from "@/lib/protocols/aster/stream"

/**
 * The browser-side twin of the server's protocol registry: hand it a
 * protocol id, get back that protocol's live feed. Shared code never asks
 * which protocol it holds — adding an exchange with a live feed is adding an
 * entry here, never editing a screen.
 *
 * Safe to import anywhere: the exchange package itself is loaded by the
 * stream module only at connect time, in the browser.
 */

export type LiveAdapter = {
  /**
   * Every market's moving figures, pushed as they change, keyed by market id.
   *
   * Absent on an exchange whose feed can only be asked about one market at a
   * time. KuCoin is the case: its futures socket has no all-markets topic, so
   * following a list of six hundred coins would mean six hundred
   * subscriptions. Its list therefore does not tick — it redraws when the
   * page reloads — while its chart, which watches one market, does. Absent
   * rather than a do-nothing function, because a subscription that never
   * fires looks exactly like a broken socket.
   */
  watchFigures?(
    network: NetworkId,
    listener: (updates: ReadonlyMap<string, LiveFigures>) => void
  ): () => void
  /** The working bar of one market at one timeframe. */
  watchCandle(
    network: NetworkId,
    marketId: string,
    interval: CandleInterval,
    listener: (bar: CandleBar) => void
  ): () => void
  /** Fires once per recovery — the moment to refetch what a gap may have missed. */
  watchCatchUp(network: NetworkId, listener: () => void): () => void
}

/**
 * Partial on purpose: an exchange the app only reads markets from has nothing
 * to stream. Asking for its adapter answers undefined, which is the same thing
 * as "no live prices here" — where a fake adapter that never fires would look
 * exactly like a broken socket.
 */
const LIVE_ADAPTERS: Partial<Record<ProtocolId, LiveAdapter>> = {
  hyperliquid: hyperliquidStream,
  phemex: phemexStream,
  kucoin: kucoinStream,
  aster: asterStream,
}

export function getLiveAdapter(id: ProtocolId): LiveAdapter | undefined {
  return LIVE_ADAPTERS[id]
}
