import { createServerFn } from "@tanstack/react-start"
import { and, desc, eq, sql } from "drizzle-orm"
import { z } from "zod"

import { db } from "@/server/db"
import { requireAppOrigin } from "@/server/origin"
import { completeProductivitySession, loadFocusSummary, localDateFor, reorderTodayTasks, rollOverTasks, startProductivitySession, toggleTaskStatus, updateTaskPlan } from "@/server/productivity"
import { dailyFocusStats, focusSessions, tasks, userPreferences, users } from "@/server/schema"
import { requireUser } from "@/server/security"
import { applySoundPreferences, loadSoundPreferences } from "@/server/sound-preferences"

const taskIdSchema = z.object({ taskId: z.string().uuid() })
const createTaskSchema = z.object({ title: z.string().trim().min(1).max(160) })
const updateTaskSchema = z
  .object({
    taskId: z.string().uuid(),
    title: z.string().trim().min(1).max(160).optional(),
    priority: z.enum(["low", "normal", "high"]).optional(),
    estimatedPomodoros: z.number().int().min(1).max(20).nullable().optional(),
  })
  .refine((data) => data.title !== undefined || data.priority !== undefined || data.estimatedPomodoros !== undefined, { message: "EMPTY_UPDATE" })
const reorderTasksSchema = z.object({ taskIds: z.array(z.string().uuid()).min(1).max(100) })
const productivityPreferenceSchema = z.object({ focusMinutes: z.number().int().min(1).max(90), shortBreakMinutes: z.number().int().min(1).max(90), longBreakMinutes: z.number().int().min(1).max(90), dailyGoalSessions: z.number().int().min(1).max(20), autoStart: z.boolean() })
const soundPreferenceSchema = z.object({ selectedSound: z.string().max(60).nullable(), soundVolume: z.number().int().min(0).max(100), soundMuted: z.boolean(), completionAlerts: z.boolean() })
const startSessionSchema = z.object({ mode: z.enum(["focus", "short", "long"]), plannedSeconds: z.number().int().min(60).max(5_400), taskId: z.string().uuid().nullable(), idempotencyKey: z.string().min(8).max(100) })
const sessionProgressSchema = z.object({ sessionId: z.string().uuid(), accumulatedSeconds: z.number().int().min(0).max(5_400) })
const resumeSessionSchema = z.object({ sessionId: z.string().uuid(), remainingSeconds: z.number().int().min(1).max(5_400) })
const guestImportSchema = z.object({
  tasks: z.array(z.object({ title: z.string().trim().min(1).max(160), completed: z.boolean(), pomodoros: z.number().int().min(0).max(100), priority: z.enum(["low", "normal", "high"]).optional(), estimatedPomodoros: z.number().int().min(1).max(20).nullable().optional() })).max(100),
  focusMinutes: z.number().int().min(1).max(90),
  shortBreakMinutes: z.number().int().min(1).max(90),
  longBreakMinutes: z.number().int().min(1).max(90),
  dailyGoalSessions: z.number().int().min(1).max(20),
  autoStart: z.boolean(),
})

const loadProductivityFn = createServerFn({ method: "GET" }).handler(async () => {
  const user = await requireUser()
  const today = localDateFor(user.timezone)
  await rollOverTasks(user.id, today)
  const preferencesPromise = Promise.resolve(db.select().from(userPreferences).where(eq(userPreferences.userId, user.id)).limit(1))
  const summaryPromise = preferencesPromise.then(([preferences]) => loadFocusSummary(user.id, today, preferences.dailyGoalSessions))
  const [preferences, todayTasks, archivedTasks, recentStats, summary] = await Promise.all([
    preferencesPromise,
    db.select().from(tasks).where(and(eq(tasks.userId, user.id), eq(tasks.plannedDate, today))).orderBy(tasks.sortOrder, tasks.createdAt),
    db.select().from(tasks).where(and(eq(tasks.userId, user.id), sql`${tasks.plannedDate} < ${today}`)).orderBy(desc(tasks.plannedDate), desc(tasks.createdAt)).limit(50),
    db.select().from(dailyFocusStats).where(eq(dailyFocusStats.userId, user.id)).orderBy(desc(dailyFocusStats.localDate)).limit(14),
    summaryPromise,
  ])
  const resolvedPreferences = preferences[0]
  return {
    preferences: resolvedPreferences,
    tasks: todayTasks,
    archivedTasks,
    recentStats,
    today,
    summary,
  }
})

