import { and, asc, eq, inArray, like } from "drizzle-orm"

import { MAX_WORKING_RANGE, PHONE_LANE_PREFIX, RACK_PAUSED_NOTICE, SCREENSHOT_DAYS_RANGE } from "@/lib/phones/options"
import type { JobKind } from "@/lib/social/options"
import { uuid } from "@/server/auth/security"
import { db as defaultDb, type CustomShellDb } from "@/server/db"
import { publishNotificationCreated } from "@/server/notifications/events"
import { customShellNotifications } from "@/server/schema"

import { promoJobs } from "@/server/social/schema"

import { promoPhones, promoPhoneSettings } from "./schema"

/**
 * The rack's settings: how many phones work at once, how many days pictures
 * are kept, the switch that pauses every phone job, and the self-test phone
 * (`self-test.ts`). One row, "default",
 * made by `drizzle/0115_promo_phone_jobs.sql`, like the browser settings,
 * because the program that runs the jobs reads them with nobody signed in.
 */

export type PhoneSettings = { maxWorking: number; screenshotDays: number }

const DEFAULTS: PhoneSettings = { maxWorking: 5, screenshotDays: 7 }

export async function readPhoneSettings(
  db: CustomShellDb = defaultDb
): Promise<PhoneSettings & { pausedAt: Date | null; testPhoneId: string | null }> {
  const [row] = await db
    .select({
      maxWorking: promoPhoneSettings.maxWorking,
      screenshotDays: promoPhoneSettings.screenshotDays,
      pausedAt: promoPhoneSettings.pausedAt,
      testPhoneId: promoPhoneSettings.testPhoneId,
    })
    .from(promoPhoneSettings)
    .where(eq(promoPhoneSettings.id, "default"))
    .limit(1)
  return row ?? { ...DEFAULTS, pausedAt: null, testPhoneId: null }
}

export async function savePhoneSettings(input: PhoneSettings, db: CustomShellDb = defaultDb): Promise<PhoneSettings> {
  const within = (value: number, range: { min: number; max: number }, what: string) => {
    if (!Number.isInteger(value) || value < range.min || value > range.max) {
      throw new Error(`${what} has to be a whole number from ${range.min} to ${range.max}.`)
    }
    return value
  }
  const values = {
    maxWorking: within(input.maxWorking, MAX_WORKING_RANGE, "The number of phones"),
    screenshotDays: within(input.screenshotDays, SCREENSHOT_DAYS_RANGE, "The days"),
  }
  await db
    .insert(promoPhoneSettings)
    .values({ id: "default", ...values })
    .onConflictDoUpdate({ target: promoPhoneSettings.id, set: { ...values, updatedAt: new Date() } })
  return values
}

/**
 * Pauses or resumes every phone job. Jobs already running finish; nothing new
 * starts while it is paused (`claimNextJob` skips phone lanes). Pausing rings
 * the bell for the person who did it, so the pause is never forgotten, and
 * resuming takes that notice away.
 */
export async function setRackPaused(
  userId: string,
  paused: boolean,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<void> {
  const [row] = await db
    .select({ pausedAt: promoPhoneSettings.pausedAt, noticeId: promoPhoneSettings.pauseNoticeId })
    .from(promoPhoneSettings)
    .where(eq(promoPhoneSettings.id, "default"))
    .limit(1)
  if (Boolean(row?.pausedAt) === paused) return

  if (paused) {
    const noticeId = uuid()
    await db
      .insert(promoPhoneSettings)
      .values({ id: "default", pausedAt: now, pausedBy: userId, pauseNoticeId: noticeId })
      .onConflictDoUpdate({
        target: promoPhoneSettings.id,
        set: { pausedAt: now, pausedBy: userId, pauseNoticeId: noticeId, updatedAt: now },
      })
    await db.insert(customShellNotifications).values({
      id: noticeId,
      recipientUserId: userId,
      type: "app_activity",
      message: RACK_PAUSED_NOTICE,
      detail: "No phone job starts until it is resumed on the Phones dashboard. Jobs that were running finished.",
      createdAt: now,
    })
    await publishNotificationCreated(userId, db)
    return
  }

  await db
    .update(promoPhoneSettings)
    .set({ pausedAt: null, pausedBy: null, pauseNoticeId: null, updatedAt: now })
    .where(eq(promoPhoneSettings.id, "default"))
  if (row?.noticeId) {
    await db.delete(customShellNotifications).where(eq(customShellNotifications.id, row.noticeId))
    await publishNotificationCreated(userId, db)
  }
}

export type WaitingPhoneJob = {
  id: string
  kind: JobKind
  /** The phone it waits for, or empty when the phone was deleted. */
  phoneName: string
  createdAt: Date
}

/**
 * The phone jobs still waiting, oldest first, so a person resuming the rack
 * can drop the stale ones first. At most 200.
 */
export async function waitingPhoneJobs(userId: string, db: CustomShellDb = defaultDb): Promise<WaitingPhoneJob[]> {
  const rows = await db
    .select({ id: promoJobs.id, kind: promoJobs.kind, lane: promoJobs.lane, createdAt: promoJobs.createdAt })
    .from(promoJobs)
    .where(
      and(
        eq(promoJobs.userId, userId),
        eq(promoJobs.status, "queued"),
        like(promoJobs.lane, `${PHONE_LANE_PREFIX}%`)
      )
    )
    .orderBy(asc(promoJobs.createdAt))
    .limit(200)
  const phoneIds = [...new Set(rows.map((row) => (row.lane ?? "").slice(PHONE_LANE_PREFIX.length)))]
  const phones = phoneIds.length
    ? await db
        .select({ id: promoPhones.id, name: promoPhones.name })
        .from(promoPhones)
        .where(and(eq(promoPhones.userId, userId), inArray(promoPhones.id, phoneIds)))
    : []
  const names = new Map(phones.map((phone) => [phone.id, phone.name]))
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    phoneName: names.get((row.lane ?? "").slice(PHONE_LANE_PREFIX.length)) ?? "",
    createdAt: row.createdAt,
  }))
}
