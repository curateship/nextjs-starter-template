import { and, asc, desc, eq, inArray } from "drizzle-orm"

import {
  chapterBodyText,
  chapterQuizQuestions,
  cleanChapterBody,
  publicChapterBody,
} from "@/lib/courses/chapter-body"
import {
  chapterAccess,
  courseLock,
  isCourseAccess,
  SIGNED_OUT_VIEWER,
  type ChapterAccess,
  type CourseViewer,
} from "@/lib/courses/course-access"
import { orderedChapters } from "@/lib/courses/course-outline"
import type {
  ChapterMemberState,
  ChapterPage,
  ChapterQuestion,
  CourseIntroPage,
  PublicCourseCard,
  QuizResult,
  ReaderChapterLink,
  ReaderCourse,
  ReaderOutline,
  ReaderViewer,
  SavedChapter,
} from "@/lib/courses/course-types"
import { findCurrentUser, isAdmin, now } from "@/server/auth/security"
import { loadEntitlements } from "@/server/billing/entitlements"
import { getDefaultPlan } from "@/server/billing/plans"
import { textHash } from "@/server/courses/text-hash"
import { db, type CustomShellDb } from "@/server/db"
import {
  courseBlockAnswers,
  courseBookmarks,
  courseChapterProgress,
  courseChapters,
  courseChapterViews,
  courseGroups,
  courseNotes,
  courseQuestions,
  courses,
  courseStarts,
  type CourseChapterRow,
  type CourseRow,
} from "@/server/courses/schema"
import { customShellUsers, customShellWorkspaces } from "@/server/schema"

/**
 * The reader's side of courses: what one person may see on the visited site.
 *
 * Every rule comes from `lib/courses/course-access.ts`. A locked chapter is
 * sent without its words, and a quiz without its answers, so nothing the
 * person may not read ever leaves the server. A draft course, another site's
 * course and one that does not exist all answer null, the same as each other.
 */

/** Who is reading, and what their account unlocks. */
export type Reader = {
  userId: string | null
  rules: CourseViewer
  viewer: ReaderViewer
}

/**
 * The person on this request. An admin who asked to read as a free member is
 * given a free member's rules, and nothing they do is recorded, because an
 * admin's own reading must not count as a reader.
 */
export async function currentReader(
  previewAsFree: boolean,
  database: CustomShellDb = db
): Promise<Reader> {
  const user = await findCurrentUser(database).catch(() => null)
  if (!user) {
    return {
      userId: null,
      rules: SIGNED_OUT_VIEWER,
      viewer: { signedIn: false, isAdmin: false, previewingAsFree: false },
    }
  }
  const admin = isAdmin(user)
  if (admin && previewAsFree) {
    const freePlan = await getDefaultPlan(database)
    return {
      userId: user.id,
      rules: {
        signedIn: true,
        isAdmin: false,
        isPaid: false,
        planId: freePlan?.id ?? null,
      },
      viewer: { signedIn: true, isAdmin: true, previewingAsFree: true },
    }
  }
  const { entitlements } = admin
    ? { entitlements: null }
    : await loadEntitlements(user.id, database)
  return {
    userId: user.id,
    rules: {
      signedIn: true,
      isAdmin: admin,
      isPaid: entitlements?.isPaid ?? false,
      planId: entitlements?.planId ?? null,
    },
    viewer: { signedIn: true, isAdmin: admin, previewingAsFree: false },
  }
}

/** True when what this person does should be written down. */
function recordsFor(reader: Reader): reader is Reader & { userId: string } {
  return Boolean(reader.userId) && !reader.viewer.isAdmin
}

function courseRules(row: CourseRow) {
  return {
    access: isCourseAccess(row.access) ? row.access : "everyone",
    planIds: Array.isArray(row.planIds) ? row.planIds : [],
  } as const
}

/**
 * A chapter as the outline needs it: everything except its words and audio,
 * which only the one chapter being read ever needs. Reading every chapter's
 * text to draw a list of titles would make every page of a long course slow.
 */
