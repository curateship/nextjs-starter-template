import {
  and,
  asc,
  between,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNull,
  or,
  sql,
} from "drizzle-orm"

import { listingShareImageVersion } from "@/lib/directory/listing-share-image"
import {
  DIRECTORY_SUGGESTION_EVENT_LIMIT,
  DIRECTORY_SUGGESTION_MIN_LENGTH,
} from "@/lib/directory/public-search"
import { EVENTS_PAGE_SIZE, MAX_EVENTS_ON_A_DAY } from "@/lib/events/events-page"
import { eventShareImageKicker } from "@/lib/events/event-share-image"
import { toClock, wallClockAt, type EventWhen } from "@/lib/events/event-time"
import {
  searchSnippet,
  siteSearchPattern,
  type SiteSearchResult,
} from "@/lib/pages/site-search"
import {
  cleanPostBody,
  postBodyText,
  postListingIds,
  type PostBody,
} from "@/lib/posts/post-body"
import type { SitemapEntry } from "@/server/app-options"
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
 * A private event is published but unlisted. Its own page opens from its
 * link, and every list here leaves it out, because every list filters through
 * `listedEventsOnSite`. The old Directory app let each list check for itself,
 * and all but one forgot. `public.test.ts` fails when a new export here is not
 * proven to drop private events.
 *
 * The event page and the Events page leave the on/off switch to their
 * endpoint, because a members-only switch depends on who is asking and those
 * answers are cached for everyone. Whether an event is over is worked out by
 * the endpoint too, after the cache, so a cached answer never says an event is
 * still on.
 *
 * Search, the suggestions, the sitemap and the feed are read by anyone, so they
 * check `eventsArePublic` themselves and show nothing unless the Events page is
 * open to everyone.
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
  /** Left out of every list, and its page asks search engines to skip it. */
  isPrivate: boolean
}

export type PublicEventPage = {
  site: PublicSite
  event: PublicEvent
  /** The zone the event's clock times are in, like 'America/Toronto'. */
  timeZone: string
  /** Published listings the body's cards point at, as on a post. */
  listingCards: PublicListingCard[]
  /** Names the drawn share card, so an edit gives it a new address. */
  shareImageVersion: string
}

/**
 * Published, on this site. What a visitor with an event's link may open,
 * private events included. Only a read of one event by its address uses this.
 */
function publishedEventsOnSite(siteId: string) {
  return and(
    eq(siteEvents.workspaceId, siteId),
    eq(siteEvents.status, "published")
  )
}

/**
 * Published, on this site, and not private: what a visitor may find without
 * the link. Every list of events goes through this one filter.
 */
function listedEventsOnSite(siteId: string) {
  return and(publishedEventsOnSite(siteId), eq(siteEvents.visibility, "public"))
}

/**
 * Whether events may appear in places anyone can read without signing in:
 * search, the search box's suggestions, the sitemap, the feed and the share
 * card. Only when the Events page is open to everyone, the same rule posts
 * follow.
 */
export async function eventsArePublic(
  siteId: string,
  database: CustomShellDb = db
): Promise<boolean> {
  return (await readPageVisibility(siteId, "/events", database)) === "everyone"
}

/**
 * Whether this visitor may read the site's events, and why: "everyone" when
 * the Events page is open to all, "members" when it is kept for members and
 * they are signed in, and null otherwise. `isSignedIn` is only asked in the
 * members case.
 */
export async function eventsAccessFor(
  siteId: string,
  isSignedIn: () => Promise<boolean>,
  database: CustomShellDb = db
): Promise<"everyone" | "members" | null> {
  const visibility = await readPageVisibility(siteId, "/events", database)
  if (visibility === "everyone") return "everyone"
  if (visibility === "members" && (await isSignedIn())) return "members"
  return null
}

/** The site's wall clock now, "2026-09-26T18:05". */
async function siteNow(siteId: string, database: CustomShellDb, at: Date) {
  return wallClockAt(await siteTimeZone(siteId, database), at)
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
      isPrivate: event.visibility === "private",
    },
    timeZone,
    listingCards,
    shareImageVersion: listingShareImageVersion({
      title: event.title,
      kicker: eventShareImageKicker(event),
      siteName: site.name,
      accentColor: site.accentColor ?? "",
      updatedAt: event.updatedAt,
    }),
  }
}

