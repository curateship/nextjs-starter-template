import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { adminGet, adminPost } from "@/server/guards"
import { draftOwnPost } from "@/server/social/ai-tasks"
import { cleanSubreddit } from "@/server/social/keywords"
import {
  failedPost,
  listOwnPosts,
  queueOwnPost,
  type OwnPostRow,
} from "@/server/social/reddit/own-posts"
import { queueRulesRead, rulesForSubreddit, type RulesView } from "@/server/social/reddit/rules"
import { MAX_POST_BODY_CHARS, MAX_POST_TITLE_CHARS, NO_READER_MESSAGE } from "@/lib/social/options"

import { createErrorMessage, describeAuthError } from "../../error-message"

export type { OwnPostRow }

/**
 * Posts of your own: the New post window on a project's dashboard and the
 * Posts tab on the Comments screen. Admin only, like every Reddit endpoint.
 * Writing a post is the only thing here that reaches Reddit, and it goes on
 * the queue because a person pressed Post.
 */

/** A post's refusals are written for the reader and pass through as they are. */
const REFUSALS = [
  "Name the subreddit",
  "needs a title",
  "characters",
  "never see",
  "not in this project",
  "not there any more",
  "already on its way",
  "warming up",
  "young account",
  "how old this account is",
  "is paused",
  "browser profile",
]

export function getOwnPostErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : ""
  if (REFUSALS.some((words) => message.includes(words))) return describeAuthError(message) ?? message
  return fallback(error)
}

const fallback = createErrorMessage(
  {
    "key saved": "Add an AI provider key in Settings before asking for a draft.",
    AI_LIMIT_REACHED: "This month's AI allowance is used up.",
    "There is no reader browser": NO_READER_MESSAGE,
    "description first": "Write what the project makes in its description first.",
  },
  "That did not work. Please try again."
)

const postInput = z.object({
  projectId: z.string().min(1),
  accountId: z.string().min(1),
  subreddit: z.string().trim().min(1).max(120),
  title: z.string().trim().min(1).max(MAX_POST_TITLE_CHARS),
  body: z.string().max(MAX_POST_BODY_CHARS).default(""),
})

const sendFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(postInput)
  .handler(async ({ context, data }): Promise<{ runAfter: Date | null }> => {
    const { runAfter } = await queueOwnPost(context.user.id, data.projectId, data)
    return { runAfter }
  })

/** Sends a post of your own from one of the project's accounts. A person pressed Post. */
export function sendOwnPost(data: z.input<typeof postInput>) {
  return sendFn({ data })
}

const draftFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.object({
      projectId: z.string().min(1),
      accountId: z.string().min(1).nullable(),
      subreddit: z.string().trim().min(1).max(120),
      idea: z.string().max(2_000).default(""),
    })
  )
  .handler(async ({ context, data }) => draftOwnPost(context.user.id, data))

/** A title and words written by the AI, for a person to read and change. Never sent by itself. */
export function writeOwnPost(data: { projectId: string; accountId: string | null; subreddit: string; idea: string }) {
  return draftFn({ data })
}

const rulesFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(z.object({ subreddit: z.string().max(120) }))
  .handler(async ({ context, data }): Promise<{ subreddit: string; rules: RulesView } | null> => {
    const subreddit = cleanSubreddit(data.subreddit)
    return subreddit ? { subreddit, rules: await rulesForSubreddit(context.user.id, subreddit) } : null
  })

/** A typed subreddit's rules as last read, in all four of their states. */
export function loadRulesFor(subreddit: string) {
  return rulesFn({ data: { subreddit } })
}

const readRulesFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ subreddit: z.string().trim().min(1).max(120) }))
  .handler(async ({ context, data }): Promise<void> => {
    const subreddit = cleanSubreddit(data.subreddit)
    if (!subreddit) throw new Error("Name the subreddit it goes to.")
    await queueRulesRead(context.user.id, subreddit)
  })

/** Reads a typed subreddit's rules in the reader browser, so it goes on the queue. */
export function readRulesFor(subreddit: string) {
  return readRulesFn({ data: { subreddit } })
}

const listFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(async ({ context }): Promise<OwnPostRow[]> => listOwnPosts(context.user.id))

/** Every post of your own that landed, newest first. */
export function loadOwnPosts() {
  return listFn()
}

const failedFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(z.object({ jobId: z.string().min(1) }))
  .handler(async ({ context, data }) => failedPost(context.user.id, data.jobId))

/** A failed post's subreddit, title, words and account, for Try again. */
export function loadFailedPost(jobId: string) {
  return failedFn({ data: { jobId } })
}
