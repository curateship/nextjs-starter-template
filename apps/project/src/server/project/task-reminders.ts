import { and, eq } from "drizzle-orm"

import { addDays, localNow } from "@/lib/project/days"
import { PROJECT_ERRORS } from "@/lib/project/errors"
import { now } from "@/server/auth/security"
import { db } from "@/server/db"
import { requireTaskAccess, type ProjectDb } from "@/server/project/access"
import { loadClock } from "@/server/project/checkins"
import { holidaysBetween } from "@/server/project/holidays"
import { projectTaskReminders } from "@/server/project/schema"

/**
 * "Remind me": anyone who can see a task picks a day, and on that day, at
 * their own check-in time, the bell says "Reminder: Write the About page".
 * Each person has at most one per task and nobody else sees it. The bell is
 * the only reminder, as Tyler ruled. The job that sends them is
 * `sendTaskReminders` in `reminder-jobs.ts`.
 */

/** The day I asked to be reminded about this task, or null. */
export async function myReminderOn(userId: string, taskId: string, database: ProjectDb = db) {
  const [row] = await database
    .select({ day: projectTaskReminders.day })
    .from(projectTaskReminders)
    .where(and(eq(projectTaskReminders.taskId, taskId), eq(projectTaskReminders.userId, userId)))
    .limit(1)
  return row?.day ?? null
}

/**
 * Sets my reminder on a task to a day, replacing any I had, or takes it off
 * with null. The day can't be before my own today. An archived task can still
 * be reminded about, since it changes nothing on the task.
 */
export async function setTaskReminder(
  actor: { id: string },
  input: { taskId: string; day: string | null },
  database = db
) {
  const { task } = await requireTaskAccess(actor.id, input.taskId, database, { allowArchived: true })
  if (input.day === null) {
    await database
      .delete(projectTaskReminders)
      .where(and(eq(projectTaskReminders.taskId, task.id), eq(projectTaskReminders.userId, actor.id)))
    return
  }
  if (input.day < (await myToday(actor.id, database))) throw new Error(PROJECT_ERRORS.reminderInThePast)
  await database
    .insert(projectTaskReminders)
    .values({ taskId: task.id, userId: actor.id, day: input.day, createdAt: now() })
    .onConflictDoUpdate({
      target: [projectTaskReminders.taskId, projectTaskReminders.userId],
      set: { day: input.day, createdAt: now() },
    })
}

/** Today in my own time zone, or the team's when I haven't set one. */
async function myToday(userId: string, database: ProjectDb) {
  const { zone } = await myClock(userId, database)
  return localNow(now(), zone).day
}

/** My zone and the team's work days; the site admin reads the team's zone. */
async function myClock(userId: string, database: ProjectDb) {
  const { membership, clock } = await loadClock(userId, database)
  return { teamId: membership.teamId, zone: clock.zone, workDays: clock.workDays }
}

/** How far ahead the quick due dates look for the team's holidays. */
const HOLIDAYS_AHEAD_DAYS = 60

/**
 * What the quick due-date buttons need to land on the right day: my own time
 * zone, the team's work days, and its holidays coming up. Today is worked out
 * on the screen from the zone, so it turns over at my own midnight.
 */
export async function loadMyDays(
  userId: string,
  database: ProjectDb = db
): Promise<{ zone: string; workDays: number[]; holidays: string[] }> {
  const clock = await myClock(userId, database)
  const today = localNow(now(), clock.zone).day
  const holidays = await holidaysBetween(
    clock.teamId,
    addDays(today, -1),
    addDays(today, HOLIDAYS_AHEAD_DAYS),
    database
  )
  return { zone: clock.zone, workDays: clock.workDays, holidays: holidays.map((holiday) => holiday.day) }
}
