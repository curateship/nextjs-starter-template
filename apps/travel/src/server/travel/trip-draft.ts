import { and, eq, isNull } from "drizzle-orm"
import { z } from "zod"

import type { BuiltinType } from "@/lib/travel/activity-types"
import { dateOfDay, formatDayDate } from "@/lib/travel/dates"
import { TRAVEL_ERRORS } from "@/lib/travel/errors"
import { TIME_PATTERN } from "@/lib/travel/rules"
import { now, uuid } from "@/server/auth/security"
import { db, type CustomShellDb } from "@/server/db"
import { requireTrip } from "@/server/travel/access"
import { meteredAi, type AskAi } from "@/server/travel/ai"
import { autocompletePlaces, googleEnabled, placeDetails, type PlaceDetails } from "@/server/travel/google"
import { travelActivities } from "@/server/travel/schema"
import { blankActivity, MAX_ACTIVITIES } from "@/server/travel/trips"
import { builtinTypeId, checkTypeId } from "@/server/travel/types"

/**
 * Draft a trip with AI (Travel features part 7; Tyler, 3 Nov 2026: "Sights
 * and food, timed"). The AI writes 3 to 5 sights and meals for each empty day,
 * with start times and lengths, for the trip's destination. Nothing is saved
 * when the plan is drafted: it goes back to the window to be checked, changed
 * or unticked, and only what is left ticked is made.
 *
 * A day that already has a card is left alone, so a draft never adds to or
 * removes anything already planned. At most 14 days are drafted at once; a
 * longer trip drafts again for the rest.
 */

/** The most days one draft plans, which keeps the answer, and its cost, bounded. */
export const DRAFT_DAYS_MAX = 14
/** The most activities a drafted day keeps. */
const PER_DAY_MAX = 5
/** About 45 words a card, 70 cards, with room to spare. */
const MAX_ANSWER_TOKENS = 6_000
/** Places looked up on Google at once while making the plan. */
const AT_ONCE = 4

const KINDS = ["flight", "hotel", "food", "sight", "transport", "other"] as const satisfies readonly BuiltinType[]

export type DraftItem = {
  day: number
  title: string
  /** The person's own type for what the AI said it is. Null when they removed it. */
  typeId: string | null
  startTime: string | null
  durationMinutes: number | null
}

export type TripDraft = {
  items: DraftItem[]
  /** The days planned. */
  days: number[]
  /** Days left alone because they already had something on them. */
  skipped: number[]
  /** Empty days past the 14 drafted, to draft next time. */
  later: number
}

/** The shell's metered AI, set for drafting a plan. */
export function draftAi(userId: string): AskAi {
  return meteredAi(userId, { feature: "travel-trip-draft", maxTokens: MAX_ANSWER_TOKENS, failed: TRAVEL_ERRORS.draftFailed })
}

/** Any field the AI gets wrong becomes empty, and a card with no name is dropped, rather than failing the plan. */
const activitySchema = z.object({
  title: z.string().trim().min(1).max(200),
  kind: z.enum(KINDS).catch("other"),
  startTime: z.string().regex(TIME_PATTERN).nullable().catch(null),
  minutes: z.number().int().min(15).max(600).nullable().catch(null),
})
const answerSchema = z.object({
  days: z.array(
    z.object({
      day: z.number().int(),
      activities: z.array(z.unknown()).catch([]),
    })
  ),
})

const SYSTEM_PROMPT = [
  "You plan days of a trip, as a well-travelled local friend would.",
  "Answer with one JSON object and nothing else. No code fence, no words before or after.",
  'The shape is {"days":[{"day":1,"activities":[{"title":"...","kind":"sight","startTime":"09:00","minutes":90}]}]}.',
  'Give every day asked for 3 to 5 activities in the order they happen: sights, plus lunch and dinner at real places.',
  '"title" is the place\'s own name as Google Maps knows it, such as "Fushimi Inari Taisha" or "Nishiki Market".',
  '"kind" is one of "sight", "food", "transport", "other".',
  '"startTime" is 24-hour HH:MM in local time, and "minutes" how long to spend there.',
  "Leave time to get between places, keep each day in one part of town, and never repeat a place on another day.",
  "Only name places that exist and are open to visitors.",
].join(" ")

/** The JSON object in an answer, with any code fence or stray words around it taken off. */
function readAnswer(text: string) {
  const start = text.indexOf("{")
  const end = text.lastIndexOf("}")
  if (start === -1 || end <= start) throw new Error(TRAVEL_ERRORS.draftFailed)
  let parsed: unknown
  try {
    parsed = JSON.parse(text.slice(start, end + 1))
  } catch {
    throw new Error(TRAVEL_ERRORS.draftFailed)
  }
  const answer = answerSchema.safeParse(parsed)
  if (!answer.success) throw new Error(TRAVEL_ERRORS.draftFailed)
  return answer.data
}

/** The trip's days with nothing on them, and the ones with something. */
async function emptyDays(tripId: string, days: number, database: CustomShellDb) {
  const rows = await database
    .select({ day: travelActivities.day })
    .from(travelActivities)
    .where(and(eq(travelActivities.tripId, tripId), isNull(travelActivities.deletedAt)))
  const used = new Set(rows.map((row) => row.day).filter((day): day is number => day !== null))
  const all = Array.from({ length: days }, (_, index) => index + 1)
  return { empty: all.filter((day) => !used.has(day)), skipped: all.filter((day) => used.has(day)) }
}

/**
 * Asks the AI for a plan for the trip's empty days. The answer is checked
 * after the AI call has been written down, so a muddled answer still counts
 * as the call it was. Only the days asked for are kept, each with at most 5.
 */
