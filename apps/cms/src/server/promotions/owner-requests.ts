import { and, asc, desc, eq, ilike, inArray, or, sql } from "drizzle-orm"

import { cleanListingHours, type ListingHours } from "@/lib/directory/listing-details"
import { DEFAULT_SITE_TIME_ZONE, wallClockAt } from "@/lib/events/event-time"
import { dealStage } from "@/lib/promotions/deal-times"
import { enforceRateLimit, RateLimitError } from "@/server/auth/rate-limit"
import { now, uuid } from "@/server/auth/security"
import { readPageVisibility } from "@/server/content/pages"
import { db, type CustomShellDb } from "@/server/db"
import { clearPublicDirectoryCache } from "@/server/directory/public-cache"
import { directoryClaims, directoryListings } from "@/server/directory/schema"
import { sendDirectoryEmail } from "@/server/directory/mail"
import { siteTimeZone } from "@/server/directory/settings"
import { isOwnedImageUrl } from "@/server/media/library"
import { listClaims, type DealClaim } from "@/server/promotions/claims"
import {
  cleanDealContent,
  createPromotion,
  type DealContentInput,
} from "@/server/promotions/promotions"
import { promotionRequests, sitePromotions } from "@/server/promotions/schema"
import { customShellUsers } from "@/server/schema"

/**
 * Deals a listing's owner sends from My listings for their own place, the
 * changes they send to them, and "End now".
 *
 * Every new deal and every change waits in `promotion_requests` for an admin,
 * which Tyler chose on 24 Sep 2026; "End now" is the one thing that does not.
 * The listing always comes from the owner's approved claim, looked up by the
 * claim **and** the account, so an id from somebody else's claim is simply not
 * found. A deal can be changed or ended only by the account that sent it, and
 * only while that account still looks after the listing.
 */

/** How many deals and changes one owner may send in an hour. */
export const OWNER_DEALS_PER_HOUR = 20

export type OwnerSendOutcome =
  | {
      outcome: "sent"
      workspaceId: string
      listingTitle: string
      title: string
    }
  | { outcome: "refused"; problem: string }

/** The owner's approved claim on one listing, with the listing and the site. */
async function ownerClaim(
  userId: string,
  claim: { claimId: string } | { listingId: string },
  database: CustomShellDb
) {
  const [row] = await database
    .select({
      workspaceId: directoryClaims.workspaceId,
      listingId: directoryListings.id,
      listingTitle: directoryListings.title,
      hours: directoryListings.hours,
    })
    .from(directoryClaims)
    .innerJoin(
      directoryListings,
      and(
        eq(directoryListings.id, directoryClaims.listingId),
        eq(directoryListings.workspaceId, directoryClaims.workspaceId)
      )
    )
    .where(
      and(
        "claimId" in claim
          ? eq(directoryClaims.id, claim.claimId)
          : eq(directoryClaims.listingId, claim.listingId),
        eq(directoryClaims.userId, userId),
        eq(directoryClaims.status, "approved")
      )
    )
    .limit(1)
  return row ?? null
}

/** One of this owner's own live deals, while they still look after its listing. */
async function ownersDeal(
  userId: string,
  promotionId: string,
  database: CustomShellDb
) {
  const [deal] = await database
    .select()
    .from(sitePromotions)
    .where(
      and(
        eq(sitePromotions.id, promotionId),
        eq(sitePromotions.ownerUserId, userId)
      )
    )
    .limit(1)
  if (!deal) return null
  const claim = await ownerClaim(userId, { listingId: deal.listingId }, database)
  return claim && claim.workspaceId === deal.workspaceId ? { deal, claim } : null
}

/** The refusals every owner send shares: the switch, the words, the photo, the limit. */
async function checkOwnerSend(
  userId: string,
  workspaceId: string,
  input: DealContentInput,
  keepCover: string,
  database: CustomShellDb,
  at: Date
): Promise<
  | { ok: true; content: ReturnType<typeof cleanDealContent> }
  | { ok: false; problem: string }
