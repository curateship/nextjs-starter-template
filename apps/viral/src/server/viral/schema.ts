import { sql } from "drizzle-orm"
import {
  bigint,
  boolean,
  date,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core"

import type { Social, TextSocial, WatchKind } from "@/lib/viral/socials"
import type { AnalysisPieces } from "@/lib/viral/analysis"
import type { VaultStatus, VaultStats } from "@/lib/viral/vault"
import type { PromoPostNetwork, PromoReadKind, PromoReadNetwork, PromoReadStatus, PromoSendStatus, SocialPostReply } from "@/lib/viral/promo-link"
import type { FormatPart } from "@/lib/viral/formats"
import { customShellMedia, customShellUsers } from "@/server/schema"

/**
 * The Viral app's own tables (drizzle/0098_viral_research.sql). The research
 * tables were copied from Video's Viral section with `video_viral_*` renamed
 * `viral_*`; the vault, the analyses, the channel figures and the sends are
 * new here. The shell's tables stay in `src/server/schema.ts`.
 */

/**
 * One creator somebody follows, on one platform. The handle is stored
 * lowercased and matched that way, so adding @Alice and @alice twice is one
 * creator rather than two — the same rule the old app matched on.
 *
 * Deleting a creator takes its saved posts with it but leaves any saved
 * breakdown standing: the archive stores the channel as plain text and has no
 * key pointing back here, so a video you studied survives losing interest in
 * whoever made it.
 */
export const viralCreators = pgTable(
  "viral_creators",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    ownerId: varchar("owner_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    platform: varchar("platform", { length: 20 }).notNull(),
    handle: varchar("handle", { length: 100 }).notNull(),
    /**
     * YouTube's own channel id, kept because the Data API needs it to list
     * uploads and resolving a handle to one costs a unit. Null on the other
     * two platforms, which are read by their handle.
     */
    platformChannelId: varchar("platform_channel_id", { length: 100 }),
    displayName: text("display_name"),
    followerCount: bigint("follower_count", { mode: "number" }),
    avatarStoragePath: text("avatar_storage_path"),
    profileUrl: text("profile_url").notNull(),
    /** Off means the watch timer skips this creator but keeps its posts. */
    watch: boolean("watch").notNull().default(true),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
    /** "viral" when the Follow button on the Viral page added it. */
    source: varchar("source", { length: 20 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("ux_viral_creators_owner_platform_handle").on(
      table.ownerId,
      table.platform,
      sql`lower(${table.handle})`
    ),
    index("ix_viral_creators_watch").on(table.watch, table.lastCheckedAt),
  ]
)

/**
 * One video a followed creator posted, as the watch timer found it. Metadata
 * only — no file is ever downloaded to make one of these rows, which is what
 * keeps the timer cheap enough to run unattended.
 *
 * `firstSeenAt` exists because not every platform says when something was
 * posted; a project's grid orders by the posted date when there is one and by
 * when it was first seen when there is not, so a post never falls off the end.
 */
export const viralCreatorPosts = pgTable(
  "viral_creator_posts",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    ownerId: varchar("owner_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    creatorId: varchar("creator_id", { length: 36 })
      .notNull()
      .references(() => viralCreators.id, { onDelete: "cascade" }),
    platform: varchar("platform", { length: 20 }).notNull(),
    platformVideoId: varchar("platform_video_id", { length: 100 }).notNull(),
    url: text("url").notNull(),
    title: text("title"),
    thumbnailUrl: text("thumbnail_url"),
    durationSeconds: integer("duration_seconds"),
    views: bigint("views", { mode: "number" }),
    likes: bigint("likes", { mode: "number" }),
    comments: bigint("comments", { mode: "number" }),
    postedAt: timestamp("posted_at", { withTimezone: true }),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull(),
    /**
     * The app's own copy of the cover picture. TikTok and Instagram cover
     * addresses stop working after a set date, so the card shows this copy
     * whenever there is one.
     */
    thumbnailStoragePath: text("thumbnail_storage_path"),
    /** When the app last tried to keep a copy of the cover. */
    coverCheckedAt: timestamp("cover_checked_at", { withTimezone: true }),
    /** The TikTok sound under the post, such as "original sound", and who made it (0101). */
    soundName: text("sound_name"),
    soundArtist: text("sound_artist"),
  },
  (table) => [
    // The same video seen twice (two projects, a second tick) updates this row
    // rather than adding another. It is also the key the archive is joined on.
    uniqueIndex("ux_viral_creator_posts_owner_video").on(
      table.ownerId,
      table.platform,
      table.platformVideoId
    ),
    index("ix_viral_creator_posts_feed").on(table.ownerId, table.postedAt),
    index("ix_viral_creator_posts_creator").on(table.creatorId, table.postedAt),
  ]
)

/**
 * A video somebody pressed Download or AI analyse on: the downloaded file, and
 * what Gemini made of it.
 *
 * The status is the job. A worker claims a `waiting` row, downloads it, then
 * has Gemini watch it unless it was saved with Download alone, which stops at
 * `downloaded`. A restart puts an interrupted row back to `waiting`
 * — so closing the browser never strands a half-done job. A failure keeps its
 * reason in `error` and can be tried again.
 *
 * It has no key pointing at a creator on purpose. A saved video belongs to the
 * person who saved it, not to whoever is being followed this week, so deleting
 * a creator leaves it alone. The channel is kept as plain text instead.
 */
export const viralVideos = pgTable(
  "viral_videos",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    ownerId: varchar("owner_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    platform: varchar("platform", { length: 20 }).notNull(),
    platformVideoId: varchar("platform_video_id", { length: 100 }).notNull(),
    sourceUrl: text("source_url").notNull(),
    status: varchar("status", { length: 20 }).notNull(),
    /**
     * False when it was saved with Download alone: the worker stops at
     * `downloaded` and no AI runs. AI analyse sets it true.
     */
    wantsAnalysis: boolean("wants_analysis").notNull().default(true),
    error: text("error"),
    /** The downloaded file, once it is in the shell's library. */
    mediaId: varchar("media_id", { length: 36 }).references(
      () => customShellMedia.id,
      { onDelete: "set null" }
    ),
    thumbnailStoragePath: text("thumbnail_storage_path"),
    title: text("title"),
    channelName: text("channel_name"),
    /**
     * YouTube's channel id, or @handle on TikTok and Instagram, from yt-dlp.
     * A pasted video has no search result to take it from (drizzle/0136).
     */
    channelId: varchar("channel_id", { length: 100 }),
    /** The channel's followers, from yt-dlp. Null where the platform hides it. */
    subscribers: bigint("subscribers", { mode: "number" }),
    durationSeconds: integer("duration_seconds"),
    views: bigint("views", { mode: "number" }),
    likes: bigint("likes", { mode: "number" }),
    comments: bigint("comments", { mode: "number" }),
    postedAt: timestamp("posted_at", { withTimezone: true }),
    /** The transcript, parts and scene cuts, once Gemini has watched it. */
    breakdown: jsonb("breakdown"),
    /**
     * An Analyse with AI pressed before the breakdown was ready: the topic it
     * asked for and the project it was pressed in. The worker writes the
     * analysis once the breakdown lands, then clears this.
     */
    pendingAnalysis: jsonb("pending_analysis").$type<{ topic: string; projectId: string | null }>(),
    /** Why the last analysis could not be written, until the next one is. */
    analysisError: text("analysis_error"),
    /** Who is working on it now, and until when. Null means free to claim. */
    leaseToken: varchar("lease_token", { length: 36 }),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    /**
     * The Viral project whose Save & break down made it, so the breakdown's AI
     * cost counts against that project's spend limit. Null when it was saved
     * anywhere else, or the project was deleted.
     */
    viralProjectId: varchar("viral_project_id", { length: 36 }).references(
      () => viralProjects.id,
      { onDelete: "set null" }
    ),
    /** When its right panel last opened it, so Storage clean-up can find copies nobody opens (0103). */
    lastOpenedAt: timestamp("last_opened_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    // Pressing the button twice, or saving the same video from two projects,
    // is one row. The project screen joins on these three columns.
    uniqueIndex("ux_viral_videos_owner_video").on(
      table.ownerId,
      table.platform,
      table.platformVideoId
    ),
    index("ix_viral_videos_status").on(table.status, table.updatedAt),
    check(
      "ck_viral_videos_status",
      sql`${table.status} in ('waiting', 'downloading', 'downloaded', 'analysing', 'ready', 'failed')`
    ),
  ]
)

/**
 * A person's folders for their Viral projects.
 * Names are unique per person ignoring case.
 */
export const viralProjectFolders = pgTable(
  "viral_project_folders",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    ownerId: varchar("owner_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 120 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("ux_viral_project_folders_owner_name").on(
      table.ownerId,
      sql`lower(${table.name})`
    ),
  ]
)

/**
 * One Viral project: a niche, described in words, searched by its keywords.
 *
 * `days` and `videoLength` are what YouTube is asked, so changing them means
 * searching again. Minimum views and minimum score are applied when results
 * are read, so changing them costs nothing. `unitsSpent` adds up every
 * YouTube unit this project's searches and creator look-ups used.
 */
export const viralProjects = pgTable(
  "viral_projects",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    ownerId: varchar("owner_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    folderId: varchar("folder_id", { length: 36 }).references(
      () => viralProjectFolders.id,
      { onDelete: "set null" }
    ),
    name: varchar("name", { length: 200 }).notNull(),
    description: text("description").notNull().default(""),
    /** The notes behind the left panel's notes icon, as the shell editor's JSON, or "". */
    notes: text("notes").notNull().default(""),
    /**
     * "What do you make, and for whom?" Every analysis writes its script for
     * this, unless the Analyse box changes it for one video.
     */
    topic: text("topic").notNull().default(""),
    /** The socials this project uses, in the order added (`src/lib/viral/socials.ts`). */
    socials: jsonb("socials").$type<Social[]>().notNull().default(["youtube", "tiktok"]),
    /** Socials paused on this project: their re-checks skip it. */
    pausedSocials: jsonb("paused_socials").$type<Social[]>().notNull().default([]),
    /** The Video project the last Send to Video went to, offered first next time. */
    lastVideoProjectId: varchar("last_video_project_id", { length: 36 }),
    /**
     * Set when the daily re-check queued this project's keywords, so the run's
     * end knows to ring the bell. Cleared once it has rung or found nothing.
     */
    watchRunAt: timestamp("watch_run_at", { withTimezone: true }),
    days: integer("days").notNull().default(30),
    minViews: bigint("min_views", { mode: "number" }).notNull().default(0),
    minScore: integer("min_score").notNull().default(0),
    videoLength: varchar("video_length", { length: 10 })
      .notNull()
      .default("shorts"),
    spendLimitCents: integer("spend_limit_cents"),
    unitsSpent: integer("units_spent").notNull().default(0),
    /** The best-scoring result's thumbnail when the last search finished. */
    coverUrl: text("cover_url"),
    /** True when someone picked the cover in the project's ⋮; a search then leaves it alone. */
    coverChosen: boolean("cover_chosen").notNull().default(false),
    /** Made by "Add a sample project": made-up videos, never searched. */
    isSample: boolean("is_sample").notNull().default(false),
    pinnedAt: timestamp("pinned_at", { withTimezone: true }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("ix_viral_projects_owner_updated").on(
      table.ownerId,
      table.updatedAt
    ),
    check(
      "ck_viral_projects_length",
      sql`${table.videoLength} in ('shorts', 'long', 'both')`
    ),
    check("ck_viral_projects_days", sql`${table.days} in (7, 30, 90)`),
  ]
)

/**
 * One keyword of one project, and the job that searches it. The status row is
 * the job: Search marks it `queued`, the worker claims it with a lease and
 * takes it to `done` or `failed`, and a restart puts an abandoned claim back.
 */
export const viralProjectKeywords = pgTable(
  "viral_project_keywords",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    projectId: varchar("project_id", { length: 36 })
      .notNull()
      .references(() => viralProjects.id, { onDelete: "cascade" }),
    keyword: varchar("keyword", { length: 100 }).notNull(),
    position: integer("position").notNull().default(0),
    status: varchar("status", { length: 20 }).notNull().default("idle"),
    error: text("error"),
    leaseToken: varchar("lease_token", { length: 36 }),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    queuedAt: timestamp("queued_at", { withTimezone: true }),
    ranAt: timestamp("ran_at", { withTimezone: true }),
    unitsSpent: integer("units_spent").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("ux_viral_project_keywords_project_keyword").on(
      table.projectId,
      sql`lower(${table.keyword})`
    ),
    index("ix_viral_project_keywords_status").on(
      table.status,
      table.queuedAt
    ),
    check(
      "ck_viral_project_keywords_status",
      sql`${table.status} in ('idle', 'queued', 'searching', 'done', 'failed')`
    ),
  ]
)

/**
 * One video one keyword found. A keyword's search replaces its own rows and
 * nobody else's. `isNew` is true when the project did not have the video
 * before that search; `topicMatch` is the AI's 0 to 100 for how well the
 * title fits the description, null until asked. Counts a channel hides are
 * null, never zero.
 */
export const viralProjectResults = pgTable(
  "viral_project_results",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    keywordId: varchar("keyword_id", { length: 36 })
      .notNull()
      .references(() => viralProjectKeywords.id, { onDelete: "cascade" }),
    projectId: varchar("project_id", { length: 36 })
      .notNull()
      .references(() => viralProjects.id, { onDelete: "cascade" }),
    platform: varchar("platform", { length: 20 }).notNull(),
    platformVideoId: varchar("platform_video_id", { length: 100 }).notNull(),
    url: text("url").notNull(),
    title: text("title").notNull(),
    channelId: varchar("channel_id", { length: 100 }).notNull(),
    channelName: text("channel_name").notNull(),
    subscribers: bigint("subscribers", { mode: "number" }),
    views: bigint("views", { mode: "number" }).notNull(),
    likes: bigint("likes", { mode: "number" }),
    comments: bigint("comments", { mode: "number" }),
    postedAt: timestamp("posted_at", { withTimezone: true }),
    durationSeconds: integer("duration_seconds").notNull(),
    thumbnailUrl: text("thumbnail_url"),
    isNew: boolean("is_new").notNull().default(false),
    topicMatch: integer("topic_match"),
    foundAt: timestamp("found_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("ux_viral_project_results_keyword_video").on(
      table.keywordId,
      table.platformVideoId
    ),
    index("ix_viral_project_results_project").on(table.projectId),
  ]
)

/** A channel somebody hid from one project. Every other project still shows it. */
export const viralProjectHiddenChannels = pgTable(
  "viral_project_hidden_channels",
  {
    projectId: varchar("project_id", { length: 36 })
      .notNull()
      .references(() => viralProjects.id, { onDelete: "cascade" }),
    platform: varchar("platform", { length: 20 }).notNull(),
    channelId: varchar("channel_id", { length: 100 }).notNull(),
    channelName: text("channel_name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.projectId, table.platform, table.channelId],
    }),
  ]
)

