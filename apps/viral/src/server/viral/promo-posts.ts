import { and, desc, eq } from "drizzle-orm"
import { z } from "zod"

import { AI_MODEL_PRICES } from "@/lib/ai/ai-models"
import { scriptText } from "@/lib/viral/analysis"
import {
  PROMO_POST_LIMITS,
  PROMO_POST_NETWORK_NAMES,
  REDDIT_TITLE_LIMIT,
  sendsToPromo,
  X_THREAD_MAX,
  type PromoPostNetwork,
  type PromoPostSend,
  type VaultPost,
} from "@/lib/viral/promo-link"
import { viralSays } from "@/lib/viral/viral"
import { segmentRoleLabels } from "@/lib/viral/viral-breakdown"
import { now, uuid } from "@/server/auth/security"
import { db } from "@/server/db"
import { requireViralProjectBudget, viralProjectSpendMetadata } from "@/server/viral/project-spend"
import { callPromo, onPromoAddress, PromoRefusal, readPromoConnection } from "@/server/viral/promo-link"
import { viralProjects, viralPromoSends, viralVaultItems, viralVaultPosts, type ViralPromoSendRow } from "@/server/viral/schema"
import { getPromoUrl } from "@/server/viral/settings"
import { askWriter, WRITER_MODEL } from "@/server/viral/writer"

/**
 * Write a post for Promo (task part 20) and How your version did (part 21),
 * `workspace/docs/promo-connection.md`.
 *
 * On a vault idea, the AI writes a post for X, Threads, LinkedIn or Reddit
 * from the idea's analysis and notes. An X, LinkedIn or Reddit post can then
 * go to a Promo project as a draft; nothing is posted until somebody presses
 * Post in Promo. A Threads post is for Copy, because Promo has no Threads.
 *
 * When Promo posts something that came from an idea, it tells Viral
 * (`applyPromoPosted`): the idea turns Posted on its own and keeps your
 * post's link and views, which Promo sends again at most daily.
 */

/** The meter name for the post-writing call, so its cost shows apart on the AI usage page. */
export const PROMO_POST_FEATURE = "viral_promo_post"

/** The writing call reads the idea (about 2,500 tokens) and writes about 700. */
export function promoPostPriceCents(): number {
  const price = AI_MODEL_PRICES[WRITER_MODEL]
  const dollars = (2_500 / 1_000_000) * price.inputPerMillion + (700 / 1_000_000) * price.outputPerMillion
  return Math.max(1, Math.ceil(dollars * 100))
}

const postSchema = z.object({
  title: z.string().max(400).default(""),
  pieces: z.array(z.string().min(1).max(12_000)).min(1).max(X_THREAD_MAX),
})

function toSend(row: ViralPromoSendRow, promoUrl: string): PromoPostSend {
  return {
    id: row.id,
    network: row.network,
    title: row.title,
    pieces: row.pieces,
    status: row.status,
    promoProjectId: row.promoProjectId,
    // Kept only on the Promo address saved in Settings, so a link from anywhere else never shows.
    draftUrl: row.draftUrl && onPromoAddress(promoUrl, row.draftUrl) ? row.draftUrl : null,
    error: row.error,
    createdAt: row.createdAt.toISOString(),
    sentAt: row.sentAt?.toISOString() ?? null,
  }
}

const SHAPES: Record<PromoPostNetwork, string> = {
  x: `an X post. If it needs more room, a thread of up to ${X_THREAD_MAX} posts. Each piece at most ${PROMO_POST_LIMITS.x} characters, hashtags counted. "title" is "".`,
  threads: `one Threads post of at most ${PROMO_POST_LIMITS.threads} characters. "title" is "".`,
  linkedin: `one LinkedIn post of at most ${PROMO_POST_LIMITS.linkedin} characters, in short paragraphs, with no links. "title" is "".`,
  reddit: `one Reddit text post: a "title" of at most ${REDDIT_TITLE_LIMIT} characters and one piece as the body. Plain and useful, never an advert, because moderators remove those.`,
}

function postPrompt(network: PromoPostNetwork, idea: { title: string; topic: string; notes: string; why: string; script: string; caption: string }) {
  return `Write a social post for ${PROMO_POST_NETWORK_NAMES[network]}, for somebody whose subject is: """${idea.topic || idea.title}"""

It turns this saved video idea into words that work on their own, without the video.
Original video: ${idea.title}
Why it worked: ${idea.why || "(not analysed)"}
The script written for them:
${idea.script || "(none)"}
Suggested caption: ${idea.caption || "(none)"}
Their notes: ${idea.notes || "(none)"}

Write ${SHAPES[network]}

Answer with JSON only, in exactly this shape, and nothing else:
{ "title": "", "pieces": ["the post's words"] }`
}

