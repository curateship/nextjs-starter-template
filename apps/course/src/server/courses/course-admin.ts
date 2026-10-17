import { and, count, desc, eq, inArray, isNull, ne, sql } from "drizzle-orm"

import { orderedChapters } from "@/lib/courses/course-outline"
import type { AdminQuestion, CourseStats } from "@/lib/courses/course-types"
import { now } from "@/server/auth/security"
import { findCourseRow } from "@/server/courses/courses"
import { db, type CustomShellDb } from "@/server/db"
import {
  courseChapterProgress,
  courseChapters,
  courseChapterViews,
  courseGroups,
  courseQuestions,
  courseStarts,
} from "@/server/courses/schema"
import { customShellUsers } from "@/server/schema"

/**
 * The course editor's Questions and Stats tabs. Admin only, and reached
 * through the course, so one site's admin never sees another site's members.
 */

export const MAX_ANSWER_LENGTH = 5_000

async function requireCourse(
  workspaceId: string,
  courseId: string,
  database: CustomShellDb
) {
  const row = await findCourseRow(workspaceId, courseId, database)
  if (!row) throw new Error("That course no longer exists. Refresh the list.")
  return row
}

export async function listCourseQuestions(
  workspaceId: string,
  courseId: string,
  database: CustomShellDb = db
): Promise<AdminQuestion[]> {
  await requireCourse(workspaceId, courseId, database)
  const rows = await database
    .select({
      id: courseQuestions.id,
      body: courseQuestions.body,
      answer: courseQuestions.answer,
      createdAt: courseQuestions.createdAt,
      answeredAt: courseQuestions.answeredAt,
      chapterId: courseChapters.id,
      chapterTitle: courseChapters.title,
      askerName: customShellUsers.name,
      askerEmail: customShellUsers.email,
    })
    .from(courseQuestions)
    .innerJoin(courseChapters, eq(courseChapters.id, courseQuestions.chapterId))
    .innerJoin(customShellUsers, eq(customShellUsers.id, courseQuestions.userId))
    .where(eq(courseChapters.courseId, courseId))
    // Unanswered first, then newest, which is the order they get worked through.
    .orderBy(
      sql`${courseQuestions.answeredAt} ASC NULLS FIRST`,
      desc(courseQuestions.createdAt)
    )
    .limit(500)
  return rows.map((row) => ({
    ...row,
    askerName: row.askerName?.trim() || row.askerEmail,
    mine: false,
  }))
}

export async function countUnansweredQuestions(
  workspaceId: string,
  courseId: string,
  database: CustomShellDb = db
): Promise<number> {
  await requireCourse(workspaceId, courseId, database)
  const [row] = await database
    .select({ total: count() })
    .from(courseQuestions)
    .innerJoin(courseChapters, eq(courseChapters.id, courseQuestions.chapterId))
    .where(and(eq(courseChapters.courseId, courseId), isNull(courseQuestions.answeredAt)))
  return Number(row?.total ?? 0)
}

/** A question in this course, or a refusal. */
async function requireQuestion(
  courseId: string,
  questionId: string,
  database: CustomShellDb
) {
  const [row] = await database
    .select({ id: courseQuestions.id })
    .from(courseQuestions)
    .innerJoin(courseChapters, eq(courseChapters.id, courseQuestions.chapterId))
    .where(and(eq(courseQuestions.id, questionId), eq(courseChapters.courseId, courseId)))
    .limit(1)
  if (!row) throw new Error("That question is already gone. Refresh the tab.")
}

/** Saves the answer every reader of the chapter sees. Empty takes it back. */
export async function answerQuestion(
  workspaceId: string,
  courseId: string,
  questionId: string,
  answer: string,
  database: CustomShellDb = db
): Promise<AdminQuestion[]> {
  await requireCourse(workspaceId, courseId, database)
  await requireQuestion(courseId, questionId, database)
  const text = answer.trim().slice(0, MAX_ANSWER_LENGTH)
  await database
    .update(courseQuestions)
    .set({ answer: text, answeredAt: text ? now() : null })
    .where(eq(courseQuestions.id, questionId))
  return listCourseQuestions(workspaceId, courseId, database)
}

export async function deleteQuestion(
  workspaceId: string,
  courseId: string,
  questionId: string,
  database: CustomShellDb = db
): Promise<AdminQuestion[]> {
  await requireCourse(workspaceId, courseId, database)
  await requireQuestion(courseId, questionId, database)
  await database.delete(courseQuestions).where(eq(courseQuestions.id, questionId))
  return listCourseQuestions(workspaceId, courseId, database)
}

/**
 * One row per chapter: how many members opened it, how many marked it done,
 * and how many stopped there. "Stopped here" counts members whose last opened
 * chapter is this one and who have not finished every chapter, which is
 * where readers are being lost. Admins never count, because nothing an admin
 * reads is recorded in the first place.
 */
export async function loadCourseStats(
  workspaceId: string,
  courseId: string,
  database: CustomShellDb = db
): Promise<CourseStats> {
  await requireCourse(workspaceId, courseId, database)
  const [groups, chapters, starts] = await Promise.all([
    database
      .select()
      .from(courseGroups)
      .where(eq(courseGroups.courseId, courseId)),
    database
      .select()
      .from(courseChapters)
      .where(
        and(eq(courseChapters.courseId, courseId), ne(courseChapters.status, "draft"))
      ),
    database
      .select({ userId: courseStarts.userId, lastChapterId: courseStarts.lastChapterId })
      .from(courseStarts)
      .where(eq(courseStarts.courseId, courseId)),
  ])
  const chapterIds = chapters.map((chapter) => chapter.id).concat("")
  const [views, progress] = await Promise.all([
    database
      .select({ chapterId: courseChapterViews.chapterId, userId: courseChapterViews.userId })
      .from(courseChapterViews)
      .where(inArray(courseChapterViews.chapterId, chapterIds)),
    database
      .select({
        chapterId: courseChapterProgress.chapterId,
        userId: courseChapterProgress.userId,
      })
      .from(courseChapterProgress)
      .where(inArray(courseChapterProgress.chapterId, chapterIds)),
  ])

  const finishedBy = new Map<string, number>()
  for (const row of progress) {
    finishedBy.set(row.userId, (finishedBy.get(row.userId) ?? 0) + 1)
  }
  const finishedCourse = new Set(
    [...finishedBy].filter(([, done]) => done >= chapters.length).map(([id]) => id)
  )
  const groupTitles = new Map(groups.map((group) => [group.id, group.title]))

  return {
    readers: starts.length,
    finishedCourse: chapters.length ? finishedCourse.size : 0,
    rows: orderedChapters(groups, chapters).map((chapter) => ({
      chapterId: chapter.id,
      title: chapter.title,
      groupTitle: chapter.groupId ? (groupTitles.get(chapter.groupId) ?? null) : null,
      opened: views.filter((view) => view.chapterId === chapter.id).length,
      finished: progress.filter((row) => row.chapterId === chapter.id).length,
      stoppedHere: starts.filter(
        (start) =>
          start.lastChapterId === chapter.id && !finishedCourse.has(start.userId)
      ).length,
    })),
  }
}
