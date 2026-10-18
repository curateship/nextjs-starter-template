import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { EQUIPMENT } from "@/lib/fitness/exercise-catalog"
import { ROUTINE_TYPE_IDS } from "@/lib/fitness/routine-types"
import { EXPERIENCE, GOALS, PLAN_TEMPLATES } from "@/lib/fitness/templates"
import { userGet, userPost } from "@/server/guards"
import { programFor } from "@/server/fitness/access"
import { applyAiPlan, buildAiPlan } from "@/server/fitness/ai-plan"
import {
  currentPause,
  loadCalendar,
  loadScheduledDay,
  moveScheduled,
  pauseProgram,
  resumeProgram,
  todayFor,
} from "@/server/fitness/calendar"
import { COACH_ROLE, listClients, listMyCoaches } from "@/server/fitness/coach"
import { listExercises } from "@/server/fitness/exercises"
import { preferencesFor } from "@/server/fitness/profile"
import {
  createProgram,
  deleteProgram,
  deletePrograms,
  listPrograms,
  openProgramWorkout,
  renameProgram,
  setActiveProgram,
  setProgramArchived,
} from "@/server/fitness/programs"
import { loadWeeklyGoal } from "@/server/fitness/progress"
import { setProgramShared } from "@/server/fitness/sharing"
import {
  addDayExercise,
  applyTemplate,
  copyWeekDay,
  loadBaseline,
  loadStrengthSettings,
  loadWeek,
  removeBaselineLift,
  removeDayExercise,
  reorderDayExercises,
  restWeekDay,
  saveBaseline,
  saveBaselineLift,
  saveStrengthSettings,
  setSuperset,
  setWeekDay,
  updateDayExercise,
} from "@/server/fitness/week"
import { discardUntouchedWorkouts, openWorkout } from "@/server/fitness/workouts"

export type { ProgramSummary } from "@/server/fitness/programs"
export type { Baseline, DayExercise, StrengthSettings, WeekDay } from "@/server/fitness/week"
export type { CalendarDay } from "@/server/fitness/calendar"
export type { PlanDraft } from "@/server/fitness/ai-plan"

const id = z.string().min(1).max(36)
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const weekday = z.number().int().min(0).max(6)
const kg = z.number().min(0).max(1000)
const cm = z.number().min(0).max(400).nullable()

const baselineFields = z.object({
  bodyweightKg: kg.nullable(),
  heightCm: cm,
  chestCm: cm,
  waistCm: cm,
  hipsCm: cm,
  armCm: cm,
  thighCm: cm,
  goal: z.enum(GOALS.map((goal) => goal.id) as [string, ...string[]]).nullable(),
  experience: z.enum(EXPERIENCE.map((entry) => entry.id) as [string, ...string[]]).nullable(),
  equipment: z.array(z.enum(EQUIPMENT)).max(EQUIPMENT.length),
})

const liftFields = z.object({ exerciseId: id, weightKg: kg, reps: z.number().int().min(1).max(50) })

/**
 * The Programs dashboard: a person's programs, an unfinished workout to pick
 * up, the week's goal, coach requests, and a coach's clients.
 */
const loadProgramsPageFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(z.object({ personId: id.optional() }))
  .handler(async ({ data, context }) => {
    const personId = data.personId ?? context.user.id
    const isCoach = context.user.role === COACH_ROLE
    const own = personId === context.user.id
    if (own) await discardUntouchedWorkouts(personId)
    return {
      personId,
      isCoach,
      programs: await listPrograms(context.user.id, personId),
      openWorkout: own ? await openWorkout(personId) : null,
      weeklyGoal: await loadWeeklyGoal(personId),
      preferences: await preferencesFor(personId),
      coaches: own ? await listMyCoaches(personId) : [],
      clients: isCoach && own ? await listClients(context.user.id) : null,
    }
  })

export function loadProgramsPage(personId?: string) {
  return loadProgramsPageFn({ data: { personId } })
}

/** The New program window: name, routine type and starting data, saved together. */
const createProgramFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(
    z.object({
      name: z.string().max(80),
      routineType: z.enum(ROUTINE_TYPE_IDS),
      personId: id.optional(),
      baseline: baselineFields.partial().optional(),
      lifts: z.array(liftFields).max(30).optional(),
    })
  )
  .handler(async ({ data, context }) =>
    createProgram(context.user.id, data.personId ?? context.user.id, {
      ...data,
      baseline: data.baseline as Parameters<typeof createProgram>[2]["baseline"],
    })
  )

export function saveNewProgram(data: Parameters<typeof createProgramFn>[0]["data"]) {
  return createProgramFn({ data })
}

