import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { userGet, userPost } from "@/server/guards"
import { preferencesFor } from "@/server/fitness/profile"
import {
  deleteWeighIn,
  loadLiftHistory,
  loadRecords,
  loadWeeklyGoal,
  loadWeeklySets,
  loadWeighIns,
  saveWeighIn,
} from "@/server/fitness/progress"

export type { LiftPoint, LiftRecord, MuscleWeek } from "@/server/fitness/progress"

const id = z.string().min(1).max(36)
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

/** The Progress dashboard: records, weekly sets per muscle, weigh-ins and the weekly goal. */
const pageFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(z.object({ personId: id.optional() }))
  .handler(async ({ data, context }) => {
    const personId = data.personId ?? context.user.id
    return {
      personId,
      records: await loadRecords(context.user.id, personId),
      weeklySets: await loadWeeklySets(context.user.id, personId, 8),
      weighIns: await loadWeighIns(context.user.id, personId),
      weeklyGoal: await loadWeeklyGoal(personId),
      preferences: await preferencesFor(personId),
    }
  })

export function loadProgressPage(personId?: string) {
  return pageFn({ data: { personId } })
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
