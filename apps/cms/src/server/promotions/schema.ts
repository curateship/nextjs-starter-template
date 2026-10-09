import { and, eq, sql } from "drizzle-orm"
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
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
 * `drizzle/0097_cms_promotion_times.sql` for the times, and
 * `drizzle/0098_cms_owner_promotions.sql` for `ownerUserId` and `endedAt`,
 * and `drizzle/0101_cms_promotion_claims.sql` for the claims.
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
    /** Visitors claim it with a name and an email, each getting a code. */
    takesClaims: boolean("takes_claims").notNull().default(false),
    /** How many can claim it, or null for no limit. */
    claimLimit: integer("claim_limit"),
    /** 'draft' or 'published'. Drafts never reach a visitor. */
    status: varchar("status", { length: 20 }).notNull().default("draft"),
    /** Set on first publish and kept. */
    publishedAt: timestamp("published_at", { withTimezone: true }),
    /**
     * The listing owner who sent it, set when an admin approves it. Only that
     * account may change it or end it early.
     */
    ownerUserId: varchar("owner_user_id", { length: 36 }).references(
      () => customShellUsers.id,
      { onDelete: "set null" }
    ),
    /** Set by "End now". The deal is over from then, whatever its days say. */
    endedAt: timestamp("ended_at", { withTimezone: true }),
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
    index("ix_promotions_owner").on(table.ownerUserId),
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
      "promotions_claim_limit_check",
      sql`${table.claimLimit} IS NULL OR ${table.claimLimit} BETWEEN 1 AND 100000`
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

/**
 * A listing owner's new deal or change to a live deal, waiting for an admin,
 * from `drizzle/0098_cms_owner_promotions.sql`. It holds the whole deal as the
 * owner wrote it, never a public deal until an admin approves it.
 */
export const promotionRequests = pgTable(
  "promotion_requests",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    workspaceId: varchar("workspace_id", { length: 36 })
      .notNull()
      .references(() => customShellWorkspaces.id, { onDelete: "cascade" }),
    /** The owner's listing, from their approved claim, never from the form. */
    listingId: varchar("listing_id", { length: 36 })
      .notNull()
      .references(() => directoryListings.id, { onDelete: "cascade" }),
    ownerUserId: varchar("owner_user_id", { length: 36 }).references(
      () => customShellUsers.id,
      { onDelete: "set null" }
    ),
    /** 'new' or 'change'. */
    kind: varchar("kind", { length: 10 }).notNull(),
    /** A change: the deal it changes. A new deal: the deal approving it made. */
    promotionId: varchar("promotion_id", { length: 36 }).references(
      () => sitePromotions.id,
      { onDelete: "set null" }
    ),
    /** 'pending', 'approved' or 'rejected'. */
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    title: varchar("title", { length: 200 }).notNull(),
    description: varchar("description", { length: 2000 })
      .notNull()
      .default(""),
    coverImage: varchar("cover_image", { length: 600 }).notNull().default(""),
    startDate: date("start_date", { mode: "string" }).notNull(),
    endDate: date("end_date", { mode: "string" }),
    code: varchar("code", { length: 40 }).notNull().default(""),
    smallPrint: varchar("small_print", { length: 1000 }).notNull().default(""),
    dealType: varchar("deal_type", { length: 20 }).notNull(),
    amount: numeric("amount", { precision: 7, scale: 2, mode: "number" }),
    headline: varchar("headline", { length: 24 }).notNull(),
    times: jsonb("times").notNull().default({}),
    takesClaims: boolean("takes_claims").notNull().default(false),
    claimLimit: integer("claim_limit"),
    reviewNote: varchar("review_note", { length: 500 }).notNull().default(""),
    reviewedByUserId: varchar("reviewed_by_user_id", { length: 36 }).references(
      () => customShellUsers.id,
      { onDelete: "set null" }
    ),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("ix_promotion_requests_workspace_status").on(
      table.workspaceId,
      table.status,
      table.createdAt
    ),
    index("ix_promotion_requests_owner").on(
      table.ownerUserId,
      table.createdAt
    ),
    uniqueIndex("ux_promotion_requests_one_pending_change")
      .on(table.promotionId)
      .where(sql`${table.kind} = 'change' AND ${table.status} = 'pending'`),
    check(
      "promotion_requests_kind_check",
      sql`${table.kind} IN ('new', 'change')`
    ),
    check(
      "promotion_requests_status_check",
      sql`${table.status} IN ('pending', 'approved', 'rejected')`
    ),
    check(
      "promotion_requests_end_after_start_check",
      sql`${table.endDate} IS NULL OR ${table.endDate} >= ${table.startDate}`
    ),
  ]
)

/**
 * People who claimed a deal, from `drizzle/0101_cms_promotion_claims.sql`.
 * Each has their own code. Removing someone marks the row cancelled, which
 * frees their place and lets the same email claim again. A code that has been
 * used at the counter carries `usedAt` and can no longer be taken away.
 */
