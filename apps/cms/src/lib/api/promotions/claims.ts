import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import {
  SIGN_UP_EMAIL_MAX,
  SIGN_UP_NAME_MAX,
} from "@/lib/events/sign-up-fields"
import { requestIp, requireAppOrigin } from "@/server/auth/origin"
import { findCurrentUser } from "@/server/auth/security"
import { sendDirectoryEmail } from "@/server/directory/mail"
import { visitorSite } from "@/server/directory/public"
import { adminPost, userGet } from "@/server/guards"
import {
  claimDeal,
  listClaims,
  removeClaim,
  type ClaimOutcome,
  type DealClaim,
} from "@/server/promotions/claims"
import { ownerDealClaims } from "@/server/promotions/owner-requests"
import { dealsAccessFor } from "@/server/promotions/public"
import { workspaceIdForRequest } from "@/server/workspaces/for-request"

import { createErrorMessage } from "../error-message"

export type { DealClaim }

/**
 * The deal page's claim box, and the admin's and owner's "Who claimed" doors.
 *
 * The public one is open to anybody, which is the feature, and is written down
 * in `src/app/open-endpoints.ts`. It checks for itself rather than trusting the
 * page: the site comes from the address, the Deals page's switch is read, and
 * the request must come from this app's own pages.
 */

/** The fallback when something unexpected fails, never the server's words. */
export const getClaimErrorMessage = createErrorMessage(
  {},
  "That did not go through. Please try again."
)

export type ClaimAnswer =
  /** `code` is shown once, on a first claim only. `emailed` says whether it went out. */
  | { done: true; code: string | null; emailed: boolean }
  | { done: false; problem: string }

/**
 * The code by email. Its failure is caught: the claim stands either way, and
 * the page says whether the email went, so a first claim's code can be kept
 * from the screen instead.
 */
async function emailCode(
  siteId: string,
  siteUrl: string,
  claimed: Exclude<ClaimOutcome, { outcome: "refused" }>
): Promise<boolean> {
  const { deal } = claimed
  try {
    const sent = await sendDirectoryEmail({
      workspaceId: siteId,
      to: claimed.email,
      subject: `Your code for ${deal.title}`,
      lines: [
        `Hi ${claimed.name}, here is your code for ${deal.title}: ${claimed.code}`,
        `${deal.headline ? `${deal.headline} at ` : "At "}${deal.listingTitle}${
          deal.listingAddress ? `, ${deal.listingAddress}` : ""
        }.`,
        "Show this code when you use the deal. It is yours alone.",
      ],
      action: { label: "See the deal", url: `${siteUrl}/deals/${deal.slug}` },
    })
    return sent.delivered
  } catch {
    return false
  }
}

const claimFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      promotionId: z.string().min(1).max(36),
      // A little over each column, so a long answer is cut rather than
      // refused with a message about a schema.
      name: z.string().max(SIGN_UP_NAME_MAX * 2),
      email: z.string().max(SIGN_UP_EMAIL_MAX * 2),
      trap: z.string().max(500),
    })
  )
  .handler(async ({ data }): Promise<ClaimAnswer> => {
    // No guard can say "anybody, but only from our own pages", so this is the
    // same check every guarded POST runs.
    requireAppOrigin()

    const site = await visitorSite()
    const open =
      site &&
      (await dealsAccessFor(site.id, async () =>
        Boolean(await findCurrentUser().catch(() => null))
      ))
    if (!site || !open) {
      return { done: false, problem: "This deal is not taking claims." }
    }
    // A bot is told it worked, so it learns nothing, and nothing is kept.
    if (data.trap.trim()) return { done: true, code: null, emailed: true }

    const result = await claimDeal(
      site.id,
      data.promotionId,
      { name: data.name, email: data.email },
      { ip: requestIp() }
    )
    if (result.outcome === "refused") {
      return { done: false, problem: result.problem }
    }
    const emailed = await emailCode(site.id, site.url, result)
    // A second claim with the same email never shows a code: whoever typed
    // it may not be the person the email belongs to.
    return {
      done: true,
      code: result.outcome === "claimed" ? result.code : null,
      emailed,
    }
  })

/**
 * Claims a deal for a visitor. A refusal comes back as words for them, like
 * "Sorry, this deal is all claimed."
 */
export function claimTheDeal(input: {
  promotionId: string
  name: string
  email: string
  trap: string
}) {
  return claimFn({ data: input })
}

const removeFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.object({
      promotionId: z.string().min(1).max(36),
      claimId: z.string().min(1).max(36),
    })
  )
  .handler(async ({ data, context }): Promise<DealClaim[]> => {
    const site = await workspaceIdForRequest(context.user.id)
    await removeClaim(site, data.claimId)
    return listClaims(site, data.promotionId)
  })

/** Takes somebody's claim away and answers with the list as it is now. */
export function removeDealClaim(input: { promotionId: string; claimId: string }) {
  return removeFn({ data: input })
}

const ownerListFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(z.object({ promotionId: z.string().min(1).max(36) }))
  .handler(async ({ data, context }): Promise<DealClaim[]> => {
    const claims = await ownerDealClaims(context.user.id, data.promotionId)
    if (!claims) throw new Error("That deal is not one of yours.")
    return claims
  })

/** Who claimed one of the owner's own deals, for My listings. */
export function loadMyDealClaims(promotionId: string) {
  return ownerListFn({ data: { promotionId } })
}
