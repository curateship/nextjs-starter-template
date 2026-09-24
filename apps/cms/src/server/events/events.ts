import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  inArray,
  isNull,
  ne,
  or,
  sql,
} from "drizzle-orm"
import type { PgUpdateSetSource } from "drizzle-orm/pg-core"

import { slugFromTitle, slugProblem } from "@/lib/directory/slugs"
import { isValidDateString } from "@/lib/events/calendar-grid"
import {
  DEFAULT_EVENT_SORT,
  eventSortDirection,
  type EventSortColumn,
} from "@/lib/events/event-sort"
import { parseRepeatRule, type RepeatRule } from "@/lib/events/event-repeat"
import { toClock, wallClockAt, type EventWhen } from "@/lib/events/event-time"
import {
  cleanPostBody,
  emptyPostBody,
  type PostBody,
} from "@/lib/posts/post-body"
import { now, uuid } from "@/server/auth/security"
import { db, type CustomShellDb } from "@/server/db"
import {
  categoryIdsFor,
  categoryNamesFor,
  deleteCategoryRowsFor,
} from "@/server/directory/content-categories"
import { locateAddress } from "@/server/directory/geocode"
import { clearPublicDirectoryCache } from "@/server/directory/public-cache"
import {
  categoryRelationships,
  directoryListings,
} from "@/server/directory/schema"
import { siteTimeZone } from "@/server/directory/settings"
import {
  firstFreeSlug as firstFreeSlugRule,
  requireFreeSlug as requireFreeSlugRule,
} from "@/server/directory/slug-rules"
import {
  siteEvents,
  EVENT_CONTENT_TYPE,
  type EventRow,
} from "@/server/events/schema"
import {
  listingOfEvent,
  livePlaceName,
} from "@/server/events/place"
import { listingChoice } from "@/server/posts/posts"

/**
 * The admin's side of events. Every read and write takes the site first and
 * filters on it, so one site's events never reach another site's screen.
 *
 * Saving or deleting an event clears the public page cache, because the event
 * page is cached.
 *
 * A repeating event's later dates are rows here too, made by
 * `server/events/repeats.ts`. The list shows only the main event, and
 * deleting the main event deletes every date.
 */

export const MAX_EVENT_TITLE = 200
export const MAX_EVENT_SUMMARY = 300
export const MAX_PLACE_NAME = 200
export const MAX_PLACE_ADDRESS = 300

export type EventStatus = "draft" | "published"

/** A private event's page opens from its link, but no public list shows it. */
export type EventVisibility = "public" | "private"

export type SiteEvent = EventWhen & {
  id: string
  title: string
  slug: string
  coverImage: string
  summary: string
  body: PostBody
  status: EventStatus
  visibility: EventVisibility
  publishedAt: Date | null
  /** The place, when it is one of the site's listings. */
  listingId: string | null
  placeName: string
  placeAddress: string
  /** Where a typed address is on a map, or null when it is not known. */
  position: { latitude: number; longitude: number } | null
  /** The typed address last looked up, found or not. */
  locatedFor: string | null
  /** The repeat, on a main event only. */
  repeat: RepeatRule | null
  /** On a date a repeat made: its main event's id. */
  seriesId: string | null
  /** A date saved by itself, which changes to the main event skip. */
  editedAlone: boolean
  /** The page an automation drafted this from, or empty. */
  sourceUrl: string
  createdAt: Date
  updatedAt: Date
}

/**
 * An Events screen row: the event without its body, plus its category names
 * and, on a main event, how many dates it has made and how many are to come.
 */
export type EventSummary = Omit<SiteEvent, "body"> & {
  categories: string[]
  seriesDates: { total: number; upcoming: number }
}

/** When an event happens, as a form sends it. Empty ends mean "no end". */
export type EventWhenInput = {
  startDate: string
  startTime: string
  endDate?: string | null
  endTime?: string | null
}

