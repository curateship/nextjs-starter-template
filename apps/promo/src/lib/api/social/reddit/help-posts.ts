import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { adminGet, adminPost } from "@/server/guards"
import { queueHelpRead, readHelpPage, type HelpPage } from "@/server/social/reddit/help-posts"
import { NO_READER_MESSAGE } from "@/lib/social/options"

import { createErrorMessage, describeAuthError } from "../../error-message"

export type { HelpPage }

/**
 * Help-only posts for one account: the newest posts in the subreddits it has
 * joined, answered with help and never a word about what you make. Admin
 * only, like every Reddit endpoint.
 */

const REFUSALS = ["has not joined any subreddits", "not there any more"]

export function getHelpErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : ""
  if (REFUSALS.some((words) => message.includes(words))) return describeAuthError(message) ?? message
  return fallback(error)
}

const fallback = createErrorMessage(
  {
    "There is no reader browser": NO_READER_MESSAGE,
    "now holds an account": "The reader browser now holds an account, so nothing is read in it. Pick another reader in Settings → Behaviour.",
  },
  "That did not work. Please try again."
)

const pageFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(z.object({ accountId: z.string().min(1) }))
  .handler(async ({ context, data }): Promise<HelpPage> => readHelpPage(context.user.id, data.accountId))

/** One account's help-only posts, with what the comment box needs about the account. */
export function loadHelpPage(accountId: string) {
  return pageFn({ data: { accountId } })
}

const readFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ accountId: z.string().min(1) }))
  .handler(async ({ context, data }): Promise<void> => queueHelpRead(context.user.id, data.accountId))

/** Reads the newest posts in the account's joined subreddits, in the reader browser. */
export function readHelpPostsFor(accountId: string) {
  return readFn({ data: { accountId } })
}