> {
  if ((await readPageVisibility(workspaceId, "/deals", database)) === "off") {
    return {
      ok: false,
      problem:
        "This site has its Deals page switched off, so there is nowhere for the deal to appear.",
    }
  }
  let content: ReturnType<typeof cleanDealContent>
  try {
    content = cleanDealContent(input)
  } catch (error) {
    return { ok: false, problem: (error as Error).message }
  }
  const today = wallClockAt(await siteTimeZone(workspaceId, database), at).slice(
    0,
    10
  )
  if (content.endDate && content.endDate < today) {
    return {
      ok: false,
      problem: "That end day has been. Pick today or a later day.",
    }
  }
  // An unchanged cover on a change may be the admin's own upload.
  if (
    content.coverImage &&
    content.coverImage !== keepCover &&
    !(await isOwnedImageUrl(userId, content.coverImage, database))
  ) {
    return {
      ok: false,
      problem: "That photo is not one of your uploads. Pick it again.",
    }
  }
  try {
    await enforceRateLimit(
      `promotion-owner-request:${userId}`,
      { maxAttempts: OWNER_DEALS_PER_HOUR, windowSeconds: 60 * 60 },
      database
    )
  } catch (error) {
    if (error instanceof RateLimitError) {
      return {
        ok: false,
        problem: `You have sent ${OWNER_DEALS_PER_HOUR} deals and changes in the last hour. Please send the rest in an hour.`,
      }
    }
    throw error
  }
  return { ok: true, content }
}

/** An owner's new deal, into the admin's queue. */
export async function sendOwnerDeal(
  userId: string,
  claimId: string,
  input: DealContentInput,
  database: CustomShellDb = db,
  at: Date = new Date()
): Promise<OwnerSendOutcome> {
  const claim = await ownerClaim(userId, { claimId }, database)
  if (!claim) {
    return { outcome: "refused", problem: "You do not look after that listing." }
  }
  const checked = await checkOwnerSend(
    userId,
    claim.workspaceId,
    input,
    "",
    database,
    at
  )
  if (!checked.ok) return { outcome: "refused", problem: checked.problem }

  const saved = now()
  await database.insert(promotionRequests).values({
    id: uuid(),
    workspaceId: claim.workspaceId,
    listingId: claim.listingId,
    ownerUserId: userId,
    kind: "new",
    ...checked.content,
    createdAt: saved,
    updatedAt: saved,
  })
  return {
    outcome: "sent",
    workspaceId: claim.workspaceId,
    listingTitle: claim.listingTitle,
    title: checked.content.title,
  }
}

/**
 * New wording for one of the owner's live deals, into the admin's queue. The
 * live deal stays exactly as it is until an admin approves the change, and
 * only one change per deal waits at a time.
 */
export async function sendOwnerDealChange(
  userId: string,
  promotionId: string,
  input: DealContentInput,
  database: CustomShellDb = db,
  at: Date = new Date()
): Promise<OwnerSendOutcome> {
  const found = await ownersDeal(userId, promotionId, database)
  if (!found) {
    return { outcome: "refused", problem: "That deal is not one of yours." }
  }
  const { deal, claim } = found
  const clock = wallClockAt(await siteTimeZone(deal.workspaceId, database), at)
  if (dealStage({ ...deal, times: cleanListingHours(deal.times) }, clock) === "ended") {
    return {
      outcome: "refused",
      problem: "That deal has ended, so there is nothing to change.",
    }
  }
  const [waiting] = await database
    .select({ id: promotionRequests.id })
    .from(promotionRequests)
    .where(
      and(
        eq(promotionRequests.promotionId, deal.id),
        eq(promotionRequests.kind, "change"),
        eq(promotionRequests.status, "pending")
      )
    )
    .limit(1)
  if (waiting) {
    return {
      outcome: "refused",
      problem:
        "Your last change to this deal is still waiting for the admin. You can send another once it has been read.",
    }
  }
  const checked = await checkOwnerSend(
    userId,
    deal.workspaceId,
    input,
    deal.coverImage,
    database,
    at
  )
  if (!checked.ok) return { outcome: "refused", problem: checked.problem }

  const saved = now()
  await database.insert(promotionRequests).values({
    id: uuid(),
    workspaceId: deal.workspaceId,
    listingId: deal.listingId,
    ownerUserId: userId,
    kind: "change",
    promotionId: deal.id,
    ...checked.content,
    createdAt: saved,
    updatedAt: saved,
  })
  return {
    outcome: "sent",
    workspaceId: deal.workspaceId,
    listingTitle: claim.listingTitle,
    title: checked.content.title,
  }
}

