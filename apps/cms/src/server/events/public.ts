import { and, asc, between, eq, isNull, or, sql } from "drizzle-orm"

import { EVENTS_PAGE_SIZE, MAX_EVENTS_ON_A_DAY } from "@/lib/events/events-page"
import { toClock, type EventWhen } from "@/lib/events/event-time"
import { postListingIds, type PostBody } from "@/lib/posts/post-body"
import { readPageVisibility } from "@/server/content/pages"
import { db, type CustomShellDb } from "@/server/db"
import {
  publicListingCardsByIds,
  type PublicCategoryLink,
  type PublicListingCard,
  type PublicSite,
  type VisitorSite,
} from "@/server/directory/public"
import { cachedPublicDirectoryRead } from "@/server/directory/public-cache"
import { categories, categoryRelationships } from "@/server/directory/schema"
import { siteTimeZone } from "@/server/directory/settings"
import { toEvent } from "@/server/events/events"
import { siteEvents, EVENT_CONTENT_TYPE } from "@/server/events/schema"

/**
 * What a visitor may read of a site's events. Every read takes the site from
 * the visited address and selects published events only, so a draft is
 * missing rather than hidden.
 *
 * The Events page's on/off switch is checked by the endpoint before this runs,
 * because a members-only switch depends on who is asking and this answer is
 * cached for everyone. Whether an event is over is worked out by the endpoint
 * too, after the cache, so a cached answer never says an event is still on.
 */

/** An event as a row in the Events page's list or a chip in its month. */
export type PublicEventCard = EventWhen & {
  id: string
  title: string
  slug: string
  summary: string
  coverImage: string
  placeName: string
}

const eventCardColumns = {
  id: siteEvents.id,
  title: siteEvents.title,
  slug: siteEvents.slug,
  summary: siteEvents.summary,
  coverImage: siteEvents.coverImage,
  placeName: siteEvents.placeName,
  startDate: siteEvents.startDate,
  startTime: siteEvents.startTime,
  endDate: siteEvents.endDate,
  endTime: siteEvents.endTime,
}

function toEventCard(row: {
  id: string
  title: string
  slug: string
  summary: string
  coverImage: string
  placeName: string
  startDate: string
  startTime: string
  endDate: string | null
  endTime: string | null
}): PublicEventCard {
  return {
    ...row,
    startTime: toClock(row.startTime),
    endTime: row.endTime ? toClock(row.endTime) : null,
  }
}

/** Soonest first, with the id breaking ties so pages never overlap. */
const soonestFirst = [
  asc(siteEvents.startDate),
  asc(siteEvents.startTime),
  asc(siteEvents.id),
]

export type PublicEvent = EventWhen & {
  id: string
  title: string
  slug: string
  summary: string
  coverImage: string
  body: PostBody
  placeName: string
  placeAddress: string
  categories: PublicCategoryLink[]
}

export type PublicEventPage = {
  site: PublicSite
  event: PublicEvent
  /** The zone the event's clock times are in, like 'America/Toronto'. */
  timeZone: string
  /** Published listings the body's cards point at, as on a post. */
  listingCards: PublicListingCard[]
}

/** Published, on this site. The whole of what a visitor may read. */
function publishedEventsOnSite(siteId: string) {
  return and(
    eq(siteEvents.workspaceId, siteId),
    eq(siteEvents.status, "published")
  )
}

async function readPublicEventUncached(
  site: VisitorSite,
  slug: string,
  database: CustomShellDb
): Promise<PublicEventPage | null> {
  const [row] = await database
    .select()
    .from(siteEvents)
    .where(and(publishedEventsOnSite(site.id), eq(siteEvents.slug, slug)))
    .limit(1)
  if (!row) return null

  const event = toEvent(row)
  const [categoryRows, timeZone, directoryVisibility] = await Promise.all([
    database
      .select({ name: categories.name, slug: categories.slug })
      .from(categoryRelationships)
      .innerJoin(
        categories,
        eq(categories.id, categoryRelationships.categoryId)
      )
      .where(
        and(
          eq(categoryRelationships.workspaceId, site.id),
          eq(categoryRelationships.contentType, EVENT_CONTENT_TYPE),
          eq(categoryRelationships.contentId, row.id)
        )
      )
      .orderBy(asc(categories.name)),
    siteTimeZone(site.id, database),
    readPageVisibility(site.id, "/directory", database),
  ])

  // A card links to the listing's page, so while the directory is not open to
  // everyone the cards are left out rather than pointing at a closed door.
  const listingCards =
    directoryVisibility === "everyone"
      ? await publicListingCardsByIds(
          site.id,
          postListingIds(event.body),
          database
        )
      : []

  return {
    site: { name: site.name, url: site.url },
    event: {
      id: event.id,
      title: event.title,
      slug: event.slug,
      summary: event.summary,
      coverImage: event.coverImage,
      body: event.body,
      startDate: event.startDate,
      startTime: event.startTime,
      endDate: event.endDate,
      endTime: event.endTime,
      placeName: event.placeName,
      placeAddress: event.placeAddress,
      categories: categoryRows,
    },
    timeZone,
    listingCards,
  }
}

