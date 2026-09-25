import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import type { ListingHours } from "@/lib/directory/listing-details"
import { tellAdminsAboutDealRequest } from "@/server/directory/notify"
import { userGet, userPost } from "@/server/guards"
import {
  MAX_PROMOTION_CODE,
  MAX_PROMOTION_DESCRIPTION,
  MAX_PROMOTION_SMALL_PRINT,
  MAX_PROMOTION_TITLE,
} from "@/server/promotions/promotions"
import {
  endOwnerDeal,
  ownerDealsFor,
  ownerListingHours,
  sendOwnerDeal,
  sendOwnerDealChange,
  type OwnerDeal,
  type OwnerDealContent,
  type OwnerDeals,
  type OwnerSendOutcome,
} from "@/server/promotions/owner-requests"

import { getClaimErrorMessage } from "../directory/claims"

export type { OwnerDeal, OwnerDealContent, OwnerDeals }

/**
 * A listing owner's doors for their own deals, on My listings. Every one needs
 * a signed-in account, and each checks on the server that the account looks
 * after the listing, so an id sent by hand for somebody else's gets nowhere.
 * Refusals come back as words for the owner rather than as failures.
 */
export const getOwnerDealErrorMessage = getClaimErrorMessage

type Sent = { sent: true } | { sent: false; problem: string }

/** The same boxes as the admin's window; the server checks them in words. */
const contentInput = z.object({
  title: z.string().max(MAX_PROMOTION_TITLE + 1),
  description: z.string().max(MAX_PROMOTION_DESCRIPTION + 1),
  coverImage: z.string().max(600),
  code: z.string().max(MAX_PROMOTION_CODE + 1),
  smallPrint: z.string().max(MAX_PROMOTION_SMALL_PRINT + 1),
  dealType: z.string().max(20),
  amount: z.string().max(20),
  headline: z.string().max(100),
  startDate: z.string().max(10),
  endDate: z.string().max(10).nullable(),
  times: z.unknown().optional(),
  takesClaims: z.boolean().optional(),
  // Read by the server in words, so a little longer than any real number.
  claimLimit: z.string().max(20).optional(),
})

type OwnerDealInput = z.infer<typeof contentInput>

async function answer(result: OwnerSendOutcome, kind: "new" | "change"): Promise<Sent> {
  if (result.outcome === "refused") return { sent: false, problem: result.problem }
  await tellAdminsAboutDealRequest(
    result.workspaceId,
    result.title,
    result.listingTitle,
    kind
  )
  return { sent: true }
}

const sendDealFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(contentInput.extend({ claimId: z.string().min(1).max(36) }))
  .handler(async ({ data, context }): Promise<Sent> => {
    const { claimId, ...input } = data
    return answer(await sendOwnerDeal(context.user.id, claimId, input), "new")
  })

/** A new deal at the owner's listing, into the admin's queue. */
export function sendDealForMyListing(input: OwnerDealInput & { claimId: string }) {
  return sendDealFn({ data: input })
}

const sendChangeFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(contentInput.extend({ promotionId: z.string().min(1).max(36) }))
  .handler(async ({ data, context }): Promise<Sent> => {
    const { promotionId, ...input } = data
    return answer(
      await sendOwnerDealChange(context.user.id, promotionId, input),
      "change"
    )
  })

/** New wording for one of the owner's live deals, into the admin's queue. */
export function sendChangeToMyDeal(
  input: OwnerDealInput & { promotionId: string }
) {
  return sendChangeFn({ data: input })
}

const endDealFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ promotionId: z.string().min(1).max(36) }))
  .handler(async ({ data, context }) =>
    endOwnerDeal(context.user.id, data.promotionId)
  )

/** "End now": the deal is over at once, with no review. */
export function endMyDeal(promotionId: string) {
  return endDealFn({ data: { promotionId } })
}

const loadDealsFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(async ({ context }): Promise<OwnerDeals> =>
    ownerDealsFor(context.user.id)
  )

/** The deals this account sent, by listing, and whether each site takes deals. */
export function loadMyListingDeals() {
  return loadDealsFn()
}

const loadHoursFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(z.object({ claimId: z.string().min(1).max(36) }))
  .handler(async ({ data, context }): Promise<ListingHours | null> =>
    ownerListingHours(context.user.id, data.claimId)
  )

/** The owner's listing's opening hours, for "Same as the listing's hours". */
export function loadMyListingHours(claimId: string) {
  return loadHoursFn({ data: { claimId } })
}