/**
 * "End now": the owner's deal is over from this moment, on every public page
 * at once. A change still waiting has nothing left to change, so it is closed
 * with a note saying why. Ending twice is the same as ending once.
 */
export async function endOwnerDeal(
  userId: string,
  promotionId: string,
  database: CustomShellDb = db
): Promise<{ ended: true } | { ended: false; problem: string }> {
  const found = await ownersDeal(userId, promotionId, database)
  if (!found) return { ended: false, problem: "That deal is not one of yours." }
  const at = now()
  await database.transaction(async (tx) => {
    await tx
      .update(sitePromotions)
      // The first press is the moment it ended; pressing again changes nothing.
      .set({
        endedAt: sql`coalesce(${sitePromotions.endedAt}, ${at.toISOString()}::timestamptz)`,
        updatedAt: at,
      })
      .where(eq(sitePromotions.id, promotionId))
    await tx
      .update(promotionRequests)
      .set({
        status: "rejected",
        reviewNote: "The deal was ended before this change was read.",
        reviewedAt: at,
        updatedAt: at,
      })
      .where(
        and(
          eq(promotionRequests.promotionId, promotionId),
          eq(promotionRequests.status, "pending")
        )
      )
  })
  clearPublicDirectoryCache(found.deal.workspaceId)
  return { ended: true }
}

/** The owner's listing's opening hours, for "Same as the listing's hours". */
export async function ownerListingHours(
  userId: string,
  claimId: string,
  database: CustomShellDb = db
): Promise<ListingHours | null> {
  const claim = await ownerClaim(userId, { claimId }, database)
  return claim ? cleanListingHours(claim.hours) : null
}

/** A deal's content as the owner's Change window opens with it. */
export type OwnerDealContent = {
  title: string
  description: string
  coverImage: string
  startDate: string
  endDate: string | null
  code: string
  smallPrint: string
  dealType: string
  amount: number | null
  headline: string
  times: ListingHours
  takesClaims: boolean
  claimLimit: number | null
}

/** One thing an owner sent, as My listings shows it. */
export type OwnerDeal = {
  requestId: string
  status: "pending" | "approved" | "rejected"
  title: string
  headline: string
  startDate: string
  endDate: string | null
  /** The admin's note on a deal that was not approved. */
  reviewNote: string
  /** The deal approving it made, while it exists. */
  live: {
    id: string
    slug: string
    /** Where it stands now, by the site's clock. */
    stage: "on" | "soon" | "ended"
    /** Ended with "End now", rather than by its days. */
    endedEarly: boolean
    /** A change is waiting for the admin. */
    changeWaiting: boolean
    /** The admin's note on the latest change, when it was not approved. */
    changeRefused: string | null
    content: OwnerDealContent
  } | null
}

export type OwnerDeals = {
  /** By listing id, newest first. */
  deals: Record<string, OwnerDeal[]>
  /** By site id: whether the Deals page is on, so there is an Add deal button. */
  sites: Record<string, { dealsOn: boolean }>
}

/** How many deals My listings shows for one listing. */
const OWNER_DEALS_SHOWN = 20

/**
 * The deals this account sent, newest first, by listing. **Only this
 * account's**: a listing that changes hands shows its new owner none of the
 * old owner's deals.
 */
