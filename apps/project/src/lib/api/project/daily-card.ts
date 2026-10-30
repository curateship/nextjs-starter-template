import { createServerFn } from "@tanstack/react-start"
import type { z } from "zod"

import {
  dailyCitySchema,
  dailyHoursSchema,
  dailyOwnWordsSchema,
  dailySectionOrderSchema,
  dailyRemindersSchema,
  dailySkySchema,
  habitCountSchema,
  habitIdSchema,
  habitOrderSchema,
  journalRatingSchema,
  journalSearchSchema,
  journalIntentionSchema,
  journalTextSchema,
  milestoneSchema,
  monthSchema,
  newHabitSchema,
  readyRoutinesSchema,
  sleepSchema,
  updateHabitSchema,
  yearSchema,
} from "@/lib/project/daily-card"
import { userGet, userPost } from "@/server/guards"
import {
  addReadyRoutines,
  createHabit,
  loadDailyCard,
  loadDailyWeather,
  loadMonthOfTicks,
  loadYearOfRatings,
  markMilestoneShown,
  markSleep,
  orderHabits,
  restoreHabit,
  retireHabit,
  saveDailyCity,
  saveDailyHours,
  saveDailySky,
  saveJournalRating,
  saveJournalText,
  saveOwnWords,
  saveSectionOrder,
  saveRoutineReminders,
  searchJournal,
  setHabitCount,
  updateHabit,
} from "@/server/project/daily-card"

export type {
  DailyCard,
  DailyHabit,
  DailyWeather,
  JournalHit,
  MonthOfTicks,
  WeekDot,
} from "@/server/project/daily-card"

/*
 * The Daily card's server functions. Each acts for the person signed in and
 * only on their own card; the habits, streaks and journal ask for the site
 * admin inside the server module as well.
 */

const loadDailyCardFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(async ({ context }) => loadDailyCard(context.user.id))

const loadWeatherFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(async ({ context }) => loadDailyWeather(context.user.id))

const loadMonthFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(monthSchema)
  .handler(async ({ data, context }) => loadMonthOfTicks(context.user.id, data.month))

const loadYearFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(yearSchema)
  .handler(async ({ data, context }) => loadYearOfRatings(context.user.id, data.year))

const searchJournalFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(journalSearchSchema)
  .handler(async ({ data, context }) => searchJournal(context.user.id, data.q))

const saveHoursFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(dailyHoursSchema)
  .handler(async ({ data, context }) => saveDailyHours(context.user.id, data))

const saveCityFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(dailyCitySchema)
  .handler(async ({ data, context }) => saveDailyCity(context.user.id, data.city))

const saveSkyFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(dailySkySchema)
  .handler(async ({ data, context }) => saveDailySky(context.user.id, data))

const saveRemindersFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(dailyRemindersSchema)
  .handler(async ({ data, context }) => saveRoutineReminders(context.user.id, data))

const saveSectionOrderFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(dailySectionOrderSchema)
  .handler(async ({ data, context }) => saveSectionOrder(context.user.id, data.order))

const saveOwnWordsFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(dailyOwnWordsSchema)
  .handler(async ({ data, context }) => saveOwnWords(context.user.id, data.kind, data.items))

const createHabitFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(newHabitSchema)
  .handler(async ({ data, context }) => createHabit(context.user.id, data))

const updateHabitFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(updateHabitSchema)
  .handler(async ({ data, context }) => {
    const { habitId, ...input } = data
    return updateHabit(context.user.id, habitId, input)
  })

const retireHabitFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(habitIdSchema)
  .handler(async ({ data, context }) => retireHabit(context.user.id, data.habitId))

const restoreHabitFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(habitIdSchema)
  .handler(async ({ data, context }) => restoreHabit(context.user.id, data.habitId))

const orderHabitsFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(habitOrderSchema)
  .handler(async ({ data, context }) => orderHabits(context.user.id, data.part, data.habitIds))

const setHabitCountFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(habitCountSchema)
  .handler(async ({ data, context }) => setHabitCount(context.user.id, data))

const readyRoutinesFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(readyRoutinesSchema)
  .handler(async ({ context }) => addReadyRoutines(context.user.id))

const journalIntentionFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(journalIntentionSchema)
  .handler(async ({ data, context }) => saveJournalText(context.user.id, { day: data.day, field: "intention", text: data.body }))

const journalTextFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(journalTextSchema)
  .handler(async ({ data, context }) => saveJournalText(context.user.id, data))

const journalRatingFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(journalRatingSchema)
  .handler(async ({ data, context }) => saveJournalRating(context.user.id, data))

const sleepFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(sleepSchema)
  .handler(async ({ data, context }) => markSleep(context.user.id, data.kind))

const milestoneFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(milestoneSchema)
  .handler(async ({ data, context }) => markMilestoneShown(context.user.id, data.id))

/** The Daily card, loaded with My dashboard. */
export function loadDailyCardPage() {
  return loadDailyCardFn()
}
/** The weather in my city now; it loads after the card so the page never waits on it. */
export function loadMyWeather() {
  return loadWeatherFn()
}
export function loadMonthOfTicksPage(month: string) {
  return loadMonthFn({ data: { month } })
}
export function loadYearOfRatingsPage(year: number) {
  return loadYearFn({ data: { year } })
}
export function findInJournal(q: string) {
  return searchJournalFn({ data: { q } })
}
export function saveMyHours(data: z.input<typeof dailyHoursSchema>) {
  return saveHoursFn({ data })
}
export function saveMyCity(city: string) {
  return saveCityFn({ data: { city } })
}
export function saveMySky(data: z.input<typeof dailySkySchema>) {
  return saveSkyFn({ data })
}
export function saveMyReminders(data: z.input<typeof dailyRemindersSchema>) {
  return saveRemindersFn({ data })
}
/** The site admin's order for the Daily card's sections in the panel. */
export function saveMySectionOrder(data: z.input<typeof dailySectionOrderSchema>) {
  return saveSectionOrderFn({ data })
}

export function saveMyOwnWords(data: z.input<typeof dailyOwnWordsSchema>) {
  return saveOwnWordsFn({ data })
}
export function addHabit(data: z.input<typeof newHabitSchema>) {
  return createHabitFn({ data })
}
export function changeHabit(data: z.input<typeof updateHabitSchema>) {
  return updateHabitFn({ data })
}
export function retireMyHabit(habitId: string) {
  return retireHabitFn({ data: { habitId } })
}
export function bringBackHabit(habitId: string) {
  return restoreHabitFn({ data: { habitId } })
}
export function saveHabitOrder(data: z.input<typeof habitOrderSchema>) {
  return orderHabitsFn({ data })
}
export function countHabit(data: z.input<typeof habitCountSchema>) {
  return setHabitCountFn({ data })
}
export function addSampleRoutines() {
  return readyRoutinesFn({ data: {} })
}
/** Today's or tomorrow's intention, as the editor's document. */
export function saveIntention(data: z.input<typeof journalIntentionSchema>) {
  return journalIntentionFn({ data })
}

export function saveJournalWords(data: z.input<typeof journalTextSchema>) {
  return journalTextFn({ data })
}
export function rateMyDay(data: z.input<typeof journalRatingSchema>) {
  return journalRatingFn({ data })
}
export function markMySleep(kind: "bed" | "up") {
  return sleepFn({ data: { kind } })
}
export function milestoneShown(id: string) {
  return milestoneFn({ data: { id } })
}
