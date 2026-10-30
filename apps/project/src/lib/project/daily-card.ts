import { z } from "zod"

import { addDays, isRealDay, weekdayOf } from "@/lib/project/days"

/**
 * The Daily card's rules, shared by the server that keeps its rows and the
 * card that draws them (`workspace/docs/daily-card.md`). Tyler's choices of
 * 29 Oct 2026 are in `workspace/docs/what-this-app-is.md`, which outranks
 * this file.
 */

export const DAY_PARTS = ["morning", "afternoon", "night"] as const
export type DayPart = (typeof DAY_PARTS)[number]

export const DAY_PART_LABEL: Record<DayPart, string> = {
  morning: "Morning",
  afternoon: "Afternoon",
  night: "Night",
}

/** When each part of the day starts, "HH:MM" in the person's own zone. */
export type DayHours = Record<DayPart, string>

/** Tyler's starting hours: morning 5 AM, afternoon 12 PM, night 6 PM. */
export const DEFAULT_HOURS: DayHours = { morning: "05:00", afternoon: "12:00", night: "18:00" }

/** The routine reminders' starting times: 10 AM, 3 PM and 9 PM. Null is off. */
export type RoutineReminders = Record<DayPart, string | null>
export const DEFAULT_REMINDERS: RoutineReminders = { morning: "10:00", afternoon: "15:00", night: "21:00" }

export const SKY_KINDS = ["drawn", "beach", "city", "mountains", "forest", "own"] as const
export type SkyKind = (typeof SKY_KINDS)[number]
export const SKY_LABEL: Record<SkyKind, string> = {
  drawn: "Sky",
  beach: "Beach",
  city: "City",
  mountains: "Mountains",
  forest: "Forest",
  own: "My own photos",
}

/** The stretch of sky the card draws, a finer cut than the three parts of the day. */
export type SkyPhase = "sunrise" | "day" | "golden" | "sunset" | "night"

/** The small icons a habit can carry, drawn by `habit-icons.tsx`. */
export const HABIT_ICONS = [
  "cup",
  "droplet",
  "stretch",
  "walk",
  "dumbbell",
  "bike",
  "list",
  "inbox",
  "pen",
  "book",
  "brain",
  "sparkle",
  "apple",
  "pill",
  "heart",
  "smile",
  "sun",
  "moon",
  "bed",
  "leaf",
  "music",
  "phone",
  "timer",
  "check",
] as const
export type HabitIcon = (typeof HABIT_ICONS)[number]

/** Streak milestones that set off the confetti, once each. */
export const MILESTONE_DAYS = [7, 30, 100] as const

export const DAILY_LIMITS = {
  habitName: 60,
  habitsPerPart: 12,
  habitTarget: 99,
  intention: 200,
  note: 500,
  win: 200,
  answer: 500,
  ownLine: 160,
  ownLines: 100,
  ownQuestion: 160,
  ownQuestions: 100,
  city: 80,
  search: 80,
} as const

/** Search results on the look back window's Search tab. */
export const JOURNAL_SEARCH_RESULTS = 30

const minutesOf = (time: string) => {
  const [hour, minute] = time.split(":").map(Number)
  return hour * 60 + minute
}

/** Which part of the day "HH:MM" falls in. Night runs past midnight until morning. */
export function partOfDay(time: string, hours: DayHours): DayPart {
  const at = minutesOf(time)
  if (at >= minutesOf(hours.morning) && at < minutesOf(hours.afternoon)) return "morning"
  if (at >= minutesOf(hours.afternoon) && at < minutesOf(hours.night)) return "afternoon"
  return "night"
}

/**
 * The card's own day: before morning starts it is still last night, so
 * ticking a night habit at 1 AM counts for the evening before.
 */
export function cardDayOf(today: string, time: string, hours: DayHours) {
  return minutesOf(time) < minutesOf(hours.morning) ? addDays(today, -1) : today
}

/**
 * The sky for "HH:MM": a sunrise for the first hour of the morning, gold for
 * the last 90 minutes of the afternoon, a sunset for the first hour of the
 * night, and stars after that.
 */
