import { createFileRoute } from "@tanstack/react-router"

import { CoursesDashboard } from "@/components/courses/admin/courses-dashboard"
import { routeErrorComponent } from "@/components/shell/route-error"
import { loadAdminCourses } from "@/lib/api/courses/admin"
import { getCourseErrorMessage } from "@/lib/courses/course-errors"

/** The admin's Courses screen: every course on the site. */
export const Route = createFileRoute("/_authenticated/admin/courses")({
  loader: () => loadAdminCourses(),
  component: AdminCoursesRoute,
  errorComponent: routeErrorComponent(getCourseErrorMessage),
})

function AdminCoursesRoute() {
  return <CoursesDashboard courses={Route.useLoaderData()} />
}
