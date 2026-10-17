import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import type {
  ChapterQuestion,
  QuizResult,
  SavedChapter,
} from "@/lib/courses/course-types"
import { currentReader, readSavedChapters } from "@/server/courses/reader"
import {
  answerQuiz,
  askQuestion,
  deleteOwnQuestion,
  MAX_NOTE_LENGTH,
  MAX_QUESTION_LENGTH,
  saveNote,
  setBookmark,
  setChapterDone,
  tickChecklistItem,
} from "@/server/courses/member"
import { userGet, userPost } from "@/server/guards"
import { visitorWorkspaceId } from "@/server/workspaces/for-request"

/**
 * What a signed-in member does inside a chapter. Every door needs a session
 * (`userPost`), and each action then checks the chapter is open to this
 * member on the server, so a locked chapter cannot be written to.
 */

const idInput = z.string().min(1).max(36)
const itemIdInput = z.string().min(1).max(32)

async function site(): Promise<string> {
  const workspaceId = await visitorWorkspaceId()
  if (!workspaceId) throw new Error("This site has no courses.")
  return workspaceId
}

const markDoneFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ chapterId: idInput, done: z.boolean() }))
  .handler(async ({ data }) => {
    await setChapterDone(await site(), await currentReader(false), data.chapterId, data.done)
  })

export function markChapterDone(chapterId: string, done: boolean) {
  return markDoneFn({ data: { chapterId, done } })
}

const bookmarkFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ chapterId: idInput, saved: z.boolean() }))
  .handler(async ({ data }) => {
    await setBookmark(await site(), await currentReader(false), data.chapterId, data.saved)
  })

export function saveBookmark(chapterId: string, saved: boolean) {
  return bookmarkFn({ data: { chapterId, saved } })
}

const noteFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ chapterId: idInput, body: z.string().max(MAX_NOTE_LENGTH) }))
  .handler(async ({ data }) => {
    await saveNote(await site(), await currentReader(false), data.chapterId, data.body)
  })

export function saveChapterNote(chapterId: string, body: string) {
  return noteFn({ data: { chapterId, body } })
}

const tickFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(
    z.object({ chapterId: idInput, itemId: itemIdInput, ticked: z.boolean() })
  )
  .handler(async ({ data }) => {
    await tickChecklistItem(
      await site(),
      await currentReader(false),
      data.chapterId,
      data.itemId,
      data.ticked
    )
  })

export function tickItem(chapterId: string, itemId: string, ticked: boolean) {
  return tickFn({ data: { chapterId, itemId, ticked } })
}

const quizFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(
    z.object({
      chapterId: idInput,
      answers: z.record(itemIdInput, itemIdInput),
    })
  )
  .handler(async ({ data }): Promise<Record<string, QuizResult>> => {
    return answerQuiz(await site(), await currentReader(false), data.chapterId, data.answers)
  })

export function checkQuizAnswers(chapterId: string, answers: Record<string, string>) {
  return quizFn({ data: { chapterId, answers } })
}

const askFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(
    z.object({ chapterId: idInput, body: z.string().min(1).max(MAX_QUESTION_LENGTH) })
  )
  .handler(async ({ data }): Promise<ChapterQuestion[]> => {
    return askQuestion(await site(), await currentReader(false), data.chapterId, data.body)
  })

export function sendQuestion(chapterId: string, body: string) {
  return askFn({ data: { chapterId, body } })
}

const deleteQuestionFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ questionId: idInput }))
  .handler(async ({ data }): Promise<ChapterQuestion[]> => {
    return deleteOwnQuestion(await site(), await currentReader(false), data.questionId)
  })

export function removeOwnQuestion(questionId: string) {
  return deleteQuestionFn({ data: { questionId } })
}

const savedFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(async ({ context }): Promise<SavedChapter[]> => {
    return readSavedChapters(await site(), context.user.id)
  })

/** The member's Saved list, newest first. */
export function loadSavedChapters() {
  return savedFn()
}
