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
  MediumArticleStatus,
  MediumFindStatus,
  MediumIncoming,
  MediumKeywordKind,
  MediumKeywordMark,
  MediumListItemStatus,
  MediumOutline,
  MediumResponseStatus,
  MediumStoryResponse,
  ResponseRewrite,
} from "@/lib/social/medium/options"
import { customShellUsers } from "@/server/schema"

import { promoAccounts, promoProjects } from "../schema"

/**
 * Medium's own tables (`workspace/tasks/Medium/01-medium-features.md`). The
 * matching SQL is `drizzle/0124_promo_medium.sql`.
 *
 * Medium's are kept apart from Reddit's on purpose. A Reddit keyword carries
 * subreddits and Reddit's sort order, a find carries Reddit's own id, and a
 * sent comment is tied to a Reddit find; widening those to fit Medium would
 * change Reddit's code for no gain to Reddit. The account, the project, the
 * voice, the job queue and the bell are shared as they are.
 *
 * Everything is scoped by user id, as Promo's other tables are.
 */

/** A Medium keyword: a tag, search words, a publication or a writer. */
export const promoMediumKeywords = pgTable(
  "promo_medium_keywords",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    /** A project holding keywords cannot be deleted, the same as Reddit's. */
    projectId: varchar("project_id", { length: 36 })
      .notNull()
      .references(() => promoProjects.id, { onDelete: "restrict" }),
    kind: varchar("kind", { length: 20 }).$type<MediumKeywordKind>().notNull(),
    /** A tag's slug, the search words, a publication's slug or a writer's handle. */
    value: varchar("value", { length: 200 }).notNull(),
    /** "you" or "rival" on search words that name a product (part 13). */
    mark: varchar("mark", { length: 10 }).$type<MediumKeywordMark>().notNull().default(""),
    enabled: boolean("enabled").notNull().default(true),
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
    /** Why the last search failed, or "" when it worked. */
    lastError: text("last_error").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("ix_promo_medium_keywords_project").on(table.projectId),
    uniqueIndex("ux_promo_medium_keywords_value").on(table.projectId, table.kind, sql`lower(${table.value})`),
  ]
)

/**
 * A Medium story a keyword found, and what was decided about it. Most of it
 * comes from the story's own data on Medium (`/p/<id>?format=json`), which
 * carries the writer, their followers, the publication, the claps and the
 * number of responses in one answer.
 */
export const promoMediumFinds = pgTable(
  "promo_medium_finds",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    keywordId: varchar("keyword_id", { length: 36 })
      .notNull()
      .references(() => promoMediumKeywords.id, { onDelete: "cascade" }),
    /** Medium's own id for the story, the hex at the end of its address. */
    storyId: varchar("story_id", { length: 16 }).notNull(),
    url: varchar("url", { length: 600 }).notNull(),
    title: varchar("title", { length: 600 }).notNull().default(""),
    subtitle: text("subtitle").notNull().default(""),
    writerId: varchar("writer_id", { length: 40 }).notNull().default(""),
    writerHandle: varchar("writer_handle", { length: 120 }).notNull().default(""),
    writerName: varchar("writer_name", { length: 200 }).notNull().default(""),
    /** Null when Medium did not say, never 0 as a stand-in. */
    writerFollowers: integer("writer_followers"),
    publicationSlug: varchar("publication_slug", { length: 120 }).notNull().default(""),
    publicationName: varchar("publication_name", { length: 200 }).notNull().default(""),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    postedAt: timestamp("posted_at", { withTimezone: true }),
    claps: integer("claps").notNull().default(0),
    responseCount: integer("response_count").notNull().default(0),
    /** A members-only story: a stranger reads only its opening. */
    membersOnly: boolean("members_only").notNull().default(false),
    /** Where the keyword's list put it, 0 being first. */
    position: integer("position").notNull().default(0),
    rank: numeric("rank", { precision: 10, scale: 4, mode: "number" }).notNull().default(0),
    status: varchar("status", { length: 20 }).$type<MediumFindStatus>().notNull().default("new"),
    /** The story's words as the reader read them, capped. Only the opening of a members-only story. */
    text: text("text").notNull().default(""),
    /** The story's top responses, null until the story has been read (part 19). */
    responses: jsonb("responses").$type<MediumStoryResponse[] | null>(),
    storyReadAt: timestamp("story_read_at", { withTimezone: true }),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("ux_promo_medium_finds_keyword_story").on(table.keywordId, table.storyId),
    index("ix_promo_medium_finds_user_status").on(table.userId, table.status),
    index("ix_promo_medium_finds_status_seen").on(table.status, table.lastSeenAt),
    index("ix_promo_medium_finds_story").on(table.userId, table.storyId),
  ]
)

