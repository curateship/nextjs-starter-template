import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import {
  PROMOTION_REQUEST_STATUSES,
  type PromotionRequestStatus,
} from "@/lib/promotions/request-status"
import { adminGet, adminPost } from "@/server/guards"
import {
  decidePromotionRequest,
  listPromotionRequests,
  pendingPromotionRequestCount,
  type PromotionRequest,
} from "@/server/promotions/owner-requests"
import { workspaceIdForRequest } from "@/server/workspaces/for-request"

import { getListingErrorMessage } from "../directory/listings"

export type { PromotionRequest }

/**
 * The admin's queue of deals and changes from listing owners. Admin-only, and
 * always the site the admin has open, read on the server.
 */
export const getPromotionRequestErrorMessage = getListingErrorMessage


export type PromotionRequestsPage = {
  requests: PromotionRequest[]
  total: number
  page: number
  pageSize: number
  /** How many are waiting, for the Pending tab. */
  waiting: number
}

const loadPageFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(
    z.object({
      // "all" is every status; none is the pending ones, as the queue opens.
      status: z.enum([...PROMOTION_REQUEST_STATUSES, "all"]).optional(),
      search: z.string().max(120).optional(),
      page: z.number().int().min(1).max(10_000).optional(),
      limit: z.number().int().min(1).max(200).optional(),
    })
  )
  .handler(async ({ data, context }): Promise<PromotionRequestsPage> => {
    const site = await workspaceIdForRequest(context.user.id)
    const pageSize = data.limit ?? 50
    const page = data.page ?? 1
    const [{ requests, total }, waiting] = await Promise.all([
      listPromotionRequests(site, {
        status: data.status === "all" ? undefined : (data.status ?? "pending"),
        search: data.search,
        limit: pageSize,
        offset: (page - 1) * pageSize,
      }),
      pendingPromotionRequestCount(site),
    ])
    return { requests, total, page, pageSize, waiting }
  })

export function loadPromotionRequestsPage(input: {
  status?: PromotionRequestStatus | "all"
  search?: string
  page?: number
  limit?: number
}) {
  return loadPageFn({ data: input })
}

const decideFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.object({
      id: z.string().min(1).max(36),
      decision: z.enum(["approve", "reject"]),
      note: z.string().max(500).optional(),
    })
  )
  .handler(async ({ data, context }) =>
    decidePromotionRequest(await workspaceIdForRequest(context.user.id), data.id, {
      decision: data.decision,
      note: data.note,
      reviewerId: context.user.id,
    })
  )

/** Approve, which publishes the deal or swaps the change in, or reject with a note. */
export function decidePromotionRequestFor(input: {
  id: string
  decision: "approve" | "reject"
  note?: string
}) {
  return decideFn({ data: input })
}
