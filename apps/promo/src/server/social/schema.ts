import {
  type AnyPgColumn,
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

import type { AccountStatus } from "@/lib/social/account-status"
import type { AccountImportance } from "@/lib/social/importance"
import {
  type DraftRewrite,
  type DraftStatus,
  type FindStatus,
  type ProfileCheck,
  type FindThread,
  type IncomingReply,
  type LinkPage,
  type JobKind,
  type JobStatus,
  type SearchStatus,
  type SubredditRule,
  type SubredditRulesStatus,
  type VisitRecord,
} from "@/lib/social/options"
import {
  type RedditSort,
  type RedditWindow,
} from "@/lib/social/reddit/options"
import { promoProfiles } from "@/server/browser/schema"
import { promoPhones } from "@/server/phones/schema"
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
 * How the AI should write: the voice and the rules. Any number of accounts on
 * any network may share one. The SQL is `drizzle/0096_promo_voices.sql`.
 *
 * The table still has `product`, the "what you make" box, from before the
 * project description replaced it (`drizzle/0108_promo_projects.sql`). It is
 * kept, as every stored column is, and nothing reads it any more, which is why
 * it is not listed here.
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
 * One thing being promoted: its description, its Reddit accounts and its
 * keywords. The description is what the AI is told about what you make, in
 * place of the voice's old product box. Tyler, 12 Oct 2026: keywords belong to
 * the project, and an account belongs to one project only. The SQL is
 * `drizzle/0108_promo_projects.sql`.
 */
export const promoProjects = pgTable(
  "promo_projects",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 120 }).notNull(),
    description: text("description").notNull().default(""),
    /**
     * The project's picture, a media address, or "" for none. Added by
     * `drizzle/0111_promo_project_image.sql`.
     */
    imageUrl: varchar("image_url", { length: 2048 }).notNull().default(""),
    /**
     * When the whole project was paused: none of its accounts posts, warms
     * up or takes a health reading until it is resumed. Null is running.
     * Added by `drizzle/0110_promo_new_features.sql`.
     */
    pausedAt: timestamp("paused_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("ix_promo_projects_user").on(table.userId)]
)

