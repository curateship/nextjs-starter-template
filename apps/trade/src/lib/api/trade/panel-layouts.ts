import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { KNOWN_PROTOCOLS } from "@/lib/protocols/contracts"
import { ALL_ROW } from "@/lib/trade/market-folders"
import type {
  ChartToolbarPosition,
  JournalView,
  MarketPanelScope,
} from "@/lib/trade/panel-layout"
import { TRADE_MAKERS } from "@/lib/trade/trade-maker"
import {
  TRADES_POPOVER_KINDS,
  type HiddenTradeColumns,
  type TradesPopoverKind,
} from "@/lib/trade/trades-popover-columns"
import { userGet, userPost } from "@/server/guards"
import {
  loadTradePanelLayouts,
  saveHiddenTradeColumns as saveHiddenTradeColumnsForUser,
  saveChartToolbarPosition as saveChartToolbarPositionForUser,
  saveOpenMarketRow as saveOpenMarketRowForUser,
  saveJournalView as saveJournalViewForUser,
} from "@/server/trade/prefs"

import { createErrorMessage } from "../error-message"

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

export function saveOpenMarketRow(
  scope: MarketPanelScope,
  openMarketRowId: string | null
) {
  return saveOpenMarketRowFn({ data: { ...scope, openMarketRowId } })
}

const saveHiddenTradeColumnsFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(
    z.object({
      kind: z.enum(TRADES_POPOVER_KINDS),
      columns: z.array(z.string().min(1).max(20)).max(10),
    })
  )
  .handler(async ({ data, context }): Promise<{ saved: true }> => {
    await saveHiddenTradeColumnsForUser(context.user.id, data.kind, data.columns)
    return { saved: true }
  })

export function saveHiddenTradeColumns(kind: TradesPopoverKind, columns: readonly string[]) {
  return saveHiddenTradeColumnsFn({ data: { kind, columns: [...columns] } })
}

/**
 * Every table's hidden columns, for a place outside the Trade dashboard that
 * has not loaded the account's panel choices, such as the header's Active
 * trades button.
 */
const loadHiddenTradeColumnsFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(async ({ context }): Promise<HiddenTradeColumns> => {
    const layouts = await loadTradePanelLayouts(context.user.id)
    return layouts.hiddenTradeColumns
  })

export function loadHiddenTradeColumns() {
  return loadHiddenTradeColumnsFn()
}

const saveJournalViewFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(
    z.object({
      hidePractice: z.boolean(),
      makers: z.array(z.enum(TRADE_MAKERS)).max(TRADE_MAKERS.length),
    })
  )
  .handler(async ({ data, context }): Promise<{ saved: true }> => {
    await saveJournalViewForUser(context.user.id, data)
    return { saved: true }
  })

export function saveJournalView(view: JournalView) {
  return saveJournalViewFn({ data: { hidePractice: view.hidePractice, makers: [...view.makers] } })
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
