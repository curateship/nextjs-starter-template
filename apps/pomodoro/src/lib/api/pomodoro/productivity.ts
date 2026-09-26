import { createServerFn } from "@tanstack/react-start"
import { and, desc, eq, sql } from "drizzle-orm"
import { z } from "zod"

import { db } from "@/server/db"
import { userGet, userPost } from "@/server/guards"
import {
  awardAchievements,
  loadLifetimeTotals,
} from "@/server/pomodoro/achievements"
import {
  completeProductivitySession,
  loadFocusSummary,
  loadOrCreatePreferences,
  localDateFor,
  saveSessionNote,
  startProductivitySession,
} from "@/server/pomodoro/productivity"
import { loadOrCreateProfile, userToday } from "@/server/pomodoro/profile"
import { listProjects } from "@/server/pomodoro/projects"
import { pomodoroProfiles } from "@/server/pomodoro/schema"
import {
  listTasksForDay,
  reorderTodayTasks,
  rollOverTasks,
  setTaskRepeat,
  toggleTaskStatus,
  updateTaskPlan,
} from "@/server/pomodoro/tasks"
import { SESSION_NOTE_MAX_LENGTH } from "@/lib/pomodoro/session-notes"
import { EVERY_DAY } from "@/lib/pomodoro/task-repeats"
import {
  SESSIONS_BEFORE_LONG_BREAK_MAX,
  SESSIONS_BEFORE_LONG_BREAK_MIN,
} from "@/lib/pomodoro/timer-presets"
import {
  dailyFocusStats,
  focusSessions,
  tasks,
  userPreferences,
} from "@/server/pomodoro/schema"

/**
 * The timer's endpoints, ported from the old app's productivity API. Every
 * one is guarded: reads with `userGet`, changes with `userPost` (which also
 * checks the request's origin). "Today" is derived server-side from the
 * browser's timezone, because the shell keeps no timezone on the account.
 */

const timezoneSchema = z.string().min(1).max(60)
const sessionsBeforeLongBreakSchema = z
  .number()
  .int()
  .min(SESSIONS_BEFORE_LONG_BREAK_MIN)
  .max(SESSIONS_BEFORE_LONG_BREAK_MAX)
const preferencesSchema = z.object({
  focusMinutes: z.number().int().min(1).max(90),
  shortBreakMinutes: z.number().int().min(1).max(90),
  longBreakMinutes: z.number().int().min(1).max(90),
  dailyGoalSessions: z.number().int().min(1).max(20),
  sessionsBeforeLongBreak: sessionsBeforeLongBreakSchema,
  autoStart: z.boolean(),
})
const startSessionSchema = z.object({
  mode: z.enum(["focus", "short", "long"]),
  plannedSeconds: z.number().int().min(60).max(5_400),
  taskId: z.string().uuid().nullable(),
  idempotencyKey: z.string().min(8).max(100),
  timezone: timezoneSchema,
})
const taskIdSchema = z.object({ taskId: z.string().uuid() })
const createTaskSchema = z.object({
  title: z.string().trim().min(1).max(160),
  timezone: timezoneSchema,
})
const updateTaskSchema = z
  .object({
    taskId: z.string().uuid(),
    timezone: timezoneSchema,
    title: z.string().trim().min(1).max(160).optional(),
    priority: z.enum(["low", "normal", "high"]).optional(),
    estimatedPomodoros: z.number().int().min(1).max(20).nullable().optional(),
    projectId: z.string().uuid().nullable().optional(),
  })
  .refine(
    (data) =>
      data.title !== undefined ||
      data.priority !== undefined ||
      data.estimatedPomodoros !== undefined ||
      data.projectId !== undefined,
    { message: "EMPTY_UPDATE" }
  )
