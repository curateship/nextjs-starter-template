import { createFileRoute, notFound } from "@tanstack/react-router"

import { CourseListPage, CourseRouteError } from "@/components/courses/public/course-pages"
import { requirePageVisible } from "@/lib/api/content/pages"
import { loadCourses } from "@/lib/api/courses/public"
import { readCourseSearch } from "@/lib/courses/course-search"

/** /courses: every published course on the site. */
export const Route = createFileRoute("/courses")({
  validateSearch: readCourseSearch,
  loaderDeps: ({ search }) => search,
  loader: async ({ deps }) => {
    const [, page] = await Promise.all([
      requirePageVisible("/courses"),
      loadCourses(deps.preview === "free"),
    ])
    if (!page) throw notFound()
    return page
  },
  head: ({ loaderData }) => ({
    meta: [{ title: loaderData?.siteName ? `Courses | ${loaderData.siteName}` : "Courses" }],
  }),
  component: CoursesRoute,
  errorComponent: CourseRouteError,
})

function CoursesRoute() {
  const { courses, viewer } = Route.useLoaderData()
  return <CourseListPage courses={courses} viewer={viewer} />
}
