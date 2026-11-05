import { and, asc, desc, eq, inArray } from "drizzle-orm"
import { z } from "zod"

import {
  PROMO_READ_KINDS,
  PROMO_READ_KINDS_BY_NETWORK,
  PROMO_READ_NETWORKS,
  type PromoRead,
  type PromoReadKind,
  type PromoReadNetwork,
  type SocialPost,
} from "@/lib/viral/promo-link"
import { viralSays } from "@/lib/viral/viral"
import { now, uuid } from "@/server/auth/security"
import { db } from "@/server/db"
import { requireOwnedViralProject } from "@/server/viral/projects"
import { callPromo, PromoRefusal, readPromoConnection } from "@/server/viral/promo-link"
import { viralPromoReads, viralSocialPosts, type ViralPromoReadRow, type ViralSocialPostRow } from "@/server/viral/schema"

/**
 * Reading X, LinkedIn and Reddit through Promo (`workspace/docs/promo-connection.md`,
 * task parts 11 to 14). Tyler, 4 Nov 2026: "Ask Promo to read them".
 *
 * `requestPromoRead` asks Promo for a read and keeps it as waiting. Promo
 * runs it with its own search accounts or reader, then posts the answer to
 * `/api/connect/promo/reads`, which `applyPromoReadAnswer` stores: every
 * post goes into `viral_social_posts` under the read's project, and a read
 * of one post (`kind: "post"`) fills in that post's top replies for the
 * thread view. `refreshPromoRead` asks Promo how a read stands, for a page
 * that is waiting, and gives up on one Promo never answered.
 */

/** A read still waiting after this long lost its answer, and turns failed the next time it is asked about. */
const READ_STALE_MS = 2 * 60 * 60 * 1000

/** Promo is asked how a read stands at most this often. */
const ASK_GAP_MS = 20_000

const answerPost = z.object({
  postId: z.string().min(1).max(40),
  url: z.string().max(300),
  title: z.string().max(300).default(""),
  text: z.string().max(10_000).default(""),
  authorHandle: z.string().max(60).default(""),
  authorName: z.string().max(200).default(""),
  authorFollowers: z.number().int().nullable().default(null),
  postedSeconds: z.number().nullable().default(null),
  views: z.number().int().nullable().default(null),
  likes: z.number().int().nullable().default(null),
  replies: z.number().int().nullable().default(null),
  reposts: z.number().int().nullable().default(null),
  link: z.string().max(600).default(""),
  community: z.string().max(60).default(""),
  topReplies: z
    .array(z.object({ author: z.string().max(200), text: z.string().max(2_000), likes: z.number().int() }))
    .max(20)
    .default([]),
})

/** What Promo answers about a read, on its call back and when asked. */
export const promoReadAnswerShape = z.object({
  readId: z.string().min(1).max(64),
  status: z.enum(["waiting", "done", "failed"]),
  posts: z.array(answerPost).max(100).default([]),
  error: z.string().max(1_000).default(""),
})

export type PromoReadAnswer = z.infer<typeof promoReadAnswerShape>

function toRead(row: ViralPromoReadRow): PromoRead {
  return {
    id: row.id,
    projectId: row.projectId,
    network: row.network,
    kind: row.kind,
    value: row.value,
    status: row.status,
    error: row.error,
    found: row.found,
    createdAt: row.createdAt.toISOString(),
    finishedAt: row.finishedAt?.toISOString() ?? null,
  }
}

function toPost(row: ViralSocialPostRow): SocialPost {
  return {
    id: row.id,
    projectId: row.projectId,
    network: row.network,
    postId: row.postId,
    url: row.url,
    title: row.title,
    text: row.text,
    authorHandle: row.authorHandle,
    authorName: row.authorName,
    authorFollowers: row.authorFollowers,
    postedAt: row.postedAt?.toISOString() ?? null,
    views: row.views,
    likes: row.likes,
    replies: row.replies,
    reposts: row.reposts,
    link: row.link,
    community: row.community,
    topReplies: row.topReplies,
    repliesReadAt: row.repliesReadAt?.toISOString() ?? null,
    firstSeenAt: row.firstSeenAt.toISOString(),
  }
}

/** Only addresses on the network's own site are kept, since the screens draw them as links. */
const NETWORK_SITES: Record<PromoReadNetwork, RegExp> = {
  x: /^https:\/\/(x|twitter)\.com\//,
  linkedin: /^https:\/\/(www\.)?linkedin\.com\//,
  reddit: /^https:\/\/(www\.|old\.)?reddit\.com\//,
}

