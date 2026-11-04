import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { ARCHIVE_ITEM_KINDS, CAPTION_NETWORKS } from "@/lib/archive/items"
import { adminGet, adminPost } from "@/server/guards"
import { editorGet, editorPost } from "@/server/social/editor-guards"
import { actorFor } from "@/server/social/project-guests"
import type { ArchiveCard, ArchiveItemView, ArchiveProjectRow } from "@/server/archive/items"

import { getPhoneAppErrorMessage } from "../social/phone-apps"

export type { ArchiveCard, ArchiveItemView, ArchiveProjectRow }

/**
 * The Archive's endpoints (`workspace/docs/archive.md`). Reading an item and
 * its project's list, and saving an item's words, let in a guest sent from
 * Project for their own project (part 33); everything else is admin only.
 * A guest gets no file to download: the item view leaves the download out.
 */

const PASS = [
  "That archive item is not there any more.",
  "That project is not there any more.",
  "That project does not exist.",
  "Move it to the Bin first.",
  "The file could not be deleted from storage. Try again in a minute.",
  "That item is still arriving. Copy it once it is in.",
  "The copy failed. Try again.",
  "Pick a video or a picture. Sound files don't go in the archive.",
  "Give the item a name or a description first, so the AI knows what it is about.",
  "Add an Instagram or TikTok account to this project first, so the captions are in its voice.",
]

/**
 * The archive's own refusals pass through; anything else is put in words the
 * way the Instagram and TikTok module does, which knows the AI's refusals
 * (Write captions).
 */
export function getArchiveErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : ""
  return PASS.includes(message) ? message : getPhoneAppErrorMessage(error)
}

const id = z.string().min(1).max(36)

const projectsFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(async ({ context }): Promise<ArchiveProjectRow[]> => {
    const items = await import("@/server/archive/items")
    return items.listArchiveProjects(context.user.id)
  })

/** Every project with its item count and storage, for the Archive's left panel. */
export function loadArchiveProjects(): Promise<ArchiveProjectRow[]> {
  return projectsFn()
}

const listShape = z.object({
  projectId: id,
  kind: z.enum(ARCHIVE_ITEM_KINDS).optional(),
  q: z.string().max(120).optional(),
  notPosted: z.boolean().optional(),
  sort: z.enum(["newest", "views"]).optional(),
  bin: z.boolean().optional(),
})

const listFn = createServerFn({ method: "GET" })
  .middleware([editorGet])
  .inputValidator(listShape)
  .handler(async ({ context, data }) => {
    const actor = await actorFor(context.caller, data.projectId)
    const items = await import("@/server/archive/items")
    // A guest sees what is in the archive, never the Bin.
    return items.listArchiveItems(actor.userId, { ...data, bin: actor.guest ? false : data.bin })
  })

/** One project's items, as the middle panel lists them. */
export function loadArchiveItems(query: z.infer<typeof listShape>): Promise<{ items: ArchiveCard[]; binCount: number }> {
  return listFn({ data: query })
}

/** The guest check for one item: the project it is in decides who the call acts as. */
async function actorForItem(caller: Parameters<typeof actorFor>[0], itemId: string) {
  const items = await import("@/server/archive/items")
  const projectId = caller.guests.length ? await items.projectOfItem(itemId) : null
  return { actor: await actorFor(caller, projectId), items }
}

const itemFn = createServerFn({ method: "GET" })
  .middleware([editorGet])
  .inputValidator(z.object({ itemId: id }))
  .handler(async ({ context, data }): Promise<ArchiveItemView & { canDownload: boolean }> => {
    const { actor, items } = await actorForItem(context.caller, data.itemId)
    const view = await items.readArchiveItem(actor.userId, data.itemId)
    if (actor.guest && view.deletedAt) throw new Error("That archive item is not there any more.")
    // Tyler, 4 Nov 2026: guests "Watch and post only". The PDF is a download only.
    return { ...view, pdfUrl: actor.guest ? "" : view.pdfUrl, canDownload: !actor.guest }
  })