// null is "no repeat": the rule row is deleted, which stops future copies and
// leaves every task it already made in place.
const setTaskRepeatSchema = z.object({
  taskId: z.string().uuid(),
  timezone: timezoneSchema,
  weekdays: z.number().int().min(1).max(EVERY_DAY).nullable(),
})
const reorderTasksSchema = z.object({
  taskIds: z.array(z.string().uuid()).min(1).max(100),
  timezone: timezoneSchema,
})
const toggleTaskSchema = z.object({
  taskId: z.string().uuid(),
  timezone: timezoneSchema,
})
const guestImportSchema = z.object({
  tasks: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(160),
        completed: z.boolean(),
        pomodoros: z.number().int().min(0).max(100),
        priority: z.enum(["low", "normal", "high"]).optional(),
        estimatedPomodoros: z.number().int().min(1).max(20).nullable().optional(),
      })
    )
    .max(100),
  focusMinutes: z.number().int().min(1).max(90),
  shortBreakMinutes: z.number().int().min(1).max(90),
  longBreakMinutes: z.number().int().min(1).max(90),
  dailyGoalSessions: z.number().int().min(1).max(20),
  sessionsBeforeLongBreak: sessionsBeforeLongBreakSchema,
  autoStart: z.boolean(),
  timezone: timezoneSchema,
})
const sessionProgressSchema = z.object({
  sessionId: z.string().uuid(),
  accumulatedSeconds: z.number().int().min(0).max(5_400),
  timezone: timezoneSchema,
})
// An empty note is allowed and means "clear it", so a line typed by mistake
// can be taken back through the same field that wrote it.
const sessionNoteSchema = z.object({
  sessionId: z.string().uuid(),
  note: z.string().max(SESSION_NOTE_MAX_LENGTH),
})
const resumeSessionSchema = z.object({
  sessionId: z.string().uuid(),
  remainingSeconds: z.number().int().min(1).max(5_400),
})

const loadProductivityFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(z.object({ timezone: timezoneSchema }))
  .handler(async ({ data, context }) => {
    const today = await userToday(context.user.id, data.timezone)
    await rollOverTasks(context.user.id, today)
    const preferences = await loadOrCreatePreferences(context.user.id)
    const [summary, todayTasks, archivedTasks, recentStats, projects] =
      await Promise.all([
        loadFocusSummary(context.user.id, today, preferences.dailyGoalSessions),
        listTasksForDay(context.user.id, today),
        db
          .select()
          .from(tasks)
          .where(
            and(
              eq(tasks.userId, context.user.id),
              sql`${tasks.plannedDate} < ${today}`
            )
          )
          .orderBy(desc(tasks.plannedDate), desc(tasks.createdAt))
          .limit(50),
        db
          .select({
            localDate: dailyFocusStats.localDate,
            focusSeconds: dailyFocusStats.focusSeconds,
            focusSessions: dailyFocusStats.focusSessions,
            tasksCompleted: dailyFocusStats.tasksCompleted,
          })
          .from(dailyFocusStats)
          .where(eq(dailyFocusStats.userId, context.user.id))
          .orderBy(desc(dailyFocusStats.localDate))
          .limit(14),
        listProjects(context.user.id),
      ])
    return {
      preferences,
      today,
      summary,
      // The joined rows are flattened here so the screen keeps reading a task
      // as one object, with the rule's days and the project's name on it.
      tasks: todayTasks.map((row) => ({
        ...row.task,
        repeatWeekdays: row.repeatWeekdays,
        projectName: row.projectName,
      })),
      archivedTasks,
      recentStats,
      projects,
    }
  })

const createTaskFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(createTaskSchema)
  .handler(async ({ data, context }) => {
    const today = await userToday(context.user.id, data.timezone)
    const [task] = await db
      .insert(tasks)
      .values({
        userId: context.user.id,
        title: data.title,
        plannedDate: today,
        sortOrder: sql`(select coalesce(max(${tasks.sortOrder}), 0) + 1 from ${tasks} where ${tasks.userId} = ${context.user.id} and ${tasks.plannedDate} = ${today})`,
      })
      .returning()
    return task
  })

const updateTaskFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(updateTaskSchema)
  .handler(async ({ data, context }) => {
    const { taskId, timezone, ...changes } = data
    return updateTaskPlan(
      context.user.id,
      taskId,
      await userToday(context.user.id, timezone),
      changes
    )
  })

const setTaskRepeatFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(setTaskRepeatSchema)
  .handler(async ({ data, context }) =>
    setTaskRepeat(
      context.user.id,
      data.taskId,
      await userToday(context.user.id, data.timezone),
      data.weekdays
    )
  )

const reorderTasksFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(reorderTasksSchema)
  .handler(async ({ data, context }) => {
    await reorderTodayTasks(
      context.user.id,
      await userToday(context.user.id, data.timezone),
      data.taskIds
    )
    return { ok: true }
  })

const toggleTaskFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(toggleTaskSchema)
  .handler(async ({ data, context }) => {
    return toggleTaskStatus(
      context.user.id,
      data.taskId,
      await userToday(context.user.id, data.timezone)
    )
  })

const abandonTaskFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(taskIdSchema)
  .handler(async ({ data, context }) => {
    const [updated] = await db
      .update(tasks)
      .set({ status: "abandoned", updatedAt: new Date() })
      .where(
        and(
          eq(tasks.id, data.taskId),
          eq(tasks.userId, context.user.id),
          eq(tasks.status, "active")
        )
      )
      .returning()
    if (!updated) throw new Error("TASK_NOT_FOUND")
    return updated
  })

const updatePreferencesFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(preferencesSchema)
  .handler(async ({ data, context }) => {
    const [preferences] = await db
      .insert(userPreferences)
      .values({ userId: context.user.id, ...data })
      .onConflictDoUpdate({
        target: userPreferences.userId,
        set: { ...data, updatedAt: new Date() },
      })
      .returning()
    return preferences
  })

const startSessionFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(startSessionSchema)
  .handler(async ({ data, context }) => {
    const { timezone, ...input } = data
    return startProductivitySession(
      context.user.id,
      await userToday(context.user.id, timezone),
      input
    )
  })

const pauseSessionFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(sessionProgressSchema.omit({ timezone: true }))
  .handler(async ({ data, context }) => {
    const [updated] = await db
      .update(focusSessions)
      .set({
        status: "paused",
        accumulatedSeconds: data.accumulatedSeconds,
        targetEndsAt: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(focusSessions.id, data.sessionId),
          eq(focusSessions.userId, context.user.id),
          eq(focusSessions.status, "running")
        )
      )
      .returning()
    if (!updated) throw new Error("SESSION_NOT_FOUND")
    return updated
  })

const resumeSessionFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(resumeSessionSchema)
  .handler(async ({ data, context }) => {
    const [updated] = await db
      .update(focusSessions)
      .set({
        status: "running",
        targetEndsAt: new Date(Date.now() + data.remainingSeconds * 1_000),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(focusSessions.id, data.sessionId),
          eq(focusSessions.userId, context.user.id),
          eq(focusSessions.status, "paused")
        )
      )
      .returning()
    if (!updated) throw new Error("SESSION_NOT_FOUND")
    return updated
  })

const saveSessionNoteFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(sessionNoteSchema)
  .handler(async ({ data, context }) =>
    saveSessionNote(context.user.id, data.sessionId, data.note)
  )

const cancelSessionFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ sessionId: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    await db
      .update(focusSessions)
      .set({ status: "cancelled", targetEndsAt: null, updatedAt: new Date() })
      .where(
        and(
          eq(focusSessions.id, data.sessionId),
          eq(focusSessions.userId, context.user.id),
          sql`${focusSessions.status} in ('running', 'paused')`
        )
      )
    return { ok: true }
  })

const completeSessionFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(sessionProgressSchema)
  .handler(async ({ data, context }) => {
    const today = await userToday(context.user.id, data.timezone)
    const completion = await completeProductivitySession(
      context.user.id,
      data.sessionId,
      data.accumulatedSeconds,
      today
    )
    if (!completion) return null
    const preferences = await loadOrCreatePreferences(context.user.id)
    const summary = await loadFocusSummary(
      context.user.id,
      today,
      preferences.dailyGoalSessions
    )
    return {
      ...completion,
      today,
      summary,
      // A finished focus is the moment the session, hours and streak counters
      // move, so the badges are checked here rather than by a job that scans
      // accounts. The streak comes from the summary above instead of being
      // counted a second time.
      newAchievements: await awardForCompletedSession(
        context.user.id,
        summary.bestStreak
      ),
    }
  })

/**
 * Badges earned by the focus that just finished, or an empty list.
 *
 * A failure here is swallowed on purpose. The session is already recorded and
 * committed by this point, so letting the award throw would tell the member
 * their session failed to sync and lose the counts the answer carries, to
 * save a badge that the next finished session will award anyway.
 */
