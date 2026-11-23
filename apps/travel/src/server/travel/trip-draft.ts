import { and, eq, isNull } from "drizzle-orm"
import { z } from "zod"

import type { BuiltinType } from "@/lib/travel/activity-types"
import { formatTime } from "@/lib/travel/board"
import { staysForDay } from "@/lib/travel/best-order"
import { dateOfDay, formatDayDate } from "@/lib/travel/dates"
import { fitIntoWindows, freeWindows, windowText } from "@/lib/travel/fill-day"
import { findSamePlace, type PlaceLike } from "@/lib/travel/same-place"
import { TRAVEL_ERRORS } from "@/lib/travel/errors"
import { TIME_PATTERN } from "@/lib/travel/rules"
import { now, uuid } from "@/server/auth/security"
import { db, type CustomShellDb } from "@/server/db"
import { requireTrip } from "@/server/travel/access"
import { meteredAi, type AskAi } from "@/server/travel/ai"
import { autocompletePlaces, googleEnabled, placeDetails, type PlaceDetails } from "@/server/travel/google"
import { spendGoogleLookup } from "@/server/travel/google-usage"
import { travelActivities } from "@/server/travel/schema"
import { blankActivity, MAX_ACTIVITIES } from "@/server/travel/trips"
import { savedGooglePhoto } from "@/server/travel/place-photo"
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

/** An activity to make from AI: on a day, or in Ideas when `day` is null (Travel features 3, part 9). */
export type PlannedItem = Omit<DraftItem, "day"> & { day: number | null }

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

/**
 * The JSON object in an answer, with any code fence or stray words around it
 * taken off, read with `schema`. Throws `failed` when there's none to read.
 */
function readAnswer<T>(text: string, schema: z.ZodType<T>, failed: string): T {
  const start = text.indexOf("{")
  const end = text.lastIndexOf("}")
  if (start === -1 || end <= start) throw new Error(failed)
  let parsed: unknown
  try {
    parsed = JSON.parse(text.slice(start, end + 1))
  } catch {
    throw new Error(failed)
  }
  const answer = schema.safeParse(parsed)
  if (!answer.success) throw new Error(failed)
  return answer.data
}

/**
 * The places already on the trip, Must do ones first, so the AI plans around
 * them and never plans one again (More Travel features part 4: "AI plans
 * around it"). Empty when the trip has none.
 */
async function alreadyOnTrip(tripId: string, database: CustomShellDb) {
  const rows = await database
    .select({ title: travelActivities.title, mustDo: travelActivities.mustDo })
    .from(travelActivities)
    .where(and(eq(travelActivities.tripId, tripId), isNull(travelActivities.deletedAt)))
  if (rows.length === 0) return ""
  const names = [...rows.filter((row) => row.mustDo), ...rows.filter((row) => !row.mustDo)]
    .map((row) => row.title.replace(/\s+/g, " ").slice(0, 80))
    .slice(0, 60)
  return `Already on the trip, so never plan these again: ${names.join("; ")}.`
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
    await alreadyOnTrip(trip.id, database),
  ]
    .filter(Boolean)
    .join(" ")
  const answer = readAnswer(await ask(SYSTEM_PROMPT, prompt), answerSchema, TRAVEL_ERRORS.draftFailed)

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

/**
 * Fill this day (More Travel features part 6; Tyler: "Timed, in the gaps").
 * The AI is told what the day already holds, its free time between 8:00 AM
 * and 10:00 PM, its Must do cards and where the night is spent, and answers
 * with timed sights and meals for the gaps only. Each idea is checked: one
 * outside a gap is dropped, one running past its gap is cut to fit, and none
 * overlap. Nothing is saved here; the same window as Draft a plan shows them.
 */
export async function fillTripDay(
  userId: string,
  input: { tripId: string; day: number },
  { database = db, ask = draftAi(userId) }: { database?: CustomShellDb; ask?: AskAi } = {}
): Promise<TripDraft> {
  const trip = await requireTrip(userId, input.tripId, database)
  const destination = trip.destination?.trim()
  if (!destination) throw new Error(TRAVEL_ERRORS.draftNeedsDestination)
  if (input.day < 1 || input.day > trip.days) throw new Error(TRAVEL_ERRORS.dayOutOfRange)
  const live = await liveCards(trip.id, database)
  const day = describeDay(trip, live, input.day)
  if (day.windows.length === 0) throw new Error(TRAVEL_ERRORS.fillNoFreeTime)
  const prompt = [
    `The trip is ${trip.days} days in ${destination}.`,
    `Plan Day ${input.day} only${day.date ? `, ${formatDayDate(day.date)}` : ""}, and answer with that one day.`,
    ...day.lines,
    "Every activity needs a startTime and minutes that end inside one of those free times.",
    "Add 1 to 4 activities, fewer when the free time is short, with a meal at lunch or dinner time when that time is free.",
    await alreadyOnTrip(trip.id, database),
  ]
    .filter(Boolean)
    .join(" ")
  const answer = readAnswer(await ask(SYSTEM_PROMPT, prompt), answerSchema, TRAVEL_ERRORS.draftFailed)
  // One day was asked for, so a single day sent back is that day, whatever number the AI put on it.
  const asked = answer.days.find((planned) => planned.day === input.day) ?? (answer.days.length === 1 ? answer.days[0] : undefined)
  const items = await fittedItems(userId, input.day, asked?.activities ?? [], day.windows, database)
  if (items.length === 0) throw new Error(TRAVEL_ERRORS.fillNothingFits)
  return { items, days: [input.day], skipped: [], later: 0 }
}

