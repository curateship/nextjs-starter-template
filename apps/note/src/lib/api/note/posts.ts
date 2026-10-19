import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { createErrorMessage } from "../error-message"
import { userGet, userPost } from "@/server/guards"
import {
  analysePost,
  analysePosts,
  bringInArticle,
  deletePost,
  dropFolderSuggestion,
  listPostAuthors,
  listPosts,
  loadPost,
  mergePlans,
  movePost,
  refreshPosts,
  retryPost,
  retryPostVideo,
  saveHighlights,
  savePlan,
  savePostLink,
} from "@/server/note/posts/posts"
import { isHighlightPart } from "@/lib/note/posts/highlights"
import {
  MANY_AT_ONCE_MAX,
  PLAN_PROGRESS_FILTERS,
  PLAN_STEP_MAX,
  PLAN_STEPS_MAX,
  POST_SAYS,
  type Highlight,
  type NotePostCard,
  type NotePostDetail,
  type NotePostPage,
  type PostAuthor,
} from "@/lib/note/posts/posts"
import { NO_FOLDER, NOTE_SAYS } from "@/lib/note/videos"

/**
 * The saved X posts, for the member who saved them. Open to every signed-in
 * member, like Videos and Notes, and each function passes on only the id the
 * session resolved to, so every query is that person's own.
 *
 * Saving and Analyse write a row and return at once. The work happens in the
 * `note-posts` worker, which is why the screen asks again every few seconds
 * while a card is still moving.
 */

const describe = createErrorMessage(
  {
    ...Object.fromEntries(
      [...Object.values(NOTE_SAYS), ...Object.values(POST_SAYS)].map((sentence) => [sentence, sentence])
    ),
    AI_LIMIT_REACHED: NOTE_SAYS.aiLimitReached,
    RATE_LIMITED: POST_SAYS.tooManyLinks,
    SECRET_UNREADABLE: NOTE_SAYS.geminiKeyUnreadable,
    ENCRYPTION_NOT_CONFIGURED: NOTE_SAYS.geminiKeyUnreadable,
  },
  "That did not work. Try again in a moment."
)

export function getPostErrorMessage(error: unknown) {
  // The article's own refusal says which site and why, so it passes as it is.
  const message = error instanceof Error ? error.message : ""
  if (message.startsWith("The article's site")) return message
  return describe(error)
}

const id = z.string().min(1).max(36)
const filters = z.object({
  folder: z.union([z.literal(NO_FOLDER), id]).optional(),
  search: z.string().max(200).optional(),
  author: z.string().regex(/^[A-Za-z0-9_]{1,15}$/).optional(),
  tag: z.string().min(1).max(60).optional(),
  progress: z.enum(PLAN_PROGRESS_FILTERS).optional(),
})

const listFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(filters.extend({ cursor: z.string().max(100).nullable().optional() }))
  .handler(async ({ data, context }): Promise<NotePostPage> => listPosts(context.user.id, data))

/** One page of cards, newest first, narrowed by the filters on screen. */
export function loadPosts(data: z.infer<typeof filters> & { cursor?: string | null }) {
  return listFn({ data })
}

const authorsFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(async ({ context }): Promise<PostAuthor[]> => listPostAuthors(context.user.id))

export function loadPostAuthors() {
  return authorsFn()
}

const refreshFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(z.object({ ids: z.array(id).min(1).max(200) }))
  .handler(async ({ data, context }): Promise<NotePostCard[]> => refreshPosts(context.user.id, data.ids))

/** The cards still moving, as they are now. A missing one is gone. */
export function refreshPostCards(ids: string[]) {
  return refreshFn({ data: { ids } })
}

const readFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(z.object({ id }))
  .handler(async ({ data, context }): Promise<NotePostDetail> => loadPost(context.user.id, data.id))

export function loadPostDetail(postId: string) {
  return readFn({ data: { id: postId } })
}

const saveFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ url: z.string().trim().min(1).max(2048) }))
  .handler(
    async ({ data, context }): Promise<{ post: NotePostCard; alreadySaved: boolean }> =>
      savePostLink(context.user.id, data.url)
  )

