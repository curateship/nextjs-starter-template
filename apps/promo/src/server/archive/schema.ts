import { bigint, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core"

import type { ArchiveCaptions, ArchiveItemKind, ArchiveItemStatus, ArchivePending, ArchiveSlideKind, ArchiveSource } from "@/lib/archive/items"
import type { Network } from "@/lib/social/networks"
import { customShellMedia, customShellUsers } from "@/server/schema"
import { promoProjects } from "@/server/social/schema"

/**
 * The Archive (Video task `promo/01-send-to-promo-and-archive.md`): every
 * video, carousel and picture kept in Promo by project, whether it came from
 * the Video app or from somebody's computer. The SQL is
 * `drizzle/0134_promo_archive.sql`. The whole flow is in
 * `workspace/docs/archive.md`.
 */

/**
 * The key Video uses to send things here, one per Promo person. Promo makes
 * it on Settings → Video and keeps its hash to look a caller up, and the key
 * itself scrambled so the Copy button can show it again. `videoUrl` is the
 * Video address that last pressed Test, the only address Promo fetches files
 * from and tells about posts.
 */
export const promoVideoLinks = pgTable("promo_video_links", {
  userId: varchar("user_id", { length: 36 })
    .primaryKey()
    .references(() => customShellUsers.id, { onDelete: "cascade" }),
  keyHash: varchar("key_hash", { length: 64 }).notNull().unique(),
  keySecret: text("key_secret").notNull(),
  videoUrl: varchar("video_url", { length: 500 }).notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
})

export type PromoVideoLinkRow = typeof promoVideoLinks.$inferSelect

/**
 * One thing in the archive. A carousel's pictures are its slides, in
 * `promo_archive_slides`. Files are Promo's own copies in its bucket, so
 * deleting the export in Video never breaks one (Tyler, 4 Nov 2026: "Own
 * copy").
 */
export const promoArchiveItems = pgTable(
  "promo_archive_items",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    projectId: varchar("project_id", { length: 36 })
      .notNull()
      .references(() => promoProjects.id, { onDelete: "cascade" }),
    kind: varchar("kind", { length: 10 }).$type<ArchiveItemKind>().notNull(),
    /** copying while the files come across, then ready. A failed copy is deleted. */
    status: varchar("status", { length: 10 }).$type<ArchiveItemStatus>().notNull().default("copying"),
    title: varchar("title", { length: 200 }).notNull().default(""),
    description: text("description").notNull().default(""),
    caption: text("caption").notNull().default(""),
    /** The captions Write captions made, one per network, after any edit. */
    captions: jsonb("captions").$type<ArchiveCaptions>().notNull().default({}),
    /** 9:16, 16:9, 1:1 or 4:5, or "" when unknown. */
    aspect: varchar("aspect", { length: 8 }).notNull().default(""),
    width: integer("width"),
    height: integer("height"),
    durationMs: integer("duration_ms"),
    /** Every stored file of the item added up, slides and cover included. */
    fileSize: bigint("file_size", { mode: "number" }).notNull().default(0),
    /** The video or picture. "" for a carousel, whose files are its slides. */
    storagePath: text("storage_path").notNull().default(""),
    mimeType: varchar("mime_type", { length: 100 }).notNull().default(""),
    coverPath: text("cover_path").notNull().default(""),
    /** A carousel's PDF for a LinkedIn document post, or "". */
    pdfPath: text("pdf_path").notNull().default(""),
    /** The video's subtitles as an .srt file's words, or "". */
    subtitles: text("subtitles").notNull().default(""),
    source: varchar("source", { length: 10 }).$type<ArchiveSource>().notNull(),
    /**
     * An upload's media library file. The file belongs to the media library,
     * so deleting the item for good leaves it there.
     */
    mediaId: varchar("media_id", { length: 36 }).references(() => customShellMedia.id, { onDelete: "set null" }),
    /** The Video send it came from, so the same send never makes two items. */
    sendId: varchar("send_id", { length: 64 }),
    videoExportId: varchar("video_export_id", { length: 64 }).notNull().default(""),
    videoProjectId: varchar("video_project_id", { length: 64 }).notNull().default(""),
    videoProjectName: varchar("video_project_name", { length: 200 }).notNull().default(""),
    /** Where Edit in Video opens, on the Video address that sent it. */
    videoEditUrl: varchar("video_edit_url", { length: 600 }).notNull().default(""),
    /** Items with the same key belong together: a video's language copies, or a carousel and its slideshow. */
    groupKey: varchar("group_key", { length: 64 }).notNull().default(""),
    language: varchar("language", { length: 40 }).notNull().default(""),
    /** The files still to fetch while copying, and how many tries it has had. */
    pending: jsonb("pending").$type<ArchivePending | null>(),
    attempts: integer("attempts").notNull().default(0),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    pinnedAt: timestamp("pinned_at", { withTimezone: true }),
    /** In the Bin since then. Gone for good 30 days later. */
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("ix_promo_archive_items_project").on(table.projectId, table.createdAt.desc()),
    index("ix_promo_archive_items_user").on(table.userId, table.status),
    uniqueIndex("ux_promo_archive_items_send").on(table.userId, table.sendId),
  ]
)

export type PromoArchiveItemRow = typeof promoArchiveItems.$inferSelect

/** A carousel's slides, in order. */
export const promoArchiveSlides = pgTable(
  "promo_archive_slides",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    itemId: varchar("item_id", { length: 36 })
      .notNull()
      .references(() => promoArchiveItems.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    kind: varchar("kind", { length: 10 }).$type<ArchiveSlideKind>().notNull(),
    storagePath: text("storage_path").notNull(),
    mimeType: varchar("mime_type", { length: 100 }).notNull(),
    fileSize: bigint("file_size", { mode: "number" }).notNull().default(0),
  },
  (table) => [uniqueIndex("ux_promo_archive_slides_position").on(table.itemId, table.position)]
)


/**
 * A draft waiting in a network's post writer, made by ticking that network
 * in Video's send window. Used once a post is made from it.
 */
export const promoArchiveDrafts = pgTable(
  "promo_archive_drafts",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    itemId: varchar("item_id", { length: 36 })
      .notNull()
      .references(() => promoArchiveItems.id, { onDelete: "cascade" }),
    projectId: varchar("project_id", { length: 36 })
      .notNull()
      .references(() => promoProjects.id, { onDelete: "cascade" }),
    network: varchar("network", { length: 20 }).$type<Network>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    usedAt: timestamp("used_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("ux_promo_archive_drafts_item").on(table.itemId, table.network),
    index("ix_promo_archive_drafts_project").on(table.projectId, table.network),
  ]
)

