import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { adminGet, adminPost } from "@/server/guards"
import {
  addKeyword,
  deleteKeyword,
  listFinds,
  listKeywords,
  loadFindDetail,
  type FindRow,
  type KeywordRow,
} from "@/server/social/keywords"
import { queueJob } from "@/server/social/jobs"
import { setFindStatus } from "@/server/social/reddit/search"
import {
  FIND_STATUSES,
} from "@/lib/social/options"
import {
  REDDIT_SORTS,
  REDDIT_WINDOWS,
} from "@/lib/social/reddit/options"

import { createErrorMessage } from "../../error-message"

/**
 * The Reddit screen's endpoints.
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
    "Type a keyword": "Type a keyword first.",
    "no longer saved": "That keyword has been removed. Reload the page.",
  },
  "That did not work. Please try again."
)

const keywordInput = z.object({
  term: z.string().trim().min(1, "Type a keyword first.").max(200),
  subreddits: z.array(z.string().max(200)).max(20).default([]),
  sort: z.enum(REDDIT_SORTS),
  timeWindow: z.enum(REDDIT_WINDOWS),
})

const loadKeywordsFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(async ({ context }): Promise<KeywordRow[]> =>
    listKeywords(context.user.id)
  )

export function loadKeywords() {
  return loadKeywordsFn()
}

const addKeywordFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(keywordInput)
  .handler(async ({ context, data }): Promise<{ id: string }> => ({
    id: await addKeyword(context.user.id, data),
  }))

export function saveNewKeyword(data: z.input<typeof keywordInput>) {
  return addKeywordFn({ data })
}

const deleteKeywordFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ id: z.string().min(1) }))
  .handler(async ({ context, data }): Promise<void> => {
    await deleteKeyword(context.user.id, data.id)
  })

export function removeKeyword(id: string) {
  return deleteKeywordFn({ data: { id } })
}

/**
 * Asks for a keyword to be searched. Returns as soon as the job is written,
 * because the browser takes tens of seconds and the screen polls instead.
 */
const runKeywordFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ keywordId: z.string().min(1) }))
  .handler(async ({ context, data }): Promise<{ jobId: string }> => ({
    jobId: await queueJob(context.user.id, "search", {
      keywordId: data.keywordId,
    }),
  }))

export function runKeyword(keywordId: string) {
  return runKeywordFn({ data: { keywordId } })
}

const loadFindsFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(
    z.object({
      keywordId: z.string().optional(),
      status: z.enum([...FIND_STATUSES, "all"]).optional(),
      limit: z.number().int().min(1).max(500).optional(),
    })
  )
  .handler(async ({ context, data }): Promise<FindRow[]> =>
    listFinds(context.user.id, data)
  )

export function loadFinds(query: {
  keywordId?: string
  status?: (typeof FIND_STATUSES)[number] | "all"
  limit?: number
}) {
  return loadFindsFn({ data: query })
}

const loadFindFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(z.object({ findId: z.string().min(1) }))
  .handler(async ({ context, data }) => loadFindDetail(context.user.id, data.findId))

export function loadFind(findId: string) {
  return loadFindFn({ data: { findId } })
}

/** Reads the post's replies through the browser, so it goes on the queue. */
const readThreadFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ findId: z.string().min(1) }))
  .handler(async ({ context, data }): Promise<{ jobId: string }> => ({
    jobId: await queueJob(context.user.id, "thread", { findId: data.findId }),
  }))

export function readThread(findId: string) {
  return readThreadFn({ data: { findId } })
}

/**
 * Moves one or many posts to a triage status in a single request, answering
 * with what moved and what did not, the way every other bulk action in the app
 * does.
 */
const setStatusFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
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
      setFindStatus(context.user.id, data.findIds, data.status)
  )

export function setFindsStatus(
  findIds: string[],
  status: "new" | "shortlisted" | "skipped"
) {
  return setStatusFn({ data: { findIds, status } })
}
