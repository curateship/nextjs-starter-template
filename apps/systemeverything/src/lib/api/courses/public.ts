import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import type {
  ChapterPage,
  CourseIntroPage,
  PublicCourseCard,
  ReaderViewer,
} from "@/lib/courses/course-types"
import { MAX_SLUG_LENGTH } from "@/lib/courses/course-slugs"
import { findCurrentUser } from "@/server/auth/security"
import { readPageVisibility } from "@/server/content/pages"
import {
  chapterAddress,
  currentReader,
  readChapter,
  readCourseIntro,
  readPublicCourses,
  type Reader,
} from "@/server/courses/reader"
import { visitorWorkspaceId } from "@/server/workspaces/for-request"

/**
 * The public course pages' doors. None carries a guard, because a course an
 * admin opened to everyone has to be readable by somebody signed out; each is
 * written down in `src/app/open-endpoints.ts` with the reason.
 *
 * Each checks the Courses page's own on/off switch before reading anything,
 * because the route only decides what a browser draws and anyone can call
 * these directly. Who may read which chapter is then decided on the server by
 * `server/courses/reader.ts`, never by the page.
 */

const slugInput = z.string().min(1).max(MAX_SLUG_LENGTH)

async function openSite(): Promise<string | null> {
  const workspaceId = await visitorWorkspaceId()
  if (!workspaceId) return null
  const visibility = await readPageVisibility(workspaceId, "/courses")
  if (visibility === "off") return null
  if (visibility === "members") {
    const viewer = await findCurrentUser().catch(() => null)
    if (!viewer) return null
  }
  return workspaceId
}

async function readerFor(preview: boolean | undefined): Promise<Reader> {
  return currentReader(Boolean(preview))
}

const readCoursesFn = createServerFn({ method: "GET" })
  .inputValidator(z.object({ preview: z.boolean().optional() }))
  .handler(
    async ({
      data,
    }): Promise<{
      siteName: string
      courses: PublicCourseCard[]
      viewer: ReaderViewer
    } | null> => {
      const workspaceId = await openSite()
      if (!workspaceId) return null
      return readPublicCourses(workspaceId, await readerFor(data.preview))
    }
  )

/** Every published course on the visited site, as this person sees them. */
export function loadCourses(preview?: boolean) {
  return readCoursesFn({ data: { preview } })
}

const readCourseIntroFn = createServerFn({ method: "GET" })
  .inputValidator(z.object({ slug: slugInput, preview: z.boolean().optional() }))
  .handler(async ({ data }): Promise<CourseIntroPage | null> => {
    const workspaceId = await openSite()
    if (!workspaceId) return null
    return readCourseIntro(workspaceId, data.slug, await readerFor(data.preview))
  })

export function loadCourseIntro(slug: string, preview?: boolean) {
  return readCourseIntroFn({ data: { slug, preview } })
}

const readChapterFn = createServerFn({ method: "GET" })
  .inputValidator(
    z.object({
      course: slugInput,
      chapter: slugInput,
      preview: z.boolean().optional(),
    })
  )
  .handler(async ({ data }): Promise<ChapterPage | null> => {
    const workspaceId = await openSite()
    if (!workspaceId) return null
    return readChapter(
      workspaceId,
      data.course,
      data.chapter,
      await readerFor(data.preview)
    )
  })

export function loadChapter(course: string, chapter: string, preview?: boolean) {
  return readChapterFn({ data: { course, chapter, preview } })
}

const chapterAddressFn = createServerFn({ method: "GET" })
  .inputValidator(z.object({ id: z.string().min(1).max(36) }))
  .handler(async ({ data }): Promise<string | null> => {
    const workspaceId = await openSite()
    if (!workspaceId) return null
    return chapterAddress(workspaceId, data.id, await readerFor(false))
  })

/** Where a chapter link (`/courses/to/<id>`) points today. */
export function loadChapterAddress(id: string) {
  return chapterAddressFn({ data: { id } })
}
