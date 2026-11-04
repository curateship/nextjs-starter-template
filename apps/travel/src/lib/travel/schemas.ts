import { z } from "zod"

import {
  CURRENCIES,
  DAY_PARTS,
  MAX_TRIP_DAYS,
  TIME_PATTERN,
  TRAVEL_MODES,
  TRIP_NAME_MAX,
  TRIP_STATUSES,
  dayInfoSchema,
  id,
  openingHoursSchema,
  photoCreditSchema,
  placeSchema,
} from "@/lib/travel/rules"

/**
 * The shapes each Travel endpoint accepts. Every sentence here is shown to the
 * person when their input is refused, so each one says what to change.
 */

/** Only web addresses, never `javascript:` or a file on the server. */
export const webAddress = z
  .string()
  .trim()
  .max(500)
  .url("Type a full web address, starting with https://.")
  .refine((value) => /^https?:\/\//i.test(value), "Type a full web address, starting with https://.")

const name = z
  .string()
  .trim()
  .min(1, "Give the trip a name.")
  .max(TRIP_NAME_MAX, `A trip's name can be at most ${TRIP_NAME_MAX} characters.`)

const days = z
  .number()
  .int()
  .min(1, "A trip needs at least one day.")
  .max(MAX_TRIP_DAYS, `A trip can have at most ${MAX_TRIP_DAYS} days.`)

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date.")

const money = z.number().int().min(0).max(10_000_000_000)

export const createTripSchema = z.object({
  name,
  days,
  currency: z.enum(CURRENCIES),
  startDate: isoDate.nullable(),
  destination: z.string().trim().max(120).nullable().optional(),
})
export type CreateTripInput = z.infer<typeof createTripSchema>

export const updateTripSchema = z.object({
  tripId: id,
  name: name.optional(),
  destination: z.string().trim().max(120).nullable().optional(),
  startDate: isoDate.nullable().optional(),
  currency: z.enum(CURRENCIES).optional(),
  timeZone: z.string().max(64).nullable().optional(),
  budgetCents: money.nullable().optional(),
  status: z.enum(TRIP_STATUSES).optional(),
  coverUrl: z.string().max(1000).nullable().optional(),
  coverCredit: photoCreditSchema.nullable().optional(),
  /** The editor's own document as JSON text; the server cleans it. */
  description: z.string().max(100_000, "The description is too long to save.").optional(),
  travelMode: z.enum(TRAVEL_MODES).optional(),
  tags: z
    .array(z.string().trim().min(1).max(30, "A tag can be at most 30 characters."))
    .max(10, "A trip can have at most 10 tags.")
    .optional(),
})
export type UpdateTripInput = z.infer<typeof updateTripSchema>

export const dayInfoInputSchema = dayInfoSchema.extend({ tripId: id, day: days })

const title = z
  .string()
  .trim()
  .min(1, "Give the activity a name.")
  .max(200, "An activity's name can be at most 200 characters.")

const startTime = z.string().regex(TIME_PATTERN, "Pick a time.").nullable()

/** Up to a full day, in minutes. A hotel's stay is its nights, not its length. */
const duration = z
  .number()
  .int()
  .min(5, "An activity lasts at least 5 minutes.")
  .max(24 * 60, "An activity can last at most 24 hours. Use nights for a stay.")
  .nullable()

export const createActivitySchema = z.object({
  tripId: id,
  /** Null is the Ideas column. */
  day: days.nullable(),
  title,
  typeId: id.nullable().optional(),
  startTime: startTime.optional(),
  costCents: money.nullable().optional(),
})
export type CreateActivityInput = z.infer<typeof createActivitySchema>

export const updateActivitySchema = z.object({
  activityId: id,
  title: title.optional(),
  typeId: id.nullable().optional(),
  startTime: startTime.optional(),
  /** Only kept while there is no start time; a start time clears it. */
  dayPart: z.enum(DAY_PARTS).nullable().optional(),
  durationMinutes: duration.optional(),
  nights: z.number().int().min(1).max(MAX_TRIP_DAYS).nullable().optional(),
  place: placeSchema.nullable().optional(),
  openingHours: openingHoursSchema.nullable().optional(),
  website: webAddress.nullable().optional(),
  menuUrl: webAddress.nullable().optional(),
  phone: z
    .string()
    .trim()
    .max(40)
    .regex(/^[0-9+()\-.\s]*$/, "A phone number has only digits, spaces and + ( ) -.")
    .nullable()
    .optional(),
  /** The editor's own document, as JSON text; the server cleans it (`src/lib/travel/notes.ts`). */
  notes: z.string().max(100_000, "Notes are too long to save.").optional(),
  costCents: money.nullable().optional(),
  done: z.boolean().optional(),
  rating: z.number().int().min(1).max(5).nullable().optional(),
  goAgain: z.boolean().optional(),
  photoUrl: z.string().max(1000).nullable().optional(),
  photoCredit: photoCreditSchema.nullable().optional(),
})
export type UpdateActivityInput = z.infer<typeof updateActivitySchema>

export const moveActivitySchema = z.object({
  activityId: id,
  /** Null is the Ideas column. */
  day: days.nullable(),
  /**
   * The column's cards in the order they were dropped, the moved card
   * included. Cards with a start time are shown by time whatever this says.
   */
  order: z.array(id).max(500),
})
