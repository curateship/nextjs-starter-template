import { and, eq, inArray, isNull } from "drizzle-orm"

import { addDays, todayIn, type Day } from "@/lib/fitness/dates"
import { escapeHtml } from "@/lib/email/escape-html"
import { appUrlFor } from "@/server/app-url"
import { db, type CustomShellDb } from "@/server/db"
import { getWorkspaceSystemEmailSender } from "@/server/email/app-sender"
import { getEmailProvider } from "@/server/email/provider"
import { getAppEmailApiKey } from "@/server/email/settings"
import { loadAppSettings } from "@/server/fitness/app-settings"
import { currentPause } from "@/server/fitness/calendar"
import { sendFitnessNotice } from "@/server/fitness/notices"
import {
  fitnessWeekDays,
  fitnessProfiles,
  fitnessPrograms,
  fitnessScheduledWorkouts,
} from "@/server/fitness/schema"
import { customShellUsers } from "@/server/schema"

/**
 * Workout-day reminders and the nudge after a missed workout. Runs on the
 * shell's background loop every 15 seconds.
 *
 * - A reminder goes out on a day the active program has a workout planned,
 *   once the person's own clock passes their reminder time. Never on a rest
 *   day, and never in a pause.
 * - A nudge goes out the day after a planned workout nobody did, at the same
 *   time. One per missed workout, never one per day after it.
 * - Each row is claimed by stamping it before anything is sent, so two passes
 *   running at once send it once.
 */
export async function runReminderJobs(database: CustomShellDb = db, at: Date = new Date()) {
  // One answer for the whole app, set in Settings, App settings.
  const { reminders } = await loadAppSettings(database)
  if (!reminders.remindersOn && !reminders.nudgeOn) return
  const people = await database
    .select({
      userId: fitnessProfiles.userId,
      timeZone: fitnessProfiles.timeZone,
      email: customShellUsers.email,
      workspaceId: customShellUsers.currentWorkspaceId,
      programId: fitnessPrograms.id,
    })
    .from(fitnessProfiles)
    .innerJoin(customShellUsers, eq(customShellUsers.id, fitnessProfiles.userId))
    .innerJoin(
      fitnessPrograms,
      and(
        eq(fitnessPrograms.userId, fitnessProfiles.userId),
        eq(fitnessPrograms.isActive, true),
        isNull(fitnessPrograms.archivedAt)
      )
    )
  for (const row of people) {
    const person = { ...row, channel: reminders.channel }
    const today = todayIn(person.timeZone, at)
    if (localClock(person.timeZone, at) < reminders.time) continue
    const pause = await currentPause(person.programId, today, database)
    if (pause && pause.fromDay <= today) continue
    if (reminders.remindersOn) await remind(person, today, database)
    if (reminders.nudgeOn) await nudge(person, addDays(today, -1), database)
  }
}

type Person = {
  userId: string
  channel: "bell" | "email" | "both"
  email: string
  workspaceId: string | null
  programId: string
}

/** "07:30" on the person's own clock. */
function localClock(timeZone: string, at: Date) {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(at)
  } catch {
    return at.toISOString().slice(11, 16)
  }
}

async function claimed(
  person: Person,
  day: Day,
  column: "remindedAt" | "nudgedAt",
  database: CustomShellDb
) {
  const rows = await database
    .update(fitnessScheduledWorkouts)
    .set({ [column]: new Date() })
    .where(
      and(
        eq(fitnessScheduledWorkouts.programId, person.programId),
        eq(fitnessScheduledWorkouts.day, day),
        eq(fitnessScheduledWorkouts.status, "planned"),
        isNull(fitnessScheduledWorkouts[column])
      )
    )
    .returning({ id: fitnessScheduledWorkouts.id, dayId: fitnessScheduledWorkouts.dayId })
  if (rows.length === 0) return null
  const [weekDay] = await database
    .select({ name: fitnessWeekDays.name })
    .from(fitnessWeekDays)
    .where(inArray(fitnessWeekDays.id, rows.flatMap((row) => (row.dayId ? [row.dayId] : []))))
    .limit(1)
  return { id: rows[0].id, name: weekDay?.name ?? "Workout" }
}

async function remind(person: Person, today: Day, database: CustomShellDb) {
  const row = await claimed(person, today, "remindedAt", database)
  if (!row) return
  const message = `Workout today: ${row.name}`
  const href = `/programs/${person.programId}`
  await deliver(person, { kind: "reminder", message, detail: "Open it when you get to the gym.", href }, database)
}

async function nudge(person: Person, yesterday: Day, database: CustomShellDb) {
  const row = await claimed(person, yesterday, "nudgedAt", database)
  if (!row) return
  const message = `You missed ${row.name} yesterday`
  const href = `/programs/${person.programId}`
  await deliver(
    person,
    { kind: "missed", message, detail: "Do it today, or move it on the calendar.", href },
    database
  )
}

async function deliver(
  person: Person,
  notice: { kind: "reminder" | "missed"; message: string; detail: string; href: string },
  database: CustomShellDb
) {
  if (person.channel !== "email") {
    await sendFitnessNotice({ recipientUserId: person.userId, ...notice }, database)
  }
  if (person.channel !== "bell") {
    await sendReminderEmail(person, notice, database)
  }
}

/**
 * Sends the reminder through the email provider directly, the way Project's
 * invite does, because adding a kind to the shell's system emails means
 * editing shell files. With no email key saved, nothing is sent.
 */
async function sendReminderEmail(
  person: Person,
  notice: { message: string; detail: string; href: string },
  database: CustomShellDb
) {
  const apiKey =
    (await getAppEmailApiKey(database, person.workspaceId ?? undefined)) ??
    process.env.CUSTOM_SHELL_RESEND_API_KEY ??
    ""
  if (!apiKey) return
  const sender = await getWorkspaceSystemEmailSender(person.workspaceId, database)
  const link = appUrlFor(notice.href)
  await getEmailProvider(apiKey).send({
    from: sender.from,
    to: person.email,
    subject: notice.message,
    text: [notice.message, "", notice.detail, "", link].join("\n"),
    html: `<p>${escapeHtml(notice.message)}</p><p>${escapeHtml(notice.detail)}</p><p><a href="${escapeHtml(link)}">Open the program</a></p>`,
  })
}
