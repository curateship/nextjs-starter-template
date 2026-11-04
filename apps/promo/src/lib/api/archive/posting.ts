import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import type { ArchiveCaptions, CaptionNetwork } from "@/lib/archive/items"
import type { ArchiveCard } from "@/server/archive/items"
import { editorGet, editorPost } from "@/server/social/editor-guards"
import { actorFor } from "@/server/social/project-guests"

/**
 * Posting from the Archive. Write captions lets in a guest from Project for
 * an item in their project, paid from the owner's AI keys like the rest of
 * the project's AI.
 */

const captionsFn = createServerFn({ method: "POST" })
  .middleware([editorPost])
  .inputValidator(z.object({ itemId: z.string().min(1).max(36) }))
  .handler(async ({ context, data }) => {
    const items = await import("@/server/archive/items")
    const projectId = context.caller.guests.length ? await items.projectOfItem(data.itemId) : null
    const actor = await actorFor(context.caller, projectId)
    const posting = await import("@/server/archive/posting")
    return posting.writeArchiveCaptions(actor.userId, data.itemId)
  })

/** Write captions on an archive item (part 36). */
export function writeArchiveCaptions(itemId: string): Promise<{ captions: ArchiveCaptions; written: CaptionNetwork[] }> {
  return captionsFn({ data: { itemId } })
}

const picksFn = createServerFn({ method: "GET" })
  .middleware([editorGet])
  .inputValidator(z.object({ projectId: z.string().min(1).max(36), network: z.enum(["instagram", "tiktok", "linkedin", "x"]) }))
  .handler(async ({ context, data }) => {
    const actor = await actorFor(context.caller, data.projectId)
    const posting = await import("@/server/archive/posting")
    return posting.listArchivePicks(actor.userId, data.projectId, data.network)
  })

/** What the From archive window lists for one network's post writer (parts 34 and 35). */
export function loadArchivePicks(projectId: string, network: "instagram" | "tiktok" | "linkedin" | "x"): Promise<{ items: ArchiveCard[]; draftIds: string[] }> {
  return picksFn({ data: { projectId, network } })
}

const postsFn = createServerFn({ method: "POST" })
  .middleware([editorPost])
  .inputValidator(
    z.object({
      accountIds: z.array(z.string().min(1).max(64)).min(1).max(20),
      mediaUrl: z.string().min(1).max(2048),
      mediaUrls: z.array(z.string().min(1).max(2048)).max(20).optional(),
      caption: z.string().max(10_000),
      draftCaption: z.string().max(10_000),
    })
  )
  .handler(async ({ context, data: { accountIds, ...post } }) => {
    const posting = await import("@/server/archive/posting")
    return posting.queuePostsFrom(context.caller, accountIds, post)
  })

/**
 * Post from several accounts at once (part 39): one post per ticked
 * account, straight away, each on its own phone. Answers how many went to a
 * phone and why any account was refused. A guest from Project posts only
 * archive files from their project's accounts (part 33).
 */
export function sendAppPosts(data: {
  accountIds: string[]
  mediaUrl: string
  mediaUrls?: string[]
  caption: string
  draftCaption: string
}): Promise<{ sent: number; refused: { accountId: string; reason: string }[] }> {
  return postsFn({ data })
}
