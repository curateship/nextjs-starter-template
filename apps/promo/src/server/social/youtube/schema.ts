import { boolean, index, integer, jsonb, pgTable, text, timestamp, varchar } from "drizzle-orm/pg-core"

import type { TemplateSection, YoutubePostStatus } from "@/lib/social/youtube/options"
import { promoArchiveItems } from "@/server/archive/schema"
import { customShellUsers } from "@/server/schema"

import { promoAccounts, promoProjects } from "../schema"

/**
 * YouTube's own tables (`workspace/tasks/YouTube/01-youtube-features.md`).
 * The matching SQL is `drizzle/0175_promo_youtube.sql`.
 *
 * Kept apart from the phone networks' posts for the reason Medium keeps its
 * own: a YouTube upload has a title, a description, tags, a thumbnail and
 * YouTube's AI question, and widening `promo_app_posts` to fit would change
 * Instagram's code for no gain to it. The account, the project, the voice,
 * the job queue, the inbox and the bell are shared as they are.
 */

/** YouTube's own number in Settings → Behaviour. No row means where it begins. */
export const promoYoutubeSettings = pgTable("promo_youtube_settings", {
  userId: varchar("user_id", { length: 36 })
    .primaryKey()
    .references(() => customShellUsers.id, { onDelete: "cascade" }),
  uploadsPerDay: integer("uploads_per_day").notNull().default(3),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

/** A description template: a named list of sections, one project's own. */
export const promoYoutubeTemplates = pgTable(
  "promo_youtube_templates",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    projectId: varchar("project_id", { length: 36 })
      .notNull()
      .references(() => promoProjects.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 60 }).notNull(),
    sections: jsonb("sections").$type<TemplateSection[]>().notNull().default([]),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("ix_promo_youtube_templates_project").on(table.projectId, table.position)]
)

/** One upload, a long video or a Short. */
export const promoYoutubePosts = pgTable(
  "promo_youtube_posts",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    accountId: varchar("account_id", { length: 36 })
      .notNull()
      .references(() => promoAccounts.id, { onDelete: "cascade" }),
    projectId: varchar("project_id", { length: 36 }).references(() => promoProjects.id, { onDelete: "set null" }),
    mediaUrl: varchar("media_url", { length: 2048 }).notNull(),
    mediaName: varchar("media_name", { length: 255 }).notNull().default(""),
    archiveItemId: varchar("archive_item_id", { length: 36 }).references(() => promoArchiveItems.id, { onDelete: "set null" }),
    isShort: boolean("is_short").notNull().default(false),
    title: varchar("title", { length: 100 }).notNull(),
    description: text("description").notNull().default(""),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    draftTitle: varchar("draft_title", { length: 100 }).notNull().default(""),
    draftDescription: text("draft_description").notNull().default(""),
    templateId: varchar("template_id", { length: 36 }).references(() => promoYoutubeTemplates.id, { onDelete: "set null" }),
    thumbnailUrl: varchar("thumbnail_url", { length: 2048 }).notNull().default(""),
    thumbnailNote: text("thumbnail_note").notNull().default(""),
    aiMade: boolean("ai_made").notNull().default(false),
    status: varchar("status", { length: 20 }).$type<YoutubePostStatus>().notNull().default("waiting"),
    postUrl: varchar("post_url", { length: 600 }).notNull().default(""),
    lastError: text("last_error").notNull().default(""),
    jobId: varchar("job_id", { length: 36 }),
    views: integer("views"),
    likes: integer("likes"),
    comments: integer("comments"),
    numbersReadAt: timestamp("numbers_read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    postedAt: timestamp("posted_at", { withTimezone: true }),
  },
  (table) => [
    index("ix_promo_youtube_posts_project").on(table.projectId, table.createdAt.desc()),
    index("ix_promo_youtube_posts_account").on(table.accountId, table.createdAt.desc()),
  ]
)
