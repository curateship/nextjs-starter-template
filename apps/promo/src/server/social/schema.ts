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
  type ProxyProtocol,
  type ProxyTestResult,
  type SearchStatus,
  type SessionStatus,
} from "@/lib/social/options"
import {
  type RedditSort,
  type RedditWindow,
} from "@/lib/social/reddit/options"
import { customShellUsers } from "@/server/schema"

/**
 * Promo's own tables. This file belongs to the app, not the shell — the
 * shell's tables live in `@/server/schema`, which an app never edits, so the
 * app's tables get a schema module of their own. The matching SQL is
 * `drizzle/0091_promo_reddit.sql`.
 *
 * The shape follows one decision. Reddit answers a plain request with a 403,
 * answers its own search page with a JavaScript puzzle instead of results, and
 * closes its public API in March 2027. So every read and every post goes
 * through one isolated browser, and these tables describe that browser, the
 * posts it found, and what was written back.
 *
 * Everything is scoped by user id rather than workspace: promo is one site.
 */

/** A proxy the browser routes through. */
export const promoProxies = pgTable(
  "promo_proxies",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    label: varchar("label", { length: 120 }).notNull().default(""),
    /** 'http', 'https' or 'socks5'. */
    protocol: varchar("protocol", { length: 20 })
      .$type<ProxyProtocol>()
      .notNull()
      .default("http"),
    host: varchar("host", { length: 255 }).notNull(),
    port: integer("port").notNull(),
    username: varchar("username", { length: 255 }).notNull().default(""),
    /**
     * AES-256-GCM through the shell's own `encryptSecret`, as
     * `iv:authTag:ciphertext`. Never sent to a browser: the read that builds a
     * row for the screen leaves this field out entirely.
     */
    passwordEncrypted: text("password_encrypted").notNull().default(""),
    /**
     * Two-letter country of the exit IP, written by a successful test rather
     * than typed. The fingerprint's timezone follows it, because a US exit on
     * a Moscow clock is an instant tell.
     */
    country: varchar("country", { length: 2 }).notNull().default(""),
    lastTestedAt: timestamp("last_tested_at", { withTimezone: true }),
    /** The whole answer from the last test, kept so a screen can show any part. */
    lastTestResult: jsonb("last_test_result").$type<ProxyTestResult | null>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("ix_promo_proxies_user").on(table.userId)]
)

/**
 * The account posts go out from. Build one has one, on Reddit, so the voice
 * and the product sit here as columns rather than in a personas table. A
 * second account is when they move out.
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
    /** The handle without the u/ prefix. Empty until a sign-in reports it. */
    handle: varchar("handle", { length: 120 }).notNull().default(""),
    /** Null means the account browses from this machine's own IP. */
    proxyId: varchar("proxy_id", { length: 36 }).references(
      () => promoProxies.id,
      { onDelete: "set null" }
    ),
    /** The generated identity the browser launches with, whole in one column. */
    fingerprint: jsonb("fingerprint").$type<Record<string, unknown> | null>(),
    voice: text("voice").notNull().default(""),
    product: text("product").notNull().default(""),
    commentRules: text("comment_rules").notNull().default(""),
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
  (table) => [index("ix_promo_accounts_user").on(table.userId)]
)

/**
 * A live isolated browser: one container, one Docker volume holding the
 * cookies, one proxy. The three partial unique indexes are the locks. The
 * first stops a second container ever opening the same profile volume, which
 * would corrupt it. The other two make a port claim an insert that can lose,
 * so two launches racing never start two containers on one port.
 */
export const promoBrowserSessions = pgTable(
  "promo_browser_sessions",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    accountId: varchar("account_id", { length: 36 })
      .notNull()
      .references(() => promoAccounts.id, { onDelete: "cascade" }),
    status: varchar("status", { length: 20 })
      .$type<SessionStatus>()
      .notNull()
      .default("starting"),
    containerId: varchar("container_id", { length: 80 }).notNull().default(""),
    /** Survives the container, which is the point: the cookies live here. */
    volumeName: varchar("volume_name", { length: 120 }).notNull().default(""),
    /** Where the command server answers, bound to 127.0.0.1 only. */
    commandPort: integer("command_port"),
    /** Where the video stream answers, so a person can watch and take over. */
    streamPort: integer("stream_port"),
    webrtcPort: integer("webrtc_port"),
    lastError: text("last_error").notNull().default(""),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    /**
     * Moved forward by every command. An hour of silence gets the container
     * reaped, because an idle Camoufox still holds about 1.5GB.
     */
    lastActivityAt: timestamp("last_activity_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("ux_promo_sessions_live_account")
      .on(table.accountId)
      .where(sql`${table.status} IN ('starting', 'running')`),
    uniqueIndex("ux_promo_sessions_live_command_port")
      .on(table.commandPort)
      .where(
        sql`${table.status} IN ('starting', 'running') AND ${table.commandPort} IS NOT NULL`
      ),
    uniqueIndex("ux_promo_sessions_live_stream_port")
      .on(table.streamPort)
      .where(
        sql`${table.status} IN ('starting', 'running') AND ${table.streamPort} IS NOT NULL`
      ),
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
