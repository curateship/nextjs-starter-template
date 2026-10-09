import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { adminGet, adminPost } from "@/server/guards"
import {
  blockSubreddit,
  listBlockedSubreddits,
  unblockSubreddit,
  type BlockedSubreddit,
} from "@/server/social/reddit/blocked"

import { createErrorMessage } from "../../error-message"

export type { BlockedSubreddit }

/**
 * The subreddits the Reddit screen never shows. Blocked with one press from a
 * post's row, and taken back off on the Reddit account settings tab. Admin
 * only, like every other Reddit endpoint.
 */

export const getBlockedErrorMessage = createErrorMessage(
  {
    "Type a subreddit": "Type a subreddit name first.",
    "is not blocked": "That subreddit is not blocked any more. Reload the page.",
  },
  "That did not work. Please try again."
)

const nameInput = z.object({ subreddit: z.string().trim().min(1).max(200) })

const listFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(async ({ context }): Promise<BlockedSubreddit[]> =>
    listBlockedSubreddits(context.user.id)
  )

export function loadBlockedSubreddits() {
  return listFn()
}

const blockFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(nameInput)
  .handler(async ({ context, data }) => blockSubreddit(context.user.id, data.subreddit))

/** Blocks a subreddit and answers with how many stored posts it hid. */
export function blockRedditSubreddit(subreddit: string) {
  return blockFn({ data: { subreddit } })
}

const unblockFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(nameInput)
  .handler(async ({ context, data }) => unblockSubreddit(context.user.id, data.subreddit))

/** Takes a subreddit off the list and answers with how many posts came back. */
export function unblockRedditSubreddit(subreddit: string) {
  return unblockFn({ data: { subreddit } })
}
