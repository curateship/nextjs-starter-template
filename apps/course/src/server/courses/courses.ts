import { and, asc, count, eq, inArray, isNull, ne, sql } from "drizzle-orm"

import {
  chapterBodyText,
  chapterReadMinutes,
  cleanChapterBody,
  emptyChapterBody,
} from "@/lib/courses/chapter-body"
import { isCourseAccess, type CourseAccess, type CourseStatus } from "@/lib/courses/course-access"
import {
  orderedChapters,
  type CourseOutlineOrder,
} from "@/lib/courses/course-outline"
import { slugFromTitle, slugProblem } from "@/lib/courses/course-slugs"
import type {
  AdminChapter,
  AdminCourse,
  AdminCourseRow,
  AdminGroup,
  ChapterLinkChoice,
  PlanChoice,
} from "@/lib/courses/course-types"
import { now, uuid } from "@/server/auth/security"
import { listPlans } from "@/server/billing/plans"
import { textHash } from "@/server/courses/text-hash"
import { db, type CustomShellDb } from "@/server/db"
import {
  courseChapters,
  courseGroups,
  courses,
  courseStarts,
  type CourseChapterRow,
  type CourseRow,
} from "@/server/courses/schema"

/**
 * The admin's side of courses. Every read and write takes the site first and
 * checks the course belongs to it, so one site's courses never reach another
 * site's editor. A chapter or a part is always reached through its course for
 * the same reason.
 */

export const MAX_COURSE_TITLE = 200
export const MAX_COURSE_DESCRIPTION = 600
export const MAX_GROUP_TITLE = 200
export const MAX_COURSE_PLANS = 50

