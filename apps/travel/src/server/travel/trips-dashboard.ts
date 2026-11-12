import { and, asc, count, desc, eq, isNull, or, sql } from "drizzle-orm"

import { cleanWidgetLayout, type WidgetLayout } from "@/lib/admin-dashboard/overview-widgets"
import { PAGE_MAX_LENGTH, storedPageBody, type StoredPage } from "@/lib/notes/page-body"
import { readCoverImages } from "@/lib/notes/page-cover"
import { TRAVEL_ERRORS } from "@/lib/travel/errors"
import type { Place } from "@/lib/travel/rules"
import { defaultTripsPage, TRIPS_PAGE_BLOCK_TYPES, withTripsSectionsBlock } from "@/lib/travel/trips-page"
import type { TripsSection } from "@/lib/travel/trips-search"
import { DEFAULT_TRIPS_WIDGETS, TRIPS_WIDGET_IDS } from "@/lib/travel/trips-widgets"
import { now } from "@/server/auth/security"
import { db, type CustomShellDb } from "@/server/db"
import { travelActivities, travelSavedPlaces, travelTrips, travelTripsPages } from "@/server/travel/schema"

/**
 * The Trips dashboard's own records (Tyler, 12 Nov 2026: "one cohesive 3
 * panel design"): each person's left page and Overview layout, the figures
 * Overview's widgets draw, and the places in the Places section that came
 * from trips.
 */

const EMPTY_PAGE = JSON.stringify({ type: "doc", content: [{ type: "paragraph" }] })

/** A page cleaned to what it may hold, its Dashboards block always kept (`withTripsSectionsBlock`). */
function cleanPage(text: string) {
  const stored = storedPageBody(text, TRIPS_PAGE_BLOCK_TYPES) || EMPTY_PAGE
  return JSON.stringify(withTripsSectionsBlock(JSON.parse(stored)))
}

async function pageRow(userId: string, database: Pick<CustomShellDb, "select">) {
  const [row] = await database.select().from(travelTripsPages).where(eq(travelTripsPages.userId, userId)).limit(1)
  return row
}

export async function getTripsPage(userId: string, database: Pick<CustomShellDb, "select"> = db): Promise<StoredPage> {
  return pageOf(await pageRow(userId, database))
}

function pageOf(row: Awaited<ReturnType<typeof pageRow>>): StoredPage {
  const body = row?.body ? cleanPage(row.body) : ""
  return {
    body: body || JSON.stringify(defaultTripsPage()),
    locked: row?.locked ?? false,
    coverUrl: row?.coverUrl ?? null,
    coverImages: readCoverImages(row?.coverImages),
  }
}

async function upsertPage(
  userId: string,
  values: Partial<{
    body: string
    locked: boolean
    coverUrl: string | null
    coverImages: string[]
    widgets: WidgetLayout
    sections: TripsSections
  }>,
  database: CustomShellDb
) {
  const at = now()
  await database
    .insert(travelTripsPages)
    .values({ userId, body: "", locked: false, coverUrl: null, coverImages: [], sections: {}, ...values, updatedAt: at })
    .onConflictDoUpdate({ target: travelTripsPages.userId, set: { ...values, updatedAt: at } })
}

/** Saves what is written, cleaned first. A locked page refuses. */
export async function saveTripsPageBody(userId: string, body: string, database: CustomShellDb = db) {
  if (body.length > PAGE_MAX_LENGTH) throw new Error(TRAVEL_ERRORS.tripsPageTooLong)
  const page = await getTripsPage(userId, database)
  if (page.locked) throw new Error(TRAVEL_ERRORS.tripsPageLocked)
  await upsertPage(userId, { body: cleanPage(body) }, database)
}

export async function setTripsPageLock(userId: string, locked: boolean, database: CustomShellDb = db) {
  await upsertPage(userId, { locked }, database)
}

export async function setTripsPageCover(
  userId: string,
  cover: { coverUrl: string | null; coverImages: string[] },
  database: CustomShellDb = db
) {
  await upsertPage(userId, cover, database)
}

/** The Dashboards block's sections left out, and the order they were dragged into. Overview is never in either. */
export type TripsSections = { hidden: ListSection[]; order: ListSection[] }

/** A section the Dashboards block can hide or move: every one but Overview. */
type ListSection = Exclude<TripsSection, "overview">

function readSections(value: unknown): ListSection[] {
  if (!Array.isArray(value)) return []
  return [...new Set(value.filter((section): section is ListSection => section === "trips" || section === "places"))]
}

export async function getTripsSections(userId: string, database: Pick<CustomShellDb, "select"> = db): Promise<TripsSections> {
  return sectionsOf(await pageRow(userId, database))
}

function sectionsOf(row: Awaited<ReturnType<typeof pageRow>>): TripsSections {
  return { hidden: readSections(row?.sections.hidden), order: readSections(row?.sections.order) }
}

/** The page and the Dashboards block's sections from one read of the person's row, as the dashboard opens. */
export async function getTripsPageAndSections(userId: string, database: Pick<CustomShellDb, "select"> = db) {
  const row = await pageRow(userId, database)
  return { page: pageOf(row), sections: sectionsOf(row) }
}

export async function saveTripsSections(userId: string, sections: TripsSections, database: CustomShellDb = db) {
  await upsertPage(userId, { sections: { hidden: readSections(sections.hidden), order: readSections(sections.order) } }, database)
}

/** How many saved places are in use, the Dashboards block's count beside Places. */
export async function countSavedPlaces(userId: string, database: Pick<CustomShellDb, "select"> = db) {
  const [row] = await database
    .select({ value: count() })
    .from(travelSavedPlaces)
    .where(and(eq(travelSavedPlaces.ownerUserId, userId), isNull(travelSavedPlaces.deletedAt)))
  return Number(row?.value ?? 0)
}

