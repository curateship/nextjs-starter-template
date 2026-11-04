import { z } from "zod"

import type { BuiltinType } from "@/lib/travel/activity-types"
import { daysBetween } from "@/lib/travel/dates"
import { TRAVEL_ERRORS } from "@/lib/travel/errors"
import { MAX_TRIP_DAYS, TIME_PATTERN } from "@/lib/travel/rules"
import { db, type CustomShellDb } from "@/server/db"
import { requireTrip } from "@/server/travel/access"
import { meteredAi, type AskAi } from "@/server/travel/ai"
import { builtinTypeId } from "@/server/travel/types"

/**
 * Paste a booking email (task part 44). The AI reads a confirmation email and
 * fills in a new activity for the person to check. Nothing is saved here: the
 * draft goes back to the window, and the person presses Create activity.
 */

/** The most of an email sent to the AI. A booking is near the top, and this keeps the cost down. */
export const BOOKING_EMAIL_MAX = 20_000

/** Enough for the JSON answer and nothing else. */
const MAX_ANSWER_TOKENS = 600

/** The shell's metered AI, set for reading a booking email. */
export function bookingAi(userId: string): AskAi {
  return meteredAi(userId, { feature: "travel-booking-email", maxTokens: MAX_ANSWER_TOKENS, failed: TRAVEL_ERRORS.aiFailed })
}

const KINDS = ["flight", "hotel", "food", "sight", "transport", "other"] as const satisfies readonly BuiltinType[]

export type BookingDraft = {
  title: string
  /** The person's own type for what the AI found, such as their Hotel. Null when they removed it. */
  typeId: string | null
  /** The trip's day number, or null for the Ideas column. */
  day: number | null
  /** The date the email gave, as "2026-03-04", shown when it isn't on the trip. */
  date: string | null
  startTime: string | null
  nights: number | null
  placeName: string
  address: string
  /** In the trip's money, in cents. Null when the email had no price or priced it in other money. */
  costCents: number | null
  /** A price in other money, or with none named, kept so the window can say it wasn't copied. */
  otherCost: { amount: number; currency: string | null } | null
}

/** Any field the AI gets wrong becomes empty rather than failing the whole email. */
const answerSchema = z.object({
  title: z.string().trim().min(1),
  kind: z.enum(KINDS).catch("other"),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .catch(null),
  startTime: z.string().regex(TIME_PATTERN).nullable().catch(null),
  nights: z.number().int().min(1).max(MAX_TRIP_DAYS).nullable().catch(null),
  placeName: z.string().nullable().catch(null),
  address: z.string().nullable().catch(null),
  costAmount: z.number().min(0).max(100_000_000).nullable().catch(null),
  currency: z.string().nullable().catch(null),
})

const SYSTEM_PROMPT = [
  "You read travel booking confirmation emails and pull out one booking.",
  "Answer with one JSON object and nothing else. No code fence, no words before or after.",
  'The keys are: "title" (a short name such as "Flight to Tokyo" or "Hotel Gracery Shinjuku"),',
  '"kind" (one of "flight", "hotel", "food", "sight", "transport", "other"),',
  '"date" (the day it starts, or the check-in day, as YYYY-MM-DD, or null),',
  '"startTime" (24-hour HH:MM in local time where it happens, such as a departure or check-in time, or null),',
  '"nights" (a whole number of nights for a stay, otherwise null),',
  '"placeName" (the hotel, restaurant, venue or departure airport, or ""),',
  '"address" (its street address, or ""),',
  '"costAmount" (the total price as a number, or null),',
  '"currency" (the three-letter currency code of that price, or null).',
  "Never invent anything that isn't in the email. Use null or an empty string instead.",
].join(" ")

/** The JSON object in an answer, with any code fence or stray words around it taken off. */
function readAnswer(text: string) {
  const start = text.indexOf("{")
  const end = text.lastIndexOf("}")
  if (start === -1 || end <= start) throw new Error(TRAVEL_ERRORS.aiFailed)
  let parsed: unknown
  try {
    parsed = JSON.parse(text.slice(start, end + 1))
  } catch {
    throw new Error(TRAVEL_ERRORS.aiFailed)
  }
  const answer = answerSchema.safeParse(parsed)
  if (!answer.success) throw new Error(TRAVEL_ERRORS.aiFailed)
  return answer.data
}

function clip(value: string | null, max: number) {
  return (value ?? "").trim().slice(0, max)
}

/**
 * Reads a pasted booking email into a draft activity for one of the person's
 * trips. The answer is checked after the AI call has been written down, so a
 * muddled answer still counts as the call it was.
 */
export async function readBookingEmail(
  userId: string,
  input: { tripId: string; text: string },
  { database = db, ask = bookingAi(userId) }: { database?: CustomShellDb; ask?: AskAi } = {}
): Promise<BookingDraft> {
  const trip = await requireTrip(userId, input.tripId, database)
  const email = input.text.trim().slice(0, BOOKING_EMAIL_MAX)
  if (!email) throw new Error(TRAVEL_ERRORS.bookingEmailEmpty)

  const about = [
    `Today is ${new Date().toISOString().slice(0, 10)}.`,
    trip.startDate
      ? `The trip starts on ${trip.startDate} and lasts ${trip.days} days.`
      : `The trip lasts ${trip.days} days and has no dates yet.`,
    trip.destination ? `It goes to ${trip.destination}.` : null,
    "Use these only to work out a year the email leaves out.",
  ]
    .filter(Boolean)
    .join(" ")

  const answer = readAnswer(await ask(SYSTEM_PROMPT, `${about}\n\nThe email:\n\n${email}`))

  let day: number | null = null
  if (answer.date && trip.startDate) {
    const number = daysBetween(trip.startDate, answer.date) + 1
    if (number >= 1 && number <= trip.days) day = number
  }

  // A price is copied only when it's in the trip's money. Anything else would
  // add the wrong number to the trip's total.
  const currency = answer.currency?.trim().toUpperCase() || null
  const sameMoney = currency === trip.currency
  const costCents = answer.costAmount !== null && sameMoney ? Math.round(answer.costAmount * 100) : null
  const otherCost = answer.costAmount !== null && !sameMoney ? { amount: answer.costAmount, currency } : null

  return {
    title: clip(answer.title, 200) || "Booking",
    typeId: await builtinTypeId(userId, answer.kind, database),
    day,
    date: answer.date,
    startTime: answer.startTime,
    nights: answer.kind === "hotel" ? answer.nights : null,
    placeName: clip(answer.placeName, 200),
    address: clip(answer.address, 400),
    costCents,
    otherCost,
  }
}