/**
 * The account posts go out from.
 *
 * The account owns neither its browser nor its words. It points at a browser
 * profile, which holds the proxy, the identity and the cookies, or at a phone
 * on the rack, and at a voice, which holds what the AI is told. The table still has `proxy_id`,
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
    /**
     * The phone this account runs on, in place of a browser profile. Never
     * both: the database refuses an account with the two set. Added by
     * `drizzle/0114_promo_phones.sql`.
     */
    phoneId: varchar("phone_id", { length: 36 }).references(() => promoPhones.id, {
      onDelete: "set null",
    }),
    /**
     * The authenticator secret, encrypted with the server's key, or empty for
     * none. Never sent to a page: only the current code is. Added by
     * `drizzle/0115_promo_phone_jobs.sql`.
     */
    totpSecretEncrypted: text("totp_secret_encrypted").notNull().default(""),
    /**
     * 'important' or 'throwaway'. Every account starts as throwaway until a
     * person marks it, and important is one way: an important account only
     * ever runs on a phone, and is never marked throwaway again (Tyler, 14
     * Oct 2026). Promo keeps the two groups apart (`apart.ts`). Added by
     * `drizzle/0117_promo_phone_identity.sql`, as is the column below.
     */
    importance: varchar("importance", { length: 12 }).$type<AccountImportance>().notNull().default("throwaway"),
    /**
     * The phone a throwaway is being moved to from its browser profile. The
     * move finishes when that phone reads the account signed in.
     */
    movingToPhoneId: varchar("moving_to_phone_id", { length: 36 }).references(() => promoPhones.id, {
      onDelete: "set null",
    }),
    /** True when the site was last seen asking the browser something only a person can answer. */
    blocked: boolean("blocked").notNull().default(false),
    /** What it was asking, in the browser's words. Empty when not blocked. */
    blockedReason: text("blocked_reason").notNull().default(""),
    /**
     * When a phone found the app showing a suspended, locked or "confirm
     * it's you" screen. The account's jobs are refused until a person lets
     * it run again; `blockedReason` holds the screen's own words. Added by
     * `drizzle/0116_promo_phone_health.sql`.
     */
    banScreenAt: timestamp("ban_screen_at", { withTimezone: true }),
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
    /**
     * When Reddit says the account was made, and when that and the karma were
     * last read. Both null until a reading. Added by
     * `drizzle/0099_promo_account_health.sql`.
     */
    redditCreatedAt: timestamp("reddit_created_at", { withTimezone: true }),
    karmaReadAt: timestamp("karma_read_at", { withTimezone: true }),
    /** The profile read signed in and signed out. Null until one is taken. */
    profileCheck: jsonb("profile_check").$type<ProfileCheck | null>(),
    lastPostedAt: timestamp("last_posted_at", { withTimezone: true }),
    /**
     * The subreddits the daily warm-up joined, lower case, so it never asks to
     * join one twice. Added by `drizzle/0106_promo_behaviour.sql`.
     */
    joinedSubreddits: jsonb("joined_subreddits").$type<string[]>().notNull().default([]),
    /**
     * The project it comments for, or null for none. Deleting a project is
     * refused while it holds accounts in use. Added by
     * `drizzle/0108_promo_projects.sql`, as are the two below.
     */
    projectId: varchar("project_id", { length: 36 }).references(() => promoProjects.id, {
      onDelete: "set null",
    }),
    /**
     * A status a person chose on the Reddit accounts dashboard, outranking the
     * one the app works out. Null lets the app decide. It is only shown: Post
     * and the warm-up go by the account's age, never by this.
     */
    statusOverride: varchar("status_override", { length: 20 }).$type<AccountStatus>(),
    /** When it was retired: out of every list and picker, never posts, never warms up. */
    retiredAt: timestamp("retired_at", { withTimezone: true }),
    /**
     * When it was paused: it stays in every list, and does not post, warm up
     * or take a health reading until it is resumed. Unlike retiring, a pause
     * is meant to end. Added by `drizzle/0110_promo_new_features.sql`.
     */
    pausedAt: timestamp("paused_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("ix_promo_accounts_user").on(table.userId),
    index("ix_promo_accounts_project").on(table.projectId),
    /**
     * One account per network inside a profile. Two Reddit accounts in one
     * browser would be signed in over each other; a Reddit account and an
     * Instagram account sharing one is fine.
     */
    uniqueIndex("ux_promo_accounts_profile_platform")
      .on(table.profileId, table.platform)
      .where(sql`${table.profileId} IS NOT NULL`),
    /** The same rule on a phone: one account per network per phone. */
    uniqueIndex("ux_promo_accounts_phone_platform")
      .on(table.phoneId, table.platform)
      .where(sql`${table.phoneId} IS NOT NULL`),
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
    /**
     * The project it searches for. Every account in the project sees its
     * posts. A project holding keywords cannot be deleted.
     */
    projectId: varchar("project_id", { length: 36 })
      .notNull()
      .references(() => promoProjects.id, { onDelete: "restrict" }),
    /** The words. Empty for a watch, which names one subreddit instead. */
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
    index("ix_promo_keywords_project").on(table.projectId),
    /**
     * One saved search per set of words in a project, compared without case.
     * Two projects may search the same words. Per project since
     * `drizzle/0108_promo_projects.sql`.
     */
    uniqueIndex("ux_promo_keywords_project_term")
      .on(table.projectId, sql`lower(${table.term})`)
      .where(sql`${table.term} <> ''`),
    /**
     * A watch: no words and exactly one subreddit, listing its new posts. One
     * per subreddit in a project.
     */
    uniqueIndex("ux_promo_keywords_project_watch")
      .on(table.projectId, sql`lower(${table.subreddits}->>0)`)
      .where(sql`${table.term} = ''`),
  ]
)

/**
 * Subreddits never shown again, across every keyword. A blocked subreddit's
 * stored posts stay in `promo_finds` and are left out when the list is read,
 * so unblocking brings them back. The SQL is
 * `drizzle/0100_promo_blocked_subreddits.sql`.
 */