/**
 * Fill every gap (Travel features 4, part 10; Tyler, 6 Nov 2026: "+ Add,
 * part-planned days"): Fill this day's rules for every day that already has
 * something on it, in one AI call. Empty days are left to Draft a plan. A day
 * with no free time is left alone and named in `skipped`. At most 14 days go
 * at once; `later` counts the days with free time past them. Each day's ideas
 * are checked against that day's own free time, the same as Fill this day.
 */
export async function fillTripGaps(
  userId: string,
  input: { tripId: string },
  { database = db, ask = draftAi(userId) }: { database?: CustomShellDb; ask?: AskAi } = {}
): Promise<TripDraft> {
  const trip = await requireTrip(userId, input.tripId, database)
  const destination = trip.destination?.trim()
  if (!destination) throw new Error(TRAVEL_ERRORS.draftNeedsDestination)
  const live = await liveCards(trip.id, database)
  const planned = [...new Set(live.map((card) => card.day).filter((day): day is number => day !== null && day <= trip.days))].sort(
    (a, b) => a - b
  )
  const described = planned.map((day) => describeDay(trip, live, day))
  const open = described.filter((day) => day.windows.length > 0)
  if (open.length === 0) throw new Error(TRAVEL_ERRORS.fillNoGaps)
  const asked = open.slice(0, DRAFT_DAYS_MAX)
  const prompt = [
    `The trip is ${trip.days} days in ${destination}.`,
    `Plan these days only, and answer with each of them: ${asked.map((day) => day.day).join(", ")}.`,
    ...asked.map((day) => [`Day ${day.day}${day.date ? `, ${formatDayDate(day.date)}` : ""}:`, ...day.lines].filter(Boolean).join(" ")),
    "Every activity needs a startTime and minutes that end inside its own day's free times.",
    "Add 1 to 4 activities a day, fewer when the free time is short, with a meal at lunch or dinner time when that time is free.",
    "Never plan the same place on two days.",
    await alreadyOnTrip(trip.id, database),
  ]
    .filter(Boolean)
    .join(" ")
  const answer = readAnswer(await ask(SYSTEM_PROMPT, prompt), answerSchema, TRAVEL_ERRORS.draftFailed)
  const items: DraftItem[] = []
  for (const day of asked) {
    const reply = answer.days.find((each) => each.day === day.day)
    items.push(...(await fittedItems(userId, day.day, reply?.activities ?? [], day.windows, database)))
  }
  if (items.length === 0) throw new Error(TRAVEL_ERRORS.fillNothingFitsAnywhere)
  return {
    items,
    days: asked.map((day) => day.day),
    skipped: described.filter((day) => day.windows.length === 0).map((day) => day.day),
    later: open.length - asked.length,
  }
}

async function liveCards(tripId: string, database: CustomShellDb) {
  return database
    .select()
    .from(travelActivities)
    .where(and(eq(travelActivities.tripId, tripId), isNull(travelActivities.deletedAt)))
}

/** What the AI is told about one day for filling it: what it holds, where the night is, and its free time. */
function describeDay(trip: { startDate: string | null }, live: Awaited<ReturnType<typeof liveCards>>, day: number) {
  const cards = live.filter((card) => card.day === day)
  const windows = freeWindows(cards)
  const planned = cards.map((card) => {
    const when = card.startTime
      ? `at ${formatTime(card.startTime)}${card.durationMinutes ? ` for ${card.durationMinutes} minutes` : ""}`
      : card.dayPart
        ? `some time in the ${card.dayPart}`
        : "at no set time"
    return `${card.title.replace(/\s+/g, " ").slice(0, 80)} ${when}${card.mustDo ? " (a must do: keep it)" : ""}`
  })
  const night = staysForDay(live.filter((card) => card.nights !== null), day).end
  const lines = [
    planned.length ? `Day ${day} already has: ${planned.join("; ")}. Keep all of it as it is.` : "",
    planned.some((line) => line.endsWith("at no set time") || line.includes("some time in")) ?
      "Its cards with no set time still take part of the day, so leave room for them." : "",
    night ? `The night is spent at ${night.title}.` : "",
    windows.length ? `Add sights and meals only in the free time: ${windows.map(windowText).join(", ")}.` : "",
  ]
  return { day, date: dateOfDay(trip.startDate, day), windows, lines }
}

