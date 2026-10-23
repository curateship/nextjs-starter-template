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
  LinkedinCommentKind,
  LinkedinCommentStatus,
  LinkedinConnectStatus,
  LinkedinFindStatus,
  LinkedinIncoming,
  LinkedinInviteStatus,
  LinkedinKeywordKind,
  LinkedinKeywordMark,
  LinkedinPoll,
  LinkedinPostKind,
  LinkedinPostStatus,
  LinkedinRewrite,
  LinkedinTag,
  LinkedinTopComment,
} from "@/lib/social/linkedin/options"
import { promoProfiles } from "@/server/browser/schema"
import { customShellUsers } from "@/server/schema"

import { promoAccounts, promoProjects } from "../schema"

/**
 * LinkedIn's own tables (`workspace/tasks/LinkedIn/01-linkedin-features.md`).
 * The matching SQL is `drizzle/0126_promo_linkedin.sql`.
 *
 * Kept apart from the other networks' for the reason Medium's and X's are: a
 * Reddit keyword carries subreddits and an X find a post id with a handle,
 * and widening either to fit LinkedIn would change their code for no gain to
 * them. The account, the project, the voice, the job queue and the bell are
 * shared as they are.
 *
 * Everything is scoped by user id, as Promo's other tables are. LinkedIn's
 * ids are kept as text: they are longer than JavaScript counts exactly.
 */

