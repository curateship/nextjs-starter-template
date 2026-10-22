import {
  type AnyPgColumn,
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

import type {
  XFindStatus,
  XIncoming,
  XKeywordKind,
  XKeywordMark,
  XListItemStatus,
  XPoll,
  XPostPiece,
  XPostStatus,
  XReplyKind,
  XReplyStatus,
  XRewrite,
  XTopReply,
} from "@/lib/social/x/options"
import { promoProfiles } from "@/server/browser/schema"
import { customShellUsers } from "@/server/schema"

import { promoAccounts, promoProjects } from "../schema"

/**
 * X's own tables (`workspace/tasks/X/01-x-features.md`). The matching SQL is
 * `drizzle/0125_promo_x.sql`.
 *
 * Kept apart from Reddit's and Medium's for the reason Medium's are: a Reddit
 * keyword carries subreddits and a Medium find a story id, and widening
 * either to fit X would change their code for no gain to them. The account,
 * the project, the voice, the job queue and the bell are shared as they are.
 *
 * Everything is scoped by user id, as Promo's other tables are. X's ids are
 * kept as text: they are longer than JavaScript counts exactly.
 */

/** An X keyword: search words, a hashtag, or an account watched for its new posts. */
export const promoXKeywords = pgTable(
  "promo_x_keywords",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    /** A project holding keywords cannot be deleted, the same as Reddit's. */
    projectId: varchar("project_id", { length: 36 })
      .notNull()
      .references(() => promoProjects.id, { onDelete: "restrict" }),
    kind: varchar("kind", { length: 20 }).$type<XKeywordKind>().notNull(),
    /** The search words, a hashtag without its #, or an account's handle without its @. */
    value: varchar("value", { length: 200 }).notNull(),
    /** "you" or "rival" on search words that name a product (part 13). */
    mark: varchar("mark", { length: 10 }).$type<XKeywordMark>().notNull().default(""),
    enabled: boolean("enabled").notNull().default(true),
    /** A watched account's new posts ring the bell (part 12). Off for an account that posts all day. */
    notify: boolean("notify").notNull().default(true),
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
    /** Why the last search failed, or "" when it worked. */
    lastError: text("last_error").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("ix_promo_x_keywords_project").on(table.projectId),
    uniqueIndex("ux_promo_x_keywords_value").on(table.projectId, table.kind, sql`lower(${table.value})`),
  ]
)

/** An X post a keyword found, and what was decided about it. One row per post per keyword. */
export const promoXFinds = pgTable(
  "promo_x_finds",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    keywordId: varchar("keyword_id", { length: 36 })
      .notNull()
      .references(() => promoXKeywords.id, { onDelete: "cascade" }),
    postId: varchar("post_id", { length: 25 }).notNull(),
    url: varchar("url", { length: 300 }).notNull(),
    text: text("text").notNull().default(""),
    authorId: varchar("author_id", { length: 25 }).notNull().default(""),
    authorHandle: varchar("author_handle", { length: 20 }).notNull().default(""),
    authorName: varchar("author_name", { length: 200 }).notNull().default(""),
    /** Null when X did not say, never 0 as a stand-in. */
    authorFollowers: integer("author_followers"),
    postedAt: timestamp("posted_at", { withTimezone: true }),
    views: integer("views"),
    likes: integer("likes").notNull().default(0),
    replies: integer("replies").notNull().default(0),
    reposts: integer("reposts").notNull().default(0),
    /** False when replies are limited to followers or named people (part 17). Such a post is never listed. */
    repliesOpen: boolean("replies_open").notNull().default(true),
    /** The first link in the post, or "". */
    link: varchar("link", { length: 600 }).notNull().default(""),
    /** Where the keyword's list put it, 0 being first. */
    position: integer("position").notNull().default(0),
    rank: numeric("rank", { precision: 10, scale: 4, mode: "number" }).notNull().default(0),
    status: varchar("status", { length: 20 }).$type<XFindStatus>().notNull().default("new"),
    /** The post's top replies, null until the post has been read (part 22). */
    topReplies: jsonb("top_replies").$type<XTopReply[] | null>(),
    readAt: timestamp("read_at", { withTimezone: true }),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("ux_promo_x_finds_keyword_post").on(table.keywordId, table.postId),
    index("ix_promo_x_finds_user_status").on(table.userId, table.status),
    index("ix_promo_x_finds_status_seen").on(table.status, table.firstSeenAt),
    index("ix_promo_x_finds_post").on(table.userId, table.postId),
  ]
)