/**
 * Which followed creators belong to which project. A creator is stored once,
 * so the watch timer checks them once however many projects they are in.
 */
export const viralProjectCreators = pgTable(
  "viral_project_creators",
  {
    projectId: varchar("project_id", { length: 36 })
      .notNull()
      .references(() => viralProjects.id, { onDelete: "cascade" }),
    creatorId: varchar("creator_id", { length: 36 })
      .notNull()
      .references(() => viralCreators.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.projectId, table.creatorId] }),
    index("ix_viral_project_creators_creator").on(table.creatorId),
  ]
)

/**
 * A video pasted into a project by its link (viral task 08, drizzle/0136).
 * The saved video is its owner's; this row is only why it shows in this
 * project. Deleting the project keeps the saved video.
 */
export const viralProjectLinks = pgTable(
  "viral_project_links",
  {
    projectId: varchar("project_id", { length: 36 })
      .notNull()
      .references(() => viralProjects.id, { onDelete: "cascade" }),
    savedVideoId: varchar("saved_video_id", { length: 36 })
      .notNull()
      .references(() => viralVideos.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.projectId, table.savedVideoId] }),
    index("ix_viral_project_links_saved_video").on(table.savedVideoId),
  ]
)

/**
 * Every YouTube call the app makes, in units. The free 10,000 a day belong to
 * the API key, which is the whole app's, so a run can be refused before it
 * starts when today's spend would not leave room for it.
 */