/** The AI's ideas for a day that fit its free time whole or cut to fit, with no overlaps, at most 5. */
async function fittedItems(
  userId: string,
  day: number,
  activities: unknown[],
  windows: ReturnType<typeof freeWindows>,
  database: CustomShellDb
) {
  const ideas = activities
    .map((activity) => activitySchema.safeParse(activity))
    .flatMap((parsed) => (parsed.success ? [parsed.data] : []))
    .map((activity) => ({ ...activity, startTime: activity.startTime, durationMinutes: activity.minutes }))
  const items: DraftItem[] = []
  for (const idea of fitIntoWindows(ideas, windows).slice(0, PER_DAY_MAX)) {
    items.push({
      day,
      title: idea.title,
      typeId: await builtinTypeId(userId, idea.kind, database),
      startTime: idea.startTime,
      durationMinutes: idea.durationMinutes,
    })
  }
  return items
}

/** Finds a drafted place on Google, near the trip's destination. Swapped out in tests. */
export type FindPlace = (name: string, destination: string) => Promise<PlaceDetails | null>

/** Saves a found place's Google photo into the media library, returning its address. Swapped out in tests. */
export type FetchPhoto = (photoName: string, title: string) => Promise<string | null>

/**
 * The first real place Google suggests for "name, destination", with its
 * details, one billed session each. A place found counts as one of the
 * person's Google lookups (Travel features 4, part 4); past the day's limit it
 * is made with its name alone, like one Google can't find.
 */
export function googlePlaceFor(spend: () => Promise<void>): FindPlace {
  return async (name, destination) => {
    const session = uuid()
    const [first] = await autocompletePlaces(`${name}, ${destination}`, session)
    return first ? placeDetails(first.placeId, session, spend) : null
  }
}

/** What a plan made: the new cards, how many Google found, and how many were left out as already on the trip. */
export type MadePlan = { created: string[]; placed: number; looked: boolean; repeated: number }

/**
 * Makes the ticked activities of a drafted plan, each after whatever its day
 * already holds, in the order given. With Google set up, each is looked up
 * near the destination and given its place, opening hours, website, phone and
 * its Google photo as the picture (More Travel features part 2); one Google
 * can't find is made with its name alone.
 */
export async function createDraftActivities(
  userId: string,
  input: { tripId: string; items: PlannedItem[] },
  {
    database = db,
    findPlace = googleEnabled() ? googlePlaceFor(() => spendGoogleLookup(userId, database)) : null,
    fetchPhoto = googleEnabled() ? (photoName, title) => savedGooglePhoto(userId, photoName, title, database) : null,
  }: { database?: CustomShellDb; findPlace?: FindPlace | null; fetchPhoto?: FetchPhoto | null } = {}
): Promise<MadePlan> {
  const trip = await requireTrip(userId, input.tripId, database)
  for (const item of input.items) {
    if (item.day !== null && (item.day < 1 || item.day > trip.days)) throw new Error(TRAVEL_ERRORS.dayOutOfRange)
    await checkTypeId(userId, item.typeId, database)
  }
  const live = await database
    .select({ day: travelActivities.day, title: travelActivities.title, place: travelActivities.place })
    .from(travelActivities)
    .where(and(eq(travelActivities.tripId, trip.id), isNull(travelActivities.deletedAt)))
  if (live.length + input.items.length > MAX_ACTIVITIES) throw new Error(TRAVEL_ERRORS.tooManyActivities)

  // Google first, so a slow answer never holds a transaction open.
  const destination = trip.destination?.trim() ?? ""
  const found: (PlaceDetails | null)[] = input.items.map(() => null)
  const photos: (string | null)[] = input.items.map(() => null)
  // A place already on the trip, or twice in the plan, is left out (More Travel features part 3: "Skip it, say
  // where"), checked before its photo is fetched. The AI is told what is on the trip; this catches what it missed.
  const taken: PlaceLike[] = [...live]
  const repeated = input.items.map(() => false)
  const claim = (index: number) => {
    const card = { title: input.items[index].title, place: found[index]?.place ?? null }
    if (findSamePlace(card, taken)) repeated[index] = true
    else taken.push(card)
  }
  if (findPlace && destination) {
    const queue = input.items.map((item, index) => ({ item, index }))
    const work = async () => {
      for (let next = queue.shift(); next; next = queue.shift()) {
        // A place Google can't find, or a Google that doesn't answer, leaves the card with its name.
        const details = await findPlace(next.item.title, destination).catch(() => null)
        found[next.index] = details
        claim(next.index)
        if (!repeated[next.index] && details?.photoName && fetchPhoto) {
          photos[next.index] = await fetchPhoto(details.photoName, next.item.title).catch(() => null)
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(AT_ONCE, queue.length) }, work))
  }

  // With no Google lookups, names alone are compared.
  if (!(findPlace && destination)) input.items.forEach((_, index) => claim(index))

  // Ideas is the null day, so a suggested place goes after the ideas already there.
  const nextPosition = new Map<number | null, number>()
  for (const row of live) nextPosition.set(row.day, (nextPosition.get(row.day) ?? 0) + 1)
  const at = now()
  const rows = input.items.flatMap((item, index) => {
    if (repeated[index]) return []
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
      ...(photos[index] ? { photoUrl: photos[index] } : {}),
    }
  })
  if (rows.length) await database.insert(travelActivities).values(rows)
  return {
    created: rows.map((row) => row.id),
    placed: found.filter((details, index) => details && !repeated[index]).length,
    looked: Boolean(findPlace && destination),
    repeated: repeated.filter(Boolean).length,
  }
}