/** Saves a post's link, or hands back the post already saved. Reading X starts on its own. */
export function savePost(url: string) {
  return saveFn({ data: { url } })
}

const analyseFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ id }))
  .handler(async ({ data, context }): Promise<NotePostDetail> => analysePost(context.user.id, data.id))

export function analyseNotePost(postId: string) {
  return analyseFn({ data: { id: postId } })
}

const analyseManyFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ ids: z.array(id).min(1).max(MANY_AT_ONCE_MAX) }))
  .handler(async ({ data, context }) => analysePosts(context.user.id, data.ids))

/** Queues several posts in one request; each comes back queued or skipped with its reason. */
export function analyseManyPosts(ids: string[]) {
  return analyseManyFn({ data: { ids } })
}

const mergeFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ ids: z.array(id).min(2).max(MANY_AT_ONCE_MAX) }))
  .handler(async ({ data, context }): Promise<NotePostCard> => mergePlans(context.user.id, data.ids))

/** Starts "One plan from many": a new entry the worker writes from the picked posts' plans. */
export function mergePostPlans(ids: string[]) {
  return mergeFn({ data: { ids } })
}

const retryFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ id }))
  .handler(async ({ data, context }): Promise<NotePostDetail> => retryPost(context.user.id, data.id))

export function retryNotePost(postId: string) {
  return retryFn({ data: { id: postId } })
}

const retryVideoFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ id }))
  .handler(async ({ data, context }): Promise<NotePostDetail> => retryPostVideo(context.user.id, data.id))

export function retryNotePostVideo(postId: string) {
  return retryVideoFn({ data: { id: postId } })
}

const deleteFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ id }))
  .handler(async ({ data, context }) => {
    await deletePost(context.user.id, data.id)
    return { id: data.id }
  })

export function deleteNotePost(postId: string) {
  return deleteFn({ data: { id: postId } })
}

const moveFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ id, folderId: id.nullable() }))
  .handler(
    async ({ data, context }): Promise<NotePostCard> => movePost(context.user.id, data.id, data.folderId)
  )

/** Into a folder, or out of every folder with null. */
export function moveNotePost(postId: string, folderId: string | null) {
  return moveFn({ data: { id: postId, folderId } })
}

const dropSuggestionFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ id }))
  .handler(
    async ({ data, context }): Promise<NotePostDetail> => dropFolderSuggestion(context.user.id, data.id)
  )

export function dropPostFolderSuggestion(postId: string) {
  return dropSuggestionFn({ data: { id: postId } })
}

const planFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(
    z.object({
      id,
      steps: z
        .array(
          z.object({
            text: z.string().max(PLAN_STEP_MAX * 2),
            done: z.boolean(),
            from: z.string().max(40).nullable().optional(),
          })
        )
        .max(PLAN_STEPS_MAX),
    })
  )
  .handler(
    async ({ data, context }): Promise<NotePostCard> => savePlan(context.user.id, data.id, data.steps)
  )

/** The whole plan as it now stands: edits, new steps, the order and the ticks. */
export function savePostPlan(postId: string, steps: { text: string; done: boolean; from?: string | null }[]) {
  return planFn({ data: { id: postId, steps } })
}

const highlightsFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(
    z.object({
      id,
      highlights: z
        .array(
          z.object({
            part: z.string().refine(isHighlightPart),
            start: z.number().int().min(0).max(1_000_000),
            end: z.number().int().min(0).max(1_000_000),
          })
        )
        .max(200),
    })
  )
  .handler(
    async ({ data, context }): Promise<NotePostCard> =>
      saveHighlights(context.user.id, data.id, data.highlights as Highlight[])
  )

export function savePostHighlights(postId: string, highlights: Highlight[]) {
  return highlightsFn({ data: { id: postId, highlights } })
}

const articleFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ id }))
  .handler(async ({ data, context }): Promise<NotePostDetail> => bringInArticle(context.user.id, data.id))

/** Fetches the article the post links to and keeps its words for the next Analyse. */
export function bringInPostArticle(postId: string) {
  return articleFn({ data: { id: postId } })
}
