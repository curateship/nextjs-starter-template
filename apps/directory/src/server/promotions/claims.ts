import { randomInt } from "node:crypto"

import { and, asc, count, eq, isNull, type SQL } from "drizzle-orm"

import { cleanListingHours } from "@/lib/directory/listing-details"
import {
  cleanSignUpName,
  SIGN_UP_EMAIL_MAX,
  signUpProblem,
} from "@/lib/events/sign-up-fields"
import { wallClockAt } from "@/lib/events/event-time"
import {
  CLAIM_CODE_LETTERS,
  formatClaimCode,
} from "@/lib/promotions/claim-code"
import { CLAIMS_PER_HOUR } from "@/lib/promotions/claim-fields"
import { dealStage } from "@/lib/promotions/deal-times"
import { enforceRateLimit, RateLimitError } from "@/server/auth/rate-limit"
import { uuid } from "@/server/auth/security"
import { db, type CustomShellDb } from "@/server/db"
import { directoryListings } from "@/server/directory/schema"
import { siteTimeZone } from "@/server/directory/settings"
import {
  listingOfPromotion,
  promotionClaims,
  sitePromotions,
} from "@/server/promotions/schema"

/**
 * Claiming a deal: a name and an email, no account, and an optional limit on
 * how many people can.
 *
 * - **Everyone gets their own short code**, shown once on the page and sent by
 *   email, so a code can't be screenshotted and shared, and a later task can
 *   mark each one used at the counter.
 * - **Places are counted under a lock.** A claim locks the deal's row before
 *   it counts, so ten people racing for the last place are taken one after
 *   the other and exactly one gets it. The same lock as event sign-ups.
 * - **One live claim per email per deal**, which the database also enforces.
 *   Claiming again sends the same code to that email again and never shows it
 *   on the page, so typing somebody else's email gets nobody their code.
 * - **Claims close when the deal is over**, by the site's clock. A deal that
 *   has not started yet can already be claimed.
 * - **Removing someone** marks their claim cancelled, which frees the place.
 *   A code already used at the counter can no longer be removed.
 * - **Using a code at the counter** writes the moment it happened on the
 *   claim. See the counter section at the foot of this file.
 *
 * Every read and write takes the site first.
 */

/** What the deal page's claim box shows. Counts only, never names. */
export type ClaimBox = {
  /** How many can claim it, or null for no limit. */
  limit: number | null
  /** Places still free, or null for no limit. */
  left: number | null
  full: boolean
  /** The deal is over, so nobody new can claim it. */
  closed: boolean
}

/** Holds a place. A cancelled claim is a record, not a place. */
const holdsPlace = eq(promotionClaims.status, "claimed")

/** A visitor can see this deal: published, at a published listing, on this site. */
function visibleDeal(siteId: string, promotionId: string) {
  return and(
    eq(sitePromotions.id, promotionId),
    eq(sitePromotions.workspaceId, siteId),
    eq(sitePromotions.status, "published"),
    eq(directoryListings.status, "published")
  )
}

async function placesTaken(
  promotionId: string,
  database: CustomShellDb
): Promise<number> {
  const [row] = await database
    .select({ taken: count() })
    .from(promotionClaims)
    .where(and(eq(promotionClaims.promotionId, promotionId), holdsPlace))
  return row?.taken ?? 0
}

/**
 * A deal's claim box, or null when it takes no claims. Read on every visit,
 * after the page cache, so the places left are never stale.
 */
export async function claimBoxFor(
  siteId: string,
  promotionId: string,
  now: string,
  database: CustomShellDb = db
): Promise<ClaimBox | null> {
  const [deal] = await database
    .select({
      takesClaims: sitePromotions.takesClaims,
      claimLimit: sitePromotions.claimLimit,
      startDate: sitePromotions.startDate,
      endDate: sitePromotions.endDate,
      times: sitePromotions.times,
      endedAt: sitePromotions.endedAt,
    })
    .from(sitePromotions)
    .innerJoin(directoryListings, listingOfPromotion)
    .where(visibleDeal(siteId, promotionId))
    .limit(1)
  if (!deal?.takesClaims) return null
  const taken = await placesTaken(promotionId, database)
  const left =
    deal.claimLimit === null ? null : Math.max(0, deal.claimLimit - taken)
  return {
    limit: deal.claimLimit,
    left,
    full: left === 0,
    closed:
      dealStage({ ...deal, times: cleanListingHours(deal.times) }, now) ===
      "ended",
  }
}