const createTaskFn = createServerFn({ method: "POST" }).inputValidator(createTaskSchema).handler(async ({ data }) => {
  requireAppOrigin()
  const user = await requireUser()
  const today = localDateFor(user.timezone)
  const [task] = await db
    .insert(tasks)
    .values({ userId: user.id, title: data.title, plannedDate: today, sortOrder: sql`(select coalesce(max(${tasks.sortOrder}), 0) + 1 from ${tasks} where ${tasks.userId} = ${user.id} and ${tasks.plannedDate} = ${today})` })
    .returning()
  return task
})

const updateTaskFn = createServerFn({ method: "POST" }).inputValidator(updateTaskSchema).handler(async ({ data }) => {
  requireAppOrigin()
  const user = await requireUser()
  const { taskId, ...changes } = data
  return updateTaskPlan(user.id, taskId, localDateFor(user.timezone), changes)
})

const reorderTasksFn = createServerFn({ method: "POST" }).inputValidator(reorderTasksSchema).handler(async ({ data }) => {
  requireAppOrigin()
  const user = await requireUser()
  await reorderTodayTasks(user.id, localDateFor(user.timezone), data.taskIds)
  return { ok: true }
})

const toggleTaskFn = createServerFn({ method: "POST" }).inputValidator(taskIdSchema).handler(async ({ data }) => {
  requireAppOrigin()
  const user = await requireUser()
  return toggleTaskStatus(user.id, data.taskId, localDateFor(user.timezone))
})

const abandonTaskFn = createServerFn({ method: "POST" }).inputValidator(taskIdSchema).handler(async ({ data }) => {
  requireAppOrigin()
  const user = await requireUser()
  const [updated] = await db.update(tasks).set({ status: "abandoned", updatedAt: new Date() }).where(and(eq(tasks.id, data.taskId), eq(tasks.userId, user.id), eq(tasks.status, "active"))).returning()
  if (!updated) throw new Error("TASK_NOT_FOUND")
  return updated
})

const updatePreferencesFn = createServerFn({ method: "POST" }).inputValidator(productivityPreferenceSchema).handler(async ({ data }) => {
  requireAppOrigin()
  const user = await requireUser()
  const [preferences] = await db.insert(userPreferences).values({ userId: user.id, ...data }).onConflictDoUpdate({ target: userPreferences.userId, set: { ...data, updatedAt: new Date() } }).returning()
  return preferences
})

const loadSoundPreferencesFn = createServerFn({ method: "GET" }).handler(async () => {
  const user = await requireUser()
  return loadSoundPreferences(user.id)
})

const saveSoundPreferencesFn = createServerFn({ method: "POST" }).inputValidator(soundPreferenceSchema).handler(async ({ data }) => {
  requireAppOrigin()
  const user = await requireUser()
  return applySoundPreferences(user.id, data)
})

const startSessionFn = createServerFn({ method: "POST" }).inputValidator(startSessionSchema).handler(async ({ data }) => {
  requireAppOrigin()
  const user = await requireUser()
  return startProductivitySession(user.id, localDateFor(user.timezone), data)
})

const pauseSessionFn = createServerFn({ method: "POST" }).inputValidator(sessionProgressSchema).handler(async ({ data }) => {
  requireAppOrigin()
  const user = await requireUser()
  const [updated] = await db.update(focusSessions).set({ status: "paused", accumulatedSeconds: data.accumulatedSeconds, targetEndsAt: null, updatedAt: new Date() }).where(and(eq(focusSessions.id, data.sessionId), eq(focusSessions.userId, user.id), eq(focusSessions.status, "running"))).returning()
  if (!updated) throw new Error("SESSION_NOT_FOUND")
  return updated
})

const resumeSessionFn = createServerFn({ method: "POST" }).inputValidator(resumeSessionSchema).handler(async ({ data }) => {
  requireAppOrigin()
  const user = await requireUser()
  const [updated] = await db.update(focusSessions).set({ status: "running", targetEndsAt: new Date(Date.now() + data.remainingSeconds * 1_000), updatedAt: new Date() }).where(and(eq(focusSessions.id, data.sessionId), eq(focusSessions.userId, user.id), eq(focusSessions.status, "paused"))).returning()
  if (!updated) throw new Error("SESSION_NOT_FOUND")
  return updated
})

const cancelSessionFn = createServerFn({ method: "POST" }).inputValidator(z.object({ sessionId: z.string().uuid() })).handler(async ({ data }) => {
  requireAppOrigin()
  const user = await requireUser()
  await db.update(focusSessions).set({ status: "cancelled", targetEndsAt: null, updatedAt: new Date() }).where(and(eq(focusSessions.id, data.sessionId), eq(focusSessions.userId, user.id), sql`${focusSessions.status} in ('running', 'paused')`))
  return { ok: true }
})