/** Writers and publications whose stories are never shown again (part 10). */
export const promoMediumHidden = pgTable(
  "promo_medium_hidden",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    kind: varchar("kind", { length: 20 }).$type<"writer" | "publication">().notNull(),
    /** The writer's handle or the publication's slug. */
    value: varchar("value", { length: 120 }).notNull(),
    /** The name it was shown under, so the hidden list reads like the stories did. */
    name: varchar("name", { length: 200 }).notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("ux_promo_medium_hidden").on(table.userId, table.kind, sql`lower(${table.value})`)]
)

/** What the AI wrote for a story. Kept after sending. */
export const promoMediumDrafts = pgTable(
  "promo_medium_drafts",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    findId: varchar("find_id", { length: 36 }).references(() => promoMediumFinds.id, { onDelete: "cascade" }),
    text: text("text").notNull(),
    /** The sentence of the story the draft answers, or "" for none (part 23). */
    line: text("line").notNull().default(""),
    helpOnly: boolean("help_only").notNull().default(false),
    rewrite: varchar("rewrite", { length: 20 }).$type<ResponseRewrite | "">().notNull().default(""),
    provider: varchar("provider", { length: 30 }).notNull().default(""),
    model: varchar("model", { length: 120 }).notNull().default(""),
    status: varchar("status", { length: 20 }).$type<"draft" | "sent">().notNull().default("draft"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("ix_promo_medium_drafts_find").on(table.findId, table.createdAt.desc())]
)

