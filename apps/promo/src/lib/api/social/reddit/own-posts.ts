import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { adminPost } from "@/server/guards"
import {
  actorFor,
  actorForJobs,
  editorGet,
  editorPost,
  guestSenderName,
  onlyGuestProject,
} from "@/server/social/project-guests"
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
import { readerWrittenRefusal } from "@/lib/social/refusal-words"

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
  const written = readerWrittenRefusal(error)
  if (written) return written
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
  .middleware([editorPost])
  .inputValidator(postInput)
  .handler(async ({ context, data }): Promise<{ runAfter: Date | null }> => {
    const actor = await actorFor(context.caller, data.projectId)
    const { runAfter } = await queueOwnPost(actor.userId, data.projectId, { ...data, sentBy: guestSenderName(actor) })
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

// The project the New post window is open in, so a guest's rules are read
// as that project's owner. Rules are a subreddit's own public words.
const rulesInput = z.object({ subreddit: z.string().max(120), projectId: z.string().min(1).nullable().default(null) })

const rulesFn = createServerFn({ method: "GET" })
  .middleware([editorGet])
  .inputValidator(rulesInput)
  .handler(async ({ context, data }): Promise<{ subreddit: string; rules: RulesView } | null> => {
    const { userId } = await actorFor(context.caller, data.projectId)
    const subreddit = cleanSubreddit(data.subreddit)
    return subreddit ? { subreddit, rules: await rulesForSubreddit(userId, subreddit) } : null
  })

/** A typed subreddit's rules as last read, in all four of their states. */
export function loadRulesFor(subreddit: string, projectId: string | null = null) {
  return rulesFn({ data: { subreddit, projectId } })
}

const readRulesFn = createServerFn({ method: "POST" })
  .middleware([editorPost])
  .inputValidator(rulesInput.extend({ subreddit: z.string().trim().min(1).max(120) }))
  .handler(async ({ context, data }): Promise<void> => {
    const { userId } = await actorFor(context.caller, data.projectId)
    const subreddit = cleanSubreddit(data.subreddit)
    if (!subreddit) throw new Error("Name the subreddit it goes to.")
    await queueRulesRead(userId, subreddit)
  })

/** Reads a typed subreddit's rules in the reader browser, so it goes on the queue. */
export function readRulesFor(subreddit: string, projectId: string | null = null) {
  return readRulesFn({ data: { subreddit, projectId } })
}

const listFn = createServerFn({ method: "GET" })
  .middleware([editorGet])
  .inputValidator(z.object({ projectId: z.string().min(1).nullable().default(null) }))
  .handler(async ({ context, data }): Promise<OwnPostRow[]> => {
    const actor = await actorFor(context.caller, data.projectId)
    const rows = await listOwnPosts(actor.userId)
    return onlyGuestProject(actor, rows, (row) => row.project?.id ?? null)
  })

/** Every post of your own that landed, newest first. A guest names the project. */
export function loadOwnPosts(projectId: string | null = null) {
  return listFn({ data: { projectId } })
}

const failedFn = createServerFn({ method: "GET" })
  .middleware([editorGet])
  .inputValidator(z.object({ jobId: z.string().min(1) }))
  .handler(async ({ context, data }) =>
    failedPost((await actorForJobs(context.caller, [data.jobId])).userId, data.jobId)
  )

/** A failed post's subreddit, title, words and account, for Try again. */
export function loadFailedPost(jobId: string) {
  return failedFn({ data: { jobId } })
}
