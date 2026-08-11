import { sql } from "drizzle-orm"
import { customShellUsers, customShellWorkspaces } from "@/server/schema"
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

/**
 * A listing the public asked for, before an admin has agreed to it.
 *
 * Nothing here is a listing yet. It becomes one only when an admin approves it,
 * and the row then remembers which listing it turned into — so approving twice
 * cannot make two.
 *
 * The two-step status is the whole anti-spam design: a submission arrives as
 * `pending_verification` and is invisible to the admin until somebody clicks
 * the link in the email, which is what makes the address real. Only then does
 * it become `pending_review` and appear in the queue.
 */
export const directorySubmissions = pgTable(
  "directory_submissions",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    /** The site whose form this was filled in on. It can become a listing on no other. */
    workspaceId: varchar("workspace_id", { length: 36 })
      .notNull()
      .references(() => customShellWorkspaces.id, { onDelete: "cascade" }),
    businessName: varchar("business_name", { length: 200 }).notNull(),
    contactEmail: varchar("contact_email", { length: 255 }).notNull(),
    address: varchar("address", { length: 300 }).notNull().default(""),
    phone: varchar("phone", { length: 60 }).notNull().default(""),
    /** Capped at 2000, not 300: a maps or booking address is long and truncating one breaks it silently. */
    website: varchar("website", { length: 2000 }).notNull().default(""),
    description: varchar("description", { length: 2000 }).notNull().default(""),
    /** The categories the submitter picked, as ids — checked against this site's tree on approval. */
    categoryIds: jsonb("category_ids").notNull(),
    status: varchar("status", { length: 30 })
      .notNull()
      .default("pending_verification"),
    /**
     * The verification link's token, hashed. The plain token only ever exists
     * in the email — a database somebody can read must not let them verify
     * other people's submissions.
     */
    verifyTokenHash: varchar("verify_token_hash", { length: 128 }),
    verifyExpiresAt: timestamp("verify_expires_at", { withTimezone: true }),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    reviewedByUserId: varchar("reviewed_by_user_id", { length: 36 }).references(
      () => customShellUsers.id,
      { onDelete: "set null" }
    ),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewNote: varchar("review_note", { length: 500 }).notNull().default(""),
    /** What it became. Set once, and the reason approving twice cannot make twins. */
    listingId: varchar("listing_id", { length: 36 }).references(
      () => directoryListings.id,
      { onDelete: "set null" }
    ),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("ix_directory_submissions_workspace_status").on(
      table.workspaceId,
      table.status
    ),
    index("ix_directory_submissions_workspace_created").on(
      table.workspaceId,
      table.createdAt
    ),
    // The verification link looks a row up by this and nothing else, so it is
    // the one column that has to be indexed on its own.
    index("ix_directory_submissions_verify_token").on(table.verifyTokenHash),
    check(
      "directory_submissions_status_check",
      sql`${table.status} IN ('pending_verification', 'pending_review', 'approved', 'rejected')`
    ),
  ]
)

export type DirectorySubmissionRow = typeof directorySubmissions.$inferSelect

/**
 * A business saying a listing is theirs.
 *
 * Claiming needs an account, so `userId` is not optional: an approved claim
 * hands somebody the ability to change a public page, and "whoever has this
 * email" is not a thing to hand that to. The address in `contactEmail` is the
 * *business's* address being proved, which is often not the account's.
 */
