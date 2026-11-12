import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { DASHBOARD_PROTOCOLS, type ProtocolId } from "@/lib/protocols/contracts"
import {
  HIDEABLE_COLUMNS,
  TRADE_TABLE_BLOCKS,
  type HiddenBlockColumns,
} from "@/lib/trade/block-columns"
import { isDashboardView, type DashboardView } from "@/lib/trade/dashboard-view"
import { userGet, userPost } from "@/server/guards"
import {
  loadHiddenBlockColumns,
  saveHiddenBlockColumns,
} from "@/server/trade/block-columns"
import {
  loadTradeDashboardStart,
  saveHiddenProtocols,
  saveProtocolOrder,
  saveHideEmptyBlocks,
  saveTradeDashboardView,
} from "@/server/trade/prefs"
import { loadOpenPositionCounts } from "@/server/trade/trading-overview"

import { createErrorMessage } from "../error-message"

/**
 * The Trade dashboard's own reads and saves (8 Nov 2026): where a bare
 * `/trade` opens, the row picked, the exchanges hidden from the Protocols
 * block, and the open positions each exchange's row counts. Every one is the
 * signed-in person's own; a member gets the same as an admin, for their own
 * money ("Everyone, own money").
 */

const loadStartFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(({ context }) => loadTradeDashboardStart(context.user.id))

export function loadTradeDashboardStartRead() {
  return loadStartFn()
}

const viewSchema = z.object({
  view: z.string().refine(isDashboardView, "Not a row of the Protocols block"),
})

const saveViewFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(viewSchema)
  .handler(({ context, data }) =>
    saveTradeDashboardView(context.user.id, data.view as DashboardView)
  )

/** Remembers the row just picked, so a bare `/trade` opens on it next time. */
export function saveDashboardView(view: DashboardView) {
  return saveViewFn({ data: { view } })
}

const hiddenSchema = z.object({
  hidden: z.array(z.enum(DASHBOARD_PROTOCOLS as [ProtocolId, ...ProtocolId[]])).max(DASHBOARD_PROTOCOLS.length),
})

const saveHiddenFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(hiddenSchema)
  .handler(({ context, data }) => saveHiddenProtocols(context.user.id, data.hidden))

/** The exchanges hidden from the Protocols block, answered as stored. */
export function saveHiddenDashboardProtocols(hidden: readonly ProtocolId[]) {
  return saveHiddenFn({ data: { hidden: [...hidden] } })
}

const orderSchema = z.object({
  order: z.array(z.enum(DASHBOARD_PROTOCOLS as [ProtocolId, ...ProtocolId[]])).max(DASHBOARD_PROTOCOLS.length),
})

const saveOrderFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(orderSchema)
  .handler(({ context, data }) => saveProtocolOrder(context.user.id, data.order))

/** The Protocols block's order, dragged in its ⋮, answered as stored. */
export function saveDashboardProtocolOrder(order: readonly ProtocolId[]) {
  return saveOrderFn({ data: { order: [...order] } })
}

const saveHideEmptyFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ hide: z.boolean() }))
  .handler(({ context, data }) => saveHideEmptyBlocks(context.user.id, data.hide))

/** Switches "Hide empty blocks" for the signed-in person, answered as stored. */
export function saveHideEmptyDashboardBlocks(hide: boolean) {
  return saveHideEmptyFn({ data: { hide } })
}

const loadColumnsFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(({ context }) => loadHiddenBlockColumns(context.user.id))

/** The columns each trade block hides for the signed-in person. */
export function loadHiddenTradeBlockColumns() {
  return loadColumnsFn()
}

const columnList = z.array(z.enum(HIDEABLE_COLUMNS)).max(HIDEABLE_COLUMNS.length)
const columnsSchema = z.object({
  hidden: z.object(
    Object.fromEntries(TRADE_TABLE_BLOCKS.map((block) => [block, columnList.optional()])) as Record<
      (typeof TRADE_TABLE_BLOCKS)[number],
      z.ZodOptional<typeof columnList>
    >
  ),
})

const saveColumnsFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(columnsSchema)
  .handler(({ context, data }) => saveHiddenBlockColumns(context.user.id, data.hidden))

/** Every trade block's hidden columns, answered as stored. */
export function saveHiddenTradeBlockColumns(hidden: HiddenBlockColumns) {
  return saveColumnsFn({ data: { hidden } })
}

/**
 * How many trades are open on each exchange, for the number on its row
 * (Tyler, 8 Nov 2026: "Open positions"). An exchange left out had a wallet
 * that did not answer, so its row shows no number.
 */
export type ProtocolPositionCounts = Partial<Record<ProtocolId, number>>

const loadCountsFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(({ context }): Promise<ProtocolPositionCounts> => loadOpenPositionCounts(context.user.id))

export function loadProtocolPositionCounts() {
  return loadCountsFn()
}

export const getTradeDashboardErrorMessage = createErrorMessage(
  {},
  "The Trade dashboard could not save that. Try again."
)