export const viralYoutubeUnitSpend = pgTable(
  "viral_youtube_unit_spend",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    units: integer("units").notNull(),
    reason: varchar("reason", { length: 40 }).notNull(),
    spentAt: timestamp("spent_at", { withTimezone: true }).notNull(),
  },
  (table) => [index("ix_viral_youtube_unit_spend_spent_at").on(table.spentAt)]
)


/**
 * Viral's own settings: one row, id "viral". The YouTube key and the key the
 * Video app made for Viral are scrambled the way the shell scrambles AI keys.
 */
export const viralSettings = pgTable("viral_settings", {
  id: varchar("id", { length: 20 }).primaryKey(),
  /** NULL falls back to VIRAL_YOUTUBE_API_KEY. */
  youtubeApiKey: text("youtube_api_key"),
  /** The Video app's address, as Viral keeps it: no query, no trailing slash. */
  videoUrl: text("video_url").notNull().default(""),
  videoKey: text("video_key"),
  /** Who saved the Video key: Video's calls back only touch their sends and files (0106). */
  videoKeyOwnerId: varchar("video_key_owner_id", { length: 36 }).references(() => customShellUsers.id, { onDelete: "set null" }),
  /** The Promo app's address and key (Settings → Promo connection), added by `drizzle/0102_viral_promo_link.sql`. */
  promoUrl: text("promo_url").notNull().default(""),
  promoKey: text("promo_key"),
  /** Who saved the Promo key: Promo's calls back only touch their reads and ideas (0105). */
  promoKeyOwnerId: varchar("promo_key_owner_id", { length: 36 }).references(() => customShellUsers.id, { onDelete: "set null" }),
  /** The Meta ad library token on Settings → Meta, for Winning ads (0103). */
  metaToken: text("meta_token"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
})

/**
 * A channel's typical views: the middle value of its recent uploads' views,
 * worked out for the Outlier sort and reused for 7 days
 * (`workspace/docs/sorts-and-score.md`).
 */
export const viralChannelUsual = pgTable(
  "viral_channel_usual",
  {
    ownerId: varchar("owner_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    platform: varchar("platform", { length: 20 }).notNull(),
    channelId: varchar("channel_id", { length: 100 }).notNull(),
    /** Null when the channel had too few other videos to say. */
    typicalViews: bigint("typical_views", { mode: "number" }),
    sampleSize: integer("sample_size").notNull(),
    /**
     * The recent uploads' views by video id, so the video being compared can
     * be left out of its own channel's typical figure.
     */
    recentViews: jsonb("recent_views").$type<Record<string, number>>().notNull().default({}),
    workedOutAt: timestamp("worked_out_at", { withTimezone: true }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.ownerId, table.platform, table.channelId] })]
)

