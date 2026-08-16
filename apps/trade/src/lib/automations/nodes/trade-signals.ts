import { ActivityIcon } from "lucide-react"
import { z } from "zod"

import { defineNode } from "@/lib/automations/node-descriptor"
import { TRADE_PALETTE_GROUP } from "@/lib/automations/nodes/trade-wallet"
import { DEFAULT_BACKTEST_INTERVAL } from "@/lib/automations/nodes/trade-dca"
import { CANDLE_INTERVALS } from "@/lib/protocols/contracts"
import { plural } from "@/lib/format/plural"
import {
  SIGNAL_INDICATORS,
  defaultIndicatorSettings,
  indicatorSettingsSchema,
  signalIndicatorsOn,
  type IndicatorSettings,
} from "@/lib/trade/indicators/registry"

/**
 * How much of the pot goes into one coin when an arrow says buy.
 *
 * A fifth, so a flow can be in five coins at once before it runs out. Not the
 * whole pot: an arrow is one indicator's opinion about one coin, and betting
 * everything on the first one to speak is not a strategy.
 */
export const DEFAULT_SIGNAL_STAKE_PCT = 20

/**
 * How far the chase may follow a price that runs away, in percent.
 *
 * **Zero is a real answer and the strictest one**: buy at the arrow's price or
 * better, and drop the arrow the moment price rises above it. Not "wait
 * forever for price to come back" — an order left resting indefinitely holds
 * cash for a fill that may never arrive. One percent follows a normal drift
 * without following a breakout.
 */
export const DEFAULT_SIGNAL_CHASE_PCT = 1

/** The most the chase may be allowed to follow. Past this it is not a chase. */
export const MAX_SIGNAL_CHASE_PCT = 20

export const tradeSignalsSettingsSchema = z.object({
  /**
   * Which indicators call the trades, and what each of them is set to.
   *
   * **The step's own copy, and that is the point.** It reads through the same
   * `indicatorSettingsSchema` the chart's menu saves through, so a number this
   * app will not accept on a chart is not accepted here either — but the values
   * are this flow's. Nudging the chart is how you explore; a saved flow that
   * quietly changed when you did could not be compared with the run before it.
   * The DCA step keeps its `baseDetection` for exactly this reason.
   */
  indicators: indicatorSettingsSchema,
  /** The candle size the arrows are read on. */
  interval: z.enum(CANDLE_INTERVALS),
  /** How much of the pot goes into each coin, as a percent of it. */
  stakePct: z.number().min(0.1).max(100),
  /**
   * How far above the arrow's price a buy chase may follow before giving up.
   *
   * Only ever a buy. A sell chase does not give up and has no setting: being
   * half out of a position is worse than any price it would have got.
   */
  chaseGiveUpPct: z.number().min(0).max(MAX_SIGNAL_CHASE_PCT),
})

export type TradeSignalsSettings = z.infer<typeof tradeSignalsSettingsSchema>

/**
 * Every indicator that can call a trade, switched on and at its own defaults.
 *
 * A step that started with everything off would be a step that does nothing,
 * drawn on a canvas looking like it does something.
 */
export function defaultSignalIndicators(): IndicatorSettings {
  const settings = defaultIndicatorSettings()
  for (const module of SIGNAL_INDICATORS) {
    settings[module.kind] = { ...settings[module.kind], on: true }
  }
  return settings
}

/**
 * Trade what the indicators say, and the last step of a flow.
 *
 * The other way a flow can trade, beside the DCA ladder — and a flow has one or
 * the other, never both. Where the ladder waits for price to fall into a plan,
 * this waits for an arrow: a confirmed base buys, a confirmed ceiling sells the
 * whole position.
 *
 * **Nothing here sends a market order.** An arrow fires a trigger, and the
 * trigger places a limit order that is re-placed as price moves until it fills
 * or the chase gives up. That costs a little more waiting and saves the
 * slippage and the higher fee on every single trade, in both directions.
 */
export const tradeSignalsNode = defineNode({
  kind: "tradeSignals",
  palette: {
    key: "trade-signals",
    group: TRADE_PALETTE_GROUP,
    description: "Buy and sell on what the indicators say",
  },
  createSettings: () => ({
    indicators: defaultSignalIndicators(),
    interval: DEFAULT_BACKTEST_INTERVAL,
    stakePct: DEFAULT_SIGNAL_STAKE_PCT,
    chaseGiveUpPct: DEFAULT_SIGNAL_CHASE_PCT,
  }),
  settingsSchema: tradeSignalsSettingsSchema,
  name: () => "Signals",
  description: (settings) => {
    const parsed = tradeSignalsSettingsSchema.safeParse(settings)
    if (!parsed.success) return "Trades on what the indicators say."
    const on = signalIndicatorsOn(parsed.data.indicators)
    if (on === 0) {
      return "No indicators switched on, so this will never buy anything."
    }
    return `${on} ${plural(on, "indicator", "indicators")} on ${parsed.data.interval} candles, up to ${parsed.data.stakePct}% of the pot per coin.`
  },
  icon: ActivityIcon,
  // Nothing follows a strategy. The flow either runs a backtest or is switched
  // on to trade, and both are the end of it — drawing a "then" would promise a
  // step that could never happen.
  outputPorts: [],
  hasInput: true,
  connectionError: () => null,
  fields: () => import("@/components/automations/nodes/trade-signals-panel"),
})
