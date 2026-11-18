import { and, desc, eq, inArray } from "drizzle-orm"

import { uuid } from "@/server/auth/security"
import { redditSubmit, type CommandTarget } from "@/server/browser/command"
import { phoneStepRefusal } from "@/lib/phones/options"
import { Refusal } from "@/server/browser/refusal"
import { db as defaultDb, type CustomShellDb } from "@/server/db"
import { MAX_POST_BODY_CHARS, MAX_POST_TITLE_CHARS, NO_PROFILE_MESSAGE, OWN_POST_KINDS, type OwnPostKind } from "@/lib/social/options"
import { isOwnedImageUrl } from "@/server/media/library"
import { postingRefusalText } from "@/lib/social/wording"
import { promoViralDrafts } from "@/server/viral-link/schema"

import { refuseInteraction } from "../apart"
import { queueJob } from "../jobs"
import { readPostingState } from "../posting"
import { cleanSubreddit } from "../keywords"
import { promoAccounts, promoJobs, promoPosts, promoProjects, type OwnPostComment } from "../schema"
import { postAnswers, postChecksOnTheirWay, type PostAnswerState } from "./post-numbers"

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
  /** Words, a picture or a link; words when not said. */
  kind?: OwnPostKind
  /** A picture post's picture: one of the person's own media library uploads. */
  imageUrl?: string
  /** A link post's link: an https address. */
  linkUrl?: string
  /** "Sam via Project" when a guest sent from Project pressed Post; null for the owner. */
  sentBy?: string | null
  /**
   * The Viral app's post New post opened with (`?newPost=<id>`), so the post
   * is told to Viral once it lands (`src/server/viral-link/reports.ts`).
   */
  viralDraftId?: string | null
}

/** A post's source as X and LinkedIn drafts keep it: `viral:<idea id>`. */
const VIRAL_SOURCE = /^viral:[A-Za-z0-9-]{1,64}$/

/**
 * The source a Viral draft gives a post: `viral:<idea id>` when the draft is
 * this person's Reddit post for this project, "" for anything else. Worked out
 * here from the draft itself, never taken from the browser.
 */
async function viralSourceOf(
  userId: string,
  projectId: string,
  draftId: string | null | undefined,
  db: CustomShellDb
): Promise<string> {
  if (!draftId) return ""
  const [draft] = await db
    .select({ ideaId: promoViralDrafts.ideaId })
    .from(promoViralDrafts)
    .where(
      and(
        eq(promoViralDrafts.id, draftId),
        eq(promoViralDrafts.userId, userId),
        eq(promoViralDrafts.projectId, projectId),
        eq(promoViralDrafts.network, "reddit")
      )
    )
    .limit(1)
  const source = draft?.ideaId ? `viral:${draft.ideaId}` : ""
  return VIRAL_SOURCE.test(source) ? source : ""
}

/**
 * What a post is: words, or a picture that is one of the person's own media
 * library uploads, never any address the browser sent, or an https link.
 * Refused with what to fix.
 */
