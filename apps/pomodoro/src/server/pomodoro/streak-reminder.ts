import { and, eq, gt, isNull, ne, or } from "drizzle-orm"

import { streakReminderMessage } from "@/lib/pomodoro/notices"
import { streakReminderDue } from "@/lib/pomodoro/streak-reminder"
import { db, type CustomShellDb } from "@/server/db"
import { writeNotices } from "@/server/pomodoro/notices"
import { loadFocusStreaks, localDateFor } from "@/server/pomodoro/productivity"
import {
  dailyFocusStats,
  pomodoroProfiles,
  userPreferences,
} from "@/server/pomodoro/schema"
import { customShellUsers } from "@/server/schema"

/**
 * The evening streak reminder. See `workspace/docs/streak-reminder.md`.
 *
 * The reminder is a bell notice only; there is no email version. Tyler's
 * call, 7 Oct 2026: "we dont need it to send email reminder".
 *
 * Each pass looks at the people who switched the reminder on, works out their
 * own local hour and day from their profile's timezone, and for anyone past
 * their hour who has not been looked at today, claims the day and then
 * decides. The claim comes first and is a guarded update, so overlapping
 * passes, or two app processes, look at one person once per day.
 *
 * A day is claimed whether or not a reminder goes: somebody who already
 * focused today, or who has no streak, cannot come to need one later that
 * evening, so there is nothing to look at again.
 */

/** The worker ticks every few seconds; once a minute is plenty for an hour. */
const PASS_EVERY_MS = 60_000
let lastPassAt = 0

/** The worker's entry point: one pass at most once a minute. */
export async function runStreakReminderPass() {
  const now = Date.now()
  if (now - lastPassAt < PASS_EVERY_MS) return
  lastPassAt = now
  await sendDueStreakReminders()
}

/** The person's own local hour, 0 to 23, falling back to UTC like the day. */
export function localHourFor(timezone: string, timestamp = new Date()) {
  const read = (timeZone: string) =>
    Number(
      new Intl.DateTimeFormat("en-GB", {
        timeZone,
        hour: "2-digit",
        hourCycle: "h23",
      }).format(timestamp)
    )
  try {
    return read(timezone)
  } catch {
    return read("UTC")
  }
}

/** Sends every reminder that is due now. Returns how many people were nudged. */
export async function sendDueStreakReminders(
  timestamp = new Date(),
  database: CustomShellDb = db
) {
  const people = await database
    .select({
      userId: userPreferences.userId,
      hour: userPreferences.streakReminderHour,
      consideredOn: userPreferences.streakReminderOn,
      timezone: pomodoroProfiles.timezone,
    })
    .from(userPreferences)
    .innerJoin(customShellUsers, eq(customShellUsers.id, userPreferences.userId))
    .leftJoin(pomodoroProfiles, eq(pomodoroProfiles.userId, userPreferences.userId))
    .where(
      and(
        eq(customShellUsers.status, "active"),
        eq(userPreferences.streakReminderBell, true)
      )
    )

  let nudged = 0
  for (const person of people) {
    const timezone = person.timezone ?? "UTC"
    const localToday = localDateFor(timezone, timestamp)
    if (
      !streakReminderDue({
        localHour: localHourFor(timezone, timestamp),
        reminderHour: person.hour,
        localToday,
        lastConsideredOn: person.consideredOn,
      })
    )
      continue

    const claimed = await database
      .update(userPreferences)
      .set({ streakReminderOn: localToday })
      .where(
        and(
          eq(userPreferences.userId, person.userId),
          or(
            isNull(userPreferences.streakReminderOn),
            ne(userPreferences.streakReminderOn, localToday)
          )
        )
      )
      .returning({ userId: userPreferences.userId })
    if (!claimed.length) continue

    const [focusedToday] = await database
      .select({ userId: dailyFocusStats.userId })
      .from(dailyFocusStats)
      .where(
        and(
          eq(dailyFocusStats.userId, person.userId),
          eq(dailyFocusStats.localDate, localToday),
          gt(dailyFocusStats.focusSessions, 0)
        )
      )
      .limit(1)
    if (focusedToday) continue
    // With today empty, the current streak is the run that ended yesterday.
    const { currentStreak } = await loadFocusStreaks(person.userId, localToday)
    if (currentStreak === 0) continue

    await writeNotices(database, [
      {
        recipientUserId: person.userId,
        kind: "streak_reminder",
        message: streakReminderMessage(currentStreak),
        href: "/timer",
      },
    ])
    nudged += 1
  }
  return nudged
}
