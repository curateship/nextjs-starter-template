import { and, asc, desc, eq, gte, ilike, inArray, isNotNull, isNull, lte, or, sql } from "drizzle-orm"

import { cleanWidgetLayout, type WidgetLayout } from "@/lib/admin-dashboard/overview-widgets"
import { addDays } from "@/lib/events/event-repeat"
import { wallClockAt } from "@/lib/events/event-time"
import {
  DEFAULT_EVENTS_WIDGETS,
  defaultEventsPage,
  EVENTS_PAGE_BLOCK_TYPES,
  EVENTS_PAGE_ERRORS,
  EVENTS_WIDGET_IDS,
  withEventsSectionsBlock,
} from "@/lib/events/events-dashboard-page"
import {
  EVENTS_LIST_SECTIONS,
  type EventsListSection,
  type FeaturedFilter,
  type SignUpFilter,
} from "@/lib/events/events-dashboard-search"
import { PAGE_MAX_LENGTH, storedPageBody, type StoredPage } from "@/lib/notes/page-body"
import { readCoverImages } from "@/lib/notes/page-cover"
import { now } from "@/server/auth/security"
import { db, type CustomShellDb } from "@/server/db"
import { categories, categoryRelationships, directoryCustomSections, directoryFeaturedEntitlements } from "@/server/directory/schema"
import { siteTimeZone } from "@/server/directory/settings"
import { eventTabFilters, listEvents, notOverOn } from "@/server/events/events"
import { directoryEventPages, EVENT_CONTENT_TYPE, eventSignUps, siteEvents } from "@/server/events/schema"
import { pendingEventSubmissionCount } from "@/server/events/submissions"
import { customShellUsers } from "@/server/schema"

/**
 * The Events dashboard's own records (task events/37, Part 1): the site's
 * left page, its Dashboards block's rows and Overview's layout, every row's
 * count, Coming up, the categories, Overview's figures, and the Sign-ups and
 * Featured events rows. The same shape as the Listings dashboard's
 * (`server/directory/listings-dashboard.ts`). Admin only, and every read and
 * write is the site's own.
 */

const EMPTY_PAGE = JSON.stringify({ type: "doc", content: [{ type: "paragraph" }] })

function cleanPage(text: string) {
  const stored = storedPageBody(text, EVENTS_PAGE_BLOCK_TYPES) || EMPTY_PAGE
  return JSON.stringify(withEventsSectionsBlock(JSON.parse(stored)))
}

async function pageRow(workspaceId: string, database: Pick<CustomShellDb, "select">) {
  const [row] = await database
    .select()
    .from(directoryEventPages)
    .where(eq(directoryEventPages.workspaceId, workspaceId))
    .limit(1)
  return row
}

function pageOf(row: Awaited<ReturnType<typeof pageRow>>): StoredPage {
  const body = row?.body ? cleanPage(row.body) : JSON.stringify(defaultEventsPage())
  return {
    body,
    locked: row?.locked ?? false,
    coverUrl: row?.coverUrl ?? null,
    coverImages: readCoverImages(row?.coverImages),
  }
}

async function upsertPage(
  workspaceId: string,
  values: Partial<{
    body: string
    locked: boolean
    coverUrl: string | null
    coverImages: string[]
    widgets: WidgetLayout
    sections: EventsSections
  }>,
  database: CustomShellDb
) {
  const at = now()
  await database
    .insert(directoryEventPages)
    .values({ workspaceId, body: "", locked: false, coverUrl: null, coverImages: [], sections: {}, ...values, updatedAt: at })
    .onConflictDoUpdate({ target: directoryEventPages.workspaceId, set: { ...values, updatedAt: at } })
}

export async function saveEventsPageBody(workspaceId: string, body: string, database: CustomShellDb = db) {
  if (body.length > PAGE_MAX_LENGTH) throw new Error(EVENTS_PAGE_ERRORS.tooLong)
  const page = pageOf(await pageRow(workspaceId, database))
  if (page.locked) throw new Error(EVENTS_PAGE_ERRORS.locked)
  await upsertPage(workspaceId, { body: cleanPage(body) }, database)
}

