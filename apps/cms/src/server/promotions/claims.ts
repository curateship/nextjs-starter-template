import { randomInt } from "node:crypto"

import { and, asc, count, eq } from "drizzle-orm"

import { cleanListingHours } from "@/lib/directory/listing-details"
import {
  cleanSignUpName,
  SIGN_UP_EMAIL_MAX,
  signUpProblem,
} from "@/lib/events/sign-up-fields"
import { wallClockAt } from "@/lib/events/event-time"
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

/** Letters and digits nobody misreads: no 0/O, 1/I/L. */
const CODE_LETTERS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"

/** "K7QX-P2MD": eight characters, about a trillion to one against a guess. */
export function newClaimCode(): string {
  const pick = () =>
    Array.from(
      { length: 4 },
      () => CODE_LETTERS[randomInt(CODE_LETTERS.length)]
    ).join("")
  return `${pick()}-${pick()}`
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
  slug: string
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
        slug: sitePromotions.slug,
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
    const address =
      deal.contactLinks && typeof deal.contactLinks === "object"
        ? (deal.contactLinks as { address?: unknown }).address
        : undefined
    const claimed: ClaimedDeal = {
      title: deal.title,
      headline: deal.headline,
      listingTitle: deal.listingTitle,
      listingAddress: typeof address === "string" ? address.trim() : "",
      slug: deal.slug,
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

    // A clash with another claim's code is one in a trillion; a second
    // draw is the whole answer.
    let code = newClaimCode()
    const [clash] = await tx
      .select({ id: promotionClaims.id })
      .from(promotionClaims)
      .where(
        and(
          eq(promotionClaims.promotionId, promotionId),
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
        holdsPlace
      )
    )
    .returning({ id: promotionClaims.id })
  if (!removed.length) throw new Error("That claim is no longer on the list.")
}
