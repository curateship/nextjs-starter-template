import { LayersIcon } from "lucide-react"
import { z } from "zod"

import { CANDLE_INTERVALS } from "@/lib/protocols/contracts"
import { defineNode } from "@/lib/automations/node-descriptor"
import { TRADE_PALETTE_GROUP } from "@/lib/automations/nodes/trade-wallet"
import { dcaParamsSchema, defaultDcaParams } from "@/lib/trade/dca"
import { plural } from "@/lib/format/plural"

/**
 * The candle size a backtest walks. 4h unless it is changed — the frame the
 * base rule was measured on, and the one the chart opens with.
 */
export const DEFAULT_BACKTEST_INTERVAL = "4h"

export const tradeDcaSettingsSchema = z.object({
  /**
   * Exactly what the right-click window asks for, unchanged. Not a copy of the
   * fields: the same schema, so a rule that refuses a ladder on the chart
   * refuses it here for the same reason and in the same words.
   */
  params: dcaParamsSchema,
  interval: z.enum(CANDLE_INTERVALS),
})

export type TradeDcaSettings = z.infer<typeof tradeDcaSettingsSchema>

/**
 * The ladder to test, and the last step of a backtest flow.
 *
 * Reaching this step is what starts the run. The two steps above it hold the
 * money and the coins; this one holds the strategy, so nothing before it can
 * start anything and there is never a half-described test in flight.
 *
 * The settings are the right-click window's own, plus the candle size. That is
 * deliberate and it is the whole reason this build is worth having: the tested
 * ladder and the one you place by hand read the same numbers through the same
 * code, so they cannot drift apart into two strategies with one name.
 */
export const tradeDcaNode = defineNode({
  kind: "tradeDca",
  palette: {
    key: "trade-dca",
    group: TRADE_PALETTE_GROUP,
    description: "The DCA ladder to test, and press Run",
  },
  createSettings: () => ({
    params: defaultDcaParams(),
    interval: DEFAULT_BACKTEST_INTERVAL,
  }),
  settingsSchema: tradeDcaSettingsSchema,
  name: () => "DCA ladder",
  description: (settings) => {
    const parsed = tradeDcaSettingsSchema.safeParse(settings)
    if (!parsed.success) return "A DCA ladder to test against history."
    const rungs = parsed.data.params.rungs.length
    const line = `${rungs} ${plural(rungs, "rung", "rungs")} on ${parsed.data.interval} candles, up to ${parsed.data.params.maxPositionPct}% of the pot per coin.`
    // Borrowing changes what every other number on this card means, so it is
    // said on the card rather than left inside the panel. A ladder that can be
    // sold out from under itself is not the same ladder.
    const { leverage } = parsed.data.params
    return leverage > 1 ? `${line} Borrows ${leverage}×.` : line
  },
  icon: LayersIcon,
  // Nothing follows a backtest. The run is the end of the flow, so drawing a
  // "then" out of it would promise a step that could never happen.
  outputPorts: [],
  hasInput: true,
  connectionError: () => null,
  fields: () => import("@/components/automations/nodes/trade-dca-panel"),
})
