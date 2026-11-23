import { index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core"

import { customShellUsers } from "@/server/schema"
import { promoProjects } from "@/server/social/schema"

/**
 * The link between Promo and the Viral app (`workspace/docs/viral-link.md`).
 * The SQL is `drizzle/0136_promo_viral_link.sql`.
 */

/** The networks Viral may ask Promo to read. Promo has no Threads, so Threads is not one. */
export const VIRAL_READ_NETWORKS = ["x", "linkedin", "reddit"] as const
export type ViralReadNetwork = (typeof VIRAL_READ_NETWORKS)[number]

/** What a read looks at. Each network takes only some of these (`reads.ts`). */
export const VIRAL_READ_KINDS = ["search", "hashtag", "account", "person", "company", "subreddit", "post"] as const
export type ViralReadKind = (typeof VIRAL_READ_KINDS)[number]

export type ViralReadStatus = "waiting" | "done" | "failed"

/** A reply or comment under a post, as Viral shows it in a thread. */
export type ViralReadReply = { author: string; text: string; likes: number }

/**
 * One post a read found, the same shape for every network, the way Viral
 * stores it. Numbers a network does not show are null.
 */
export type ViralReadPost = {
  postId: string
  url: string
  /** A Reddit post's title, or "". */
  title: string
  text: string
  authorHandle: string
  authorName: string
  authorFollowers: number | null
  /** Seconds since 1970, or null when the network didn't say. */
  postedSeconds: number | null
  views: number | null
  /** Likes on X, reactions on LinkedIn, upvotes on Reddit. */
  likes: number | null
  replies: number | null
  reposts: number | null
  /** The first link in the post, or "". */
  link: string
  /** A subreddit's name for Reddit, or "". */
  community: string
  topReplies: ViralReadReply[]
}

/**
 * The key Viral calls with, one per Promo person. Promo makes it on
 * Settings → Viral and keeps its hash to find the caller, and the key itself
 * scrambled for Copy and for calling Viral back. `viralUrl` is the Viral
 * address that last pressed Test, the only one Promo calls.
 */
export const promoViralLinks = pgTable("promo_viral_links", {
  userId: varchar("user_id", { length: 36 })
    .primaryKey()
    .references(() => customShellUsers.id, { onDelete: "cascade" }),
  keyHash: varchar("key_hash", { length: 64 }).notNull().unique(),
  keySecret: text("key_secret").notNull(),
  viralUrl: varchar("viral_url", { length: 500 }).notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
})

export type PromoViralLinkRow = typeof promoViralLinks.$inferSelect

/** One read Viral asked for, run by Promo's own readers and answered back. */
export const promoViralReads = pgTable(
  "promo_viral_reads",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    readId: varchar("read_id", { length: 64 }).notNull(),
    network: varchar("network", { length: 20 }).$type<ViralReadNetwork>().notNull(),
    kind: varchar("kind", { length: 20 }).$type<ViralReadKind>().notNull(),
    value: varchar("value", { length: 300 }).notNull(),
    status: varchar("status", { length: 10 }).$type<ViralReadStatus>().notNull().default("waiting"),
    jobId: varchar("job_id", { length: 36 }),
    posts: jsonb("posts").$type<ViralReadPost[]>().notNull().default([]),
    error: text("error").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    deliveryTries: integer("delivery_tries").notNull().default(0),
  },
  (table) => [
    uniqueIndex("ux_promo_viral_reads_read").on(table.userId, table.readId),
    index("ix_promo_viral_reads_due").on(table.status, table.deliveredAt),
  ]
)

export type PromoViralReadRow = typeof promoViralReads.$inferSelect

/**
 * A post Viral wrote for a Promo project. An X or LinkedIn one is also a
 * draft on that network's Posts tab (`promoPostId`); a Reddit one waits here
 * until New post opens with it, because Reddit posts have no drafts.
 */
export const promoViralDrafts = pgTable(
  "promo_viral_drafts",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    projectId: varchar("project_id", { length: 36 })
      .notNull()
      .references(() => promoProjects.id, { onDelete: "cascade" }),
    sendId: varchar("send_id", { length: 64 }).notNull(),
    network: varchar("network", { length: 20 }).notNull(),
    ideaId: varchar("idea_id", { length: 64 }).notNull().default(""),
    title: varchar("title", { length: 300 }).notNull().default(""),
    body: text("body").notNull().default(""),
    promoPostId: varchar("promo_post_id", { length: 36 }).notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    usedAt: timestamp("used_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("ux_promo_viral_drafts_send").on(table.userId, table.sendId),
    index("ix_promo_viral_drafts_project").on(table.projectId, table.createdAt),
  ]
)

/** A post that came from a Viral idea, once Promo told Viral about it. */
export const promoViralReports = pgTable(
  "promo_viral_reports",
  {
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    postKey: varchar("post_key", { length: 60 }).notNull(),
    ideaId: varchar("idea_id", { length: 64 }).notNull(),
    views: integer("views"),
    reportedAt: timestamp("reported_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.postKey] })]
)