const OUTLINE_COLUMNS = {
  id: courseChapters.id,
  courseId: courseChapters.courseId,
  groupId: courseChapters.groupId,
  title: courseChapters.title,
  slug: courseChapters.slug,
  readMinutes: courseChapters.readMinutes,
  position: courseChapters.position,
  status: courseChapters.status,
  isPreview: courseChapters.isPreview,
  opensAfterDays: courseChapters.opensAfterDays,
  publishAt: courseChapters.publishAt,
}

type OutlineChapter = Pick<CourseChapterRow, keyof typeof OUTLINE_COLUMNS>

function chapterRules(row: OutlineChapter) {
  return {
    status: row.status === "published" ? "published" : "draft",
    isPreview: row.isPreview,
    opensAfterDays: row.opensAfterDays,
    publishAt: row.publishAt,
  } as const
}

function toReaderCourse(row: CourseRow, reader: Reader): ReaderCourse {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    image: row.image,
    access: courseRules(row).access,
    lock: courseLock(courseRules(row), reader.rules),
  }
}

/** The site's own name, as the bell and the page titles say it. */
export async function siteName(workspaceId: string, database: CustomShellDb = db) {
  const [row] = await database
    .select({ name: customShellWorkspaces.name })
    .from(customShellWorkspaces)
    .where(eq(customShellWorkspaces.id, workspaceId))
    .limit(1)
  return row?.name ?? ""
}

/** A published course on this site, or null. An admin also gets drafts. */
async function findReadableCourse(
  workspaceId: string,
  slug: string,
  reader: Reader,
  database: CustomShellDb
): Promise<CourseRow | null> {
  const [row] = await database
    .select()
    .from(courses)
    .where(and(eq(courses.workspaceId, workspaceId), eq(courses.slug, slug)))
    .limit(1)
  if (!row) return null
  if (row.status !== "published" && !reader.rules.isAdmin) return null
  return row
}

async function startedAtFor(
  userId: string | null,
  courseId: string,
  database: CustomShellDb
) {
  if (!userId) return null
  const [row] = await database
    .select()
    .from(courseStarts)
    .where(and(eq(courseStarts.userId, userId), eq(courseStarts.courseId, courseId)))
    .limit(1)
  return row ?? null
}

/**
 * This person's place in the course, starting it if this is their first
 * visit. Opening any page of a course counts as opening it, including a
 * chapter that is still held back, so the clock that opens it has started.
 */
async function startedFor(reader: Reader, course: CourseRow, database: CustomShellDb) {
  const start = await startedAtFor(reader.userId, course.id, database)
  if (start) return start
  await noteVisit(reader, course, null, database)
  return startedAtFor(reader.userId, course.id, database)
}

/**
 * The course's chapters as this person sees them: every chapter they may know
 * about, in reading order, each saying whether it is open and why not.
 */
async function buildOutline(
  course: CourseRow,
  reader: Reader,
  startedAt: Date | null,
  at: Date,
  database: CustomShellDb
): Promise<{
  outline: ReaderOutline
  rows: { row: OutlineChapter; access: ChapterAccess }[]
}> {
  const [groups, chapters] = await Promise.all([
    database
      .select()
      .from(courseGroups)
      .where(eq(courseGroups.courseId, course.id))
      .orderBy(asc(courseGroups.position)),
    database
      .select(OUTLINE_COLUMNS)
      .from(courseChapters)
      .where(eq(courseChapters.courseId, course.id)),
  ])
  const done = reader.userId
    ? new Set(
        (
          await database
            .select({ chapterId: courseChapterProgress.chapterId })
            .from(courseChapterProgress)
            .where(
              and(
                eq(courseChapterProgress.userId, reader.userId),
                inArray(
                  courseChapterProgress.chapterId,
                  chapters.map((chapter) => chapter.id).concat("")
                )
              )
            )
        ).map((row) => row.chapterId)
      )
    : new Set<string>()

  const rows = orderedChapters(groups, chapters)
    .map((row) => ({
      row,
      access: chapterAccess(
        courseRules(course),
        chapterRules(row),
        reader.rules,
        startedAt,
        at
      ),
    }))
    // A reader is never told about a draft or a chapter not out yet.
    .filter(({ access }) => access.kind !== "hidden")

  const links: ReaderChapterLink[] = rows.map(({ row, access }) => ({
    id: row.id,
    slug: row.slug,
    title: row.title,
    readMinutes: row.readMinutes,
    groupId: row.groupId,
    open: access.kind === "open",
    lockReason: access.kind === "locked" ? access.reason : null,
    opensAt: access.kind === "locked" ? access.opensAt : null,
    isPreview: row.isPreview,
    done: done.has(row.id),
    draft: reader.rules.isAdmin && row.status !== "published",
    scheduledFor:
      reader.rules.isAdmin && row.publishAt && row.publishAt.getTime() > at.getTime()
        ? row.publishAt
        : null,
  }))

  // A part with nothing this person may see in it is left out too.
  const usedGroups = new Set(links.map((link) => link.groupId))
  return {
    outline: {
      groups: groups
        .filter((group) => usedGroups.has(group.id))
        .map((group) => ({ id: group.id, title: group.title })),
      chapters: links,
    },
    rows,
  }
}

