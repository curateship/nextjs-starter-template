import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import {
  BLOCK_NOTE_MAX,
  BLOCK_PATTERN_MAX,
  blockSender,
  listBlockedSenders,
  unblockSender,
} from "@/server/crm/blocked"
import { adminGet, adminPost } from "@/server/guards"
import { currentWorkspaceId } from "@/server/people/workspaces"

import { createErrorMessage } from "../error-message"

export type BlockedSender = {
  id: string
  /** A whole address, or a domain written `@example.com`. */
  pattern: string
  note: string | null
  created_at: string
}

const blockSchema = z.object({
  pattern: z.string().trim().min(3).max(BLOCK_PATTERN_MAX),
  note: z.string().trim().max(BLOCK_NOTE_MAX).optional(),
})

const idSchema = z.object({ id: z.string().min(1).max(36) })

const loadBlockedFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(async ({ context }): Promise<BlockedSender[]> => {
    const workspaceId = await currentWorkspaceId(context.user.id)
    const rows = await listBlockedSenders(workspaceId)
    return rows.map((row) => ({
      id: row.id,
      pattern: row.pattern,
      note: row.note,
      created_at: row.createdAt.toISOString(),
    }))
  })

/**
 * Blocks one address or domain.
 *
 * `added` says whether this press is what put it on the list, so pressing
 * Block twice on the same sender reads as "already blocked" rather than as a
 * refusal. A pattern that is neither an address nor a domain is refused, which
 * is the only way this fails.
 */
const blockFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(blockSchema)
  .handler(async ({ data, context }) => {
    const workspaceId = await currentWorkspaceId(context.user.id)
    const result = await blockSender(
      workspaceId,
      data.pattern,
      data.note ?? null
    )
    if (!result.blocked) throw new Error("CRM_BLOCK_PATTERN_INVALID")
    return { pattern: result.pattern, added: result.added }
  })

const unblockFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(idSchema)
  .handler(async ({ data, context }) => {
    const workspaceId = await currentWorkspaceId(context.user.id)
    const removed = await unblockSender(workspaceId, data.id)
    if (!removed) throw new Error("CRM_BLOCK_NOT_FOUND")
    return { removed }
  })

export function loadBlockedSenders() {
  return loadBlockedFn()
}

export function blockAddress(pattern: string, note?: string) {
  return blockFn({ data: { pattern, note } })
}

export function unblockAddress(id: string) {
  return unblockFn({ data: { id } })
}

export const getBlockedSenderErrorMessage = createErrorMessage(
  {
    CRM_BLOCK_PATTERN_INVALID:
      "That is not an address or a domain. Write a full address, or a domain as @example.com.",
    CRM_BLOCK_NOT_FOUND: "That one is no longer on the list.",
  },
  "That did not work. Try again."
)