const webLink = (value: string) => (/^https?:\/\//.test(value) ? value : "")

export type PromoReadRequest = { projectId: string; network: PromoReadNetwork; kind: PromoReadKind; value: string }

/**
 * Asks Promo for a read and keeps it as waiting. Refused, with Promo's own
 * words, when Promo can't read it, such as having no X search account; the
 * read is then kept as failed with that reason.
 */
export async function requestPromoRead(ownerId: string, request: PromoReadRequest, fetchImpl?: typeof fetch): Promise<PromoRead> {
  if (!PROMO_READ_NETWORKS.includes(request.network) || !PROMO_READ_KINDS.includes(request.kind)) {
    throw viralSays("Promo can't read that.")
  }
  if (!PROMO_READ_KINDS_BY_NETWORK[request.network].includes(request.kind)) {
    throw viralSays(`Promo can't read a ${request.kind} on ${request.network}.`)
  }
  const value = request.value.trim().slice(0, 300)
  if (!value) throw viralSays("Type what to read first.")
  const project = await requireOwnedViralProject(ownerId, request.projectId)
  // Its posts are made up, so there is nothing real for Promo to read.
  if (project.isSample) throw viralSays("The sample project never reads anything. Make a project of your own to read it.")
  const connection = await readPromoConnection().catch((error: unknown) => {
    throw viralSays(error instanceof Error ? error.message : "Fill in Promo's address and key first.")
  })

  const id = uuid()
  const [row] = await db
    .insert(viralPromoReads)
    .values({ id, ownerId, projectId: request.projectId, network: request.network, kind: request.kind, value, createdAt: now() })
    .returning()
  try {
    const answer = promoReadAnswerShape.parse(
      await callPromo(connection, "/api/connect/viral/reads", { readId: id, network: request.network, kind: request.kind, value }, fetchImpl)
    )
    // The same read asked twice can already be answered. The answer is for
    // this read, whatever id Promo echoed, so it can never fill in another.
    if (answer.status !== "waiting") await applyPromoReadAnswer(ownerId, { ...answer, readId: id })
  } catch (error) {
    const message = error instanceof PromoRefusal || error instanceof Error ? error.message : "Promo didn't answer."
    await db
      .update(viralPromoReads)
      .set({ status: "failed", error: message.slice(0, 1_000), finishedAt: now() })
      .where(eq(viralPromoReads.id, id))
    throw viralSays(message)
  }
  const [fresh] = await db.select().from(viralPromoReads).where(eq(viralPromoReads.id, row.id)).limit(1)
  return toRead(fresh ?? row)
}

/**
 * Stores Promo's answer to a read: the posts under the read's project, or
 * the reason it failed. An answer for a read already finished changes
 * nothing, so a call back that arrives twice is harmless.
 */
export async function applyPromoReadAnswer(ownerId: string, answer: PromoReadAnswer): Promise<{ ok: true; changed: boolean }> {
  // Only the owner's reads: an answer naming another person's read changes nothing.
  const [read] = await db
    .select()
    .from(viralPromoReads)
    .where(and(eq(viralPromoReads.id, answer.readId), eq(viralPromoReads.ownerId, ownerId)))
    .limit(1)
  if (!read || read.status !== "waiting" || answer.status === "waiting") return { ok: true, changed: false }
  const at = now()

  if (answer.status === "failed") {
    await db
      .update(viralPromoReads)
      .set({ status: "failed", error: (answer.error || "Promo's reader failed.").slice(0, 1_000), finishedAt: at })
      .where(and(eq(viralPromoReads.id, read.id), eq(viralPromoReads.status, "waiting")))
    return { ok: true, changed: true }
  }

  const site = NETWORK_SITES[read.network]
  for (const post of answer.posts) {
    const url = site.test(post.url) ? post.url : ""
    if (!url) continue
    const figures = {
      url,
      title: post.title,
      text: post.text,
      authorHandle: post.authorHandle,
      authorName: post.authorName,
      authorFollowers: post.authorFollowers,
      postedAt: post.postedSeconds === null ? null : new Date(post.postedSeconds * 1000),
      views: post.views,
      likes: post.likes,
      replies: post.replies,
      reposts: post.reposts,
      link: webLink(post.link),
      community: post.community,
      readId: read.id,
      updatedAt: at,
    }
    // A read of one post brings its replies; a search never does, so it never wipes them.
    const replies = read.kind === "post" ? { topReplies: post.topReplies, repliesReadAt: at } : {}
    await db
      .insert(viralSocialPosts)
      .values({ id: uuid(), ownerId: read.ownerId, projectId: read.projectId, network: read.network, postId: post.postId, ...figures, ...replies, firstSeenAt: at })
      .onConflictDoUpdate({
        target: [viralSocialPosts.projectId, viralSocialPosts.network, viralSocialPosts.postId],
        set: { ...figures, ...replies },
      })
  }
  await db
    .update(viralPromoReads)
    .set({ status: "done", error: "", found: answer.posts.length, finishedAt: at })
    .where(and(eq(viralPromoReads.id, read.id), eq(viralPromoReads.status, "waiting")))
  return { ok: true, changed: true }
}

async function ownedRead(ownerId: string, readId: string): Promise<ViralPromoReadRow> {
  const [row] = await db
    .select()
    .from(viralPromoReads)
    .where(and(eq(viralPromoReads.id, readId), eq(viralPromoReads.ownerId, ownerId)))
    .limit(1)
  if (!row) throw viralSays("That read is gone.")
  return row
}

/** When each waiting read was last asked about, so a page polling fast still asks Promo at most every 20 seconds. */
const lastAsked = new Map<string, number>()

/**
 * How a waiting read stands. Asks Promo at most every 20 seconds, and turns
 * a read Promo never answered within two hours failed.
 */
export async function refreshPromoRead(ownerId: string, readId: string, fetchImpl?: typeof fetch): Promise<PromoRead> {
  const read = await ownedRead(ownerId, readId)
  if (read.status !== "waiting") return toRead(read)
  const at = now()
  if (at.getTime() - read.createdAt.getTime() > READ_STALE_MS) {
    await db
      .update(viralPromoReads)
      .set({ status: "failed", error: "Promo never answered this read. Ask again.", finishedAt: at })
      .where(and(eq(viralPromoReads.id, read.id), eq(viralPromoReads.status, "waiting")))
    return toRead(await ownedRead(ownerId, readId))
  }
  if (at.getTime() - (lastAsked.get(read.id) ?? 0) < ASK_GAP_MS) return toRead(read)
  // Only asks inside the 20-second gap matter, so older ones are dropped and the list never grows.
  for (const [id, askedAt] of lastAsked) if (at.getTime() - askedAt >= ASK_GAP_MS) lastAsked.delete(id)
  lastAsked.set(read.id, at.getTime())
  try {
    const answer = promoReadAnswerShape.parse(
      await callPromo(await readPromoConnection(), `/api/connect/viral/reads/${encodeURIComponent(read.id)}`, undefined, fetchImpl)
    )
    await applyPromoReadAnswer(ownerId, { ...answer, readId: read.id })
  } catch (error) {
    // Promo being down leaves the read waiting; its call back can still land.
    console.error("Could not ask Promo how a read stands", error)
  }
  return toRead(await ownedRead(ownerId, readId))
}

/** The posts a project's reads found, on one network or all of them, newest first. */
export async function listSocialPosts(ownerId: string, projectId: string, network?: PromoReadNetwork): Promise<SocialPost[]> {
  await requireOwnedViralProject(ownerId, projectId)
  const rows = await db
    .select()
    .from(viralSocialPosts)
    .where(
      and(
        eq(viralSocialPosts.ownerId, ownerId),
        eq(viralSocialPosts.projectId, projectId),
        network ? eq(viralSocialPosts.network, network) : inArray(viralSocialPosts.network, [...PROMO_READ_NETWORKS])
      )
    )
    .orderBy(desc(viralSocialPosts.firstSeenAt), asc(viralSocialPosts.id))
    .limit(1_000)
  return rows.map(toPost)
}

/** One found post, for the thread view. */
export async function loadSocialPost(ownerId: string, postRowId: string): Promise<SocialPost> {
  const [row] = await db
    .select()
    .from(viralSocialPosts)
    .where(and(eq(viralSocialPosts.id, postRowId), eq(viralSocialPosts.ownerId, ownerId)))
    .limit(1)
  if (!row) throw viralSays("That post is gone.")
  return toPost(row)
}

/** Reads a found post again with its top replies, for the thread view. */
export async function requestThreadRead(ownerId: string, postRowId: string, fetchImpl?: typeof fetch): Promise<PromoRead> {
  const post = await loadSocialPost(ownerId, postRowId)
  // Reddit's thread is read by its address; X and LinkedIn by the post's id.
  const value = post.network === "reddit" ? post.url : post.postId
  return requestPromoRead(ownerId, { projectId: post.projectId, network: post.network, kind: "post", value }, fetchImpl)
}
