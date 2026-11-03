import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { MAX_TRIP_DAYS, id } from "@/lib/travel/rules"
import { userPost } from "@/server/guards"
import {
  addDay,
  copyDay,
  duplicateActivity,
  moveActivities,
  moveDay,
  removeDay,
  restoreActivities,
} from "@/server/travel/days"

export type { ActivityPlace } from "@/server/travel/days"

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

const restoreFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(
    z.object({
      tripId: id,
      places: z
        .array(
          z.object({
            id,
            day: day.nullable(),
            position: z.number().int().min(0).max(1000),
            inBin: z.boolean(),
          })
        )
        .max(500),
      created: z.array(id).max(500),
    })
  )
  .handler(async ({ data, context }) => restoreActivities(context.user.id, data))

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
export function undoActivities(data: {
  tripId: string
  places: { id: string; day: number | null; position: number; inBin: boolean }[]
  created: string[]
}) {
  return restoreFn({ data })
}