export function toEvent(row: EventRow): SiteEvent {
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    coverImage: row.coverImage,
    summary: row.summary,
    body: cleanPostBody(row.body),
    status: row.status === "published" ? "published" : "draft",
    visibility: row.visibility === "private" ? "private" : "public",
    publishedAt: row.publishedAt,
    startDate: row.startDate,
    startTime: toClock(row.startTime),
    endDate: row.endDate,
    endTime: row.endTime ? toClock(row.endTime) : null,
    listingId: row.listingId,
    placeName: row.placeName,
    placeAddress: row.placeAddress,
    position:
      row.latitude !== null && row.longitude !== null
        ? { latitude: row.latitude, longitude: row.longitude }
        : null,
    locatedFor: row.locatedFor,
    repeat: parseRepeatRule(row.repeatRule),
    seriesId: row.seriesId,
    editedAlone: row.editedAlone,
    sourceUrl: row.sourceUrl,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

const EVENT_NOUN = { one: "event", many: "events" }

/**
 * Before listings are deleted, their current name and address are written
 * onto the events that use them, so each event still says where it is after
 * the database drops the link.
 */
export async function keepListingPlaceOnEvents(
  workspaceId: string,
  listingIds: string[],
  database: CustomShellDb
): Promise<void> {
  if (listingIds.length === 0) return
  await database
    .update(siteEvents)
    .set({
      placeName: sql`${directoryListings.title}`,
      placeAddress: sql`coalesce(${directoryListings.contactLinks}->>'address', '')`,
      // The listing's pin too, marked as the answer for that address so the
      // next save does not look it up again. A listing with no pin leaves the
      // address to be looked up on the event's next save.
      latitude: sql`${directoryListings.latitude}`,
      longitude: sql`${directoryListings.longitude}`,
      locatedFor: sql`case when ${directoryListings.latitude} is null then null else coalesce(${directoryListings.contactLinks}->>'address', '') end`,
    })
    .from(directoryListings)
    .where(
      and(
        eq(siteEvents.workspaceId, workspaceId),
        eq(directoryListings.workspaceId, workspaceId),
        eq(siteEvents.listingId, directoryListings.id),
        inArray(directoryListings.id, listingIds)
      )
    )
}

/** The columns that say where an event is on a map. */
export type EventPositionColumns = {
  latitude: number | null
  longitude: number | null
  locatedFor: string | null
}

/**
 * What a save does to the event's map position, or null for "leave it".
 *
 * Only a typed street address is looked up, and only when it differs from the
 * one last looked up, so a save that does not change the address costs no
 * lookup. A listing as the place brings its own position. An address Google
 * could not find is remembered as looked up with no position, and a lookup
 * that could not be made clears the old position and tries again next save.
 *
 * Run before the save's transaction, so a slow answer from Google never holds
 * the database.
 */
export async function positionForSave(
  workspaceId: string,
  id: string,
  change: { placeAddress?: string; listingId?: string | null },
  database: CustomShellDb = db
): Promise<EventPositionColumns | null> {
  const [before] = await database
    .select({
      listingId: siteEvents.listingId,
      placeAddress: siteEvents.placeAddress,
      latitude: siteEvents.latitude,
      locatedFor: siteEvents.locatedFor,
    })
    .from(siteEvents)
    .where(and(eq(siteEvents.id, id), eq(siteEvents.workspaceId, workspaceId)))
    .limit(1)
  if (!before) return null
  const listingId =
    change.listingId === undefined ? before.listingId : change.listingId
  if (listingId) return null

  const address = (change.placeAddress ?? before.placeAddress)
    .trim()
    .slice(0, MAX_PLACE_ADDRESS)
  if (!address) {
    return before.latitude === null && before.locatedFor === null
      ? null
      : { latitude: null, longitude: null, locatedFor: null }
  }
  if (address === before.locatedFor) return null

  const found = await locateAddress(workspaceId, address, database)
  if (found.found) {
    return {
      latitude: found.latitude,
      longitude: found.longitude,
      locatedFor: address,
    }
  }
  return {
    latitude: null,
    longitude: null,
    locatedFor: found.reason === "not-found" ? address : null,
  }
}

const CLOCK_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/

/**
 * The start and end as they are stored, or a refusal the admin can act on.
 *
 * An end time with no end day ends on the start day. An end day equal to the
 * start day with no end time says nothing the start does not, so it is stored
 * as no end at all.
 */
export function cleanEventWhen(input: EventWhenInput): EventWhen {
  const startDate = input.startDate.trim()
  const startTime = input.startTime.trim()
  if (!isValidDateString(startDate)) {
    throw new Error("Pick the day the event starts.")
  }
  if (!CLOCK_PATTERN.test(startTime)) {
    throw new Error("Give the time the event starts.")
  }

  const endTime = input.endTime?.trim() || null
  if (endTime && !CLOCK_PATTERN.test(endTime)) {
    throw new Error("The end time is not a time of day.")
  }
  let endDate = input.endDate?.trim() || null
  if (endDate && !isValidDateString(endDate)) {
    throw new Error("The end day is not a real day.")
  }
  if (endTime && !endDate) endDate = startDate
  if (endDate === startDate && !endTime) endDate = null

  if (endDate) {
    const ends = `${endDate}T${endTime ?? "24:00"}`
    if (ends <= `${startDate}T${startTime}`) {
      throw new Error(
        "The event ends before it starts. An event past midnight needs the next day as its end day."
      )
    }
  }
  return { startDate, startTime, endDate, endTime }
}

/**
 * The title and start day of every event on this site that starts on one of
 * `days`, in any state, for the Draft events step's duplicate check.
 */
export async function eventTitlesOnDays(
  workspaceId: string,
  days: string[],
  database: CustomShellDb = db
): Promise<{ title: string; startDate: string }[]> {
  if (!days.length) return []
  return database
    .select({ title: siteEvents.title, startDate: siteEvents.startDate })
    .from(siteEvents)
    .where(
      and(
        eq(siteEvents.workspaceId, workspaceId),
        inArray(siteEvents.startDate, days)
      )
    )
}

/** A free address on this site, numbered when the one wanted is taken. */
export function firstFreeEventSlug(
  workspaceId: string,
  wanted: string,
  database: CustomShellDb = db
): Promise<string> {
  return firstFreeSlugRule(
    wanted,
    (candidate) => slugIsTaken(workspaceId, candidate, null, database),
    EVENT_NOUN
  )
}

async function slugIsTaken(
  workspaceId: string,
  slug: string,
  exceptId: string | null,
  database: CustomShellDb
): Promise<boolean> {
  const [row] = await database
    .select({ id: siteEvents.id })
    .from(siteEvents)
    .where(
      and(
        eq(siteEvents.workspaceId, workspaceId),
        eq(siteEvents.slug, slug),
        exceptId ? ne(siteEvents.id, exceptId) : undefined
      )
    )
    .limit(1)
  return Boolean(row)
}

function cleanTitle(raw: string): string {
  const title = raw.trim().slice(0, MAX_EVENT_TITLE)
  if (!title) throw new Error("An event needs a title.")
  return title
}

export async function listEvents(
  workspaceId: string,
  options: {
    search?: string
    status?: EventStatus
    sort?: EventSortColumn
    direction?: "asc" | "desc"
    limit?: number
    offset?: number
  } = {},
  database: CustomShellDb = db
): Promise<{ events: EventSummary[]; total: number }> {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200)
  const offset = Math.max(options.offset ?? 0, 0)
  const search = options.search?.trim()

  // A repeating event is one row: its dates open from the main event's window.
  const filters = [
    eq(siteEvents.workspaceId, workspaceId),
    isNull(siteEvents.seriesId),
  ]
  if (search) {
    const pattern = `%${search}%`
    const match = or(
      ilike(siteEvents.title, pattern),
      ilike(siteEvents.slug, pattern),
      ilike(siteEvents.placeName, pattern)
    )
    if (match) filters.push(match)
  }
  if (options.status) filters.push(eq(siteEvents.status, options.status))
  const where = and(...filters)

  const sort = options.sort ?? DEFAULT_EVENT_SORT
  // With no direction given, each column runs the way the screen's arrow says.
  const order =
    (options.direction ?? eventSortDirection(sort)) === "asc" ? asc : desc
  const ordering =
    sort === "date"
      ? [order(siteEvents.startDate), order(siteEvents.startTime)]
      : [
          order(
            {
              title: siteEvents.title,
              status: siteEvents.status,
              updated: siteEvents.updatedAt,
            }[sort]
          ),
        ]

  const [found, [countRow]] = await Promise.all([
    database
      .select({ row: siteEvents, placeName: livePlaceName })
      .from(siteEvents)
      .leftJoin(directoryListings, listingOfEvent)
      .where(where)
      // The id breaks ties, so a page boundary never shows an event twice.
      .orderBy(...ordering, asc(siteEvents.id))
      .limit(limit)
      .offset(offset),
    database
      .select({ total: sql<number>`count(*)::int` })
      .from(siteEvents)
      .where(where),
  ])

  // The row carries the listing's current name, as the event page does.
  const rows = found.map(({ row, placeName }) => ({ ...row, placeName }))
  const ids = rows.map((row) => row.id)
  const [names, dateCounts] = await Promise.all([
    categoryNamesFor(workspaceId, EVENT_CONTENT_TYPE, ids, database),
    seriesDateCounts(workspaceId, ids, database),
  ])
  return {
    events: rows.map((row) => {
      const { body: _body, ...rest } = toEvent(row)
      return {
        ...rest,
        categories: names.get(row.id) ?? [],
        seriesDates: dateCounts.get(row.id) ?? { total: 0, upcoming: 0 },
      }
    }),
    total: countRow?.total ?? 0,
  }
}

