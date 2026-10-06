import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

import {
  type DraftStatus,
  type FindStatus,
  type FindThread,
  type JobKind,
  type JobStatus,
  type SearchStatus,
} from "@/lib/social/options"
import {
  type RedditSort,
  type RedditWindow,
} from "@/lib/social/reddit/options"
import { promoProfiles } from "@/server/browser/schema"
import { customShellUsers } from "@/server/schema"

/**
 * Promo's own social tables. This file belongs to the app, not the shell — the
 * shell's tables live in `@/server/schema`, which an app never edits, so the
 * app's tables get a schema module of their own. The matching SQL is
 * `drizzle/0091_promo_reddit.sql`, with the account's link to its browser
 * profile added by `drizzle/0094_promo_browser_profiles.sql`.
 *
 * The shape follows one decision. Reddit answers a plain request with a 403,
 * answers its own search page with a JavaScript puzzle instead of results, and
 * closes its public API in March 2027. So every read and every post goes
 * through an isolated browser. The browser's own tables, the proxies, the
 * profiles and the open browsers, are in `@/server/browser/schema`, because
 * they belong to no network. These describe the accounts, the posts found and
 * what was written back.
 *
 * Everything is scoped by user id rather than workspace: promo is one site.
 */

/**
 * How the AI should write: the voice, the product and the rules. Any number of
 * accounts on any network may share one. The SQL is
 * `drizzle/0096_promo_voices.sql`.
 */
export const promoVoices = pgTable(
  "promo_voices",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 120 }).notNull(),
    voice: text("voice").notNull().default(""),
    product: text("product").notNull().default(""),
    commentRules: text("comment_rules").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("ix_promo_voices_user").on(table.userId)]
)

/**
 * The account posts go out from.
 *
 * The account owns neither its browser nor its words. It points at a browser
 * profile, which holds the proxy, the identity and the cookies, and at a voice,
 * which holds what the AI is told. The table still has `proxy_id`,
 * `fingerprint`, `voice`, `product` and `comment_rules` from before those
 * moves. They are kept, as every stored column is, and nothing reads them any
 * more, which is why they are not listed here.
 */
export const promoAccounts = pgTable(
  "promo_accounts",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    /** 'reddit' today. The other networks share this table when they land. */
    platform: varchar("platform", { length: 30 }).notNull().default("reddit"),
    /**
     * The handle without the u/ prefix. Written by the browser program after
     * every job it runs on this network, so a dashboard reads it here instead
     * of asking a browser. Empty means signed out, or never read.
     */
    handle: varchar("handle", { length: 120 }).notNull().default(""),
    /**
     * The browser profile this account signs in inside. Null when the profile
     * was deleted, which leaves the account and refuses its jobs with a reason
     * a person can act on.
     */
    profileId: varchar("profile_id", { length: 36 }).references(
      () => promoProfiles.id,
      { onDelete: "set null" }
    ),
    /** True when the site was last seen asking the browser something only a person can answer. */
    blocked: boolean("blocked").notNull().default(false),
    /** What it was asking, in the browser's words. Empty when not blocked. */
    blockedReason: text("blocked_reason").notNull().default(""),
    /** When the browser program last read the handle and the block. Null means never. */
    stateReadAt: timestamp("state_read_at", { withTimezone: true }),
    /** What the AI writes with. Null when its voice was deleted, or none was picked. */
    voiceId: varchar("voice_id", { length: 36 }).references(() => promoVoices.id, {
      onDelete: "set null",
    }),
    /**
     * Last karma reading, or null when nothing has read it. Never 0 as a
     * stand-in: no karma and unknown karma are different answers.
     */
    karma: integer("karma"),
    lastPostedAt: timestamp("last_posted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("ix_promo_accounts_user").on(table.userId),
    /**
     * One account per network inside a profile. Two Reddit accounts in one
     * browser would be signed in over each other; a Reddit account and an
     * Instagram account sharing one is fine.
     */
    uniqueIndex("ux_promo_accounts_profile_platform")
      .on(table.profileId, table.platform)
      .where(sql`${table.profileId} IS NOT NULL`),
  ]
)

