import { CourseCardGrid } from "@/components/courses/public/course-pages"
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import type {
  AppFrontPageRowEditorProps,
  AppFrontPageRowProps,
} from "@/lib/app-options"
import {
  cleanCoursesRowSettings,
  COURSES_ROW_COUNT_MAX,
  COURSES_ROW_COUNT_MIN,
  type CoursesRowData,
} from "@/lib/courses/courses-row"

/**
 * The Courses row's two halves on the shell's front page builder: the field
 * in the row window, and the cards on the public page. The shell draws the
 * heading, the intro and the "See all courses" button around them.
 */

export function CoursesRowPanel({
  settings,
  disabled,
  onChange,
}: AppFrontPageRowEditorProps) {
  const row = cleanCoursesRowSettings(settings)
  const id = "front-page-row-courses-count"

  return (
    <div className="grid max-w-40 gap-2">
      <FieldLabel
        htmlFor={id}
        hint={`At most this many courses, in the order on the Courses screen, between ${COURSES_ROW_COUNT_MIN} and ${COURSES_ROW_COUNT_MAX}.`}
      >
        How many
      </FieldLabel>
      <Input
        id={id}
        type="number"
        min={COURSES_ROW_COUNT_MIN}
        max={COURSES_ROW_COUNT_MAX}
        value={row.count}
        disabled={disabled}
        onChange={(event) => onChange({ ...row, count: Number(event.target.value) })}
      />
    </div>
  )
}

export function CoursesRowContent({ data }: AppFrontPageRowProps) {
  // Never null on a drawn row: the reader leaves a row with no courses off.
  if (data === null || data === undefined) return null
  return <CourseCardGrid courses={(data as CoursesRowData).courses} />
}