/**
 * One program's dashboard: its week, rules, starting data, and the lifts of
 * its own routine type, which are the only ones it offers.
 */
const loadProgramFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(z.object({ programId: id }))
  .handler(async ({ data, context }) => {
    const program = await programFor(context.user.id, data.programId)
    if (program.userId === context.user.id) await discardUntouchedWorkouts(program.userId)
    const today = await todayFor(program.userId)
    const pause = await currentPause(program.id, today)
    return {
      today,
      pause: pause ? { fromDay: pause.fromDay, untilDay: pause.untilDay, reason: pause.reason } : null,
      program: {
        id: program.id,
        userId: program.userId,
        name: program.name,
        routineType: program.routineType,
        isActive: program.isActive,
        archived: Boolean(program.archivedAt),
        mine: program.userId === context.user.id,
      },
      strength: await loadStrengthSettings(program.id),
      week: await loadWeek(program.id),
      baseline: await loadBaseline(program.id),
      exercises: await listExercises(program.userId, undefined, program.routineType),
      preferences: await preferencesFor(program.userId),
      weeklyGoal: await loadWeeklyGoal(program.userId, undefined, program.id),
      openWorkout: program.userId === context.user.id ? await openProgramWorkout(program.id) : null,
      templates: PLAN_TEMPLATES.map(({ id: templateId, label, description }) => ({ id: templateId, label, description })),
    }
  })

export function loadProgram(programId: string) {
  return loadProgramFn({ data: { programId } })
}

const loadCalendarFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(z.object({ programId: id, from: day, to: day }))
  .handler(async ({ data, context }) =>
    loadCalendar(context.user.id, data.programId, { from: data.from, to: data.to })
  )

export function loadProgramCalendar(programId: string, from: string, to: string) {
  return loadCalendarFn({ data: { programId, from, to } })
}

const loadScheduledDayFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(z.object({ scheduledId: id }))
  .handler(async ({ data, context }) => loadScheduledDay(context.user.id, data.scheduledId))

export function loadCalendarDay(scheduledId: string) {
  return loadScheduledDayFn({ data: { scheduledId } })
}

const programChangeFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(
    z.discriminatedUnion("action", [
      z.object({ action: z.literal("rename"), programId: id, name: z.string().max(80) }),
      z.object({ action: z.literal("activate"), programId: id }),
      z.object({ action: z.literal("archive"), programId: id, archived: z.boolean() }),
      z.object({ action: z.literal("delete"), programId: id }),
      z.object({ action: z.literal("deleteMany"), programIds: z.array(id).min(1).max(100) }),
      z.object({ action: z.literal("share"), programId: id, shared: z.boolean() }),
      z.object({
        action: z.literal("pause"),
        programId: id,
        fromDay: day,
        untilDay: day.nullable(),
        reason: z.enum(["holiday", "injury", "other"]),
      }),
      z.object({ action: z.literal("resume"), programId: id }),
      z.object({ action: z.literal("move"), scheduledId: id, toDay: day }),
      z.object({ action: z.literal("template"), programId: id, templateId: z.string().max(40) }),
    ])
  )
  .handler(async ({ data, context }): Promise<{ shareCode?: string | null; done?: string[]; kept?: string[] }> => {
    const actor = context.user.id
    switch (data.action) {
      case "rename":
        await renameProgram(actor, data.programId, data.name)
        return {}
      case "activate":
        await setActiveProgram(actor, data.programId)
        return {}
      case "archive":
        await setProgramArchived(actor, data.programId, data.archived)
        return {}
      case "delete":
        await deleteProgram(actor, data.programId)
        return {}
      case "deleteMany":
        return deletePrograms(actor, data.programIds)
      case "share":
        return setProgramShared(actor, data.programId, data.shared)
      case "pause":
        await pauseProgram(actor, data.programId, data)
        return {}
      case "resume":
        await resumeProgram(actor, data.programId)
        return {}
      case "move":
        await moveScheduled(actor, data.scheduledId, data.toDay)
        return {}
      case "template":
        await applyTemplate(actor, data.programId, data.templateId)
        return {}
    }
  })

export function changeProgram(data: Parameters<typeof programChangeFn>[0]["data"]) {
  return programChangeFn({ data })
}

/** The weight rules and training blocks. Which weekdays are workouts lives in the week itself. */
const strengthSettingsFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(
    z.object({
      programId: id,
      change: z
        .object({
          autoIncrease: z.boolean(),
          increaseKg: z.number().min(0).max(50),
          missesBeforeDrop: z.number().int().min(1).max(10),
          dropPercent: z.number().int().min(0).max(50),
          blockWeeks: z.number().int().min(0).max(12),
          lightWeekPercent: z.number().int().min(30).max(100),
        })
        .partial(),
    })
  )
  .handler(async ({ data, context }) => saveStrengthSettings(context.user.id, data.programId, data.change))