/**
 * Starts this person's clock on a course the first time they open it, and
 * remembers the chapter they are on. A free member reading a paid course's
 * free preview counts too: they opened the course, and the stats should say
 * so. Nobody signed out and no admin is ever written down.
 */
async function noteVisit(
  reader: Reader,
  course: CourseRow,
  chapterId: string | null,
  database: CustomShellDb
): Promise<Date | null> {
  if (!recordsFor(reader)) return null
  const at = now()
  const [row] = await database
    .insert(courseStarts)
    .values({
      userId: reader.userId,
      courseId: course.id,
      startedAt: at,
      lastChapterId: chapterId,
      lastOpenedAt: at,
    })
    .onConflictDoUpdate({
      target: [courseStarts.userId, courseStarts.courseId],
      set: chapterId
        ? { lastChapterId: chapterId, lastOpenedAt: at }
        : { lastOpenedAt: at },
    })
    .returning({ startedAt: courseStarts.startedAt })
  if (chapterId) {
    await database
      .insert(courseChapterViews)
      .values({ userId: reader.userId, chapterId, firstViewedAt: at })
      .onConflictDoNothing()
  }
  return row?.startedAt ?? at
}

/** /courses: every published course on the site, in the admin's order. */
export async function readPublicCourses(
  workspaceId: string,
  reader: Reader,
  database: CustomShellDb = db
): Promise<{ siteName: string; courses: PublicCourseCard[]; viewer: ReaderViewer }> {
  return {
    siteName: await siteName(workspaceId, database),
    courses: await readCourseCards(
      workspaceId,
      reader,
      { drafts: reader.rules.isAdmin, limit: 200 },
      database
    ),
    viewer: reader.viewer,
  }
}

/**
 * One card per course on this site, in the admin's order, as this person sees
 * them. `drafts` is only ever true for an admin on `/courses`; the front page
 * row asks for published courses alone, because a draft's card on the site's
 * home page reads as a mistake even to the admin who wrote it.
 */