/** Overview's layout as stored, or the starting one. */
export async function getTripsWidgets(userId: string, database: Pick<CustomShellDb, "select"> = db): Promise<WidgetLayout> {
  const row = await pageRow(userId, database)
  return cleanWidgetLayout(row?.widgets ?? DEFAULT_TRIPS_WIDGETS, TRIPS_WIDGET_IDS, DEFAULT_TRIPS_WIDGETS)
}

/** Saves Overview's layout, cleaned, and answers with it as stored. */
export async function saveTripsWidgets(userId: string, layout: unknown, database: CustomShellDb = db): Promise<WidgetLayout> {
  const cleaned = cleanWidgetLayout(layout, TRIPS_WIDGET_IDS, DEFAULT_TRIPS_WIDGETS)
  await upsertPage(userId, { widgets: cleaned }, database)
  return cleaned
}

/** A card on one of the person's trips, for Must do and Ideas. */
export type OverviewCard = { activityId: string; title: string; tripId: string; tripName: string; day: number | null }

/** One trip's money: what its days add up to and its budget, in its own currency. */
export type TripMoney = { tripId: string; currency: string; plannedCents: number; budgetCents: number | null }

/** What Overview's widgets draw that the Trips table doesn't already hold. */
export type TripsOverview = {
  /** Must do cards not done yet, on every trip not archived or in the bin. */
  mustDo: OverviewCard[]
  /** Cards still in a trip's Ideas column, on every trip not archived or in the bin. */
  ideas: OverviewCard[]
  /** Each trip's money, trips in the bin left out. */
  money: TripMoney[]
}

const OVERVIEW_CARDS_MAX = 300

export async function loadTripsOverview(userId: string, database: Pick<CustomShellDb, "select"> = db): Promise<TripsOverview> {
  const live = and(
    eq(travelTrips.ownerUserId, userId),
    isNull(travelTrips.deletedAt),
    isNull(travelTrips.archivedAt),
    isNull(travelActivities.deletedAt)
  )
  const card = {
    activityId: travelActivities.id,
    title: travelActivities.title,
    tripId: travelTrips.id,
    tripName: travelTrips.name,
    day: travelActivities.day,
  }
  const [mustDo, ideas, money] = await Promise.all([
    database
      .select(card)
      .from(travelActivities)
      .innerJoin(travelTrips, eq(travelTrips.id, travelActivities.tripId))
      .where(and(live, eq(travelActivities.mustDo, true), eq(travelActivities.done, false)))
      .orderBy(asc(travelTrips.startDate), asc(travelActivities.day), asc(travelActivities.position))
      .limit(OVERVIEW_CARDS_MAX),
    database
      .select(card)
      .from(travelActivities)
      .innerJoin(travelTrips, eq(travelTrips.id, travelActivities.tripId))
      .where(and(live, isNull(travelActivities.day)))
      .orderBy(asc(travelTrips.startDate), asc(travelActivities.position))
      .limit(OVERVIEW_CARDS_MAX),
    // The trip's total as its Budget block adds it (`tripTotals`): costs on
    // its days only, Ideas left out.
    database
      .select({
        tripId: travelTrips.id,
        currency: travelTrips.currency,
        budgetCents: travelTrips.budgetCents,
        plannedCents: sql<number>`coalesce(sum(${travelActivities.costCents}) filter (where ${travelActivities.deletedAt} is null and ${travelActivities.day} is not null and ${travelActivities.day} <= ${travelTrips.days}), 0)`.mapWith(Number),
      })
      .from(travelTrips)
      .leftJoin(travelActivities, eq(travelActivities.tripId, travelTrips.id))
      .where(and(eq(travelTrips.ownerUserId, userId), isNull(travelTrips.deletedAt)))
      .groupBy(travelTrips.id),
  ])
  return { mustDo, ideas, money }
}

/**
 * A place from a trip, for the Places section's Go again and Been tabs: a
 * card marked Done, or ticked Would go again, on a trip not in the bin.
 */
export type TripPlace = {
  id: string
  title: string
  typeId: string | null
  place: Place | null
  photoUrl: string | null
  website: string | null
  phone: string | null
  menuUrl: string | null
  rating: number | null
  goAgain: boolean
  done: boolean
  tripId: string
  tripName: string
  /** The trip's first day, for "last time you went"; null for a trip with no dates. */
  tripStart: string | null
  day: number | null
}

const TRIP_PLACES_MAX = 2000

export async function listTripPlaces(userId: string, database: Pick<CustomShellDb, "select"> = db): Promise<TripPlace[]> {
  return database
    .select({
      id: travelActivities.id,
      title: travelActivities.title,
      typeId: travelActivities.typeId,
      place: travelActivities.place,
      photoUrl: travelActivities.photoUrl,
      website: travelActivities.website,
      phone: travelActivities.phone,
      menuUrl: travelActivities.menuUrl,
      rating: travelActivities.rating,
      goAgain: travelActivities.goAgain,
      done: travelActivities.done,
      tripId: travelTrips.id,
      tripName: travelTrips.name,
      tripStart: travelTrips.startDate,
      day: travelActivities.day,
    })
    .from(travelActivities)
    .innerJoin(travelTrips, eq(travelTrips.id, travelActivities.tripId))
    .where(
      and(
        eq(travelTrips.ownerUserId, userId),
        isNull(travelTrips.deletedAt),
        isNull(travelActivities.deletedAt),
        or(eq(travelActivities.done, true), eq(travelActivities.goAgain, true))
      )
    )
    .orderBy(desc(travelTrips.startDate), asc(travelActivities.day), asc(travelActivities.position))
    .limit(TRIP_PLACES_MAX)
}