/** A Medium article written in Promo, from a draft to live on Medium. */
export const promoMediumArticles = pgTable(
  "promo_medium_articles",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    /** The account it goes out as. Null on a draft nobody picked an account for yet. */
    accountId: varchar("account_id", { length: 36 }).references(() => promoAccounts.id, { onDelete: "cascade" }),
    projectId: varchar("project_id", { length: 36 }).references(() => promoProjects.id, { onDelete: "set null" }),
    title: varchar("title", { length: 200 }).notNull().default(""),
    subtitle: varchar("subtitle", { length: 300 }).notNull().default(""),
    /** Plain text: a blank line between paragraphs, "## " in front of a heading. */
    body: text("body").notNull().default(""),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    /** A media library picture's address, or "" for none. */
    coverUrl: varchar("cover_url", { length: 2048 }).notNull().default(""),
    /** The publication it goes into, or "" for the account's own page. */
    publicationSlug: varchar("publication_slug", { length: 120 }).notNull().default(""),
    outline: jsonb("outline").$type<MediumOutline | null>(),
    /** Where it started: "" from scratch, `reddit:<comment id>` from a Reddit comment (part 30). */
    source: varchar("source", { length: 80 }).notNull().default(""),
    status: varchar("status", { length: 20 }).$type<MediumArticleStatus>().notNull().default("draft"),
    jobId: varchar("job_id", { length: 36 }),
    storyId: varchar("story_id", { length: 16 }).notNull().default(""),
    url: varchar("url", { length: 600 }).notNull().default(""),
    lastError: text("last_error").notNull().default(""),
    /** The newest reading, null until one is taken. Views and reads only the writer sees. */
    views: integer("views"),
    reads: integer("reads"),
    claps: integer("claps"),
    responses: integer("responses"),
    /** The responses under it, as the last check read them. Null until read, which is not the same as none. */
    incoming: jsonb("incoming").$type<MediumIncoming[] | null>(),
    stillVisible: boolean("still_visible"),
    numbersReadAt: timestamp("numbers_read_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    editedAt: timestamp("edited_at", { withTimezone: true }),
    sentBy: text("sent_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
  },
  (table) => [
    index("ix_promo_medium_articles_project").on(table.projectId, table.createdAt.desc()),
    index("ix_promo_medium_articles_account").on(table.accountId, table.createdAt.desc()),
  ]
)

/**
 * A response that went out, or tried to: on a story, or an answer to
 * somebody who responded under one of ours (`parentId`) or under one of our
 * articles (`articleId`). One row per press, so a failure leaves a record.
 */
export const promoMediumResponses = pgTable(
  "promo_medium_responses",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    accountId: varchar("account_id", { length: 36 })
      .notNull()
      .references(() => promoAccounts.id, { onDelete: "cascade" }),
    projectId: varchar("project_id", { length: 36 }).references(() => promoProjects.id, { onDelete: "set null" }),
    /** The find it answered. Null for an answer, or once the find was tidied away; the story is kept below. */
    findId: varchar("find_id", { length: 36 }).references(() => promoMediumFinds.id, { onDelete: "set null" }),
    draftId: varchar("draft_id", { length: 36 }).references(() => promoMediumDrafts.id, { onDelete: "set null" }),
    parentId: varchar("parent_id", { length: 36 }).references((): AnyPgColumn => promoMediumResponses.id, {
      onDelete: "cascade",
    }),
    articleId: varchar("article_id", { length: 36 }).references(() => promoMediumArticles.id, { onDelete: "cascade" }),
    /** The response being answered, as it read when the answer was written. */
    replyTo: jsonb("reply_to").$type<MediumIncoming | null>(),
    /** The story the response sits under: the story itself, or the response being answered. */
    storyId: varchar("story_id", { length: 16 }).notNull(),
    storyUrl: varchar("story_url", { length: 600 }).notNull().default(""),
    storyTitle: varchar("story_title", { length: 600 }).notNull().default(""),
    /** Exactly what was sent, which may differ from the draft after an edit. */
    text: text("text").notNull(),
    line: text("line").notNull().default(""),
    helpOnly: boolean("help_only").notNull().default(false),
    status: varchar("status", { length: 20 }).$type<MediumResponseStatus>().notNull().default("waiting"),
    jobId: varchar("job_id", { length: 36 }),
    /** Medium's id for the response once it landed. */
    responseId: varchar("response_id", { length: 16 }).notNull().default(""),
    responseUrl: varchar("response_url", { length: 600 }).notNull().default(""),
    lastError: text("last_error").notNull().default(""),
    /** The last reading, all null until one is taken: null is "not read yet", never 0 or "gone". */
    claps: integer("claps"),
    replyCount: integer("reply_count"),
    stillVisible: boolean("still_visible"),
    checkedAt: timestamp("checked_at", { withTimezone: true }),
    incoming: jsonb("incoming").$type<MediumIncoming[] | null>(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    editedAt: timestamp("edited_at", { withTimezone: true }),
    originalText: text("original_text"),
    sentBy: text("sent_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    postedAt: timestamp("posted_at", { withTimezone: true }),
  },
  (table) => [
    index("ix_promo_medium_responses_account").on(table.accountId, table.createdAt.desc()),
    index("ix_promo_medium_responses_project").on(table.projectId, table.createdAt.desc()),
    index("ix_promo_medium_responses_story").on(table.userId, table.storyId),
  ]
)

/** One reading a day of an article's numbers (part 40). */
export const promoMediumArticleReadings = pgTable(
  "promo_medium_article_readings",
  {
    articleId: varchar("article_id", { length: 36 })
      .notNull()
      .references(() => promoMediumArticles.id, { onDelete: "cascade" }),
    readOn: date("read_on").notNull(),
    views: integer("views"),
    reads: integer("reads"),
    claps: integer("claps"),
    responses: integer("responses"),
  },
  (table) => [primaryKey({ columns: [table.articleId, table.readOn] })]
)

/** A Medium publication that suits a project (parts 32 and 33). */
export const promoMediumPublications = pgTable(
  "promo_medium_publications",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    projectId: varchar("project_id", { length: 36 })
      .notNull()
      .references(() => promoProjects.id, { onDelete: "cascade" }),
    slug: varchar("slug", { length: 120 }).notNull(),
    name: varchar("name", { length: 200 }).notNull().default(""),
    description: text("description").notNull().default(""),
    /** Its submission rules, pasted or read, handed to the AI before it writes there. */
    rules: text("rules").notNull().default(""),
    rulesReadAt: timestamp("rules_read_at", { withTimezone: true }),
    /** The project's accounts Medium last said write for it. */
    writers: jsonb("writers").$type<string[]>().notNull().default([]),
    writersReadAt: timestamp("writers_read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("ux_promo_medium_publications").on(table.projectId, sql`lower(${table.slug})`)]
)

/** A story on an account's public Medium list (part 34). */
export const promoMediumListItems = pgTable(
  "promo_medium_list_items",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    accountId: varchar("account_id", { length: 36 })
      .notNull()
      .references(() => promoAccounts.id, { onDelete: "cascade" }),
    storyId: varchar("story_id", { length: 16 }).notNull(),
    storyUrl: varchar("story_url", { length: 600 }).notNull().default(""),
    title: varchar("title", { length: 600 }).notNull().default(""),
    /** One of the account's own articles. */
    own: boolean("own").notNull().default(false),
    status: varchar("status", { length: 20 }).$type<MediumListItemStatus>().notNull().default("waiting"),
    jobId: varchar("job_id", { length: 36 }),
    lastError: text("last_error").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    addedAt: timestamp("added_at", { withTimezone: true }),
  },
  (table) => [uniqueIndex("ux_promo_medium_list_items").on(table.accountId, table.storyId)]
)

export type MediumKeywordRow = typeof promoMediumKeywords.$inferSelect
export type MediumFindRow = typeof promoMediumFinds.$inferSelect
export type MediumResponseRow = typeof promoMediumResponses.$inferSelect
export type MediumArticleRow = typeof promoMediumArticles.$inferSelect