export function saveStrengthRules(data: Parameters<typeof strengthSettingsFn>[0]["data"]) {
  return strengthSettingsFn({ data })
}

const baselineFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ programId: id, change: baselineFields.partial() }))
  .handler(async ({ data, context }) =>
    saveBaseline(context.user.id, data.programId, data.change as Parameters<typeof saveBaseline>[2])
  )

export function saveProgramBaseline(data: Parameters<typeof baselineFn>[0]["data"]) {
  return baselineFn({ data })
}

const baselineLiftFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(
    z.discriminatedUnion("action", [
      liftFields.extend({ action: z.literal("save"), programId: id }),
      z.object({ action: z.literal("remove"), programId: id, exerciseId: id }),
    ])
  )
  .handler(async ({ data, context }) =>
    data.action === "save"
      ? saveBaselineLift(context.user.id, data.programId, data)
      : removeBaselineLift(context.user.id, data.programId, data.exerciseId)
  )

export function changeBaselineLift(data: Parameters<typeof baselineLiftFn>[0]["data"]) {
  return baselineLiftFn({ data })
}

const dayExerciseFields = {
  sets: z.number().int().min(1).max(20),
  reps: z.number().int().min(1).max(100),
  weightKg: kg,
  restSeconds: z.number().int().min(0).max(900),
}

/** The week: which weekdays are workouts, and each workout's exercises. */
const weekChangeFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(
    z.discriminatedUnion("action", [
      z.object({ action: z.literal("setDay"), programId: id, weekday, name: z.string().max(60) }),
      z.object({ action: z.literal("restDay"), dayId: id }),
      z.object({ action: z.literal("copyDay"), dayId: id, toWeekday: weekday }),
      z.object({ action: z.literal("addExercise"), dayId: id, exerciseId: id, ...dayExerciseFields }),
      z.object({
        action: z.literal("updateExercise"),
        dayExerciseId: id,
        change: z.object({ ...dayExerciseFields, exerciseId: id }).partial(),
      }),
      z.object({ action: z.literal("removeExercise"), dayExerciseId: id }),
      z.object({ action: z.literal("reorderExercises"), dayId: id, ids: z.array(id).max(40) }),
      z.object({ action: z.literal("superset"), dayExerciseId: id, joined: z.boolean() }),
    ])
  )
  .handler(async ({ data, context }): Promise<{ id?: string }> => {
    const actor = context.user.id
    switch (data.action) {
      case "setDay":
        return setWeekDay(actor, data.programId, data.weekday, data.name)
      case "restDay":
        await restWeekDay(actor, data.dayId)
        return {}
      case "copyDay":
        return copyWeekDay(actor, data.dayId, data.toWeekday)
      case "addExercise":
        return addDayExercise(actor, data.dayId, data.exerciseId, data)
      case "updateExercise":
        await updateDayExercise(actor, data.dayExerciseId, data.change)
        return {}
      case "removeExercise":
        await removeDayExercise(actor, data.dayExerciseId)
        return {}
      case "reorderExercises":
        await reorderDayExercises(actor, data.dayId, data.ids)
        return {}
      case "superset":
        await setSuperset(actor, data.dayExerciseId, data.joined)
        return {}
    }
  })

export function changeWeek(data: Parameters<typeof weekChangeFn>[0]["data"]) {
  return weekChangeFn({ data })
}

const aiPlanFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ programId: id, daysPerWeek: z.number().int().min(1).max(6) }))
  .handler(async ({ data, context }) => buildAiPlan(context.user.id, data.programId, data))

export function askForAiPlan(programId: string, daysPerWeek: number) {
  return aiPlanFn({ data: { programId, daysPerWeek } })
}

const saveAiPlanFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(
    z.object({
      programId: id,
      draft: z.object({
        days: z
          .array(
            z.object({
              weekday,
              name: z.string().min(1).max(60),
              exercises: z.array(z.object({ exerciseId: id, name: z.string().max(80), ...dayExerciseFields })).max(10),
            })
          )
          .min(1)
          .max(7),
      }),
    })
  )
  .handler(async ({ data, context }) => applyAiPlan(context.user.id, data.programId, data.draft))

export function saveAiPlan(programId: string, draft: Parameters<typeof saveAiPlanFn>[0]["data"]["draft"]) {
  return saveAiPlanFn({ data: { programId, draft } })
}
