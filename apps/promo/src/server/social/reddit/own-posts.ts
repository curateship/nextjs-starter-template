import { and, desc, eq, inArray } from "drizzle-orm"

import { uuid } from "@/server/auth/security"
import { redditSubmit, type CommandTarget } from "@/server/browser/command"
import { Refusal } from "@/server/browser/refusal"
import { db as defaultDb, type CustomShellDb } from "@/server/db"
import { MAX_POST_BODY_CHARS, MAX_POST_TITLE_CHARS, NO_PROFILE_MESSAGE } from "@/lib/social/options"
import { postingRefusalText } from "@/lib/social/wording"

import { queueJob } from "../jobs"
import { readPostingState } from "../posting"
import { cleanSubreddit } from "../keywords"
import { promoAccounts, promoJobs, promoPosts, promoProjects } from "../schema"

import { blockedNames } from "./blocked"

/**
 * Posts of your own: a new post in a subreddit, not a comment on somebody
 * else's. Tyler picked this on 12 Oct 2026, because some subreddits welcome
 * an "I built this" post on set days and comments cannot reach those.
 *
 * Every rule that guards Post guards this too: the account must be the
 * person's, in use, not paused, past its warm-up and inside its pace, and
 * outside its waking hours the post waits for its morning. It is tried once
 * and never again, because a second go could post twice. Moderators remove
 * self-promotion posts faster than comments, so the window shows the
 * subreddit's rules before anything is written.
 */

export type OwnPostInput = {
  accountId: string
  subreddit: string
  title: string
  body: string
}

/**
 * Queues a post a person pressed Post for, or refuses it with why. Returns
 * when it goes: now, or the account's next morning.
 */
export async function queueOwnPost(
  userId: string,
  projectId: string,
  input: OwnPostInput,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<{ jobId: string; runAfter: Date | null }> {
  const subreddit = cleanSubreddit(input.subreddit)
  const title = input.title.trim()
  const body = input.body.trim()
  if (!subreddit) throw new Refusal("Name the subreddit it goes to.")
  if (!title) throw new Refusal("A post needs a title.")
  if (title.length > MAX_POST_TITLE_CHARS) {
    throw new Refusal(`That title is ${title.length} characters, and Reddit stops at ${MAX_POST_TITLE_CHARS}.`)
  }
  if (body.length > MAX_POST_BODY_CHARS) {
    throw new Refusal(`That post is ${body.length} characters, and a post here stops at ${MAX_POST_BODY_CHARS}.`)
  }
  if ((await blockedNames(userId, db)).has(subreddit.toLowerCase())) {
    throw new Refusal(`r/${subreddit} is on your list of subreddits you never see. Unblock it in Settings first.`)
  }

  const [account] = await db
    .select()
    .from(promoAccounts)
    .where(and(eq(promoAccounts.id, input.accountId), eq(promoAccounts.userId, userId)))
    .limit(1)
  if (!account || account.retiredAt) throw new Refusal("That account is not there any more.")
  if (account.projectId !== projectId) {
    throw new Refusal("That account is not in this project. Pick one of the project's accounts.")
  }
  if (!account.profileId && !account.phoneId) throw new Refusal(NO_PROFILE_MESSAGE)

  const [onItsWay] = await db
    .select({ id: promoJobs.id })
    .from(promoJobs)
    .where(
      and(
        eq(promoJobs.userId, userId),
        eq(promoJobs.kind, "submit"),
        inArray(promoJobs.status, ["queued", "running"])
      )
    )
    .limit(1)
  if (onItsWay) {
    throw new Refusal("A post of yours is already on its way. Wait for it to land before sending another.")
  }

  const state = await readPostingState(userId, account, db, now)
  const refusal = postingRefusalText(state, now, state.timeZone)
  if (refusal) throw new Refusal(refusal)

  const runAfter = state.nextWakeAt
  const jobId = await queueJob(
    userId,
    "submit",
    { accountId: account.id, projectId, subreddit, title, body },
    db,
    runAfter
  )
  return { jobId, runAfter }
}

/**
 * Sends the post, for a `submit` job, and keeps a row whatever happens: the
 * address when it landed, the reason when it did not.
 */
export async function submitOwnPost(
  userId: string,
  accountId: string,
  payload: Record<string, unknown>,
  target: CommandTarget,
  db: CustomShellDb = defaultDb
): Promise<void> {
  const subreddit = cleanSubreddit(String(payload.subreddit ?? ""))
  const title = String(payload.title ?? "").trim()
  const body = String(payload.body ?? "").trim()
  const projectId = typeof payload.projectId === "string" ? payload.projectId : null
  if (!subreddit || !title) throw new Error("That post job is missing its subreddit or its title.")

  const id = uuid()
  try {
    const { postUrl, visit } = await redditSubmit(target, { subreddit, title, body })
    if (!postUrl.startsWith("https://www.reddit.com/")) {
      throw new Error("Reddit answered with an address that is not Reddit's.")
    }
    await db.insert(promoPosts).values({ id, userId, accountId, projectId, subreddit, title, body, status: "posted", postUrl, visit })
    await db.update(promoAccounts).set({ lastPostedAt: new Date() }).where(eq(promoAccounts.id, accountId))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await db
      .insert(promoPosts)
      .values({ id, userId, accountId, projectId, subreddit, title, body, status: "failed", lastError: message })
    throw error
  }
}

export type OwnPostRow = {
  id: string
  title: string
  body: string
  subreddit: string
  postUrl: string
  postedAt: Date
  account: { id: string; handle: string }
  project: { id: string; name: string } | null
}

/** Every post of your own that landed, newest first, for the Comments screen's Posts tab. */
export async function listOwnPosts(userId: string, db: CustomShellDb = defaultDb): Promise<OwnPostRow[]> {
  const rows = await db
    .select({
      post: promoPosts,
      handle: promoAccounts.handle,
      projectName: promoProjects.name,
    })
    .from(promoPosts)
    .innerJoin(promoAccounts, eq(promoAccounts.id, promoPosts.accountId))
    .leftJoin(promoProjects, eq(promoProjects.id, promoPosts.projectId))
    .where(and(eq(promoPosts.userId, userId), eq(promoPosts.status, "posted")))
    .orderBy(desc(promoPosts.postedAt))
  return rows.map(({ post, handle, projectName }) => ({
    id: post.id,
    title: post.title,
    body: post.body,
    subreddit: post.subreddit,
    postUrl: post.postUrl,
    postedAt: post.postedAt,
    account: { id: post.accountId, handle },
    project: post.projectId && projectName !== null ? { id: post.projectId, name: projectName } : null,
  }))
}

/**
 * A failed post's subreddit, title, words and account, for Try again, which
 * opens New post with them filled in. Never sends them.
 */
export async function failedPost(
  userId: string,
  jobId: string,
  db: CustomShellDb = defaultDb
): Promise<(OwnPostInput & { projectId: string | null }) | null> {
  const [job] = await db
    .select({ kind: promoJobs.kind, status: promoJobs.status, payload: promoJobs.payload })
    .from(promoJobs)
    .where(and(eq(promoJobs.id, jobId), eq(promoJobs.userId, userId)))
    .limit(1)
  if (!job || job.kind !== "submit" || job.status !== "failed") return null
  const text = (value: unknown) => (typeof value === "string" ? value : "")
  return {
    accountId: text(job.payload.accountId),
    projectId: text(job.payload.projectId) || null,
    subreddit: text(job.payload.subreddit),
    title: text(job.payload.title),
    body: text(job.payload.body),
  }
}