async function ownedIdea(ownerId: string, itemId: string) {
  const [row] = await db
    .select({ item: viralVaultItems, spendLimitCents: viralProjects.spendLimitCents, topic: viralProjects.topic })
    .from(viralVaultItems)
    .innerJoin(viralProjects, eq(viralProjects.id, viralVaultItems.projectId))
    .where(and(eq(viralVaultItems.id, itemId), eq(viralVaultItems.ownerId, ownerId)))
    .limit(1)
  if (!row) throw viralSays("That idea is no longer in the vault.")
  return row
}

/** Checks the words fit the network, the way Promo will check them. */
function refuseTooLong(network: PromoPostNetwork, title: string, pieces: string[]) {
  if (network !== "x" && pieces.length > 1) throw viralSays(`${PROMO_POST_NETWORK_NAMES[network]} takes one post. Join the pieces into one.`)
  const limit = PROMO_POST_LIMITS[network]
  const long = pieces.findIndex((piece) => piece.length > limit)
  if (long >= 0) {
    const which = pieces.length > 1 ? `Piece ${long + 1} is` : "It is"
    throw viralSays(`${which} ${pieces[long]!.length} characters, and ${PROMO_POST_NETWORK_NAMES[network]} takes ${limit}.`)
  }
  if (network === "reddit") {
    if (!title) throw viralSays("A Reddit post needs a title.")
    if (title.length > REDDIT_TITLE_LIMIT) throw viralSays(`The title is ${title.length} characters, and Reddit takes ${REDDIT_TITLE_LIMIT}.`)
  }
}

/**
 * Writes a post for one network from a vault idea and keeps it as written.
 * Refused when the AI's words don't fit the network, so a post Promo would
 * turn down never shows as ready.
 */
export async function writePromoPost(ownerId: string, itemId: string, network: PromoPostNetwork): Promise<PromoPostSend> {
  const { item, spendLimitCents, topic } = await ownedIdea(ownerId, itemId)
  await requireViralProjectBudget(ownerId, item.projectId, spendLimitCents, promoPostPriceCents())
  const analysis = item.analysis
  const written = await askWriter({
    userId: ownerId,
    feature: PROMO_POST_FEATURE,
    metadata: { vaultItemId: item.id, network, ...viralProjectSpendMetadata(item.projectId) },
    prompt: postPrompt(network, {
      title: item.title,
      topic: item.analysisTopic ?? topic,
      notes: item.notes.slice(0, 4_000),
      why: analysis ? `${analysis.whyItWorks.hook} ${analysis.whyItWorks.whySpread}` : "",
      script: analysis ? scriptText(analysis.script, segmentRoleLabels).slice(0, 6_000) : "",
      caption: analysis ? `${analysis.title.caption} ${analysis.title.hashtags.join(" ")}`.trim() : "",
    }),
    schema: postSchema,
    label: `The ${PROMO_POST_NETWORK_NAMES[network]} post`,
  })
  const title = network === "reddit" ? written.title.trim() : ""
  const pieces = written.pieces.map((piece) => piece.trim()).filter(Boolean)
  if (!pieces.length) throw viralSays("The post came back empty. Press Write again.")
  try {
    refuseTooLong(network, title, pieces)
  } catch (error) {
    throw viralSays(`${error instanceof Error ? error.message.replace(/^VIRAL_SAYS: /, "") : "It doesn't fit."} Press Write again.`)
  }
  const [row] = await db
    .insert(viralPromoSends)
    .values({ id: uuid(), ownerId, vaultItemId: item.id, network, title, pieces, createdAt: now() })
    .returning()
  return toSend(row, await getPromoUrl())
}

/**
 * Sends a written post to a Promo project as a draft, with any words changed
 * since it was written. Promo answers where the draft opens. A post that
 * failed can be sent again; one already sent can't.
 */
