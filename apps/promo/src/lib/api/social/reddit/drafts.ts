import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { AI_TEXT_PROVIDERS } from "@/lib/ai/ai-models"
import { adminPost } from "@/server/guards"
import { accountForFind } from "@/server/social/projects"
import { MAX_COMMENT_CHARS, PICK_AN_ACCOUNT } from "@/lib/social/options"
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
    // The server says "There is no anthropic key saved", naming the provider.
    "key saved": "Add an AI provider key in Settings before asking for a draft.",
    "no longer saved": "That post has been removed. Reload the page.",
    "account is not there any more": "That account is not there any more. Reload the page.",
    "not in this post's project": "That account is not in this post's project. Pick one of the project's accounts on the left.",
    AI_LIMIT_REACHED: "This month's AI allowance is used up.",
  },
  "The draft could not be written. Please try again."
)

/**
 * Post's refusals are written for the reader and carry a date or a time, so
 * they pass through as they are. Anything else goes through the lookup above.
 */
const POST_REFUSALS = [
  "Pick an account on the left",
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
      accountId: z.string().min(1).nullable(),
      provider: z.enum(AI_TEXT_PROVIDERS).optional(),
      model: z.string().max(120).optional(),
    })
  )
  .handler(async ({ context, data }): Promise<WrittenDraft[]> => {
    // The clicked account, checked against the post's project, so a draft
    // is never told another product's description.
    const account = data.accountId
      ? await accountForFind(context.user.id, data.accountId, data.findId)
      : null
    return draftComments({
      userId: context.user.id,
      findId: data.findId,
      accountId: account?.id ?? null,
      provider: data.provider,
      model: data.model,
    })
  })

/**
 * Drafts in the clicked account's voice, told its project's description.
 * With no account clicked yet, no voice and the post's project's description.
 */
export function writeDrafts(data: {
  findId: string
  accountId: string | null
  provider?: (typeof AI_TEXT_PROVIDERS)[number]
  model?: string
}) {
  return draftFn({ data })
}

/**
 * Sends a comment from the account clicked on the Projects dashboard. A person
 * pressed Post to get here, which is the only way a comment is ever written to
 * Reddit. Every rule follows that account: a warming one, or a young one at
 * its pace limit, is refused with why, and outside its own waking hours the
 * comment waits for its morning and the answer says when.
 */
const postFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.object({
      findId: z.string().min(1),
      accountId: z.string().min(1).nullable(),
      text: z.string().trim().min(1, "There is nothing to post.").max(MAX_COMMENT_CHARS),
      draftId: z.string().min(1).nullable().optional(),
    })
  )
  .handler(async ({ context, data }): Promise<{ jobId: string; runAfter: Date | null }> => {
    if (!data.accountId) throw new Error(PICK_AN_ACCOUNT)
    const account = await accountForFind(context.user.id, data.accountId, data.findId)
    return queueComment(context.user.id, account, {
      findId: data.findId,
      text: data.text,
      draftId: data.draftId ?? null,
    })
  })

export function sendComment(data: {
  findId: string
  accountId: string | null
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
