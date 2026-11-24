import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { MERGE_ERRORS } from "@/lib/directory/listing-duplicates"
import {
  listDuplicatePairs,
  markNotDuplicate,
  mergeListings,
  type DuplicatePair,
  type DuplicateSide,
  type DuplicatesPage,
} from "@/server/directory/duplicates"
import { adminGet, adminPost } from "@/server/guards"
import { workspaceIdForRequest } from "@/server/workspaces/for-request"

import { createErrorMessage } from "../error-message"

export type { DuplicatePair, DuplicateSide, DuplicatesPage }

/**
 * The Duplicates row's doors (Tyler's pick, 24 Nov 2026: "Merge duplicate
 * listings"). Every one is admin only and reaches only the admin's own site:
 * an id from another site is "deleted already", never merged.
 */

export const getDuplicatesErrorMessage = createErrorMessage(
  Object.fromEntries(Object.values(MERGE_ERRORS).map((words) => [words, words])),
  "That did not work. Please try again."
)

const id = z.string().min(1).max(36)

const pageFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(
    z.object({
      search: z.string().max(200).optional(),
      page: z.number().int().min(1).max(10_000).optional(),
      limit: z.number().int().min(1).max(100).optional(),
    })
  )
  .handler(
    async ({ data, context }): Promise<DuplicatesPage> =>
      listDuplicatePairs(await workspaceIdForRequest(context.user.id), data)
  )

const notDuplicateFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ first: id, second: id }))
  .handler(async ({ data, context }) =>
    markNotDuplicate(await workspaceIdForRequest(context.user.id), [data.first, data.second], context.user.id)
  )

const mergeFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ keepId: id, mergeId: id }))
  .handler(async ({ data, context }) => mergeListings(await workspaceIdForRequest(context.user.id), data, context.user.id))

/** One page of pairs that look like the same place. */
export function loadDuplicatesPage(options: { search?: string; page?: number; limit?: number }) {
  return pageFn({ data: options })
}
/** The two are different places, so the row stops showing them. */
export function markPairNotDuplicate(first: string, second: string) {
  return notDuplicateFn({ data: { first, second } })
}
/** Keeps one listing and merges the other into it. */
export function mergeDuplicateListings(keepId: string, mergeId: string) {
  return mergeFn({ data: { keepId, mergeId } })
}
