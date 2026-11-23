import { createFileRoute, redirect } from "@tanstack/react-router"

import { CourseEditor } from "@/components/courses/admin/course-editor"
import { routeErrorComponent } from "@/components/shell/route-error"
import { loadCourseForEdit } from "@/lib/api/courses/admin"
import { getCourseErrorMessage } from "@/lib/courses/course-errors"

/**
 * One course's editor. A course that is gone, or belongs to another site,
 * lands back on the list rather than on an empty editor.
 */
export const Route = createFileRoute("/_authenticated/admin/courses_/$courseId")({
  loader: async ({ params }) => {
    const data = await loadCourseForEdit(params.courseId)
    if (!data) throw redirect({ to: "/admin/courses" })
    return data
  },
  component: AdminCourseEditorRoute,
  errorComponent: routeErrorComponent(getCourseErrorMessage),
})

function AdminCourseEditorRoute() {
  const data = Route.useLoaderData()
  // Keyed by course, so opening another course starts from its own state.
  return <CourseEditor key={data.course.id} data={data} />
}