/** Accounts whose posts are never shown again (part 16). */
export const promoXHidden = pgTable(
  "promo_x_hidden",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    handle: varchar("handle", { length: 20 }).notNull(),
    /** The name it was shown under, so the hidden list reads like the posts did. */
    name: varchar("name", { length: 200 }).notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("ux_promo_x_hidden").on(table.userId, sql`lower(${table.handle})`)]
)

/** What the AI wrote for a post: a reply, a quote, or a reply under one of its top replies. Kept after sending. */
export const promoXDrafts = pgTable(
  "promo_x_drafts",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    findId: varchar("find_id", { length: 36 }).references(() => promoXFinds.id, { onDelete: "cascade" }),
    kind: varchar("kind", { length: 10 }).$type<"reply" | "quote">().notNull().default("reply"),
    /** The top reply this answers instead of the post (part 26), or "" for the post. */
    replyToId: varchar("reply_to_id", { length: 25 }).notNull().default(""),
    text: text("text").notNull(),
    helpOnly: boolean("help_only").notNull().default(false),
    rewrite: varchar("rewrite", { length: 20 }).$type<XRewrite | "">().notNull().default(""),
    provider: varchar("provider", { length: 30 }).notNull().default(""),
    model: varchar("model", { length: 120 }).notNull().default(""),
    status: varchar("status", { length: 20 }).$type<"draft" | "sent">().notNull().default("draft"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("ix_promo_x_drafts_find").on(table.findId, table.createdAt.desc())]
)

/**
 * A reply, quote or answer that went out, or tried to. One row per press, so
 * a failure leaves a record. An answer to somebody who replied under one of
 * ours has `parentId`; an answer to a post that named the account has none.
 */
