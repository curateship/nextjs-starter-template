import { sql } from "drizzle-orm"
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core"

import { customShellWorkspaces } from "@/server/schema"

/**
 * Each site's posts. The matching SQL is `drizzle/0080_cms_posts.sql`.
 *
 * Categories are not a column: a post is filed through the directory's shared
 * `categoryRelationships` table under `POST_CONTENT_TYPE`.
 */
export const sitePosts = pgTable(
  "posts",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    workspaceId: varchar("workspace_id", { length: 36 })
      .notNull()
      .references(() => customShellWorkspaces.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 200 }).notNull(),
    /** The address part after /posts/, unique per site. */
    slug: varchar("slug", { length: 160 }).notNull(),
    /** A media-library URL, or empty. */
    coverImage: varchar("cover_image", { length: 600 }).notNull().default(""),
    summary: varchar("summary", { length: 300 }).notNull().default(""),
    /** The editor's document tree, cleaned by `lib/posts/post-body.ts`. */
    body: jsonb("body").notNull(),
    /**
     * How long the body takes to read, in whole minutes, worked out on every
     * save by `lib/posts/read-time.ts`. Kept here so a page of cards does not
     * fetch twelve article bodies to print twelve small numbers.
     */
    readMinutes: integer("read_minutes").notNull().default(1),
    /** 'draft' or 'published'. Drafts never reach a visitor. */
    status: varchar("status", { length: 20 }).notNull().default("draft"),
    /** Set on first publish and kept, so republishing does not re-date a post. */
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("ux_posts_workspace_slug").on(table.workspaceId, table.slug),
    index("ix_posts_workspace_status_published").on(
      table.workspaceId,
      table.status,
      table.publishedAt
    ),
    check("posts_status_check", sql`${table.status} IN ('draft', 'published')`),
    check(
      "posts_published_has_date_check",
      sql`${table.status} <> 'published' OR ${table.publishedAt} IS NOT NULL`
    ),
  ]
)

export type PostRow = typeof sitePosts.$inferSelect

/** A post's rows in `categoryRelationships`. Listings use 'directory_listing'. */
export const POST_CONTENT_TYPE = "post"
