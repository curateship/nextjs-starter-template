import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { noticeKindFromWords } from "@/lib/pomodoro/notices"
import {
  formatReminderHour,
  streakReminderDue,
} from "@/lib/pomodoro/streak-reminder"
import { type CustomShellDb } from "@/server/db"
import {
  localHourFor,
  sendDueStreakReminders,
} from "@/server/pomodoro/streak-reminder"
import {
  dailyFocusStats,
  pomodoroNoticeLinks,
  pomodoroProfiles,
  userPreferences,
} from "@/server/pomodoro/schema"
import { customShellNotifications } from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"

/**
 * The evening streak reminder, against a real database: one nudge to a live
 * streak with an empty day, at the set hour, and silence for everybody else.
 */

let client: PGlite
let db: CustomShellDb

beforeEach(async () => {
  ;({ client, db } = await createTestDatabase())
})

afterEach(async () => {
  await client.close()
})

/** 7:30pm on 7 Oct 2026 in UTC, the timezone every person here lives in. */
const EVENING = new Date("2026-10-07T19:30:00Z")

async function member({
  activeDays,
  bell = true,
  hour = 19,
}: {
  activeDays: string[]
  bell?: boolean
  hour?: number
}) {
  const user = await insertUser(db)
  await db.insert(pomodoroProfiles).values({ userId: user.id, timezone: "UTC" })
  await db.insert(userPreferences).values({
    userId: user.id,
    streakReminderBell: bell,
    streakReminderHour: hour,
  })
  for (const localDate of activeDays)
    await db
      .insert(dailyFocusStats)
      .values({ userId: user.id, localDate, focusSessions: 2, focusSeconds: 3000 })
  return user.id
}

async function noticesFor(userId: string) {
  return db
    .select({
      message: customShellNotifications.message,
      kind: pomodoroNoticeLinks.kind,
      href: pomodoroNoticeLinks.href,
    })
    .from(customShellNotifications)
    .innerJoin(
      pomodoroNoticeLinks,
      eq(pomodoroNoticeLinks.noticeId, customShellNotifications.id)
    )
    .where(eq(customShellNotifications.recipientUserId, userId))
}

const LIVE_STREAK = ["2026-10-04", "2026-10-05", "2026-10-06"]

describe("the streak reminder", () => {
  it("nudges a live streak with an empty day exactly once, at the set hour", async () => {
    const person = await member({ activeDays: LIVE_STREAK })

    expect(await sendDueStreakReminders(new Date("2026-10-07T18:59:00Z"), db)).toBe(0)
    expect(await sendDueStreakReminders(EVENING, db)).toBe(1)
    expect(await sendDueStreakReminders(new Date("2026-10-07T22:00:00Z"), db)).toBe(0)

    const notices = await noticesFor(person)
    expect(notices).toEqual([
      {
        message: "One session today keeps your 3-day streak.",
        kind: "streak_reminder",
        href: "/timer",
      },
    ])
    expect(
      noticeKindFromWords({ type: "app_activity", message: notices[0].message })
    ).toBe("streak_reminder")
  })

  it("comes again the next evening if the streak is still waiting", async () => {
    const person = await member({ activeDays: LIVE_STREAK })
    await sendDueStreakReminders(EVENING, db)
    // They focused on the 7th, then the 8th is empty again by the evening.
    await db.insert(dailyFocusStats).values({
      userId: person,
      localDate: "2026-10-07",
      focusSessions: 1,
      focusSeconds: 1500,
    })
    expect(await sendDueStreakReminders(new Date("2026-10-08T19:30:00Z"), db)).toBe(1)
    expect((await noticesFor(person)).at(-1)?.message).toBe(
      "One session today keeps your 4-day streak."
    )
  })

  it("says nothing to somebody who already focused today", async () => {
    const person = await member({ activeDays: [...LIVE_STREAK, "2026-10-07"] })
    expect(await sendDueStreakReminders(EVENING, db)).toBe(0)
    expect(await noticesFor(person)).toEqual([])
  })

  it("says nothing without a streak to save", async () => {
    const person = await member({ activeDays: ["2026-10-01"] })
    expect(await sendDueStreakReminders(EVENING, db)).toBe(0)
    expect(await noticesFor(person)).toEqual([])
  })

  it("says nothing to somebody who left it switched off", async () => {
    const person = await member({ activeDays: LIVE_STREAK, bell: false })
    expect(await sendDueStreakReminders(EVENING, db)).toBe(0)
    expect(await noticesFor(person)).toEqual([])
  })

  it("reads the hour on the person's own clock", async () => {
    const person = await member({ activeDays: LIVE_STREAK })
    await db
      .update(pomodoroProfiles)
      .set({ timezone: "America/Chicago" })
      .where(eq(pomodoroProfiles.userId, person))
    // 19:30 UTC is 14:30 in Chicago, before a 7pm reminder.
    expect(await sendDueStreakReminders(EVENING, db)).toBe(0)
    // 00:30 UTC on the 8th is 19:30 on the 7th in Chicago.
    expect(await sendDueStreakReminders(new Date("2026-10-08T00:30:00Z"), db)).toBe(1)
  })
})

describe("the rules underneath", () => {
  it("is due from the hour on, once per local day", () => {
    const base = { reminderHour: 19, localToday: "2026-10-07" }
    expect(streakReminderDue({ ...base, localHour: 18, lastConsideredOn: null })).toBe(false)
    expect(streakReminderDue({ ...base, localHour: 19, lastConsideredOn: null })).toBe(true)
    expect(streakReminderDue({ ...base, localHour: 23, lastConsideredOn: "2026-10-07" })).toBe(false)
    expect(streakReminderDue({ ...base, localHour: 20, lastConsideredOn: "2026-10-06" })).toBe(true)
  })

  it("names hours the way people say them", () => {
    expect([12, 13, 19, 23].map(formatReminderHour)).toEqual(["noon", "1pm", "7pm", "11pm"])
  })

  it("falls back to UTC for a timezone it does not know", () => {
    expect(localHourFor("Not/AZone", EVENING)).toBe(19)
  })
})