export async function ownerDealsFor(
  userId: string,
  database: CustomShellDb = db,
  at: Date = new Date()
): Promise<OwnerDeals> {
  const claims = await database
    .selectDistinct({ workspaceId: directoryClaims.workspaceId })
    .from(directoryClaims)
    .where(
      and(
        eq(directoryClaims.userId, userId),
        eq(directoryClaims.status, "approved")
      )
    )
  const sites: OwnerDeals["sites"] = {}
  const clocks = new Map<string, string>()
  await Promise.all(
    claims.map(async ({ workspaceId }) => {
      const [visibility, timeZone] = await Promise.all([
        readPageVisibility(workspaceId, "/deals", database),
        siteTimeZone(workspaceId, database),
      ])
      sites[workspaceId] = { dealsOn: visibility !== "off" }
      clocks.set(workspaceId, wallClockAt(timeZone, at))
    })
  )

  const sent = await database
    .select()
    .from(promotionRequests)
    .where(
      and(
        eq(promotionRequests.ownerUserId, userId),
        eq(promotionRequests.kind, "new")
      )
    )
    .orderBy(desc(promotionRequests.createdAt))
    .limit(500)

  const liveIds = sent
    .map((row) => row.promotionId)
    .filter((id): id is string => Boolean(id))
  const [deals, changes] = liveIds.length
    ? await Promise.all([
        database
          .select()
          .from(sitePromotions)
          .where(
            and(
              inArray(sitePromotions.id, liveIds),
              eq(sitePromotions.ownerUserId, userId)
            )
          ),
        database
          .select({
            promotionId: promotionRequests.promotionId,
            status: promotionRequests.status,
            reviewNote: promotionRequests.reviewNote,
          })
          .from(promotionRequests)
          .where(
            and(
              inArray(promotionRequests.promotionId, liveIds),
              eq(promotionRequests.kind, "change"),
              eq(promotionRequests.ownerUserId, userId)
            )
          )
          .orderBy(desc(promotionRequests.createdAt)),
      ])
    : [[], []]
  const dealById = new Map(deals.map((deal) => [deal.id, deal]))
  // The newest change per deal decides what its row says.
  const latestChange = new Map<string, (typeof changes)[number]>()
  for (const change of changes) {
    if (change.promotionId && !latestChange.has(change.promotionId)) {
      latestChange.set(change.promotionId, change)
    }
  }

  const byListing: OwnerDeals["deals"] = {}
  for (const row of sent) {
    const list = (byListing[row.listingId] ??= [])
    if (list.length >= OWNER_DEALS_SHOWN) continue
    const deal = row.promotionId ? dealById.get(row.promotionId) : undefined
    const times = deal ? cleanListingHours(deal.times) : null
    const change = deal ? latestChange.get(deal.id) : undefined
    list.push({
      requestId: row.id,
      status: row.status as OwnerDeal["status"],
      title: deal?.title ?? row.title,
      headline: deal?.headline ?? row.headline,
      startDate: deal?.startDate ?? row.startDate,
      endDate: deal ? deal.endDate : row.endDate,
      reviewNote: row.status === "rejected" ? row.reviewNote : "",
      live:
        deal && times
          ? {
              id: deal.id,
              slug: deal.slug,
              stage: dealStage(
                { ...deal, times },
                clocks.get(deal.workspaceId) ??
                  wallClockAt(DEFAULT_SITE_TIME_ZONE, at)
              ),
              endedEarly: Boolean(deal.endedAt),
              changeWaiting: change?.status === "pending",
              changeRefused:
                change?.status === "rejected" ? change.reviewNote || "" : null,
              content: {
                title: deal.title,
                description: deal.description,
                coverImage: deal.coverImage,
                startDate: deal.startDate,
                endDate: deal.endDate,
                code: deal.code,
                smallPrint: deal.smallPrint,
                dealType: deal.dealType ?? "",
                amount: deal.amount,
                headline: deal.headline,
                times,
                takesClaims: deal.takesClaims,
                claimLimit: deal.claimLimit,
              },
            }
          : null,
    })
  }
  return { deals: byListing, sites }
}