/**
 * A video the daily re-check's bell has already named in one project, so the
 * same video never rings twice, even when it drops out of a search and comes
 * back (`workspace/docs/finding-content.md`).
 */
export const viralNotifiedVideos = pgTable(
  "viral_notified_videos",
  {
    projectId: varchar("project_id", { length: 36 })
      .notNull()
      .references(() => viralProjects.id, { onDelete: "cascade" }),
    platform: varchar("platform", { length: 20 }).notNull(),
    platformVideoId: varchar("platform_video_id", { length: 100 }).notNull(),
    notifiedAt: timestamp("notified_at", { withTimezone: true }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.projectId, table.platform, table.platformVideoId] })]
)

/**
 * One Analyse with AI on one saved video, for one topic. Analysing again with
 * another topic adds a row instead of replacing the last one.
 */
export const viralAnalyses = pgTable(
  "viral_analyses",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    ownerId: varchar("owner_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    savedVideoId: varchar("saved_video_id", { length: 36 })
      .notNull()
      .references(() => viralVideos.id, { onDelete: "cascade" }),
    projectId: varchar("project_id", { length: 36 }).references(() => viralProjects.id, {
      onDelete: "set null",
    }),
    topic: text("topic").notNull(),
    pieces: jsonb("pieces").$type<AnalysisPieces>().notNull(),
    /** Your own words under the analysis, saved as you type. */
    notes: text("notes").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [index("ix_viral_analyses_saved_video").on(table.savedVideoId, table.createdAt)]
)

/**
 * One idea in a project's vault. It keeps its own copy of the video file and
 * of the numbers, so the creator deleting the video, or a re-run replacing a
 * keyword's results, never empties it.
 */
export const viralVaultItems = pgTable(
  "viral_vault_items",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    ownerId: varchar("owner_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    projectId: varchar("project_id", { length: 36 })
      .notNull()
      .references(() => viralProjects.id, { onDelete: "cascade" }),
    /** The saved video it came from. The file and the numbers are copied, so losing it loses nothing. */
    savedVideoId: varchar("saved_video_id", { length: 36 }).references(() => viralVideos.id, {
      onDelete: "set null",
    }),
    platform: varchar("platform", { length: 20 }).notNull(),
    platformVideoId: varchar("platform_video_id", { length: 100 }).notNull(),
    sourceUrl: text("source_url").notNull(),
    title: text("title").notNull(),
    channelName: text("channel_name").notNull().default(""),
    /** Viral's own copy of the video, in the shell's media library. */
    mediaId: varchar("media_id", { length: 36 }).references(() => customShellMedia.id, {
      onDelete: "set null",
    }),
    thumbnailUrl: text("thumbnail_url"),
    /** Viral's own copy of the cover, which outlives the platform's address. */
    thumbnailStoragePath: text("thumbnail_storage_path"),
    stats: jsonb("stats").$type<VaultStats>().notNull(),
    /** The analysis picked when it was saved, copied so a later analysis never changes it. */
    analysisTopic: text("analysis_topic"),
    analysis: jsonb("analysis").$type<AnalysisPieces>(),
    notes: text("notes").notNull().default(""),
    status: varchar("status", { length: 10 }).$type<VaultStatus>().notNull().default("idea"),
    /** The draft the last Send to Video made, and where to open it. */
    sentVideoId: varchar("sent_video_id", { length: 36 }),
    sentEditUrl: text("sent_edit_url"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    check("ck_viral_vault_items_status", sql`${table.status} in ('idea', 'scripted', 'sent', 'posted')`),
    index("ix_viral_vault_items_owner").on(table.ownerId, table.createdAt),
    index("ix_viral_vault_items_project").on(table.projectId, table.createdAt),
    // Saving the same video to the same project twice is one idea.
    uniqueIndex("ux_viral_vault_items_project_video").on(table.projectId, table.platform, table.platformVideoId),
  ]
)

/** A person's tags, offered as they type. Names are unique per person ignoring case. */
export const viralTags = pgTable(
  "viral_tags",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    ownerId: varchar("owner_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 40 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [uniqueIndex("ux_viral_tags_owner_name").on(table.ownerId, sql`lower(${table.name})`)]
)

export const viralVaultItemTags = pgTable(
  "viral_vault_item_tags",
  {
    itemId: varchar("item_id", { length: 36 })
      .notNull()
      .references(() => viralVaultItems.id, { onDelete: "cascade" }),
    tagId: varchar("tag_id", { length: 36 })
      .notNull()
      .references(() => viralTags.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.itemId, table.tagId] }), index("ix_viral_vault_item_tags_tag").on(table.tagId)]
)

/**
 * One Send to Video of one vault item (`workspace/docs/send-to-video.md`).
 * `token` lets Video fetch the file once within two hours; Video's answer
 * and its later "arrived" or "failed" message fill in the rest.
 */
export const viralSends = pgTable(
  "viral_sends",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    ownerId: varchar("owner_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    itemId: varchar("item_id", { length: 36 })
      .notNull()
      .references(() => viralVaultItems.id, { onDelete: "cascade" }),
    videoProjectId: varchar("video_project_id", { length: 36 }).notNull(),
    /** Replace: the send swaps the words and file on the draft already made. */
    replacing: boolean("replacing").notNull().default(false),
    /** sending → copying → ready, or failed. */
    status: varchar("status", { length: 10 }).notNull(),
    /** The hash of the file link's token. The token itself is only ever in the message to Video. */
    tokenHash: varchar("token_hash", { length: 64 }),
    tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
    videoId: varchar("video_id", { length: 36 }),
    editUrl: text("edit_url"),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    check("ck_viral_sends_status", sql`${table.status} in ('sending', 'copying', 'ready', 'failed')`),
    index("ix_viral_sends_item").on(table.itemId, table.createdAt),
    uniqueIndex("ux_viral_sends_token").on(table.tokenHash),
  ]
)

export type ViralCreatorRow = typeof viralCreators.$inferSelect
export type ViralCreatorPostRow = typeof viralCreatorPosts.$inferSelect
export type ViralVideoRow = typeof viralVideos.$inferSelect
export type ViralProjectRow = typeof viralProjects.$inferSelect
export type ViralProjectKeywordRow = typeof viralProjectKeywords.$inferSelect
export type ViralProjectResultRow = typeof viralProjectResults.$inferSelect
export type ViralAnalysisRow = typeof viralAnalyses.$inferSelect
export type ViralVaultItemRow = typeof viralVaultItems.$inferSelect
export type ViralSendRow = typeof viralSends.$inferSelect

/** Which left menus the Viral section was added to, so it is added once (`navigation.ts`). */
export const viralNavigationAdded = pgTable("viral_navigation_added", {
  scope: varchar("scope", { length: 80 }).primaryKey(),
  addedAt: timestamp("added_at", { withTimezone: true }).notNull(),
})

/** Who has been given the sample project, so a new account gets one and never two, even after deleting it. */
export const viralSampleMade = pgTable("viral_sample_made", {
  ownerId: varchar("owner_id", { length: 36 })
    .primaryKey()
    .references(() => customShellUsers.id, { onDelete: "cascade" }),
  madeAt: timestamp("made_at", { withTimezone: true }).notNull(),
})

/**
 * One views figure per video per day (drizzle/0101_viral_finding.sql), written
 * whenever a search or a creator read sees the video. Rising fast compares the
 * last two days (`workspace/docs/sorts-and-score.md`). Views are public
 * numbers, so the rows belong to the video, not to a person.
 */
export const viralViewHistory = pgTable(
  "viral_view_history",
  {
    platform: varchar("platform", { length: 20 }).notNull(),
    platformVideoId: varchar("platform_video_id", { length: 100 }).notNull(),
    day: date("day").notNull(),
    views: bigint("views", { mode: "number" }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.platform, table.platformVideoId, table.day] })]
)

