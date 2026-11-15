import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { TRAVEL_ERRORS } from "@/lib/travel/errors"
import { MAX_TRIP_DAYS, id } from "@/lib/travel/rules"
import { enforceRateLimit } from "@/server/auth/rate-limit"
import { userPost } from "@/server/guards"
import { bestOrderForDay } from "@/server/travel/best-order"
import {
  addDay,
  copyDay,
  duplicateActivity,
  moveActivities,
  moveDay,
  removeDay,
} from "@/server/travel/days"


export type { BestOrderResult } from "@/server/travel/best-order"

const day = z.number().int().min(1).max(MAX_TRIP_DAYS)

const addDayFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ tripId: id, after: z.number().int().min(0).max(MAX_TRIP_DAYS) }))
  .handler(async ({ data, context }) => addDay(context.user.id, data))

const removeDayFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ tripId: id, day, activities: z.enum(["bin", "ideas"]) }))
  .handler(async ({ data, context }) => removeDay(context.user.id, data))

const moveDayFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ tripId: id, from: day, to: day }))
  .handler(async ({ data, context }) => moveDay(context.user.id, data))

const copyDayFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ tripId: id, from: day, to: day }))
  .handler(async ({ data, context }) => copyDay(context.user.id, data))

const duplicateFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ activityId: id }))
  .handler(async ({ data, context }) => duplicateActivity(context.user.id, data.activityId))

const moveManyFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ activityIds: z.array(id).min(1).max(500), day: day.nullable() }))
  .handler(async ({ data, context }) => moveActivities(context.user.id, data))

const bestOrderFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ tripId: id, day }))
  .handler(async ({ data, context }) => {
    // A day can be up to 36 new pairs for Google, each billed, so one person can only order so many.
    try {
      await enforceRateLimit(`travel-best-order:${context.user.id}`, { maxAttempts: 30, windowSeconds: 10 * 60 })
    } catch (error) {
      if (error instanceof Error && error.message.includes("RATE_LIMITED")) throw new Error(TRAVEL_ERRORS.tooManySearches)
      throw error
    }
    return bestOrderForDay(context.user.id, data)
  })

/** Puts a day's untimed cards in the quickest order to get round (Travel features part 5). */
export function orderTripDay(tripId: string, dayNumber: number) {
  return bestOrderFn({ data: { tripId, day: dayNumber } })
}
export function addTripDay(tripId: string, after: number) {
  return addDayFn({ data: { tripId, after } })
}
export function removeTripDay(tripId: string, dayNumber: number, activities: "bin" | "ideas") {
  return removeDayFn({ data: { tripId, day: dayNumber, activities } })
}
export function moveTripDay(tripId: string, from: number, to: number) {
  return moveDayFn({ data: { tripId, from, to } })
}
export function copyTripDay(tripId: string, from: number, to: number) {
  return copyDayFn({ data: { tripId, from, to } })
}
export function duplicateTripActivity(activityId: string) {
  return duplicateFn({ data: { activityId } })
}
export function moveManyActivities(activityIds: string[], dayNumber: number | null) {
  return moveManyFn({ data: { activityIds, day: dayNumber } })
}