/** The most places one Suggest Ideas brings back. */
export const IDEAS_MAX = 10

/** A place the AI suggests for the trip's Ideas, with why it's worth a visit. */
export type IdeaItem = { title: string; typeId: string | null; reason: string }

const ideaSchema = z.object({
  title: z.string().trim().min(1).max(200),
  kind: z.enum(KINDS).catch("other"),
  reason: z.string().trim().max(200).catch(""),
})
const ideasAnswerSchema = z.object({ ideas: z.array(z.unknown()) })

const IDEAS_PROMPT = [
  "You suggest places for a trip, as a well-travelled local friend would.",
  "Answer with one JSON object and nothing else. No code fence, no words before or after.",
  'The shape is {"ideas":[{"title":"...","kind":"sight","reason":"..."}]}.',
  '"title" is the place\'s own name as Google Maps knows it, such as "Fushimi Inari Taisha" or "Nishiki Market".',
  '"kind" is one of "sight", "food", "transport", "other".',
  '"reason" is one short sentence on why it is worth going, under 20 words.',
  "Mix sights and places to eat, spread across the destination, and only name places that exist and are open to visitors.",
].join(" ")

/**
 * Suggest Ideas (Travel features 3, part 9; Tyler, 5 Nov 2026: "+ Add,
 * checked first"): AI names 10 places in the trip's destination for its
 * Ideas column, never one already on the trip. Nothing is saved here; the
 * window shows them ticked to check, and only what stays ticked goes into
 * Ideas, never onto a day.
 */
export async function suggestTripIdeas(
  userId: string,
  input: { tripId: string },
  { database = db, ask = draftAi(userId) }: { database?: CustomShellDb; ask?: AskAi } = {}
): Promise<{ items: IdeaItem[] }> {
  const trip = await requireTrip(userId, input.tripId, database)
  const destination = trip.destination?.trim()
  if (!destination) throw new Error(TRAVEL_ERRORS.draftNeedsDestination)
  const live = await database
    .select({ title: travelActivities.title, place: travelActivities.place })
    .from(travelActivities)
    .where(and(eq(travelActivities.tripId, trip.id), isNull(travelActivities.deletedAt)))
  const prompt = [
    `The trip is ${trip.days} days in ${destination}.`,
    `Suggest ${IDEAS_MAX} places to visit there.`,
    await alreadyOnTrip(trip.id, database),
  ]
    .filter(Boolean)
    .join(" ")
  const answer = readAnswer(await ask(IDEAS_PROMPT, prompt), ideasAnswerSchema, TRAVEL_ERRORS.ideasFailed)
  const ideas = answer.ideas
    .map((idea) => ideaSchema.safeParse(idea))
    .flatMap((each) => (each.success ? [each.data] : []))
  if (!ideas.length) throw new Error(TRAVEL_ERRORS.ideasFailed)

  // The AI is told what's on the trip; this catches what it missed, and any it named twice.
  const taken: PlaceLike[] = [...live]
  const items: IdeaItem[] = []
  for (const idea of ideas) {
    const card = { title: idea.title, place: null }
    if (findSamePlace(card, taken)) continue
    taken.push(card)
    items.push({ title: idea.title, typeId: await builtinTypeId(userId, idea.kind, database), reason: idea.reason })
    if (items.length === IDEAS_MAX) break
  }
  if (!items.length) throw new Error(TRAVEL_ERRORS.ideasNoneNew)
  return { items }
}
