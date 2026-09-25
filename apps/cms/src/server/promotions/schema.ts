import { and, eq, sql } from "drizzle-orm"
import {
  check,
  date,
  index,
  jsonb,
  numeric,
  pgTable,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core"

import { directoryListings } from "@/server/directory/schema"
import { customShellUsers, customShellWorkspaces } from "@/server/schema"

/**
 * Each site's deals, one deal at one listing. The matching SQL is
 * `drizzle/0095_cms_promotions.sql`, and
 * `drizzle/0096_cms_promotion_headline.sql` for the type and headline, and
 * `drizzle/0097_cms_promotion_times.sql` for the times.
 *
 * The start and end are days on the site's calendar, never moments, the same
 * way events store theirs, so a new site time zone never moves a deal. A deal
 * is on through the whole of its end day by the site's clock.
 */
export const sitePromotions = pgTable(
  "promotions",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    workspaceId: varchar("workspace_id", { length: 36 })
      .notNull()
      .references(() => customShellWorkspaces.id, { onDelete: "cascade" }),
    /** The place. Deleting the listing deletes the deal. */
    listingId: varchar("listing_id", { length: 36 })
      .notNull()
      .references(() => directoryListings.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 200 }).notNull(),
    /** The address part after /deals/, unique per site. */
    slug: varchar("slug", { length: 160 }).notNull(),
    description: varchar("description", { length: 2000 })
      .notNull()
      .default(""),
    /** A media-library URL, or empty. */
    coverImage: varchar("cover_image", { length: 600 }).notNull().default(""),
    /** "2026-09-27", the first day it is on by the site's calendar. */
    startDate: date("start_date", { mode: "string" }).notNull(),
    /** The last day it is on, or null for a deal with no end. */
    endDate: date("end_date", { mode: "string" }),
    /** What a visitor says or types to get the deal, or empty. */
    code: varchar("code", { length: 40 }).notNull().default(""),
    smallPrint: varchar("small_print", { length: 1000 }).notNull().default(""),
    /**
     * One of `DEAL_TYPES` in `lib/promotions/deal-headline.ts`, or null on a
     * deal made before types existed.
     */
    dealType: varchar("deal_type", { length: 20 }),
    /** The number a money off or percent off headline is built from. */
    amount: numeric("amount", { precision: 7, scale: 2, mode: "number" }),
    /** "20% off", "Free dessert". Empty only while `dealType` is null. */
    headline: varchar("headline", { length: 24 }).notNull().default(""),
    /**
     * The weekdays and hours it runs, shaped like a listing's opening hours
     * and read by `cleanListingHours`. Every day missing means all day, every
     * day. See `lib/promotions/deal-times.ts`.
     */
    times: jsonb("times").notNull().default({}),
    /** 'draft' or 'published'. Drafts never reach a visitor. */
    status: varchar("status", { length: 20 }).notNull().default("draft"),
    /** Set on first publish and kept. */
    publishedAt: timestamp("published_at", { withTimezone: true }),
    /** The admin who wrote it, or null once that account is gone. */
    createdByUserId: varchar("created_by_user_id", { length: 36 }).references(
      () => customShellUsers.id,
      { onDelete: "set null" }
    ),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("ux_promotions_workspace_slug").on(
      table.workspaceId,
      table.slug
    ),
    index("ix_promotions_workspace_status_start").on(
      table.workspaceId,
      table.status,
      table.startDate
    ),
    index("ix_promotions_listing").on(table.listingId),
    check(
      "promotions_status_check",
      sql`${table.status} IN ('draft', 'published')`
    ),
    check(
      "promotions_published_has_date_check",
      sql`${table.status} <> 'published' OR ${table.publishedAt} IS NOT NULL`
    ),
    check(
      "promotions_deal_type_check",
      sql`${table.dealType} IS NULL OR ${table.dealType} IN ('money_off', 'percent_off', 'two_for_one', 'free_item', 'other')`
    ),
    check(
      "promotions_headline_check",
      sql`(${table.dealType} IS NULL) = (${table.headline} = '')`
    ),
    check(
      "promotions_amount_check",
      sql`CASE WHEN ${table.dealType} IN ('money_off', 'percent_off') THEN ${table.amount} IS NOT NULL ELSE ${table.amount} IS NULL END`
    ),
    check(
      "promotions_end_after_start_check",
      sql`${table.endDate} IS NULL OR ${table.endDate} >= ${table.startDate}`
    ),
  ]
)

export type PromotionRow = typeof sitePromotions.$inferSelect

/**
 * A deal's listing: by id, and only on the deal's own site, so a stray id
 * could never show another site's place.
 */
export const listingOfPromotion = and(
  eq(directoryListings.id, sitePromotions.listingId),
  eq(directoryListings.workspaceId, sitePromotions.workspaceId)
)
