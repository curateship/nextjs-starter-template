import type {
  CandleBar,
  CandleInterval,
  LiveFigures,
  NetworkId,
  ProtocolId,
} from "@/lib/protocols/contracts"
import * as hyperliquidStream from "@/lib/protocols/hyperliquid/stream"

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
  /** Every market's moving figures, pushed as they change, keyed by market id. */
  watchFigures(
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

const LIVE_ADAPTERS: Record<ProtocolId, LiveAdapter> = {
  hyperliquid: hyperliquidStream,
}

export function getLiveAdapter(id: ProtocolId): LiveAdapter {
  return LIVE_ADAPTERS[id]
}
