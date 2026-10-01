import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import {
  SIGN_UP_EMAIL_MAX,
  SIGN_UP_NAME_MAX,
} from "@/lib/events/sign-up-fields"
import { claimPageUrl, readScannedCode } from "@/lib/promotions/claim-code"
import { requestIp, requireAppOrigin } from "@/server/auth/origin"
import {
  clearRateLimit,
  enforceRateLimit,
  RateLimitError,
} from "@/server/auth/rate-limit"
import { findCurrentUser, isAdmin } from "@/server/auth/security"
import { sendDirectoryEmail } from "@/server/directory/mail"
import { visitorSite } from "@/server/directory/public"
import { adminPost, userGet, userPost } from "@/server/guards"
import {
  claimDeal,
  listClaims,
  markCodeUsed,
  readClaimPass,
  readCodeAtCounter,
  removeClaim,
  type ClaimOutcome,
  type CodeAtCounter,
  type DealClaim,
} from "@/server/promotions/claims"
import {
  ownerDealClaims,
  ownersDealSite,
} from "@/server/promotions/owner-requests"
import { dealsAccessFor } from "@/server/promotions/public"
import {
  findWorkspaceIdForRequest,
  workspaceIdForRequest,
} from "@/server/workspaces/for-request"

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
        "Open the page below at the counter. It has your code and a QR for them to scan, and it says so once the code has been used.",
      ],
      action: {
        label: "Show it at the counter",
        url: claimPageUrl(siteUrl, claimed.code),
      },
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

/**
 * Using a code at the counter.
 *
 * Three answers, and the screens choose the words: the code is good to use,
 * it has been used already and here is when, or it is not a code anybody at
 * this counter can use. The two doors that work on a code are told which deal
 * the screen is on, and they check that the person signed in may work on that
 * deal before they look the code up at all.
 */

/** What a code turned out to be. The screens word each one. */
export type CounterState =
  /** Claimed, not used yet. */
  | "good"
  /** Used already. `claim.usedAt` says when. */
  | "used"
  /** The claim was taken away, so the code is nobody's. */
  | "cancelled"
  /** A real code on this site, but for a different deal. */
  | "other"
  /** No code like that here. */
  | "unknown"

/** One claim as a counter screen shows it. */
export type CounterClaimRow = {
  name: string
  email: string
  code: string
  usedAt: Date | null
}

export type CounterAnswer = {
  state: CounterState
  /** Null unless the code belongs to the deal the screen is on. */
  claim: CounterClaimRow | null
  /** The deal's claims as they are now, after a code was marked used. */
  claims: DealClaim[] | null
  /**
   * This call is what marked it used. Without it the screen cannot tell the
   * press of the button apart from a code somebody else used an hour ago,
   * and both would read "Already used".
   */
  justUsed: boolean
}

/**
 * The site this person may use a code on for this deal, or null.
 *
 * An admin works on the site they are in, and every read below is scoped to
 * it, so an id from another site is simply not found. An owner is tied to the
 * one deal: `ownersDealSite` answers only while the deal is theirs and they
 * still look after its listing.
 */
async function counterSiteFor(
  user: { id: string; role: string },
  promotionId: string
): Promise<string | null> {
  return isAdmin(user)
    ? findWorkspaceIdForRequest(user.id)
    : ownersDealSite(user.id, promotionId)
}

/** The found code as one of the five answers, for one deal's screen. */
function counterAnswer(
  found: CodeAtCounter | null,
  promotionId: string,
  claims: DealClaim[] | null = null,
  justUsed = false
): CounterAnswer {
  if (!found) return nothingFound
  if (found.deal.id !== promotionId) {
    return { ...nothingFound, state: "other" }
  }
  const claim = {
    name: found.claim.name,
    email: found.claim.email,
    code: found.claim.code,
    usedAt: found.claim.usedAt,
  }
  const state: CounterState = found.claim.cancelled
    ? "cancelled"
    : found.claim.usedAt
      ? "used"
      : "good"
  return { state, claim, claims, justUsed }
}

/** No code like that, which is also the answer when nothing can be read. */
const nothingFound: CounterAnswer = {
  state: "unknown",
  claim: null,
  claims: null,
  justUsed: false,
}