export async function draftTripPlan(
  userId: string,
  input: { tripId: string },
  { database = db, ask = draftAi(userId) }: { database?: CustomShellDb; ask?: AskAi } = {}
): Promise<TripDraft> {
  const trip = await requireTrip(userId, input.tripId, database)
  const destination = trip.destination?.trim()
  if (!destination) throw new Error(TRAVEL_ERRORS.draftNeedsDestination)
  const { empty, skipped } = await emptyDays(trip.id, trip.days, database)
  if (empty.length === 0) throw new Error(TRAVEL_ERRORS.draftNoEmptyDays)
  const days = empty.slice(0, DRAFT_DAYS_MAX)

  const dayLines = days.map((day) => {
    const date = dateOfDay(trip.startDate, day)
    return date ? `Day ${day} is ${formatDayDate(date)}.` : `Day ${day}.`
  })
  const prompt = [
    `The trip is ${trip.days} days in ${destination}.`,
    trip.startDate ? `Day 1 is ${trip.startDate}, so mind what is shut on which weekday.` : "It has no dates yet.",
    `Plan these days, and only these: ${dayLines.join(" ")}`,
  ].join(" ")
  const answer = readAnswer(await ask(SYSTEM_PROMPT, prompt))

  const wanted = new Set(days)
  const typeIds = new Map<BuiltinType, string | null>()
  const typeFor = async (kind: BuiltinType) => {
    if (!typeIds.has(kind)) typeIds.set(kind, await builtinTypeId(userId, kind, database))
    return typeIds.get(kind) ?? null
  }
  const items: DraftItem[] = []
  const seen = new Set<number>()
  for (const planned of answer.days) {
    if (!wanted.has(planned.day) || seen.has(planned.day)) continue
    seen.add(planned.day)
    const kept = planned.activities
      .map((activity) => activitySchema.safeParse(activity))
      .flatMap((parsed) => (parsed.success ? [parsed.data] : []))
      .slice(0, PER_DAY_MAX)
    for (const activity of kept) {
      items.push({
        day: planned.day,
        title: activity.title,
        typeId: await typeFor(activity.kind),
        startTime: activity.startTime,
        durationMinutes: activity.minutes,
      })
    }
  }
  if (items.length === 0) throw new Error(TRAVEL_ERRORS.draftFailed)
  return { items, days, skipped, later: empty.length - days.length }
}

/** Finds a drafted place on Google, near the trip's destination. Swapped out in tests. */
export type FindPlace = (name: string, destination: string) => Promise<PlaceDetails | null>

/** The first real place Google suggests for "name, destination", with its details, one billed session each. */
export const googlePlace: FindPlace = async (name, destination) => {
  const session = uuid()
  const [first] = await autocompletePlaces(`${name}, ${destination}`, session)
  return first ? placeDetails(first.placeId, session) : null
}

export type MadePlan = { created: string[]; placed: number; looked: boolean }

/**
 * Makes the ticked activities of a drafted plan, each after whatever its day
 * already holds, in the order given. With Google set up, each is looked up
 * near the destination and given its place, opening hours, website and phone;
 * one Google can't find is made with its name alone.
 */
export async function createDraftActivities(
  userId: string,
  input: { tripId: string; items: DraftItem[] },
  { database = db, findPlace = googleEnabled() ? googlePlace : null }: { database?: CustomShellDb; findPlace?: FindPlace | null } = {}
): Promise<MadePlan> {
  const trip = await requireTrip(userId, input.tripId, database)
  for (const item of input.items) {
    if (item.day < 1 || item.day > trip.days) throw new Error(TRAVEL_ERRORS.dayOutOfRange)
    await checkTypeId(userId, item.typeId, database)
  }
  const live = await database
    .select({ day: travelActivities.day })
    .from(travelActivities)
    .where(and(eq(travelActivities.tripId, trip.id), isNull(travelActivities.deletedAt)))
  if (live.length + input.items.length > MAX_ACTIVITIES) throw new Error(TRAVEL_ERRORS.tooManyActivities)

  // Google first, so a slow answer never holds a transaction open.
  const destination = trip.destination?.trim() ?? ""
  const found: (PlaceDetails | null)[] = input.items.map(() => null)
  if (findPlace && destination) {
    const queue = input.items.map((item, index) => ({ item, index }))
    const work = async () => {
      for (let next = queue.shift(); next; next = queue.shift()) {
        // A place Google can't find, or a Google that doesn't answer, leaves the card with its name.
        found[next.index] = await findPlace(next.item.title, destination).catch(() => null)
      }
    }
    await Promise.all(Array.from({ length: Math.min(AT_ONCE, queue.length) }, work))
  }

  const nextPosition = new Map<number, number>()
  for (const row of live) if (row.day !== null) nextPosition.set(row.day, (nextPosition.get(row.day) ?? 0) + 1)
  const at = now()
  const rows = input.items.map((item, index) => {
    const position = nextPosition.get(item.day) ?? 0
    nextPosition.set(item.day, position + 1)
    const details = found[index]
    return {
      ...blankActivity(trip.id, at),
      id: uuid(),
      day: item.day,
      position,
      title: item.title,
      typeId: item.typeId,
      startTime: item.startTime,
      durationMinutes: item.durationMinutes,
      ...(details
        ? {
            place: details.place,
            openingHours: details.openingHours,
            website: details.website,
            phone: details.phone,
          }
        : {}),
    }
  })
  if (rows.length) await database.insert(travelActivities).values(rows)
  return { created: rows.map((row) => row.id), placed: found.filter(Boolean).length, looked: Boolean(findPlace && destination) }
}
