import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { adminPost } from "@/server/guards"
import {
  actorFor,
  actorForFind,
  actorForFinds,
  actorForKeyword,
  editorGet,
  editorPost,
} from "@/server/social/project-guests"
import {
  addKeyword,
  deleteKeyword,
  listFinds,
  listKeywords,
  loadFindDetail,
  setKeywordEnabled,
  type FindRow,
  type KeywordRow,
} from "@/server/social/keywords"
import { keywordIdeas, type KeywordIdeas } from "@/server/social/ai-tasks"
import { queueJob } from "@/server/social/jobs"
import { queueRulesRead } from "@/server/social/reddit/rules"
import { queueThreadRead, setFindStatus } from "@/server/social/reddit/search"
import {
  FIND_STATUSES,
  NO_READER_MESSAGE,
} from "@/lib/social/options"
import {
  REDDIT_SORTS,
  REDDIT_WINDOWS,
} from "@/lib/social/reddit/options"

import { createErrorMessage } from "../../error-message"

/**
 * The keywords and posts endpoints, for the Projects dashboard's middle
 * column. Keywords belong to a project, so every list names one.
 *
 * Every one is admin-only. Promo is a tool one person runs, and a member who
 * could queue browser work could spend somebody else's AI allowance and post
 * from somebody else's account.
 *
 * Nothing here talks to the browser. A press that needs the browser writes a
 * job and returns, because a search takes tens of seconds and a request that
 * waited for one would time out in front of the person.
 */

export const getRedditErrorMessage = createErrorMessage(
  {
    "already saved": "That keyword is already saved.",
    "already watched": "You already watch that subreddit.",
    "A watch takes one subreddit": "A watch takes one subreddit. Type a keyword to search several.",
    "Type a keyword": "Type a keyword first, or name one subreddit to watch.",
    "no longer saved": "That keyword has been removed. Reload the page.",
    "project does not exist": "That project is not there any more. Reload the page.",
    "There is no reader browser": NO_READER_MESSAGE,
    "now holds an account": "The reader browser now holds an account, so nothing is read in it. Pick another reader in Settings → Behaviour.",
    "description first": "Write what the project makes in its description first. The ideas come from it.",
    "key saved": "Add an AI provider key in Settings before asking for ideas.",
    AI_LIMIT_REACHED: "This month's AI allowance is used up.",
  },
  "That did not work. Please try again."
)

/** Words, or none with one subreddit for a watch. `addKeyword` holds that rule. */
const keywordInput = z.object({
  term: z.string().trim().max(200),
  subreddits: z.array(z.string().max(200)).max(20).default([]),
  sort: z.enum(REDDIT_SORTS),
  timeWindow: z.enum(REDDIT_WINDOWS),
})

const loadKeywordsFn = createServerFn({ method: "GET" })
  .middleware([editorGet])
  .inputValidator(z.object({ projectId: z.string().min(1) }))
  .handler(async ({ context, data }): Promise<KeywordRow[]> =>
    listKeywords((await actorFor(context.caller, data.projectId)).userId, data.projectId)
  )

export function loadKeywords(projectId: string) {
  return loadKeywordsFn({ data: { projectId } })
}

const newKeywordInput = keywordInput.extend({ projectId: z.string().min(1) })

/** Makes a keyword in a project. */
const addKeywordFn = createServerFn({ method: "POST" })
  .middleware([editorPost])
  .inputValidator(newKeywordInput)
  .handler(async ({ context, data: { projectId, ...input } }): Promise<{ id: string }> => ({
    id: await addKeyword((await actorFor(context.caller, projectId)).userId, projectId, input),
  }))

export function saveNewKeyword(data: z.input<typeof newKeywordInput>) {
  return addKeywordFn({ data })
}

const deleteKeywordFn = createServerFn({ method: "POST" })
  .middleware([editorPost])
  .inputValidator(z.object({ id: z.string().min(1) }))
  .handler(async ({ context, data }): Promise<void> => {
    await deleteKeyword((await actorForKeyword(context.caller, data.id)).userId, data.id)
  })

export function removeKeyword(id: string) {
  return deleteKeywordFn({ data: { id } })
}

export type { KeywordIdeas }

const ideasFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ projectId: z.string().min(1) }))
  .handler(async ({ context, data }): Promise<KeywordIdeas> => keywordIdeas(context.user.id, data.projectId))

/** Keywords and subreddits to watch, suggested from the project's description. Nothing is saved. */
export function suggestKeywords(projectId: string) {
  return ideasFn({ data: { projectId } })
}

