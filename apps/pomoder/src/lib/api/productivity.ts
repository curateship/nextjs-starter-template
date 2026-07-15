import { createServerFn } from "@tanstack/react-start"
import { and, desc, eq, sql } from "drizzle-orm"
import { z } from "zod"

import { db } from "@/server/db"
import { requireAppOrigin } from "@/server/origin"
import { completeProductivitySession, localDateFor, rollOverTasks, startProductivitySession, toggleTaskStatus } from "@/server/productivity"
import { dailyFocusStats, focusSessions, tasks, userPreferences, users } from "@/server/schema"
import { requireUser } from "@/server/security"

const taskIdSchema = z.object({ taskId: z.string().uuid() })
const createTaskSchema = z.object({ title: z.string().trim().min(1).max(160) })
const preferenceSchema = z.object({ focusMinutes: z.number().int().min(1).max(90), shortBreakMinutes: z.number().int().min(1).max(90), longBreakMinutes: z.number().int().min(1).max(90), autoStart: z.boolean() })
const startSessionSchema = z.object({ mode: z.enum(["focus", "short", "long"]), plannedSeconds: z.number().int().min(60).max(5_400), taskId: z.string().uuid().nullable(), idempotencyKey: z.string().min(8).max(100) })
const sessionProgressSchema = z.object({ sessionId: z.string().uuid(), accumulatedSeconds: z.number().int().min(0).max(5_400) })
const resumeSessionSchema = z.object({ sessionId: z.string().uuid(), remainingSeconds: z.number().int().min(1).max(5_400) })
const guestImportSchema = z.object({
  tasks: z.array(z.object({ title: z.string().trim().min(1).max(160), completed: z.boolean(), pomodoros: z.number().int().min(0).max(100) })).max(100),
  focusMinutes: z.number().int().min(1).max(90),
  shortBreakMinutes: z.number().int().min(1).max(90),
  longBreakMinutes: z.number().int().min(1).max(90),
  autoStart: z.boolean(),
})

const loadProductivityFn = createServerFn({ method: "GET" }).handler(async () => {
  const user = await requireUser()
  const today = localDateFor(user.timezone)
  await rollOverTasks(user.id, today)
  const [preferences, todayTasks, archivedTasks, recentStats] = await Promise.all([
    db.select().from(userPreferences).where(eq(userPreferences.userId, user.id)).limit(1),
    db.select().from(tasks).where(and(eq(tasks.userId, user.id), eq(tasks.plannedDate, today))).orderBy(tasks.createdAt),
    db.select().from(tasks).where(and(eq(tasks.userId, user.id), sql`${tasks.plannedDate} < ${today}`)).orderBy(desc(tasks.plannedDate), desc(tasks.createdAt)).limit(50),
    db.select().from(dailyFocusStats).where(eq(dailyFocusStats.userId, user.id)).orderBy(desc(dailyFocusStats.localDate)).limit(14),
  ])
  return { preferences: preferences[0], tasks: todayTasks, archivedTasks, recentStats, today }
})

const createTaskFn = createServerFn({ method: "POST" }).inputValidator(createTaskSchema).handler(async ({ data }) => {
  requireAppOrigin()
  const user = await requireUser()
  const [task] = await db.insert(tasks).values({ userId: user.id, title: data.title, plannedDate: localDateFor(user.timezone) }).returning()
  return task
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

const updatePreferencesFn = createServerFn({ method: "POST" }).inputValidator(preferenceSchema).handler(async ({ data }) => {
  requireAppOrigin()
  const user = await requireUser()
  const [preferences] = await db.insert(userPreferences).values({ userId: user.id, ...data }).onConflictDoUpdate({ target: userPreferences.userId, set: { ...data, updatedAt: new Date() } }).returning()
  return preferences
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
  return completeProductivitySession(user.id, data.sessionId, data.accumulatedSeconds, localDateFor(user.timezone))
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
    if (data.tasks.length) await tx.insert(tasks).values(data.tasks.map((task) => ({ userId: user.id, title: task.title, plannedDate: today, status: task.completed ? "completed" : "active", completedAt: task.completed ? new Date() : null, pomodoroCount: task.pomodoros })))
    await tx.insert(userPreferences).values({ userId: user.id, focusMinutes: data.focusMinutes, shortBreakMinutes: data.shortBreakMinutes, longBreakMinutes: data.longBreakMinutes, autoStart: data.autoStart }).onConflictDoUpdate({ target: userPreferences.userId, set: { focusMinutes: data.focusMinutes, shortBreakMinutes: data.shortBreakMinutes, longBreakMinutes: data.longBreakMinutes, autoStart: data.autoStart, updatedAt: new Date() } })
    await tx.update(users).set({ guestImportedAt: new Date(), updatedAt: new Date() }).where(eq(users.id, user.id))
    return { imported: true }
  })
})

export const loadProductivity = () => loadProductivityFn()
export const createTask = (title: string) => createTaskFn({ data: { title } })
export const togglePersistentTask = (taskId: string) => toggleTaskFn({ data: { taskId } })
export const abandonTask = (taskId: string) => abandonTaskFn({ data: { taskId } })
export const updatePreferences = (data: z.infer<typeof preferenceSchema>) => updatePreferencesFn({ data })
export const startFocusSession = (data: z.infer<typeof startSessionSchema>) => startSessionFn({ data })
export const pauseFocusSession = (data: z.infer<typeof sessionProgressSchema>) => pauseSessionFn({ data })
export const resumeFocusSession = (data: z.infer<typeof resumeSessionSchema>) => resumeSessionFn({ data })
export const cancelFocusSession = (sessionId: string) => cancelSessionFn({ data: { sessionId } })
export const completeFocusSession = (data: z.infer<typeof sessionProgressSchema>) => completeSessionFn({ data })
export const loadLeaderboard = () => leaderboardFn()
export const importGuestState = (data: z.infer<typeof guestImportSchema>) => importGuestStateFn({ data })
