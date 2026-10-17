import { sql } from "drizzle-orm"
import {
  boolean,
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

import { customShellUsers, customShellWorkspaces } from "@/server/schema"

/**
 * Courses: written guides, each a list of chapters. The matching SQL is
 * `drizzle/0094_courses.sql`, and `workspace/docs/courses.md` explains the
 * rules these tables hold.
 */

export const courses = pgTable(
  "courses",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    workspaceId: varchar("workspace_id", { length: 36 })
      .notNull()
      .references(() => customShellWorkspaces.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 200 }).notNull(),
    /** The address part after /courses/, unique per site. */
    slug: varchar("slug", { length: 160 }).notNull(),
    /** One or two sentences for the course's card and its intro page. */
    description: varchar("description", { length: 600 }).notNull().default(""),
    /** A media-library address, or empty. */
    image: varchar("image", { length: 600 }).notNull().default(""),
    /** 'everyone', 'members' or 'paid'. See `lib/courses/course-access.ts`. */
    access: varchar("access", { length: 20 }).notNull().default("everyone"),
    /**
     * The plans that unlock a 'paid' course. Empty means any paid plan does.
     * Plan ids, so renaming a plan never loses its courses.
     */
    planIds: jsonb("plan_ids").$type<string[]>().notNull().default([]),
    /** 'draft' or 'published'. A draft course is never shown to a visitor. */
    status: varchar("status", { length: 20 }).notNull().default("draft"),
    /** Where the course sits on the /courses page. */
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("ux_courses_workspace_slug").on(table.workspaceId, table.slug),
    index("ix_courses_workspace_position").on(
      table.workspaceId,
      table.position
    ),
    check(
      "courses_access_check",
      sql`${table.access} IN ('everyone', 'members', 'paid')`
    ),
    check(
      "courses_status_check",
      sql`${table.status} IN ('draft', 'published')`
    ),
  ]
)

/** A part heading chapters sit under, such as "Part 1: Setup". */
export const courseGroups = pgTable(
  "course_groups",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    courseId: varchar("course_id", { length: 36 })
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 200 }).notNull(),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [index("ix_course_groups_course").on(table.courseId)]
)

export const courseChapters = pgTable(
  "course_chapters",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    courseId: varchar("course_id", { length: 36 })
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    /** The part it sits under, or null for the chapters above every part. */
    groupId: varchar("group_id", { length: 36 }).references(
      () => courseGroups.id,
      { onDelete: "set null" }
    ),
    title: varchar("title", { length: 200 }).notNull(),
    /** The address part after /courses/<course>/, unique per course. */
    slug: varchar("slug", { length: 160 }).notNull(),
    /** The editor's document tree, cleaned by `lib/courses/chapter-body.ts`. */
    body: jsonb("body").notNull(),
    /** Worked out on every save, so the chapter list never reads every body. */
    readMinutes: integer("read_minutes").notNull().default(1),
    /** Order inside its part, or among the chapters above every part. */
    position: integer("position").notNull().default(0),
    status: varchar("status", { length: 20 }).notNull().default("draft"),
    /** Open to anyone, whatever the course's own access says. */
    isPreview: boolean("is_preview").notNull().default(false),
    /** Days after a member first opens the course before this one opens. */
    opensAfterDays: integer("opens_after_days"),
    /** A published chapter stays hidden until this moment, when set. */
    publishAt: timestamp("publish_at", { withTimezone: true }),
    /** The chapter read aloud, a media-library address, or empty. */
    audioUrl: varchar("audio_url", { length: 600 }).notNull().default(""),
    /** Which version of the words the audio was made from. */
    audioTextHash: varchar("audio_text_hash", { length: 64 })
      .notNull()
      .default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("ux_course_chapters_course_slug").on(
      table.courseId,
      table.slug
    ),
    index("ix_course_chapters_course").on(table.courseId, table.position),
    check(
      "course_chapters_status_check",
      sql`${table.status} IN ('draft', 'published')`
    ),
    check(
      "course_chapters_opens_after_check",
      sql`${table.opensAfterDays} IS NULL OR ${table.opensAfterDays} BETWEEN 1 AND 365`
    ),
  ]
)