function toCourse(row: CourseRow): AdminCourse {
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    description: row.description,
    image: row.image,
    access: isCourseAccess(row.access) ? row.access : "everyone",
    planIds: Array.isArray(row.planIds) ? row.planIds : [],
    status: row.status === "published" ? "published" : "draft",
    position: row.position,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

export function toAdminChapter(row: CourseChapterRow): AdminChapter {
  const body = cleanChapterBody(row.body)
  return {
    id: row.id,
    groupId: row.groupId,
    title: row.title,
    slug: row.slug,
    body,
    readMinutes: row.readMinutes,
    position: row.position,
    status: row.status === "published" ? "published" : "draft",
    isPreview: row.isPreview,
    opensAfterDays: row.opensAfterDays,
    publishAt: row.publishAt,
    audioUrl: row.audioUrl,
    audioCurrent:
      Boolean(row.audioUrl) && row.audioTextHash === textHash(chapterBodyText(body)),
    updatedAt: row.updatedAt,
  }
}

function cleanTitle(raw: string, what: string, max: number): string {
  const title = raw.replace(/\s+/g, " ").trim().slice(0, max)
  if (!title) throw new Error(`${what} needs a name.`)
  return title
}

/** The course, if it belongs to this site. Everything else starts here. */
export async function findCourseRow(
  workspaceId: string,
  courseId: string,
  database: CustomShellDb = db
): Promise<CourseRow | null> {
  const [row] = await database
    .select()
    .from(courses)
    .where(and(eq(courses.id, courseId), eq(courses.workspaceId, workspaceId)))
    .limit(1)
  return row ?? null
}

async function requireCourseRow(
  workspaceId: string,
  courseId: string,
  database: CustomShellDb
): Promise<CourseRow> {
  const row = await findCourseRow(workspaceId, courseId, database)
  if (!row) throw new Error("That course no longer exists. Refresh the list.")
  return row
}

/** A chapter, if its course belongs to this site. */
async function requireChapterRow(
  workspaceId: string,
  chapterId: string,
  database: CustomShellDb
): Promise<CourseChapterRow> {
  const [row] = await database
    .select({ chapter: courseChapters })
    .from(courseChapters)
    .innerJoin(courses, eq(courses.id, courseChapters.courseId))
    .where(
      and(eq(courseChapters.id, chapterId), eq(courses.workspaceId, workspaceId))
    )
    .limit(1)
  if (!row) throw new Error("That chapter no longer exists. Refresh the page.")
  return row.chapter
}

async function touchCourse(courseId: string, database: CustomShellDb) {
  await database
    .update(courses)
    .set({ updatedAt: now() })
    .where(eq(courses.id, courseId))
}

/** The first free address made from a name: `setup`, then `setup-2`. */
async function freeSlug(
  base: string,
  kind: "course" | "chapter",
  taken: (slug: string) => Promise<boolean>
): Promise<string> {
  const root = base || kind
  if (!slugProblem(root, kind) && !(await taken(root))) return root
  for (let next = 2; next < 500; next += 1) {
    const slug = `${root.slice(0, 150)}-${next}`
    if (!(await taken(slug))) return slug
  }
  return `${root.slice(0, 120)}-${uuid().slice(0, 8)}`
}

async function courseSlugTaken(
  workspaceId: string,
  slug: string,
  exceptId: string | null,
  database: CustomShellDb
) {
  const [row] = await database
    .select({ id: courses.id })
    .from(courses)
    .where(
      and(
        eq(courses.workspaceId, workspaceId),
        eq(courses.slug, slug),
        exceptId ? ne(courses.id, exceptId) : undefined
      )
    )
    .limit(1)
  return Boolean(row)
}

async function chapterSlugTaken(
  courseId: string,
  slug: string,
  exceptId: string | null,
  database: CustomShellDb
) {
  const [row] = await database
    .select({ id: courseChapters.id })
    .from(courseChapters)
    .where(
      and(
        eq(courseChapters.courseId, courseId),
        eq(courseChapters.slug, slug),
        exceptId ? ne(courseChapters.id, exceptId) : undefined
      )
    )
    .limit(1)
  return Boolean(row)
}

/**
 * True while an address is still the one made from a name, rather than one an
 * admin typed: `setup`, or `setup-2` when that was taken.
 */
function slugFollowsTitle(slug: string, title: string, kind: "course" | "chapter") {
  const base = slugFromTitle(title) || kind
  if (slug === base) return true
  return slug.startsWith(`${base}-`) && /^\d+$/.test(slug.slice(base.length + 1))
}

export async function listCourses(
  workspaceId: string,
  database: CustomShellDb = db
): Promise<AdminCourseRow[]> {
  const rows = await database
    .select()
    .from(courses)
    .where(eq(courses.workspaceId, workspaceId))
    .orderBy(asc(courses.position), asc(courses.title))
    .limit(500)
  if (rows.length === 0) return []

  const ids = rows.map((row) => row.id)
  const [chapterCounts, readerCounts] = await Promise.all([
    database
      .select({
        courseId: courseChapters.courseId,
        total: count(),
        published: sql<number>`count(*) filter (where ${courseChapters.status} = 'published')::int`,
      })
      .from(courseChapters)
      .where(inArray(courseChapters.courseId, ids))
      .groupBy(courseChapters.courseId),
    database
      .select({ courseId: courseStarts.courseId, total: count() })
      .from(courseStarts)
      .where(inArray(courseStarts.courseId, ids))
      .groupBy(courseStarts.courseId),
  ])
  const chaptersBy = new Map(chapterCounts.map((row) => [row.courseId, row]))
  const readersBy = new Map(readerCounts.map((row) => [row.courseId, row.total]))

  return rows.map((row) => ({
    ...toCourse(row),
    chapterCount: Number(chaptersBy.get(row.id)?.total ?? 0),
    publishedChapterCount: Number(chaptersBy.get(row.id)?.published ?? 0),
    readerCount: Number(readersBy.get(row.id) ?? 0),
  }))
}

/**
 * A new course, as a draft with one empty chapter, so the editor opens on a
 * page to write rather than on an empty list.
 */
export async function createCourse(
  workspaceId: string,
  input: { title: string },
  database: CustomShellDb = db
): Promise<AdminCourse> {
  const title = cleanTitle(input.title, "A course", MAX_COURSE_TITLE)
  const slug = await freeSlug(slugFromTitle(title), "course", (candidate) =>
    courseSlugTaken(workspaceId, candidate, null, database)
  )
  const [{ last }] = await database
    .select({ last: sql<number>`coalesce(max(${courses.position}), -1)::int` })
    .from(courses)
    .where(eq(courses.workspaceId, workspaceId))
  const at = now()

  return database.transaction(async (tx) => {
    const [row] = await tx
      .insert(courses)
      .values({
        id: uuid(),
        workspaceId,
        title,
        slug,
        position: Number(last) + 1,
        createdAt: at,
        updatedAt: at,
      })
      .returning()
    await tx.insert(courseChapters).values({
      id: uuid(),
      courseId: row.id,
      title: "Introduction",
      slug: "introduction",
      body: emptyChapterBody(),
      createdAt: at,
      updatedAt: at,
    })
    return toCourse(row)
  })
}

export async function updateCourse(
  workspaceId: string,
  courseId: string,
  patch: {
    title?: string
    slug?: string
    description?: string
    image?: string
    access?: CourseAccess
    planIds?: string[]
    status?: CourseStatus
  },
  database: CustomShellDb = db
): Promise<AdminCourse> {
  const current = await requireCourseRow(workspaceId, courseId, database)
  const set: Partial<typeof courses.$inferInsert> = { updatedAt: now() }

  if (patch.title !== undefined) {
    set.title = cleanTitle(patch.title, "A course", MAX_COURSE_TITLE)
    // A draft's address follows its name until someone types one, so a
    // course renamed before it is published does not keep its first name's
    // address. A published course's address never moves on its own.
    if (
      patch.slug === undefined &&
      current.status === "draft" &&
      set.title !== current.title &&
      slugFollowsTitle(current.slug, current.title, "course")
    ) {
      set.slug = await freeSlug(slugFromTitle(set.title), "course", (candidate) =>
        courseSlugTaken(workspaceId, candidate, courseId, database)
      )
    }
  }
  if (patch.slug !== undefined) {
    const slug = patch.slug.trim()
    const problem = slugProblem(slug, "course")
    if (problem) throw new Error(problem)
    if (await courseSlugTaken(workspaceId, slug, courseId, database)) {
      throw new Error(`Another course already answers at /courses/${slug}.`)
    }
    set.slug = slug
  }
  if (patch.description !== undefined) {
    set.description = patch.description.trim().slice(0, MAX_COURSE_DESCRIPTION)
  }
  if (patch.image !== undefined) {
    const image = patch.image.trim()
    // A picture is a web address or one of this app's own; never a script.
    if (image && !/^(https:\/\/|\/(?!\/))/i.test(image)) {
      throw new Error("That picture's address can't be used. Pick it from the media library.")
    }
    set.image = image.slice(0, 600)
  }
  if (patch.access !== undefined) set.access = patch.access
  if (patch.planIds !== undefined) {
    // Only plans that exist, once each, so a deleted plan cannot keep a
    // course locked to nobody.
    const known = new Set((await listPlans(database)).map((plan) => plan.id))
    set.planIds = [...new Set(patch.planIds)]
      .filter((id) => known.has(id))
      .slice(0, MAX_COURSE_PLANS)
  }
  if (patch.status !== undefined) set.status = patch.status

  const [row] = await database
    .update(courses)
    .set(set)
    .where(and(eq(courses.id, courseId), eq(courses.workspaceId, workspaceId)))
    .returning()
  return toCourse(row)
}

export async function deleteCourses(
  workspaceId: string,
  ids: string[],
  database: CustomShellDb = db
): Promise<{ done: string[]; kept: string[] }> {
  const deleted = await database
    .delete(courses)
    .where(and(eq(courses.workspaceId, workspaceId), inArray(courses.id, ids)))
    .returning({ id: courses.id })
  const done = deleted.map((row) => row.id)
  const gone = new Set(done)
  return { done, kept: ids.filter((id) => !gone.has(id)) }
}

async function planChoices(database: CustomShellDb): Promise<PlanChoice[]> {
  return (await listPlans(database)).map((plan) => ({
    id: plan.id,
    name: plan.name,
    paid: (plan.priceMonthlyCents ?? 0) > 0 || (plan.priceYearlyCents ?? 0) > 0,
  }))
}

/** Every chapter on the site, grouped by course, for the link picker. */
async function chapterLinkChoices(
  workspaceId: string,
  database: CustomShellDb
): Promise<ChapterLinkChoice[]> {
  const rows = await database
    .select({
      chapterId: courseChapters.id,
      chapterTitle: courseChapters.title,
      courseTitle: courses.title,
    })
    .from(courseChapters)
    .innerJoin(courses, eq(courses.id, courseChapters.courseId))
    .where(eq(courses.workspaceId, workspaceId))
    .orderBy(asc(courses.position), asc(courseChapters.position))
    .limit(2000)
  return rows
}

export async function loadCourseOutlineForEdit(
  workspaceId: string,
  courseId: string,
  database: CustomShellDb = db
) {
  const row = await findCourseRow(workspaceId, courseId, database)
  if (!row) return null
  const [groups, chapters, plans, linkChoices] = await Promise.all([
    listGroups(courseId, database),
    database
      .select()
      .from(courseChapters)
      .where(eq(courseChapters.courseId, courseId)),
    planChoices(database),
    chapterLinkChoices(workspaceId, database),
  ])
  return {
    course: toCourse(row),
    groups,
    chapters: orderedChapters(groups, chapters).map(toAdminChapter),
    plans,
    linkChoices,
  }
}

async function listGroups(
  courseId: string,
  database: CustomShellDb
): Promise<AdminGroup[]> {
  const rows = await database
    .select()
    .from(courseGroups)
    .where(eq(courseGroups.courseId, courseId))
    .orderBy(asc(courseGroups.position))
  return rows.map(({ id, title, position }) => ({ id, title, position }))
}

export async function addGroup(
  workspaceId: string,
  courseId: string,
  input: { title: string },
  database: CustomShellDb = db
): Promise<AdminGroup> {
  await requireCourseRow(workspaceId, courseId, database)
  const title = cleanTitle(input.title, "A part", MAX_GROUP_TITLE)
  const [{ last }] = await database
    .select({ last: sql<number>`coalesce(max(${courseGroups.position}), -1)::int` })
    .from(courseGroups)
    .where(eq(courseGroups.courseId, courseId))
  const [row] = await database
    .insert(courseGroups)
    .values({
      id: uuid(),
      courseId,
      title,
      position: Number(last) + 1,
      createdAt: now(),
    })
    .returning()
  await touchCourse(courseId, database)
  return { id: row.id, title: row.title, position: row.position }
}

export async function renameGroup(
  workspaceId: string,
  courseId: string,
  groupId: string,
  input: { title: string },
  database: CustomShellDb = db
): Promise<AdminGroup> {
  await requireCourseRow(workspaceId, courseId, database)
  const [row] = await database
    .update(courseGroups)
    .set({ title: cleanTitle(input.title, "A part", MAX_GROUP_TITLE) })
    .where(and(eq(courseGroups.id, groupId), eq(courseGroups.courseId, courseId)))
    .returning()
  if (!row) throw new Error("That part no longer exists. Refresh the page.")
  return { id: row.id, title: row.title, position: row.position }
}

/**
 * Removes a part. Its chapters stay, and move to the end of the chapters
 * above every part, so deleting a heading never deletes writing.
 */
export async function deleteGroup(
  workspaceId: string,
  courseId: string,
  groupId: string,
  database: CustomShellDb = db
): Promise<void> {
  await requireCourseRow(workspaceId, courseId, database)
  await database.transaction(async (tx) => {
    const [{ last }] = await tx
      .select({ last: sql<number>`coalesce(max(${courseChapters.position}), -1)::int` })
      .from(courseChapters)
      .where(and(eq(courseChapters.courseId, courseId), isNull(courseChapters.groupId)))
    const moving = await tx
      .select({ id: courseChapters.id })
      .from(courseChapters)
      .where(
        and(eq(courseChapters.courseId, courseId), eq(courseChapters.groupId, groupId))
      )
      .orderBy(asc(courseChapters.position))
    for (const [index, chapter] of moving.entries()) {
      await tx
        .update(courseChapters)
        .set({ groupId: null, position: Number(last) + 1 + index })
        .where(eq(courseChapters.id, chapter.id))
    }
    await tx
      .delete(courseGroups)
      .where(and(eq(courseGroups.id, groupId), eq(courseGroups.courseId, courseId)))
  })
  await touchCourse(courseId, database)
}

export async function addChapter(
  workspaceId: string,
  courseId: string,
  input: { title: string; groupId: string | null },
  database: CustomShellDb = db
): Promise<AdminChapter> {
  await requireCourseRow(workspaceId, courseId, database)
  const title = cleanTitle(input.title, "A chapter", MAX_COURSE_TITLE)
  let groupId: string | null = null
  if (input.groupId) {
    const [group] = await database
      .select({ id: courseGroups.id })
      .from(courseGroups)
      .where(
        and(eq(courseGroups.id, input.groupId), eq(courseGroups.courseId, courseId))
      )
      .limit(1)
    groupId = group?.id ?? null
  }
  const slug = await freeSlug(slugFromTitle(title), "chapter", (candidate) =>
    chapterSlugTaken(courseId, candidate, null, database)
  )
  const [{ last }] = await database
    .select({ last: sql<number>`coalesce(max(${courseChapters.position}), -1)::int` })
    .from(courseChapters)
    .where(
      and(
        eq(courseChapters.courseId, courseId),
        groupId ? eq(courseChapters.groupId, groupId) : isNull(courseChapters.groupId)
      )
    )
  const at = now()
  const [row] = await database
    .insert(courseChapters)
    .values({
      id: uuid(),
      courseId,
      groupId,
      title,
      slug,
      body: emptyChapterBody(),
      position: Number(last) + 1,
      createdAt: at,
      updatedAt: at,
    })
    .returning()
  await touchCourse(courseId, database)
  return toAdminChapter(row)
}

export async function updateChapter(
  workspaceId: string,
  chapterId: string,
  patch: {
    title?: string
    slug?: string
    body?: unknown
    status?: CourseStatus
    isPreview?: boolean
    opensAfterDays?: number | null
    publishAt?: Date | null
  },
  database: CustomShellDb = db
): Promise<AdminChapter> {
  const current = await requireChapterRow(workspaceId, chapterId, database)
  const set: Partial<typeof courseChapters.$inferInsert> = { updatedAt: now() }

  if (patch.title !== undefined) {
    set.title = cleanTitle(patch.title, "A chapter", MAX_COURSE_TITLE)
    // The same rule as a course: a draft chapter's address follows its name.
    if (
      patch.slug === undefined &&
      current.status === "draft" &&
      set.title !== current.title &&
      slugFollowsTitle(current.slug, current.title, "chapter")
    ) {
      set.slug = await freeSlug(slugFromTitle(set.title), "chapter", (candidate) =>
        chapterSlugTaken(current.courseId, candidate, chapterId, database)
      )
    }
  }
  if (patch.slug !== undefined) {
    const slug = patch.slug.trim()
    const problem = slugProblem(slug, "chapter")
    if (problem) throw new Error(problem)
    if (await chapterSlugTaken(current.courseId, slug, chapterId, database)) {
      throw new Error("Another chapter in this course already has that address.")
    }
    set.slug = slug
  }
  if (patch.body !== undefined) {
    const body = cleanChapterBody(patch.body)
    set.body = body
    set.readMinutes = chapterReadMinutes(body)
  }
  if (patch.status !== undefined) set.status = patch.status
  if (patch.isPreview !== undefined) set.isPreview = patch.isPreview
  if (patch.opensAfterDays !== undefined) set.opensAfterDays = patch.opensAfterDays
  if (patch.publishAt !== undefined) set.publishAt = patch.publishAt

  const [row] = await database
    .update(courseChapters)
    .set(set)
    .where(eq(courseChapters.id, chapterId))
    .returning()
  await touchCourse(current.courseId, database)
  return toAdminChapter(row)
}

export async function deleteChapter(
  workspaceId: string,
  chapterId: string,
  database: CustomShellDb = db
): Promise<void> {
  const current = await requireChapterRow(workspaceId, chapterId, database)
  await database.delete(courseChapters).where(eq(courseChapters.id, chapterId))
  await touchCourse(current.courseId, database)
}

/**
 * Saves the whole order after a drag: which part each chapter sits in, and
 * where. One transaction, so a reader never sees half an order. Ids that do
 * not belong to this course are ignored, and a chapter the list left out
 * keeps where it was.
 */
export async function saveCourseOrder(
  workspaceId: string,
  courseId: string,
  order: CourseOutlineOrder,
  database: CustomShellDb = db
): Promise<{ groups: AdminGroup[]; chapters: AdminChapter[] }> {
  await requireCourseRow(workspaceId, courseId, database)
  await database.transaction(async (tx) => {
    const [groups, chapters] = await Promise.all([
      tx
        .select({ id: courseGroups.id })
        .from(courseGroups)
        .where(eq(courseGroups.courseId, courseId)),
      tx
        .select({ id: courseChapters.id })
        .from(courseChapters)
        .where(eq(courseChapters.courseId, courseId)),
    ])
    const groupIds = new Set(groups.map((group) => group.id))
    const chapterIds = new Set(chapters.map((chapter) => chapter.id))

    for (const [position, id] of order.loose.entries()) {
      if (!chapterIds.has(id)) continue
      await tx
        .update(courseChapters)
        .set({ groupId: null, position })
        .where(eq(courseChapters.id, id))
    }
    for (const [groupPosition, group] of order.groups.entries()) {
      if (!groupIds.has(group.id)) continue
      await tx
        .update(courseGroups)
        .set({ position: groupPosition })
        .where(eq(courseGroups.id, group.id))
      for (const [position, id] of group.chapterIds.entries()) {
        if (!chapterIds.has(id)) continue
        await tx
          .update(courseChapters)
          .set({ groupId: group.id, position })
          .where(eq(courseChapters.id, id))
      }
    }
  })
  await touchCourse(courseId, database)

  const [groups, chapters] = await Promise.all([
    listGroups(courseId, database),
    database
      .select()
      .from(courseChapters)
      .where(eq(courseChapters.courseId, courseId)),
  ])
  return {
    groups,
    chapters: orderedChapters(groups, chapters).map(toAdminChapter),
  }
}
