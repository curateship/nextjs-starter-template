import {
  cleanCoursesRowSettings,
  type CoursesRowData,
} from "@/lib/courses/courses-row"
import { coursesPageOpen } from "@/server/courses/page-switch"
import {
  currentReader,
  readCourseCards,
  type Reader,
} from "@/server/courses/reader"
import { db, type CustomShellDb } from "@/server/db"

/**
 * What fills a Courses row on the visited site's front page, or null to leave
 * the row off.
 *
 * Null when the Courses page is closed to this visitor, since every card would
 * lead to "not found", and null when the site has no published course yet.
 * Each card shows its lock to this visitor exactly as `/courses` does.
 */
export async function readCoursesRow(
  workspaceId: string,
  settings: Record<string, unknown>,
  options: {
    database?: CustomShellDb
    pageOpen?: (workspaceId: string) => Promise<boolean>
    reader?: () => Promise<Reader>
  } = {}
): Promise<CoursesRowData | null> {
  const {
    database = db,
    pageOpen = coursesPageOpen,
    reader = () => currentReader(false, database),
  } = options
  if (!(await pageOpen(workspaceId))) return null

  const { count } = cleanCoursesRowSettings(settings)
  const courses = await readCourseCards(
    workspaceId,
    await reader(),
    { drafts: false, limit: count },
    database
  )
  if (courses.length === 0) return null

  return { courses, action: { label: "See all courses", href: "/courses" } }
}
