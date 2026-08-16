import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { describeAuthError } from "@/lib/api/error-message"
import { enforceRateLimit } from "@/server/auth/rate-limit"
import {
  outreachHistory,
  outreachListings,
  sendClaimOutreach,
} from "@/server/directory/outreach"
import { adminGet, adminPost } from "@/server/guards"
import { workspaceIdForRequest } from "@/server/workspaces/for-request"

export function getOutreachErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : ""
  if (message.includes("ENCRYPTION_NOT_CONFIGURED")) {
    return "This server cannot make a safe unsubscribe link. Add its secret encryption key before sending."
  }
  if (message.includes("RATE_LIMITED")) {
    return "Too many invitations were requested. Wait a few minutes and try again."
  }
  return (
    describeAuthError(message) ??
    (message || "Claim outreach is unavailable right now. Please try again.")
  )
}

const loadOutreachFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(
    z.object({
      search: z.string().max(120).optional(),
      page: z.number().int().min(1).max(10_000).optional(),
      limit: z.number().int().min(1).max(200).optional(),
      historyPage: z.number().int().min(1).max(10_000).optional(),
    })
  )
  .handler(async ({ data, context }) => {
    const site = await workspaceIdForRequest(context.user.id)
    const pageSize = data.limit ?? 50
    const page = data.page ?? 1
    const historyPage = data.historyPage ?? 1

    // One search box drives both tables, so a term typed to find a business
    // finds what was already written to it as well as what has not been.
    const [ready, history] = await Promise.all([
      outreachListings(site, {
        search: data.search,
        limit: pageSize,
        offset: (page - 1) * pageSize,
      }),
      outreachHistory(site, {
        search: data.search,
        limit: pageSize,
        offset: (historyPage - 1) * pageSize,
      }),
    ])

    return {
      listings: ready.listings,
      total: ready.total,
      page,
      history: history.history,
      historyTotal: history.total,
      historyPage,
      pageSize,
    }
  })

export function loadOutreach(
  input: {
    search?: string
    page?: number
    limit?: number
    historyPage?: number
  } = {}
) {
  return loadOutreachFn({ data: input })
}

const sendOutreachFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.object({ listingIds: z.array(z.string().uuid()).min(1).max(50) })
  )
  .handler(async ({ data, context }) => {
    await enforceRateLimit(`directory-outreach:${context.user.id}`, {
      maxAttempts: 10,
      windowSeconds: 15 * 60,
    })
    return sendClaimOutreach(
      await workspaceIdForRequest(context.user.id),
      context.user.id,
      data.listingIds
    )
  })

export function sendOutreach(listingIds: string[]) {
  return sendOutreachFn({ data: { listingIds } })
}

export type {
  OutreachHistoryItem,
  OutreachListing,
  OutreachSendResult,
} from "@/server/directory/outreach"
