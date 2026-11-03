import { z } from "zod"

/**
 * What a trip and an activity may hold, shared by the server's checks and the
 * screens. Nothing here reaches the database or the network.
 */

export const TRIP_STATUSES = ["planning", "booked", "done"] as const
export type TripStatus = (typeof TRIP_STATUSES)[number]
export const TRIP_STATUS_LABEL: Record<TripStatus, string> = {
  planning: "Planning",
  booked: "Booked",
  done: "Done",
}

export const TRAVEL_MODES = ["walk", "transit", "drive"] as const
export type TravelMode = (typeof TRAVEL_MODES)[number]
export const TRAVEL_MODE_LABEL: Record<TravelMode, string> = {
  walk: "Walk",
  transit: "Transit",
  drive: "Drive",
}

export const MAX_TRIP_DAYS = 60
export const TRIP_NAME_MAX = 120

/** The currencies a trip can be in. A short list people actually travel with. */
export const CURRENCIES = [
  "USD", "EUR", "GBP", "JPY", "CAD", "AUD", "NZD", "CHF", "CNY", "HKD", "SGD",
  "KRW", "THB", "VND", "IDR", "MYR", "PHP", "INR", "AED", "MXN", "BRL", "ZAR",
  "SEK", "NOK", "DKK", "PLN", "CZK", "HUF", "TRY", "ISK",
] as const
export type Currency = (typeof CURRENCIES)[number]

/** A place as Google or a person typed it. `placeId` is Google's, when it came from there. */
export const placeSchema = z.object({
  name: z.string().trim().max(200),
  address: z.string().trim().max(400),
  lat: z.number().min(-90).max(90).nullable(),
  lng: z.number().min(-180).max(180).nullable(),
  placeId: z.string().max(300).nullable(),
})
export type Place = z.infer<typeof placeSchema>

/**
 * Opening hours per weekday, 0 = Sunday … 6 = Saturday. Each day is a list of
 * "HH:MM" to "HH:MM" spans; an empty list is closed. A closing time before the
 * opening time runs past midnight.
 */
const hhmm = z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/)
export const openingHoursSchema = z
  .array(z.array(z.object({ open: hhmm, close: hhmm })).max(4))
  .length(7)
export type OpeningHours = z.infer<typeof openingHoursSchema>

/** Credit links only ever point at Unsplash itself, so a saved credit can't carry a `javascript:` link onto the page. */
const creditLink = z
  .string()
  .max(500)
  .refine((value) => value.startsWith("https://unsplash.com/"), "That credit link isn't an Unsplash address.")

/** Who took an Unsplash photo, shown under it as Unsplash's rules ask. */
export const photoCreditSchema = z.object({
  name: z.string().max(200),
  profileUrl: creditLink,
  photoPageUrl: creditLink,
})
export type PhotoCredit = z.infer<typeof photoCreditSchema>

/** A day's own text. Days had a city too until 3 Nov 2026; old rows may still hold it and it is ignored. */
export const dayInfoSchema = z.object({
  note: z.string().trim().max(200),
})
export type DayInfo = z.infer<typeof dayInfoSchema>

export const TIME_PATTERN = /^([01][0-9]|2[0-3]):[0-5][0-9]$/

export const id = z.string().min(1).max(36)

/** Money typed by a person, such as "1,240.50", in cents. Null when blank or not a number. */
export function parseMoney(text: string): number | null {
  const cleaned = text.replace(/[,\s]/g, "")
  if (!cleaned) return null
  const value = Number(cleaned)
  if (!Number.isFinite(value) || value < 0 || value > 100_000_000) return null
  return Math.round(value * 100)
}

/** Cents as the trip's money, such as "$1,240" or "¥8,000". */
export function formatMoney(cents: number, currency: string): string {
  const whole = cents % 100 === 0
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: whole ? 0 : 2,
      maximumFractionDigits: whole ? 0 : 2,
    }).format(cents / 100)
  } catch {
    return `${(cents / 100).toFixed(whole ? 0 : 2)} ${currency}`
  }
}
