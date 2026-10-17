import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { COURSE_ACCESS, COURSE_STATUSES } from "@/lib/courses/course-access"
import type {
  AdminChapter,
  AdminCourse,
  AdminCourseRow,
  AdminGroup,
  AdminQuestion,
  CourseForEdit,
  CourseStats,
} from "@/lib/courses/course-types"
import { MAX_SLUG_LENGTH } from "@/lib/courses/course-slugs"
import { getAiKey } from "@/server/ai/keys"
import { makeChapterAudio, removeChapterAudio } from "@/server/courses/audio"
import {
  answerQuestion,
  countUnansweredQuestions,
  deleteQuestion,
  listCourseQuestions,
  loadCourseStats,
  MAX_ANSWER_LENGTH,
} from "@/server/courses/course-admin"
import {
  addChapter,
  addGroup,
  createCourse,
  deleteChapter,
  deleteCourses,
  deleteGroup,
  listCourses,
  loadCourseOutlineForEdit,
  MAX_COURSE_DESCRIPTION,
  MAX_COURSE_PLANS,
  MAX_COURSE_TITLE,
  MAX_GROUP_TITLE,
  renameGroup,
  saveCourseOrder,
  updateChapter,
  updateCourse,
} from "@/server/courses/courses"
import { adminGet, adminPost } from "@/server/guards"
import { publicPagesWorkspaceId } from "@/server/workspaces/for-request"

/**
 * The Courses screens' doors. All admin-only, and all work on the site the
 * public reads, worked out on the server rather than sent by the page.
 */

const idInput = z.string().min(1).max(36)
const titleInput = z.string().min(1).max(MAX_COURSE_TITLE)
const slugInput = z.string().max(MAX_SLUG_LENGTH)

async function site(userId: string) {
  return publicPagesWorkspaceId(userId)
}

const loadCoursesFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(async ({ context }): Promise<AdminCourseRow[]> => {
    return listCourses(await site(context.user.id))
  })

export function loadAdminCourses() {
  return loadCoursesFn()
}

const createCourseFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ title: titleInput }))
  .handler(async ({ data, context }): Promise<AdminCourse> => {
    return createCourse(await site(context.user.id), data)
  })

export function saveNewCourse(title: string) {
  return createCourseFn({ data: { title } })
}

const deleteCoursesFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ ids: z.array(idInput).min(1).max(500) }))
  .handler(async ({ data, context }) => {
    return deleteCourses(await site(context.user.id), data.ids)
  })

/** One request for the whole selection; the result counts honestly. */
export function removeCourses(ids: string[]) {
  return deleteCoursesFn({ data: { ids } })
}

const loadCourseForEditFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(z.object({ id: idInput }))
  .handler(async ({ data, context }): Promise<CourseForEdit | null> => {
    const workspaceId = await site(context.user.id)
    const loaded = await loadCourseOutlineForEdit(workspaceId, data.id)
    if (!loaded) return null
    const [unansweredQuestions, voiceKey] = await Promise.all([
      countUnansweredQuestions(workspaceId, data.id),
      getAiKey("elevenlabs"),
    ])
    return { ...loaded, unansweredQuestions, voiceReady: Boolean(voiceKey) }
  })

export function loadCourseForEdit(id: string) {
  return loadCourseForEditFn({ data: { id } })
}

const updateCourseFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.object({
      id: idInput,
      title: titleInput.optional(),
      slug: slugInput.optional(),
      description: z.string().max(MAX_COURSE_DESCRIPTION).optional(),
      image: z.string().max(600).optional(),
      access: z.enum(COURSE_ACCESS).optional(),
      planIds: z.array(idInput).max(MAX_COURSE_PLANS).optional(),
      status: z.enum(COURSE_STATUSES).optional(),
    })
  )
  .handler(async ({ data, context }): Promise<AdminCourse> => {
    const { id, ...patch } = data
    return updateCourse(await site(context.user.id), id, patch)
  })

export function saveCourse(input: {
  id: string
  title?: string
  slug?: string
  description?: string
  image?: string
  access?: AdminCourse["access"]
  planIds?: string[]
  status?: AdminCourse["status"]
}) {
  return updateCourseFn({ data: input })
}

const addGroupFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ courseId: idInput, title: z.string().min(1).max(MAX_GROUP_TITLE) }))
  .handler(async ({ data, context }): Promise<AdminGroup> => {
    return addGroup(await site(context.user.id), data.courseId, { title: data.title })
  })

export function saveNewGroup(courseId: string, title: string) {
  return addGroupFn({ data: { courseId, title } })
}

const renameGroupFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.object({
      courseId: idInput,
      groupId: idInput,
      title: z.string().min(1).max(MAX_GROUP_TITLE),
    })
  )
  .handler(async ({ data, context }): Promise<AdminGroup> => {
    return renameGroup(await site(context.user.id), data.courseId, data.groupId, {
      title: data.title,
    })
  })