export async function setEventsPageLock(workspaceId: string, locked: boolean, database: CustomShellDb = db) {
  await upsertPage(workspaceId, { locked }, database)
}

export async function setEventsPageCover(
  workspaceId: string,
  cover: { coverUrl: string | null; coverImages: string[] },
  database: CustomShellDb = db
) {
  await upsertPage(workspaceId, cover, database)
}

/** The Dashboards block's rows left out, and their dragged order. Overview is never in either. */
export type EventsSections = { hidden: EventsListSection[]; order: EventsListSection[] }

function readSections(value: unknown): EventsListSection[] {
  if (!Array.isArray(value)) return []
  return [
    ...new Set(
      value.filter((section): section is EventsListSection => (EVENTS_LIST_SECTIONS as readonly unknown[]).includes(section))
    ),
  ]
}

export async function saveEventsSections(workspaceId: string, sections: EventsSections, database: CustomShellDb = db) {
  await upsertPage(
    workspaceId,
    { sections: { hidden: readSections(sections.hidden), order: readSections(sections.order) } },
    database
  )
}

export async function getEventsWidgets(
  workspaceId: string,
  database: Pick<CustomShellDb, "select"> = db
): Promise<WidgetLayout> {
  const row = await pageRow(workspaceId, database)
  return cleanWidgetLayout(row?.widgets ?? DEFAULT_EVENTS_WIDGETS, EVENTS_WIDGET_IDS, DEFAULT_EVENTS_WIDGETS)
}

export async function saveEventsWidgets(workspaceId: string, layout: unknown, database: CustomShellDb = db): Promise<WidgetLayout> {
  const cleaned = cleanWidgetLayout(layout, EVENTS_WIDGET_IDS, DEFAULT_EVENTS_WIDGETS)
  await upsertPage(workspaceId, { widgets: cleaned }, database)
  return cleaned
}

/** The site's wall clock now, "2026-11-19T15:00". */
async function siteClock(workspaceId: string, database: CustomShellDb, at: Date) {
  return wallClockAt(await siteTimeZone(workspaceId, database), at)
}

const total = sql<number>`count(*)::int`

/** Each row's pill. */
export type EventsSectionCounts = Record<EventsListSection, number>

/**
 * Each pill counts what its row opens on: Events every event, a repeat once;
 * Sign-ups everyone coming, the row's default filter; Featured events the
 * spots running now; Custom fields every event section.
 */
export async function eventsSectionCounts(
  workspaceId: string,
  database: CustomShellDb = db,
  at: Date = now()
): Promise<EventsSectionCounts> {
  const [events, signups, featured, fields] = await Promise.all([
    database
      .select({ total })
      .from(siteEvents)
      .where(and(eq(siteEvents.workspaceId, workspaceId), isNull(siteEvents.seriesId))),
    database
      .select({ total })
      .from(eventSignUps)
      .where(and(eq(eventSignUps.workspaceId, workspaceId), eq(eventSignUps.status, "confirmed"))),
    featuredEvents(workspaceId, { spots: "running", limit: 1, offset: 0 }, database, at),
    database
      .select({ total })
      .from(directoryCustomSections)
      .where(and(eq(directoryCustomSections.workspaceId, workspaceId), eq(directoryCustomSections.kind, "event"))),
  ])
  return {
    events: events[0]?.total ?? 0,
    signups: signups[0]?.total ?? 0,
    featured: featured.total,
    fields: fields[0]?.total ?? 0,
  }
}

/** One row of Coming up: a published event or one date of a repeat, still to come. */
export type ComingUpRow = { id: string; title: string; startDate: string; startTime: string }

