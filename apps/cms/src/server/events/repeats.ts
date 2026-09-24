import { and, asc, count, eq, gte, isNotNull, not, sql } from "drizzle-orm"

import {
  addDays,
  addMonthsToDay,
  nextRepeatDate,
  parseRepeatRule,
  repeatProblem,
  sameRepeat,
  type RepeatRule,
} from "@/lib/events/event-repeat"
import { wallClockAt } from "@/lib/events/event-time"
import { now, uuid } from "@/server/auth/security"
import { db, type CustomShellDb } from "@/server/db"
import {
  categoryIdsFor,
  deleteCategoryRowsFor,
  setContentCategories,
} from "@/server/directory/content-categories"
import { clearPublicDirectoryCache } from "@/server/directory/public-cache"
import { categoryRelationships } from "@/server/directory/schema"
import { siteTimeZone } from "@/server/directory/settings"
import {
  firstFreeEventSlug,
  positionForSave,
  updateEvent,
  type SiteEvent,
} from "@/server/events/events"
import {
  siteEvents,
  EVENT_CONTENT_TYPE,
  type EventRow,
} from "@/server/events/schema"
import { holdsSignUps } from "@/server/events/sign-ups"

/**
 * Repeating events. The main event holds the rule and is the first date. Each
 * later date is its own event with its own page, made ahead of time and
 * pointing back at the main event, the way the old Directory app's
 * `event-recurrence.server.ts` did it.
 *
 * - **How far ahead:** the next 8 dates, counting the main event while it is
 *   still to come, but never more than 3 months past today.
 * - **Topping up:** a background job checks every 15 minutes and makes what
 *   is missing. Each date is made for one day of the rule, and the database
 *   refuses a second date for the same day, so two runs at once never make a
 *   date twice.
 * - **Never again:** `repeat_made_until` remembers the last day worked
 *   through, so a date the admin deleted is not made a second time.
 * - **Editing the main event** copies the change to every future date that
 *   was not saved by itself. Changing the rule or the start day clears those
 *   dates and makes them again, and the dates saved by themselves are kept
 *   and named back to the admin.
 *
 * "Today" is the site's own calendar day, read in its time zone.
 */

export const DATES_KEPT_AHEAD = 8
export const MONTHS_KEPT_AHEAD = 3
const TOP_UP_EVERY_MS = 15 * 60 * 1000

async function siteToday(
  workspaceId: string,
  database: CustomShellDb,
  at: Date
): Promise<string> {
  return wallClockAt(await siteTimeZone(workspaceId, database), at).slice(0, 10)
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000)
}

/** The longest main address that still fits "-2026-10-08" in the column. */
const MAIN_SLUG_ROOM = 148

/**
 * One date for one day of the rule, with the main event's content and
 * categories. False when that day already has its date.
 */
async function makeDate(
  main: EventRow,
  date: string,
  categoryIds: string[],
  database: CustomShellDb
): Promise<boolean> {
  const slug = await firstFreeEventSlug(
    main.workspaceId,
    `${main.slug.slice(0, MAIN_SLUG_ROOM)}-${date}`,
    database
  )
  const at = now()
  return database.transaction(async (tx) => {
    const [made] = await tx
      .insert(siteEvents)
      .values({
        id: uuid(),
        workspaceId: main.workspaceId,
        ...sharedWithDates(main, at),
        slug,
        startDate: date,
        endDate: main.endDate
          ? addDays(date, daysBetween(main.startDate, main.endDate))
          : null,
        seriesId: main.id,
        seriesDate: date,
        createdAt: at,
        updatedAt: at,
      })
      // The day has its date already, from another run or an earlier one.
      // Any other clash fails, and the job tries again next time.
      .onConflictDoNothing({
        target: [siteEvents.seriesId, siteEvents.seriesDate],
      })
      .returning({ id: siteEvents.id })
    if (!made) return false
    if (categoryIds.length) {
      await tx.insert(categoryRelationships).values(
        categoryIds.map((categoryId) => ({
          id: uuid(),
          workspaceId: main.workspaceId,
          categoryId,
          contentType: EVENT_CONTENT_TYPE,
          contentId: made.id,
          isPrimary: false,
          createdAt: at,
        }))
      )
    }
    return true
  })
}

/** What every date copies from its main event. Its own day is its own. */
function sharedWithDates(main: EventRow, at: Date) {
  return {
    title: main.title,
    summary: main.summary,
    coverImage: main.coverImage,
    body: main.body,
    status: main.status,
    visibility: main.visibility,
    publishedAt: main.status === "published" ? at : null,
    startTime: main.startTime,
    endTime: main.endTime,
    listingId: main.listingId,
    placeName: main.placeName,
    placeAddress: main.placeAddress,
    latitude: main.latitude,
    longitude: main.longitude,
    locatedFor: main.locatedFor,
    takesSignUps: main.takesSignUps,
    seats: main.seats,
  }
}

/**
 * Makes the dates the main event is missing, up to 8 to come or 3 months
 * ahead, whichever is shorter. Returns how many it made.
 */