export const promoBlockedSubreddits = pgTable(
  "promo_blocked_subreddits",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    /** Without the r/ prefix. Compared without case, as Reddit does. */
    subreddit: varchar("subreddit", { length: 120 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("ux_promo_blocked_subreddits_user_name").on(
      table.userId,
      sql`lower(${table.subreddit})`
    ),
  ]
)

/**
 * The rules a subreddit has posted, read once and kept, so they are shown
 * before a comment is written and handed to the AI. Rules barely change, so a
 * reading stands for weeks. The SQL is `drizzle/0103_promo_subreddit_rules.sql`.
 */
export const promoSubredditRules = pgTable(
  "promo_subreddit_rules",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    /** Without the r/ prefix. Compared without case, as Reddit does. */
    subreddit: varchar("subreddit", { length: 120 }).notNull(),
    status: varchar("status", { length: 20 }).$type<SubredditRulesStatus>().notNull(),
    rules: jsonb("rules").$type<SubredditRule[]>().notNull().default([]),
    /** Why Reddit would not answer. Empty unless the status is 'failed'. */
    lastError: text("last_error").notNull().default(""),
    readAt: timestamp("read_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("ux_promo_subreddit_rules_user_name").on(
      table.userId,
      sql`lower(${table.subreddit})`
    ),
  ]
)

/**
 * The Reddit settings that belong to the person rather than to one account.
 * No row means the defaults. The SQL is `drizzle/0104_promo_tidy_old_posts.sql`.
 */