/** The next events that are not over, soonest first, and how many there are. */
export async function comingUp(
  workspaceId: string,
  limit: number,
  database: CustomShellDb = db,
  at: Date = now()
): Promise<{ rows: ComingUpRow[]; total: number }> {
  const clock = await siteClock(workspaceId, database, at)
  const where = and(
    eq(siteEvents.workspaceId, workspaceId),
    eq(siteEvents.status, "published"),
    notOverOn(siteEvents, clock)
  )
  const [rows, [count]] = await Promise.all([
    database
      .select({ id: siteEvents.id, title: siteEvents.title, startDate: siteEvents.startDate, startTime: siteEvents.startTime })
      .from(siteEvents)
      .where(where)
      .orderBy(asc(siteEvents.startDate), asc(siteEvents.startTime), asc(siteEvents.id))
      .limit(limit),
    database.select({ total }).from(siteEvents).where(where),
  ])
  return {
    rows: rows.map((row) => ({ ...row, startTime: row.startTime.slice(0, 5) })),
    total: count?.total ?? 0,
  }
}

/** The site's categories that have events in them, with how many, biggest first. */
export async function eventCategoryCounts(
  workspaceId: string,
  database: CustomShellDb = db
): Promise<{ id: string; name: string; count: number }[]> {
  const rows = await database
    .select({ id: categories.id, name: categories.name, count: total })
    .from(categoryRelationships)
    .innerJoin(categories, eq(categories.id, categoryRelationships.categoryId))
    .innerJoin(siteEvents, and(eq(siteEvents.id, categoryRelationships.contentId), isNull(siteEvents.seriesId)))
    .where(
      and(
        eq(categoryRelationships.workspaceId, workspaceId),
        eq(categoryRelationships.contentType, EVENT_CONTENT_TYPE)
      )
    )
    .groupBy(categories.id, categories.name)
  return rows.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
}

/** The left page, its rows, every row's count, Coming up and the categories, in one read. */
export async function getEventsPage(workspaceId: string, database: CustomShellDb = db) {
  const row = await pageRow(workspaceId, database)
  const [counts, coming, categoryCounts] = await Promise.all([
    eventsSectionCounts(workspaceId, database),
    comingUp(workspaceId, 5, database),
    eventCategoryCounts(workspaceId, database),
  ])
  return {
    page: pageOf(row),
    sections: { hidden: readSections(row?.sections.hidden), order: readSections(row?.sections.order) },
    counts,
    coming,
    categories: categoryCounts,
  }
}

/** Overview's figures and lists. */
export type EventsOverview = {
  comingThisWeek: number
  signUpsThisWeek: number
  waitingSuggestions: number
  mostViewed: { id: string; title: string; views: number }[]
  filling: { id: string; title: string; startDate: string; taken: number; seats: number }[]
}

const DAY_MS = 24 * 60 * 60 * 1000

export async function eventsOverview(
  workspaceId: string,
  database: CustomShellDb = db,
  at: Date = now()
): Promise<EventsOverview> {
  const clock = await siteClock(workspaceId, database, at)
  const today = clock.slice(0, 10)
  const live = and(
    eq(siteEvents.workspaceId, workspaceId),
    eq(siteEvents.status, "published"),
    notOverOn(siteEvents, clock)
  )
  const held = sql<number>`count(${eventSignUps.id})::int`
  const [week, signUps, waiting, viewed, filling] = await Promise.all([
    database
      .select({ total })
      .from(siteEvents)
      .where(and(live, lte(siteEvents.startDate, addDays(today, 6)))),
    database
      .select({ total })
      .from(eventSignUps)
      .where(
        and(
          eq(eventSignUps.workspaceId, workspaceId),
          eq(eventSignUps.status, "confirmed"),
          gte(eventSignUps.createdAt, new Date(at.getTime() - 7 * DAY_MS))
        )
      ),
    pendingEventSubmissionCount(workspaceId, database),
    listEvents(workspaceId, { sort: "views", direction: "desc", viewDays: 30, limit: 5 }, database),
    database
      .select({
        id: siteEvents.id,
        title: siteEvents.title,
        startDate: siteEvents.startDate,
        seats: siteEvents.seats,
        taken: held,
      })
      .from(siteEvents)
      .leftJoin(
        eventSignUps,
        and(eq(eventSignUps.eventId, siteEvents.id), inArray(eventSignUps.status, ["confirmed", "offered"]))
      )
      .where(and(live, eq(siteEvents.takesSignUps, true), isNotNull(siteEvents.seats)))
      .groupBy(siteEvents.id)
      .orderBy(desc(sql`${held}::float / nullif(${siteEvents.seats}, 0)`), asc(siteEvents.startDate))
      .limit(5),
  ])
  return {
    comingThisWeek: week[0]?.total ?? 0,
    signUpsThisWeek: signUps[0]?.total ?? 0,
    waitingSuggestions: waiting,
    mostViewed: viewed.events
      .filter((event) => event.views > 0)
      .map((event) => ({ id: event.id, title: event.title, views: event.views })),
    filling: filling.map((row) => ({
      id: row.id,
      title: row.title,
      startDate: row.startDate,
      taken: row.taken,
      seats: row.seats ?? 0,
    })),
  }
}