/**
 * A saved search. Running it again adds whatever is new and leaves every
 * decision already made about the old posts alone.
 */
export const promoKeywords = pgTable(
  "promo_keywords",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    term: varchar("term", { length: 200 }).notNull(),
    /** Subreddits to search inside, or an empty list for all of Reddit. */
    subreddits: jsonb("subreddits").$type<string[]>().notNull().default([]),
    /**
     * 'relevance' by default, which was measured rather than guessed. Against
     * "project management tool" over one week on 5 Oct 2026, relevance put 25
     * of 25 posts on topic with a typical 8 comments; 'new' put 0 of 25 on
     * topic; 'comments' and 'top' were on topic but typically 538 and 301
     * replies deep, where nobody reads a new comment. `rank.ts` reorders what
     * relevance returns.
     */
    sort: varchar("sort", { length: 20 })
      .$type<RedditSort>()
      .notNull()
      .default("relevance"),
    timeWindow: varchar("time_window", { length: 10 })
      .$type<RedditWindow>()
      .notNull()
      .default("week"),
    enabled: boolean("enabled").notNull().default(true),
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("ux_promo_keywords_user_term").on(
      table.userId,
      sql`lower(${table.term})`
    ),
  ]
)

/**
 * One run of one keyword. Kept so that "nothing found" and "the search
 * failed" stay different answers on screen.
 */
export const promoSearches = pgTable(
  "promo_searches",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    keywordId: varchar("keyword_id", { length: 36 })
      .notNull()
      .references(() => promoKeywords.id, { onDelete: "cascade" }),
    status: varchar("status", { length: 20 })
      .$type<SearchStatus>()
      .notNull()
      .default("running"),
    seenCount: integer("seen_count").notNull().default(0),
    newCount: integer("new_count").notNull().default(0),
    lastError: text("last_error").notNull().default(""),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (table) => [
    index("ix_promo_searches_keyword").on(
      table.keywordId,
      table.startedAt.desc()
    ),
  ]
)

/** A Reddit post worth looking at, and what was decided about it. */
export const promoFinds = pgTable(
  "promo_finds",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    keywordId: varchar("keyword_id", { length: 36 })
      .notNull()
      .references(() => promoKeywords.id, { onDelete: "cascade" }),
    /** The run that first saw it. A later run updates the figures, not this. */
    firstSearchId: varchar("first_search_id", { length: 36 }).references(
      () => promoSearches.id,
      { onDelete: "set null" }
    ),
    /** Reddit's own id for the post, like "t3_1abc234". */
    redditId: varchar("reddit_id", { length: 40 }).notNull(),
    /** The path after reddit.com, so the full address is built in one place. */
    permalink: varchar("permalink", { length: 600 }).notNull(),
    /** Without the r/ prefix. */
    subreddit: varchar("subreddit", { length: 120 }).notNull().default(""),
    title: varchar("title", { length: 600 }).notNull().default(""),
    /** The post's own words. Empty for a link or image post. */
    body: text("body").notNull().default(""),
    author: varchar("author", { length: 120 }).notNull().default(""),
    score: integer("score").notNull().default(0),
    commentCount: integer("comment_count").notNull().default(0),
    postedAt: timestamp("posted_at", { withTimezone: true }),
    /**
     * Where Reddit put it in its own relevance order, 0 being first. The only
     * measure of relevance there is, and the ranking leans on it because
     * upvotes turned out to measure subreddit size instead. Added by
     * `drizzle/0092_promo_reddit_relevance.sql`.
     */
    redditPosition: integer("reddit_position").notNull().default(0),
    /** How worth commenting it looked when last read. See `rank.ts`. */
    rank: numeric("rank", { precision: 10, scale: 4, mode: "number" })
      .notNull()
      .default(0),
    status: varchar("status", { length: 20 })
      .$type<FindStatus>()
      .notNull()
      .default("new"),
    /**
     * Null until the thread has been opened, which is how the screen tells
     * "not read yet" from "read, and it had no replies".
     */
    thread: jsonb("thread").$type<FindThread | null>(),
    threadReadAt: timestamp("thread_read_at", { withTimezone: true }),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    /** One post appears once per keyword, so a re-run updates rather than duplicates. */
    uniqueIndex("ux_promo_finds_keyword_post").on(
      table.keywordId,
      table.redditId
    ),
    index("ix_promo_finds_keyword_rank").on(table.keywordId, table.rank.desc()),
    index("ix_promo_finds_user_status").on(table.userId, table.status),
  ]
)