export async function sendPromoPost(
  ownerId: string,
  input: { sendId: string; promoProjectId: string; title: string; pieces: string[] },
  fetchImpl?: typeof fetch
): Promise<PromoPostSend> {
  const [row] = await db
    .select()
    .from(viralPromoSends)
    .where(and(eq(viralPromoSends.id, input.sendId), eq(viralPromoSends.ownerId, ownerId)))
    .limit(1)
  if (!row) throw viralSays("That post is gone. Write it again.")
  if (!sendsToPromo(row.network)) throw viralSays("Promo has no Threads, so a Threads post is for Copy.")
  if (row.status === "sent") throw viralSays("That post is in Promo already.")
  const title = row.network === "reddit" ? input.title.trim() : ""
  const pieces = input.pieces.map((piece) => piece.trim()).filter(Boolean)
  if (!pieces.length) throw viralSays("The post has no words.")
  refuseTooLong(row.network, title, pieces)
  const connection = await readPromoConnection().catch((error: unknown) => {
    throw viralSays(error instanceof Error ? error.message : "Fill in Promo's address and key first.")
  })

  try {
    const answer = z
      .object({ draftId: z.string(), draftUrl: z.string().max(600) })
      .parse(
        await callPromo(
          connection,
          "/api/connect/viral/posts",
          { sendId: row.id, projectId: input.promoProjectId, network: row.network, ideaId: row.vaultItemId, pieces, title },
          fetchImpl
        )
      )
    await db
      .update(viralPromoSends)
      .set({
        status: "sent",
        title,
        pieces,
        promoProjectId: input.promoProjectId,
        draftUrl: onPromoAddress(connection.url, answer.draftUrl) ? answer.draftUrl : null,
        error: "",
        sentAt: now(),
      })
      .where(eq(viralPromoSends.id, row.id))
  } catch (error) {
    const message = error instanceof PromoRefusal || error instanceof Error ? error.message : "Promo didn't answer."
    await db
      .update(viralPromoSends)
      .set({ status: "failed", title, pieces, promoProjectId: input.promoProjectId, error: message.slice(0, 1_000) })
      .where(eq(viralPromoSends.id, row.id))
    throw viralSays(message)
  }
  const [sent] = await db.select().from(viralPromoSends).where(eq(viralPromoSends.id, row.id)).limit(1)
  return toSend(sent!, connection.url)
}

/** An idea's written posts, newest first. */
export async function listPromoSends(ownerId: string, itemId: string): Promise<PromoPostSend[]> {
  const { item } = await ownedIdea(ownerId, itemId)
  const [rows, promoUrl] = await Promise.all([
    db.select().from(viralPromoSends).where(eq(viralPromoSends.vaultItemId, item.id)).orderBy(desc(viralPromoSends.createdAt)).limit(50),
    getPromoUrl(),
  ])
  return rows.map((row) => toSend(row, promoUrl))
}

/** What Promo says when a post from an idea went up, and again when its views move, at most daily. */
export const promoPostedShape = z.object({
  type: z.literal("posted"),
  ideaId: z.string().min(1).max(64),
  postKey: z.string().min(1).max(60),
  network: z.string().min(1).max(30),
  url: z.string().url().max(2_000),
  views: z.number().int().nullable().default(null),
  likes: z.number().int().nullable().default(null),
  comments: z.number().int().nullable().default(null),
  postedAt: z.string().datetime({ offset: true }).nullable().default(null),
})

export type PromoPosted = z.infer<typeof promoPostedShape>

/**
 * Keeps your post of an idea and its latest figures, and turns the idea
 * Posted. An idea no longer in the vault answers "gone", so Promo stops
 * asking about it.
 */
export async function applyPromoPosted(ownerId: string, event: PromoPosted): Promise<{ ok: true; status: "kept" | "gone" }> {
  if (!/^https?:\/\//.test(event.url)) return { ok: true, status: "gone" }
  // Only the key owner's ideas: another person's idea answers "gone".
  const [item] = await db
    .select({ id: viralVaultItems.id, ownerId: viralVaultItems.ownerId, status: viralVaultItems.status })
    .from(viralVaultItems)
    .where(and(eq(viralVaultItems.id, event.ideaId), eq(viralVaultItems.ownerId, ownerId)))
    .limit(1)
  if (!item) return { ok: true, status: "gone" }
  const at = now()
  const figures = {
    network: event.network,
    url: event.url,
    views: event.views,
    likes: event.likes,
    comments: event.comments,
    postedAt: event.postedAt ? new Date(event.postedAt) : null,
    figuresAt: at,
  }
  await db
    .insert(viralVaultPosts)
    .values({ id: uuid(), ownerId: item.ownerId, vaultItemId: item.id, postKey: event.postKey, ...figures, createdAt: at })
    .onConflictDoUpdate({ target: [viralVaultPosts.ownerId, viralVaultPosts.postKey], set: figures })
  if (item.status !== "posted") {
    await db.update(viralVaultItems).set({ status: "posted", updatedAt: at }).where(eq(viralVaultItems.id, item.id))
  }
  return { ok: true, status: "kept" }
}

/** Your posts of an idea, as Promo reported them, newest first. */
export async function listVaultPosts(ownerId: string, itemId: string): Promise<VaultPost[]> {
  const rows = await db
    .select()
    .from(viralVaultPosts)
    .where(and(eq(viralVaultPosts.vaultItemId, itemId), eq(viralVaultPosts.ownerId, ownerId)))
    .orderBy(desc(viralVaultPosts.createdAt))
  return rows.map((row) => ({
    id: row.id,
    network: row.network,
    url: row.url,
    views: row.views,
    likes: row.likes,
    comments: row.comments,
    postedAt: row.postedAt?.toISOString() ?? null,
    figuresAt: row.figuresAt.toISOString(),
  }))
}
