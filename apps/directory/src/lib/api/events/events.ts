import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import {
  EVENT_SORT_COLUMNS,
  type EventSortColumn,
  type EventViewRange,
} from "@/lib/events/event-sort"
import type { RepeatRule } from "@/lib/events/event-repeat"
import {
  MAX_EVENT_SEATS,
  MAX_SIGN_UPS_CLOSE_HOURS,
  SIGN_UP_QUESTION_MAX,
} from "@/lib/events/sign-up-fields"
import { TICKETS_URL_MAX } from "@/lib/events/tickets-url"
import { SCHEDULE_STATUSES } from "@/lib/events/schedule-status"
import { changeEventSchedule, type ScheduleChange } from "@/server/events/schedule"
import { cleanCustomValues, type CustomSection, type CustomValues } from "@/lib/directory/custom-fields"
import { listCustomSections } from "@/server/directory/custom-sections"
import {
  bulkIdsInput,
  categoryChangeInput,
  featuredChangeInput,
  statusChangeInput,
} from "@/lib/api/bulk-change-input"
import type { BulkChange, BulkRecordChange } from "@/lib/bulk-change"
import { adminGet, adminPost } from "@/server/guards"
import {
  activeEventSpot,
  prepareFeaturedEventsForDeletion,
} from "@/server/directory/featured"
import { directoryGeocodingKey } from "@/server/directory/settings"
import { categoryIdsFor } from "@/server/directory/content-categories"
import {
  createEvent,
  deleteEvents,
  duplicateEvent,
  eventCustomValues,
  findEvent,
  listEvents,
  MAX_EVENT_SUMMARY,
  MAX_EVENT_TITLE,
  MAX_PLACE_ADDRESS,
  MAX_PLACE_NAME,
  seriesForEdit,
  setEventsFeatured,
  type EventListTab,
  type EventSeries,
  type EventStatus,
  type EventSummary,
  type EventVisibility,
  type EventWhenInput,
  type SiteEvent,
} from "@/server/events/events"
import {
  changeEventsAndDates,
  saveEventAndDates,
} from "@/server/events/repeats"
import { EVENT_CONTENT_TYPE } from "@/server/events/schema"
import {
  listSignUps,
  listWaitingList,
  type EventSignUp,
  type EventWaitingPerson,
} from "@/server/events/sign-ups"
import {
  listingChoice,
  listingChoicesForBody,
  type ListingChoice,
} from "@/server/posts/posts"
import { workspaceIdForRequest } from "@/server/workspaces/for-request"

import { getListingErrorMessage } from "../directory/listings"

export type { EventSeries, EventSignUp, EventSummary, EventWaitingPerson, SiteEvent }

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
  /** How many each of the Events dashboard's tabs holds. */
  tabCounts: Record<EventListTab, number>
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
      sort: z.enum(EVENT_SORT_COLUMNS).optional(),
      direction: z.enum(["asc", "desc"]).optional(),
      days: z.union([z.literal("all"), z.literal(30)]).optional(),
      tab: z.enum(["upcoming", "past", "draft"]).optional(),
      categoryId: idInput.optional(),
      page: z.number().int().min(1).max(10_000).optional(),
      limit: z.number().int().min(1).max(200).optional(),
    })
  )
  .handler(async ({ data, context }): Promise<EventsPage> => {
    const pageSize = data.limit ?? 50
    const page = data.page ?? 1
    const site = await workspaceIdForRequest(context.user.id)
    const { events, total, tabCounts } = await listEvents(site, {
      search: data.search,
      tab: data.tab,
      categoryId: data.categoryId,
      sort: data.sort,
      direction: data.direction,
      viewDays: data.days,
      limit: pageSize,
      offset: (page - 1) * pageSize,
    })
    return { events, total, page, pageSize, tabCounts }
  })

export function loadEventsPage(input: {
  search?: string
  sort?: EventSortColumn
  direction?: "asc" | "desc"
  days?: EventViewRange
  tab?: EventListTab
  categoryId?: string
  page?: number
  limit?: number
}) {
  return loadEventsPageFn({ data: input })
}

/**
 * The editor's whole load: the event, its categories, its cards' listings,
 * and its place in a repeating event.
 */