/** One person on the Sign-ups row: who, for which event, and where they stand. */
export type SignUpRow = {
  id: string
  eventId: string
  eventTitle: string
  eventStart: string
  name: string
  email: string
  answer: string
  status: "confirmed" | "waiting" | "offered"
  createdAt: Date
}

/**
 * Everyone signed up, or waiting for a seat, across the site's events,
 * newest first. Searched by the person's name or email or the event's title.
 */
export async function listAllSignUps(
  workspaceId: string,
  options: { who: SignUpFilter; search?: string; limit: number; offset: number },
  database: CustomShellDb = db
): Promise<{ rows: SignUpRow[]; total: number }> {
  const statuses =
    options.who === "coming"
      ? ["confirmed"]
      : options.who === "waiting"
        ? ["waiting", "offered"]
        : ["confirmed", "waiting", "offered"]
  const pattern = options.search?.trim() ? `%${options.search.trim()}%` : null
  const where = and(
    eq(eventSignUps.workspaceId, workspaceId),
    inArray(eventSignUps.status, statuses),
    pattern
      ? or(ilike(eventSignUps.name, pattern), ilike(eventSignUps.email, pattern), ilike(siteEvents.title, pattern))
      : undefined
  )
  const [rows, [count]] = await Promise.all([
    database
      .select({
        id: eventSignUps.id,
        eventId: eventSignUps.eventId,
        eventTitle: siteEvents.title,
        startDate: siteEvents.startDate,
        startTime: siteEvents.startTime,
        name: eventSignUps.name,
        email: eventSignUps.email,
        answer: eventSignUps.answer,
        status: eventSignUps.status,
        createdAt: eventSignUps.createdAt,
      })
      .from(eventSignUps)
      .innerJoin(siteEvents, eq(siteEvents.id, eventSignUps.eventId))
      .where(where)
      .orderBy(desc(eventSignUps.createdAt), asc(eventSignUps.id))
      .limit(options.limit)
      .offset(options.offset),
    database
      .select({ total })
      .from(eventSignUps)
      .innerJoin(siteEvents, eq(siteEvents.id, eventSignUps.eventId))
      .where(where),
  ])
  return {
    rows: rows.map(({ startDate, startTime, status, ...row }) => ({
      ...row,
      eventStart: `${startDate}T${startTime.slice(0, 5)}`,
      status: status as SignUpRow["status"],
    })),
    total: count?.total ?? 0,
  }
}

/** One featured event: featured by an admin for free, or a spot an owner paid for. */
export type FeaturedEventRow = {
  /** The entitlement's id for a paid spot, the event's for the admin's switch. */
  id: string
  kind: "admin" | "paid"
  eventId: string
  eventTitle: string
  eventStart: string
  /** When a paid spot ends. An admin's runs as long as the switch is on. */
  endsAt: Date | null
  running: boolean
  amount: number | null
  currency: string | null
  buyerEmail: string | null
}