/** One published event by its address, private ones included, or null. */
export function readPublicEvent(
  site: VisitorSite,
  slug: string,
  database: CustomShellDb = db
): Promise<PublicEventPage | null> {
  return cachedPublicDirectoryRead(
    site.id,
    "event",
    {
      site: { name: site.name, url: site.url },
      accentColor: site.accentColor ?? "",
      slug,
    },
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
      const where = and(listedEventsOnSite(site.id), notOverAt(nowDay, nowTime))
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

/** More upcoming events than a site plans, in a file a calendar app still reads. */
const CALENDAR_FEED_LIMIT = 500

type CalendarFeed = {
  timeZone: string
  events: (EventWhen & {
    id: string
    title: string
    slug: string
    summary: string
    placeName: string
    placeAddress: string
  })[]
}

/**
 * The events for the site's calendar subscription: published and not over
 * yet by the site's clock, soonest first. Null unless the Events page is open
 * to everyone, because a calendar app asking for the feed is never signed in.
 */
export async function readCalendarFeed(
  siteId: string,
  at: Date,
  database: CustomShellDb = db
): Promise<CalendarFeed | null> {
  if (!(await eventsArePublic(siteId, database))) return null
  const timeZone = await siteTimeZone(siteId, database)
  const [nowDay = "", nowTime = ""] = wallClockAt(timeZone, at).split("T")
  const rows = await database
    .select({
      id: siteEvents.id,
      title: siteEvents.title,
      slug: siteEvents.slug,
      summary: siteEvents.summary,
      placeName: siteEvents.placeName,
      placeAddress: siteEvents.placeAddress,
      startDate: siteEvents.startDate,
      startTime: siteEvents.startTime,
      endDate: siteEvents.endDate,
      endTime: siteEvents.endTime,
    })
    .from(siteEvents)
    .where(and(listedEventsOnSite(siteId), notOverAt(nowDay, nowTime)))
    .orderBy(...soonestFirst)
    .limit(CALENDAR_FEED_LIMIT)
  return {
    timeZone,
    events: rows.map((row) => ({
      ...row,
      startTime: toClock(row.startTime),
      endTime: row.endTime ? toClock(row.endTime) : null,
    })),
  }
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
            listedEventsOnSite(site.id),
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

/**
 * Published events for the shell's whole-site search. Past events are found
 * too, because their pages still open.
 */
export async function eventSearchResults(
  siteId: string,
  rawQuery: string,
  limit: number,
  database: CustomShellDb = db
): Promise<SiteSearchResult[]> {
  const query = rawQuery.trim()
  if (!query || limit < 1) return []
  if (!(await eventsArePublic(siteId, database))) return []

  const pattern = siteSearchPattern(query)
  // Only the text of written blocks: a listing card holds nothing but an id.
  const bodyText = sql<string>`jsonb_path_query_array(${siteEvents.body}, '$.**.text')::text`
  const rows = await database
    .select({
      title: siteEvents.title,
      slug: siteEvents.slug,
      summary: siteEvents.summary,
      body: siteEvents.body,
    })
    .from(siteEvents)
    .where(
      and(
        listedEventsOnSite(siteId),
        or(
          ilike(siteEvents.title, pattern),
          ilike(siteEvents.summary, pattern),
          ilike(siteEvents.placeName, pattern),
          ilike(bodyText, pattern)
        )
      )
    )
    .orderBy(
      desc(ilike(siteEvents.title, pattern)),
      asc(siteEvents.title),
      asc(siteEvents.id)
    )
    .limit(limit)

  return rows.map((row) => ({
    type: "Event",
    title: row.title,
    snippet: searchSnippet(
      row.summary.trim() || postBodyText(cleanPostBody(row.body)),
      query
    ),
    path: `/events/${row.slug}`,
  }))
}

type EventSuggestion = { title: string; slug: string; startDate: string }

/**
 * The events the directory's search box offers as somebody types: ones not
 * over yet by the site's clock, soonest first, matched on title and summary.
 * A past event is left out, because somebody typing is after what is on.
 */
export async function readEventSuggestions(
  siteId: string,
  rawQuery: string,
  at: Date,
  database: CustomShellDb = db
): Promise<EventSuggestion[]> {
  const query = rawQuery.trim()
  if (query.length < DIRECTORY_SUGGESTION_MIN_LENGTH) return []
  if (!(await eventsArePublic(siteId, database))) return []

  const [nowDay = "", nowTime = ""] = (
    await siteNow(siteId, database, at)
  ).split("T")
  const pattern = siteSearchPattern(query)
  return database
    .select({
      title: siteEvents.title,
      slug: siteEvents.slug,
      startDate: siteEvents.startDate,
    })
    .from(siteEvents)
    .where(
      and(
        listedEventsOnSite(siteId),
        notOverAt(nowDay, nowTime),
        or(ilike(siteEvents.title, pattern), ilike(siteEvents.summary, pattern))
      )
    )
    .orderBy(...soonestFirst)
    .limit(DIRECTORY_SUGGESTION_EVENT_LIMIT)
}

/** How long a past event stays in the sitemap after its last day. */
const PAST_EVENT_SITEMAP_DAYS = 30

/**
 * Every published event's address for the flat sitemap file, until 30 days
 * after its last day by the site's calendar. The page still opens after that;
 * it is only no longer offered to search engines.
 */
export async function eventSitemapEntries(
  siteId: string,
  database: CustomShellDb = db,
  at: Date = new Date()
): Promise<SitemapEntry[]> {
  if (!(await eventsArePublic(siteId, database))) return []
  const today = (await siteNow(siteId, database, at)).slice(0, 10)
  const lastDay = sql`coalesce(${siteEvents.endDate}, ${siteEvents.startDate})`
  const rows = await database
    .select({ slug: siteEvents.slug, updatedAt: siteEvents.updatedAt })
    .from(siteEvents)
    .where(
      and(
        listedEventsOnSite(siteId),
        gte(lastDay, sql`${today}::date - ${PAST_EVENT_SITEMAP_DAYS}::int`)
      )
    )
    .orderBy(asc(siteEvents.slug))
  return rows.map((row) => ({
    path: `/events/${row.slug}`,
    updatedAt: row.updatedAt,
  }))
}

type EventFeedRow = {
  id: string
  title: string
  slug: string
  summary: string
  body: PostBody
  publishedAt: Date
  category: string | null
}

/**
 * The most recently published events with their first category, for the
 * feed. Ordered by the day each was published, not the day it happens.
 */
export async function newestEventsForFeed(
  siteId: string,
  limit: number,
  database: CustomShellDb = db
): Promise<EventFeedRow[]> {
  if (!(await eventsArePublic(siteId, database))) return []
  const rows = await database
    .select({
      id: siteEvents.id,
      title: siteEvents.title,
      slug: siteEvents.slug,
      summary: siteEvents.summary,
      body: siteEvents.body,
      publishedAt: siteEvents.publishedAt,
    })
    .from(siteEvents)
    .where(listedEventsOnSite(siteId))
    .orderBy(desc(siteEvents.publishedAt), asc(siteEvents.id))
    .limit(limit)
  if (rows.length === 0) return []

  const categoryRows = await database
    .select({ eventId: categoryRelationships.contentId, name: categories.name })
    .from(categoryRelationships)
    .innerJoin(categories, eq(categories.id, categoryRelationships.categoryId))
    .where(
      and(
        eq(categoryRelationships.workspaceId, siteId),
        eq(categoryRelationships.contentType, EVENT_CONTENT_TYPE),
        inArray(
          categoryRelationships.contentId,
          rows.map((row) => row.id)
        )
      )
    )
    .orderBy(asc(categories.name))
  const categoryFor = new Map<string, string>()
  for (const row of categoryRows) {
    if (!categoryFor.has(row.eventId)) categoryFor.set(row.eventId, row.name)
  }

  return rows.map((row) => ({
    ...row,
    body: cleanPostBody(row.body),
    // The database refuses a published event with no date, so the fallback
    // is never reached; it only satisfies the column's nullable type.
    publishedAt: row.publishedAt ?? new Date(0),
    category: categoryFor.get(row.id) ?? null,
  }))
}