async function ownPostMedia(
  userId: string,
  input: OwnPostInput,
  db: CustomShellDb
): Promise<{ kind: OwnPostKind; imageUrl: string; linkUrl: string }> {
  const kind = input.kind ?? "text"
  if (kind === "picture") {
    const imageUrl = (input.imageUrl ?? "").trim()
    if (!imageUrl) throw new Refusal("Pick the picture the post shows.")
    if (!(await isOwnedImageUrl(userId, imageUrl, db))) throw new Refusal("Pick a picture you uploaded yourself.")
    return { kind, imageUrl, linkUrl: "" }
  }
  if (kind === "link") {
    const linkUrl = (input.linkUrl ?? "").trim()
    let parsed: URL | null = null
    try {
      parsed = new URL(linkUrl)
    } catch {
      parsed = null
    }
    if (!parsed || parsed.protocol !== "https:" || !parsed.hostname.includes(".")) {
      throw new Refusal("The link has to be a whole address starting with https://")
    }
    return { kind, imageUrl: "", linkUrl: parsed.toString() }
  }
  return { kind: "text", imageUrl: "", linkUrl: "" }
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
  const media = await ownPostMedia(userId, input, db)
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
  const onPhone = account.phoneId ? phoneStepRefusal("reddit/submit", "This account's phone") : null
  if (onPhone) throw new Refusal(onPhone)

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
  // A link post's link is checked too, so a throwaway never links an important account's profile or post.
  await refuseInteraction(userId, account, { words: [title, media.kind === "text" ? body : media.linkUrl] }, db)

  const runAfter = state.nextWakeAt
  const source = await viralSourceOf(userId, projectId, input.viralDraftId, db)
  const jobId = await queueJob(
    userId,
    "submit",
    {
      accountId: account.id,
      projectId,
      subreddit,
      title,
      // A picture or a link post has no words of its own on Reddit, so none are sent.
      body: media.kind === "text" ? body : "",
      ...media,
      ...(input.sentBy ? { sentBy: input.sentBy } : {}),
      // Kept so Try again opens New post with the same draft, and the post keeps where it came from.
      ...(source ? { source, viralDraftId: input.viralDraftId } : {}),
    },
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
  const sentBy = typeof payload.sentBy === "string" && payload.sentBy ? payload.sentBy : null
  const source = typeof payload.source === "string" && VIRAL_SOURCE.test(payload.source) ? payload.source : ""
  if (!subreddit || !title) throw new Error("That post job is missing its subreddit or its title.")
  const kind: OwnPostKind = OWN_POST_KINDS.includes(payload.kind as OwnPostKind) ? (payload.kind as OwnPostKind) : "text"
  const imageUrl = kind === "picture" && typeof payload.imageUrl === "string" ? payload.imageUrl : ""
  const linkUrl = kind === "link" && typeof payload.linkUrl === "string" ? payload.linkUrl : ""
  const what = { kind, imageUrl, linkUrl }

  const id = uuid()
  try {
    const { postUrl, visit } = await redditSubmit(target, { subreddit, title, body, ...what })
    if (!postUrl.startsWith("https://www.reddit.com/")) {
      throw new Error("Reddit answered with an address that is not Reddit's.")
    }
    await db.insert(promoPosts).values({ id, userId, accountId, projectId, subreddit, title, body, ...what, status: "posted", postUrl, visit, sentBy, source })
    await db.update(promoAccounts).set({ lastPostedAt: new Date() }).where(eq(promoAccounts.id, accountId))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await db
      .insert(promoPosts)
      .values({ id, userId, accountId, projectId, subreddit, title, body, ...what, status: "failed", lastError: message, sentBy, source })
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
  /** "Sam via Project" when a guest sent from Project posted it; null for the owner. */
  sentBy: string | null
  /** As the last Check read them; null until one has (`post-numbers.ts`). */
  upvotes: number | null
  commentCount: number | null
  checkedAt: Date | null
  /** Why the last check read nothing, or "". */
  checkError: string
  /** A check is waiting or running. */
  checking: boolean
  /** Up to 20 comments directly under it, each with the answer sent or on its way. Null until a check. */
  comments: Array<OwnPostComment & { answer: PostAnswerState | null; own: boolean }> | null
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
  const checking = await postChecksOnTheirWay(userId, db)
  const answers = await postAnswers(userId, rows.map((row) => row.post.id), db)
  return rows.map(({ post, handle, projectName }) => ({
    id: post.id,
    title: post.title,
    body: post.body,
    subreddit: post.subreddit,
    postUrl: post.postUrl,
    postedAt: post.postedAt,
    account: { id: post.accountId, handle },
    project: post.projectId && projectName !== null ? { id: post.projectId, name: projectName } : null,
    sentBy: post.sentBy,
    upvotes: post.upvotes,
    commentCount: post.commentCount,
    checkedAt: post.checkedAt,
    checkError: post.checkError,
    checking: checking.has(post.id),
    comments:
      post.comments?.map((comment) => ({
        ...comment,
        answer: answers.get(comment.url) ?? null,
        own: Boolean(handle) && comment.author.toLowerCase() === handle.toLowerCase(),
      })) ?? null,
  }))
}

/**
 * A failed post's subreddit, title, words and account, and the Viral draft it
 * came from, for Try again, which opens New post with them filled in. Never
 * sends them.
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
    kind: OWN_POST_KINDS.includes(job.payload.kind as OwnPostKind) ? (job.payload.kind as OwnPostKind) : "text",
    imageUrl: text(job.payload.imageUrl),
    linkUrl: text(job.payload.linkUrl),
    viralDraftId: text(job.payload.viralDraftId) || null,
  }
}
