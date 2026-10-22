import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { ROUTINE_TYPE_IDS, type RoutineTypeId } from "@/lib/fitness/routine-types"
import { userGet, userPost } from "@/server/guards"
import { preferencesFor } from "@/server/fitness/profile"
import {
  deleteWeighIn,
  loadLiftHistory,
  loadMeasurements,
  loadRecordTimeline,
  loadRecords,
  loadTargetWeight,
  loadWeeklyGoal,
  loadWeeklySets,
  loadWeighIns,
  saveTargetWeight,
  saveWeighIn,
} from "@/server/fitness/progress"

export type { LiftPoint, LiftRecord, MeasurementDay, MuscleWeek, RecordBroken } from "@/server/fitness/progress"

const id = z.string().min(1).max(36)
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

/**
 * The Progress dashboard: records and every time one was broken, weekly sets
 * per muscle, weigh-ins with the target bodyweight, the photo days' tape
 * measurements, and the weekly goal.
 */
const pageFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(z.object({ personId: id.optional(), routineType: z.enum(ROUTINE_TYPE_IDS).optional() }))
  .handler(async ({ data, context }) => {
    const personId = data.personId ?? context.user.id
    return {
      personId,
      records: await loadRecords(context.user.id, personId),
      weeklySets: await loadWeeklySets(context.user.id, personId, 8),
      weighIns: await loadWeighIns(context.user.id, personId),
      targetWeightKg: await loadTargetWeight(context.user.id, personId),
      measurements: await loadMeasurements(context.user.id, personId),
      timeline: await loadRecordTimeline(context.user.id, personId, undefined, { routineType: data.routineType }),
      weeklyGoal: await loadWeeklyGoal(personId),
      preferences: await preferencesFor(personId),
    }
  })

export function loadProgressPage(personId?: string, routineType?: RoutineTypeId) {
  return pageFn({ data: { personId, routineType } })
}

const liftFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(z.object({ personId: id.optional(), exerciseId: id }))
  .handler(async ({ data, context }) =>
    loadLiftHistory(context.user.id, data.personId ?? context.user.id, data.exerciseId)
  )

export function loadLiftChart(exerciseId: string, personId?: string) {
  return liftFn({ data: { exerciseId, personId } })
}

const weighInFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(
    z.discriminatedUnion("action", [
      z.object({ action: z.literal("save"), day, weightKg: z.number().min(20).max(400) }),
      z.object({ action: z.literal("delete"), day }),
    ])
  )
  .handler(async ({ data, context }) => {
    if (data.action === "save") await saveWeighIn(context.user.id, data)
    else await deleteWeighIn(context.user.id, data.day)
    return loadWeighIns(context.user.id, context.user.id)
  })

export function changeWeighIn(data: Parameters<typeof weighInFn>[0]["data"]) {
  return weighInFn({ data })
}

/** The person's own target bodyweight; null clears it. */
const targetFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ targetWeightKg: z.number().min(20).max(400).nullable() }))
  .handler(async ({ data, context }) => saveTargetWeight(context.user.id, data.targetWeightKg))

export function saveTarget(targetWeightKg: number | null) {
  return targetFn({ data: { targetWeightKg } })
}