export function saveGroupTitle(courseId: string, groupId: string, title: string) {
  return renameGroupFn({ data: { courseId, groupId, title } })
}

const deleteGroupFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ courseId: idInput, groupId: idInput }))
  .handler(async ({ data, context }) => {
    const workspaceId = await site(context.user.id)
    await deleteGroup(workspaceId, data.courseId, data.groupId)
    return loadCourseOutlineForEdit(workspaceId, data.courseId)
  })

/** Removes a part and hands back the outline, since its chapters moved. */
export function removeGroup(courseId: string, groupId: string) {
  return deleteGroupFn({ data: { courseId, groupId } })
}

const addChapterFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.object({ courseId: idInput, title: titleInput, groupId: idInput.nullable() })
  )
  .handler(async ({ data, context }): Promise<AdminChapter> => {
    return addChapter(await site(context.user.id), data.courseId, {
      title: data.title,
      groupId: data.groupId,
    })
  })

export function saveNewChapter(courseId: string, title: string, groupId: string | null) {
  return addChapterFn({ data: { courseId, title, groupId } })
}

const updateChapterFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.object({
      id: idInput,
      title: titleInput.optional(),
      slug: slugInput.optional(),
      // A tree whose rule is "keep only what is allowed", which the server's
      // cleaner says better than a schema.
      body: z.unknown().optional(),
      status: z.enum(COURSE_STATUSES).optional(),
      isPreview: z.boolean().optional(),
      opensAfterDays: z.number().int().min(1).max(365).nullable().optional(),
      publishAt: z.coerce.date().nullable().optional(),
    })
  )
  .handler(async ({ data, context }): Promise<AdminChapter> => {
    const { id, ...patch } = data
    return updateChapter(await site(context.user.id), id, patch)
  })

export function saveChapter(input: {
  id: string
  title?: string
  slug?: string
  body?: unknown
  status?: AdminChapter["status"]
  isPreview?: boolean
  opensAfterDays?: number | null
  publishAt?: Date | null
}) {
  return updateChapterFn({ data: input })
}

const deleteChapterFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ id: idInput }))
  .handler(async ({ data, context }) => {
    await deleteChapter(await site(context.user.id), data.id)
  })

export function removeChapter(id: string) {
  return deleteChapterFn({ data: { id } })
}

const saveOrderFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.object({
      courseId: idInput,
      loose: z.array(idInput).max(1000),
      groups: z
        .array(z.object({ id: idInput, chapterIds: z.array(idInput).max(1000) }))
        .max(200),
    })
  )
  .handler(async ({ data, context }) => {
    const { courseId, ...order } = data
    return saveCourseOrder(await site(context.user.id), courseId, order)
  })

export function saveChapterOrder(
  courseId: string,
  order: { loose: string[]; groups: { id: string; chapterIds: string[] }[] }
) {
  return saveOrderFn({ data: { courseId, ...order } })
}

const makeAudioFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ chapterId: idInput }))
  .handler(async ({ data, context }): Promise<AdminChapter> => {
    return makeChapterAudio(await site(context.user.id), context.user.id, data.chapterId)
  })

export function makeAudio(chapterId: string) {
  return makeAudioFn({ data: { chapterId } })
}

const removeAudioFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ chapterId: idInput }))
  .handler(async ({ data, context }): Promise<AdminChapter> => {
    return removeChapterAudio(await site(context.user.id), data.chapterId)
  })

export function removeAudio(chapterId: string) {
  return removeAudioFn({ data: { chapterId } })
}

const loadQuestionsFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(z.object({ courseId: idInput }))
  .handler(async ({ data, context }): Promise<AdminQuestion[]> => {
    return listCourseQuestions(await site(context.user.id), data.courseId)
  })

export function loadCourseQuestions(courseId: string) {
  return loadQuestionsFn({ data: { courseId } })
}

const answerQuestionFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.object({
      courseId: idInput,
      questionId: idInput,
      answer: z.string().max(MAX_ANSWER_LENGTH),
    })
  )
  .handler(async ({ data, context }): Promise<AdminQuestion[]> => {
    return answerQuestion(
      await site(context.user.id),
      data.courseId,
      data.questionId,
      data.answer
    )
  })

export function saveAnswer(courseId: string, questionId: string, answer: string) {
  return answerQuestionFn({ data: { courseId, questionId, answer } })
}

const deleteQuestionFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ courseId: idInput, questionId: idInput }))
  .handler(async ({ data, context }): Promise<AdminQuestion[]> => {
    return deleteQuestion(await site(context.user.id), data.courseId, data.questionId)
  })

export function removeQuestion(courseId: string, questionId: string) {
  return deleteQuestionFn({ data: { courseId, questionId } })
}

const loadStatsFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(z.object({ courseId: idInput }))
  .handler(async ({ data, context }): Promise<CourseStats> => {
    return loadCourseStats(await site(context.user.id), data.courseId)
  })

export function loadStats(courseId: string) {
  return loadStatsFn({ data: { courseId } })
}
