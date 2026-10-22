import { z } from "zod"

import { WEIGHT_UNITS } from "@/lib/fitness/weights"

/**
 * Fitness's app-wide settings. Tyler, 18 Oct 2026: they live in Settings, App
 * settings, one answer for the whole app, set by the site admin. Each group is
 * one row in `fitness_app_settings`, saved on its own.
 */

export const appSettingSchemas = {
  units: z.object({
    unit: z.enum(WEIGHT_UNITS),
    /** The smallest jump the plates allow, in kilograms. */
    stepKg: z.number().min(0.1).max(20),
    barKg: z.number().min(0).max(50),
    platesKg: z.array(z.number().min(0.1).max(60)).min(1).max(15),
  }),
  workouts: z.object({
    warmupsOn: z.boolean(),
    weeklyGoal: z.number().int().min(1).max(14),
    /** Only for comparing lifts with others of the same size. Null hides it. */
    sex: z.enum(["male", "female"]).nullable(),
  }),
  reminders: z.object({
    remindersOn: z.boolean(),
    time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    channel: z.enum(["bell", "email", "both"]),
    nudgeOn: z.boolean(),
    /** Sunday's "Your weekly check-in" for people with a coach. */
    checkInOn: z.boolean(),
    /** "Time for a photo day", four weeks after the last one. */
    photoReminderOn: z.boolean(),
  }),
} as const

export type AppSettingKey = keyof typeof appSettingSchemas
export type AppSettingValue<K extends AppSettingKey> = z.infer<(typeof appSettingSchemas)[K]>
export type FitnessAppSettings = { [K in AppSettingKey]: AppSettingValue<K> }

export const APP_SETTING_KEYS = Object.keys(appSettingSchemas) as AppSettingKey[]

/** What a new install starts with: kilograms, 2.5 kg jumps, a 20 kg bar. */
export const DEFAULT_APP_SETTINGS: FitnessAppSettings = {
  units: { unit: "kg", stepKg: 2.5, barKg: 20, platesKg: [25, 20, 15, 10, 5, 2.5, 1.25] },
  workouts: { warmupsOn: true, weeklyGoal: 3, sex: null },
  reminders: {
    remindersOn: false,
    time: "07:00",
    channel: "bell",
    nudgeOn: false,
    checkInOn: true,
    photoReminderOn: true,
  },
}

/** The tabs under Settings, App settings, in order. */
export const FITNESS_SETTINGS_TABS = {
  units: "fitness-units",
  workouts: "fitness-workouts",
  reminders: "fitness-reminders",
  calendar: "fitness-calendar",
} as const
