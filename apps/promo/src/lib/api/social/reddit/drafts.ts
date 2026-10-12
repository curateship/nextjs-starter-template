import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { AI_TEXT_PROVIDERS } from "@/lib/ai/ai-models"
import { adminPost } from "@/server/guards"
import { readAccount } from "@/server/social/accounts"
import { MAX_COMMENT_CHARS } from "@/lib/social/options"
import { draftComments, type WrittenDraft } from "@/server/social/drafts"
import { cancelWaitingComment, queueComment } from "@/server/social/posting"

import { createErrorMessage, describeAuthError } from "../../error-message"

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

/**
 * Post's refusals are written for the reader and carry a date or a time, so
 * they pass through as they are. Anything else goes through the lookup above.
 */
const POST_REFUSALS = [
  "still warming up",
  "young account",
  "how old this account is",
  "already on its way",
  "no longer waiting",
]

export function getPostErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : ""
  if (POST_REFUSALS.some((words) => message.includes(words))) {
    return describeAuthError(message) ?? message
  }
  return getDraftErrorMessage(error)
}

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
 * comment is ever written to Reddit. A warming account, or a young one at its
 * pace limit, is refused with why. Outside the account's waking hours the
 * comment waits for its morning, and the answer says when.
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
  .handler(async ({ context, data }): Promise<{ jobId: string; runAfter: Date | null }> => {
    const account = await readAccount(context.user.id)
    if (!account) throw new Error("Set up a Reddit account first, in Settings.")
    return queueComment(
      context.user.id,
      { id: account.id, profileId: account.profile?.id ?? null, redditCreatedAt: account.redditCreatedAt },
      { findId: data.findId, text: data.text, draftId: data.draftId ?? null }
    )
  })

export function sendComment(data: {
  findId: string
  text: string
  draftId?: string | null
}) {
  return postFn({ data })
}

/** Cancels a comment still waiting for the account's waking hours. */
const cancelFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ findId: z.string().min(1) }))
  .handler(async ({ context, data }): Promise<void> => {
    await cancelWaitingComment(context.user.id, data.findId)
  })

export function cancelComment(findId: string) {
  return cancelFn({ data: { findId } })
}
