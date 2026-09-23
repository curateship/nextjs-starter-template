import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { LISTING_STATUS_FILTERS } from "@/lib/directory/listing-sort"
import {
  EVENT_SORT_COLUMNS,
  type EventSortColumn,
} from "@/lib/events/event-sort"
import { adminGet, adminPost } from "@/server/guards"
import {
  categoryIdsFor,
  setContentCategories,
} from "@/server/directory/content-categories"
import {
  createEvent,
  deleteEvents,
  findEvent,
  listEvents,
  MAX_EVENT_SUMMARY,
  MAX_EVENT_TITLE,
  MAX_PLACE_ADDRESS,
  MAX_PLACE_NAME,
  updateEvent,
  type EventStatus,
  type EventSummary,
  type EventWhenInput,
  type SiteEvent,
} from "@/server/events/events"
import { EVENT_CONTENT_TYPE } from "@/server/events/schema"
import { listingChoicesForBody, type ListingChoice } from "@/server/posts/posts"
import { workspaceIdForRequest } from "@/server/workspaces/for-request"

import { getListingErrorMessage } from "../directory/listings"

export type { EventSummary }

/**
 * The Events screen's doors. All admin-only, and all work on the site the
 * admin has open, read on the server rather than sent by the page. The
 * server's refusals are sentences about what the admin typed, so they pass
 * through.
 */
export const getEventErrorMessage = getListingErrorMessage

export type EventsPage = {
  events: EventSummary[]
  total: number
  page: number
  pageSize: number
}

const idInput = z.string().min(1).max(36)

/** Shapes are checked by `cleanEventWhen`, which says what is wrong in words. */
const whenInput = z.object({
  startDate: z.string().max(10),
  startTime: z.string().max(8),
  endDate: z.string().max(10).nullable().optional(),
  endTime: z.string().max(8).nullable().optional(),
})

const loadEventsPageFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(
    z.object({
      search: z.string().max(120).optional(),
      status: z.enum(LISTING_STATUS_FILTERS).optional(),
      sort: z.enum(EVENT_SORT_COLUMNS).optional(),
      direction: z.enum(["asc", "desc"]).optional(),
      page: z.number().int().min(1).max(10_000).optional(),
      limit: z.number().int().min(1).max(200).optional(),
    })
  )
  .handler(async ({ data, context }): Promise<EventsPage> => {
    const pageSize = data.limit ?? 50
    const page = data.page ?? 1
    const site = await workspaceIdForRequest(context.user.id)
    const { events, total } = await listEvents(site, {
      search: data.search,
      status: data.status,
      sort: data.sort,
      direction: data.direction,
      limit: pageSize,
      offset: (page - 1) * pageSize,
    })
    return { events, total, page, pageSize }
  })

export function loadEventsPage(input: {
  search?: string
  status?: EventStatus
  sort?: EventSortColumn
  direction?: "asc" | "desc"
  page?: number
  limit?: number
}) {
  return loadEventsPageFn({ data: input })
}

/** The editor's whole load: the event, its categories, and its cards' listings. */
export type EventForEdit = {
  event: SiteEvent
  categoryIds: string[]
  listings: ListingChoice[]
}

const loadEventForEditFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(z.object({ id: idInput }))
  .handler(async ({ data, context }): Promise<EventForEdit | null> => {
    const site = await workspaceIdForRequest(context.user.id)
    const [event, categoryIds] = await Promise.all([
      findEvent(site, data.id),
      categoryIdsFor(site, EVENT_CONTENT_TYPE, data.id),
    ])
    if (!event) return null
    return {
      event,
      categoryIds,
      listings: await listingChoicesForBody(site, event.body),
    }
  })

export function loadEventForEdit(id: string) {
  return loadEventForEditFn({ data: { id } })
}

const createEventFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.object({
      title: z.string().min(1).max(MAX_EVENT_TITLE),
      slug: z.string().max(160).optional(),
      when: whenInput,
    })
  )
  .handler(async ({ data, context }): Promise<SiteEvent> => {
    return createEvent(await workspaceIdForRequest(context.user.id), data)
  })

export function saveNewEvent(input: {
  title: string
  slug?: string
  when: EventWhenInput
}) {
  return createEventFn({ data: input })
}

const updateEventFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.object({
      id: idInput,
      title: z.string().min(1).max(MAX_EVENT_TITLE).optional(),
      slug: z.string().max(160).optional(),
      coverImage: z.string().max(600).optional(),
      summary: z.string().max(MAX_EVENT_SUMMARY).optional(),
      status: z.enum(["draft", "published"]).optional(),
      when: whenInput.optional(),
      placeName: z.string().max(MAX_PLACE_NAME).optional(),
      placeAddress: z.string().max(MAX_PLACE_ADDRESS).optional(),
      // A tree whose rule is "keep only what is allowed", which the server's
      // cleaner says better than a schema.
      body: z.unknown().optional(),
      categoryIds: z.array(idInput).max(50).optional(),
    })
  )
  .handler(async ({ data, context }): Promise<SiteEvent> => {
    const { id, categoryIds, ...rest } = data
    const site = await workspaceIdForRequest(context.user.id)
    const event = await updateEvent(site, id, rest)
    if (categoryIds !== undefined) {
      await setContentCategories(site, EVENT_CONTENT_TYPE, id, categoryIds)
    }
    return event
  })

export function saveEvent(input: {
  id: string
  title?: string
  slug?: string
  coverImage?: string
  summary?: string
  status?: EventStatus
  when?: EventWhenInput
  placeName?: string
  placeAddress?: string
  body?: unknown
  categoryIds?: string[]
}) {
  return updateEventFn({ data: input })
}

const deleteEventsFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ ids: z.array(idInput).min(1).max(500) }))
  .handler(
    async ({ data, context }): Promise<{ done: string[]; kept: string[] }> => {
      return deleteEvents(
        await workspaceIdForRequest(context.user.id),
        data.ids
      )
    }
  )

/** One request for the whole selection; the result counts honestly. */
export function removeEvents(ids: string[]) {
  return deleteEventsFn({ data: { ids } })
}