/**
 * How many dates each of these main events has made, and how many are today
 * or later by the site's calendar. Events with none are left out.
 */
async function seriesDateCounts(
  workspaceId: string,
  mainIds: string[],
  database: CustomShellDb
): Promise<Map<string, { total: number; upcoming: number }>> {
  if (mainIds.length === 0) return new Map()
  const today = wallClockAt(
    await siteTimeZone(workspaceId, database),
    new Date()
  ).slice(0, 10)
  const rows = await database
    .select({
      mainId: siteEvents.seriesId,
      total: count(),
      upcoming: sql<number>`count(*) filter (where ${siteEvents.seriesDate} >= ${today}::date)::int`,
    })
    .from(siteEvents)
    .where(
      and(
        eq(siteEvents.workspaceId, workspaceId),
        inArray(siteEvents.seriesId, mainIds)
      )
    )
    .groupBy(siteEvents.seriesId)
  return new Map(
    rows.map((row) => [
      row.mainId ?? "",
      { total: row.total, upcoming: row.upcoming },
    ])
  )
}

export async function findEvent(
  workspaceId: string,
  id: string,
  database: CustomShellDb = db
): Promise<SiteEvent | null> {
  const [row] = await database
    .select()
    .from(siteEvents)
    .where(and(eq(siteEvents.id, id), eq(siteEvents.workspaceId, workspaceId)))
    .limit(1)
  return row ? toEvent(row) : null
}

