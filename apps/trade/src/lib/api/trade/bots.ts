import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import type { WidgetLayout } from "@/lib/admin-dashboard/overview-widgets"
import { BOTS_PAGE_LOCKED, BOTS_PAGE_TOO_LONG } from "@/lib/bots/bots-page"
import { BOTS_VIEWS, type BotsView } from "@/lib/bots/bots-search"
import { BOTS_WIDGET_IDS } from "@/lib/bots/bots-widgets"
import { PAGE_MAX_LENGTH, type StoredPage } from "@/lib/notes/page-body"
import { coverImagesSchema, coverSchema } from "@/lib/notes/page-cover"
import type { TradingOverviewBot } from "@/lib/trade/dashboard/overview"
import { adminGet, adminPost } from "@/server/guards"
import {
  loadBotsOverview,
  loadBotsSectionCounts,
  loadBotsSections as loadSections,
  saveBotsHiddenSections,
  saveBotsSectionOrder,
  loadBotsWidgets,
  saveBotsWidgets,
  type BotsSectionCounts,
} from "@/server/trade/bots-dashboard"
import {
  getBotsPage,
  saveBotsPageBody,
  setBotsPageCover,
  setBotsPageLock,
} from "@/server/trade/bots-page"
import { workspaceIdForRequest } from "@/server/workspaces/for-request"

import { createErrorMessage } from "../error-message"

/**
 * The Bots dashboard (9 Nov 2026): its left page, the counts beside the
 * Dashboards block's rows, and its Overview. Admins only, as the whole
 * dashboard is (Tyler: "Admins only"). The page and the Overview are each
 * admin's own; the recipe count is the workspace's.
 */

const loadPageFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(({ context }): Promise<StoredPage> => getBotsPage(context.user.id))

const savePageFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ body: z.string().max(PAGE_MAX_LENGTH) }))
  .handler(({ context, data }) => saveBotsPageBody(context.user.id, data.body))

const lockPageFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ locked: z.boolean() }))
  .handler(({ context, data }) => setBotsPageLock(context.user.id, data.locked))

const coverPageFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ coverUrl: coverSchema, coverImages: coverImagesSchema }))
  .handler(({ context, data }) =>
    setBotsPageCover(context.user.id, { coverUrl: data.coverUrl || null, coverImages: data.coverImages })
  )

const loadCountsFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(
    async ({ context }): Promise<BotsSectionCounts> =>
      loadBotsSectionCounts(await workspaceIdForRequest(context.user.id), context.user.id)
  )

const loadOverviewFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(async ({ context }): Promise<{ bots: TradingOverviewBot[]; layout: WidgetLayout }> => {
    const [overview, layout] = await Promise.all([
      loadBotsOverview(context.user.id),
      loadBotsWidgets(context.user.id),
    ])
    return { ...overview, layout }
  })

const loadLayoutFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(({ context }) => loadBotsWidgets(context.user.id))

const spot = z.enum(BOTS_WIDGET_IDS as [string, ...string[]]).nullable()
const row = z.object({ columns: z.number().int().min(0).max(4), spots: z.array(spot).max(4) })

const saveLayoutFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ top: row, bottom: row }))
  .handler(({ context, data }) => saveBotsWidgets(context.user.id, data))

export function loadBotsPage() {
  return loadPageFn()
}
export function saveBotsPage(body: string) {
  return savePageFn({ data: { body } })
}
export function lockBotsPage(locked: boolean) {
  return lockPageFn({ data: { locked } })
}
export function setBotsPageCoverPhoto(cover: { coverUrl: string | null; coverImages: string[] }) {
  return coverPageFn({ data: cover })
}
export function loadBotsCounts() {
  return loadCountsFn()
}
/** The Overview's figures and its layout, together. */
export function loadBotsOverviewPage() {
  return loadOverviewFn()
}
/** The layout alone, for the left page's Widgets tab and Overview's count. */
export function loadBotsWidgetLayout() {
  return loadLayoutFn()
}
export function saveBotsWidgetLayout(layout: WidgetLayout) {
  return saveLayoutFn({ data: layout })
}

const loadSectionsFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(({ context }) => loadSections(context.user.id))

const section = z.enum(BOTS_VIEWS)

const saveHiddenSectionsFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ hidden: z.array(section).max(BOTS_VIEWS.length) }))
  .handler(({ context, data }) => saveBotsHiddenSections(context.user.id, data.hidden))

const saveSectionOrderFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ order: z.array(section).max(BOTS_VIEWS.length) }))
  .handler(({ context, data }) => saveBotsSectionOrder(context.user.id, data.order))

/** The Dashboards block's hidden sections and order, this admin's own. */
export function loadBotsSections() {
  return loadSectionsFn()
}
export function saveBotsHiddenSectionList(hidden: readonly BotsView[]) {
  return saveHiddenSectionsFn({ data: { hidden: [...hidden] } })
}
export function saveBotsSectionOrderList(order: readonly BotsView[]) {
  return saveSectionOrderFn({ data: { order: [...order] } })
}

export const getBotsErrorMessage = createErrorMessage(
  { [BOTS_PAGE_LOCKED]: BOTS_PAGE_LOCKED, [BOTS_PAGE_TOO_LONG]: BOTS_PAGE_TOO_LONG },
  "The Bots dashboard could not be loaded. Try again."
)
export type { BotsSectionCounts }
