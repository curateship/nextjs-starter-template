import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { KNOWN_PROTOCOLS } from "@/lib/protocols/contracts"
import { ALL_ROW } from "@/lib/trade/market-folders"
import { TRADE_PANEL_LAYOUT_KEYS } from "@/lib/trade/panel-keys"
import type {
  ChartToolbarPosition,
  MarketPanelScope,
  TradePanelLayouts,
} from "@/lib/trade/panel-layout"
import { userPost } from "@/server/guards"
import {
  importLegacyTradePanelLayouts,
  saveChartToolbarPosition as saveChartToolbarPositionForUser,
  saveOpenMarketRow as saveOpenMarketRowForUser,
  saveTradePanelLayout,
} from "@/server/trade/prefs"

import { createErrorMessage } from "../error-message"

const layoutKeySchema = z.enum(TRADE_PANEL_LAYOUT_KEYS)
const layoutSchema = z
  .record(z.string().min(1).max(40), z.number().finite().min(0).max(100))
  .refine((layout) => Object.keys(layout).length <= 3)
const openMarketRowIdSchema = z
  .union([z.literal(ALL_ROW), z.string().uuid()])
  .nullable()
const marketPanelScopeSchema = z.object({
  protocol: z.enum(KNOWN_PROTOCOLS),
  network: z.enum(["mainnet", "testnet"]),
})
const chartToolbarPositionSchema = z
  .object({
    x: z.number().finite().min(0).max(1),
    y: z.number().finite().min(0).max(1),
  })
  .nullable()

const savePanelLayoutFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ key: layoutKeySchema, layout: layoutSchema }))
  .handler(async ({ data, context }): Promise<{ saved: true }> => {
    await saveTradePanelLayout(context.user.id, data.key, data.layout)
    return { saved: true }
  })

const importLegacyPanelLayoutsFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(
    z.object({ current: z.partialRecord(layoutKeySchema, layoutSchema) })
  )
  .handler(async ({ data, context }): Promise<TradePanelLayouts> => {
    return importLegacyTradePanelLayouts(context.user.id, data.current)
  })

const saveOpenMarketRowFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(
    marketPanelScopeSchema.extend({ openMarketRowId: openMarketRowIdSchema })
  )
  .handler(async ({ data, context }): Promise<{ saved: true }> => {
    await saveOpenMarketRowForUser(context.user.id, data, data.openMarketRowId)
    return { saved: true }
  })

const saveChartToolbarPositionFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ position: chartToolbarPositionSchema }))
  .handler(async ({ data, context }): Promise<{ saved: true }> => {
    await saveChartToolbarPositionForUser(context.user.id, data.position)
    return { saved: true }
  })

export function savePanelLayout(
  key: (typeof TRADE_PANEL_LAYOUT_KEYS)[number],
  layout: Record<string, number>
) {
  return savePanelLayoutFn({ data: { key, layout } })
}

export function importLegacyPanelLayouts(
  current: TradePanelLayouts["current"]
) {
  return importLegacyPanelLayoutsFn({ data: { current } })
}

export function saveOpenMarketRow(
  scope: MarketPanelScope,
  openMarketRowId: string | null
) {
  return saveOpenMarketRowFn({ data: { ...scope, openMarketRowId } })
}

export function saveChartToolbarPosition(
  position: ChartToolbarPosition | null
) {
  return saveChartToolbarPositionFn({ data: { position } })
}

export const getPanelLayoutErrorMessage = createErrorMessage(
  {
    PANEL_LAYOUT_INVALID: "That panel arrangement could not be saved.",
  },
  "The panel arrangement could not be saved. Try again."
)
