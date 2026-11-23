/**
 * `?preview=free` on a course page: an admin reading as a signed-in free
 * member would. The server only honours it for an admin, so anybody else
 * adding it to an address changes nothing.
 */
export type CourseSearch = { preview?: "free" }

export function readCourseSearch(search: Record<string, unknown>): CourseSearch {
  return search.preview === "free" ? { preview: "free" } : {}
}