/**
 * The site's featured events: the admin's free switch on a main event that is
 * not over, then every spot an owner paid for, newest first. "running" keeps
 * paid spots that are active and not past their end.
 */
export async function featuredEvents(
  workspaceId: string,
  options: { spots: FeaturedFilter; search?: string; limit: number; offset: number },
  database: CustomShellDb = db,
  at: Date = now()
): Promise<{ rows: FeaturedEventRow[]; total: number }> {
  const clock = await siteClock(workspaceId, database, at)
  // Published and still to come, a repeat while any of its dates is: the
  // Events row's Upcoming rule, so a weekly event stays featured here.
  const toCome = eventTabFilters(clock, database).upcoming
  const [admin, paid, comingIds] = await Promise.all([
    database
      .select({
        id: siteEvents.id,
        title: siteEvents.title,
        startDate: siteEvents.startDate,
        startTime: siteEvents.startTime,
      })
      .from(siteEvents)
      .where(
        and(
          eq(siteEvents.workspaceId, workspaceId),
          eq(siteEvents.featured, true),
          isNull(siteEvents.seriesId),
          options.spots === "running" ? toCome : undefined
        )
      )
      .orderBy(asc(siteEvents.startDate)),
    database
      .select({
        id: directoryFeaturedEntitlements.id,
        eventId: siteEvents.id,
        title: siteEvents.title,
        startDate: siteEvents.startDate,
        startTime: siteEvents.startTime,
        endsAt: directoryFeaturedEntitlements.endsAt,
        status: directoryFeaturedEntitlements.status,
        amount: directoryFeaturedEntitlements.amountTotal,
        currency: directoryFeaturedEntitlements.currency,
        buyerEmail: customShellUsers.email,
      })
      .from(directoryFeaturedEntitlements)
      .innerJoin(siteEvents, eq(siteEvents.id, directoryFeaturedEntitlements.eventId))
      .leftJoin(customShellUsers, eq(customShellUsers.id, directoryFeaturedEntitlements.buyerUserId))
      .where(
        and(
          eq(directoryFeaturedEntitlements.workspaceId, workspaceId),
          isNotNull(directoryFeaturedEntitlements.eventId),
          options.spots === "running"
            ? and(eq(directoryFeaturedEntitlements.status, "active"), sql`${directoryFeaturedEntitlements.endsAt} > ${at.toISOString()}::timestamptz`)
            : undefined
        )
      )
      .orderBy(desc(directoryFeaturedEntitlements.endsAt)),
    database
      .select({ id: siteEvents.id })
      .from(siteEvents)
      .where(and(eq(siteEvents.workspaceId, workspaceId), eq(siteEvents.featured, true), isNull(siteEvents.seriesId), toCome)),
  ])
  const running = new Set(comingIds.map((row) => row.id))
  const words = options.search?.trim().toLowerCase()
  const all: FeaturedEventRow[] = [
    ...admin.map((row) => ({
      id: row.id,
      kind: "admin" as const,
      eventId: row.id,
      eventTitle: row.title,
      eventStart: `${row.startDate}T${row.startTime.slice(0, 5)}`,
      endsAt: null,
      running: running.has(row.id),
      amount: null,
      currency: null,
      buyerEmail: null,
    })),
    ...paid.map((row) => ({
      id: row.id,
      kind: "paid" as const,
      eventId: row.eventId,
      eventTitle: row.title,
      eventStart: `${row.startDate}T${row.startTime.slice(0, 5)}`,
      endsAt: row.endsAt,
      running: row.status === "active" && row.endsAt > at,
      amount: row.amount,
      currency: row.currency,
      buyerEmail: row.buyerEmail,
    })),
  ]
  const rows = words ? all.filter((row) => row.eventTitle.toLowerCase().includes(words)) : all
  return { rows: rows.slice(options.offset, options.offset + options.limit), total: rows.length }
}