async function awardForCompletedSession(userId: string, bestStreak: number) {
  try {
    return await awardAchievements(userId, {
      ...(await loadLifetimeTotals(userId)),
      bestStreak,
    })
  } catch {
    return []
  }
}

/**
 * The first sign-in copies a guest's browser state to the account, exactly
 * once — locked on the profile row, recorded as guest_imported_at, so a
 * second sign-in (or a double call) imports nothing.
 */
const importGuestStateFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(guestImportSchema)
  .handler(async ({ data, context }) => {
    const profile = await loadOrCreateProfile(context.user.id, data.timezone)
    const today = localDateFor(profile.timezone)
    return db.transaction(async (tx) => {
      const [locked] = await tx
        .select({ guestImportedAt: pomodoroProfiles.guestImportedAt })
        .from(pomodoroProfiles)
        .where(eq(pomodoroProfiles.userId, context.user.id))
        .for("update")
      if (locked?.guestImportedAt) return { imported: false }
      if (data.tasks.length)
        await tx.insert(tasks).values(
          data.tasks.map((task, index) => ({
            userId: context.user.id,
            title: task.title,
            plannedDate: today,
            status: task.completed ? "completed" : "active",
            completedAt: task.completed ? new Date() : null,
            pomodoroCount: task.pomodoros,
            priority: task.priority ?? "normal",
            estimatedPomodoros: task.estimatedPomodoros ?? null,
            sortOrder: index + 1,
          }))
        )
      await tx
        .insert(userPreferences)
        .values({
          userId: context.user.id,
          focusMinutes: data.focusMinutes,
          shortBreakMinutes: data.shortBreakMinutes,
          longBreakMinutes: data.longBreakMinutes,
          dailyGoalSessions: data.dailyGoalSessions,
          sessionsBeforeLongBreak: data.sessionsBeforeLongBreak,
          autoStart: data.autoStart,
        })
        .onConflictDoUpdate({
          target: userPreferences.userId,
          set: {
            focusMinutes: data.focusMinutes,
            shortBreakMinutes: data.shortBreakMinutes,
            longBreakMinutes: data.longBreakMinutes,
            dailyGoalSessions: data.dailyGoalSessions,
            sessionsBeforeLongBreak: data.sessionsBeforeLongBreak,
            autoStart: data.autoStart,
            updatedAt: new Date(),
          },
        })
      await tx
        .update(pomodoroProfiles)
        .set({ guestImportedAt: new Date(), updatedAt: new Date() })
        .where(eq(pomodoroProfiles.userId, context.user.id))
      return { imported: true }
    })
  })

export const loadProductivity = (timezone: string) =>
  loadProductivityFn({ data: { timezone } })
export const createTask = (title: string, timezone: string) =>
  createTaskFn({ data: { title, timezone } })
export const updateTask = (data: z.infer<typeof updateTaskSchema>) =>
  updateTaskFn({ data })
export const setTaskRepeatRule = (
  data: z.infer<typeof setTaskRepeatSchema>
) => setTaskRepeatFn({ data })
export const reorderTasks = (taskIds: string[], timezone: string) =>
  reorderTasksFn({ data: { taskIds, timezone } })
export const togglePersistentTask = (taskId: string, timezone: string) =>
  toggleTaskFn({ data: { taskId, timezone } })
export const abandonTask = (taskId: string) =>
  abandonTaskFn({ data: { taskId } })
export const importGuestState = (data: z.infer<typeof guestImportSchema>) =>
  importGuestStateFn({ data })
export const updatePreferences = (data: z.infer<typeof preferencesSchema>) =>
  updatePreferencesFn({ data })
export const startFocusSession = (data: z.infer<typeof startSessionSchema>) =>
  startSessionFn({ data })
export const pauseFocusSession = (data: {
  sessionId: string
  accumulatedSeconds: number
}) => pauseSessionFn({ data })
export const resumeFocusSession = (data: z.infer<typeof resumeSessionSchema>) =>
  resumeSessionFn({ data })
export const cancelFocusSession = (sessionId: string) =>
  cancelSessionFn({ data: { sessionId } })
export const saveFocusSessionNote = (sessionId: string, note: string) =>
  saveSessionNoteFn({ data: { sessionId, note } })
export const completeFocusSession = (
  data: z.infer<typeof sessionProgressSchema>
) => completeSessionFn({ data })
