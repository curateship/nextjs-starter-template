import { aliasedTable, and, desc, eq, gt, gte, inArray, isNotNull, isNull, lt, max, ne, or, sql } from "drizzle-orm"

import { checkInWeek } from "@/lib/fitness/check-in"
import { addDays, todayIn, weekdayOf, type Day } from "@/lib/fitness/dates"
import { escapeHtml } from "@/lib/email/escape-html"
import { appUrlFor } from "@/server/app-url"
import { db, type CustomShellDb } from "@/server/db"
import { getWorkspaceSystemEmailSender } from "@/server/email/app-sender"
import { getEmailProvider } from "@/server/email/provider"
import { getAppEmailApiKey } from "@/server/email/settings"
import { loadAppSettings } from "@/server/fitness/app-settings"
import { currentPause } from "@/server/fitness/calendar"
import { sendFitnessNotice } from "@/server/fitness/notices"
import { profileFor } from "@/server/fitness/profile"
import {
  fitnessCheckIns,
  fitnessCoachClients,
  fitnessPhotoSessions,
  fitnessWeekDays,
  fitnessProfiles,
  fitnessPrograms,
  fitnessScheduledWorkouts,
  fitnessStrengthSettings,
} from "@/server/fitness/schema"
import { customShellUsers } from "@/server/schema"

/**
 * Workout-day reminders, the nudge after a missed workout, the coach's notice
 * after two misses in a row, the weekly check-in and the photo day reminder.
 * Runs on the shell's background loop every 15 seconds.
 *
 * - A reminder goes out on a day the active program has a workout planned,
 *   once the person's own clock passes their reminder time. Never on a rest
 *   day, never in a pause, and never on a day skipped on purpose.
 * - A nudge goes out the day after a planned workout nobody did, at the same
 *   time. One per missed workout, never one per day after it.
 * - Each row is claimed by stamping it before anything is sent, so two passes
 *   running at once send it once.
 */
export async function runReminderJobs(database: CustomShellDb = db, at: Date = new Date()) {
  // One answer for the whole app, set in Settings, App settings.
  const { reminders } = await loadAppSettings(database)
  if (reminders.remindersOn || reminders.nudgeOn) await runWorkoutReminders(reminders, database, at)
  await runCoachMissNotices(reminders, database, at)
  if (reminders.checkInOn) await runCheckInAsks(reminders, database, at)
  if (reminders.photoReminderOn) await runPhotoReminders(reminders, database, at)
}

type ReminderSettings = Awaited<ReturnType<typeof loadAppSettings>>["reminders"]

