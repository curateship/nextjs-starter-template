import { sql } from "drizzle-orm"
import {
  bigint,
  check,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  varchar,
} from "drizzle-orm/pg-core"

export const customShellUsers = pgTable("custom_shell_users", {
  id: varchar("id", { length: 36 }).primaryKey(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  role: varchar("role", { length: 50 }).notNull(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
})

export const customShellSessions = pgTable(
  "custom_shell_sessions",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("ix_custom_shell_sessions_user_id").on(table.userId),
    index("ix_custom_shell_sessions_token_hash").on(table.tokenHash),
    index("ix_custom_shell_sessions_expires_at").on(table.expiresAt),
  ]
)

export const customShellSettings = pgTable(
  "custom_shell_settings",
  {
    key: text("key").primaryKey(),
    settings: jsonb("settings").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    check("custom_shell_settings_default_key", sql`${table.key} = 'default'`),
  ]
)

export const customShellFeedback = pgTable(
  "custom_shell_feedback",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    type: varchar("type", { length: 50 }).notNull(),
    message: text("message").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    check(
      "custom_shell_feedback_type_check",
      sql`${table.type} in ('suggestion', 'bug_report', 'question', 'praise')`
    ),
    index("ix_custom_shell_feedback_user_id").on(table.userId),
    index("ix_custom_shell_feedback_type").on(table.type),
  ]
)

export const customShellFeedbackVotes = pgTable(
  "custom_shell_feedback_votes",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    feedbackId: varchar("feedback_id", { length: 36 })
      .notNull()
      .references(() => customShellFeedback.id, { onDelete: "cascade" }),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    unique("custom_shell_feedback_votes_unique_user").on(
      table.feedbackId,
      table.userId
    ),
    index("ix_custom_shell_feedback_votes_feedback_id").on(table.feedbackId),
    index("ix_custom_shell_feedback_votes_user_id").on(table.userId),
  ]
)

export const customShellMedia = pgTable(
  "custom_shell_media",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    filename: varchar("filename", { length: 255 }).notNull(),
    originalName: varchar("original_name", { length: 255 }).notNull(),
    altText: text("alt_text"),
    fileSize: bigint("file_size", { mode: "number" }).notNull(),
    mimeType: varchar("mime_type", { length: 255 }).notNull(),
    fileType: varchar("file_type", { length: 20 }).notNull(),
    storagePath: text("storage_path").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    check(
      "custom_shell_media_file_type_check",
      sql`${table.fileType} in ('image', 'video')`
    ),
    index("ix_custom_shell_media_user_id").on(table.userId),
    index("ix_custom_shell_media_file_type").on(table.fileType),
    index("ix_custom_shell_media_created_at").on(table.createdAt),
    index("ix_custom_shell_media_user_type_created").on(
      table.userId,
      table.fileType,
      table.createdAt
    ),
  ]
)

export type CustomShellUser = typeof customShellUsers.$inferSelect
export type CustomShellMedia = typeof customShellMedia.$inferSelect
export type CustomShellFeedback = typeof customShellFeedback.$inferSelect
