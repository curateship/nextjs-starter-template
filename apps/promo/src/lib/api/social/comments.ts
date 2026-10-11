import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { adminGet, adminPost } from "@/server/guards"
import { MAX_CHECKS_PER_PRESS } from "@/lib/social/options"
import {
  listSentComments,
  queueCommentChecks,
  type CommentRow,
} from "@/server/social/comments"
import { setNotExample } from "@/server/social/examples"

import { createErrorMessage } from "../error-message"

export type { CommentRow }

/**
 * The comments screen's endpoints: every sent comment with what became of
 * it, a fresh reading through the browser, and the tick that keeps a weak
 * comment out of the AI's examples. Admin only, like every Reddit endpoint.
 */

export const getCommentsErrorMessage = createErrorMessage(
  { "no longer saved": "That comment is not there any more. Reload the page." },
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

const markFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ commentId: z.string().min(1), notExample: z.boolean() }))
  .handler(async ({ context, data }): Promise<void> =>
    setNotExample(context.user.id, data.commentId, data.notExample)
  )

export function markNotExample(commentId: string, notExample: boolean) {
  return markFn({ data: { commentId, notExample } })
}
