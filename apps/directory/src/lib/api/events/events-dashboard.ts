import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import type { WidgetLayout } from "@/lib/admin-dashboard/overview-widgets"
import { EVENTS_PAGE_ERRORS } from "@/lib/events/events-dashboard-page"
import { EVENTS_LIST_SECTIONS, FEATURED_FILTERS, SIGN_UP_FILTERS } from "@/lib/events/events-dashboard-search"
import { PAGE_MAX_LENGTH } from "@/lib/notes/page-body"
import { coverImagesSchema, coverSchema } from "@/lib/notes/page-cover"
import { revokeFeaturedEntitlement } from "@/server/directory/featured"
import { updateEvent } from "@/server/events/events"
import {
  eventsOverview,
  eventsSectionCounts,
  featuredEvents,
  getEventsPage,
  getEventsWidgets,
  listAllSignUps,
  comingUp,
  eventCategoryCounts,
  saveEventsPageBody,
  saveEventsSections,
  saveEventsWidgets,
  setEventsPageCover,
  setEventsPageLock,
  type ComingUpRow,
  type EventsOverview,
  type EventsSectionCounts,
  type EventsSections,
  type FeaturedEventRow,
  type SignUpRow,
} from "@/server/events/events-dashboard"
import { adminGet, adminPost } from "@/server/guards"
import { workspaceIdForRequest } from "@/server/workspaces/for-request"

import { createErrorMessage } from "../error-message"

export type { ComingUpRow, EventsOverview, EventsSectionCounts, EventsSections, FeaturedEventRow, SignUpRow }

/**
 * The Events dashboard's own records (task events/37, Part 1): its left
 * page, its rows, Overview, the Sign-ups and Featured events rows. Every one
 * is admin only and the site's own. The events themselves come from
 * `events.ts`, as before.
 */

export const getEventsDashboardErrorMessage = createErrorMessage(
  {
    [EVENTS_PAGE_ERRORS.tooLong]: EVENTS_PAGE_ERRORS.tooLong,
    [EVENTS_PAGE_ERRORS.locked]: EVENTS_PAGE_ERRORS.locked,
  },
  "That did not work. Please try again."
)

const loadPageFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(async ({ context }) => getEventsPage(await workspaceIdForRequest(context.user.id)))

const loadCountsFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(async ({ context }) => {
    const site = await workspaceIdForRequest(context.user.id)
    const [counts, coming, categories] = await Promise.all([
      eventsSectionCounts(site),
      comingUp(site, 5),
      eventCategoryCounts(site),
    ])
    return { counts, coming, categories }
  })

const sectionSchema = z.array(z.enum(EVENTS_LIST_SECTIONS as [string, ...string[]])).max(EVENTS_LIST_SECTIONS.length)

const saveSectionsFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ hidden: sectionSchema, order: sectionSchema }))
  .handler(async ({ data, context }) =>
    saveEventsSections(await workspaceIdForRequest(context.user.id), data as EventsSections)
  )

const savePageFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ body: z.string().max(PAGE_MAX_LENGTH) }))
  .handler(async ({ data, context }) => saveEventsPageBody(await workspaceIdForRequest(context.user.id), data.body))

const lockPageFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ locked: z.boolean() }))
  .handler(async ({ data, context }) => setEventsPageLock(await workspaceIdForRequest(context.user.id), data.locked))

const coverFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ coverUrl: coverSchema, coverImages: coverImagesSchema }))
  .handler(async ({ data, context }) =>
    setEventsPageCover(await workspaceIdForRequest(context.user.id), {
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
  .handler(async ({ context }): Promise<WidgetLayout> => getEventsWidgets(await workspaceIdForRequest(context.user.id)))

const saveWidgetsFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ top: rowSchema, bottom: rowSchema }))
  .handler(
    async ({ data, context }): Promise<WidgetLayout> => saveEventsWidgets(await workspaceIdForRequest(context.user.id), data)
  )

const overviewFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(async ({ context }): Promise<EventsOverview> => eventsOverview(await workspaceIdForRequest(context.user.id)))

const paging = {
  q: z.string().max(200).optional(),
  page: z.number().int().min(1).max(10_000).optional(),
  limit: z.number().int().min(1).max(200).optional(),
}

const signUpsFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(z.object({ who: z.enum(SIGN_UP_FILTERS), ...paging }))
  .handler(async ({ data, context }) => {
    const limit = data.limit ?? 50
    const page = data.page ?? 1
    const found = await listAllSignUps(await workspaceIdForRequest(context.user.id), {
      who: data.who,
      search: data.q,
      limit,
      offset: (page - 1) * limit,
    })
    return { ...found, page, pageSize: limit }
  })

const featuredFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(z.object({ spots: z.enum(FEATURED_FILTERS), ...paging }))
  .handler(async ({ data, context }) => {
    const limit = data.limit ?? 50
    const page = data.page ?? 1
    const found = await featuredEvents(await workspaceIdForRequest(context.user.id), {
      spots: data.spots,
      search: data.q,
      limit,
      offset: (page - 1) * limit,
    })
    return { ...found, page, pageSize: limit }
  })

const stopFeaturingFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ kind: z.enum(["admin", "paid"]), id: z.string().min(1).max(36) }))
  .handler(async ({ data, context }) => {
    const site = await workspaceIdForRequest(context.user.id)
    // The admin's free switch goes off on the event; a paid spot is revoked,
    // the same as Revoke on the Listings dashboard's Placements row.
    if (data.kind === "admin") await updateEvent(site, data.id, { featured: false })
    else await revokeFeaturedEntitlement(site, data.id, context.user.id, "")
  })

export function loadEventsDashboardPage() {
  return loadPageFn()
}
/** The counts, Coming up and the categories again, after something changed one of them. */
export function loadEventsCounts() {
  return loadCountsFn()
}
export function saveEventsDashboardSections(sections: EventsSections) {
  return saveSectionsFn({ data: sections })
}
export function saveEventsDashboardPage(body: string) {
  return savePageFn({ data: { body } })
}
export function lockEventsDashboardPage(locked: boolean) {
  return lockPageFn({ data: { locked } })
}
export function setEventsDashboardCover(cover: { coverUrl: string | null; coverImages: string[] }) {
  return coverFn({ data: cover })
}
export function loadEventsWidgets() {
  return loadWidgetsFn()
}
export function saveEventsWidgetLayout(layout: WidgetLayout) {
  return saveWidgetsFn({ data: layout })
}
export function loadEventsOverview() {
  return overviewFn()
}
export function loadSignUpsPage(input: { who: (typeof SIGN_UP_FILTERS)[number]; q?: string; page?: number; limit?: number }) {
  return signUpsFn({ data: input })
}
export function loadFeaturedEventsPage(input: {
  spots: (typeof FEATURED_FILTERS)[number]
  q?: string
  page?: number
  limit?: number
}) {
  return featuredFn({ data: input })
}
/** Stops featuring one event: the admin's switch off, or a paid spot revoked with no refund. */
export function stopFeaturingEvent(input: { kind: "admin" | "paid"; id: string }) {
  return stopFeaturingFn({ data: input })
}
