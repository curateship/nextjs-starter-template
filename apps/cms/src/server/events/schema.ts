import { sql } from "drizzle-orm"
import {
  check,
  date,
  index,
  jsonb,
  pgTable,
  time,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core"

import { customShellWorkspaces } from "@/server/schema"

/**
 * Each site's events. The matching SQL is `drizzle/0083_cms_events.sql`, and
 * `drizzle/0084_cms_events_visibility.sql` for `visibility`.
 *
 * The start and end are a date plus the site's own clock time, never one
 * moment, so a daylight-saving change or a new site time zone never moves an
 * event. Categories are not a column: an event is filed through the
 * directory's shared `categoryRelationships` table under `EVENT_CONTENT_TYPE`.
 */
export const siteEvents = pgTable(
  "events",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    workspaceId: varchar("workspace_id", { length: 36 })
      .notNull()
      .references(() => customShellWorkspaces.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 200 }).notNull(),
    /** The address part after /events/, unique per site. */
    slug: varchar("slug", { length: 160 }).notNull(),
    /** A media-library URL, or empty. */
    coverImage: varchar("cover_image", { length: 600 }).notNull().default(""),
    summary: varchar("summary", { length: 300 }).notNull().default(""),
    /** The editor's document tree, cleaned by `lib/posts/post-body.ts`. */
    body: jsonb("body").notNull(),
    /** 'draft' or 'published'. Drafts never reach a visitor. */
    status: varchar("status", { length: 20 }).notNull().default("draft"),
    /**
     * 'public' or 'private'. A private event's page opens from its link, but
     * no public list shows it. See `listedEventsOnSite` in `public.ts`.
     */
    visibility: varchar("visibility", { length: 20 })
      .notNull()
      .default("public"),
    /** Set on first publish and kept. */
    publishedAt: timestamp("published_at", { withTimezone: true }),
    /** "2026-09-27", the day it starts on the site's calendar. */
    startDate: date("start_date", { mode: "string" }).notNull(),
    /** "18:00:00", the site's own clock. */
    startTime: time("start_time").notNull(),
    /** Null when the event has no end. */
    endDate: date("end_date", { mode: "string" }),
    /** Null for no end time; never set without an end date. */
    endTime: time("end_time"),
    placeName: varchar("place_name", { length: 200 }).notNull().default(""),
    placeAddress: varchar("place_address", { length: 300 })
      .notNull()
      .default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("ux_events_workspace_slug").on(table.workspaceId, table.slug),
    index("ix_events_workspace_status_start").on(
      table.workspaceId,
      table.status,
      table.startDate
    ),
    check(
      "events_status_check",
      sql`${table.status} IN ('draft', 'published')`
    ),
    check(
      "events_visibility_check",
      sql`${table.visibility} IN ('public', 'private')`
    ),
    check(
      "events_published_has_date_check",
      sql`${table.status} <> 'published' OR ${table.publishedAt} IS NOT NULL`
    ),
    check(
      "events_end_time_has_date_check",
      sql`${table.endTime} IS NULL OR ${table.endDate} IS NOT NULL`
    ),
    check(
      "events_end_after_start_check",
      sql`${table.endDate} IS NULL OR ${table.endDate} > ${table.startDate} OR (${table.endDate} = ${table.startDate} AND (${table.endTime} IS NULL OR ${table.endTime} > ${table.startTime}))`
    ),
  ]
)

export type EventRow = typeof siteEvents.$inferSelect

/** An event's rows in `categoryRelationships`. Posts use 'post'. */
export const EVENT_CONTENT_TYPE = "event"