/**
 * "K7QX-P2MD": eight characters from the alphabet in
 * `lib/promotions/claim-code.ts`, which is 850 billion of them, so a code
 * cannot be guessed at a counter or in a URL. The shape and the letters live
 * in that file because the counter screen reads them back in the browser.
 */
export function newClaimCode(): string {
  const letters = Array.from(
    { length: 8 },
    () => CLAIM_CODE_LETTERS[randomInt(CLAIM_CODE_LETTERS.length)]
  ).join("")
  return formatClaimCode(letters)
}

/** The listing's street address out of its contact links, or "". */
function listingAddressOf(contactLinks: unknown): string {
  const address =
    contactLinks && typeof contactLinks === "object"
      ? (contactLinks as { address?: unknown }).address
      : undefined
  return typeof address === "string" ? address.trim() : ""
}

export const CLAIMS_CLOSED = "Claims have closed. This deal is over."
export const ALL_CLAIMED = "Sorry, this deal is all claimed."
const NOT_TAKING = "This deal is not taking claims."

/** The deal, for the email: what it is and where. */
type ClaimedDeal = {
  title: string
  headline: string
  listingTitle: string
  listingAddress: string
}

export type ClaimOutcome =
  | { outcome: "claimed"; code: string; deal: ClaimedDeal; email: string; name: string }
  /** The email already has a live claim: its code goes to that email again. */
  | { outcome: "again"; code: string; deal: ClaimedDeal; email: string; name: string }
  | { outcome: "refused"; problem: string }

/**
 * One visitor claiming, in this order: the name and email are checked, then
 * the hourly limit is counted, then the place is taken. A typo costs nothing,
 * and the limit is counted before the deal is looked up, so the box is not an
 * unmetered way to ask whether an id is a deal here.
 */
export async function claimDeal(
  siteId: string,
  promotionId: string,
  input: { name: string; email: string },
  context: { ip: string; at?: Date },
  database: CustomShellDb = db
): Promise<ClaimOutcome> {
  const problem = signUpProblem(input)
  if (problem) return { outcome: "refused", problem }

  try {
    await enforceRateLimit(
      `promotion-claim:${siteId}:${context.ip}`,
      { maxAttempts: CLAIMS_PER_HOUR, windowSeconds: 60 * 60 },
      database
    )
  } catch (error) {
    if (error instanceof RateLimitError) {
      return {
        outcome: "refused",
        problem: `You have claimed ${CLAIMS_PER_HOUR} deals in the last hour, which is as many as this site takes. Please try again in an hour.`,
      }
    }
    throw error
  }

  const name = cleanSignUpName(input.name)
  const email = input.email.trim().toLowerCase().slice(0, SIGN_UP_EMAIL_MAX)
  const at = context.at ?? new Date()
  const now = wallClockAt(await siteTimeZone(siteId, database), at)

  return database.transaction(async (tx) => {
    // The lock: a second claim on this deal waits here until the first has
    // counted and written, so its count includes the first one's place.
    const [deal] = await tx
      .select({
        takesClaims: sitePromotions.takesClaims,
        claimLimit: sitePromotions.claimLimit,
        startDate: sitePromotions.startDate,
        endDate: sitePromotions.endDate,
        times: sitePromotions.times,
        endedAt: sitePromotions.endedAt,
        title: sitePromotions.title,
        headline: sitePromotions.headline,
        listingTitle: directoryListings.title,
        contactLinks: directoryListings.contactLinks,
      })
      .from(sitePromotions)
      .innerJoin(directoryListings, listingOfPromotion)
      .where(visibleDeal(siteId, promotionId))
      .for("update", { of: sitePromotions })
    if (!deal?.takesClaims) {
      return { outcome: "refused" as const, problem: NOT_TAKING }
    }
    const stage = dealStage(
      { ...deal, times: cleanListingHours(deal.times) },
      now
    )
    if (stage === "ended") {
      return { outcome: "refused" as const, problem: CLAIMS_CLOSED }
    }
    const claimed: ClaimedDeal = {
      title: deal.title,
      headline: deal.headline,
      listingTitle: deal.listingTitle,
      listingAddress: listingAddressOf(deal.contactLinks),
    }

    const [already] = await tx
      .select({ code: promotionClaims.code })
      .from(promotionClaims)
      .where(
        and(
          eq(promotionClaims.promotionId, promotionId),
          eq(promotionClaims.email, email),
          holdsPlace
        )
      )
      .limit(1)
    if (already) {
      return { outcome: "again" as const, code: already.code, deal: claimed, email, name }
    }

    if (
      deal.claimLimit !== null &&
      (await placesTaken(promotionId, tx)) >= deal.claimLimit
    ) {
      return { outcome: "refused" as const, problem: ALL_CLAIMED }
    }

    // A clash with another code on this site is one in 850 billion; a second
    // draw is the whole answer. The site, not the deal, because the counter
    // page is found by the code alone.
    let code = newClaimCode()
    const [clash] = await tx
      .select({ id: promotionClaims.id })
      .from(promotionClaims)
      .where(
        and(
          eq(promotionClaims.workspaceId, siteId),
          eq(promotionClaims.code, code)
        )
      )
      .limit(1)
    if (clash) code = newClaimCode()

    await tx.insert(promotionClaims).values({
      id: uuid(),
      workspaceId: siteId,
      promotionId,
      name,
      email,
      code,
      createdAt: at,
    })
    return { outcome: "claimed" as const, code, deal: claimed, email, name }
  })
}

