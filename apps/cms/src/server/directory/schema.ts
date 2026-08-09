import { sql } from "drizzle-orm"
import { customShellWorkspaces } from "@/server/schema"
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core"

/**
 * The directory content type's tables. This file belongs to the app, not the
 * shell — the shell's own tables live in `@/server/schema`, which an app never
 * edits, so the app's tables get a schema module of their own. The matching
 * SQL is `drizzle/0044_cms_directory_listings.sql`.
 *
 * A listing is a plain record: fixed columns, contact links and one written
 * body. There is deliberately no template or block table — that layer of the
 * directory app was cut on purpose, and a listing that needs more gets a
 * column, not a block system.
 */

export const directoryListings = pgTable(
  "directory_listings",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    /** The site this listing is on. Its address is only its own within that. */
    workspaceId: varchar("workspace_id", { length: 36 })
      .notNull()
      .references(() => customShellWorkspaces.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 200 }).notNull(),
    /** The address part after /directory/, unique per listing on its site. */
    slug: varchar("slug", { length: 160 }).notNull(),
    /** What a search result shows under the title. May be empty. */
    metaDescription: varchar("meta_description", { length: 300 })
      .notNull()
      .default(""),
    /** 'draft' or 'published'. Drafts never reach a visitor. */
    status: varchar("status", { length: 20 }).notNull().default("draft"),
    /** Hand-set ordering for the public list. Ties fall back to newest-first. */
    displayOrder: integer("display_order").notNull().default(0),
    /** A media-library URL, or empty. */
    featuredImage: varchar("featured_image", { length: 600 })
      .notNull()
      .default(""),
    /**
     * { address, menuLinks, socialLinks } — the checked shape from
     * `lib/directory/contact-links.ts`. Every href is sanitized before it is
     * stored and again on the way out.
     */
    contactLinks: jsonb("contact_links").notNull(),
    /**
     * The written body as the editor's document tree, never HTML — cleaned by
     * the same `lib/pages/written-page-body.ts` the shell's written pages use.
     */
    body: jsonb("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    // One address, one listing — **within a site**. Two sites each having a
    // `joes-diner` is ordinary, and refusing it is what stopped one deployment
    // running two directories.
    uniqueIndex("ux_directory_listings_workspace_slug").on(
      table.workspaceId,
      table.slug
    ),
    index("ix_directory_listings_workspace_status").on(
      table.workspaceId,
      table.status
    ),
    index("ix_directory_listings_created_at").on(table.createdAt),
    index("ix_directory_listings_workspace_updated").on(
      table.workspaceId,
      table.updatedAt
    ),
    index("ix_directory_listings_title").on(table.title),
    check(
      "directory_listings_status_check",
      sql`${table.status} IN ('draft', 'published')`
    ),
  ]
)

export type DirectoryListingRow = typeof directoryListings.$inferSelect

/**
 * Categories organise listings for browsing and filtering. One tree: a
 * category may sit under another, and deleting a parent re-hangs its children
 * on the deleted one's parent rather than orphaning them.
 */
export const categories = pgTable(
  "categories",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    /** The site whose tree this category is part of. */
    workspaceId: varchar("workspace_id", { length: 36 })
      .notNull()
      .references(() => customShellWorkspaces.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 120 }).notNull(),
    /** Unique across this site's tree, so a category page has one address. */
    slug: varchar("slug", { length: 160 }).notNull(),
    description: varchar("description", { length: 500 }).notNull().default(""),
    /**
     * Null for a top-level category. No FK delete action on purpose: the
     * server re-parents children in the same transaction as the delete.
     */
    parentId: varchar("parent_id", { length: 36 }).$type<string | null>(),
    displayOrder: integer("display_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("ux_categories_workspace_slug").on(table.workspaceId, table.slug),
    index("ix_categories_workspace_parent").on(table.workspaceId, table.parentId),
  ]
)

export type CategoryRow = typeof categories.$inferSelect

/**
 * Which categories a piece of content is in. Polymorphic on purpose:
 * `contentType` is 'directory_listing' today, and the next content type this
 * app grows shares this table instead of getting a twin. `isPrimary` marks
 * the one category a listing's breadcrumb names; the server keeps it to at
 * most one per piece of content.
 */
export const categoryRelationships = pgTable(
  "category_relationships",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    /**
     * The site this row is on — the same one its category is on.
     *
     * Not strictly needed to keep sites apart: every read reaches these rows
     * through a listing or a category that has already named its site. It is
     * here so a site's rows are directly selectable and directly removable,
     * rather than only ever reachable by joining back through one of those.
     */
    workspaceId: varchar("workspace_id", { length: 36 })
      .notNull()
      .references(() => customShellWorkspaces.id, { onDelete: "cascade" }),
    categoryId: varchar("category_id", { length: 36 })
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
    contentType: varchar("content_type", { length: 40 }).notNull(),
    contentId: varchar("content_id", { length: 36 }).notNull(),
    isPrimary: boolean("is_primary").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("category_relationships_unique_key").on(
      table.categoryId,
      table.contentType,
      table.contentId
    ),
    index("ix_category_relationships_workspace_content").on(
      table.workspaceId,
      table.contentType,
      table.contentId
    ),
  ]
)

/** The one content type in this table today. */
export const LISTING_CONTENT_TYPE = "directory_listing"
