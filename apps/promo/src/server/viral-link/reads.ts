import { and, eq, inArray, isNull, lt, or } from "drizzle-orm"
import { z } from "zod"

import { linkedinHashtag, linkedinSlug } from "@/lib/social/linkedin/options"
import type { JobKind } from "@/lib/social/options"
import { xKeywordValue, xPostId } from "@/lib/social/x/options"
import { uuid } from "@/server/auth/security"
import { redditSearch, redditThread, type BrowserPost, type CommandTarget } from "@/server/browser/command"
import { db as defaultDb, type CustomShellDb } from "@/server/db"
import { queueJob, type QueuedJob } from "@/server/social/jobs"
import { cleanSubreddit } from "@/server/social/keywords"
import { linkedinReadPost, linkedinSearch, type LinkedinPost } from "@/server/social/linkedin/calls"
import type { LinkedinReader } from "@/server/social/linkedin/search"
import { spendLinkedinViews } from "@/server/social/linkedin/searchers"
import { promoJobs } from "@/server/social/schema"
import { xReadPost, xSearch, type XPost } from "@/server/social/x/calls"
import type { XReader } from "@/server/social/x/search"
import { spendViews } from "@/server/social/x/searchers"

import { callViral, ViralLinkRefusal } from "./link"
import {
  promoViralReads,
  VIRAL_READ_KINDS,
  VIRAL_READ_NETWORKS,
  type PromoViralLinkRow,
  type PromoViralReadRow,
  type ViralReadKind,
  type ViralReadNetwork,
  type ViralReadPost,
} from "./schema"

/**
 * Reads Viral asks for (`workspace/docs/viral-link.md`): X, LinkedIn and
 * Reddit, read by Promo's own readers so Viral never signs in anywhere.
 *
 * Viral posts a read; Promo keeps it and queues a job in the same queue its
 * own searches use, so it runs in the same search account or reader browser
 * and counts against the same daily views. When the job is done, Promo calls
 * Viral back with the posts. A call back that fails is tried again by the
 * Viral upkeep tick (`sweepViralReads`).
 */

/** What each network can look at. Promo has no Threads, so Viral can't ask for it. */
const KINDS_BY_NETWORK: Record<ViralReadNetwork, readonly ViralReadKind[]> = {
  x: ["search", "hashtag", "account", "post"],
  linkedin: ["search", "hashtag", "person", "company", "post"],
  reddit: ["search", "subreddit", "post"],
}

/** The job each network's reads run as. */
export const VIRAL_READ_JOB_KINDS: Record<ViralReadNetwork, JobKind> = {
  x: "x_viral_read",
  linkedin: "linkedin_viral_read",
  reddit: "viral_read",
}

/** How many posts one read may put in front of a search account at most. */
const READ_MAX = 30

/** How many replies a post read keeps. */
const TOP_REPLIES = 10

/** Reads one person may have waiting at once, so Viral never fills Promo's queues. */
const MAX_WAITING_READS = 100

/** A call back is tried this many times, a tick apart, before Promo gives up on it. */
const MAX_DELIVERY_TRIES = 20

export const readShape = z.object({
  readId: z.string().regex(/^[A-Za-z0-9-]{8,64}$/),
  network: z.enum(VIRAL_READ_NETWORKS),
  kind: z.enum(VIRAL_READ_KINDS),
  value: z.string().min(1).max(300),
})

export type ReadNote = z.infer<typeof readShape>

export type ReadAnswer = { readId: string; status: PromoViralReadRow["status"]; posts: ViralReadPost[]; error: string }

/** A LinkedIn activity id from a pasted address or the bare number. */
function linkedinPostId(value: string): string {
  const match = value.match(/activity[:-](\d{10,25})/) ?? value.trim().match(/^(\d{10,25})$/)
  return match?.[1] ?? ""
}