const completeSessionFn = createServerFn({ method: "POST" }).inputValidator(sessionProgressSchema).handler(async ({ data }) => {
  requireAppOrigin()
  const user = await requireUser()
  const today = localDateFor(user.timezone)
  const completion = await completeProductivitySession(user.id, data.sessionId, data.accumulatedSeconds, today)
  if (!completion) return null
  const [preferences] = await db.select({ dailyGoalSessions: userPreferences.dailyGoalSessions }).from(userPreferences).where(eq(userPreferences.userId, user.id)).limit(1)
  return { ...completion, today, summary: await loadFocusSummary(user.id, today, preferences.dailyGoalSessions) }
})

const leaderboardFn = createServerFn({ method: "GET" }).handler(async () => {
  return db.select({ id: users.id, name: users.publicDisplayName, focusSessions: sql<number>`coalesce(sum(${dailyFocusStats.focusSessions}), 0)::int`, focusSeconds: sql<number>`coalesce(sum(${dailyFocusStats.focusSeconds}), 0)::int` }).from(users).leftJoin(dailyFocusStats, eq(dailyFocusStats.userId, users.id)).where(and(eq(users.leaderboardOptIn, true), sql`${users.publicDisplayName} is not null`)).groupBy(users.id).orderBy(desc(sql`sum(${dailyFocusStats.focusSeconds})`)).limit(100)
})

const importGuestStateFn = createServerFn({ method: "POST" }).inputValidator(guestImportSchema).handler(async ({ data }) => {
  requireAppOrigin()
  const user = await requireUser()
  const today = localDateFor(user.timezone)
  return db.transaction(async (tx) => {
    const [locked] = await tx.select({ guestImportedAt: users.guestImportedAt }).from(users).where(eq(users.id, user.id)).for("update")
    if (locked?.guestImportedAt) return { imported: false }
    if (data.tasks.length) await tx.insert(tasks).values(data.tasks.map((task, index) => ({ userId: user.id, title: task.title, plannedDate: today, status: task.completed ? "completed" : "active", completedAt: task.completed ? new Date() : null, pomodoroCount: task.pomodoros, priority: task.priority ?? "normal", estimatedPomodoros: task.estimatedPomodoros ?? null, sortOrder: index + 1 })))
    await tx.insert(userPreferences).values({ userId: user.id, focusMinutes: data.focusMinutes, shortBreakMinutes: data.shortBreakMinutes, longBreakMinutes: data.longBreakMinutes, dailyGoalSessions: data.dailyGoalSessions, autoStart: data.autoStart }).onConflictDoUpdate({ target: userPreferences.userId, set: { focusMinutes: data.focusMinutes, shortBreakMinutes: data.shortBreakMinutes, longBreakMinutes: data.longBreakMinutes, dailyGoalSessions: data.dailyGoalSessions, autoStart: data.autoStart, updatedAt: new Date() } })
    await tx.update(users).set({ guestImportedAt: new Date(), updatedAt: new Date() }).where(eq(users.id, user.id))
    return { imported: true }
  })
})

export const loadProductivity = () => loadProductivityFn()
export const createTask = (title: string) => createTaskFn({ data: { title } })
export const updateTask = (data: z.infer<typeof updateTaskSchema>) => updateTaskFn({ data })
export const reorderTasks = (taskIds: string[]) => reorderTasksFn({ data: { taskIds } })
export const togglePersistentTask = (taskId: string) => toggleTaskFn({ data: { taskId } })
export const abandonTask = (taskId: string) => abandonTaskFn({ data: { taskId } })
export const updatePreferences = (data: z.infer<typeof productivityPreferenceSchema>) => updatePreferencesFn({ data })
export const loadUserSoundPreferences = () => loadSoundPreferencesFn()
export const saveUserSoundPreferences = (data: z.infer<typeof soundPreferenceSchema>) => saveSoundPreferencesFn({ data })
export const startFocusSession = (data: z.infer<typeof startSessionSchema>) => startSessionFn({ data })
export const pauseFocusSession = (data: z.infer<typeof sessionProgressSchema>) => pauseSessionFn({ data })
export const resumeFocusSession = (data: z.infer<typeof resumeSessionSchema>) => resumeSessionFn({ data })
export const cancelFocusSession = (sessionId: string) => cancelSessionFn({ data: { sessionId } })
export const completeFocusSession = (data: z.infer<typeof sessionProgressSchema>) => completeSessionFn({ data })
export const loadLeaderboard = () => leaderboardFn()
export const importGuestState = (data: z.infer<typeof guestImportSchema>) => importGuestStateFn({ data })