/** One published event by its address, or null. */
export function readPublicEvent(
  site: VisitorSite,
  slug: string,
  database: CustomShellDb = db
): Promise<PublicEventPage | null> {
  return cachedPublicDirectoryRead(
    site.id,
    "event",
    { site: { name: site.name, url: site.url }, slug },
    () => readPublicEventUncached(site, slug, database)
  )
}

/**
 * Not over yet by the site's clock: the last day is after today, or it is
 * today and the end time, if there is one, has not come. The same rule as
 * `eventHasEnded`, written for the database.
 */
function notOverAt(nowDay: string, nowTime: string) {
  const lastDay = sql`coalesce(${siteEvents.endDate}, ${siteEvents.startDate})`
  return or(
    sql`${lastDay} > ${nowDay}::date`,
    and(
      sql`${lastDay} = ${nowDay}::date`,
      or(
        isNull(siteEvents.endTime),
        sql`${siteEvents.endTime} > ${nowTime}::time`
      )
    )
  )
}

export type UpcomingEvents = {
  site: PublicSite
  events: PublicEventCard[]
  total: number
  page: number
  pageSize: number
}

/**
 * One page of the events that are not over yet, soonest first. `now` is the
 * site's wall clock, "2026-09-26T18:05", so an answer is cached for a minute
 * at most.
 */
export function readUpcomingEvents(
  site: VisitorSite,
  page: number,
  now: string,
  database: CustomShellDb = db
): Promise<UpcomingEvents> {
  const [nowDay = "", nowTime = ""] = now.split("T")
  return cachedPublicDirectoryRead(
    site.id,
    "upcoming-events",
    { site: { name: site.name, url: site.url }, page, now },
    async () => {
      const where = and(
        publishedEventsOnSite(site.id),
        notOverAt(nowDay, nowTime)
      )
      const [rows, [countRow]] = await Promise.all([
        database
          .select(eventCardColumns)
          .from(siteEvents)
          .where(where)
          .orderBy(...soonestFirst)
          .limit(EVENTS_PAGE_SIZE)
          .offset((page - 1) * EVENTS_PAGE_SIZE),
        database
          .select({ total: sql<number>`count(*)::int` })
          .from(siteEvents)
          .where(where),
      ])
      return {
        site: { name: site.name, url: site.url },
        events: rows.map(toEventCard),
        total: countRow?.total ?? 0,
        page,
        pageSize: EVENTS_PAGE_SIZE,
      }
    }
  )
}

/**
 * Every published event that starts between two days, both included, soonest
 * first: one day's list when the two are the same, or a month grid's weeks.
 * Events that are over are included; the page marks them.
 */
export function readEventsBetween(
  site: VisitorSite,
  from: string,
  to: string,
  database: CustomShellDb = db
): Promise<PublicEventCard[]> {
  return cachedPublicDirectoryRead(
    site.id,
    "events-between",
    { from, to },
    async () => {
      const rows = await database
        .select(eventCardColumns)
        .from(siteEvents)
        .where(
          and(
            publishedEventsOnSite(site.id),
            between(siteEvents.startDate, from, to)
          )
        )
        .orderBy(...soonestFirst)
        // A month is six weeks at most; a day's list is never paged.
        .limit(from === to ? MAX_EVENTS_ON_A_DAY : 42 * MAX_EVENTS_ON_A_DAY)
      return rows.map(toEventCard)
    }
  )
}