export async function readCourseCards(
  workspaceId: string,
  reader: Reader,
  options: { drafts: boolean; limit: number },
  database: CustomShellDb = db
): Promise<PublicCourseCard[]> {
  const at = now()
  const rows = await database
    .select()
    .from(courses)
    .where(
      and(
        eq(courses.workspaceId, workspaceId),
        options.drafts ? undefined : eq(courses.status, "published")
      )
    )
    .orderBy(asc(courses.position), asc(courses.title))
    .limit(options.limit)

  const ids = rows.map((row) => row.id).concat("")
  const chapters = await database
    .select(OUTLINE_COLUMNS)
    .from(courseChapters)
    .where(inArray(courseChapters.courseId, ids))
  const [starts, done] = await Promise.all([
    reader.userId
      ? database
          .select({ courseId: courseStarts.courseId })
          .from(courseStarts)
          .where(
            and(
              eq(courseStarts.userId, reader.userId),
              inArray(courseStarts.courseId, ids)
            )
          )
      : [],
    reader.userId
      ? database
          .select({ chapterId: courseChapterProgress.chapterId })
          .from(courseChapterProgress)
          .where(
            and(
              eq(courseChapterProgress.userId, reader.userId),
              inArray(
                courseChapterProgress.chapterId,
                chapters.map((chapter) => chapter.id).concat("")
              )
            )
          )
      : [],
  ])
  const started = new Set(starts.map((row) => row.courseId))
  const finished = new Set(done.map((row) => row.chapterId))

  return rows.map((row): PublicCourseCard => {
    // Counted the way the reader would see them: drafts and chapters not out
    // yet are not part of the course for a visitor.
    const live = chapters.filter(
      (chapter) =>
        chapter.courseId === row.id &&
        (reader.rules.isAdmin ||
          chapterAccess(courseRules(row), chapterRules(chapter), reader.rules, null, at)
            .kind !== "hidden")
    )
    return {
      slug: row.slug,
      title: row.title,
      description: row.description,
      image: row.image,
      access: courseRules(row).access,
      chapterCount: live.length,
      readMinutes: live.reduce((total, chapter) => total + chapter.readMinutes, 0),
      lock: courseLock(courseRules(row), reader.rules),
      doneCount: live.filter((chapter) => finished.has(chapter.id)).length,
      started: started.has(row.id),
    }
  })
}

/** /courses/<course>: the intro page, and the chapter "Keep reading" opens. */
export async function readCourseIntro(
  workspaceId: string,
  slug: string,
  reader: Reader,
  database: CustomShellDb = db
): Promise<CourseIntroPage | null> {
  const course = await findReadableCourse(workspaceId, slug, reader, database)
  if (!course) return null
  const start = await startedFor(reader, course, database)
  const { outline } = await buildOutline(
    course,
    reader,
    start?.startedAt ?? null,
    now(),
    database
  )
  const open = outline.chapters.filter((chapter) => chapter.open)
  const last = start?.lastChapterId
    ? open.find((chapter) => chapter.id === start.lastChapterId)
    : undefined
  // Back to where they stopped, or the first chapter not yet done, or the first.
  const resume =
    last ?? open.find((chapter) => !chapter.done) ?? open[0] ?? null

  return {
    siteName: await siteName(workspaceId, database),
    course: toReaderCourse(course, reader),
    outline,
    viewer: reader.viewer,
    resumeChapterSlug: resume?.slug ?? null,
    started: Boolean(start),
  }
}

async function memberState(
  userId: string,
  chapterId: string,
  quizKey: ReturnType<typeof chapterQuizQuestions>,
  database: CustomShellDb
): Promise<ChapterMemberState> {
  const [done, bookmark, note, answers] = await Promise.all([
    database
      .select({ chapterId: courseChapterProgress.chapterId })
      .from(courseChapterProgress)
      .where(
        and(
          eq(courseChapterProgress.userId, userId),
          eq(courseChapterProgress.chapterId, chapterId)
        )
      )
      .limit(1),
    database
      .select({ chapterId: courseBookmarks.chapterId })
      .from(courseBookmarks)
      .where(
        and(eq(courseBookmarks.userId, userId), eq(courseBookmarks.chapterId, chapterId))
      )
      .limit(1),
    database
      .select({ body: courseNotes.body })
      .from(courseNotes)
      .where(and(eq(courseNotes.userId, userId), eq(courseNotes.chapterId, chapterId)))
      .limit(1),
    database
      .select()
      .from(courseBlockAnswers)
      .where(
        and(
          eq(courseBlockAnswers.userId, userId),
          eq(courseBlockAnswers.chapterId, chapterId)
        )
      ),
  ])

  const quiz: Record<string, QuizResult> = {}
  for (const answer of answers) {
    if (answer.kind !== "quiz") continue
    const question = quizKey.get(answer.itemId)
    // An answer to a question that has since been removed is not shown.
    if (!question) continue
    quiz[answer.itemId] = {
      choiceId: answer.choiceId,
      correct: answer.choiceId === question.answerId,
      rightChoiceId: question.answerId,
    }
  }

  return {
    done: done.length > 0,
    bookmarked: bookmark.length > 0,
    note: note[0]?.body ?? "",
    ticks: answers
      .filter((answer) => answer.kind === "checklist")
      .map((answer) => answer.itemId),
    quiz,
  }
}