/**
 * One member's place in one course: when they first opened it, which is what
 * "opens after N days" counts from, and the chapter they last opened.
 */
export const courseStarts = pgTable(
  "course_starts",
  {
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    courseId: varchar("course_id", { length: 36 })
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    lastChapterId: varchar("last_chapter_id", { length: 36 }).references(
      () => courseChapters.id,
      { onDelete: "set null" }
    ),
    lastOpenedAt: timestamp("last_opened_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.courseId] }),
    index("ix_course_starts_course").on(table.courseId),
  ]
)

/** One row per member per chapter they opened, for the course's stats. */
export const courseChapterViews = pgTable(
  "course_chapter_views",
  {
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    chapterId: varchar("chapter_id", { length: 36 })
      .notNull()
      .references(() => courseChapters.id, { onDelete: "cascade" }),
    firstViewedAt: timestamp("first_viewed_at", {
      withTimezone: true,
    }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.chapterId] }),
    index("ix_course_chapter_views_chapter").on(table.chapterId),
  ]
)

/** A chapter a member marked done. */
export const courseChapterProgress = pgTable(
  "course_chapter_progress",
  {
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    chapterId: varchar("chapter_id", { length: 36 })
      .notNull()
      .references(() => courseChapters.id, { onDelete: "cascade" }),
    finishedAt: timestamp("finished_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.chapterId] }),
    index("ix_course_chapter_progress_chapter").on(table.chapterId),
  ]
)

/** A chapter a member saved to their Saved list. */
export const courseBookmarks = pgTable(
  "course_bookmarks",
  {
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    chapterId: varchar("chapter_id", { length: 36 })
      .notNull()
      .references(() => courseChapters.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.chapterId] })]
)

/** A member's own notes beside a chapter. Nobody else ever reads them. */
export const courseNotes = pgTable(
  "course_notes",
  {
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    chapterId: varchar("chapter_id", { length: 36 })
      .notNull()
      .references(() => courseChapters.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.chapterId] })]
)

/**
 * What a member did with one checklist item or one quiz question, keyed by
 * the item's own id inside the chapter, so editing the list never moves a tick
 * onto a different line.
 */
export const courseBlockAnswers = pgTable(
  "course_block_answers",
  {
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    chapterId: varchar("chapter_id", { length: 36 })
      .notNull()
      .references(() => courseChapters.id, { onDelete: "cascade" }),
    /** 'checklist' (a ticked item) or 'quiz' (the choice picked). */
    kind: varchar("kind", { length: 20 }).notNull(),
    itemId: varchar("item_id", { length: 32 }).notNull(),
    /** The quiz choice's id. Empty for a ticked checklist item. */
    choiceId: varchar("choice_id", { length: 32 }).notNull().default(""),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.userId, table.chapterId, table.kind, table.itemId],
    }),
    check(
      "course_block_answers_kind_check",
      sql`${table.kind} IN ('checklist', 'quiz')`
    ),
  ]
)

/**
 * A question a member asked under a chapter, and the admin's one answer.
 * Every reader of the chapter sees both.
 */
export const courseQuestions = pgTable(
  "course_questions",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    chapterId: varchar("chapter_id", { length: 36 })
      .notNull()
      .references(() => courseChapters.id, { onDelete: "cascade" }),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    answer: text("answer").notNull().default(""),
    answeredAt: timestamp("answered_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("ix_course_questions_chapter").on(table.chapterId, table.createdAt),
  ]
)

export type CourseRow = typeof courses.$inferSelect
export type CourseGroupRow = typeof courseGroups.$inferSelect
export type CourseChapterRow = typeof courseChapters.$inferSelect
