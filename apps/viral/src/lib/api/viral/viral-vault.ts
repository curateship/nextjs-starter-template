import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { ANALYSIS_NOTES_MAX } from "@/lib/viral/analysis"
import { VAULT_STATUSES, VAULT_TAG_MAX, VAULT_TAGS_PER_ITEM_MAX, type VaultItem, type VaultStatus } from "@/lib/viral/vault"
import { adminGet, adminPost } from "@/server/guards"
import {
  changeVaultItems,
  copyVaultItem,
  listVault,
  listVaultTags,
  loadVaultItem,
  saveToVault,
  updateVaultItem,
  type VaultBulkChange,
  type VaultBulkResult,
  type VaultCopyResult,
} from "@/server/viral/vault"

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
      notes: z.string().max(ANALYSIS_NOTES_MAX).optional(),
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