export async function topUpSeries(
  main: EventRow,
  today: string,
  database: CustomShellDb = db
): Promise<number> {
  const rule = parseRepeatRule(main.repeatRule)
  if (!rule) return 0

  const [ahead] = await database
    .select({ dates: count() })
    .from(siteEvents)
    .where(
      and(eq(siteEvents.seriesId, main.id), gte(siteEvents.seriesDate, today))
    )
  let wanted =
    DATES_KEPT_AHEAD - (ahead?.dates ?? 0) - (main.startDate >= today ? 1 : 0)
  if (wanted <= 0) return 0

  const horizon = addMonthsToDay(today, MONTHS_KEPT_AHEAD)
  // Never before the main event, never over days already worked through,
  // and never in the past.
  const from = [main.startDate, main.repeatMadeUntil ?? "", addDays(today, -1)]
    .sort()
    .at(-1)!
  const categoryIds = await categoryIdsFor(
    main.workspaceId,
    EVENT_CONTENT_TYPE,
    main.id,
    database
  )

  let cursor = from
  let made = 0
  while (wanted > 0) {
    const next = nextRepeatDate(rule, cursor)
    if (!next || next > horizon) break
    cursor = next
    wanted -= 1
    if (await makeDate(main, next, categoryIds, database)) made += 1
  }

  if (cursor !== from) {
    await database
      .update(siteEvents)
      .set({
        repeatMadeUntil: sql`greatest(${siteEvents.repeatMadeUntil}, ${cursor}::date)`,
      })
      .where(eq(siteEvents.id, main.id))
  }
  if (made) clearPublicDirectoryCache(main.workspaceId)
  return made
}

/**
 * Copies the main event onto its future dates that were not saved by
 * themselves: the content, status, who can find it, times, place (a listing
 * or a typed one, with its map position) and categories. Each keeps its own day, and an event over several days keeps
 * its length.
 */
async function copyMainToDates(
  main: EventRow,
  today: string,
  database: CustomShellDb
): Promise<void> {
  const at = now()
  const span = main.endDate ? daysBetween(main.startDate, main.endDate) : null
  const { publishedAt: _publishedAt, ...shared } = sharedWithDates(main, at)
  const categoryIds = await categoryIdsFor(
    main.workspaceId,
    EVENT_CONTENT_TYPE,
    main.id,
    database
  )

  await database.transaction(async (tx) => {
    const updated = await tx
      .update(siteEvents)
      .set({
        ...shared,
        // The first publish dates a date; later ones keep that date.
        ...(main.status === "published"
          ? {
              publishedAt: sql`coalesce(${siteEvents.publishedAt}, ${at.toISOString()}::timestamptz)`,
            }
          : {}),
        startDate: sql`${siteEvents.seriesDate}`,
        endDate:
          span === null ? null : sql`${siteEvents.seriesDate} + ${span}::int`,
        updatedAt: at,
      })
      .where(futureDatesFollowing(main.id, today))
      .returning({ id: siteEvents.id })
    for (const date of updated) {
      await setContentCategories(
        main.workspaceId,
        EVENT_CONTENT_TYPE,
        date.id,
        categoryIds,
        tx
      )
    }
  })
  clearPublicDirectoryCache(main.workspaceId)
}

/** Today or later, and still following the main event. */
function futureDatesFollowing(mainId: string, today: string) {
  return and(
    eq(siteEvents.seriesId, mainId),
    eq(siteEvents.editedAlone, false),
    gte(siteEvents.seriesDate, today)
  )
}

/**
 * Deletes the future dates that still follow the main event, so the rule can
 * make them again. The past, and dates saved by themselves, stay. So does a
 * date somebody has signed up for, because deleting it would delete their
 * place; its days come back, soonest first, so the admin can be told.
 */
async function clearFutureDates(
  main: EventRow,
  today: string,
  database: CustomShellDb
): Promise<string[]> {
  const kept = await database.transaction(async (tx) => {
    const withSignUps = await tx
      .select({ startDate: siteEvents.startDate })
      .from(siteEvents)
      .where(and(futureDatesFollowing(main.id, today), holdsSignUps(tx)))
      .orderBy(asc(siteEvents.seriesDate))
    const cleared = await tx
      .delete(siteEvents)
      .where(and(futureDatesFollowing(main.id, today), not(holdsSignUps(tx))))
      .returning({ id: siteEvents.id })
    await deleteCategoryRowsFor(
      main.workspaceId,
      EVENT_CONTENT_TYPE,
      cleared.map((row) => row.id),
      tx
    )
    await tx
      .update(siteEvents)
      .set({ repeatMadeUntil: null })
      .where(eq(siteEvents.id, main.id))
    return withSignUps.map((row) => row.startDate)
  })
  clearPublicDirectoryCache(main.workspaceId)
  return kept
}

/** The days of future dates that were saved by themselves, soonest first. */
async function datesSavedAlone(
  mainId: string,
  today: string,
  database: CustomShellDb
): Promise<string[]> {
  const rows = await database
    .select({ startDate: siteEvents.startDate })
    .from(siteEvents)
    .where(
      and(
        eq(siteEvents.seriesId, mainId),
        eq(siteEvents.editedAlone, true),
        gte(siteEvents.seriesDate, today)
      )
    )
    .orderBy(asc(siteEvents.seriesDate))
  return rows.map((row) => row.startDate)
}