/** A person who claimed a deal, for the admin's and the owner's windows. */
export type DealClaim = {
  id: string
  name: string
  email: string
  code: string
  createdAt: Date
  /** When their code was used at the counter, or null. */
  usedAt: Date | null
}

/** Who claimed one deal, first to claim first. */
export async function listClaims(
  workspaceId: string,
  promotionId: string,
  database: CustomShellDb = db
): Promise<DealClaim[]> {
  return database
    .select({
      id: promotionClaims.id,
      name: promotionClaims.name,
      email: promotionClaims.email,
      code: promotionClaims.code,
      createdAt: promotionClaims.createdAt,
      usedAt: promotionClaims.usedAt,
    })
    .from(promotionClaims)
    .where(
      and(
        eq(promotionClaims.workspaceId, workspaceId),
        eq(promotionClaims.promotionId, promotionId),
        holdsPlace
      )
    )
    .orderBy(asc(promotionClaims.createdAt), asc(promotionClaims.id))
}

/** Takes somebody's claim away, which frees their place. */
export async function removeClaim(
  workspaceId: string,
  claimId: string,
  database: CustomShellDb = db
): Promise<void> {
  const removed = await database
    .update(promotionClaims)
    .set({ status: "cancelled", cancelledAt: new Date() })
    .where(
      and(
        eq(promotionClaims.id, claimId),
        eq(promotionClaims.workspaceId, workspaceId),
        holdsPlace,
        isNull(promotionClaims.usedAt)
      )
    )
    .returning({ id: promotionClaims.id })
  if (removed.length) return
  // Which of the two it is, so the admin is told the reason rather than being
  // left to guess at a button that did nothing.
  const [used] = await database
    .select({ usedAt: promotionClaims.usedAt })
    .from(promotionClaims)
    .where(
      and(
        eq(promotionClaims.id, claimId),
        eq(promotionClaims.workspaceId, workspaceId)
      )
    )
    .limit(1)
  throw new Error(
    used?.usedAt
      ? "That code has been used at the counter, so the claim stays on the list."
      : "That claim is no longer on the list."
  )
}

/**
 * Using a code at the counter.
 *
 * A code is unique across the site, so the page a customer shows is found by
 * the code alone and nothing else has to be in the link. The listing's owner
 * or a site admin marks it used, and from then on every reader of that code
 * is told when it was used, which is what makes "one per customer" hold when
 * somebody passes a screenshot round.
 */

/** The deal a code belongs to, as the counter and the code page print it. */
export type CounterDeal = {
  id: string
  title: string
  headline: string
  slug: string
  listingTitle: string
  listingAddress: string
  /** Over by the site's clock, so the counter is told before it honours it. */
  ended: boolean
}