/** A request as the admin's queue shows it. */
export type PromotionRequest = {
  id: string
  kind: "new" | "change"
  status: "pending" | "approved" | "rejected"
  listingTitle: string
  /** Empty once the owner's account is gone. */
  ownerName: string
  ownerEmail: string
  /** The deal as the owner wrote it. */
  content: OwnerDealContent
  /** On a change, the deal as it is live now, for the side-by-side view. */
  live: { title: string; content: OwnerDealContent } | null
  /** The deal it made or changed, for a link to it. */
  promotionId: string | null
  reviewNote: string
  reviewedAt: Date | null
  createdAt: Date
}

type RequestStatus = PromotionRequest["status"]

function contentOf(row: {
  title: string
  description: string
  coverImage: string
  startDate: string
  endDate: string | null
  code: string
  smallPrint: string
  dealType: string | null
  amount: number | null
  headline: string
  times: unknown
  takesClaims: boolean
  claimLimit: number | null
}): OwnerDealContent {
  return {
    title: row.title,
    description: row.description,
    coverImage: row.coverImage,
    startDate: row.startDate,
    endDate: row.endDate,
    code: row.code,
    smallPrint: row.smallPrint,
    dealType: row.dealType ?? "",
    amount: row.amount,
    headline: row.headline,
    times: cleanListingHours(row.times),
    takesClaims: row.takesClaims,
    claimLimit: row.claimLimit,
  }
}

/** Stored content, as the save rules read a window's boxes. */
function asInput(
  content: OwnerDealContent
): DealContentInput & { endDate: string | null } {
  return {
    ...content,
    amount: content.amount === null ? "" : String(content.amount),
    claimLimit: content.claimLimit === null ? "" : String(content.claimLimit),
  }
}

/** One tab of the queue, newest first, with the listing and the owner named. */
export async function listPromotionRequests(
  workspaceId: string,
  options: {
    status: RequestStatus
    search?: string
    limit?: number
    offset?: number
  },
  database: CustomShellDb = db
): Promise<{ requests: PromotionRequest[]; total: number }> {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200)
  const offset = Math.max(options.offset ?? 0, 0)
  const search = options.search?.trim()
  const pattern = search ? `%${search}%` : null
  const where = and(
    eq(promotionRequests.workspaceId, workspaceId),
    eq(promotionRequests.status, options.status),
    pattern
      ? or(
          ilike(promotionRequests.title, pattern),
          ilike(directoryListings.title, pattern),
          ilike(customShellUsers.email, pattern)
        )
      : undefined
  )
  const [rows, [countRow]] = await Promise.all([
    database
      .select({
        row: promotionRequests,
        listingTitle: directoryListings.title,
        ownerName: customShellUsers.name,
        ownerEmail: customShellUsers.email,
      })
      .from(promotionRequests)
      .innerJoin(
        directoryListings,
        eq(directoryListings.id, promotionRequests.listingId)
      )
      .leftJoin(
        customShellUsers,
        eq(customShellUsers.id, promotionRequests.ownerUserId)
      )
      .where(where)
      // The id breaks ties so a page boundary never repeats or skips a row.
      .orderBy(desc(promotionRequests.createdAt), asc(promotionRequests.id))
      .limit(limit)
      .offset(offset),
    database
      .select({ total: sql<number>`count(*)::int` })
      .from(promotionRequests)
      .innerJoin(
        directoryListings,
        eq(directoryListings.id, promotionRequests.listingId)
      )
      .leftJoin(
        customShellUsers,
        eq(customShellUsers.id, promotionRequests.ownerUserId)
      )
      .where(where),
  ])

  const changed = rows
    .filter(({ row }) => row.kind === "change" && row.promotionId)
    .map(({ row }) => row.promotionId!)
  const liveRows = changed.length
    ? await database
        .select()
        .from(sitePromotions)
        .where(
          and(
            eq(sitePromotions.workspaceId, workspaceId),
            inArray(sitePromotions.id, changed)
          )
        )
    : []
  const liveById = new Map(liveRows.map((deal) => [deal.id, deal]))

  return {
    requests: rows.map(({ row, listingTitle, ownerName, ownerEmail }) => {
      const live =
        row.kind === "change" && row.promotionId
          ? liveById.get(row.promotionId)
          : undefined
      return {
        id: row.id,
        kind: row.kind === "change" ? "change" : "new",
        status: row.status as RequestStatus,
        listingTitle,
        ownerName: ownerName ?? "",
        ownerEmail: ownerEmail ?? "",
        content: contentOf(row),
        live: live ? { title: live.title, content: contentOf(live) } : null,
        promotionId: row.promotionId,
        reviewNote: row.reviewNote,
        reviewedAt: row.reviewedAt,
        createdAt: row.createdAt,
      }
    }),
    total: countRow?.total ?? 0,
  }
}

