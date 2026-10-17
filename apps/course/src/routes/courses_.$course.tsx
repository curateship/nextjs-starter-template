import { createFileRoute, notFound } from "@tanstack/react-router"

import { CourseIntro, CourseRouteError } from "@/components/courses/public/course-pages"
import { requirePageVisible } from "@/lib/api/content/pages"
import { loadCourseIntro } from "@/lib/api/courses/public"
import { readCourseSearch } from "@/lib/courses/course-search"

/**
 * /courses/<course>: the course's intro page. A draft, another site's course
 * and one never written all answer the same not-found page.
 */
export const Route = createFileRoute("/courses_/$course")({
  validateSearch: readCourseSearch,
  loaderDeps: ({ search }) => search,
  loader: async ({ params, deps }) => {
    const [, page] = await Promise.all([
      requirePageVisible("/courses"),
      loadCourseIntro(params.course, deps.preview === "free"),
    ])
    if (!page) throw notFound()
    return page
  },
  head: ({ loaderData }) =>
    loaderData
      ? {
          meta: [
            { title: `${loaderData.course.title} | ${loaderData.siteName}` },
            { name: "description", content: loaderData.course.description.slice(0, 300) },
          ],
        }
      : {},
  component: CourseIntroRoute,
  errorComponent: CourseRouteError,
})

function CourseIntroRoute() {
  return <CourseIntro page={Route.useLoaderData()} />
}