export function skyPhase(time: string, hours: DayHours): SkyPhase {
  const at = minutesOf(time)
  const part = partOfDay(time, hours)
  if (part === "morning") return at - minutesOf(hours.morning) < 60 ? "sunrise" : "day"
  if (part === "afternoon") return minutesOf(hours.night) - at <= 90 ? "golden" : "day"
  const sinceNight = at - minutesOf(hours.night)
  return sinceNight >= 0 && sinceNight < 60 ? "sunset" : "night"
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
export const WEEKDAY_SHORT = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"]

/** "Good morning Tyler, it's Thursday". A missing name leaves the greeting without one. */
export function greetingOf(firstName: string, part: DayPart, day: string, afterMidnight: boolean) {
  const name = firstName ? ` ${firstName}` : ""
  if (part === "morning") return `Good morning${name}, it's ${WEEKDAYS[weekdayOf(day)]}`
  if (part === "afternoon") return `Good afternoon${name}`
  if (afterMidnight) return `Still up${name}? Time to rest`
  return `Good evening${name}, time to wind down`
}

/** "Tyler" from "Tyler Pham"; nothing from an empty name. */
export function firstNameOf(name: string) {
  return name.trim().split(/\s+/)[0] ?? ""
}

/** True when "HH:MM" is between midnight and the morning's start. */
export function isAfterMidnight(time: string, hours: DayHours) {
  return minutesOf(time) < minutesOf(hours.morning)
}

/** Hours in order: morning before afternoon before night, all on one day. */
export function hoursInOrder(hours: DayHours) {
  return minutesOf(hours.morning) < minutesOf(hours.afternoon) && minutesOf(hours.afternoon) < minutesOf(hours.night)
}

/** "7h 20m" slept, from going to bed until up; null when either is missing or it makes no sense. */
export function sleptMinutes(bedAt: string | null, upAt: string | null) {
  if (!bedAt || !upAt) return null
  const minutes = Math.round((Date.parse(upAt) - Date.parse(bedAt)) / 60_000)
  return minutes > 0 && minutes < 24 * 60 ? minutes : null
}

export function hoursAndMinutes(minutes: number) {
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (!hours) return `${rest}m`
  return rest ? `${hours}h ${rest}m` : `${hours}h`
}

/** The Monday on or before `day`. */
export function weekStartOf(day: string) {
  return addDays(day, -((weekdayOf(day) + 6) % 7))
}

// --- Streaks ---------------------------------------------------------------

/**
 * What a day was for a streak: done, missed, or not counted at all (a day off,
 * a day the habit isn't set for, or a day before it existed).
 */
export type StreakDay = "done" | "missed" | "skip"

export type Streak = { current: number; best: number }

/**
 * A streak's current and best length, from the first day it could count up
 * to `today`. One missed day per Monday-to-Sunday week is forgiven and adds
 * nothing to the length; a second miss in the same week breaks it. Today
 * still in progress never breaks a streak: it only adds once it's done.
 */
export function streakOf(first: string, today: string, dayIs: (day: string) => StreakDay): Streak {
  if (first > today) return { current: 0, best: 0 }
  let best = 0
  let run = 0
  let forgiven = new Set<string>()
  for (let day = first; day <= today; day = addDays(day, 1)) {
    const state = dayIs(day)
    if (state === "done") {
      run += 1
    } else if (state === "missed" && day !== today) {
      const week = weekStartOf(day)
      if (forgiven.has(week)) {
        run = 0
        forgiven = new Set()
      } else {
        forgiven.add(week)
      }
    }
    best = Math.max(best, run)
  }
  return { current: run, best }
}

/**
 * The milestone a streak has just reached and not yet celebrated, such as
 * "habit:abc:30", or null. `celebrated` is every one already shown.
 */
export function newMilestone(key: string, streak: number, celebrated: readonly string[]) {
  const reached = [...MILESTONE_DAYS].reverse().find((days) => streak >= days)
  if (!reached) return null
  const id = `${key}:${reached}`
  return celebrated.includes(id) ? null : id
}

/** Whether a habit is set for this day: on its weekdays (or every day), and alive then. */
export function habitIsSetFor(
  habit: { days: readonly number[]; firstDay: string; retiredDay: string | null },
  day: string
) {
  if (day < habit.firstDay) return false
  if (habit.retiredDay && day >= habit.retiredDay) return false
  return habit.days.length === 0 || habit.days.includes(weekdayOf(day))
}

/** Picks one of `items` for `day`, the same every time for that day. */
export function pickForDay<T>(items: readonly T[], day: string): T | null {
  if (items.length === 0) return null
  const [year, month, date] = day.split("-").map(Number)
  const index = Math.floor(Date.UTC(year, month - 1, date) / 86_400_000)
  return items[((index % items.length) + items.length) % items.length]
}

// --- Weather -------------------------------------------------------------------

export type WeatherKind = "clear" | "partly-cloudy" | "cloudy" | "fog" | "drizzle" | "rain" | "snow" | "storm"

const WEATHER_WORDS: Record<WeatherKind, string> = {
  clear: "clear",
  "partly-cloudy": "partly cloudy",
  cloudy: "cloudy",
  fog: "fog",
  drizzle: "drizzle",
  rain: "rain",
  snow: "snow",
  storm: "storm",
}
export const weatherWords = (kind: WeatherKind) => WEATHER_WORDS[kind]

/** The WMO weather code Open-Meteo sends, as one of the sky's kinds of weather. */
export function weatherKindOf(code: number): WeatherKind {
  if (code === 0) return "clear"
  if (code <= 2) return "partly-cloudy"
  if (code === 3) return "cloudy"
  if (code === 45 || code === 48) return "fog"
  if (code >= 51 && code <= 57) return "drizzle"
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return "rain"
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "snow"
  return "storm"
}

// --- What people send --------------------------------------------------------

const id = z.string().min(1).max(36)
const time = z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/, "Pick a time like 09:00.")
const day = z.string().refine(isRealDay, "Pick a real day.")
const part = z.enum(DAY_PARTS)
const words = (max: number, what: string) =>
  z.string().trim().max(max, `${what} can be at most ${max} characters.`)