/** Switches a keyword's timed searches on or off. Pressing it by hand still works when off. */
const enableKeywordFn = createServerFn({ method: "POST" })
  .middleware([editorPost])
  .inputValidator(z.object({ id: z.string().min(1), enabled: z.boolean() }))
  .handler(async ({ context, data }): Promise<void> => {
    await setKeywordEnabled((await actorForKeyword(context.caller, data.id)).userId, data.id, data.enabled)
  })

export function switchKeyword(id: string, enabled: boolean) {
  return enableKeywordFn({ data: { id, enabled } })
}

/**
 * Asks for a keyword to be searched. Returns as soon as the job is written,
 * because the browser takes tens of seconds and the screen polls instead.
 */
const runKeywordFn = createServerFn({ method: "POST" })
  .middleware([editorPost])
  .inputValidator(z.object({ keywordId: z.string().min(1) }))
  .handler(async ({ context, data }): Promise<{ jobId: string }> => ({
    jobId: await queueJob((await actorForKeyword(context.caller, data.keywordId)).userId, "search", {
      keywordId: data.keywordId,
    }),
  }))

export function runKeyword(keywordId: string) {
  return runKeywordFn({ data: { keywordId } })
}

const loadFindsFn = createServerFn({ method: "GET" })
  .middleware([editorGet])
  .inputValidator(
    z.object({
      projectId: z.string().min(1),
      keywordId: z.string().optional(),
      status: z.enum([...FIND_STATUSES, "all"]).optional(),
      limit: z.number().int().min(1).max(500).optional(),
    })
  )
  .handler(async ({ context, data }): Promise<FindRow[]> =>
    listFinds((await actorFor(context.caller, data.projectId)).userId, data)
  )

/** A project's posts: one keyword's, or with none every keyword's in one order. */
export function loadFinds(query: {
  projectId: string
  keywordId?: string
  status?: (typeof FIND_STATUSES)[number] | "all"
  limit?: number
}) {
  return loadFindsFn({ data: query })
}

const loadFindFn = createServerFn({ method: "GET" })
  .middleware([editorGet])
  .inputValidator(z.object({ findId: z.string().min(1) }))
  .handler(async ({ context, data }) => {
    const actor = await actorForFind(context.caller, data.findId)
    const find = await loadFindDetail(actor.userId, data.findId)
    // The owner's past comments may be from other projects, so a guest sees none.
    return find && actor.guest ? { ...find, pastAnswers: [] } : find
  })

export function loadFind(findId: string) {
  return loadFindFn({ data: { findId } })
}

/** Reads the post's replies through the browser, so it goes on the queue. */
const readThreadFn = createServerFn({ method: "POST" })
  .middleware([editorPost])
  .inputValidator(z.object({ findId: z.string().min(1) }))
  .handler(async ({ context, data }): Promise<void> => {
    await queueThreadRead((await actorForFind(context.caller, data.findId)).userId, data.findId)
  })

export function readThread(findId: string) {
  return readThreadFn({ data: { findId } })
}

/**
 * Reads the rules of the subreddit a post is in, through the browser, so it
 * goes on the queue. Named by the post rather than by a typed name, so only a
 * subreddit the app already found is ever asked about.
 */
const readRulesFn = createServerFn({ method: "POST" })
  .middleware([editorPost])
  .inputValidator(z.object({ findId: z.string().min(1) }))
  .handler(async ({ context, data }): Promise<void> => {
    const { userId } = await actorForFind(context.caller, data.findId)
    const find = await loadFindDetail(userId, data.findId)
    if (!find) throw new Error("That post is no longer saved.")
    await queueRulesRead(userId, find.subreddit)
  })

export function readSubredditRules(findId: string) {
  return readRulesFn({ data: { findId } })
}

/**
 * Moves one or many posts to a triage status in a single request, answering
 * with what moved and what did not, the way every other bulk action in the app
 * does.
 */
const setStatusFn = createServerFn({ method: "POST" })
  .middleware([editorPost])
  .inputValidator(
    z.object({
      findIds: z.array(z.string().min(1)).min(1).max(200),
      status: z.enum(["new", "shortlisted", "skipped"]),
    })
  )
  .handler(
    async ({
      context,
      data,
    }): Promise<{ completed: string[]; skipped: string[] }> =>
      setFindStatus((await actorForFinds(context.caller, data.findIds)).userId, data.findIds, data.status)
  )

export function setFindsStatus(
  findIds: string[],
  status: "new" | "shortlisted" | "skipped"
) {
  return setStatusFn({ data: { findIds, status } })
}