/** How many are waiting, for the Pending tab and Admin → Promotions. */
export async function pendingPromotionRequestCount(
  workspaceId: string,
  database: CustomShellDb = db
): Promise<number> {
  const [row] = await database
    .select({ total: sql<number>`count(*)::int` })
    .from(promotionRequests)
    .where(
      and(
        eq(promotionRequests.workspaceId, workspaceId),
        eq(promotionRequests.status, "pending")
      )
    )
  return row?.total ?? 0
}

/**
 * An admin's answer. Approving a new deal publishes it at the owner's listing,
 * with the owner as the one who may change or end it, which Tyler chose on
 * 24 Sep 2026. Approving a change swaps the new wording into the live deal and
 * leaves its address, status and listing alone. Rejecting keeps the request as
 * a record. **Deciding twice does nothing twice**: the status is part of the
 * final match, and the second finds nothing to change.
 */
async function reviewPromotionRequest(
  workspaceId: string,
  id: string,
  input: { decision: "approve" | "reject"; note?: string; reviewerId: string },
  database: CustomShellDb = db
): Promise<{
  kind: "new" | "change"
  title: string
  ownerEmail: string
  reviewNote: string
  promotionId: string | null
}> {
  const [found] = await database
    .select({ row: promotionRequests, ownerEmail: customShellUsers.email })
    .from(promotionRequests)
    .leftJoin(
      customShellUsers,
      eq(customShellUsers.id, promotionRequests.ownerUserId)
    )
    .where(
      and(
        eq(promotionRequests.id, id),
        eq(promotionRequests.workspaceId, workspaceId)
      )
    )
    .limit(1)
  if (!found) throw new Error("That request no longer exists.")
  const { row } = found
  if (row.status !== "pending") {
    throw new Error("Somebody has already dealt with this one.")
  }

  const at = now()
  const note = (input.note ?? "").trim().slice(0, 500)
  const decided = {
    reviewedAt: at,
    reviewedByUserId: input.reviewerId,
    reviewNote: note,
    updatedAt: at,
  }
  const stillPending = and(
    eq(promotionRequests.id, row.id),
    eq(promotionRequests.status, "pending")
  )
  const kind: "new" | "change" = row.kind === "change" ? "change" : "new"
  const answer = (promotionId: string | null) => ({
    kind,
    title: row.title,
    ownerEmail: found.ownerEmail ?? "",
    reviewNote: note,
    promotionId,
  })

  if (input.decision === "reject") {
    const [updated] = await database
      .update(promotionRequests)
      .set({ ...decided, status: "rejected" })
      .where(stillPending)
      .returning({ id: promotionRequests.id })
    if (!updated) throw new Error("Somebody has already dealt with this one.")
    return answer(row.promotionId)
  }

  if (kind === "new") {
    const promotionId = await database.transaction(async (tx) => {
      const made = await createPromotion(
        workspaceId,
        row.ownerUserId ?? input.reviewerId,
        {
          ...asInput(contentOf(row)),
          listingId: row.listingId,
          status: "published",
        },
        tx
      )
      await tx
        .update(sitePromotions)
        .set({ ownerUserId: row.ownerUserId })
        .where(eq(sitePromotions.id, made.id))
      const [updated] = await tx
        .update(promotionRequests)
        .set({ ...decided, status: "approved", promotionId: made.id })
        .where(stillPending)
        .returning({ id: promotionRequests.id })
      if (!updated) throw new Error("Somebody has already dealt with this one.")
      return made.id
    })
    // Again after the commit, so a visitor reading in between cannot put the
    // old list back for a minute.
    clearPublicDirectoryCache(workspaceId)
    return answer(promotionId)
  }

  const [deal] = row.promotionId
    ? await database
        .select({ id: sitePromotions.id, endedAt: sitePromotions.endedAt })
        .from(sitePromotions)
        .where(
          and(
            eq(sitePromotions.id, row.promotionId),
            eq(sitePromotions.workspaceId, workspaceId)
          )
        )
        .limit(1)
    : []
  if (!deal) throw new Error("That deal no longer exists, so there is nothing to change.")
  if (deal.endedAt) {
    throw new Error("That deal has ended, so there is nothing to change.")
  }
  const content = cleanDealContent(asInput(contentOf(row)))
  await database.transaction(async (tx) => {
    await tx
      .update(sitePromotions)
      .set({ ...content, updatedAt: at })
      .where(eq(sitePromotions.id, deal.id))
    const [updated] = await tx
      .update(promotionRequests)
      .set({ ...decided, status: "approved" })
      .where(stillPending)
      .returning({ id: promotionRequests.id })
    if (!updated) throw new Error("Somebody has already dealt with this one.")
  })
  clearPublicDirectoryCache(workspaceId)
  return answer(deal.id)
}