export const promoXReplies = pgTable(
  "promo_x_replies",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    accountId: varchar("account_id", { length: 36 })
      .notNull()
      .references(() => promoAccounts.id, { onDelete: "cascade" }),
    projectId: varchar("project_id", { length: 36 }).references(() => promoProjects.id, { onDelete: "set null" }),
    kind: varchar("kind", { length: 10 }).$type<XReplyKind>().notNull().default("reply"),
    /** The find it answered. Null for an answer, or once the find was tidied away; the post is kept below. */
    findId: varchar("find_id", { length: 36 }).references(() => promoXFinds.id, { onDelete: "set null" }),
    draftId: varchar("draft_id", { length: 36 }).references(() => promoXDrafts.id, { onDelete: "set null" }),
    parentId: varchar("parent_id", { length: 36 }).references((): AnyPgColumn => promoXReplies.id, {
      onDelete: "cascade",
    }),
    /** The post it sits under, or the post it quotes. */
    targetId: varchar("target_id", { length: 25 }).notNull(),
    targetUrl: varchar("target_url", { length: 300 }).notNull().default(""),
    targetHandle: varchar("target_handle", { length: 20 }).notNull().default(""),
    targetText: text("target_text").notNull().default(""),
    /** The post being answered, as it read when the answer was written. */
    replyTo: jsonb("reply_to").$type<XIncoming | null>(),
    /** Exactly what was sent, which may differ from the draft after an edit. */
    text: text("text").notNull(),
    helpOnly: boolean("help_only").notNull().default(false),
    /** The other account's words this one was too like when Post was pressed (part 28), or "". It never stopped Post. */
    similarTo: text("similar_to").notNull().default(""),
    status: varchar("status", { length: 20 }).$type<XReplyStatus>().notNull().default("waiting"),
    jobId: varchar("job_id", { length: 36 }),
    /** X's id for ours once it landed. */
    postId: varchar("post_id", { length: 25 }).notNull().default(""),
    postUrl: varchar("post_url", { length: 300 }).notNull().default(""),
    lastError: text("last_error").notNull().default(""),
    /** The last reading, all null until one is taken: null is "not read yet", never 0 or "gone". */
    views: integer("views"),
    likes: integer("likes"),
    replyCount: integer("reply_count"),
    reposts: integer("reposts"),
    stillVisible: boolean("still_visible"),
    checkedAt: timestamp("checked_at", { withTimezone: true }),
    incoming: jsonb("incoming").$type<XIncoming[] | null>(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    editedAt: timestamp("edited_at", { withTimezone: true }),
    originalText: text("original_text"),
    sentBy: text("sent_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    postedAt: timestamp("posted_at", { withTimezone: true }),
  },
  (table) => [
    index("ix_promo_x_replies_account").on(table.accountId, table.createdAt.desc()),
    index("ix_promo_x_replies_project").on(table.projectId, table.createdAt.desc()),
    index("ix_promo_x_replies_target").on(table.userId, table.targetId),
  ]
)

/** A post or thread of the account's own, from a draft in Promo to live on X (parts 29 to 35). */
export const promoXPosts = pgTable(
  "promo_x_posts",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    /** The account it goes out as. Null on a draft nobody picked an account for yet. */
    accountId: varchar("account_id", { length: 36 }).references(() => promoAccounts.id, { onDelete: "cascade" }),
    projectId: varchar("project_id", { length: 36 }).references(() => promoProjects.id, { onDelete: "set null" }),
    /** One piece for a post, several for a thread, each with where it landed. */
    pieces: jsonb("pieces").$type<XPostPiece[]>().notNull().default([]),
    poll: jsonb("poll").$type<XPoll | null>(),
    /** The community it goes into (part 35), or "" for the account's own page. */
    communityId: varchar("community_id", { length: 25 }).notNull().default(""),
    /** Where it started: "" from scratch, `medium:<article id>` or `reddit:<comment id>`. */
    source: varchar("source", { length: 80 }).notNull().default(""),
    status: varchar("status", { length: 20 }).$type<XPostStatus>().notNull().default("draft"),
    /** The hour a person picked for it (part 31), or null for as soon as Post is pressed. */
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }),
    jobId: varchar("job_id", { length: 36 }),
    lastError: text("last_error").notNull().default(""),
    /** The first piece's numbers, as the last check read them. Null until read. */
    views: integer("views"),
    likes: integer("likes"),
    replyCount: integer("reply_count"),
    reposts: integer("reposts"),
    stillVisible: boolean("still_visible"),
    checkedAt: timestamp("checked_at", { withTimezone: true }),
    incoming: jsonb("incoming").$type<XIncoming[] | null>(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    sentBy: text("sent_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    postedAt: timestamp("posted_at", { withTimezone: true }),
  },
  (table) => [
    index("ix_promo_x_posts_project").on(table.projectId, table.createdAt.desc()),
    index("ix_promo_x_posts_account").on(table.accountId, table.createdAt.desc()),
  ]
)

/** An X community that suits a project, with its rules (part 35). */
export const promoXCommunities = pgTable(
  "promo_x_communities",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    projectId: varchar("project_id", { length: 36 })
      .notNull()
      .references(() => promoProjects.id, { onDelete: "cascade" }),
    communityId: varchar("community_id", { length: 25 }).notNull(),
    name: varchar("name", { length: 200 }).notNull().default(""),
    description: text("description").notNull().default(""),
    /** Its rules, read or pasted, handed to the AI before it writes there. */
    rules: text("rules").notNull().default(""),
    members: integer("members"),
    rulesReadAt: timestamp("rules_read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("ux_promo_x_communities").on(table.projectId, table.communityId)]
)

/** An account on an account's public X list (part 36). */
export const promoXListItems = pgTable(
  "promo_x_list_items",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    accountId: varchar("account_id", { length: 36 })
      .notNull()
      .references(() => promoAccounts.id, { onDelete: "cascade" }),
    handle: varchar("handle", { length: 20 }).notNull(),
    name: varchar("name", { length: 200 }).notNull().default(""),
    status: varchar("status", { length: 20 }).$type<XListItemStatus>().notNull().default("waiting"),
    jobId: varchar("job_id", { length: 36 }),
    lastError: text("last_error").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    addedAt: timestamp("added_at", { withTimezone: true }),
  },
  (table) => [uniqueIndex("ux_promo_x_list_items").on(table.accountId, sql`lower(${table.handle})`)]
)

