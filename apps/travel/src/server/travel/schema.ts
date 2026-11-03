import {
  bigint,
  boolean,
  date,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core"

import type {
  DayInfo,
  OpeningHours,
  PhotoCredit,
  Place,
  TravelMode,
  TripStatus,
} from "@/lib/travel/rules"
import { customShellUsers } from "@/server/schema"

/**
 * Travel's own tables, kept apart from the shell's `src/server/schema.ts` on
 * purpose: that file belongs to the shell and editing it would fork this app
 * off future shell merges. The SQL that creates them is
 * `drizzle/0098_travel_trip_planner.sql`; this file only describes them to
 * the query builder.
 */

const userRef = () => customShellUsers.id
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull()
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull()
const cents = (name: string) => bigint(name, { mode: "number" })

export const travelTrips = pgTable("travel_trips", {
  id: varchar("id", { length: 36 }).primaryKey(),
  ownerUserId: varchar("owner_user_id", { length: 36 })
    .notNull()
    .references(userRef, { onDelete: "cascade" }),
  name: text("name").notNull(),
  destination: text("destination"),
  days: smallint("days").notNull(),
  startDate: date("start_date", { mode: "string" }),
  currency: varchar("currency", { length: 3 }).notNull(),
  timeZone: text("time_zone"),
  budgetCents: cents("budget_cents"),
  status: varchar("status", { length: 16 }).$type<TripStatus>().notNull(),
  coverUrl: text("cover_url"),
  coverCredit: jsonb("cover_credit").$type<PhotoCredit>(),
  dayInfo: jsonb("day_info").$type<DayInfo[]>().notNull(),
  /** The editor's own document as JSON text, or "" (`drizzle/0100_travel_misc.sql`). */
  description: text("description").notNull(),
  travelMode: varchar("travel_mode", { length: 16 }).$type<TravelMode>().notNull(),
  tags: text("tags").array().notNull(),
  calendarToken: varchar("calendar_token", { length: 64 }),
  isSample: boolean("is_sample").notNull(),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
})

export const travelActivityTypes = pgTable("travel_activity_types", {
  id: varchar("id", { length: 36 }).primaryKey(),
  ownerUserId: varchar("owner_user_id", { length: 36 })
    .notNull()
    .references(userRef, { onDelete: "cascade" }),
  name: varchar("name", { length: 40 }).notNull(),
  icon: varchar("icon", { length: 40 }).notNull(),
  color: varchar("color", { length: 16 }).notNull(),
  builtin: varchar("builtin", { length: 16 }),
  position: integer("position").notNull(),
})

export const travelActivities = pgTable("travel_activities", {
  id: varchar("id", { length: 36 }).primaryKey(),
  tripId: varchar("trip_id", { length: 36 })
    .notNull()
    .references(() => travelTrips.id, { onDelete: "cascade" }),
  day: smallint("day"),
  position: integer("position").notNull(),
  title: text("title").notNull(),
  typeId: varchar("type_id", { length: 36 }).references(() => travelActivityTypes.id, {
    onDelete: "set null",
  }),
  startTime: varchar("start_time", { length: 5 }),
  durationMinutes: integer("duration_minutes"),
  nights: smallint("nights"),
  place: jsonb("place").$type<Place>(),
  openingHours: jsonb("opening_hours").$type<OpeningHours>(),
  website: text("website"),
  menuUrl: text("menu_url"),
  phone: varchar("phone", { length: 40 }),
  /** The editor's own document as JSON text, or "" (`drizzle/0099_travel_remove_booking_and_journal.sql`). */
  notes: text("notes").notNull(),
  costCents: cents("cost_cents"),
  done: boolean("done").notNull(),
  rating: smallint("rating"),
  goAgain: boolean("go_again").notNull(),
  photoUrl: text("photo_url"),
  photoCredit: jsonb("photo_credit").$type<PhotoCredit>(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
})

/** A trip's notes, from the note icon beside its cog (`drizzle/0100_travel_misc.sql`). */
export const travelTripNotes = pgTable("travel_trip_notes", {
  id: varchar("id", { length: 36 }).primaryKey(),
  tripId: varchar("trip_id", { length: 36 })
    .notNull()
    .references(() => travelTrips.id, { onDelete: "cascade" }),
  /** The editor's own document as JSON text, or "". */
  body: text("body").notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
})

export const travelSavedPlaces = pgTable("travel_saved_places", {
  id: varchar("id", { length: 36 }).primaryKey(),
  ownerUserId: varchar("owner_user_id", { length: 36 })
    .notNull()
    .references(userRef, { onDelete: "cascade" }),
  title: text("title").notNull(),
  typeId: varchar("type_id", { length: 36 }).references(() => travelActivityTypes.id, {
    onDelete: "set null",
  }),
  place: jsonb("place").$type<Place>(),
  website: text("website"),
  menuUrl: text("menu_url"),
  phone: varchar("phone", { length: 40 }),
  notes: text("notes").notNull(),
  photoUrl: text("photo_url"),
  photoCredit: jsonb("photo_credit").$type<PhotoCredit>(),
  createdAt: createdAt(),
})

export const travelRouteTimes = pgTable(
  "travel_route_times",
  {
    fromKey: text("from_key").notNull(),
    toKey: text("to_key").notNull(),
    mode: varchar("mode", { length: 16 }).$type<TravelMode>().notNull(),
    minutes: integer("minutes").notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.fromKey, table.toKey, table.mode] })]
)

export const travelSampleGiven = pgTable("travel_sample_given", {
  userId: varchar("user_id", { length: 36 })
    .primaryKey()
    .references(userRef, { onDelete: "cascade" }),
  givenAt: timestamp("given_at", { withTimezone: true }).notNull(),
})

export const travelNavigationAdded = pgTable("travel_navigation_added", {
  scope: varchar("scope", { length: 80 }).primaryKey(),
  addedAt: timestamp("added_at", { withTimezone: true }).notNull(),
})