/** LinkedIn's own numbers in Settings → Behaviour (`LINKEDIN_BEHAVIOUR_RANGES`). No row means where they begin. */
export const promoLinkedinSettings = pgTable("promo_linkedin_settings", {
  userId: varchar("user_id", { length: 36 })
    .primaryKey()
    .references(() => customShellUsers.id, { onDelete: "cascade" }),
  commentsPerDay: integer("comments_per_day").notNull().default(20),
  viewsPerDay: integer("views_per_day").notNull().default(300),
  connectsPerWeek: integer("connects_per_week").notNull().default(20),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

/** A project's LinkedIn-only settings: the job titles of the people it sells to (part 14). */
export const promoLinkedinProjects = pgTable("promo_linkedin_projects", {
  projectId: varchar("project_id", { length: 36 })
    .primaryKey()
    .references(() => promoProjects.id, { onDelete: "cascade" }),
  userId: varchar("user_id", { length: 36 })
    .notNull()
    .references(() => customShellUsers.id, { onDelete: "cascade" }),
  buyerTitles: jsonb("buyer_titles").$type<string[]>().notNull().default([]),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

/** A LinkedIn keyword: search words, a hashtag, or a person or company page watched for its new posts. */
export const promoLinkedinKeywords = pgTable(
  "promo_linkedin_keywords",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    /** A project holding keywords cannot be deleted, the same as the other networks'. */
    projectId: varchar("project_id", { length: 36 })
      .notNull()
      .references(() => promoProjects.id, { onDelete: "restrict" }),
    kind: varchar("kind", { length: 20 }).$type<LinkedinKeywordKind>().notNull(),
    /** The search words, a hashtag without its #, or a person's or company's slug. */
    value: varchar("value", { length: 200 }).notNull(),
    /** "you" or "rival" on search words that name a product (part 15). */
    mark: varchar("mark", { length: 10 }).$type<LinkedinKeywordMark>().notNull().default(""),
    enabled: boolean("enabled").notNull().default(true),
    /** A watched person's or page's new posts ring the bell (part 12). */
    notify: boolean("notify").notNull().default(true),
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
    /** Why the last search failed, or "" when it worked. */
    lastError: text("last_error").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("ix_promo_linkedin_keywords_project").on(table.projectId),
    uniqueIndex("ux_promo_linkedin_keywords_value").on(table.projectId, table.kind, sql`lower(${table.value})`),
  ]
)

/**
 * A LinkedIn post a keyword found, or that turned up in one of the accounts'
 * own feeds (part 13), and what was decided about it. One row per post per
 * keyword, or per post per feed. A feed find is offered only to the account
 * whose feed it was in.
 */
export const promoLinkedinFinds = pgTable(
  "promo_linkedin_finds",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    projectId: varchar("project_id", { length: 36 })
      .notNull()
      .references(() => promoProjects.id, { onDelete: "cascade" }),
    /** The keyword that found it, or null for a feed find. */
    keywordId: varchar("keyword_id", { length: 36 }).references(() => promoLinkedinKeywords.id, { onDelete: "cascade" }),
    /** The account whose own feed it was in (part 13), or null for a keyword find. */
    feedAccountId: varchar("feed_account_id", { length: 36 }).references(() => promoAccounts.id, { onDelete: "cascade" }),
    /** LinkedIn's activity id. */
    postId: varchar("post_id", { length: 25 }).notNull(),
    url: varchar("url", { length: 400 }).notNull(),
    text: text("text").notNull().default(""),
    authorName: varchar("author_name", { length: 200 }).notNull().default(""),
    /** The writer's job title, the line under their name (part 14). */
    authorHeadline: varchar("author_headline", { length: 300 }).notNull().default(""),
    authorSlug: varchar("author_slug", { length: 100 }).notNull().default(""),
    authorKind: varchar("author_kind", { length: 10 }).$type<"person" | "company">().notNull().default("person"),
    /** Null when LinkedIn did not say, never 0 as a stand-in. */
    authorFollowers: integer("author_followers"),
    postedAt: timestamp("posted_at", { withTimezone: true }),
    reactions: integer("reactions").notNull().default(0),
    comments: integer("comments").notNull().default(0),
    reposts: integer("reposts").notNull().default(0),
    /** False when the writer turned comments off or limited them to connections (part 18). Such a post is never listed. */
    canComment: boolean("can_comment").notNull().default(true),
    /** The first link in the post, or "". */
    link: varchar("link", { length: 600 }).notNull().default(""),
    /** Where the keyword's list put it, 0 being first. */
    position: integer("position").notNull().default(0),
    rank: numeric("rank", { precision: 10, scale: 4, mode: "number" }).notNull().default(0),
    /** The project's buyer title the writer's headline matched (part 14), or "". */
    matchedTitle: varchar("matched_title", { length: 60 }).notNull().default(""),
    status: varchar("status", { length: 20 }).$type<LinkedinFindStatus>().notNull().default("new"),
    /** The post's top comments, null until the post has been read (part 22). */
    topComments: jsonb("top_comments").$type<LinkedinTopComment[] | null>(),
    readAt: timestamp("read_at", { withTimezone: true }),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("ux_promo_linkedin_finds_keyword_post").on(table.keywordId, table.postId).where(sql`${table.keywordId} IS NOT NULL`),
    uniqueIndex("ux_promo_linkedin_finds_feed_post").on(table.feedAccountId, table.postId).where(sql`${table.feedAccountId} IS NOT NULL`),
    index("ix_promo_linkedin_finds_project_status").on(table.projectId, table.status),
    index("ix_promo_linkedin_finds_status_seen").on(table.status, table.firstSeenAt),
    index("ix_promo_linkedin_finds_post").on(table.userId, table.postId),
  ]
)

/** People and company pages whose posts are never shown again (part 17). */
export const promoLinkedinHidden = pgTable(
  "promo_linkedin_hidden",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    slug: varchar("slug", { length: 100 }).notNull(),
    kind: varchar("kind", { length: 10 }).$type<"person" | "company">().notNull().default("person"),
    /** The name it was shown under, so the hidden list reads like the posts did. */
    name: varchar("name", { length: 200 }).notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("ux_promo_linkedin_hidden").on(table.userId, table.kind, sql`lower(${table.slug})`)]
)

/** What the AI wrote for a post: a comment, or a reply under one of its top comments. Kept after sending. */
export const promoLinkedinDrafts = pgTable(
  "promo_linkedin_drafts",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    findId: varchar("find_id", { length: 36 }).references(() => promoLinkedinFinds.id, { onDelete: "cascade" }),
    /** The top comment this answers instead of the post (part 25), or "" for the post. */
    replyToId: varchar("reply_to_id", { length: 40 }).notNull().default(""),
    text: text("text").notNull(),
    helpOnly: boolean("help_only").notNull().default(false),
    rewrite: varchar("rewrite", { length: 20 }).$type<LinkedinRewrite | "">().notNull().default(""),
    provider: varchar("provider", { length: 30 }).notNull().default(""),
    model: varchar("model", { length: 120 }).notNull().default(""),
    status: varchar("status", { length: 20 }).$type<"draft" | "sent">().notNull().default("draft"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("ix_promo_linkedin_drafts_find").on(table.findId, table.createdAt.desc())]
)

/**
 * A comment, a reply under a top comment, or an answer that went out, or
 * tried to. One row per press, so a failure leaves a record. An answer to
 * somebody who replied under one of ours has `parentId`; an answer under one
 * of our own posts has none.
 */
export const promoLinkedinComments = pgTable(
  "promo_linkedin_comments",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    accountId: varchar("account_id", { length: 36 })
      .notNull()
      .references(() => promoAccounts.id, { onDelete: "cascade" }),
    projectId: varchar("project_id", { length: 36 }).references(() => promoProjects.id, { onDelete: "set null" }),
    kind: varchar("kind", { length: 10 }).$type<LinkedinCommentKind>().notNull().default("comment"),
    /** The find it was for. Null for an answer, or once the find was tidied away; the post is kept below. */
    findId: varchar("find_id", { length: 36 }).references(() => promoLinkedinFinds.id, { onDelete: "set null" }),
    draftId: varchar("draft_id", { length: 36 }).references(() => promoLinkedinDrafts.id, { onDelete: "set null" }),
    parentId: varchar("parent_id", { length: 36 }).references((): AnyPgColumn => promoLinkedinComments.id, {
      onDelete: "cascade",
    }),
    /** The post it sits under. */
    targetId: varchar("target_id", { length: 25 }).notNull(),
    /** The comment it sits under, for a reply or an answer, or "" for a comment on the post. */
    parentCommentId: varchar("parent_comment_id", { length: 40 }).notNull().default(""),
    targetUrl: varchar("target_url", { length: 400 }).notNull().default(""),
    targetName: varchar("target_name", { length: 200 }).notNull().default(""),
    targetSlug: varchar("target_slug", { length: 100 }).notNull().default(""),
    targetText: text("target_text").notNull().default(""),
    /** The comment being answered, as it read when the answer was written. */
    replyTo: jsonb("reply_to").$type<LinkedinIncoming | null>(),
    /** Exactly what was sent, which may differ from the draft after an edit. */
    text: text("text").notNull(),
    helpOnly: boolean("help_only").notNull().default(false),
    /** Kept out of the AI's examples of the account's voice by a person (part 24). */
    notExample: boolean("not_example").notNull().default(false),
    /** The company page it went out as (part 38), or "" for the person. */
    asPageId: varchar("as_page_id", { length: 30 }).notNull().default(""),
    /** The other account's words this one was too like when Post was pressed, or "". It never stopped Post. */
    similarTo: text("similar_to").notNull().default(""),
    status: varchar("status", { length: 20 }).$type<LinkedinCommentStatus>().notNull().default("waiting"),
    jobId: varchar("job_id", { length: 36 }),
    /** LinkedIn's id for ours once it landed. */
    commentId: varchar("comment_id", { length: 40 }).notNull().default(""),
    commentUrl: varchar("comment_url", { length: 400 }).notNull().default(""),
    lastError: text("last_error").notNull().default(""),
    /** The last reading, all null until one is taken: null is "not read yet", never 0 or "gone". */
    reactions: integer("reactions"),
    replyCount: integer("reply_count"),
    stillVisible: boolean("still_visible"),
    checkedAt: timestamp("checked_at", { withTimezone: true }),
    incoming: jsonb("incoming").$type<LinkedinIncoming[] | null>(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    editedAt: timestamp("edited_at", { withTimezone: true }),
    originalText: text("original_text"),
    sentBy: text("sent_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    postedAt: timestamp("posted_at", { withTimezone: true }),
  },
  (table) => [
    index("ix_promo_linkedin_comments_account").on(table.accountId, table.createdAt.desc()),
    index("ix_promo_linkedin_comments_project").on(table.projectId, table.createdAt.desc()),
    index("ix_promo_linkedin_comments_target").on(table.userId, table.targetId),
  ]
)

/** A post, repost or newsletter issue of the account's own, from a draft in Promo to live on LinkedIn (parts 28 to 38). */
export const promoLinkedinPosts = pgTable(
  "promo_linkedin_posts",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    /** The account it goes out as. Null on a draft nobody picked an account for yet. */
    accountId: varchar("account_id", { length: 36 }).references(() => promoAccounts.id, { onDelete: "cascade" }),
    projectId: varchar("project_id", { length: 36 }).references(() => promoProjects.id, { onDelete: "set null" }),
    kind: varchar("kind", { length: 20 }).$type<LinkedinPostKind>().notNull().default("post"),
    /** The words, or a newsletter issue's body. */
    text: text("text").notNull().default(""),
    /** A newsletter issue's title (part 36), "" otherwise. */
    title: varchar("title", { length: 200 }).notNull().default(""),
    /** A media library picture's address, or "". A newsletter's cover goes here too. */
    pictureUrl: varchar("picture_url", { length: 2048 }).notNull().default(""),
    /** A media library video's address (part 32), or "". */
    videoUrl: varchar("video_url", { length: 2048 }).notNull().default(""),
    poll: jsonb("poll").$type<LinkedinPoll | null>(),
    /** People and pages tagged in the words (part 30). */
    tags: jsonb("tags").$type<LinkedinTag[]>().notNull().default([]),
    /** The post a repost shares (part 33), or "". */
    repostOf: varchar("repost_of", { length: 25 }).notNull().default(""),
    /** The group it goes into (part 37), or "" for the account's own page. */
    groupId: varchar("group_id", { length: 20 }).notNull().default(""),
    /** The company page it goes out as (part 38), or "" for the person. */
    asPageId: varchar("as_page_id", { length: 30 }).notNull().default(""),
    /** The link taken out of the words, posted as the first comment under it (part 29), or "". */
    firstComment: varchar("first_comment", { length: 600 }).notNull().default(""),
    /** LinkedIn's id for that first comment once it landed. */
    firstCommentId: varchar("first_comment_id", { length: 40 }).notNull().default(""),
    /** Where it started: "" from scratch, `medium:<article id>`, `reddit:<comment id>` or `question:<find id>`. */
    source: varchar("source", { length: 80 }).notNull().default(""),
    status: varchar("status", { length: 20 }).$type<LinkedinPostStatus>().notNull().default("draft"),
    /** The hour a person picked for it, or null for as soon as Post is pressed. */
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }),
    jobId: varchar("job_id", { length: 36 }),
    /** LinkedIn's activity id once it is up. */
    postId: varchar("post_id", { length: 25 }).notNull().default(""),
    postUrl: varchar("post_url", { length: 400 }).notNull().default(""),
    lastError: text("last_error").notNull().default(""),
    /** The numbers as the last check read them. Null until read. */
    reactions: integer("reactions"),
    commentCount: integer("comment_count"),
    reposts: integer("reposts"),
    impressions: integer("impressions"),
    stillVisible: boolean("still_visible"),
    checkedAt: timestamp("checked_at", { withTimezone: true }),
    incoming: jsonb("incoming").$type<LinkedinIncoming[] | null>(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    editedAt: timestamp("edited_at", { withTimezone: true }),
    sentBy: text("sent_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    postedAt: timestamp("posted_at", { withTimezone: true }),
  },
  (table) => [
    index("ix_promo_linkedin_posts_project").on(table.projectId, table.createdAt.desc()),
    index("ix_promo_linkedin_posts_account").on(table.accountId, table.createdAt.desc()),
  ]
)

/** A LinkedIn group a project posts in, with its rules (part 37). */
export const promoLinkedinGroups = pgTable(
  "promo_linkedin_groups",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    projectId: varchar("project_id", { length: 36 })
      .notNull()
      .references(() => promoProjects.id, { onDelete: "cascade" }),
    groupId: varchar("group_id", { length: 20 }).notNull(),
    name: varchar("name", { length: 200 }).notNull().default(""),
    description: text("description").notNull().default(""),
    /** Its rules, read or pasted, handed to the AI before it writes there. */
    rules: text("rules").notNull().default(""),
    members: integer("members"),
    rulesReadAt: timestamp("rules_read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("ux_promo_linkedin_groups").on(table.projectId, table.groupId)]
)

/** A company page an account runs, as the account's own look last read it (part 38). */
export const promoLinkedinPages = pgTable(
  "promo_linkedin_pages",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    accountId: varchar("account_id", { length: 36 })
      .notNull()
      .references(() => promoAccounts.id, { onDelete: "cascade" }),
    /** LinkedIn's number for the page, which "Comment as" names. */
    pageId: varchar("page_id", { length: 30 }).notNull(),
    slug: varchar("slug", { length: 100 }).notNull().default(""),
    name: varchar("name", { length: 200 }).notNull().default(""),
    seenAt: timestamp("seen_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("ux_promo_linkedin_pages").on(table.accountId, table.pageId)]
)

/** A connection request an account sent, or tried to (part 39). Counted per week. */
export const promoLinkedinConnects = pgTable(
  "promo_linkedin_connects",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    accountId: varchar("account_id", { length: 36 })
      .notNull()
      .references(() => promoAccounts.id, { onDelete: "cascade" }),
    slug: varchar("slug", { length: 100 }).notNull(),
    name: varchar("name", { length: 200 }).notNull().default(""),
    headline: varchar("headline", { length: 300 }).notNull().default(""),
    /** The note sent with it, as Tyler last edited it, or "" for none. */
    note: varchar("note", { length: 300 }).notNull().default(""),
    /** What led to it: a comment on their post, or their look at the account's profile (part 41). */
    source: varchar("source", { length: 10 }).$type<"post" | "viewer">().notNull().default("post"),
    /** The comment that led to it, when there was one. */
    commentRowId: varchar("comment_row_id", { length: 36 }).references(() => promoLinkedinComments.id, { onDelete: "set null" }),
    status: varchar("status", { length: 20 }).$type<LinkedinConnectStatus>().notNull().default("waiting"),
    jobId: varchar("job_id", { length: 36 }),
    lastError: text("last_error").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("ux_promo_linkedin_connects").on(table.accountId, sql`lower(${table.slug})`),
    index("ix_promo_linkedin_connects_account").on(table.accountId, table.createdAt.desc()),
  ]
)

/** A connection request somebody sent one of the accounts (part 40), as its invitations page last showed it. */
export const promoLinkedinInvites = pgTable(
  "promo_linkedin_invites",
  {
    // The slug is kept in lower case, as LinkedIn treats it, so one person is one row.
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    accountId: varchar("account_id", { length: 36 })
      .notNull()
      .references(() => promoAccounts.id, { onDelete: "cascade" }),
    slug: varchar("slug", { length: 100 }).notNull(),
    name: varchar("name", { length: 200 }).notNull().default(""),
    headline: varchar("headline", { length: 300 }).notNull().default(""),
    note: text("note").notNull().default(""),
    status: varchar("status", { length: 20 }).$type<LinkedinInviteStatus>().notNull().default("waiting"),
    jobId: varchar("job_id", { length: 36 }),
    lastError: text("last_error").notNull().default(""),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  },
  (table) => [uniqueIndex("ux_promo_linkedin_invites").on(table.accountId, table.slug)]
)

/** Somebody who looked at one of the accounts' profiles (part 41), as the account's own viewers page last showed them. */
export const promoLinkedinViewers = pgTable(
  "promo_linkedin_viewers",
  {
    // The slug is kept in lower case, as LinkedIn treats it, so one person is one row.
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    accountId: varchar("account_id", { length: 36 })
      .notNull()
      .references(() => promoAccounts.id, { onDelete: "cascade" }),
    slug: varchar("slug", { length: 100 }).notNull(),
    name: varchar("name", { length: 200 }).notNull().default(""),
    headline: varchar("headline", { length: 300 }).notNull().default(""),
    /** When LinkedIn says they looked, as near as it says ("2 days ago"). Null when it did not say. */
    viewedAt: timestamp("viewed_at", { withTimezone: true }),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("ux_promo_linkedin_viewers").on(table.accountId, table.slug)]
)

/**
 * A browser profile signed in to a spare LinkedIn account that only ever
 * reads (part 3): the LinkedIn reading every project needs, because LinkedIn
 * shows almost nothing to a visitor who is not signed in. It is never offered
 * as an account that comments, and its views are counted per day.
 */
export const promoLinkedinSearchers = pgTable(
  "promo_linkedin_searchers",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    profileId: varchar("profile_id", { length: 36 })
      .notNull()
      .references(() => promoProfiles.id, { onDelete: "cascade" }),
    /** Who LinkedIn says the profile is signed in as (its slug), from the last look. "" when signed out. */
    slug: varchar("slug", { length: 100 }).notNull().default(""),
    /** The day `views` counts, in UTC. */
    viewsOn: date("views_on"),
    views: integer("views").notNull().default(0),
    /** The day LinkedIn restricted it or showed a check, in UTC. It takes no reads for the rest of that day. */
    stoppedOn: date("stopped_on"),
    stopReason: text("stop_reason").notNull().default(""),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("ux_promo_linkedin_searchers_profile").on(table.profileId)]
)

/**
 * One reading a week of a LinkedIn account's numbers (part 47), read in its
 * own browser, since only the account sees its profile views and
 * impressions. A number LinkedIn shows only to Premium is null, never 0.
 */
export const promoLinkedinReadings = pgTable(
  "promo_linkedin_readings",
  {
    accountId: varchar("account_id", { length: 36 })
      .notNull()
      .references(() => promoAccounts.id, { onDelete: "cascade" }),
    readOn: date("read_on").notNull(),
    followers: integer("followers"),
    connections: integer("connections"),
    profileViews: integer("profile_views"),
    impressions: integer("impressions"),
  },
  (table) => [primaryKey({ columns: [table.accountId, table.readOn] })]
)
