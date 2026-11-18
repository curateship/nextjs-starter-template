import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import type { WidgetLayout } from "@/lib/admin-dashboard/overview-widgets"
import { LISTINGS_PAGE_ERRORS } from "@/lib/directory/listings-dashboard-page"
import { LISTINGS_LIST_SECTIONS } from "@/lib/directory/listings-dashboard-search"
import { PAGE_MAX_LENGTH } from "@/lib/notes/page-body"
import { coverImagesSchema, coverSchema } from "@/lib/notes/page-cover"
import {
  getListingsPage,
  getListingsWidgets,
  listingRecordFacts,
  listingSends,
  listingsOverview,
  listingsSectionCounts,
  needsYou,
  saveListingsPageBody,
  saveListingsSections,
  saveListingsWidgets,
  setListingsPageCover,
  setListingsPageLock,
  type ListingRecordFacts,
  type ListingsOverview,
  type ListingsSectionCounts,
  type ListingsSections,
  type NeedsYouRow,
} from "@/server/directory/listings-dashboard"
import { adminGet, adminPost } from "@/server/guards"
import { workspaceIdForRequest } from "@/server/workspaces/for-request"

import { createErrorMessage } from "../error-message"

export type { ListingRecordFacts, ListingsOverview, ListingsSectionCounts, ListingsSections, NeedsYouRow }

/**
 * The Listings dashboard's own records (Tyler, 18 Nov 2026): the site's
 * left page, its Dashboards block's rows, Overview's layout and figures,
 * every row's count and what needs an admin. Every one is admin only and the
 * site's own. Each row's records come from its own API file, as before.
 */

export const getListingsDashboardErrorMessage = createErrorMessage(
  {
    [LISTINGS_PAGE_ERRORS.tooLong]: LISTINGS_PAGE_ERRORS.tooLong,
    [LISTINGS_PAGE_ERRORS.locked]: LISTINGS_PAGE_ERRORS.locked,
  },
  "That did not work. Please try again."
)

const loadPageFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(async ({ context }) => getListingsPage(await workspaceIdForRequest(context.user.id)))

const loadCountsFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(async ({ context }): Promise<{ counts: ListingsSectionCounts; needs: { rows: NeedsYouRow[]; total: number } }> => {
    const site = await workspaceIdForRequest(context.user.id)
    const counts = await listingsSectionCounts(site)
    return { counts, needs: await needsYou(site, undefined, counts) }
  })

const sectionSchema = z
  .array(z.enum(LISTINGS_LIST_SECTIONS as [string, ...string[]]))
  .max(LISTINGS_LIST_SECTIONS.length)

const saveSectionsFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ hidden: sectionSchema, order: sectionSchema }))
  .handler(async ({ data, context }) =>
    saveListingsSections(await workspaceIdForRequest(context.user.id), data as ListingsSections)
  )

const savePageFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ body: z.string().max(PAGE_MAX_LENGTH) }))
  .handler(async ({ data, context }) => saveListingsPageBody(await workspaceIdForRequest(context.user.id), data.body))

const lockPageFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ locked: z.boolean() }))
  .handler(async ({ data, context }) => setListingsPageLock(await workspaceIdForRequest(context.user.id), data.locked))

const coverFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  // Checked by the shared cover rules (`src/lib/notes/page-cover.ts`).
  .inputValidator(z.object({ coverUrl: coverSchema, coverImages: coverImagesSchema }))
  .handler(async ({ data, context }) =>
    setListingsPageCover(await workspaceIdForRequest(context.user.id), {
      coverUrl: data.coverUrl || null,
      coverImages: data.coverImages,
    })
  )

const rowSchema = z.object({
  columns: z.number().int().min(0).max(4),
  spots: z.array(z.string().max(80).nullable()).max(4),
})

const loadWidgetsFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(async ({ context }): Promise<WidgetLayout> => getListingsWidgets(await workspaceIdForRequest(context.user.id)))

const saveWidgetsFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ top: rowSchema, bottom: rowSchema }))
  .handler(
    async ({ data, context }): Promise<WidgetLayout> =>
      saveListingsWidgets(await workspaceIdForRequest(context.user.id), data)
  )

const overviewFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(async ({ context }): Promise<ListingsOverview> => listingsOverview(await workspaceIdForRequest(context.user.id)))

/** The left page, the Dashboards block's rows, every row's count and what needs you. */
export function loadListingsDashboardPage() {
  return loadPageFn()
}
/** The counts and Needs you again, after something changed one of them. */
export function loadListingsCounts() {
  return loadCountsFn()
}
export function saveListingsDashboardSections(sections: ListingsSections) {
  return saveSectionsFn({ data: sections })
}
export function saveListingsDashboardPage(body: string) {
  return savePageFn({ data: { body } })
}
export function lockListingsDashboardPage(locked: boolean) {
  return lockPageFn({ data: { locked } })
}
export function setListingsDashboardCover(cover: { coverUrl: string | null; coverImages: string[] }) {
  return coverFn({ data: cover })
}
export function loadListingsWidgets() {
  return loadWidgetsFn()
}
export function saveListingsWidgetLayout(layout: WidgetLayout) {
  return saveWidgetsFn({ data: layout })
}
/** Overview's figures: featured income, placements running, plans offered, most saved and send history. */
export function loadListingsOverview() {
  return overviewFn()
}

const factsFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(z.object({ id: z.string().min(1).max(36) }))
  .handler(
    async ({ data, context }): Promise<ListingRecordFacts> =>
      listingRecordFacts(await workspaceIdForRequest(context.user.id), data.id)
  )

/** The listing record's claim, reports, saves, views, guides, events and deals. */
export function loadListingRecordFacts(id: string) {
  return factsFn({ data: { id } })
}

const sendsFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(z.object({ id: z.string().min(1).max(36) }))
  .handler(async ({ data, context }) => listingSends(await workspaceIdForRequest(context.user.id), data.id))

/** Every claim invitation sent about one listing, newest first. */
export function loadListingSends(listingId: string) {
  return sendsFn({ data: { id: listingId } })
}