/** One claim as the counter reads it. */
export type CounterClaim = {
  id: string
  name: string
  email: string
  code: string
  createdAt: Date
  /** When it was used, or null while it is still good to use. */
  usedAt: Date | null
  /** The claim was taken away, so the code is no longer anybody's. */
  cancelled: boolean
}

export type CodeAtCounter = { deal: CounterDeal; claim: CounterClaim }

/**
 * One code on this site, with its deal. `only` narrows which deals count: the
 * counter reads every deal on the site, and the public code page reads only a
 * published deal at a published listing.
 */
async function codeOnSite(
  siteId: string,
  code: string,
  only: SQL | undefined,
  database: CustomShellDb
): Promise<CodeAtCounter | null> {
  const [row] = await database
    .select({
      id: promotionClaims.id,
      name: promotionClaims.name,
      email: promotionClaims.email,
      code: promotionClaims.code,
      createdAt: promotionClaims.createdAt,
      usedAt: promotionClaims.usedAt,
      status: promotionClaims.status,
      dealId: sitePromotions.id,
      title: sitePromotions.title,
      headline: sitePromotions.headline,
      slug: sitePromotions.slug,
      startDate: sitePromotions.startDate,
      endDate: sitePromotions.endDate,
      times: sitePromotions.times,
      endedAt: sitePromotions.endedAt,
      listingTitle: directoryListings.title,
      contactLinks: directoryListings.contactLinks,
    })
    .from(promotionClaims)
    .innerJoin(
      sitePromotions,
      eq(sitePromotions.id, promotionClaims.promotionId)
    )
    .innerJoin(directoryListings, listingOfPromotion)
    .where(
      and(
        eq(promotionClaims.workspaceId, siteId),
        eq(promotionClaims.code, code),
        only
      )
    )
    .limit(1)
  if (!row) return null
  const now = wallClockAt(await siteTimeZone(siteId, database), new Date())
  return {
    deal: {
      id: row.dealId,
      title: row.title,
      headline: row.headline,
      slug: row.slug,
      listingTitle: row.listingTitle,
      listingAddress: listingAddressOf(row.contactLinks),
      ended:
        dealStage({ ...row, times: cleanListingHours(row.times) }, now) ===
        "ended",
    },
    claim: {
      id: row.id,
      name: row.name,
      email: row.email,
      code: row.code,
      createdAt: row.createdAt,
      usedAt: row.usedAt,
      cancelled: row.status === "cancelled",
    },
  }
}

/**
 * One code for the owner's or the admin's counter screen, on their own site.
 * Every deal on the site counts, including one whose listing has since gone
 * back to a draft: a customer standing at the counter still claimed it.
 */
export function readCodeAtCounter(
  siteId: string,
  code: string,
  database: CustomShellDb = db
): Promise<CodeAtCounter | null> {
  return codeOnSite(siteId, code, undefined, database)
}

/**
 * One code for the page the customer shows, which anybody holding the code
 * may open. Only a published deal at a published listing, the same rule as
 * every other public read of a deal.
 */
export function readClaimPass(
  siteId: string,
  code: string,
  database: CustomShellDb = db
): Promise<CodeAtCounter | null> {
  return codeOnSite(
    siteId,
    code,
    and(
      eq(sitePromotions.status, "published"),
      eq(directoryListings.status, "published")
    ),
    database
  )
}

/**
 * Marks a code used, once. The write is the test: two phones marking the same
 * code at the same moment both run this, and only the one that finds
 * `used_at` still empty changes anything, so the second is told the time the
 * first wrote rather than overwriting it.
 *
 * A cancelled claim's code is never usable, which the `holdsPlace` condition
 * does, and `found` then says the claim was taken away.
 */
export async function markCodeUsed(
  siteId: string,
  code: string,
  userId: string,
  at: Date = new Date(),
  database: CustomShellDb = db
): Promise<{ done: boolean; found: CodeAtCounter | null }> {
  const marked = await database
    .update(promotionClaims)
    .set({ usedAt: at, usedByUserId: userId })
    .where(
      and(
        eq(promotionClaims.workspaceId, siteId),
        eq(promotionClaims.code, code),
        holdsPlace,
        isNull(promotionClaims.usedAt)
      )
    )
    .returning({ id: promotionClaims.id })
  return {
    done: marked.length > 0,
    found: await readCodeAtCounter(siteId, code, database),
  }
}