export async function chapterQuestions(
  chapterId: string,
  userId: string | null,
  database: CustomShellDb = db
): Promise<ChapterQuestion[]> {
  const rows = await database
    .select({
      id: courseQuestions.id,
      body: courseQuestions.body,
      answer: courseQuestions.answer,
      createdAt: courseQuestions.createdAt,
      answeredAt: courseQuestions.answeredAt,
      userId: courseQuestions.userId,
      name: customShellUsers.name,
    })
    .from(courseQuestions)
    .innerJoin(customShellUsers, eq(customShellUsers.id, courseQuestions.userId))
    .where(eq(courseQuestions.chapterId, chapterId))
    .orderBy(desc(courseQuestions.createdAt))
    .limit(200)
  return rows.map((row) => ({
    id: row.id,
    body: row.body,
    // A first name is enough to say who asked; nobody else's email is shown.
    askerName: row.name?.trim().split(/\s+/)[0] || "A member",
    mine: row.userId === userId,
    answer: row.answer,
    createdAt: row.createdAt,
    answeredAt: row.answeredAt,
  }))
}

/** /courses/<course>/<chapter>. */
export async function readChapter(
  workspaceId: string,
  courseSlug: string,
  chapterSlug: string,
  reader: Reader,
  database: CustomShellDb = db
): Promise<ChapterPage | null> {
  const course = await findReadableCourse(workspaceId, courseSlug, reader, database)
  if (!course) return null
  const at = now()
  const start = await startedFor(reader, course, database)
  const { outline, rows } = await buildOutline(
    course,
    reader,
    start?.startedAt ?? null,
    at,
    database
  )
  const index = rows.findIndex(({ row }) => row.slug === chapterSlug)
  if (index === -1) return null
  const { row, access } = rows[index]
  const open = access.kind === "open"

  if (open) await noteVisit(reader, course, row.id, database)

  // The words and audio of this one chapter, and only when it is open.
  const [words] = open
    ? await database
        .select({
          body: courseChapters.body,
          audioUrl: courseChapters.audioUrl,
          audioTextHash: courseChapters.audioTextHash,
        })
        .from(courseChapters)
        .where(eq(courseChapters.id, row.id))
        .limit(1)
    : []
  const body = cleanChapterBody(words?.body)
  const previous = index > 0 ? rows[index - 1].row : null
  const nextRow = index < rows.length - 1 ? rows[index + 1] : null

  return {
    siteName: await siteName(workspaceId, database),
    course: toReaderCourse(course, reader),
    outline,
    viewer: reader.viewer,
    chapter: {
      id: row.id,
      slug: row.slug,
      title: row.title,
      readMinutes: row.readMinutes,
      body: open ? publicChapterBody(body) : null,
      lockReason: access.kind === "locked" ? access.reason : null,
      opensAt: access.kind === "locked" ? access.opensAt : null,
      // Audio made from an older version of the words would read the wrong
      // chapter aloud, so it is only offered while it still matches.
      audioUrl:
        words?.audioUrl && words.audioTextHash === textHash(chapterBodyText(body))
          ? words.audioUrl
          : "",
    },
    previous: previous ? { slug: previous.slug, title: previous.title } : null,
    next: nextRow
      ? {
          slug: nextRow.row.slug,
          title: nextRow.row.title,
          open: nextRow.access.kind === "open",
        }
      : null,
    member:
      open && reader.userId
        ? await memberState(reader.userId, row.id, chapterQuizQuestions(body), database)
        : null,
    questions: open ? await chapterQuestions(row.id, reader.userId, database) : [],
    finishedCourse:
      Boolean(reader.userId) &&
      outline.chapters.length > 0 &&
      outline.chapters.every((chapter) => chapter.done),
    nextCourse: await courseAfter(workspaceId, course, database),
  }
}

