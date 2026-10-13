import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { AI_TEXT_PROVIDERS } from "@/lib/ai/ai-models"
import { adminGet, adminPost } from "@/server/guards"
import {
  MAX_CHECKS_PER_PRESS,
  MAX_COMMENT_CHARS,
  NO_READER_MESSAGE,
} from "@/lib/social/options"
import {
  listSentComments,
  queueCommentChange,
  queueCommentChecks,
  type CommentRow,
} from "@/server/social/comments"
import {
  dismissFailures,
  failedWords,
  listFailures,
  type FailureRow,
} from "@/server/social/failures"
import { draftReplies, type WrittenDraft } from "@/server/social/drafts"
import { setNotExample } from "@/server/social/examples"
import {
  cancelWaitingReply,
  loadCommentReplies,
  queueReply,
  type CommentReplies,
} from "@/server/social/replies"

import { createErrorMessage, describeAuthError } from "../error-message"
import { getPostErrorMessage } from "./reddit/drafts"

export type { CommentRow, CommentReplies, FailureRow }

/**
 * The comments screen's endpoints: every sent comment with what became of
 * it, a fresh reading through the browser, and the tick that keeps a weak
 * comment out of the AI's examples. Admin only, like every Reddit endpoint.
 */

export const getCommentsErrorMessage = createErrorMessage(
  {
    "no longer saved": "That comment is not there any more. Reload the page.",
    "There is no reader browser": NO_READER_MESSAGE,
    "now holds an account": "The reader browser now holds an account, so nothing is read in it. Pick another reader in Settings → Behaviour.",
  },
  "That did not work. Please try again."
)

const listFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(async ({ context }): Promise<CommentRow[]> => listSentComments(context.user.id))

export function loadComments() {
  return listFn()
}

/**
 * Asks the browser program to read these comments again, in one request.
 * Returns once the jobs are written; the screen asks again until they finish.
 */
const checkFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.object({ commentIds: z.array(z.string().min(1)).min(1).max(MAX_CHECKS_PER_PRESS) })
  )
  .handler(
    async ({ context, data }): Promise<{ completed: string[]; skipped: string[] }> =>
      queueCommentChecks(context.user.id, data.commentIds)
  )

export function checkComments(commentIds: string[]) {
  return checkFn({ data: { commentIds } })
}

const failuresFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(async ({ context }): Promise<FailureRow[]> => listFailures(context.user.id))

/** Comments, answers and posts that did not reach Reddit, not yet dismissed. */
export function loadFailures() {
  return failuresFn()
}

const dismissFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ ids: z.array(z.string().min(1)).min(1).max(200) }))
  .handler(async ({ context, data }): Promise<{ completed: string[]; skipped: string[] }> =>
    dismissFailures(context.user.id, data.ids)
  )

/** Takes failures off the Failed tab. They stay on record. */
export function dismissFailed(ids: string[]) {
  return dismissFn({ data: { ids } })
}

const wordsFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(z.object({ jobId: z.string().min(1) }))
  .handler(async ({ context, data }) => failedWords(context.user.id, data.jobId))

/** A failed comment's post, words and account, for Try again. Null when it is not one. */
export function loadFailedWords(jobId: string) {
  return wordsFn({ data: { jobId } })
}

const changeFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.discriminatedUnion("kind", [
      z.object({ commentId: z.string().min(1), kind: z.literal("delete") }),
      z.object({
        commentId: z.string().min(1),
        kind: z.literal("edit"),
        text: z.string().trim().min(1, "There is nothing to change it to.").max(MAX_COMMENT_CHARS),
      }),
    ])
  )
  .handler(async ({ context, data }): Promise<void> =>
    queueCommentChange(
      context.user.id,
      data.commentId,
      data.kind === "delete" ? { kind: "delete" } : { kind: "edit", text: data.text }
    )
  )

/**
 * Deletes a sent comment from Reddit, from the account that sent it. A person
 * pressed Delete and confirmed it to get here.
 */
export function deleteComment(commentId: string) {
  return changeFn({ data: { commentId, kind: "delete" } })
}

/** Changes a sent comment's words on Reddit. A person pressed Save changes to get here. */
export function editComment(commentId: string, text: string) {
  return changeFn({ data: { commentId, kind: "edit", text } })
}

const markFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ commentId: z.string().min(1), notExample: z.boolean() }))
  .handler(async ({ context, data }): Promise<void> =>
    setNotExample(context.user.id, data.commentId, data.notExample)
  )

export function markNotExample(commentId: string, notExample: boolean) {
  return markFn({ data: { commentId, notExample } })
}

/**
 * Answering a reply refuses in words written for the reader, often with a
 * date or a time, so those pass through as they are. Anything else goes
 * through Post's own lookup, which knows the warm-up, the pace and the AI key.
 */
const REPLY_REFUSALS = [
  "is paused",
  "never landed on Reddit",
  "already deleted",
  "change to that comment",
  "words it already has",
  "nothing to change it to",
  "That comment is no longer saved",
  "already answered",
  "already on its way",
  "no longer waiting",
  "not among the replies",
  "Only a reply under",
  "no Reddit address",
  "is retired",
  "not there any more",
  "no browser profile",
  "capped at",
]

export function getReplyErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : ""
  if (REPLY_REFUSALS.some((words) => message.includes(words))) {
    return describeAuthError(message) ?? message
  }
  return getPostErrorMessage(error)
}

const replyIds = z.object({ commentId: z.string().min(1), replyId: z.string().min(1).max(20) })

const repliesFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(z.object({ commentId: z.string().min(1) }))
  .handler(async ({ context, data }): Promise<CommentReplies> =>
    loadCommentReplies(context.user.id, data.commentId)
  )

/** A sent comment and the replies directly under it, each with its answer. */
export function loadReplies(commentId: string) {
  return repliesFn({ data: { commentId } })
}

const draftFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    replyIds.extend({
      provider: z.enum(AI_TEXT_PROVIDERS).optional(),
      model: z.string().max(120).optional(),
    })
  )
  .handler(async ({ context, data }): Promise<WrittenDraft[]> =>
    draftReplies({ userId: context.user.id, ...data })
  )

/** Two drafts answering one reply, in the voice of the account that sent the comment. */
export function writeReplyDrafts(commentId: string, replyId: string) {
  return draftFn({ data: { commentId, replyId } })
}

/**
 * Sends an answer from the account that sent the comment. A person pressed
 * Reply to get here, which is the only way an answer is ever written. The
 * same rules as Post: refused while warming up or at a young account's pace
 * limit, and outside its waking hours it waits for its morning.
 */
const sendFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    replyIds.extend({
      text: z.string().trim().min(1, "There is nothing to post.").max(MAX_COMMENT_CHARS),
      draftId: z.string().min(1).nullable(),
    })
  )
  .handler(
    async ({ context, data }): Promise<{ runAfter: Date | null; handle: string }> => {
      const { runAfter, handle } = await queueReply(context.user.id, data)
      return { runAfter, handle }
    }
  )

export function sendReply(data: { commentId: string; replyId: string; text: string; draftId: string | null }) {
  return sendFn({ data })
}

const cancelFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(replyIds)
  .handler(async ({ context, data }): Promise<void> =>
    cancelWaitingReply(context.user.id, data.commentId, data.replyId)
  )

/** Cancels an answer still waiting for the account's waking hours. */
export function cancelReply(commentId: string, replyId: string) {
  return cancelFn({ data: { commentId, replyId } })
}