export const promoRedditSettings = pgTable("promo_reddit_settings", {
  userId: varchar("user_id", { length: 36 })
    .primaryKey()
    .references(() => customShellUsers.id, { onDelete: "cascade" }),
  /**
   * Days a post can go unseen by any search before the tidy-up deletes it if
   * skipped, or clears its stored replies if still open. 0 switches it off.
   */
  tidyAfterDays: integer("tidy_after_days").notNull().default(30),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

/**
 * How every account behaves, whatever network it is on: the signed-out reader
 * browser that searches for it, its waking hours, its warm-up, and the pace
 * for young accounts. No row means the defaults and no reader. The SQL is
 * `drizzle/0106_promo_behaviour.sql`; the bounds are `BEHAVIOUR_RANGES`.
 */
export const promoBehaviourSettings = pgTable("promo_behaviour_settings", {
  userId: varchar("user_id", { length: 36 })
    .primaryKey()
    .references(() => customShellUsers.id, { onDelete: "cascade" }),
  /** The profile signed in to nobody that runs every search. Null means none picked. */
  readerProfileId: varchar("reader_profile_id", { length: 36 }).references(
    () => promoProfiles.id,
    { onDelete: "set null" }
  ),
  /** Minutes past midnight, in the account's own time zone. */
  wakeFromMinute: integer("wake_from_minute").notNull().default(480),
  wakeUntilMinute: integer("wake_until_minute").notNull().default(1380),
  /** Days from the day Reddit made the account before it may comment. 0 is off. */
  warmUpDays: integer("warm_up_days").notNull().default(3),
  /** Younger than this many days, the per-hour and per-day limits refuse Post. */
  youngDays: integer("young_days").notNull().default(90),
  youngPerHour: integer("young_per_hour").notNull().default(2),
  youngPerDay: integer("young_per_day").notNull().default(6),
  /** Past this many comments in an hour, any account's composer warns. It never refuses. */
  warnPerHour: integer("warn_per_hour").notNull().default(4),
  /**
   * Every keyword searches again by itself this many hours after its last
   * search, inside the reader's waking hours. 0 is never. Added by
   * `drizzle/0110_promo_new_features.sql`.
   */
  searchEveryHours: integer("search_every_hours").notNull().default(4),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

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

/**
 * A Reddit post worth looking at, and what was decided about it.
 *
 * Most are found by a keyword. Two kinds belong to no keyword, and each has
 * exactly one of the two columns after it set: a post in an account's own
 * everyday subreddits, to answer with help and no product, and a subreddit's
 * self-promotion thread found for a project. Added by
 * `drizzle/0110_promo_new_features.sql`.
 */
export const promoFinds = pgTable(
  "promo_finds",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    /** Null for a help-only post or a self-promotion thread. */
    keywordId: varchar("keyword_id", { length: 36 }).references(() => promoKeywords.id, {
      onDelete: "cascade",
    }),
    /** The account whose everyday subreddits this post came from. Only that account answers it. */
    helpAccountId: varchar("help_account_id", { length: 36 }).references(
      (): AnyPgColumn => promoAccounts.id,
      { onDelete: "cascade" }
    ),
    /** The project this self-promotion thread was found for. */
    threadProjectId: varchar("thread_project_id", { length: 36 }).references(
      () => promoProjects.id,
      { onDelete: "cascade" }
    ),
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
    /**
     * Where a link post points, outside Reddit. Empty for a post with words of
     * its own, a picture, a video or a link back into Reddit. The SQL for this
     * and the three below is `drizzle/0107_promo_link_pages.sql`.
     */
    linkUrl: varchar("link_url", { length: 2000 }).notNull().default(""),
    /**
     * The linked page's title and opening paragraph, read so a post with no
     * words still has something to answer. Never the post's own words.
     */
    linkPage: jsonb("link_page").$type<LinkPage | null>(),
    /** Null until the page has been tried, so "not read yet" stays its own answer. */
    linkReadAt: timestamp("link_read_at", { withTimezone: true }),
    /** Why the page could not be read, including an address inside the network. */
    linkError: text("link_error").notNull().default(""),
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
    uniqueIndex("ux_promo_finds_help_post")
      .on(table.helpAccountId, table.redditId)
      .where(sql`${table.helpAccountId} IS NOT NULL`),
    uniqueIndex("ux_promo_finds_thread_post")
      .on(table.threadProjectId, table.redditId)
      .where(sql`${table.threadProjectId} IS NOT NULL`),
    index("ix_promo_finds_user_status").on(table.userId, table.status),
    /** What the tidy-up walks, oldest first. */
    index("ix_promo_finds_status_seen").on(table.status, table.lastSeenAt),
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
    /**
     * The Reddit id of the reply this draft answers, or "" for a draft of a
     * comment on the post itself, so neither shows in the other's list.
     * Added by `drizzle/0109_promo_reply_to_a_reply.sql`.
     */
    replyToId: varchar("reply_to_id", { length: 20 }).notNull().default(""),
    /**
     * How the words in the box were rewritten to make this draft, or "" for
     * one from Write with AI. A rewrite is never offered as a draft tile.
     * Added by `drizzle/0110_promo_new_features.sql`.
     */
    rewrite: varchar("rewrite", { length: 20 }).$type<DraftRewrite | "">().notNull().default(""),
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
    /**
     * True when a person marked it as not a good example of how they write,
     * so drafts stop copying its voice. The record itself stays. Added by
     * `drizzle/0101_promo_comment_examples.sql`.
     */
    notExample: boolean("not_example").notNull().default(false),
    /**
     * The last reading of the comment on Reddit, all null until one is taken.
     * Null is "not read yet", never 0 or "gone": a comment nobody has checked
     * must not read as one with no replies. Upvotes stay null after a reading
     * while Reddit hides the score. `checkedAs` is whose view decided whether
     * it is still there: "stranger", which shows a moderator's removal, or
     * "you" when Reddit refused the stranger. Added by
     * `drizzle/0105_promo_comment_checks.sql`.
     */
    upvotes: integer("upvotes"),
    replyCount: integer("reply_count"),
    stillVisible: boolean("still_visible"),
    checkedAs: varchar("checked_as", { length: 10 }).$type<"stranger" | "you">(),
    checkedAt: timestamp("checked_at", { withTimezone: true }),
    /**
     * The visit around the comment as the browser reported it: feed time
     * before and after, posts opened, and how it reached the post. Null on a
     * failure and on comments from before visits. Added by
     * `drizzle/0106_promo_behaviour.sql`.
     */
    visit: jsonb("visit").$type<VisitRecord | null>(),
    /**
     * The replies directly under this comment, as the last check read them.
     * Null until a check has read them, which is not the same as none.
     * Added by `drizzle/0109_promo_reply_to_a_reply.sql`.
     */
    incomingReplies: jsonb("incoming_replies").$type<IncomingReply[] | null>(),
    /**
     * Set on a reply the app sent: the app's own comment it sits under, and
     * the reply it answers as that reply read when the answer was written.
     * Both null on a comment on the post itself.
     */
    parentId: varchar("parent_id", { length: 36 }).references(
      (): AnyPgColumn => promoComments.id,
      { onDelete: "cascade" }
    ),
    replyTo: jsonb("reply_to").$type<IncomingReply | null>(),
    /**
     * When the app deleted the comment from Reddit on a person's press. When
     * the app edited it, and the words it first went out with, null until
     * the first edit. All added by `drizzle/0110_promo_new_features.sql`.
     */
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    editedAt: timestamp("edited_at", { withTimezone: true }),
    originalText: text("original_text"),
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
    index("ix_promo_comments_parent").on(table.parentId),
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
     * The profile the job works in, or `phone:` and the phone's id. Jobs in
     * one lane run one at a time, in order; jobs in different lanes run side
     * by side. Null on jobs from before lanes, each of which is its own.
     * Widened to 64 by `drizzle/0115_promo_phone_jobs.sql` for the phones.
     */
    lane: varchar("lane", { length: 64 }),
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
    /**
     * Not started before this time. A comment pressed outside the account's
     * waking hours waits for its morning; the daily warm-up waits for a time
     * picked inside them. Null starts at once. Added by
     * `drizzle/0106_promo_behaviour.sql`.
     */
    runAfter: timestamp("run_after", { withTimezone: true }),
    /**
     * A failed comment or post a person has dealt with, so it leaves the
     * Comments screen's Failed tab. Added by
     * `drizzle/0110_promo_new_features.sql`.
     */
    dismissedAt: timestamp("dismissed_at", { withTimezone: true }),
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

/**
 * Each running copy of the browser program, by the claim token it takes jobs
 * under. It writes `seenAt` every 15 seconds, so a stale one means the
 * program stopped and the jobs are only piling up. Machine-wide, not a
 * person's. The SQL is `drizzle/0112_promo_browser_program.sql`.
 */
export const promoBrowserProgram = pgTable("promo_browser_program", {
  id: varchar("id", { length: 36 }).primaryKey(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  seenAt: timestamp("seen_at", { withTimezone: true }).notNull().defaultNow(),
  /** How many jobs it may run side by side right now: the open-browser limit. */
  lanes: integer("lanes").notNull().default(0),
})

/**
 * A post of your own, sent to a subreddit from one account because a person
 * pressed Post. One row per attempt, like a comment, so a failure leaves a
 * record. The SQL is `drizzle/0110_promo_new_features.sql`.
 */
export const promoPosts = pgTable(
  "promo_posts",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    accountId: varchar("account_id", { length: 36 })
      .notNull()
      .references(() => promoAccounts.id, { onDelete: "cascade" }),
    /** The project it was written for, when the account was in one. */
    projectId: varchar("project_id", { length: 36 }).references(() => promoProjects.id, {
      onDelete: "set null",
    }),
    /** Without the r/ prefix. */
    subreddit: varchar("subreddit", { length: 120 }).notNull(),
    title: varchar("title", { length: 300 }).notNull(),
    body: text("body").notNull().default(""),
    status: varchar("status", { length: 20 }).$type<"posted" | "failed">().notNull().default("posted"),
    /** Where it landed on Reddit. Empty on a failure. */
    postUrl: varchar("post_url", { length: 600 }).notNull().default(""),
    lastError: text("last_error").notNull().default(""),
    visit: jsonb("visit").$type<VisitRecord | null>(),
    postedAt: timestamp("posted_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("ix_promo_posts_user").on(table.userId, table.postedAt.desc())]
)

/**
 * Where each of Promo's bell notices opens. The notice is the shell's own
 * row; this only remembers its address, because a notice's id is worked out
 * from what it is about and so cannot carry one. The SQL is
 * `drizzle/0110_promo_new_features.sql`.
 */
export const promoNotices = pgTable("promo_notices", {
  id: varchar("id", { length: 36 }).primaryKey(),
  userId: varchar("user_id", { length: 36 })
    .notNull()
    .references(() => customShellUsers.id, { onDelete: "cascade" }),
  kind: varchar("kind", { length: 30 }).notNull(),
  href: varchar("href", { length: 600 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})