export const dailyHoursSchema = z
  .object({ morning: time, afternoon: time, night: time })
  .refine(hoursInOrder, "Morning has to start before afternoon, and afternoon before night.")

export const dailyCitySchema = z.object({ city: words(DAILY_LIMITS.city, "The city") })

/** An uploaded photo's address, or none. Nothing but a web or site address is drawn. */
const photoUrl = z.union([z.literal(""), z.string().max(2000).regex(/^(https?:\/\/|\/)/i, "That isn't a photo address.")])

export const dailySkySchema = z.object({
  sky: z.enum(SKY_KINDS),
  own: z.object({ morning: photoUrl, afternoon: photoUrl, night: photoUrl }),
})

export const dailyRemindersSchema = z.object({ morning: time.nullable(), afternoon: time.nullable(), night: time.nullable() })

export const dailyOwnWordsSchema = z.object({
  kind: z.enum(["lines", "questions"]),
  items: z.array(z.string().trim().min(1).max(DAILY_LIMITS.ownLine)).max(DAILY_LIMITS.ownLines),
})

const habitFields = {
  name: words(DAILY_LIMITS.habitName, "The habit's name").min(1, "Name the habit."),
  part,
  icon: z.enum(HABIT_ICONS).nullable(),
  target: z.number().int().min(1).max(DAILY_LIMITS.habitTarget),
  days: z
    .array(z.number().int().min(0).max(6))
    .max(7)
    .transform((days) => [...new Set(days)].sort()),
  atTime: time.nullable(),
}

export const newHabitSchema = z.object(habitFields)
export const updateHabitSchema = z.object({ habitId: id, ...habitFields })
export const habitIdSchema = z.object({ habitId: id })
export const habitOrderSchema = z.object({ part, habitIds: z.array(id).max(DAILY_LIMITS.habitsPerPart) })
export const habitCountSchema = z.object({
  habitId: id,
  day,
  count: z.number().int().min(0).max(DAILY_LIMITS.habitTarget),
})
export const readyRoutinesSchema = z.object({})

const JOURNAL_FIELDS = ["intention", "note", "win", "answer"] as const
export type JournalField = (typeof JOURNAL_FIELDS)[number]
const JOURNAL_MAX: Record<JournalField, number> = {
  intention: DAILY_LIMITS.intention,
  note: DAILY_LIMITS.note,
  win: DAILY_LIMITS.win,
  answer: DAILY_LIMITS.answer,
}

export const journalTextSchema = z
  .object({ day, field: z.enum(JOURNAL_FIELDS), text: z.string().trim(), question: z.string().max(200).optional() })
  .refine((input) => input.text.length <= JOURNAL_MAX[input.field], "That's too long to save.")
export const journalRatingSchema = z.object({ day, rating: z.number().int().min(1).max(5).nullable() })
export const sleepSchema = z.object({ kind: z.enum(["bed", "up"]) })
export const milestoneSchema = z.object({ id: z.string().min(1).max(80) })
export const monthSchema = z.object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/) })
export const yearSchema = z.object({ year: z.number().int().min(2000).max(2200) })
export const journalSearchSchema = z.object({ q: words(DAILY_LIMITS.search, "The search").min(1) })