/** One date of a repeating event, as its main event's window lists it. */
export type EventSeriesDate = {
  id: string
  startDate: string
  startTime: string
  status: EventStatus
  editedAlone: boolean
}

/** Where an event sits in a repeating event, for its window. */
export type EventSeries = {
  /** On a date a repeat made: the main event it follows. */
  main: { id: string; title: string } | null
  /** On a main event: every date it has made, soonest first. */
  dates: EventSeriesDate[]
  /** The site's today, "2026-09-23", so past dates can be told apart. */
  today: string
}

export async function seriesForEdit(
  workspaceId: string,
  event: SiteEvent,
  database: CustomShellDb = db
): Promise<EventSeries> {
  const today = wallClockAt(
    await siteTimeZone(workspaceId, database),
    new Date()
  ).slice(0, 10)
  if (event.seriesId) {
    const [main] = await database
      .select({ id: siteEvents.id, title: siteEvents.title })
      .from(siteEvents)
      .where(
        and(
          eq(siteEvents.id, event.seriesId),
          eq(siteEvents.workspaceId, workspaceId)
        )
      )
      .limit(1)
    return { main: main ?? null, dates: [], today }
  }
  const rows = await database
    .select({
      id: siteEvents.id,
      startDate: siteEvents.startDate,
      startTime: siteEvents.startTime,
      status: siteEvents.status,
      editedAlone: siteEvents.editedAlone,
    })
    .from(siteEvents)
    .where(
      and(
        eq(siteEvents.workspaceId, workspaceId),
        eq(siteEvents.seriesId, event.id)
      )
    )
    .orderBy(asc(siteEvents.seriesDate))
  return {
    main: null,
    dates: rows.map((row) => ({
      ...row,
      startTime: toClock(row.startTime),
      status: row.status === "published" ? "published" : "draft",
    })),
    today,
  }
}

/**
 * A new event: a title, a free address from it, a start, born a draft.
 *
 * There is no way to create one published. `sourceUrl` is the page an
 * automation read to draft it, and only `server/events/ai-drafts.ts` passes it.
 */
