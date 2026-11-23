import { asc, eq, inArray } from "drizzle-orm"

import type { WorkspaceCopyInput } from "@/server/app-options"
import { now, uuid } from "@/server/auth/security"
import { courseChapters, courseGroups, courses } from "@/server/courses/schema"

export const COPY_COURSES_CHOICE = "courses"

/**
 * Copies a site's courses into a new copy of it, when the admin ticked "Copy
 * courses" in the copy window.
 *
 * Courses, their parts and their chapters come across, every one of them a
 * draft, so nothing goes public on the new site until an admin publishes it
 * there. What belongs to readers stays behind: progress, notes, saved
 * chapters, answers and questions. Read-aloud audio stays behind too, because
 * it is a file in the old site's media library.
 *
 * A link from one chapter to another is `/courses/to/<chapter id>`, and that
 * id only means something on the site it was made on. Each one is pointed at
 * the copy of its chapter, so the copied course's links keep working.
 */
export async function copySiteCourses({
  sourceWorkspaceId,
  newWorkspaceId,
  choices,
  database,
}: WorkspaceCopyInput): Promise<void> {
  if (!choices.includes(COPY_COURSES_CHOICE)) return

  const sourceCourses = await database
    .select()
    .from(courses)
    .where(eq(courses.workspaceId, sourceWorkspaceId))
    .orderBy(asc(courses.position))
  if (sourceCourses.length === 0) return

  const sourceIds = sourceCourses.map((course) => course.id)
  const [sourceGroups, sourceChapters] = await Promise.all([
    database.select().from(courseGroups).where(inArray(courseGroups.courseId, sourceIds)),
    database
      .select()
      .from(courseChapters)
      .where(inArray(courseChapters.courseId, sourceIds)),
  ])

  const courseIds = new Map(sourceIds.map((id) => [id, uuid()]))
  const groupIds = new Map(sourceGroups.map((group) => [group.id, uuid()]))
  const chapterIds = new Map(sourceChapters.map((chapter) => [chapter.id, uuid()]))
  const at = now()

  await database.insert(courses).values(
    sourceCourses.map((course) => ({
      ...course,
      id: courseIds.get(course.id)!,
      workspaceId: newWorkspaceId,
      status: "draft",
      createdAt: at,
      updatedAt: at,
    }))
  )
  if (sourceGroups.length) {
    await database.insert(courseGroups).values(
      sourceGroups.map((group) => ({
        ...group,
        id: groupIds.get(group.id)!,
        courseId: courseIds.get(group.courseId)!,
        createdAt: at,
      }))
    )
  }
  if (sourceChapters.length) {
    await database.insert(courseChapters).values(
      sourceChapters.map((chapter) => ({
        ...chapter,
        id: chapterIds.get(chapter.id)!,
        courseId: courseIds.get(chapter.courseId)!,
        groupId: chapter.groupId ? (groupIds.get(chapter.groupId) ?? null) : null,
        body: pointChapterLinks(chapter.body, chapterIds),
        status: "draft",
        audioUrl: "",
        audioTextHash: "",
        createdAt: at,
        updatedAt: at,
      }))
    )
  }
}

/** The same chapter body with every `/courses/to/<id>` link moved to the copy. */
function pointChapterLinks(body: unknown, chapterIds: Map<string, string>): unknown {
  const text = JSON.stringify(body)
  const pointed = text.replace(
    /\/courses\/to\/([0-9a-f-]{36})/g,
    (link, id: string) => {
      const copy = chapterIds.get(id)
      return copy ? `/courses/to/${copy}` : link
    }
  )
  return pointed === text ? body : JSON.parse(pointed)
}
