import { and, asc, eq, isNull } from "drizzle-orm"


import { CAPTION_NETWORKS, type ArchiveCaptions, type CaptionNetwork } from "@/lib/archive/items"
import { ABOUT_MAX } from "@/lib/social/phone-apps"
import { db as defaultDb, type CustomShellDb } from "@/server/db"
import { draftCaption } from "@/server/social/phone-apps/captions"
import { promoAccounts } from "@/server/social/schema"
import { queueAppPost } from "@/server/social/phone-apps/posts"
import { actorFor, type EditorCaller } from "@/server/social/project-guests"

import { archiveFileForUrl } from "./files"

import type { Network } from "@/lib/social/networks"

import { promoArchiveDrafts, promoArchiveItems } from "./schema"
import { ITEM_NOT_THERE, listArchiveItems, type ArchiveCard } from "./items"

/**
 * Posting from the Archive (`workspace/docs/archive.md`, section D of the
 * task). Write captions is here; the post writers' From archive and drafts
 * use `items.ts` and the networks' own posting code.
 */

/**
 * Write captions (part 36): one caption per network, by the AI, in the voice
 * of the project's first account on that network, within that network's
 * limits. Only on the button: nothing is written when an item arrives
 * (Tyler, 4 Nov 2026). A network with no account in the project is skipped.
 */
export async function writeArchiveCaptions(
  userId: string,
  itemId: string,
  {
    db = defaultDb,
    draft = draftCaption,
  }: { db?: CustomShellDb; draft?: typeof draftCaption } = {}
): Promise<{ captions: ArchiveCaptions; written: CaptionNetwork[] }> {
  const [item] = await db
    .select()
    .from(promoArchiveItems)
    .where(and(eq(promoArchiveItems.id, itemId), eq(promoArchiveItems.userId, userId)))
    .limit(1)
  if (!item) throw new Error(ITEM_NOT_THERE)
  const about = [item.title, item.description, item.caption]
    .map((part) => part.trim())
    .filter(Boolean)
    .join("\n\n")
    .slice(0, ABOUT_MAX)
  if (!about) throw new Error("Give the item a name or a description first, so the AI knows what it is about.")

  const captions: ArchiveCaptions = { ...item.captions }
  const written: CaptionNetwork[] = []
  for (const network of CAPTION_NETWORKS) {
    const [account] = await db
      .select({ id: promoAccounts.id })
      .from(promoAccounts)
      .where(and(eq(promoAccounts.projectId, item.projectId), eq(promoAccounts.platform, network), isNull(promoAccounts.retiredAt)))
      .orderBy(asc(promoAccounts.createdAt))
      .limit(1)
    if (!account) continue
    captions[network] = await draft(userId, { accountId: account.id, about, kind: item.kind === "video" ? "video" : "photo" }, db)
    written.push(network)
  }
  if (!written.length) throw new Error("Add an Instagram or TikTok account to this project first, so the captions are in its voice.")
  await db.update(promoArchiveItems).set({ captions, updatedAt: new Date() }).where(eq(promoArchiveItems.id, item.id))
  return { captions, written }
}

/** What each network's post writer may take from the Archive (part 34). X takes pictures only. */
export const PICKABLE: Record<"instagram" | "tiktok" | "linkedin" | "x", ArchiveCard["kind"][]> = {
  instagram: ["video", "picture", "carousel"],
  tiktok: ["video", "picture", "carousel"],
  linkedin: ["video", "picture", "carousel"],
  x: ["picture"],
}

/**
 * The From archive window: the project's ready items this network takes,
 * with the ones ticked for it in Video's send window first (part 35).
 */
export async function listArchivePicks(
  userId: string,
  projectId: string,
  network: keyof typeof PICKABLE,
  db: CustomShellDb = defaultDb
): Promise<{ items: ArchiveCard[]; draftIds: string[] }> {
  const { items } = await listArchiveItems(userId, { projectId }, db)
  const drafts = await db
    .select({ itemId: promoArchiveDrafts.itemId })
    .from(promoArchiveDrafts)
    .where(and(eq(promoArchiveDrafts.projectId, projectId), eq(promoArchiveDrafts.network, network as Network), isNull(promoArchiveDrafts.usedAt)))
  const draftIds = drafts.map((draft) => draft.itemId)
  const usable = items.filter((item) => item.status === "ready" && PICKABLE[network].includes(item.kind))
  usable.sort((a, b) => Number(draftIds.includes(b.id)) - Number(draftIds.includes(a.id)))
  return { items: usable, draftIds: draftIds.filter((id) => usable.some((item) => item.id === id)) }
}

/**
 * One press, several accounts (part 39): a post per account, each queued on
 * its own as if Post had been pressed for it, so one account's refusal never
 * stops the rest. Nothing is booked for later (Tyler, 4 Nov 2026: "One
 * press, all go now"). A guest posts only from their project's accounts and
 * only archive files (part 33).
 */
export async function queuePostsFrom(
  caller: EditorCaller,
  accountIds: string[],
  post: { mediaUrl: string; mediaUrls?: string[]; caption: string; draftCaption: string },
  db: CustomShellDb = defaultDb
): Promise<{ sent: number; refused: { accountId: string; reason: string }[] }> {
  const refused: { accountId: string; reason: string }[] = []
  let sent = 0
  for (const accountId of [...new Set(accountIds)]) {
    try {
      const [account] = await db.select({ projectId: promoAccounts.projectId }).from(promoAccounts).where(eq(promoAccounts.id, accountId)).limit(1)
      const actor = await actorFor(caller, account?.projectId ?? null, db)
      if (actor.guest) {
        for (const url of [post.mediaUrl, ...(post.mediaUrls ?? [])]) {
          const file = await archiveFileForUrl(actor.userId, url, db)
          if (!file || !(await itemInProject(file.itemId, actor.guest.projectId, db))) {
            throw new Error("Pick the file from this project's archive.")
          }
        }
      }
      await queueAppPost(actor.userId, { accountId, ...post } as Parameters<typeof queueAppPost>[1], db)
      sent += 1
    } catch (error) {
      refused.push({ accountId, reason: error instanceof Error ? error.message : "That account could not post." })
    }
  }
  return { sent, refused }
}

async function itemInProject(itemId: string, projectId: string, db: CustomShellDb): Promise<boolean> {
  const [row] = await db
    .select({ id: promoArchiveItems.id })
    .from(promoArchiveItems)
    .where(and(eq(promoArchiveItems.id, itemId), eq(promoArchiveItems.projectId, projectId)))
    .limit(1)
  return Boolean(row)
}
