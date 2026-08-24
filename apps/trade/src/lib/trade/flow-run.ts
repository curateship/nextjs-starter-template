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

export type TradeFlowRunStatus = "running" | "stopping" | "stopped"

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
 * Stop returns after saving the work for the engine. The answer says how much
 * remains and how many coins are already held, whose protection stays intact.
 */
export type FlowStopOutcome = {
  /** Coins still held, whose stops and targets were left alone. */
  held: number
  /** Waiting ladders the engine is still calling off. */
  remaining: number
}

export function describeFlowStop(outcome: FlowStopOutcome): string {
  if (outcome.remaining > 0) {
    return `Stopping: ${outcome.remaining} ${outcome.remaining === 1 ? "ladder" : "ladders"} left to call off.`
  }
  if (outcome.held > 0) {
    return `Stopped: ${outcome.held} ${outcome.held === 1 ? "coin is" : "coins are"} still held — their stops and targets are untouched.`
  }
  return "Stopped. Nothing was in the market."
}