/**
 * What the AI wrote. Kept after posting, so what was asked for and what went
 * out can be compared later.
 */
export const promoDrafts = pgTable(
  "promo_drafts",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    findId: varchar("find_id", { length: 36 })
      .notNull()
      .references(() => promoFinds.id, { onDelete: "cascade" }),
    text: text("text").notNull(),
    /** Straight off the shell's fixed lists in `@/lib/ai/ai-models`. */
    provider: varchar("provider", { length: 30 }).notNull().default(""),
    model: varchar("model", { length: 120 }).notNull().default(""),
    status: varchar("status", { length: 20 })
      .$type<DraftStatus>()
      .notNull()
      .default("draft"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("ix_promo_drafts_find").on(table.findId, table.createdAt.desc()),
  ]
)

/**
 * A comment that went out, or tried to. One row per attempt, so a failure
 * leaves a record instead of disappearing.
 */
export const promoComments = pgTable(
  "promo_comments",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    findId: varchar("find_id", { length: 36 })
      .notNull()
      .references(() => promoFinds.id, { onDelete: "cascade" }),
    /** Null when the text was written by hand rather than from a draft. */
    draftId: varchar("draft_id", { length: 36 }).references(
      () => promoDrafts.id,
      { onDelete: "set null" }
    ),
    accountId: varchar("account_id", { length: 36 })
      .notNull()
      .references(() => promoAccounts.id, { onDelete: "cascade" }),
    /** Exactly what was sent, which may differ from the draft after an edit. */
    text: text("text").notNull(),
    status: varchar("status", { length: 20 })
      .$type<"posted" | "failed">()
      .notNull()
      .default("posted"),
    /** Where it landed on Reddit. Empty on a failure. */
    commentUrl: varchar("comment_url", { length: 600 }).notNull().default(""),
    lastError: text("last_error").notNull().default(""),
    postedAt: timestamp("posted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("ix_promo_comments_find").on(table.findId, table.postedAt.desc()),
    index("ix_promo_comments_account").on(
      table.accountId,
      table.postedAt.desc()
    ),
  ]
)

/**
 * The work queue. A search through a real browser takes tens of seconds, far
 * too long to ride the shell's fifteen-second ticker, so the browser runs in a
 * process of its own and claims jobs from here.
 *
 * The claiming shape copies the shell's own, proved in
 * `@/server/automations/engine`: a claim token, a `claimedAt` that expires so
 * a worker that vanished hands its job back, and an attempt counter so an
 * abandoned job stops rather than being reclaimed forever in silence.
 */
export const promoJobs = pgTable(
  "promo_jobs",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    kind: varchar("kind", { length: 30 }).$type<JobKind>().notNull(),
    /**
     * The profile the job works in. Jobs in one lane run one at a time, in
     * order; jobs in different lanes run side by side. Null on jobs from
     * before lanes, each of which is its own.
     */
    lane: varchar("lane", { length: 36 }),
    /** A keyword id, a find id, or a find id plus the text to post. */
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    status: varchar("status", { length: 20 })
      .$type<JobStatus>()
      .notNull()
      .default("queued"),
    claimToken: varchar("claim_token", { length: 36 }),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (table) => [
    /** Oldest queued first, which is also the order the buttons were pressed. */
    index("ix_promo_jobs_claimable").on(table.status, table.createdAt),
  ]
)