async function runWorkoutReminders(reminders: ReminderSettings, database: CustomShellDb, at: Date) {
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

/** The coach's own account row, joined beside the client's. */
const coachUser = aliasedTable(customShellUsers, "coach_user")

/**
 * Tells a client's coaches once the client has missed two planned workouts
 * in a row (Tyler, 21 Oct 2026: "After 2 misses in a row"). One notice per
 * run of misses: every missed date in the run is stamped when the notice goes
 * out, so a third miss sends nothing more. A finished date ends the run; a
 * skipped one is passed over, since it is neither done nor missed. Dates
 * before the program's start day (before "Run it again") don't count. It goes
 * out at the reminder time on the client's own clock, to the bell only.
 */
async function runCoachMissNotices(reminders: ReminderSettings, database: CustomShellDb, at: Date) {
  // One cheap look first: only programs with two or more recent missed dates
  // no coach has been told about can start a run, so only they get a closer look.
  const candidates = await database
    .select({ programId: fitnessScheduledWorkouts.programId })
    .from(fitnessScheduledWorkouts)
    .where(
      and(
        eq(fitnessScheduledWorkouts.status, "planned"),
        isNull(fitnessScheduledWorkouts.skippedAt),
        isNull(fitnessScheduledWorkouts.coachNoticedAt),
        lt(fitnessScheduledWorkouts.day, addDays(todayIn("UTC", at), 1)),
        gte(fitnessScheduledWorkouts.day, addDays(todayIn("UTC", at), -14))
      )
    )
    .groupBy(fitnessScheduledWorkouts.programId)
    .having(sql`count(*) >= 2`)
  if (candidates.length === 0) return
  const links = await database
    .select({
      clientId: fitnessCoachClients.clientUserId,
      coachId: fitnessCoachClients.coachUserId,
      timeZone: fitnessProfiles.timeZone,
      clientName: customShellUsers.name,
      programId: fitnessPrograms.id,
    })
    .from(fitnessCoachClients)
    .innerJoin(fitnessProfiles, eq(fitnessProfiles.userId, fitnessCoachClients.clientUserId))
    .innerJoin(customShellUsers, eq(customShellUsers.id, fitnessCoachClients.clientUserId))
    .innerJoin(coachUser, eq(coachUser.id, fitnessCoachClients.coachUserId))
    .innerJoin(
      fitnessPrograms,
      and(
        eq(fitnessPrograms.userId, fitnessCoachClients.clientUserId),
        eq(fitnessPrograms.isActive, true),
        isNull(fitnessPrograms.archivedAt)
      )
    )
    .where(
      and(
        isNotNull(fitnessCoachClients.acceptedAt),
        isNull(customShellUsers.deletedAt),
        isNull(coachUser.deletedAt),
        inArray(
          fitnessPrograms.id,
          candidates.map((row) => row.programId)
        )
      )
    )
  const byClient = new Map<string, typeof links>()
  for (const link of links) byClient.set(link.clientId, [...(byClient.get(link.clientId) ?? []), link])
  for (const [clientId, coaches] of byClient) {
    const { timeZone, programId, clientName } = coaches[0]
    if (localClock(timeZone, at) < reminders.time) continue
    const today = todayIn(timeZone, at)
    const pause = await currentPause(programId, today, database)
    if (pause && pause.fromDay <= today) continue
    // The run goes back to the last finished workout, however long ago, so a run already told is always seen.
    const [lastDone] = await database
      .select({ day: max(fitnessScheduledWorkouts.day) })
      .from(fitnessScheduledWorkouts)
      .where(
        and(
          eq(fitnessScheduledWorkouts.programId, programId),
          eq(fitnessScheduledWorkouts.status, "done"),
          lt(fitnessScheduledWorkouts.day, today)
        )
      )
    const recent = await database
      .select({
        id: fitnessScheduledWorkouts.id,
        status: fitnessScheduledWorkouts.status,
        skippedAt: fitnessScheduledWorkouts.skippedAt,
        coachNoticedAt: fitnessScheduledWorkouts.coachNoticedAt,
        name: fitnessWeekDays.name,
      })
      .from(fitnessScheduledWorkouts)
      .leftJoin(fitnessWeekDays, eq(fitnessWeekDays.id, fitnessScheduledWorkouts.dayId))
      .leftJoin(fitnessStrengthSettings, eq(fitnessStrengthSettings.programId, fitnessScheduledWorkouts.programId))
      .where(
        and(
          eq(fitnessScheduledWorkouts.programId, programId),
          lt(fitnessScheduledWorkouts.day, today),
          lastDone?.day ? gt(fitnessScheduledWorkouts.day, lastDone.day) : undefined,
          or(isNull(fitnessStrengthSettings.startDay), gte(fitnessScheduledWorkouts.day, fitnessStrengthSettings.startDay))
        )
      )
      .orderBy(desc(fitnessScheduledWorkouts.day))
      .limit(500)
    const run = missRun(recent)
    if (run.some((row) => row.coachNoticedAt)) {
      // The coach was told about this run already. Its newer misses are stamped too, sending
      // nothing, so the cheap look above stops picking this program out on every pass.
      await database
        .update(fitnessScheduledWorkouts)
        .set({ coachNoticedAt: at })
        .where(
          and(
            inArray(
              fitnessScheduledWorkouts.id,
              run.map((row) => row.id)
            ),
            isNull(fitnessScheduledWorkouts.coachNoticedAt)
          )
        )
      continue
    }
    if (run.length < 2) continue
    const claimedRows = await database
      .update(fitnessScheduledWorkouts)
      .set({ coachNoticedAt: at })
      .where(
        and(
          inArray(
            fitnessScheduledWorkouts.id,
            run.map((row) => row.id)
          ),
          isNull(fitnessScheduledWorkouts.coachNoticedAt)
        )
      )
      .returning({ id: fitnessScheduledWorkouts.id })
    if (claimedRows.length !== run.length) continue
    const names = run.map((row) => row.name ?? "Workout").reverse()
    const message =
      run.length === 2
        ? `${clientName} missed ${names[0]} and ${names[1]} in a row`
        : `${clientName} missed ${run.length} workouts in a row`
    for (const { coachId } of coaches) {
      await sendFitnessNotice(
        {
          recipientUserId: coachId,
          actorUserId: clientId,
          kind: "missed",
          message,
          detail: "Open their programs to see the week.",
          href: `/programs?person=${clientId}`,
        },
        database
      )
    }
  }
}

/**
 * The newest planned dates before today that nobody trained on, newest
 * first, stopping at the first one that was done. A skipped date is passed
 * over: it neither ends the run nor counts as a miss.
 */
export function missRun<T extends { status: "planned" | "done"; skippedAt: Date | null }>(recentNewestFirst: T[]): T[] {
  const run: T[] = []
  for (const row of recentNewestFirst) {
    if (row.status === "done") break
    if (!row.skippedAt) run.push(row)
  }
  return run
}

/**
 * Asks each person with a coach for their weekly check-in on Sunday, at the
 * reminder time on their own clock. Once a week: the week is stamped on the
 * person before the notice goes out, and someone who already sent it that
 * week isn't asked. A coach whose account is being deleted doesn't count.
 */
async function runCheckInAsks(reminders: ReminderSettings, database: CustomShellDb, at: Date) {
  const clients = await database
    .selectDistinct({
      userId: customShellUsers.id,
      timeZone: fitnessProfiles.timeZone,
      email: customShellUsers.email,
      workspaceId: customShellUsers.currentWorkspaceId,
      askedFor: fitnessProfiles.checkInAskedFor,
    })
    .from(fitnessCoachClients)
    .innerJoin(customShellUsers, eq(customShellUsers.id, fitnessCoachClients.clientUserId))
    .innerJoin(coachUser, eq(coachUser.id, fitnessCoachClients.coachUserId))
    .leftJoin(fitnessProfiles, eq(fitnessProfiles.userId, fitnessCoachClients.clientUserId))
    .where(
      and(
        isNotNull(fitnessCoachClients.acceptedAt),
        isNull(customShellUsers.deletedAt),
        isNull(coachUser.deletedAt)
      )
    )
  for (const client of clients) {
    // A client who hasn't opened Fitness yet has no row of their own; it's made on the server's clock.
    const timeZone = client.timeZone ?? (await profileFor(client.userId, database)).timeZone
    const today = todayIn(timeZone, at)
    if (weekdayOf(today) !== 0 || localClock(timeZone, at) < reminders.time) continue
    const week = checkInWeek(today)
    if (client.askedFor === week) continue
    const claimedRows = await database
      .update(fitnessProfiles)
      .set({ checkInAskedFor: week })
      .where(
        and(
          eq(fitnessProfiles.userId, client.userId),
          or(isNull(fitnessProfiles.checkInAskedFor), ne(fitnessProfiles.checkInAskedFor, week))
        )
      )
      .returning({ userId: fitnessProfiles.userId })
    if (claimedRows.length === 0) continue
    const [sent] = await database
      .select({ id: fitnessCheckIns.id })
      .from(fitnessCheckIns)
      .where(and(eq(fitnessCheckIns.userId, client.userId), eq(fitnessCheckIns.week, week)))
      .limit(1)
    if (sent) continue
    await deliver(
      { ...client, channel: reminders.channel },
      {
        kind: "checkin",
        message: "Your weekly check-in",
        detail: "Tell your coach how the week went. It takes a minute.",
        href: "/programs",
        linkText: "Send your check-in",
      },
      database
    )
  }
}

/** How long after the last photo day "Time for a photo day" goes out. */
export const PHOTO_REMINDER_DAYS = 28

/**
 * "Time for a photo day", four weeks after the person's last one (Tyler,
 * 21 Oct 2026: "4 weeks"). One per gap: the person is stamped when it goes
 * out, and only a newer photo day starts the next four weeks, so adding an
 * older one sends nothing. Someone who never kept a photo day never gets it.
 */
async function runPhotoReminders(reminders: ReminderSettings, database: CustomShellDb, at: Date) {
  const people = await database
    .select({
      userId: fitnessProfiles.userId,
      timeZone: fitnessProfiles.timeZone,
      nudgedAt: fitnessProfiles.photoNudgedAt,
      email: customShellUsers.email,
      workspaceId: customShellUsers.currentWorkspaceId,
      lastDay: max(fitnessPhotoSessions.day),
    })
    .from(fitnessProfiles)
    .innerJoin(customShellUsers, eq(customShellUsers.id, fitnessProfiles.userId))
    .innerJoin(fitnessPhotoSessions, eq(fitnessPhotoSessions.userId, fitnessProfiles.userId))
    .where(isNull(customShellUsers.deletedAt))
    .groupBy(
      fitnessProfiles.userId,
      fitnessProfiles.timeZone,
      fitnessProfiles.photoNudgedAt,
      customShellUsers.email,
      customShellUsers.currentWorkspaceId
    )
  for (const person of people) {
    if (!person.lastDay) continue
    const due = addDays(person.lastDay, PHOTO_REMINDER_DAYS)
    // Already reminded for this last photo day: the reminder went out on or after its due day.
    if (person.nudgedAt && todayIn(person.timeZone, person.nudgedAt) >= due) continue
    const today = todayIn(person.timeZone, at)
    if (due > today || localClock(person.timeZone, at) < reminders.time) continue
    const claimedRows = await database
      .update(fitnessProfiles)
      .set({ photoNudgedAt: at })
      .where(
        and(
          eq(fitnessProfiles.userId, person.userId),
          person.nudgedAt
            ? eq(fitnessProfiles.photoNudgedAt, person.nudgedAt)
            : isNull(fitnessProfiles.photoNudgedAt)
        )
      )
      .returning({ userId: fitnessProfiles.userId })
    if (claimedRows.length === 0) continue
    const [program] = await database
      .select({ id: fitnessPrograms.id })
      .from(fitnessPrograms)
      .where(
        and(
          eq(fitnessPrograms.userId, person.userId),
          eq(fitnessPrograms.isActive, true),
          isNull(fitnessPrograms.archivedAt)
        )
      )
      .limit(1)
    await deliver(
      { ...person, channel: reminders.channel },
      {
        kind: "photo",
        message: "Time for a photo day",
        detail: "Four weeks since the last one. Same light, same spot, front, side and back.",
        href: program ? `/programs/${program.id}?view=photos&new=photo-day` : "/programs",
        linkText: "Add a photo day",
      },
      database
    )
  }
}

type Person = {
  userId: string
  channel: "bell" | "email" | "both"
  email: string
  workspaceId: string | null
  programId: string
}

/** Who a notice goes to, and by which way: the bell, email or both. */
type Recipient = Pick<Person, "userId" | "channel" | "email" | "workspaceId">

type Notice = {
  kind: "reminder" | "missed" | "checkin" | "photo"
  message: string
  detail: string
  href: string
  /** The email's link words. */
  linkText?: string
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
        isNull(fitnessScheduledWorkouts.skippedAt),
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

async function deliver(person: Recipient, notice: Notice, database: CustomShellDb) {
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
async function sendReminderEmail(person: Recipient, notice: Notice, database: CustomShellDb) {
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
    html: `<p>${escapeHtml(notice.message)}</p><p>${escapeHtml(notice.detail)}</p><p><a href="${escapeHtml(link)}">${escapeHtml(notice.linkText ?? "Open the program")}</a></p>`,
  })
}