/**
 * The decision, then the email to the owner about it. The same rule as a
 * listing's and an event's: the decision is saved first, and a failed email is
 * caught rather than thrown, so it never undoes the decision. `emailed` is
 * whether the owner was actually told.
 */
export async function decidePromotionRequest(
  workspaceId: string,
  id: string,
  input: { decision: "approve" | "reject"; note?: string; reviewerId: string },
  database: CustomShellDb = db,
  send: typeof sendDirectoryEmail = sendDirectoryEmail
): Promise<{ promotionId: string | null; emailed: boolean }> {
  const decided = await reviewPromotionRequest(workspaceId, id, input, database)
  const { title, kind, reviewNote } = decided
  let emailed = false
  if (decided.ownerEmail) {
    try {
      const approve = input.decision === "approve"
      const sent = await send(
        {
          workspaceId,
          to: decided.ownerEmail,
          subject: approve
            ? kind === "new"
              ? `${title} is on the Deals page`
              : `Your change to ${title} is live`
            : kind === "new"
              ? `About your deal, ${title}`
              : `About your change to ${title}`,
          lines: approve
            ? [
                kind === "new"
                  ? `${title} has been approved and is on the site's Deals page now.`
                  : `Your change to ${title} has been approved and is on the site now.`,
                reviewNote,
              ].filter(Boolean)
            : [
                kind === "new"
                  ? `We are not adding ${title} to the site at the moment.`
                  : `We are keeping ${title} as it was.`,
                reviewNote ||
                  "If you think this is a mistake, reply to this email.",
              ],
        },
        database
      )
      emailed = sent.delivered
    } catch {
      // The decision stands. `emailed` stays false, and the screen says so.
    }
  }
  return { promotionId: decided.promotionId, emailed }
}

/**
 * Who claimed one of the owner's own deals, for My listings. Only a deal this
 * account sent and whose listing it still looks after; anything else is null.
 */
export async function ownerDealClaims(
  userId: string,
  promotionId: string,
  database: CustomShellDb = db
): Promise<DealClaim[] | null> {
  const found = await ownersDeal(userId, promotionId, database)
  return found
    ? listClaims(found.deal.workspaceId, promotionId, database)
    : null
}
