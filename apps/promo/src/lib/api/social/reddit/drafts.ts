import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { AI_TEXT_PROVIDERS } from "@/lib/ai/ai-models"
import { adminPost } from "@/server/guards"
import { readAccount } from "@/server/social/accounts"
import { MAX_COMMENT_CHARS } from "@/lib/social/options"
import { draftComments, type WrittenDraft } from "@/server/social/drafts"
import { queueJob } from "@/server/social/jobs"

import { createErrorMessage } from "../../error-message"

/**
 * Writing and sending a comment.
 *
 * Drafting happens in the request, because an AI call takes seconds and the
 * person is watching the box. Posting goes on the queue, because it needs the
 * browser.
 */

export const getDraftErrorMessage = createErrorMessage(
  {
    "no key": "Add an AI provider key in Settings before asking for a draft.",
    "no longer saved": "That post has been removed. Reload the page.",
    "Set up a Reddit account": "Set up your Reddit account in Settings first.",
    AI_LIMIT_REACHED: "This month's AI allowance is used up.",
  },
  "The draft could not be written. Please try again."
)

const draftFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.object({
      findId: z.string().min(1),
      provider: z.enum(AI_TEXT_PROVIDERS).optional(),
      model: z.string().max(120).optional(),
    })
  )
  .handler(async ({ context, data }): Promise<WrittenDraft[]> => {
    const account = await readAccount(context.user.id)
    if (!account) throw new Error("Set up a Reddit account first, in Settings.")
    return draftComments({
      userId: context.user.id,
      findId: data.findId,
      accountId: account.id,
      provider: data.provider,
      model: data.model,
    })
  })

export function writeDrafts(data: {
  findId: string
  provider?: (typeof AI_TEXT_PROVIDERS)[number]
  model?: string
}) {
  return draftFn({ data })
}

/**
 * Sends a comment. A person pressed Post to get here, which is the only way a
 * comment is ever written to Reddit.
 */
const postFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.object({
      findId: z.string().min(1),
      text: z.string().trim().min(1, "There is nothing to post.").max(MAX_COMMENT_CHARS),
      draftId: z.string().min(1).nullable().optional(),
    })
  )
  .handler(async ({ context, data }): Promise<{ jobId: string }> => {
    const account = await readAccount(context.user.id)
    if (!account) throw new Error("Set up a Reddit account first, in Settings.")
    return {
      jobId: await queueJob(context.user.id, "comment", {
        findId: data.findId,
        accountId: account.id,
        text: data.text,
        draftId: data.draftId ?? null,
      }),
    }
  })

export function sendComment(data: {
  findId: string
  text: string
  draftId?: string | null
}) {
  return postFn({ data })
}