/** A person the account followed after replying to them, or tried to (part 44). Counted per day. */
export const promoXFollows = pgTable(
  "promo_x_follows",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    accountId: varchar("account_id", { length: 36 })
      .notNull()
      .references(() => promoAccounts.id, { onDelete: "cascade" }),
    handle: varchar("handle", { length: 20 }).notNull(),
    status: varchar("status", { length: 20 }).$type<"waiting" | "done" | "failed">().notNull().default("waiting"),
    jobId: varchar("job_id", { length: 36 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("ux_promo_x_follows").on(table.accountId, sql`lower(${table.handle})`),
    index("ix_promo_x_follows_account").on(table.accountId, table.createdAt.desc()),
  ]
)

/**
 * A browser profile signed in to a throwaway X account that only ever reads
 * (parts 3, 4 and 5): the X searching every project needs, because X shows
 * nothing to a visitor who is not signed in. It is never offered as an
 * account that posts, and its views are counted per day.
 */
export const promoXSearchers = pgTable(
  "promo_x_searchers",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    profileId: varchar("profile_id", { length: 36 })
      .notNull()
      .references(() => promoProfiles.id, { onDelete: "cascade" }),
    /** Who X says the profile is signed in as, from the last look. "" when signed out. */
    handle: varchar("handle", { length: 20 }).notNull().default(""),
    /** The day `views` counts, in UTC. */
    viewsOn: date("views_on"),
    views: integer("views").notNull().default(0),
    /** The day X locked it or showed its rate limit, in UTC. It takes no reads for the rest of that day. */
    stoppedOn: date("stopped_on"),
    stopReason: text("stop_reason").notNull().default(""),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("ux_promo_x_searchers_profile").on(table.profileId)]
)

/** One reading a day of an X account's followers and the views on its replies and posts (part 43). */
export const promoXReadings = pgTable(
  "promo_x_readings",
  {
    accountId: varchar("account_id", { length: 36 })
      .notNull()
      .references(() => promoAccounts.id, { onDelete: "cascade" }),
    readOn: date("read_on").notNull(),
    followers: integer("followers"),
    views: integer("views"),
  },
  (table) => [primaryKey({ columns: [table.accountId, table.readOn] })]
)

/** What X said was trending for the search account's place, the last time it was read (part 15). One row per person. */
export const promoXTrends = pgTable("promo_x_trends", {
  userId: varchar("user_id", { length: 36 })
    .primaryKey()
    .references(() => customShellUsers.id, { onDelete: "cascade" }),
  place: varchar("place", { length: 200 }).notNull().default(""),
  trends: jsonb("trends").$type<Array<{ name: string; posts: number | null }>>().notNull().default([]),
  readAt: timestamp("read_at", { withTimezone: true }).notNull().defaultNow(),
})


/** X's own numbers in Settings → Behaviour (`X_BEHAVIOUR_RANGES`). No row means where they begin. */
export const promoXSettings = pgTable("promo_x_settings", {
  userId: varchar("user_id", { length: 36 })
    .primaryKey()
    .references(() => customShellUsers.id, { onDelete: "cascade" }),
  repliesPerDay: integer("replies_per_day").notNull().default(100),
  repliesPerHour: integer("replies_per_hour").notNull().default(10),
  viewsPerDay: integer("views_per_day").notNull().default(500),
  followsPerDay: integer("follows_per_day").notNull().default(5),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

/** A post that names an X account as @handle without replying under one of ours (part 39), as the daily read found it. */
export const promoXMentions = pgTable(
  "promo_x_mentions",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    accountId: varchar("account_id", { length: 36 })
      .notNull()
      .references(() => promoAccounts.id, { onDelete: "cascade" }),
    postId: varchar("post_id", { length: 25 }).notNull(),
    handle: varchar("handle", { length: 20 }).notNull().default(""),
    name: varchar("name", { length: 200 }).notNull().default(""),
    text: text("text").notNull().default(""),
    likes: integer("likes").notNull().default(0),
    postedAt: timestamp("posted_at", { withTimezone: true }),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("ux_promo_x_mentions").on(table.accountId, table.postId),
    index("ix_promo_x_mentions_user").on(table.userId, table.firstSeenAt.desc()),
  ]
)