/**
 * The next published course after this one in the admin's order, going round
 * to the first, for the finished-course screen to point to.
 */
async function courseAfter(
  workspaceId: string,
  course: CourseRow,
  database: CustomShellDb
): Promise<{ slug: string; title: string } | null> {
  const rows = await database
    .select({ id: courses.id, slug: courses.slug, title: courses.title })
    .from(courses)
    .where(and(eq(courses.workspaceId, workspaceId), eq(courses.status, "published")))
    .orderBy(asc(courses.position), asc(courses.title))
    .limit(200)
  const at = rows.findIndex((row) => row.id === course.id)
  const others = [...rows.slice(at + 1), ...rows.slice(0, Math.max(at, 0))].filter(
    (row) => row.id !== course.id
  )
  return others[0] ? { slug: others[0].slug, title: others[0].title } : null
}

/**
 * A chapter this person may act on, for every member action: ticking it done,
 * saving a note, answering a quiz, asking a question. The same rule as
 * reading it, so a locked chapter cannot be written to by calling the door
 * directly.
 */
export async function requireOpenChapter(
  workspaceId: string,
  chapterId: string,
  reader: Reader,
  database: CustomShellDb = db
): Promise<{ course: CourseRow; chapter: CourseChapterRow }> {
  const [found] = await database
    .select({ course: courses, chapter: courseChapters })
    .from(courseChapters)
    .innerJoin(courses, eq(courses.id, courseChapters.courseId))
    .where(
      and(eq(courseChapters.id, chapterId), eq(courses.workspaceId, workspaceId))
    )
    .limit(1)
  const refused = new Error("That chapter isn't open to you. Refresh the page.")
  if (!found) throw refused
  if (found.course.status !== "published" && !reader.rules.isAdmin) throw refused
  const start = await startedAtFor(reader.userId, found.course.id, database)
  const access = chapterAccess(
    courseRules(found.course),
    chapterRules(found.chapter),
    reader.rules,
    start?.startedAt ?? null,
    now()
  )
  if (access.kind !== "open") throw refused
  return found
}

/**
 * The stable address in a chapter link (`/courses/to/<id>`), turned into the
 * chapter's current one, so renaming a chapter never breaks a link to it.
 */
export async function chapterAddress(
  workspaceId: string,
  chapterId: string,
  reader: Reader,
  database: CustomShellDb = db
): Promise<string | null> {
  const [found] = await database
    .select({
      courseSlug: courses.slug,
      courseStatus: courses.status,
      chapterSlug: courseChapters.slug,
    })
    .from(courseChapters)
    .innerJoin(courses, eq(courses.id, courseChapters.courseId))
    .where(
      and(eq(courseChapters.id, chapterId), eq(courses.workspaceId, workspaceId))
    )
    .limit(1)
  if (!found) return null
  if (found.courseStatus !== "published" && !reader.rules.isAdmin) return null
  return `/courses/${found.courseSlug}/${found.chapterSlug}`
}

/** The member's Saved list, newest first, leaving out anything now gone. */
export async function readSavedChapters(
  workspaceId: string,
  userId: string,
  database: CustomShellDb = db
): Promise<SavedChapter[]> {
  const rows = await database
    .select({
      courseSlug: courses.slug,
      courseTitle: courses.title,
      courseStatus: courses.status,
      chapterSlug: courseChapters.slug,
      chapterTitle: courseChapters.title,
      chapterStatus: courseChapters.status,
      savedAt: courseBookmarks.createdAt,
    })
    .from(courseBookmarks)
    .innerJoin(courseChapters, eq(courseChapters.id, courseBookmarks.chapterId))
    .innerJoin(courses, eq(courses.id, courseChapters.courseId))
    .where(
      and(eq(courseBookmarks.userId, userId), eq(courses.workspaceId, workspaceId))
    )
    .orderBy(desc(courseBookmarks.createdAt))
    .limit(500)
  return rows
    .filter(
      (row) => row.courseStatus === "published" && row.chapterStatus === "published"
    )
    .map(({ courseStatus: _c, chapterStatus: _s, ...row }) => row)
}
