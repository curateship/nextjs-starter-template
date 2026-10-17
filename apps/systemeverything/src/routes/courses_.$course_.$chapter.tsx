import { createFileRoute, notFound } from "@tanstack/react-router"

import { ChapterReader } from "@/components/courses/public/chapter-reader"
import { CourseFrame, CourseRouteError } from "@/components/courses/public/course-pages"
import { requirePageVisible } from "@/lib/api/content/pages"
import { loadChapter } from "@/lib/api/courses/public"
import { readCourseSearch } from "@/lib/courses/course-search"

/**
 * /courses/<course>/<chapter>: one chapter, with the course's chapter list
 * beside it. A locked chapter still answers, with its title and the way to
 * unlock it, but never its words.
 */
export const Route = createFileRoute("/courses_/$course_/$chapter")({
  validateSearch: readCourseSearch,
  loaderDeps: ({ search }) => search,
  loader: async ({ params, deps }) => {
    const [, page] = await Promise.all([
      requirePageVisible("/courses"),
      loadChapter(params.course, params.chapter, deps.preview === "free"),
    ])
    if (!page) throw notFound()
    return page
  },
  head: ({ loaderData }) =>
    loaderData
      ? {
          meta: [
            {
              title: `${loaderData.chapter.title} | ${loaderData.course.title} | ${loaderData.siteName}`,
            },
          ],
        }
      : {},
  component: ChapterRoute,
  errorComponent: CourseRouteError,
})

function ChapterRoute() {
  return (
    <CourseFrame>
      <ChapterReader page={Route.useLoaderData()} />
    </CourseFrame>
  )
}