export async function createEvent(
  workspaceId: string,
  input: {
    title: string
    slug?: string
    when: EventWhenInput
    sourceUrl?: string
  },
  database: CustomShellDb = db
): Promise<SiteEvent> {
  const title = cleanTitle(input.title)
  const when = cleanEventWhen(input.when)
  const chosen = input.slug?.trim()
  const wanted = chosen || slugFromTitle(title)
  const problem = slugProblem(wanted)
  if (problem) throw new Error(problem)

  const isTaken = (candidate: string) =>
    slugIsTaken(workspaceId, candidate, null, database)
  let slug = wanted
  if (chosen) await requireFreeSlugRule(wanted, isTaken, EVENT_NOUN)
  else slug = await firstFreeSlugRule(wanted, isTaken, EVENT_NOUN)

  const at = now()
  const [row] = await database
    .insert(siteEvents)
    .values({
      id: uuid(),
      workspaceId,
      title,
      slug,
      body: emptyPostBody(),
      ...when,
      sourceUrl: (input.sourceUrl ?? "").slice(0, 600),
      createdAt: at,
      updatedAt: at,
    })
    .returning()

  if (!row) throw new Error("The event was not created.")
  return toEvent(row)
}

export async function updateEvent(
  workspaceId: string,
  id: string,
  input: {
    title?: string
    slug?: string
    coverImage?: string
    summary?: string
    body?: unknown
    status?: EventStatus
    visibility?: EventVisibility
    when?: EventWhenInput
    placeName?: string
    placeAddress?: string
    /** One of this site's listings as the place, or null for a typed one. */
    listingId?: string | null
  },
  database: CustomShellDb = db
): Promise<SiteEvent> {
  const at = now()
  const values: PgUpdateSetSource<typeof siteEvents> = { updatedAt: at }

  if (input.title !== undefined) values.title = cleanTitle(input.title)
  if (input.slug !== undefined) {
    const slug = input.slug.trim()
    await requireFreeSlugRule(
      slug,
      (candidate) => slugIsTaken(workspaceId, candidate, id, database),
      EVENT_NOUN
    )
    values.slug = slug
  }
  if (input.coverImage !== undefined) {
    values.coverImage = input.coverImage.trim().slice(0, 600)
  }
  if (input.summary !== undefined) {
    values.summary = input.summary.trim().slice(0, MAX_EVENT_SUMMARY)
  }
  if (input.body !== undefined) values.body = cleanPostBody(input.body)
  if (input.when !== undefined)
    Object.assign(values, cleanEventWhen(input.when))
  if (input.placeName !== undefined) {
    values.placeName = input.placeName.trim().slice(0, MAX_PLACE_NAME)
  }
  if (input.placeAddress !== undefined) {
    values.placeAddress = input.placeAddress.trim().slice(0, MAX_PLACE_ADDRESS)
  }
  if (input.listingId !== undefined) {
    values.listingId = input.listingId
    if (input.listingId) {
      // The listing's own name and address win over anything typed, and stay
      // as the event's if the listing is ever deleted.
      const listing = await listingChoice(
        workspaceId,
        input.listingId,
        database
      )
      if (!listing) throw new Error("That listing is not on this site any more.")
      values.placeName = listing.title.slice(0, MAX_PLACE_NAME)
      values.placeAddress = listing.address.slice(0, MAX_PLACE_ADDRESS)
    }
  }
  if (input.visibility !== undefined) values.visibility = input.visibility
  // A date of a repeating event saved by itself stops following the main one.
  values.editedAlone = sql`${siteEvents.seriesId} IS NOT NULL`
  if (input.status !== undefined) {
    values.status = input.status
    // The first publish dates the event; later ones keep that date.
    if (input.status === "published") {
      values.publishedAt = sql`coalesce(${siteEvents.publishedAt}, ${at.toISOString()}::timestamptz)`
    }
  }

  const [row] = await database
    .update(siteEvents)
    .set(values)
    .where(and(eq(siteEvents.id, id), eq(siteEvents.workspaceId, workspaceId)))
    .returning()

  if (!row) throw new Error("That event no longer exists.")
  clearPublicDirectoryCache(workspaceId)
  return toEvent(row)
}

/**
 * Each event's address and status by id, for My listings to link an owner's
 * approved events. Only the ids asked for, which come from the owner's own
 * suggestions.
 */
