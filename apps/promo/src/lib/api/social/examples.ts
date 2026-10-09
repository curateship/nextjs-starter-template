import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { adminGet, adminPost } from "@/server/guards"
import { readAccount } from "@/server/social/accounts"
import { listSentComments, setNotExample, type SentComment } from "@/server/social/examples"

import { createErrorMessage } from "../error-message"

export type { SentComment }

/**
 * The Reddit account's sent comments, which drafts copy the voice of, and the
 * tick that leaves a weak one out. Admin only, like every Reddit endpoint.
 */

export const getExamplesErrorMessage = createErrorMessage(
  { "no longer saved": "That comment is not there any more. Reload the page." },
  "That did not work. Please try again."
)

const listFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(async ({ context }): Promise<SentComment[]> => {
    const account = await readAccount(context.user.id)
    return account ? listSentComments(context.user.id, account.id) : []
  })

export function loadSentComments() {
  return listFn()
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
