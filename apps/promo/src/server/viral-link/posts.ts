import { and, eq } from "drizzle-orm"
import { z } from "zod"

import { MAX_POST_BODY_CHARS, MAX_POST_TITLE_CHARS } from "@/lib/social/options"
import { appUrlFor } from "@/server/app-url"
import { uuid } from "@/server/auth/security"
import { Refusal } from "@/server/browser/refusal"
import { db as defaultDb, type CustomShellDb } from "@/server/db"
import { saveLinkedinPost } from "@/server/social/linkedin/posts"
import { promoProjects } from "@/server/social/schema"
import { saveXPost } from "@/server/social/x/posts"

import { ViralLinkRefusal } from "./link"
import { promoViralDrafts, type PromoViralLinkRow } from "./schema"

/**
 * Posts Viral writes for a Promo project (`workspace/docs/viral-link.md`).
 * Nothing goes out from here: an X post or thread becomes a draft on the
 * project's X Posts tab, a LinkedIn post a draft on its LinkedIn Posts tab,
 * and a Reddit post waits until New post opens with it. A person presses
 * Post in Promo, the same as for any other draft.
 *
 * Each draft's `source` is `viral:<idea id>`, which is how a post made from
 * it is reported back to Viral once it is up (`reports.ts`).
 */

/** The networks Viral can leave a post in. Promo has no Threads. */
export const VIRAL_POST_NETWORKS = ["x", "linkedin", "reddit"] as const

export const postShape = z.object({
  sendId: z.string().regex(/^[A-Za-z0-9-]{8,64}$/),
  projectId: z.string().min(1).max(36),
  network: z.enum(VIRAL_POST_NETWORKS),
  ideaId: z.string().regex(/^[A-Za-z0-9-]{1,64}$/),
  /** X: one piece for a post, several for a thread. LinkedIn and Reddit: one. */
  pieces: z.array(z.string().max(MAX_POST_BODY_CHARS)).min(1).max(25),
  /** Reddit's title. */
  title: z.string().max(MAX_POST_TITLE_CHARS).default(""),
})

export type PostNote = z.infer<typeof postShape>

export type PostAnswer = { draftId: string; draftUrl: string }

/** Where a draft opens in Promo. */
function draftHref(projectId: string, network: PostNote["network"], draftId: string, promoPostId: string): string {
  const project = `/admin/projects/${encodeURIComponent(projectId)}?network=${network}`
  if (network === "reddit") return `${project}&newPost=${encodeURIComponent(draftId)}`
  return `${project}&tab=posts&open=${encodeURIComponent(promoPostId)}`
}

/**
 * A post from Viral, saved as a draft. The same send twice answers the draft
 * the first one made. Throws a `ViralLinkRefusal` with Promo's own words,
 * such as a post longer than LinkedIn takes.
 */
export async function acceptPost(link: PromoViralLinkRow, note: PostNote, db: CustomShellDb = defaultDb): Promise<PostAnswer> {
  const userId = link.userId
  const [already] = await db
    .select()
    .from(promoViralDrafts)
    .where(and(eq(promoViralDrafts.userId, userId), eq(promoViralDrafts.sendId, note.sendId)))
    .limit(1)
  if (already) {
    return { draftId: already.id, draftUrl: appUrlFor(draftHref(already.projectId, note.network, already.id, already.promoPostId)) }
  }

  const [project] = await db
    .select({ id: promoProjects.id })
    .from(promoProjects)
    .where(and(eq(promoProjects.id, note.projectId), eq(promoProjects.userId, userId)))
    .limit(1)
  if (!project) throw new ViralLinkRefusal(404, "That Promo project is not there any more. Pick another one.")

  const pieces = note.pieces.map((piece) => piece.trim()).filter(Boolean)
  if (!pieces.length) throw new ViralLinkRefusal(400, "The post has no words.")
  if (note.network !== "x" && pieces.length > 1) throw new ViralLinkRefusal(400, "Only X takes a thread. Send one piece.")
  if (note.network === "reddit" && !note.title.trim()) throw new ViralLinkRefusal(400, "A Reddit post needs a title.")
  const source = `viral:${note.ideaId}`

  let promoPostId = ""
  try {
    if (note.network === "x") {
      promoPostId = await saveXPost(
        userId,
        project.id,
        null,
        { accountId: null, pieces: pieces.map((text) => ({ text, pictureUrl: "" })), poll: null, communityId: "", source, scheduledFor: null },
        db
      )
    } else if (note.network === "linkedin") {
      promoPostId = await saveLinkedinPost(
        userId,
        project.id,
        null,
        {
          accountId: null,
          kind: "post",
          text: pieces[0]!,
          title: "",
          pictureUrl: "",
          videoUrl: "",
          poll: null,
          tags: [],
          repostFindId: null,
          groupId: "",
          asPageId: "",
          source,
          scheduledFor: null,
        },
        db
      )
    }
  } catch (error) {
    // Promo's own refusal, such as a post longer than LinkedIn takes, is told to Viral as it is.
    if (error instanceof Refusal) throw new ViralLinkRefusal(400, error.message)
    throw error
  }

  const id = uuid()
  await db.insert(promoViralDrafts).values({
    id,
    userId,
    projectId: project.id,
    sendId: note.sendId,
    network: note.network,
    ideaId: note.ideaId,
    title: note.network === "reddit" ? note.title.trim() : "",
    body: pieces.join("\n\n"),
    promoPostId,
  })
  return { draftId: id, draftUrl: appUrlFor(draftHref(project.id, note.network, id, promoPostId)) }
}

export type ViralRedditStart = { accountId: null; projectId: string; subreddit: string; title: string; body: string }

/**
 * A Reddit post Viral wrote, for New post to open with (`?newPost=<id>` on
 * the project page). Null when there is no such draft. Nothing is sent.
 */
export async function viralRedditDraft(userId: string, draftId: string, db: CustomShellDb = defaultDb): Promise<ViralRedditStart | null> {
  const [draft] = await db
    .select()
    .from(promoViralDrafts)
    .where(and(eq(promoViralDrafts.id, draftId), eq(promoViralDrafts.userId, userId), eq(promoViralDrafts.network, "reddit")))
    .limit(1)
  if (!draft) return null
  if (!draft.usedAt) await db.update(promoViralDrafts).set({ usedAt: new Date() }).where(eq(promoViralDrafts.id, draft.id))
  return { accountId: null, projectId: draft.projectId, subreddit: "", title: draft.title, body: draft.body }
}