export async function eventLinksByIds(
  ids: string[],
  database: CustomShellDb = db
): Promise<Map<string, { slug: string; status: EventStatus }>> {
  const unique = [...new Set(ids)].filter(Boolean)
  if (unique.length === 0) return new Map()
  const rows = await database
    .select({
      id: siteEvents.id,
      slug: siteEvents.slug,
      status: siteEvents.status,
    })
    .from(siteEvents)
    .where(inArray(siteEvents.id, unique))
  return new Map(
    rows.map((row) => [
      row.id,
      {
        slug: row.slug,
        status: row.status === "published" ? "published" : "draft",
      },
    ])
  )
}

const COPY_SUFFIX = " (copy)"

/**
 * A copy to start from, for an event that happens again on a new day: the
 * same content, when, where, categories and public or private setting,
 * "(copy)" on the title, a fresh address from that title, and always a draft
 * with no published date, so nothing new is public until the admin publishes
 * it.
 */
export async function duplicateEvent(
  workspaceId: string,
  id: string,
  database: CustomShellDb = db
): Promise<SiteEvent> {
  const [source] = await database
    .select()
    .from(siteEvents)
    .where(and(eq(siteEvents.id, id), eq(siteEvents.workspaceId, workspaceId)))
    .limit(1)
  if (!source) throw new Error("That event no longer exists.")

  // Trimmed before the suffix, so a title at the limit still says "(copy)".
  const title = `${source.title.slice(0, MAX_EVENT_TITLE - COPY_SUFFIX.length)}${COPY_SUFFIX}`
  const slug = await firstFreeSlugRule(
    slugFromTitle(title),
    (candidate) => slugIsTaken(workspaceId, candidate, null, database),
    EVENT_NOUN
  )
  const categoryIds = await categoryIdsFor(
    workspaceId,
    EVENT_CONTENT_TYPE,
    id,
    database
  )

  const at = now()
  // The copy and its categories together, so a copy never looks untagged.
  const row = await database.transaction(async (tx) => {
    const [created] = await tx
      .insert(siteEvents)
      .values({
        id: uuid(),
        workspaceId,
        title,
        slug,
        coverImage: source.coverImage,
        summary: source.summary,
        body: source.body,
        status: "draft",
        visibility: source.visibility,
        startDate: source.startDate,
        startTime: source.startTime,
        endDate: source.endDate,
        endTime: source.endTime,
        listingId: source.listingId,
        placeName: source.placeName,
        placeAddress: source.placeAddress,
        latitude: source.latitude,
        longitude: source.longitude,
        locatedFor: source.locatedFor,
        createdAt: at,
        updatedAt: at,
      })
      .returning()
    if (!created) throw new Error("The event was not copied.")

    if (categoryIds.length) {
      await tx.insert(categoryRelationships).values(
        categoryIds.map((categoryId) => ({
          id: uuid(),
          workspaceId,
          categoryId,
          contentType: EVENT_CONTENT_TYPE,
          contentId: created.id,
          isPrimary: false,
          createdAt: at,
        }))
      )
    }
    return created
  })
  return toEvent(row)
}

/**
 * One request for the whole selection. The category rows go in the same
 * transaction, because the relationship table has no foreign key to an event.
 * A main event takes every one of its dates with it; `done` names only the
 * events asked for.
 */
export async function deleteEvents(
  workspaceId: string,
  ids: string[],
  database: CustomShellDb = db
): Promise<{ done: string[]; kept: string[] }> {
  if (ids.length === 0) return { done: [], kept: [] }

  const done = await database.transaction(async (tx) => {
    const dates = await tx
      .select({ id: siteEvents.id })
      .from(siteEvents)
      .where(
        and(
          eq(siteEvents.workspaceId, workspaceId),
          inArray(siteEvents.seriesId, ids)
        )
      )
    // The database deletes the dates with their main event; their category
    // rows have no such link, so they go here.
    await deleteCategoryRowsFor(
      workspaceId,
      EVENT_CONTENT_TYPE,
      dates.map((row) => row.id),
      tx
    )
    const deleted = await tx
      .delete(siteEvents)
      .where(
        and(
          eq(siteEvents.workspaceId, workspaceId),
          inArray(siteEvents.id, ids)
        )
      )
      .returning({ id: siteEvents.id })
    const removed = deleted.map((row) => row.id)
    await deleteCategoryRowsFor(workspaceId, EVENT_CONTENT_TYPE, removed, tx)
    return removed
  })

  if (done.length) clearPublicDirectoryCache(workspaceId)
  const doneSet = new Set(done)
  return { done, kept: ids.filter((id) => !doneSet.has(id)) }
}
