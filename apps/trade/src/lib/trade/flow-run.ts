import type {
  CandleInterval,
  NetworkId,
  ProtocolId,
} from "@/lib/protocols/contracts"
import type { DcaParams } from "@/lib/trade/dca"
import type { IndicatorSettings } from "@/lib/trade/indicators/registry"

/**
 * A flow that has been switched on to trade, in the app's own words.
 *
 * Browser-safe on purpose: the canvas draws from these shapes and the server
 * stores them, so neither has to translate the other. Nothing here reaches a
 * database or the exchange.
 */

export type TradeFlowRunStatus = "running" | "stopped"

/**
 * Everything a switched-on flow works from, frozen the moment it started.
 *
 * **Frozen is the point.** A flow can be redrawn while it is trading, and what
 * is already in the market must not change underneath somebody. Every field
 * here is copied at the moment of the switch and never read from the drawing
 * again; changing a running flow means switching it off and on.
 */
/**
 * How a switched-on flow decides what to buy, frozen with everything else.
 *
 * **One of two, never both.** A ladder waits for price to fall into a plan it
 * drew from a base; signals wait for an indicator to say so. A flow drawn with
 * both strategy steps is refused before it starts, in words, rather than left
 * to work out which one it meant with money on the line.
 */
export type TradeFlowStrategy =
  | {
      kind: "dca"
      /** The ladder settings, exactly as the DCA step held them. */
      params: DcaParams
      /** The candle size the ladder's own rules are measured on. */
      interval: CandleInterval
    }
  | {
      kind: "signals"
      /** Which indicators call the trades, and what each is set to. */
      indicators: IndicatorSettings
      /** The candle size the arrows are read on. */
      interval: CandleInterval
      /** What one buy signal spends, as a share of the cap. */
      stakePct: number
      /** How far a buy may follow a price that runs, as a share of it. */
      chaseGiveUp: number
    }

export type TradeFlowRunSpec = {
  /** The exchange and network every coin on the list belongs to. */
  protocol: ProtocolId
  network: NetworkId
  /** The coins this flow watches, as full market keys. */
  marketKeys: string[]
  /** What it does about them. */
  strategy: TradeFlowStrategy
  /** The most of the wallet this flow may spend, in dollars. */
  capUsd: number
  /** What the wallet was called when it started, for a sentence afterwards. */
  walletLabel: string
  /** True when this is real money. */
  real: boolean
}

/** One switched-on flow as a screen sees it. */
export type TradeFlowRunRow = {
  id: string
  automationId: string
  walletId: string
  status: TradeFlowRunStatus
  spec: TradeFlowRunSpec
  startedAt: number
  stoppedAt: number | null
  stoppedReason: string | null
  /** How many of its coins have a ladder working right now. */
  working: number
}

/**
 * What stopping a flow did, said the way it will be read.
 *
 * **Two numbers, never one.** Waiting rungs are called off; coins already held
 * are left exactly as they are, stops and targets untouched. Rolling those into
 * a single "stopped" would hide the half that matters — somebody switching a
 * flow off needs to know money is still in the market.
 */
export type FlowStopOutcome = {
  /** Coins called off before they bought anything. */
  cancelled: number
  /** Coins still held, whose stops and targets were left alone. */
  held: number
}

export function describeFlowStop(outcome: FlowStopOutcome): string {
  const parts: string[] = []
  if (outcome.cancelled > 0) {
    // "Coin" rather than "ladder", because a flow's strategy is now either a
    // ladder or a signal trade and the sentence has to be true of both. What
    // was called off is the same thing in each case: a coin that had asked for
    // a price and not got one.
    parts.push(
      `${outcome.cancelled} ${outcome.cancelled === 1 ? "coin" : "coins"} called off before buying anything`
    )
  }
  if (outcome.held > 0) {
    parts.push(
      `${outcome.held} ${outcome.held === 1 ? "coin" : "coins"} still held — their stops and targets are untouched`
    )
  }
  if (parts.length === 0) return "Stopped. Nothing was in the market."
  return `Stopped: ${parts.join(", ")}.`
}
