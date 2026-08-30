import { GridIcon } from "lucide-react"
import { z } from "zod"

import { defineNode } from "@/lib/automations/node-descriptor"
import { TRADE_PALETTE_GROUP } from "@/lib/automations/nodes/trade-wallet"
import {
  DEFAULT_GRID_STOP_UNDER_PCT,
  defaultGridParams,
  gridParamsSchema,
} from "@/lib/trade/grid"

export const EMA_GRID_CANDLE_HOURS = 4
export const DEFAULT_EMA_GRID_CLEAN_HOURS = 72
export const DEFAULT_EMA_GRID_PERIOD = 200
export const MIN_EMA_GRID_CLEAN_HOURS = EMA_GRID_CANDLE_HOURS
export const MAX_EMA_GRID_CLEAN_HOURS = 14 * 24

const HOURS_PER_DAY = 24

function isWholeEmaGridCandle(days: number): boolean {
  const candles = (days * HOURS_PER_DAY) / EMA_GRID_CANDLE_HOURS
  return Math.abs(candles - Math.round(candles)) < 1e-9
}

const tradeGridParamsSchema = gridParamsSchema
  .pick({
    levels: true,
    rangePct: true,
    potPct: true,
    leverage: true,
    spacing: true,
    manualSizing: true,
    manualRungPcts: true,
    follow: true,
    followDown: true,
  })
  .extend({
    stopLoss: gridParamsSchema.shape.stopLoss.unwrap().pick({ underPct: true }),
  })

export const tradeGridSettingsSchema = z.object({
  days: z
    .number()
    .min(MIN_EMA_GRID_CLEAN_HOURS / HOURS_PER_DAY)
    .max(MAX_EMA_GRID_CLEAN_HOURS / HOURS_PER_DAY)
    .refine(isWholeEmaGridCandle, "Use whole 4-hour candles."),
  emaPeriod: z.number().int().min(1).max(1_000),
  grid: tradeGridParamsSchema,
})

export type TradeGridSettings = z.infer<typeof tradeGridSettingsSchema>

/** The crossing wait shown on screen, converted from the saved day fraction. */
export function emaGridCleanHours(
  settings: Pick<TradeGridSettings, "days">
): number {
  return Math.round(settings.days * HOURS_PER_DAY)
}

/** The number of closed four-hour candles the crossing wait requires. */
export function emaGridCleanBars(
  settings: Pick<TradeGridSettings, "days">
): number {
  return emaGridCleanHours(settings) / EMA_GRID_CANDLE_HOURS
}

/** Saves a screen value without changing the existing flow-settings shape. */
export function emaGridDaysForCleanHours(hours: number): number {
  return hours / HOURS_PER_DAY
}

export function defaultTradeGridSettings(): TradeGridSettings {
  const defaults = defaultGridParams()
  return {
    days: emaGridDaysForCleanHours(DEFAULT_EMA_GRID_CLEAN_HOURS),
    emaPeriod: DEFAULT_EMA_GRID_PERIOD,
    grid: {
      levels: defaults.levels,
      rangePct: defaults.rangePct,
      potPct: defaults.potPct,
      leverage: defaults.leverage,
      spacing: defaults.spacing,
      manualSizing: defaults.manualSizing,
      manualRungPcts: defaults.manualRungPcts,
      follow: defaults.follow,
      followDown: defaults.followDown,
      stopLoss: {
        underPct: defaults.stopLoss?.underPct ?? DEFAULT_GRID_STOP_UNDER_PCT,
      },
    },
  }
}

/** A grid whose direction follows a clean run above or below the four-hour EMA. */
export const tradeGridNode = defineNode({
  kind: "tradeGrid",
  palette: {
    key: "trade-grid",
    group: TRADE_PALETTE_GROUP,
    description: "Run a grid on the clean side of the 4h EMA",
  },
  createSettings: defaultTradeGridSettings,
  settingsSchema: tradeGridSettingsSchema,
  name: () => "Grid",
  description: (settings) => {
    const parsed = tradeGridSettingsSchema.safeParse(settings)
    if (!parsed.success) return "A grid that follows the 4h EMA."
    const hours = emaGridCleanHours(parsed.data)
    return `${hours} clean ${hours === 1 ? "hour" : "hours"} on the 4h EMA ${parsed.data.emaPeriod}, ${parsed.data.grid.levels} levels using ${parsed.data.grid.potPct}% of the wallet.`
  },
  icon: GridIcon,
  outputPorts: [],
  hasInput: true,
  connectionError: () => null,
  fields: () => import("@/components/automations/nodes/trade-grid-panel"),
})
