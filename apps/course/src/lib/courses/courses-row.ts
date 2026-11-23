import type { PublicCourseCard } from "@/lib/courses/course-types"

/**
 * The Courses row on a site's front page: that site's published courses as
 * cards, in the order the admin put them in on `/admin/courses`.
 *
 * Its one field is how many cards. Saved values are typed by an admin, so they
 * are cleaned on every read rather than trusted.
 */

export const COURSES_ROW_KEY = "courses"

export const COURSES_ROW_COUNT_MIN = 1
export const COURSES_ROW_COUNT_MAX = 12
const COURSES_ROW_COUNT_DEFAULT = 3

export type CoursesRowSettings = { count: number }

export type CoursesRowData = {
  courses: PublicCourseCard[]
  /** The button beside the row's heading, drawn by the shell. */
  action: { label: string; href: string }
}

export function cleanCoursesRowSettings(
  value: Record<string, unknown> | null | undefined
): CoursesRowSettings {
  const raw = Number(value?.count)
  if (!Number.isFinite(raw)) return { count: COURSES_ROW_COUNT_DEFAULT }
  return {
    count: Math.min(
      COURSES_ROW_COUNT_MAX,
      Math.max(COURSES_ROW_COUNT_MIN, Math.round(raw))
    ),
  }
}
