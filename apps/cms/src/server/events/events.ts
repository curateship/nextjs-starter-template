import { and, asc, desc, eq, ilike, inArray, ne, or, sql } from "drizzle-orm"
import type { PgUpdateSetSource } from "drizzle-orm/pg-core"

import { slugFromTitle, slugProblem } from "@/lib/directory/slugs"
import {
  DEFAULT_EVENT_SORT,
  eventSortDirection,
  type EventSortColumn,
} from "@/lib/events/event-sort"
import { toClock, type EventWhen } from "@/lib/events/event-time"
import {
  cleanPostBody,
  emptyPostBody,
  type PostBody,
} from "@/lib/posts/post-body"
import { now, uuid } from "@/server/auth/security"
import { db, type CustomShellDb } from "@/server/db"
import {
  categoryNamesFor,
  deleteCategoryRowsFor,
} from "@/server/directory/content-categories"
import { clearPublicDirectoryCache } from "@/server/directory/public-cache"
import {
  firstFreeSlug as firstFreeSlugRule,
  requireFreeSlug as requireFreeSlugRule,
} from "@/server/directory/slug-rules"
import {
  siteEvents,
  EVENT_CONTENT_TYPE,
  type EventRow,
} from "@/server/events/schema"

/**
 * The admin's side of events. Every read and write takes the site first and
 * filters on it, so one site's events never reach another site's screen.
 *
 * Saving or deleting an event clears the public page cache, because the event
 * page is cached.
 */

export const MAX_EVENT_TITLE = 200
export const MAX_EVENT_SUMMARY = 300
export const MAX_PLACE_NAME = 200
export const MAX_PLACE_ADDRESS = 300

export type EventStatus = "draft" | "published"

export type SiteEvent = EventWhen & {
  id: string
  title: string
  slug: string
  coverImage: string
  summary: string
  body: PostBody
  status: EventStatus
  publishedAt: Date | null
  placeName: string
  placeAddress: string
  createdAt: Date
  updatedAt: Date
}

/** An Events screen row: the event without its body, plus its category names. */
export type EventSummary = Omit<SiteEvent, "body"> & { categories: string[] }

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
    publishedAt: row.publishedAt,
    startDate: row.startDate,
    startTime: toClock(row.startTime),
    endDate: row.endDate,
    endTime: row.endTime ? toClock(row.endTime) : null,
    placeName: row.placeName,
    placeAddress: row.placeAddress,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

const EVENT_NOUN = { one: "event", many: "events" }

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const CLOCK_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/

/** A real calendar day: "2026-02-30" has the right shape and is not one. */
function isRealDay(value: string): boolean {
  if (!DAY_PATTERN.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  )
}

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
  if (!isRealDay(startDate)) throw new Error("Pick the day the event starts.")
  if (!CLOCK_PATTERN.test(startTime)) {
    throw new Error("Give the time the event starts.")
  }

  const endTime = input.endTime?.trim() || null
  if (endTime && !CLOCK_PATTERN.test(endTime)) {
    throw new Error("The end time is not a time of day.")
  }
  let endDate = input.endDate?.trim() || null
  if (endDate && !isRealDay(endDate)) {
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

  const filters = [eq(siteEvents.workspaceId, workspaceId)]
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

  const [rows, [countRow]] = await Promise.all([
    database
      .select()
      .from(siteEvents)
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

  const names = await categoryNamesFor(
    workspaceId,
    EVENT_CONTENT_TYPE,
    rows.map((row) => row.id),
    database
  )
  return {
    events: rows.map((row) => {
      const { body: _body, ...rest } = toEvent(row)
      return { ...rest, categories: names.get(row.id) ?? [] }
    }),
    total: countRow?.total ?? 0,
  }
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

/** A new event: a title, a free address from it, a start, born a draft. */
export async function createEvent(
  workspaceId: string,
  input: { title: string; slug?: string; when: EventWhenInput },
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
    when?: EventWhenInput
    placeName?: string
    placeAddress?: string
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
 * One request for the whole selection. The category rows go in the same
 * transaction, because the relationship table has no foreign key to an event.
 */
export async function deleteEvents(
  workspaceId: string,
  ids: string[],
  database: CustomShellDb = db
): Promise<{ done: string[]; kept: string[] }> {
  if (ids.length === 0) return { done: [], kept: [] }

  const done = await database.transaction(async (tx) => {
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