/** Who has opened which video, so New clears for that person alone (Tyler: "Opening that video"). */
export const viralSeenVideos = pgTable(
  "viral_seen_videos",
  {
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    platform: varchar("platform", { length: 20 }).notNull(),
    platformVideoId: varchar("platform_video_id", { length: 100 }).notNull(),
    seenAt: timestamp("seen_at", { withTimezone: true }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.platform, table.platformVideoId] })]
)

/**
 * A video's 20 most-liked comments, kept for a day so opening it again costs
 * no YouTube unit. `disabled` means the channel switched comments off.
 */
export const viralVideoComments = pgTable(
  "viral_video_comments",
  {
    platform: varchar("platform", { length: 20 }).notNull(),
    platformVideoId: varchar("platform_video_id", { length: 100 }).notNull(),
    comments: jsonb("comments").$type<ViralCommentRow[]>().notNull().default([]),
    disabled: boolean("disabled").notNull().default(false),
    readAt: timestamp("read_at", { withTimezone: true }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.platform, table.platformVideoId] })]
)

export type ViralCommentRow = { author: string; text: string; likes: number; postedAt: string | null }

/** The last "same idea, other creators" search for one video in one project. */
export const viralSameIdea = pgTable(
  "viral_same_idea",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    ownerId: varchar("owner_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    projectId: varchar("project_id", { length: 36 })
      .notNull()
      .references(() => viralProjects.id, { onDelete: "cascade" }),
    platform: varchar("platform", { length: 20 }).notNull(),
    platformVideoId: varchar("platform_video_id", { length: 100 }).notNull(),
    searchLine: text("search_line").notNull(),
    results: jsonb("results").$type<ViralSameIdeaResultRow[]>().notNull().default([]),
    units: integer("units").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("ux_viral_same_idea_project_video").on(table.projectId, table.platform, table.platformVideoId),
  ]
)