export const directoryClaims = pgTable(
  "directory_claims",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    workspaceId: varchar("workspace_id", { length: 36 })
      .notNull()
      .references(() => customShellWorkspaces.id, { onDelete: "cascade" }),
    listingId: varchar("listing_id", { length: 36 })
      .notNull()
      .references(() => directoryListings.id, { onDelete: "cascade" }),
    /** The account that will own the listing. Gone with the account. */
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    contactEmail: varchar("contact_email", { length: 255 }).notNull(),
    claimantName: varchar("claimant_name", { length: 200 }).notNull(),
    roleTitle: varchar("role_title", { length: 120 }).notNull().default(""),
    phone: varchar("phone", { length: 60 }).notNull().default(""),
    message: varchar("message", { length: 1000 }).notNull().default(""),
    proofUrl: varchar("proof_url", { length: 2000 }).notNull().default(""),
    /**
     * Whether the address they are proving is at the same domain as the
     * listing's own website — worked out once, when the claim is made, so the
     * admin reads an answer instead of comparing two strings by eye.
     *
     * **A mismatch is not a refusal.** Plenty of real owners use a Gmail
     * address. It is a flag, not a gate.
     */
    emailDomainMatches: boolean("email_domain_matches").notNull().default(false),
    status: varchar("status", { length: 30 })
      .notNull()
      .default("pending_verification"),
    verifyTokenHash: varchar("verify_token_hash", { length: 128 }),
    verifyExpiresAt: timestamp("verify_expires_at", { withTimezone: true }),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    reviewedByUserId: varchar("reviewed_by_user_id", { length: 36 }).references(
      () => customShellUsers.id,
      { onDelete: "set null" }
    ),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewNote: varchar("review_note", { length: 500 }).notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    // **One approved claim per listing, enforced by the database.** Two people
    // both being told they own a page is not something to leave to a check the
    // application does before writing.
    uniqueIndex("ux_directory_claims_approved_listing")
      .on(table.listingId)
      .where(sql`${table.status} = 'approved'`),
    index("ix_directory_claims_workspace_status").on(
      table.workspaceId,
      table.status
    ),
    index("ix_directory_claims_user").on(table.userId, table.status),
    index("ix_directory_claims_verify_token").on(table.verifyTokenHash),
    check(
      "directory_claims_status_check",
      sql`${table.status} IN ('pending_verification', 'pending_review', 'approved', 'rejected')`
    ),
  ]
)

export type DirectoryClaimRow = typeof directoryClaims.$inferSelect

/**
 * A change an owner wants made to their listing, waiting for an admin.
 *
 * The proposed values are held here rather than written to the listing, which
 * is the whole point: an owner never edits the public page directly. `changes`
 * holds only the fields they are allowed to touch, cleaned by the same cleaners
 * the admin form uses before it is ever applied.
 */
export const directoryOwnerEditRequests = pgTable(
  "directory_owner_edit_requests",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    workspaceId: varchar("workspace_id", { length: 36 })
      .notNull()
      .references(() => customShellWorkspaces.id, { onDelete: "cascade" }),
    claimId: varchar("claim_id", { length: 36 })
      .notNull()
      .references(() => directoryClaims.id, { onDelete: "cascade" }),
    listingId: varchar("listing_id", { length: 36 })
      .notNull()
      .references(() => directoryListings.id, { onDelete: "cascade" }),
    /** { title?, metaDescription?, featuredImage?, contactLinks?, body? } and nothing else. */
    changes: jsonb("changes").notNull(),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    reviewedByUserId: varchar("reviewed_by_user_id", { length: 36 }).references(
      () => customShellUsers.id,
      { onDelete: "set null" }
    ),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewNote: varchar("review_note", { length: 500 }).notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("ix_directory_edit_requests_workspace_status").on(
      table.workspaceId,
      table.status
    ),
    index("ix_directory_edit_requests_listing").on(table.listingId),
    check(
      "directory_edit_requests_status_check",
      sql`${table.status} IN ('pending', 'approved', 'rejected')`
    ),
  ]
)

export type DirectoryOwnerEditRequestRow =
  typeof directoryOwnerEditRequests.$inferSelect

/**
 * What a site says to the public about claiming, and whether it offers it.
 *
 * One row per site, and a site with no row gets the defaults — which is every
 * site until an admin saves something, so this ships changing nothing that is
 * already written down.
 *
 * **It is a table of this app's own and not `WorkspaceSettings`.** That type
 * lives in a shell file, and an app that adds a field to it has forked the
 * shell and will conflict on every future merge.
 */
export const directorySettings = pgTable("directory_settings", {
  /** One row per site, so the site is the key. */
  workspaceId: varchar("workspace_id", { length: 36 })
    .primaryKey()
    .references(() => customShellWorkspaces.id, { onDelete: "cascade" }),
  /** Whether a visitor is offered the claim button at all. */
  claimsEnabled: boolean("claims_enabled").notNull().default(true),
  /** Empty means "use the built-in wording", so a cleared box is not a blank page. */
  claimButtonLabel: varchar("claim_button_label", { length: 80 })
    .notNull()
    .default(""),
  claimPendingMessage: varchar("claim_pending_message", { length: 300 })
    .notNull()
    .default(""),
  claimApprovedMessage: varchar("claim_approved_message", { length: 300 })
    .notNull()
    .default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
})

export type DirectorySettingsRow = typeof directorySettings.$inferSelect
