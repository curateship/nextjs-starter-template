import { and, count, eq, gt, sql } from "drizzle-orm"

import {
  chapterChecklistItemIds,
  chapterQuizQuestions,
  cleanChapterBody,
} from "@/lib/courses/chapter-body"
import type { ChapterQuestion, QuizResult } from "@/lib/courses/course-types"
import { now, uuid } from "@/server/auth/security"
import { chapterQuestions, requireOpenChapter, type Reader } from "@/server/courses/reader"
import { db, type CustomShellDb } from "@/server/db"
import { publishNotificationCreatedMany } from "@/server/notifications/events"
import {
  courseBlockAnswers,
  courseBookmarks,
  courseChapterProgress,
  courseChapters,
  courseNotes,
  courseQuestions,
  courses,
} from "@/server/courses/schema"
import { customShellNotifications, customShellUsers } from "@/server/schema"

/**
 * What a member does inside a chapter. Each one first asks
 * `requireOpenChapter`, the same rule as reading the chapter, so nobody can
 * tick, note or ask on a chapter they may not read by calling the door
 * directly. An admin reading as a free member is refused here too: nothing
 * done in a preview is kept.
 */

export const MAX_NOTE_LENGTH = 10_000
export const MAX_QUESTION_LENGTH = 2_000
export const MAX_QUESTIONS_AN_HOUR = 10

type Member = Reader & { userId: string }

function requireMember(reader: Reader): Member {
  if (!reader.userId) throw new Error("Sign in to keep your place in a course.")
  if (reader.viewer.previewingAsFree) {
    throw new Error("Nothing is saved while you read as a free member.")
  }
  return reader as Member
}

export async function setChapterDone(
  workspaceId: string,
  reader: Reader,
  chapterId: string,
  done: boolean,
  database: CustomShellDb = db
): Promise<void> {
  const member = requireMember(reader)
  await requireOpenChapter(workspaceId, chapterId, member, database)
  if (done) {
    await database
      .insert(courseChapterProgress)
      .values({ userId: member.userId, chapterId, finishedAt: now() })
      .onConflictDoNothing()
    return
  }
  await database
    .delete(courseChapterProgress)
    .where(
      and(
        eq(courseChapterProgress.userId, member.userId),
        eq(courseChapterProgress.chapterId, chapterId)
      )
    )
}

export async function setBookmark(
  workspaceId: string,
  reader: Reader,
  chapterId: string,
  saved: boolean,
  database: CustomShellDb = db
): Promise<void> {
  const member = requireMember(reader)
  await requireOpenChapter(workspaceId, chapterId, member, database)
  if (saved) {
    await database
      .insert(courseBookmarks)
      .values({ userId: member.userId, chapterId, createdAt: now() })
      .onConflictDoNothing()
    return
  }
  await database
    .delete(courseBookmarks)
    .where(
      and(
        eq(courseBookmarks.userId, member.userId),
        eq(courseBookmarks.chapterId, chapterId)
      )
    )
}

/** Saves the member's note. An empty note is removed rather than kept blank. */
export async function saveNote(
  workspaceId: string,
  reader: Reader,
  chapterId: string,
  body: string,
  database: CustomShellDb = db
): Promise<void> {
  const member = requireMember(reader)
  await requireOpenChapter(workspaceId, chapterId, member, database)
  const text = body.slice(0, MAX_NOTE_LENGTH)
  if (!text.trim()) {
    await database
      .delete(courseNotes)
      .where(
        and(eq(courseNotes.userId, member.userId), eq(courseNotes.chapterId, chapterId))
      )
    return
  }
  const at = now()
  await database
    .insert(courseNotes)
    .values({ userId: member.userId, chapterId, body: text, updatedAt: at })
    .onConflictDoUpdate({
      target: [courseNotes.userId, courseNotes.chapterId],
      set: { body: text, updatedAt: at },
    })
}

export async function tickChecklistItem(
  workspaceId: string,
  reader: Reader,
  chapterId: string,
  itemId: string,
  ticked: boolean,
  database: CustomShellDb = db
): Promise<void> {
  const member = requireMember(reader)
  const { chapter } = await requireOpenChapter(workspaceId, chapterId, member, database)
  if (!chapterChecklistItemIds(cleanChapterBody(chapter.body)).has(itemId)) {
    throw new Error("That item is no longer on the checklist. Refresh the page.")
  }
  const where = and(
    eq(courseBlockAnswers.userId, member.userId),
    eq(courseBlockAnswers.chapterId, chapterId),
    eq(courseBlockAnswers.kind, "checklist"),
    eq(courseBlockAnswers.itemId, itemId)
  )
  if (!ticked) {
    await database.delete(courseBlockAnswers).where(where)
    return
  }
  await database
    .insert(courseBlockAnswers)
    .values({
      userId: member.userId,
      chapterId,
      kind: "checklist",
      itemId,
      updatedAt: now(),
    })
    .onConflictDoNothing()
}

/**
 * Checks a quiz's answers on the server, where the right answers are, saves
 * them, and says which were right. Questions the member left blank are left
 * out of the answer rather than counted wrong.
 */