/** One video a "same idea" search found, as YouTube described it. */
export type ViralSameIdeaResultRow = {
  platformVideoId: string
  url: string
  title: string
  channelId: string
  channelName: string
  subscribers: number | null
  views: number
  likes: number | null
  comments: number | null
  postedAt: string
  durationSeconds: number
  thumbnailUrl: string | null
}

/**
 * A winning structure saved from an analysis (drizzle/0103, Library →
 * Formats): each part's role, rough length and what it does. Formats belong
 * to the person, so one saved in one project writes scripts in all of them.
 */
export const viralFormats = pgTable(
  "viral_formats",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    ownerId: varchar("owner_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 120 }).notNull(),
    parts: jsonb("parts").$type<FormatPart[]>().notNull(),
    /** The title of the video it was saved from, when there was one. */
    sourceTitle: text("source_title"),
    isSample: boolean("is_sample").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [index("ix_viral_formats_owner").on(table.ownerId, table.createdAt)]
)

/** One script written from a format, for one idea line. */
export const viralFormatScripts = pgTable(
  "viral_format_scripts",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    ownerId: varchar("owner_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    formatId: varchar("format_id", { length: 36 })
      .notNull()
      .references(() => viralFormats.id, { onDelete: "cascade" }),
    projectId: varchar("project_id", { length: 36 }).references(() => viralProjects.id, { onDelete: "set null" }),
    idea: text("idea").notNull(),
    script: jsonb("script").$type<AnalysisPieces["script"]>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [index("ix_viral_format_scripts_format").on(table.formatId, table.createdAt)]
)

/** The person's own tags on a hook in the Library, from the same list as the vault's. */
export const viralHookTags = pgTable(
  "viral_hook_tags",
  {
    savedVideoId: varchar("saved_video_id", { length: 36 })
      .notNull()
      .references(() => viralVideos.id, { onDelete: "cascade" }),
    tagId: varchar("tag_id", { length: 36 })
      .notNull()
      .references(() => viralTags.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.savedVideoId, table.tagId] }), index("ix_viral_hook_tags_tag").on(table.tagId)]
)