export type EventForEdit = {
  event: SiteEvent
  categoryIds: string[]
  listings: ListingChoice[]
  series: EventSeries
  /** The listing the place is, as it is now, or null for a typed place. */
  placeListing: ListingChoice | null
  /** Whether this site can look a typed address up for the map. */
  canLocate: boolean
  /** The listing owner's paid featured spot, while one is running. */
  paidSpot: { endsAt: Date; buyerEmail: string } | null
  /** Who is coming, first to sign up first. */
  signUps: EventSignUp[]
  /** Who is waiting for a seat, front of the queue first. */
  waitingList: EventWaitingPerson[]
  /** The site's own event fields, and this event's answers cleaned against them. */
  customSections: CustomSection[]
  customValues: CustomValues
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
    const [
      listings,
      series,
      placeListing,
      lookupKey,
      paidSpot,
      signUps,
      waitingList,
      customSections,
      rawCustomValues,
    ] = await Promise.all([
      listingChoicesForBody(site, event.body),
      seriesForEdit(site, event),
      event.listingId ? listingChoice(site, event.listingId) : null,
      // Only whether there is one; the key itself never leaves the server.
      directoryGeocodingKey(site).catch(() => null),
      activeEventSpot(site, event.id),
      listSignUps(site, event.id),
      listWaitingList(site, event.id),
      listCustomSections(site, undefined, "event"),
      eventCustomValues(site, event.id),
    ])
    return {
      event,
      categoryIds,
      listings,
      series,
      placeListing,
      canLocate: Boolean(lookupKey),
      paidSpot,
      signUps,
      waitingList,
      customSections,
      customValues: cleanCustomValues(customSections, rawCustomValues),
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
      visibility: z.enum(["public", "private"]).optional(),
      featured: z.boolean().optional(),
      when: whenInput.optional(),
      placeName: z.string().max(MAX_PLACE_NAME).optional(),
      placeAddress: z.string().max(MAX_PLACE_ADDRESS).optional(),
      listingId: idInput.nullable().optional(),
      takesSignUps: z.boolean().optional(),
      seats: z.number().int().min(1).max(MAX_EVENT_SEATS).nullable().optional(),
      signUpsCloseHours: z
        .number()
        .int()
        .min(1)
        .max(MAX_SIGN_UPS_CLOSE_HOURS)
        .nullable()
        .optional(),
      signUpQuestion: z.string().max(SIGN_UP_QUESTION_MAX).optional(),
      signUpQuestionRequired: z.boolean().optional(),
      ticketsUrl: z.string().max(TICKETS_URL_MAX).optional(),
      // Cleaned against the site's own event fields on the server, the way a
      // listing's answers are.
      customValues: z.unknown().optional(),
      // A tree whose rule is "keep only what is allowed", which the server's
      // cleaner says better than a schema.
      body: z.unknown().optional(),
      categoryIds: z.array(idInput).max(50).optional(),
      // Checked by `parseRepeatRule`, which refuses anything else in words.
      repeat: z.unknown().optional(),
    })
  )
  .handler(async ({ data, context }): Promise<SavedEvent> => {
    const { id, ...rest } = data
    return saveEventAndDates(
      await workspaceIdForRequest(context.user.id),
      id,
      rest
    )
  })

/**
 * The saved event, and the days of any future dates of a repeating event that
 * were kept when its repeat or start day changed: ones saved by themselves,
 * and ones somebody signed up for.
 */
export type SavedEvent = {
  event: SiteEvent
  keptDates: string[]
  keptForSignUps: string[]
}

export function saveEvent(input: {
  id: string
  title?: string
  slug?: string
  coverImage?: string
  summary?: string
  status?: EventStatus
  visibility?: EventVisibility
  /** The free featured switch. Never sent for one date of a repeat. */
  featured?: boolean
  when?: EventWhenInput
  placeName?: string
  placeAddress?: string
  /** One of this site's listings as the place, or null for a typed one. */
  listingId?: string | null
  takesSignUps?: boolean
  /** Null for no limit. */
  seats?: number | null
  /** Null closes sign-ups when the event starts. */
  signUpsCloseHours?: number | null
  signUpQuestion?: string
  signUpQuestionRequired?: boolean
  ticketsUrl?: string
  customValues?: unknown
  body?: unknown
  categoryIds?: string[]
  /** Null stops repeating; left out keeps the repeat as it is. */
  repeat?: RepeatRule | null
}) {
  return updateEventFn({ data: input })
}

const changeEventScheduleFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.object({
      id: idInput,
      status: z.enum(SCHEDULE_STATUSES),
      when: z.object({ startDate: z.string().max(10), startTime: z.string().max(8) }).optional(),
    })
  )
  .handler(async ({ data, context }): Promise<SiteEvent> => {
    const { id, ...change } = data
    return changeEventSchedule(await workspaceIdForRequest(context.user.id), id, change)
  })

/**
 * Cancels, postpones or reschedules an event, after the admin confirmed. Its
 * own door rather than part of the record's save, so it never happens without
 * the confirm. Everybody on the event's list is emailed by the background pass.
 */
export function setEventSchedule(input: ScheduleChange & { id: string }) {
  return changeEventScheduleFn({ data: input })
}

const duplicateEventFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ id: idInput }))
  .handler(async ({ data, context }): Promise<SiteEvent> => {
    return duplicateEvent(await workspaceIdForRequest(context.user.id), data.id)
  })

/** A draft copy of the event, for the editor to open straight away. */
export function copyEvent(id: string) {
  return duplicateEventFn({ data: { id } })
}

const deleteEventsFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ ids: z.array(idInput).min(1).max(500) }))
  .handler(
    async ({ data, context }): Promise<{ done: string[]; kept: string[] }> => {
      const site = await workspaceIdForRequest(context.user.id)
      // An owner partway through paying to feature one of these stops the
      // delete, so a payment never lands on an event that is gone.
      await prepareFeaturedEventsForDeletion(site, data.ids)
      return deleteEvents(site, data.ids)
    }
  )

/** One request for the whole selection; the result counts honestly. */
export function removeEvents(ids: string[]) {
  return deleteEventsFn({ data: { ids } })
}

/**
 * The Events screen's action bar: one request for the whole selection, one field
 * changed on every main event in it, and an honest count back.
 *
 * A status or category change is copied onto the future dates of a repeating
 * event, because those dates follow their main event. The featured flag is not:
 * a date has no flag of its own and reads its main event's.
 */
const changeEventsFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.object({
      ids: bulkIdsInput,
      change: z.discriminatedUnion("kind", [
        statusChangeInput,
        categoryChangeInput,
        featuredChangeInput,
      ]),
    })
  )
  .handler(async ({ data, context }): Promise<BulkChange> => {
    const site = await workspaceIdForRequest(context.user.id)
    const change = data.change
    if (change.kind === "featured") {
      return setEventsFeatured(site, data.ids, change.featured)
    }
    // The change and the copy onto a repeat's future dates go together or not at
    // all, which is `changeEventsAndDates`' whole job.
    return changeEventsAndDates(site, data.ids, change)
  })

export function changeEvents(
  ids: string[],
  change: BulkRecordChange
): Promise<BulkChange> {
  return changeEventsFn({ data: { ids, change } })
}