export const promotionClaims = pgTable(
  "promotion_claims",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    workspaceId: varchar("workspace_id", { length: 36 })
      .notNull()
      .references(() => customShellWorkspaces.id, { onDelete: "cascade" }),
    promotionId: varchar("promotion_id", { length: 36 })
      .notNull()
      .references(() => sitePromotions.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 120 }).notNull(),
    /** Stored in lower case, so one person is one email. */
    email: varchar("email", { length: 255 }).notNull(),
    /** Their own code, like "K7QX-P2MD", unique across the site. */
    code: varchar("code", { length: 20 }).notNull(),
    /** 'claimed' or 'cancelled'. Only a claimed one holds a place. */
    status: varchar("status", { length: 20 }).notNull().default("claimed"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    /**
     * When the code was used at the counter, from
     * `drizzle/0110_cms_promotion_claim_used.sql`. Null means it has not been
     * used, and this is the column every other answer reads.
     */
    usedAt: timestamp("used_at", { withTimezone: true }),
    /** The owner or admin who marked it, or null once that account is gone. */
    usedByUserId: varchar("used_by_user_id", { length: 36 }).references(
      () => customShellUsers.id,
      { onDelete: "set null" }
    ),
  },
  (table) => [
    uniqueIndex("ux_promotion_claims_live_email")
      .on(table.promotionId, table.email)
      .where(sql`${table.status} = 'claimed'`),
    /**
     * A code is unique across the site, cancelled ones included, because the
     * counter page is found by the code alone and no code is ever reissued.
     */
    uniqueIndex("ux_promotion_claims_site_code").on(
      table.workspaceId,
      table.code
    ),
    index("ix_promotion_claims_promotion").on(
      table.promotionId,
      table.status,
      table.createdAt
    ),
    check(
      "promotion_claims_status_check",
      sql`${table.status} IN ('claimed', 'cancelled')`
    ),
    check(
      "promotion_claims_cancelled_check",
      sql`(${table.status} = 'cancelled') = (${table.cancelledAt} IS NOT NULL)`
    ),
    check(
      "promotion_claims_used_check",
      sql`${table.usedByUserId} IS NULL OR ${table.usedAt} IS NOT NULL`
    ),
    /** A used code can never be taken away: that would hand out a second one. */
    check(
      "promotion_claims_used_not_cancelled_check",
      sql`NOT (${table.status} = 'cancelled' AND ${table.usedAt} IS NOT NULL)`
    ),
  ]
)

/**
 * Each deal's two numbers for one day, from
 * `drizzle/0123_cms_promotion_counts.sql`: how many people opened its page and
 * how many tapped Show code. A person counts once per deal per day for each.
 * `server/promotions/counts.ts` writes and reads it.
 */
export const promotionDailyCounts = pgTable(
  "promotion_daily_counts",
  {
    promotionId: varchar("promotion_id", { length: 36 })
      .notNull()
      .references(() => sitePromotions.id, { onDelete: "cascade" }),
    /** The UTC day, the same days the site's traffic counter keeps. */
    day: date("day", { mode: "string" }).notNull(),
    views: integer("views").notNull().default(0),
    codeTaps: integer("code_taps").notNull().default(0),
  },
  (table) => [
    primaryKey({
      name: "promotion_daily_counts_pk",
      columns: [table.promotionId, table.day],
    }),
  ]
)

/**
 * Who has already been counted today, as the traffic counter's daily hash and
 * never anything that names a person. Rows from a day that is over are
 * deleted, so a hash never outlives the salt it was made with.
 */
export const promotionCountVisitors = pgTable(
  "promotion_count_visitors",
  {
    promotionId: varchar("promotion_id", { length: 36 })
      .notNull()
      .references(() => sitePromotions.id, { onDelete: "cascade" }),
    day: date("day", { mode: "string" }).notNull(),
    /** 'view' or 'code'. */
    kind: varchar("kind", { length: 10 }).notNull(),
    visitorHash: varchar("visitor_hash", { length: 64 }).notNull(),
  },
  (table) => [
    primaryKey({
      name: "promotion_count_visitors_pk",
      columns: [table.promotionId, table.day, table.kind, table.visitorHash],
    }),
    index("ix_promotion_count_visitors_day").on(table.day),
    check(
      "promotion_count_visitors_kind_check",
      sql`${table.kind} IN ('view', 'code')`
    ),
  ]
)

/**
 * Who follows a listing for its deals, from
 * `drizzle/0124_cms_listing_follows.sql`. One row per signed-in person per
 * listing. `server/promotions/follows.ts` holds the rules and
 * `server/promotions/follow-mail.ts` sends the emails.
 */
export const listingFollows = pgTable(
  "listing_follows",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    workspaceId: varchar("workspace_id", { length: 36 })
      .notNull()
      .references(() => customShellWorkspaces.id, { onDelete: "cascade" }),
    listingId: varchar("listing_id", { length: 36 })
      .notNull()
      .references(() => directoryListings.id, { onDelete: "cascade" }),
    /** The follower. Their email is read from the account when one goes. */
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    /**
     * Deals first published up to here have been emailed, or came before the
     * follow. Starts at `createdAt`.
     */
    toldThrough: timestamp("told_through", { withTimezone: true }).notNull(),
    /** The site's calendar day of the last email, or null before the first. */
    lastMailedDay: date("last_mailed_day", { mode: "string" }),
    /** Held while an email is going out; older than ten minutes means retry. */
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("ux_listing_follows_listing_user").on(
      table.listingId,
      table.userId
    ),
    index("ix_listing_follows_workspace_listing").on(
      table.workspaceId,
      table.listingId
    ),
  ]
)
