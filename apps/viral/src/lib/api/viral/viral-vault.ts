import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { ANALYSIS_NOTES_MAX } from "@/lib/viral/analysis"
import { VAULT_STATUSES, VAULT_TAG_MAX, VAULT_TAGS_PER_ITEM_MAX, VAULT_TITLE_MAX, type VaultItem, type VaultStatus } from "@/lib/viral/vault"
import { VIRAL_PROJECT_NOTES_MAX } from "@/lib/viral/viral"
import type { WriterPrice } from "@/lib/viral/writers"
import { adminGet, adminPost } from "@/server/guards"
import {
  changeVaultItems,
  copyVaultItem,
  createOwnIdea,
  listVault,
  listVaultTags,
  loadVaultItem,
  saveEditedScript,
  saveToVault,
  updateVaultItem,
  type VaultBulkChange,
  type VaultBulkResult,
  type VaultCopyResult,
} from "@/server/viral/vault"
import { ownIdeaScriptPrice, postAnalysisPrice, savePostToVault, writeOwnIdeaScript } from "@/server/viral/vault-ai"
import { writerForPrices } from "@/server/viral/writer-choice"

/**
 * The vault (`workspace/docs/vault.md`). Admin only, like every Viral door.
 * The owner comes from the session, never from the request.
 */

export type { VaultBulkChange, VaultBulkResult, VaultCopyResult, VaultItem }

const id = z.string().min(1).max(36)

const saveFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.object({
      projectId: id,
      url: z.string().min(1).max(2048),
      analysisId: id.nullable(),
      notes: z.string().max(ANALYSIS_NOTES_MAX),
    })
  )
  .handler(async ({ data, context }): Promise<VaultItem> => saveToVault(context.user.id, data))

/** Save to vault on the right panel. Saving the same video again updates the same idea. */
export function saveToVaultFn(input: { projectId: string; url: string; analysisId: string | null; notes: string }) {
  return saveFn({ data: input })
}

const listFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(z.object({ projectId: id.optional() }))
  .handler(async ({ data, context }) => {
    const [items, tags] = await Promise.all([listVault(context.user.id, data), listVaultTags(context.user.id)])
    return { items, tags }
  })

/** One project's vault, or every project's when no project is named, with the tags in use. */
export function loadVault(projectId?: string) {
  return listFn({ data: { projectId } })
}

const itemFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(z.object({ itemId: id }))
  .handler(async ({ data, context }): Promise<VaultItem> => loadVaultItem(context.user.id, data.itemId))

export function loadVaultItemFn(itemId: string) {
  return itemFn({ data: { itemId } })
}

const updateFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.object({
      itemId: id,
      // Your own idea's notes are the editor's document, which is longer than its words.
      notes: z.string().max(VIRAL_PROJECT_NOTES_MAX).optional(),
      status: z.enum(VAULT_STATUSES).optional(),
      tags: z.array(z.string().max(VAULT_TAG_MAX)).max(VAULT_TAGS_PER_ITEM_MAX).optional(),
    })
  )
  .handler(async ({ data, context }): Promise<VaultItem> => {
    const { itemId, ...change } = data
    return updateVaultItem(context.user.id, itemId, change)
  })

/** Notes, status and tags on one idea, each saved as it changes. */
export function updateVaultItemFn(itemId: string, change: { notes?: string; status?: VaultStatus; tags?: string[] }) {
  return updateFn({ data: { itemId, ...change } })
}

const bulkFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.object({
      itemIds: z.array(id).min(1).max(500),
      change: z.discriminatedUnion("kind", [
        z.object({ kind: z.literal("status"), status: z.enum(VAULT_STATUSES) }),
        z.object({ kind: z.literal("tag"), name: z.string().min(1).max(VAULT_TAG_MAX) }),
        z.object({ kind: z.literal("delete") }),
      ]),
    })
  )
  .handler(async ({ data, context }): Promise<VaultBulkResult> => changeVaultItems(context.user.id, data.itemIds, data.change))

/** Mass select: set a status, add a tag, or delete, in one request. Answers what changed and what was skipped. */
export function changeVaultItemsFn(itemIds: string[], change: VaultBulkChange) {
  return bulkFn({ data: { itemIds, change } })
}

const copyFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ itemId: id, projectId: id }))
  .handler(async ({ data, context }): Promise<VaultCopyResult> => copyVaultItem(context.user.id, data.itemId, data.projectId))

/** Copy to another project: both projects keep the idea, sharing one file. */
export function copyVaultItemFn(itemId: string, projectId: string) {
  return copyFn({ data: { itemId, projectId } })
}

const createFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.object({ projectId: id, title: z.string().max(VAULT_TITLE_MAX), notes: z.string().max(VIRAL_PROJECT_NOTES_MAX) })
  )
  .handler(async ({ data, context }): Promise<VaultItem> => createOwnIdea(context.user.id, data))

/** "+ New idea": your own idea, with a title and notes and no video. Status starts at Idea. */
export function createOwnIdeaFn(input: { projectId: string; title: string; notes: string }) {
  return createFn({ data: input })
}

const scriptEditFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ itemId: id, words: z.array(z.string().max(4_000)).max(30).nullable() }))
  .handler(async ({ data, context }): Promise<VaultItem> => saveEditedScript(context.user.id, data.itemId, data.words))

/** Your words for each part of the script, in order. Null goes back to the AI's version. */
export function saveEditedScriptFn(itemId: string, words: string[] | null) {
  return scriptEditFn({ data: { itemId, words } })
}

const savePostFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ postId: id }))
  .handler(async ({ data, context }): Promise<VaultItem> => savePostToVault(context.user.id, data.postId))

/** Save to vault on an X, Reddit or LinkedIn post: the AI writes the four pieces, then the idea is kept. */
export function savePostToVaultFn(postId: string) {
  return savePostFn({ data: { postId } })
}

const ownScriptFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ itemId: id }))
  .handler(async ({ data, context }): Promise<VaultItem> => writeOwnIdeaScript(context.user.id, data.itemId))

/** Write a script on your own idea, for the project's topic. */
export function writeOwnIdeaScriptFn(itemId: string) {
  return ownScriptFn({ data: { itemId } })
}

const pricesFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(async (): Promise<{ post: WriterPrice; ownScript: WriterPrice }> => {
    const writer = await writerForPrices()
    return { post: postAnalysisPrice(writer), ownScript: ownIdeaScriptPrice(writer) }
  })

/** What saving a post and writing your own idea's script cost, with the writer's name, shown before either runs. */
export function loadVaultWritingPrices() {
  return pricesFn()
}
