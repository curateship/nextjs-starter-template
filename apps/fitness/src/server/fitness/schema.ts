import {
  boolean,
  date,
  doublePrecision,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core"

import { customShellNotifications, customShellUsers } from "@/server/schema"

/**
 * Fitness's own tables, kept apart from the shell's `src/server/schema.ts` on
 * purpose: that file belongs to the shell and editing it would fork this app
 * off future shell merges. The SQL that creates them is
 * `drizzle/0096_fitness_strength_training.sql`; this file only describes them
 * to the query builder. Every weight is kilograms.
 */

const userRef = () => customShellUsers.id
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull()
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull()
const day = (name: string) => date(name, { mode: "string" })

/** A person's own clock and calendar feed secret. Every other setting is app-wide (`fitnessAppSettings`). */
export const fitnessProfiles = pgTable("fitness_profiles", {
  userId: varchar("user_id", { length: 36 })
    .primaryKey()
    .references(userRef, { onDelete: "cascade" }),
  timeZone: text("time_zone").notNull(),
  calendarToken: varchar("calendar_token", { length: 64 }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
})

/**
 * Fitness's app-wide settings, one row per group (`units`, `workouts`,
 * `reminders`), edited by the site admin in Settings, App settings
 * (`drizzle/0097_fitness_programs_and_the_week.sql`).
 */
export const fitnessAppSettings = pgTable("fitness_app_settings", {
  key: varchar("key", { length: 40 }).primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: updatedAt(),
  updatedByUserId: varchar("updated_by_user_id", { length: 36 }).references(userRef, { onDelete: "set null" }),
})

export const fitnessPrograms = pgTable("fitness_programs", {
  id: varchar("id", { length: 36 }).primaryKey(),
  userId: varchar("user_id", { length: 36 })
    .notNull()
    .references(userRef, { onDelete: "cascade" }),
  name: varchar("name", { length: 80 }).notNull(),
  routineType: varchar("routine_type", { length: 32 }).notNull(),
  isActive: boolean("is_active").notNull(),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  builtByUserId: varchar("built_by_user_id", { length: 36 }).references(userRef, {
    onDelete: "set null",
  }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
})

export const fitnessStrengthSettings = pgTable("fitness_strength_settings", {
  programId: varchar("program_id", { length: 36 })
    .primaryKey()
    .references(() => fitnessPrograms.id, { onDelete: "cascade" }),
  startDay: day("start_day").notNull(),
  scheduledThrough: day("scheduled_through"),
  autoIncrease: boolean("auto_increase").notNull(),
  increaseKg: doublePrecision("increase_kg").notNull(),
  missesBeforeDrop: smallint("misses_before_drop").notNull(),
  dropPercent: smallint("drop_percent").notNull(),
  blockWeeks: smallint("block_weeks").notNull(),
  lightWeekPercent: smallint("light_week_percent").notNull(),
  shareSlug: varchar("share_slug", { length: 24 }),
})

export const fitnessExercises = pgTable("fitness_exercises", {
  id: varchar("id", { length: 36 }).primaryKey(),
  slug: varchar("slug", { length: 64 }),
  ownerUserId: varchar("owner_user_id", { length: 36 }).references(userRef, {
    onDelete: "cascade",
  }),
  name: varchar("name", { length: 80 }).notNull(),
  muscles: text("muscles").array().notNull(),
  equipment: text("equipment").array().notNull(),
  movement: varchar("movement", { length: 16 }).notNull(),
  /** The routine type the lift belongs to, such as `strength`. A program only offers its own type's lifts. */
  routineType: varchar("routine_type", { length: 32 }).notNull(),
  isBodyweight: boolean("is_bodyweight").notNull(),
  pictureUrl: text("picture_url"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
})

export const fitnessBaselines = pgTable("fitness_baselines", {
  programId: varchar("program_id", { length: 36 })
    .primaryKey()
    .references(() => fitnessPrograms.id, { onDelete: "cascade" }),
  bodyweightKg: doublePrecision("bodyweight_kg"),
  heightCm: doublePrecision("height_cm"),
  chestCm: doublePrecision("chest_cm"),
  waistCm: doublePrecision("waist_cm"),
  hipsCm: doublePrecision("hips_cm"),
  armCm: doublePrecision("arm_cm"),
  thighCm: doublePrecision("thigh_cm"),
  goal: varchar("goal", { length: 16 }),
  experience: varchar("experience", { length: 16 }),
  equipment: text("equipment").array().notNull(),
  updatedAt: updatedAt(),
})

export const fitnessBaselineLifts = pgTable(
  "fitness_baseline_lifts",
  {
    programId: varchar("program_id", { length: 36 })
      .notNull()
      .references(() => fitnessPrograms.id, { onDelete: "cascade" }),
    exerciseId: varchar("exercise_id", { length: 36 })
      .notNull()
      .references(() => fitnessExercises.id, { onDelete: "cascade" }),
    weightKg: doublePrecision("weight_kg").notNull(),
    reps: smallint("reps").notNull(),
  },
  (table) => [primaryKey({ columns: [table.programId, table.exerciseId] })]
)

export const fitnessWeekDays = pgTable("fitness_week_days", {
  id: varchar("id", { length: 36 }).primaryKey(),
  programId: varchar("program_id", { length: 36 })
    .notNull()
    .references(() => fitnessPrograms.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 60 }).notNull(),
  /** 0 is Sunday, 6 is Saturday. A weekday with no row is a rest day. */
  weekday: smallint("weekday").notNull(),
})

export const fitnessDayExercises = pgTable("fitness_day_exercises", {
  id: varchar("id", { length: 36 }).primaryKey(),
  dayId: varchar("day_id", { length: 36 })
    .notNull()
    .references(() => fitnessWeekDays.id, { onDelete: "cascade" }),
  exerciseId: varchar("exercise_id", { length: 36 })
    .notNull()
    .references(() => fitnessExercises.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  sets: smallint("sets").notNull(),
  reps: smallint("reps").notNull(),
  weightKg: doublePrecision("weight_kg").notNull(),
  restSeconds: smallint("rest_seconds").notNull(),
  groupKey: varchar("group_key", { length: 36 }),
  missStreak: smallint("miss_streak").notNull(),
})

export const fitnessScheduledWorkouts = pgTable("fitness_scheduled_workouts", {
  id: varchar("id", { length: 36 }).primaryKey(),
  programId: varchar("program_id", { length: 36 })
    .notNull()
    .references(() => fitnessPrograms.id, { onDelete: "cascade" }),
  /** Null once its weekday became a rest day; the date's history stays (`drizzle/0098_fitness_calendar_keeps_history.sql`). */
  dayId: varchar("day_id", { length: 36 }).references(() => fitnessWeekDays.id, { onDelete: "set null" }),
  day: day("day").notNull(),
  status: varchar("status", { length: 8 }).$type<"planned" | "done">().notNull(),
  moved: boolean("moved").notNull(),
  /** The date a moved workout came from, so the week is never laid back onto it. */
  movedFrom: day("moved_from"),
  workoutId: varchar("workout_id", { length: 36 }),
  remindedAt: timestamp("reminded_at", { withTimezone: true }),
  nudgedAt: timestamp("nudged_at", { withTimezone: true }),
})

export const fitnessPauses = pgTable("fitness_pauses", {
  id: varchar("id", { length: 36 }).primaryKey(),
  programId: varchar("program_id", { length: 36 })
    .notNull()
    .references(() => fitnessPrograms.id, { onDelete: "cascade" }),
  fromDay: day("from_day").notNull(),
  untilDay: day("until_day"),
  reason: varchar("reason", { length: 16 }).$type<"holiday" | "injury" | "other">().notNull(),
  createdAt: createdAt(),
})

export const fitnessWorkouts = pgTable("fitness_workouts", {
  id: varchar("id", { length: 36 }).primaryKey(),
  userId: varchar("user_id", { length: 36 })
    .notNull()
    .references(userRef, { onDelete: "cascade" }),
  programId: varchar("program_id", { length: 36 }).references(() => fitnessPrograms.id, {
    onDelete: "set null",
  }),
  dayId: varchar("day_id", { length: 36 }).references(() => fitnessWeekDays.id, {
    onDelete: "set null",
  }),
  scheduledId: varchar("scheduled_id", { length: 36 }).references(
    () => fitnessScheduledWorkouts.id,
    { onDelete: "set null" }
  ),
  name: varchar("name", { length: 80 }).notNull(),
  day: day("day").notNull(),
  source: varchar("source", { length: 8 })
    .$type<"day" | "empty" | "repeat" | "import">()
    .notNull(),
  lightWeek: boolean("light_week").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  effort: smallint("effort"),
  note: text("note").notNull(),
  importKey: varchar("import_key", { length: 160 }),
})

export const fitnessWorkoutSets = pgTable("fitness_workout_sets", {
  id: varchar("id", { length: 36 }).primaryKey(),
  workoutId: varchar("workout_id", { length: 36 })
    .notNull()
    .references(() => fitnessWorkouts.id, { onDelete: "cascade" }),
  exerciseId: varchar("exercise_id", { length: 36 })
    .notNull()
    .references(() => fitnessExercises.id, { onDelete: "restrict" }),
  dayExerciseId: varchar("day_exercise_id", { length: 36 }).references(
    () => fitnessDayExercises.id,
    { onDelete: "set null" }
  ),
  exercisePosition: smallint("exercise_position").notNull(),
  setNumber: smallint("set_number").notNull(),
  kind: varchar("kind", { length: 8 }).$type<"warmup" | "working">().notNull(),
  targetReps: smallint("target_reps"),
  targetWeightKg: doublePrecision("target_weight_kg"),
  weightKg: doublePrecision("weight_kg"),
  bodyweightKg: doublePrecision("bodyweight_kg"),
  reps: smallint("reps"),
  done: boolean("done").notNull(),
  groupKey: varchar("group_key", { length: 36 }),
  note: text("note").notNull(),
  updatedAt: updatedAt(),
})

export const fitnessWeighIns = pgTable(
  "fitness_weigh_ins",
  {
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(userRef, { onDelete: "cascade" }),
    day: day("day").notNull(),
    weightKg: doublePrecision("weight_kg").notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.day] })]
)

export const fitnessPhotoSessions = pgTable("fitness_photo_sessions", {
  id: varchar("id", { length: 36 }).primaryKey(),
  userId: varchar("user_id", { length: 36 })
    .notNull()
    .references(userRef, { onDelete: "cascade" }),
  day: day("day").notNull(),
  bodyweightKg: doublePrecision("bodyweight_kg"),
  chestCm: doublePrecision("chest_cm"),
  waistCm: doublePrecision("waist_cm"),
  hipsCm: doublePrecision("hips_cm"),
  armCm: doublePrecision("arm_cm"),
  thighCm: doublePrecision("thigh_cm"),
  frontKey: text("front_key"),
  sideKey: text("side_key"),
  backKey: text("back_key"),
  note: text("note").notNull(),
  createdAt: createdAt(),
})

export const fitnessAvoidedExercises = pgTable(
  "fitness_avoided_exercises",
  {
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(userRef, { onDelete: "cascade" }),
    exerciseId: varchar("exercise_id", { length: 36 })
      .notNull()
      .references(() => fitnessExercises.id, { onDelete: "cascade" }),
    note: varchar("note", { length: 300 }).notNull(),
    createdAt: createdAt(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.exerciseId] })]
)

export const fitnessCoachClients = pgTable(
  "fitness_coach_clients",
  {
    coachUserId: varchar("coach_user_id", { length: 36 })
      .notNull()
      .references(userRef, { onDelete: "cascade" }),
    clientUserId: varchar("client_user_id", { length: 36 })
      .notNull()
      .references(userRef, { onDelete: "cascade" }),
    photosAllowed: boolean("photos_allowed").notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [primaryKey({ columns: [table.coachUserId, table.clientUserId] })]
)

export const fitnessNoticeLinks = pgTable("fitness_notice_links", {
  noticeId: varchar("notice_id", { length: 36 })
    .primaryKey()
    .references(() => customShellNotifications.id, { onDelete: "cascade" }),
  kind: varchar("kind", { length: 16 }).$type<"record" | "reminder" | "missed" | "coach">().notNull(),
  href: text("href").notNull(),
})

export const fitnessNavigationAdded = pgTable("fitness_navigation_added", {
  scope: varchar("scope", { length: 80 }).primaryKey(),
  addedAt: timestamp("added_at", { withTimezone: true }).notNull(),
})
