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
  .handler(async ({ context }) => {
    const site = await workspaceIdForRequest(context.user.id)
    const [listings, history] = await Promise.all([
      outreachListings(site),
      outreachHistory(site),
    ])
    return { listings, history }
  })

export function loadOutreach() {
  return loadOutreachFn()
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