/**
 * One project's last Winning ads search: ads from Meta's ad library that
 * match its keywords and have run 30 days or more (`workspace/docs/winning-ads.md`).
 */
export const viralAds = pgTable(
  "viral_ads",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    ownerId: varchar("owner_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    projectId: varchar("project_id", { length: 36 })
      .notNull()
      .references(() => viralProjects.id, { onDelete: "cascade" }),
    adArchiveId: varchar("ad_archive_id", { length: 64 }).notNull(),
    pageName: text("page_name").notNull().default(""),
    body: text("body").notNull().default(""),
    title: text("title").notNull().default(""),
    keyword: text("keyword").notNull().default(""),
    platforms: jsonb("platforms").$type<string[]>().notNull().default([]),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    foundAt: timestamp("found_at", { withTimezone: true }).notNull(),
  },
  (table) => [uniqueIndex("ux_viral_ads_project_ad").on(table.projectId, table.adArchiveId)]
)

/** When a project's Winning ads were last searched, and why it failed if it did. */
export const viralAdRuns = pgTable("viral_ad_runs", {
  projectId: varchar("project_id", { length: 36 })
    .primaryKey()
    .references(() => viralProjects.id, { onDelete: "cascade" }),
  searchedAt: timestamp("searched_at", { withTimezone: true }).notNull(),
  error: text("error"),
})

export type ViralFormatRow = typeof viralFormats.$inferSelect
export type ViralAdRow = typeof viralAds.$inferSelect

/**
 * The link with the Promo app (`workspace/docs/promo-connection.md`), made by
 * `drizzle/0102_viral_promo_link.sql`: the reads Viral asks Promo for, the
 * posts they found, the posts Viral writes for Promo, and your own posts of
 * an idea as Promo reported them.
 */