/** A Reddit post's path, from a pasted address or the path itself. */
function redditPermalink(value: string): string {
  const path = value.trim().replace(/^https?:\/\/(www\.|old\.)?reddit\.com/i, "")
  return /^\/r\/[A-Za-z0-9_]+\/comments\/[A-Za-z0-9]+(\/[^?#\s]*)?$/.test(path) ? path.slice(0, 300) : ""
}

/** The value as Promo's routine takes it, or "" when nothing usable is left. */
export function cleanReadValue(network: ViralReadNetwork, kind: ViralReadKind, raw: string): string {
  if (network === "x") {
    if (kind === "post") return xPostId(raw) ?? (/^\d{5,25}$/.test(raw.trim()) ? raw.trim() : "")
    return xKeywordValue(kind === "hashtag" || kind === "account" ? kind : "search", raw).slice(0, 300)
  }
  if (network === "linkedin") {
    if (kind === "post") return linkedinPostId(raw)
    if (kind === "hashtag") return linkedinHashtag(raw)
    if (kind === "person" || kind === "company") return linkedinSlug(raw, kind)
    return raw.trim().replace(/\s+/g, " ").slice(0, 300)
  }
  if (kind === "post") return redditPermalink(raw)
  if (kind === "subreddit") return cleanSubreddit(raw)
  return raw.trim().replace(/\s+/g, " ").slice(0, 300)
}

function toAnswer(row: PromoViralReadRow): ReadAnswer {
  return { readId: row.readId, status: row.status, posts: row.posts, error: row.error }
}

/**
 * A read from Viral: kept, and queued for the network's reader. The same read
 * twice answers what the first one made. Refused at once, with Promo's own
 * words, when Promo has nothing that can read that network.
 */
export async function acceptRead(link: PromoViralLinkRow, note: ReadNote, db: CustomShellDb = defaultDb): Promise<ReadAnswer> {
  const [already] = await db
    .select()
    .from(promoViralReads)
    .where(and(eq(promoViralReads.userId, link.userId), eq(promoViralReads.readId, note.readId)))
    .limit(1)
  if (already) return toAnswer(already)

  if (!KINDS_BY_NETWORK[note.network].includes(note.kind)) {
    throw new ViralLinkRefusal(400, `Promo can't read a ${note.kind} on ${note.network}.`)
  }
  const value = cleanReadValue(note.network, note.kind, note.value)
  if (!value) throw new ViralLinkRefusal(400, "That doesn't look like something Promo can read. Check the words or the address.")

  // Viral asks again while a read waits, so a stalled reader would otherwise
  // pile up copies in the same lane as Promo's own jobs.
  const waiting = await db
    .select({ network: promoViralReads.network, kind: promoViralReads.kind, value: promoViralReads.value })
    .from(promoViralReads)
    .where(and(eq(promoViralReads.userId, link.userId), eq(promoViralReads.status, "waiting")))
  if (waiting.some((read) => read.network === note.network && read.kind === note.kind && read.value === value)) {
    throw new ViralLinkRefusal(409, "Promo is still reading this from an earlier ask. Its answer comes when Promo's reader gets to it.")
  }
  if (waiting.length >= MAX_WAITING_READS) {
    throw new ViralLinkRefusal(429, `Promo already has ${MAX_WAITING_READS} reads waiting. Try again once its readers catch up.`)
  }

  const id = uuid()
  const jobId = uuid()
  const [row] = await db
    .insert(promoViralReads)
    .values({ id, userId: link.userId, readId: note.readId, network: note.network, kind: note.kind, value, jobId })
    .returning()
  try {
    await queueJob(link.userId, VIRAL_READ_JOB_KINDS[note.network], { viralReadId: id }, db, null, jobId)
  } catch (error) {
    // Nothing can read it, such as no X search account: the read goes, and
    // Viral is told why at once.
    await db.delete(promoViralReads).where(eq(promoViralReads.id, id))
    throw new ViralLinkRefusal(409, error instanceof Error ? error.message : "Promo could not queue that read.")
  }
  return toAnswer(row)
}

/** Where a read stands, for Viral while it waits. Only the key's own reads answer. */
export async function readStatus(link: PromoViralLinkRow, readId: string, db: CustomShellDb = defaultDb): Promise<ReadAnswer> {
  const [row] = await db
    .select()
    .from(promoViralReads)
    .where(and(eq(promoViralReads.userId, link.userId), eq(promoViralReads.readId, readId)))
    .limit(1)
  if (!row) throw new ViralLinkRefusal(404, "Promo has no read by that id.")
  return toAnswer(row)
}

const seconds = (value: number | null) => (value === null ? null : Math.round(value))

export function fromXPost(post: XPost, replies: ViralReadPost["topReplies"] = []): ViralReadPost {
  return {
    postId: post.postId.slice(0, 40),
    url: /^https:\/\/(x|twitter)\.com\//.test(post.url) ? post.url.slice(0, 300) : `https://x.com/${post.authorHandle || "i"}/status/${post.postId}`,
    title: "",
    text: post.text.slice(0, 10_000),
    authorHandle: post.authorHandle.slice(0, 60),
    authorName: post.authorName.slice(0, 200),
    authorFollowers: post.authorFollowers,
    postedSeconds: seconds(post.postedSeconds),
    views: post.views,
    likes: post.likes,
    replies: post.replies,
    reposts: post.reposts,
    link: /^https?:\/\//.test(post.link) ? post.link.slice(0, 600) : "",
    community: "",
    topReplies: replies,
  }
}

export function fromLinkedinPost(post: LinkedinPost, replies: ViralReadPost["topReplies"] = []): ViralReadPost {
  return {
    postId: post.postId.slice(0, 40),
    url: /^https:\/\/(www\.)?linkedin\.com\//.test(post.url) ? post.url.slice(0, 300) : `https://www.linkedin.com/feed/update/urn:li:activity:${post.postId}/`,
    title: "",
    text: post.text.slice(0, 10_000),
    authorHandle: post.authorSlug.slice(0, 60),
    authorName: post.authorName.slice(0, 200),
    authorFollowers: post.authorFollowers,
    postedSeconds: seconds(post.postedSeconds),
    // LinkedIn shows nobody else's views.
    views: null,
    likes: post.reactions,
    replies: post.comments,
    reposts: post.reposts,
    link: /^https?:\/\//.test(post.link) ? post.link.slice(0, 600) : "",
    community: "",
    topReplies: replies,
  }
}

export function fromRedditPost(post: BrowserPost, replies: ViralReadPost["topReplies"] = []): ViralReadPost {
  return {
    postId: post.redditId.slice(0, 40),
    url: `https://www.reddit.com${post.permalink.startsWith("/") ? post.permalink : `/${post.permalink}`}`.slice(0, 300),
    title: post.title.slice(0, 300),
    text: post.body.slice(0, 10_000),
    authorHandle: post.author.slice(0, 60),
    authorName: post.author.slice(0, 200),
    // Reddit shows nobody's followers next to a post.
    authorFollowers: null,
    postedSeconds: seconds(post.postedAtSeconds),
    views: null,
    likes: Math.round(post.score),
    replies: Math.round(post.commentCount),
    reposts: null,
    link: /^https?:\/\//.test(post.linkUrl) ? post.linkUrl.slice(0, 600) : "",
    community: post.subreddit.slice(0, 60),
    topReplies: replies,
  }
}

async function loadRead(job: QueuedJob, db: CustomShellDb): Promise<PromoViralReadRow> {
  const id = typeof job.payload.viralReadId === "string" ? job.payload.viralReadId : ""
  // Scoped by owner: the id came off a job payload.
  const [row] = id
    ? await db.select().from(promoViralReads).where(and(eq(promoViralReads.id, id), eq(promoViralReads.userId, job.userId))).limit(1)
    : []
  if (!row) throw new Error("That Viral read is no longer saved.")
  return row
}

/** Keeps a read's posts and tells Viral. A call back that fails is tried again by the tick. */
async function finishRead(row: PromoViralReadRow, posts: ViralReadPost[], db: CustomShellDb, fetchImpl?: typeof fetch): Promise<void> {
  const [done] = await db
    .update(promoViralReads)
    .set({ status: "done", posts, error: "", finishedAt: new Date() })
    .where(eq(promoViralReads.id, row.id))
    .returning()
  if (done) await deliverRead(done, db, fetchImpl)
}

/** An X read, in a search account's browser (`x_viral_read`). */
export async function runViralXRead(job: QueuedJob, reader: XReader, db: CustomShellDb = defaultDb, fetchImpl?: typeof fetch): Promise<void> {
  const row = await loadRead(job, db)
  if (row.kind === "post") {
    const read = await xReadPost(reader.target, { postId: row.value })
    await spendViews(reader.searcher.id, read, db)
    const replies = read.replies.slice(0, TOP_REPLIES).map((reply) => ({ author: reply.handle.slice(0, 200), text: reply.text.slice(0, 2_000), likes: Math.round(reply.likes) }))
    await finishRead(row, read.post ? [fromXPost(read.post, replies)] : [], db, fetchImpl)
    return
  }
  const max = Math.max(1, Math.min(READ_MAX, reader.searcher.viewsLeft))
  const answer = await xSearch(reader.target, { kind: row.kind, value: row.value, max })
  await spendViews(reader.searcher.id, answer, db)
  await finishRead(row, answer.posts.filter((post) => !post.isReply).map((post) => fromXPost(post)), db, fetchImpl)
}

/** A LinkedIn read, in a search account's browser (`linkedin_viral_read`). */
export async function runViralLinkedinRead(job: QueuedJob, reader: LinkedinReader, db: CustomShellDb = defaultDb, fetchImpl?: typeof fetch): Promise<void> {
  const row = await loadRead(job, db)
  if (row.kind === "post") {
    const read = await linkedinReadPost(reader.target, { postId: row.value })
    await spendLinkedinViews(reader.searcher.id, read, db)
    const replies = read.comments.slice(0, TOP_REPLIES).map((comment) => ({ author: comment.name.slice(0, 200), text: comment.text.slice(0, 2_000), likes: Math.round(comment.reactions) }))
    await finishRead(row, read.post ? [fromLinkedinPost(read.post, replies)] : [], db, fetchImpl)
    return
  }
  const max = Math.max(1, Math.min(READ_MAX, reader.searcher.viewsLeft))
  const answer = await linkedinSearch(reader.target, { kind: row.kind, value: row.value, max })
  await spendLinkedinViews(reader.searcher.id, answer, db)
  await finishRead(row, answer.posts.filter((post) => !post.isRepost).map((post) => fromLinkedinPost(post)), db, fetchImpl)
}

/** A Reddit read, in the signed-out reader browser (`viral_read`). */
export async function runViralRedditRead(job: QueuedJob, target: CommandTarget, db: CustomShellDb = defaultDb, fetchImpl?: typeof fetch): Promise<void> {
  const row = await loadRead(job, db)
  if (row.kind === "post") {
    const thread = await redditThread(target, { permalink: row.value, replyLimit: TOP_REPLIES })
    const replies = thread.replies.slice(0, TOP_REPLIES).map((reply) => ({ author: reply.author.slice(0, 200), text: reply.text.slice(0, 2_000), likes: Math.round(reply.score) }))
    await finishRead(row, thread.post ? [fromRedditPost(thread.post, replies)] : [], db, fetchImpl)
    return
  }
  // A subreddit is its top posts of the week; a search is Reddit-wide, top of the week too.
  const answer = await redditSearch(target, {
    query: row.kind === "search" ? row.value : "",
    subreddit: row.kind === "subreddit" ? row.value : undefined,
    sort: "top",
    window: "week",
  })
  await finishRead(row, answer.posts.slice(0, READ_MAX).map((post) => fromRedditPost(post)), db, fetchImpl)
}

/** Tells Viral a read's answer. A failure is counted, and the tick tries again. */
export async function deliverRead(row: PromoViralReadRow, db: CustomShellDb = defaultDb, fetchImpl?: typeof fetch): Promise<boolean> {
  try {
    await callViral(row.userId, "/api/connect/promo/reads", toAnswer(row), { db, fetchImpl })
    await db.update(promoViralReads).set({ deliveredAt: new Date() }).where(eq(promoViralReads.id, row.id))
    return true
  } catch (error) {
    console.error("Could not tell Viral a read's answer", error)
    await db.update(promoViralReads).set({ deliveryTries: row.deliveryTries + 1 }).where(eq(promoViralReads.id, row.id))
    return false
  }
}

/** How many reads one tick looks at, at most. */
const SWEEP_BATCH = 25

/**
 * The tick's part: a read whose job failed for good turns failed with the
 * job's reason, and an answer Viral hasn't heard is told again, up to 20
 * tries. A read whose job is gone, such as one cleared from the queue, fails
 * too, so Viral never waits for ever.
 */
export async function sweepViralReads(db: CustomShellDb = defaultDb, fetchImpl?: typeof fetch): Promise<void> {
  const waiting = await db
    .select({ read: promoViralReads, jobStatus: promoJobs.status, jobError: promoJobs.lastError })
    .from(promoViralReads)
    .leftJoin(promoJobs, eq(promoJobs.id, promoViralReads.jobId))
    .where(and(eq(promoViralReads.status, "waiting"), or(isNull(promoJobs.id), inArray(promoJobs.status, ["failed", "done"]))))
    .limit(SWEEP_BATCH)
  for (const { read, jobStatus, jobError } of waiting) {
    // A job that finished "done" without finishing its read lost its answer; it says so.
    const error = jobStatus === "failed" ? jobError || "Promo's reader failed." : "Promo's reader stopped before it finished."
    await db
      .update(promoViralReads)
      .set({ status: "failed", error: error.slice(0, 1_000), finishedAt: new Date() })
      .where(and(eq(promoViralReads.id, read.id), eq(promoViralReads.status, "waiting")))
  }

  const due = await db
    .select()
    .from(promoViralReads)
    .where(
      and(
        inArray(promoViralReads.status, ["done", "failed"]),
        isNull(promoViralReads.deliveredAt),
        lt(promoViralReads.deliveryTries, MAX_DELIVERY_TRIES)
      )
    )
    .limit(SWEEP_BATCH)
  for (const row of due) await deliverRead(row, db, fetchImpl)
}
