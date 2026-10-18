import { randomBytes } from "node:crypto"

import { eq } from "drizzle-orm"

import type { WeightUnit } from "@/lib/fitness/weights"
import { now } from "@/server/auth/security"
import { db } from "@/server/db"
import type { FitnessDb } from "@/server/fitness/access"
import { loadAppSettings } from "@/server/fitness/app-settings"
import { fitnessProfiles } from "@/server/fitness/schema"

type FitnessProfile = typeof fitnessProfiles.$inferSelect

/**
 * Everything a screen needs to draw a person's numbers: the app-wide settings
 * from Settings, App settings, plus the person's own clock and whether their
 * calendar feed is on. The feed's secret never leaves the server.
 */
export type FitnessPreferences = {
  unit: WeightUnit
  stepKg: number
  barKg: number
  platesKg: number[]
  warmupsOn: boolean
  weeklyGoal: number
  sex: "male" | "female" | null
  remindersOn: boolean
  reminderTime: string
  reminderChannel: "bell" | "email" | "both"
  missedNudgeOn: boolean
  timeZone: string
  calendarFeedOn: boolean
}

/** A person's own row, made the first time anything asks for it. */
export async function profileFor(userId: string, database: FitnessDb = db): Promise<FitnessProfile> {
  const at = now()
  await database
    .insert(fitnessProfiles)
    .values({ userId, timeZone: "UTC", calendarToken: null, createdAt: at, updatedAt: at })
    .onConflictDoNothing()
  const [profile] = await database.select().from(fitnessProfiles).where(eq(fitnessProfiles.userId, userId)).limit(1)
  return profile
}

export async function preferencesFor(userId: string, database: FitnessDb = db): Promise<FitnessPreferences> {
  const [profile, settings] = await Promise.all([profileFor(userId, database), loadAppSettings(database)])
  return {
    ...settings.units,
    ...settings.workouts,
    remindersOn: settings.reminders.remindersOn,
    reminderTime: settings.reminders.time,
    reminderChannel: settings.reminders.channel,
    missedNudgeOn: settings.reminders.nudgeOn,
    timeZone: profile.timeZone,
    calendarFeedOn: Boolean(profile.calendarToken),
  }
}

/**
 * The person's time zone, which only their browser knows. Saved when the
 * browser's own differs, so "today", the calendar and reminders run on their
 * clock. Not a setting anybody types.
 */
export async function saveTimeZone(userId: string, timeZone: string, database: FitnessDb = db) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone })
  } catch {
    return
  }
  await profileFor(userId, database)
  await database
    .update(fitnessProfiles)
    .set({ timeZone, updatedAt: now() })
    .where(eq(fitnessProfiles.userId, userId))
}

/**
 * Turns the calendar feed on with a fresh secret, or makes a new one so the
 * old address stops working. Returns the secret for the address.
 */
export async function resetCalendarToken(userId: string, database: FitnessDb = db) {
  await profileFor(userId, database)
  const token = randomBytes(24).toString("hex")
  await database
    .update(fitnessProfiles)
    .set({ calendarToken: token, updatedAt: now() })
    .where(eq(fitnessProfiles.userId, userId))
  return token
}

export async function turnCalendarFeedOff(userId: string, database: FitnessDb = db) {
  await database
    .update(fitnessProfiles)
    .set({ calendarToken: null, updatedAt: now() })
    .where(eq(fitnessProfiles.userId, userId))
}

export async function calendarTokenFor(userId: string, database: FitnessDb = db) {
  return (await profileFor(userId, database)).calendarToken
}