export function loadArchiveItem(itemId: string): Promise<ArchiveItemView & { canDownload: boolean }> {
  return itemFn({ data: { itemId } })
}

const captionsShape = z.object(Object.fromEntries(CAPTION_NETWORKS.map((network) => [network, z.string().max(4_000).optional()])))

const saveFn = createServerFn({ method: "POST" })
  .middleware([editorPost])
  .inputValidator(
    z.object({
      itemId: id,
      title: z.string().max(200).optional(),
      description: z.string().max(10_000).optional(),
      caption: z.string().max(10_000).optional(),
      captions: captionsShape.optional(),
    })
  )
  .handler(async ({ context, data: { itemId, ...edit } }): Promise<void> => {
    const { actor, items } = await actorForItem(context.caller, itemId)
    // A guest posts what is there and may change the captions it goes out with, never the item's name.
    const allowed = actor.guest ? { caption: edit.caption, captions: edit.captions } : edit
    await items.updateArchiveItem(actor.userId, itemId, allowed)
  })

/** Saves an item's words as they are typed. */
export function saveArchiveItem(data: { itemId: string; title?: string; description?: string; caption?: string; captions?: Record<string, string | undefined> }) {
  return saveFn({ data })
}

const pinFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ itemId: id, pinned: z.boolean() }))
  .handler(async ({ context, data }) => (await import("@/server/archive/items")).pinArchiveItem(context.user.id, data.itemId, data.pinned))

export function pinArchiveItem(itemId: string, pinned: boolean): Promise<void> {
  return pinFn({ data: { itemId, pinned } })
}

const binFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ itemIds: z.array(id).min(1).max(200) }))
  .handler(async ({ context, data }) => (await import("@/server/archive/items")).binArchiveItems(context.user.id, data.itemIds))

/** Moves items to the Bin, where they wait 30 days. */
export function binArchiveItems(itemIds: string[]): Promise<{ binned: number }> {
  return binFn({ data: { itemIds } })
}

const restoreFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ itemId: id }))
  .handler(async ({ context, data }) => (await import("@/server/archive/items")).restoreArchiveItem(context.user.id, data.itemId))

export function restoreArchiveItem(itemId: string): Promise<void> {
  return restoreFn({ data: { itemId } })
}

const forGoodFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ itemId: id }))
  .handler(async ({ context, data }) => (await import("@/server/archive/items")).deleteArchiveItemForGood(context.user.id, data.itemId))

export function deleteArchiveItemForGood(itemId: string): Promise<void> {
  return forGoodFn({ data: { itemId } })
}

const placeFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ itemId: id, projectId: id, keep: z.enum(["copy", "move"]) }))
  .handler(async ({ context, data }): Promise<{ itemId: string }> => {
    const items = await import("@/server/archive/items")
    if (data.keep === "move") {
      await items.moveArchiveItem(context.user.id, data.itemId, data.projectId)
      return { itemId: data.itemId }
    }
    return { itemId: await items.copyArchiveItem(context.user.id, data.itemId, data.projectId) }
  })

/** Copies an item into another project, or moves it there (part 27). */
export function placeArchiveItem(itemId: string, projectId: string, keep: "copy" | "move"): Promise<{ itemId: string }> {
  return placeFn({ data: { itemId, projectId, keep } })
}

const uploadsFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ projectId: id, mediaUrls: z.array(z.string().max(2_048)).min(1).max(100) }))
  .handler(async ({ context, data }) =>
    (await import("@/server/archive/items")).addUploadsToArchive(context.user.id, data.projectId, data.mediaUrls)
  )

/** Puts uploaded media library files, by the picker's addresses, into a project's archive (part 28). */
export function addUploadsToArchive(projectId: string, mediaUrls: string[]): Promise<{ added: number }> {
  return uploadsFn({ data: { projectId, mediaUrls } })
}