const codeInput = z.object({
  promotionId: z.string().min(1).max(36),
  /** A typed code, or the whole address a phone camera handed over. */
  scanned: z.string().max(500),
})

const readCodeFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(codeInput)
  .handler(async ({ data, context }): Promise<CounterAnswer> => {
    const site = await counterSiteFor(context.user, data.promotionId)
    const code = readScannedCode(data.scanned)
    if (!site || !code) return nothingFound
    return counterAnswer(await readCodeAtCounter(site, code), data.promotionId)
  })

/** What one code is, without changing anything. */
export function checkCodeAtCounter(input: {
  promotionId: string
  scanned: string
}) {
  return readCodeFn({ data: input })
}

const markUsedFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(codeInput)
  .handler(async ({ data, context }): Promise<CounterAnswer> => {
    const site = await counterSiteFor(context.user, data.promotionId)
    const code = readScannedCode(data.scanned)
    if (!site || !code) return nothingFound
    // The code is looked at first, so a code for another deal is refused
    // rather than quietly marked used on the deal the screen happens to be on.
    const before = await readCodeAtCounter(site, code)
    if (!before || before.deal.id !== data.promotionId) {
      return counterAnswer(before, data.promotionId)
    }
    const { done, found } = await markCodeUsed(site, code, context.user.id)
    return counterAnswer(
      found,
      data.promotionId,
      await listClaims(site, data.promotionId),
      done
    )
  })

/**
 * Marks one code used. A code already used comes back as "used" with the time
 * it was first used, never the time of this attempt.
 */
export function markCodeUsedAtCounter(input: {
  promotionId: string
  scanned: string
}) {
  return markUsedFn({ data: input })
}

/** The page a customer shows at the counter, found by the code alone. */
export type ClaimPass = {
  code: string
  /** The person who claimed it, so the counter can see whose it is. */
  name: string
  claimedAt: Date
  usedAt: Date | null
  deal: {
    id: string
    title: string
    headline: string
    slug: string
    listingTitle: string
    listingAddress: string
    ended: boolean
  }
  /** The address the QR holds, which is this page. */
  url: string
  /** This reader may mark it used: the listing's owner or a site admin. */
  canUse: boolean
}

/** Wrong codes an address may try in an hour before it is turned away. */
const CODE_TRIES_PER_HOUR = 30

const claimPassFn = createServerFn({ method: "GET" })
  .inputValidator(z.object({ code: z.string().max(40) }))
  .handler(async ({ data }): Promise<ClaimPass | null> => {
    const site = await visitorSite()
    const signedIn = async () =>
      Boolean(await findCurrentUser().catch(() => null))
    if (!site || !(await dealsAccessFor(site.id, signedIn))) return null
    const code = readScannedCode(data.code)
    if (!code) return null

    // Thirty tries an hour from one address, cleared by every code that turns
    // out to be real, so a counter working through a queue of customers never
    // meets it while somebody typing codes at random meets it in a minute.
    //
    // What stops a code being found by guessing is its length, not this: eight
    // characters out of 850 billion. The limit is here to make scraping
    // pointless and noisy, and it is deliberately the kind a visitor holding
    // one real code can reset, because that visitor is the counter.
    const bucket = `deal-code:${site.id}:${requestIp()}`
    try {
      await enforceRateLimit(bucket, {
        maxAttempts: CODE_TRIES_PER_HOUR,
        windowSeconds: 60 * 60,
      })
    } catch (error) {
      if (error instanceof RateLimitError) return null
      throw error
    }
    const found = await readClaimPass(site.id, code)
    if (!found) return null
    await clearRateLimit(bucket)

    const user = await findCurrentUser().catch(() => null)
    const canUse = user
      ? (await counterSiteFor(user, found.deal.id)) === site.id
      : false
    return {
      code: found.claim.code,
      name: found.claim.name,
      claimedAt: found.claim.createdAt,
      usedAt: found.claim.usedAt,
      deal: found.deal,
      url: claimPageUrl(site.url, found.claim.code),
      canUse,
    }
  })

/**
 * One claim's page by its code, or null. Open to anybody, because the person
 * holding the code has no account and the counter reads the same page over
 * their shoulder.
 */
export function loadClaimPass(code: string) {
  return claimPassFn({ data: { code } })
}