export async function answerQuiz(
  workspaceId: string,
  reader: Reader,
  chapterId: string,
  answers: Record<string, string>,
  database: CustomShellDb = db
): Promise<Record<string, QuizResult>> {
  const member = requireMember(reader)
  const { chapter } = await requireOpenChapter(workspaceId, chapterId, member, database)
  const questions = chapterQuizQuestions(cleanChapterBody(chapter.body))

  const results: Record<string, QuizResult> = {}
  const rows: (typeof courseBlockAnswers.$inferInsert)[] = []
  const at = now()
  for (const [questionId, choiceId] of Object.entries(answers)) {
    const question = questions.get(questionId)
    if (!question || !question.choices.some((choice) => choice.id === choiceId)) {
      continue
    }
    results[questionId] = {
      choiceId,
      correct: choiceId === question.answerId,
      rightChoiceId: question.answerId,
    }
    rows.push({
      userId: member.userId,
      chapterId,
      kind: "quiz",
      itemId: questionId,
      choiceId,
      updatedAt: at,
    })
  }
  if (rows.length === 0) {
    throw new Error("Pick an answer to at least one question first.")
  }
  await database
    .insert(courseBlockAnswers)
    .values(rows)
    .onConflictDoUpdate({
      target: [
        courseBlockAnswers.userId,
        courseBlockAnswers.chapterId,
        courseBlockAnswers.kind,
        courseBlockAnswers.itemId,
      ],
      // The choice each row carried, rather than one value for them all.
      set: { choiceId: sql`excluded."choice_id"`, updatedAt: at },
    })
  return results
}

/**
 * Asks a question under a chapter. Every admin on the site is told in their
 * bell, with the course and chapter named, so it can be answered from the
 * course's Questions tab.
 */
export async function askQuestion(
  workspaceId: string,
  reader: Reader,
  chapterId: string,
  body: string,
  database: CustomShellDb = db
): Promise<ChapterQuestion[]> {
  const member = requireMember(reader)
  const text = body.trim().slice(0, MAX_QUESTION_LENGTH)
  if (!text) throw new Error("Write your question first.")
  const { course, chapter } = await requireOpenChapter(
    workspaceId,
    chapterId,
    member,
    database
  )
  const at = now()
  // Each question rings every admin's bell, so one member cannot send a flood.
  const [recent] = await database
    .select({ total: count() })
    .from(courseQuestions)
    .where(
      and(
        eq(courseQuestions.userId, member.userId),
        gt(courseQuestions.createdAt, new Date(at.getTime() - 60 * 60 * 1000))
      )
    )
  if (Number(recent?.total ?? 0) >= MAX_QUESTIONS_AN_HOUR) {
    throw new Error(
      `You can ask ${MAX_QUESTIONS_AN_HOUR} questions an hour. Please wait a little and ask again.`
    )
  }
  await database.insert(courseQuestions).values({
    id: uuid(),
    chapterId,
    userId: member.userId,
    body: text,
    createdAt: at,
  })

  try {
    const admins = await database
      .select({ id: customShellUsers.id })
      .from(customShellUsers)
      .where(
        and(eq(customShellUsers.role, "admin"), eq(customShellUsers.status, "active"))
      )
    const recipients = admins.map((admin) => admin.id).filter((id) => id !== member.userId)
    if (recipients.length) {
      await database.insert(customShellNotifications).values(
        recipients.map((recipientUserId) => ({
          id: uuid(),
          recipientUserId,
          type: "app_activity" as const,
          message: `New question on ${chapter.title}`,
          detail: `In ${course.title}. Answer it in Courses → ${course.title} → Questions.`,
          createdAt: at,
        }))
      )
      await publishNotificationCreatedMany(recipients, database)
    }
  } catch (error) {
    // The question is saved, which is what the member asked for. A bell that
    // would not ring is logged rather than turned into their failure.
    console.error("A course question notice was not recorded", error)
  }

  return chapterQuestions(chapterId, member.userId, database)
}

/**
 * Removes the member's own question. Anybody else's is refused. It does not
 * ask whether the chapter is still open to them: a member whose plan has
 * ended can still take back words they wrote.
 */
export async function deleteOwnQuestion(
  workspaceId: string,
  reader: Reader,
  questionId: string,
  database: CustomShellDb = db
): Promise<ChapterQuestion[]> {
  const member = requireMember(reader)
  const [row] = await database
    .select({ chapterId: courseQuestions.chapterId })
    .from(courseQuestions)
    .innerJoin(courseChapters, eq(courseChapters.id, courseQuestions.chapterId))
    .innerJoin(courses, eq(courses.id, courseChapters.courseId))
    .where(
      and(
        eq(courseQuestions.id, questionId),
        eq(courseQuestions.userId, member.userId),
        eq(courses.workspaceId, workspaceId)
      )
    )
    .limit(1)
  if (!row) throw new Error("That question is already gone. Refresh the page.")
  await database
    .delete(courseQuestions)
    .where(
      and(eq(courseQuestions.id, questionId), eq(courseQuestions.userId, member.userId))
    )
  return chapterQuestions(row.chapterId, member.userId, database)
}