async function readRow(
  workspaceId: string,
  id: string,
  database: CustomShellDb
): Promise<EventRow> {
  const [row] = await database
    .select()
    .from(siteEvents)
    .where(and(eq(siteEvents.id, id), eq(siteEvents.workspaceId, workspaceId)))
    .limit(1)
  if (!row) throw new Error("That event no longer exists.")
  return row
}

export type EventSave = Parameters<typeof updateEvent>[2] & {
  categoryIds?: string[]
  /** Null stops repeating; left out keeps the repeat as it is. */
  repeat?: unknown
}

/**
 * Saves an event from Admin → Events, and its dates with it, in one
 * transaction so a refused repeat leaves nothing half saved.
 *
 * `keptDates` names the future dates that were saved by themselves and were
 * kept when the rule or the start day changed, and `keptForSignUps` the ones
 * kept because somebody signed up for them, so the admin can be told.
 */
export async function saveEventAndDates(
  workspaceId: string,
  id: string,
  input: EventSave,
  database: CustomShellDb = db,
  at: Date = new Date()
): Promise<{
  event: SiteEvent
  keptDates: string[]
  keptForSignUps: string[]
}> {
  const { categoryIds, repeat: rawRepeat, ...fields } = input
  const position = await positionForSave(workspaceId, id, fields, database)
  return database.transaction(async (tx) => {
    const before = await readRow(workspaceId, id, tx)
    const oldRule = parseRepeatRule(before.repeatRule)
    let newRule: RepeatRule | null = oldRule
    if (rawRepeat !== undefined) {
      newRule = rawRepeat === null ? null : parseRepeatRule(rawRepeat)
      if (rawRepeat !== null && !newRule) {
        throw new Error(
          "That repeat is not one this site can make. Pick weekly days, or a week and a day of the month."
        )
      }
    }
    if (before.seriesId && newRule) {
      throw new Error(
        "This is one date of a repeating event. Change the repeat on the main event."
      )
    }
    if (before.seriesId && fields.featured !== undefined) {
      throw new Error(
        "This is one date of a repeating event. Feature it from the main event."
      )
    }

    let event = await updateEvent(workspaceId, id, fields, tx)
    if (position) {
      await tx.update(siteEvents).set(position).where(eq(siteEvents.id, id))
      event = {
        ...event,
        locatedFor: position.locatedFor,
        position:
          position.latitude !== null && position.longitude !== null
            ? { latitude: position.latitude, longitude: position.longitude }
            : null,
      }
    }
    if (categoryIds !== undefined) {
      await setContentCategories(
        workspaceId,
        EVENT_CONTENT_TYPE,
        id,
        categoryIds,
        tx
      )
    }
    if (newRule) {
      const problem = repeatProblem(newRule, event.startDate)
      if (problem) throw new Error(problem)
    }
    if (before.seriesId || (!oldRule && !newRule)) {
      return {
        event: { ...event, repeat: newRule },
        keptDates: [],
        keptForSignUps: [],
      }
    }

    const ruleChanged = !sameRepeat(oldRule, newRule)
    if (ruleChanged) {
      await tx
        .update(siteEvents)
        .set({ repeatRule: newRule })
        .where(eq(siteEvents.id, id))
    }
    const today = await siteToday(workspaceId, tx, at)
    let keptDates: string[] = []
    let keptForSignUps: string[] = []
    if (ruleChanged || before.startDate !== event.startDate) {
      keptForSignUps = await clearFutureDates(before, today, tx)
      keptDates = await datesSavedAlone(id, today, tx)
    } else {
      await copyMainToDates(await readRow(workspaceId, id, tx), today, tx)
    }
    await topUpSeries(await readRow(workspaceId, id, tx), today, tx)
    return { event: { ...event, repeat: newRule }, keptDates, keptForSignUps }
  })
}

/** Every repeating event on every site, topped up. Returns how many dates it made. */
export async function topUpEverySeries(
  database: CustomShellDb = db,
  at: Date = new Date()
): Promise<number> {
  const mains = await database
    .select()
    .from(siteEvents)
    .where(isNotNull(siteEvents.repeatRule))
  const todays = new Map<string, string>()
  let made = 0
  for (const main of mains) {
    try {
      let today = todays.get(main.workspaceId)
      if (!today) {
        today = await siteToday(main.workspaceId, database, at)
        todays.set(main.workspaceId, today)
      }
      made += await topUpSeries(main, today, database)
    } catch (error) {
      // One broken series never stops the rest; it is tried again next time.
      console.error(`Repeating event ${main.id} was not topped up`, error)
    }
  }
  return made
}

let lastTopUp = 0

/**
 * The background job. The shell's loop calls it every fifteen seconds, and
 * it does the work once every 15 minutes, which is soon enough for a date
 * that falls 8 weeks out.
 */
export async function runRepeatTopUps(): Promise<void> {
  if (Date.now() - lastTopUp < TOP_UP_EVERY_MS) return
  lastTopUp = Date.now()
  await topUpEverySeries()
}