export const viralPromoReads = pgTable(
  "viral_promo_reads",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    ownerId: varchar("owner_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    projectId: varchar("project_id", { length: 36 })
      .notNull()
      .references(() => viralProjects.id, { onDelete: "cascade" }),
    network: varchar("network", { length: 20 }).$type<PromoReadNetwork>().notNull(),
    kind: varchar("kind", { length: 20 }).$type<PromoReadKind>().notNull(),
    value: varchar("value", { length: 300 }).notNull(),
    status: varchar("status", { length: 10 }).$type<PromoReadStatus>().notNull().default("waiting"),
    error: text("error").notNull().default(""),
    found: integer("found").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (table) => [
    check("ck_viral_promo_reads_status", sql`${table.status} in ('waiting', 'done', 'failed')`),
    index("ix_viral_promo_reads_project").on(table.projectId, table.createdAt),
    index("ix_viral_promo_reads_watch").on(table.projectId, table.network, table.kind, table.value, table.createdAt),
  ]
)

export const viralSocialPosts = pgTable(
  "viral_social_posts",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    ownerId: varchar("owner_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    projectId: varchar("project_id", { length: 36 })
      .notNull()
      .references(() => viralProjects.id, { onDelete: "cascade" }),
    readId: varchar("read_id", { length: 36 }).references(() => viralPromoReads.id, { onDelete: "set null" }),
    network: varchar("network", { length: 20 }).$type<PromoReadNetwork>().notNull(),
    postId: varchar("post_id", { length: 40 }).notNull(),
    url: varchar("url", { length: 300 }).notNull(),
    title: text("title").notNull().default(""),
    text: text("text").notNull().default(""),
    authorHandle: varchar("author_handle", { length: 60 }).notNull().default(""),
    authorName: varchar("author_name", { length: 200 }).notNull().default(""),
    authorFollowers: bigint("author_followers", { mode: "number" }),
    postedAt: timestamp("posted_at", { withTimezone: true }),
    views: bigint("views", { mode: "number" }),
    likes: bigint("likes", { mode: "number" }),
    replies: bigint("replies", { mode: "number" }),
    reposts: bigint("reposts", { mode: "number" }),
    link: text("link").notNull().default(""),
    community: varchar("community", { length: 60 }).notNull().default(""),
    topReplies: jsonb("top_replies").$type<SocialPostReply[]>().notNull().default([]),
    repliesReadAt: timestamp("replies_read_at", { withTimezone: true }),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("ux_viral_social_posts_project_post").on(table.projectId, table.network, table.postId),
    index("ix_viral_social_posts_owner").on(table.ownerId, table.network),
  ]
)

export const viralPromoSends = pgTable(
  "viral_promo_sends",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    ownerId: varchar("owner_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    vaultItemId: varchar("vault_item_id", { length: 36 })
      .notNull()
      .references(() => viralVaultItems.id, { onDelete: "cascade" }),
    network: varchar("network", { length: 20 }).$type<PromoPostNetwork>().notNull(),
    promoProjectId: varchar("promo_project_id", { length: 36 }),
    title: text("title").notNull().default(""),
    pieces: jsonb("pieces").$type<string[]>().notNull().default([]),
    status: varchar("status", { length: 10 }).$type<PromoSendStatus>().notNull().default("written"),
    draftUrl: text("draft_url"),
    error: text("error").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
  },
  (table) => [
    check("ck_viral_promo_sends_status", sql`${table.status} in ('written', 'sent', 'failed')`),
    index("ix_viral_promo_sends_item").on(table.vaultItemId, table.createdAt),
  ]
)

export const viralVaultPosts = pgTable(
  "viral_vault_posts",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    ownerId: varchar("owner_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    vaultItemId: varchar("vault_item_id", { length: 36 })
      .notNull()
      .references(() => viralVaultItems.id, { onDelete: "cascade" }),
    postKey: varchar("post_key", { length: 60 }).notNull(),
    network: varchar("network", { length: 20 }).notNull(),
    url: text("url").notNull(),
    views: bigint("views", { mode: "number" }),
    likes: bigint("likes", { mode: "number" }),
    comments: bigint("comments", { mode: "number" }),
    postedAt: timestamp("posted_at", { withTimezone: true }),
    figuresAt: timestamp("figures_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("ux_viral_vault_posts_key").on(table.ownerId, table.postKey),
    index("ix_viral_vault_posts_item").on(table.vaultItemId),
  ]
)

/**
 * What a project keeps reading on X, Reddit and LinkedIn through Promo
 * (`workspace/docs/projects-and-socials.md`). A watch's state is its newest
 * read in `viral_promo_reads` with the same network, kind and value.
 */
export const viralSocialWatches = pgTable(
  "viral_social_watches",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    ownerId: varchar("owner_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    projectId: varchar("project_id", { length: 36 })
      .notNull()
      .references(() => viralProjects.id, { onDelete: "cascade" }),
    network: varchar("network", { length: 20 }).$type<TextSocial>().notNull(),
    kind: varchar("kind", { length: 20 }).$type<WatchKind>().notNull(),
    value: varchar("value", { length: 300 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("ux_viral_social_watches_value").on(table.projectId, table.network, table.kind, sql`lower(${table.value})`),
  ]
)

export type ViralSocialWatchRow = typeof viralSocialWatches.$inferSelect

export type ViralPromoReadRow = typeof viralPromoReads.$inferSelect
export type ViralSocialPostRow = typeof viralSocialPosts.$inferSelect
export type ViralPromoSendRow = typeof viralPromoSends.$inferSelect
