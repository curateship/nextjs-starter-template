import { sql } from "drizzle-orm"
import {
  type AnyPgColumn,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  time,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core"

import { directoryListings } from "@/server/directory/schema"
import { customShellUsers, customShellWorkspaces } from "@/server/schema"

/**
 * Each site's events. The matching SQL is `drizzle/0083_cms_events.sql`,
 * `drizzle/0084_cms_events_visibility.sql` for `visibility`,
 * `drizzle/0085_cms_event_repeats.sql` for the repeat columns,
 * `drizzle/0086_cms_event_listing.sql` for `listing_id`,
 * `drizzle/0087_cms_event_position.sql` for the map position, and
 * `drizzle/0091_cms_event_source_link.sql` for `source_url`.
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
    /**
     * The place, when it is one of the site's listings. Public pages show the
     * listing's current name and address; the two columns below keep the
     * last of them, for when the listing is deleted.
     */
    listingId: varchar("listing_id", { length: 36 }).references(
      () => directoryListings.id,
      { onDelete: "set null" }
    ),
    placeName: varchar("place_name", { length: 200 }).notNull().default(""),
    placeAddress: varchar("place_address", { length: 300 })
      .notNull()
      .default(""),
    /**
     * Where a typed address is, looked up when it was saved. A whole pair or
     * null. An event held at a listing uses the listing's position instead.
     */
    latitude: numeric("latitude", { precision: 9, scale: 6, mode: "number" }),
    longitude: numeric("longitude", {
      precision: 10,
      scale: 6,
      mode: "number",
    }),
    /** The address last looked up, found or not, so it is never asked twice. */
    locatedFor: varchar("located_for", { length: 300 }),
    /**
     * A main event's repeat, read by `parseRepeatRule` in
     * `lib/events/event-repeat.ts`. Null on every other event.
     */
    repeatRule: jsonb("repeat_rule"),
    /** The last day the rule has been worked through, so none is made twice. */
    repeatMadeUntil: date("repeat_made_until", { mode: "string" }),
    /** On a date a repeat made: its main event. Deleting that deletes this. */
    seriesId: varchar("series_id", { length: 36 }).references(
      (): AnyPgColumn => siteEvents.id,
      { onDelete: "cascade" }
    ),
    /** The day the rule made this date for. Set with `seriesId`. */
    seriesDate: date("series_date", { mode: "string" }),
    /** Saved by itself, so changes to the main event skip it. */
    editedAlone: boolean("edited_alone").notNull().default(false),
    /**
     * The page the Draft events automation step read to write this event, so
     * the admin can check it against the page. Empty for anything a person
     * made. Never shown to a visitor.
     */
    sourceUrl: varchar("source_url", { length: 600 }).notNull().default(""),
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
    uniqueIndex("ux_events_series_date").on(table.seriesId, table.seriesDate),
    index("ix_events_listing").on(table.listingId),
    check(
      "events_series_date_check",
      sql`(${table.seriesId} IS NULL) = (${table.seriesDate} IS NULL)`
    ),
    check(
      "events_series_rule_check",
      sql`${table.seriesId} IS NULL OR ${table.repeatRule} IS NULL`
    ),
    check(
      "events_position_pair_check",
      sql`(${table.latitude} IS NULL) = (${table.longitude} IS NULL)`
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

/**
 * Events the public suggested on the Suggest an event page, from
 * `drizzle/0089_cms_event_submissions.sql`, and from a listing's owner on My
 * listings, from `drizzle/0090_cms_owner_event_submissions.sql`. A row is what somebody typed,
 * never an event, until an admin approves it into a draft.
 */
export const eventSubmissions = pgTable(
  "event_submissions",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    /** The site whose page this was sent from. It becomes an event on no other. */
    workspaceId: varchar("workspace_id", { length: 36 })
      .notNull()
      .references(() => customShellWorkspaces.id, { onDelete: "cascade" }),
    /** 'pending', 'approved' or 'rejected'. */
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    title: varchar("title", { length: 200 }).notNull(),
    startDate: date("start_date", { mode: "string" }).notNull(),
    startTime: time("start_time").notNull(),
    /** Earlier than the start time means the next day. */
    endTime: time("end_time"),
    placeName: varchar("place_name", { length: 200 }).notNull().default(""),
    placeAddress: varchar("place_address", { length: 300 })
      .notNull()
      .default(""),
    description: varchar("description", { length: 2000 }).notNull().default(""),
    /** The photo's key in the site's file storage, held until the decision. */
    photoPath: varchar("photo_path", { length: 300 }),
    photoName: varchar("photo_name", { length: 255 }),
    photoType: varchar("photo_type", { length: 100 }),
    photoSize: integer("photo_size"),
    submitterName: varchar("submitter_name", { length: 120 })
      .notNull()
      .default(""),
    submitterEmail: varchar("submitter_email", { length: 255 }).notNull(),
    /** Sent by the listing's owner from My listings, from 0090. */
    fromOwner: boolean("from_owner").notNull().default(false),
    /** The owner's account, so My listings shows them their own events only. */
    ownerUserId: varchar("owner_user_id", { length: 36 }).references(
      () => customShellUsers.id,
      { onDelete: "set null" }
    ),
    /** The owner's listing, which is always the place. */
    listingId: varchar("listing_id", { length: 36 }).references(
      () => directoryListings.id,
      { onDelete: "set null" }
    ),
    /** An owner's photo, a Media library address. Empty for the public. */
    coverImage: varchar("cover_image", { length: 600 }).notNull().default(""),
    reviewedByUserId: varchar("reviewed_by_user_id", { length: 36 }).references(
      () => customShellUsers.id,
      { onDelete: "set null" }
    ),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewNote: varchar("review_note", { length: 500 }).notNull().default(""),
    /** The draft it became. Set once, so approving twice makes no twin. */
    eventId: varchar("event_id", { length: 36 }).references(
      () => siteEvents.id,
      { onDelete: "set null" }
    ),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("ix_event_submissions_owner").on(
      table.ownerUserId,
      table.listingId,
      table.createdAt
    ),
    index("ix_event_submissions_workspace_status").on(
      table.workspaceId,
      table.status,
      table.createdAt
    ),
    check(
      "event_submissions_status_check",
      sql`${table.status} IN ('pending', 'approved', 'rejected')`
    ),
    check(
      "event_submissions_photo_check",
      sql`(${table.photoPath} IS NULL) = (${table.photoName} IS NULL) AND (${table.photoPath} IS NULL) = (${table.photoType} IS NULL) AND (${table.photoPath} IS NULL) = (${table.photoSize} IS NULL)`
    ),
  ]
)

export type EventSubmissionRow = typeof eventSubmissions.$inferSelect
