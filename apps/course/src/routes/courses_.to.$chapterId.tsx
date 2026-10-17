import { createFileRoute, notFound, redirect } from "@tanstack/react-router"

import { loadChapterAddress } from "@/lib/api/courses/public"

/**
 * /courses/to/<chapter id>: what a chapter link inside a course points at.
 * It looks up the chapter's address today and sends the reader there, so a
 * link written before a chapter was renamed or moved still lands on it.
 */
export const Route = createFileRoute("/courses_/to/$chapterId")({
  loader: async ({ params }) => {
    const address = await loadChapterAddress(params.chapterId)
    if (!address) throw notFound()
    throw redirect({ href: address, replace: true })
  },
})
