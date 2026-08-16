import { and, asc, desc, eq, ilike, inArray, or, sql } from "drizzle-orm"

import {
  cleanContactLinks,
  sanitizeContactHref,
  buildUrlHref,
  type ContactLinks,
} from "@/lib/directory/contact-links"
import type {
  EditRequestStatus,
  ReviewStatus,
} from "@/lib/directory/review-status"
import { CLAIM_MESSAGE_MAX } from "@/lib/directory/field-lengths"
import { looksLikeEmail } from "@/lib/directory/submission-fields"
import {
  cleanWrittenPageBody,
  type WrittenPageNode,
} from "@/lib/pages/written-page-body"
import { createSecretToken, hashToken, now, uuid } from "@/server/auth/security"
import { db, type CustomShellDb } from "@/server/db"
import { clearPublicDirectoryCache } from "@/server/directory/public-cache"
import { updateListing } from "@/server/directory/listings"
import {
  directoryClaims,
  directoryListings,
  directoryOwnerEditRequests,
  directorySettings,
  type DirectoryClaimRow,
} from "@/server/directory/schema"
import { directorySiteUrl } from "@/server/directory/site-url"
import { customShellUsers, customShellWorkspaces } from "@/server/schema"

/**
 * Who owns a listing, and what they are allowed to change about it.
 *
 * Three rules hold this file up.
 *
 * **Claiming needs an account.** An approved claim hands somebody the ability to
 * change a public page, and "whoever holds this email address" is not a thing to
 * hand that to. The address being verified is the *business's*, which is often
 * not the account's — proving it is what the email is for.
 *
 * **One approved claim per listing, kept by the database.** The partial unique
 * index in the schema is the real rule; the check before the write is only there
 * so the second person gets a sentence instead of a failed query.
 *
 * **An owner never edits the public page.** Their changes are a row waiting for
 * an admin. Nothing an owner types reaches `directory_listings` until somebody
 * with the admin's guard applies it.
 */

const VERIFY_WINDOW_MS = 3 * 24 * 60 * 60 * 1000

export type DirectoryClaim = {
  id: string
  listingId: string
  userId: string
  contactEmail: string
  claimantName: string
  roleTitle: string
  phone: string
  message: string
  proofUrl: string
  emailDomainMatches: boolean
  status: ReviewStatus
  reviewedAt: Date | null
  reviewNote: string
  createdAt: Date
}

/** A queue row: the claim, the listing it is about, and who is asking. */
export type ClaimSummary = DirectoryClaim & {
  listingTitle: string
  listingSlug: string
  accountEmail: string
  accountName: string
}

function toClaim(row: DirectoryClaimRow): DirectoryClaim {
  return {
    id: row.id,
    listingId: row.listingId,
    userId: row.userId,
    contactEmail: row.contactEmail,
    claimantName: row.claimantName,
    roleTitle: row.roleTitle,
    phone: row.phone,
    message: row.message,
    proofUrl: row.proofUrl,
    emailDomainMatches: row.emailDomainMatches,
    status: row.status as ReviewStatus,
    reviewedAt: row.reviewedAt,
    reviewNote: row.reviewNote,
    createdAt: row.createdAt,
  }
}

/**
 * The bare host of whatever somebody typed as a website, or empty.
 *
 * Used only to compare two domains, so `www.` and the path come off — an owner
 * whose email is at `joesdiner.com` and whose listing says
 * `https://www.joesdiner.com/menu` is the case this is for.
 */
function hostOf(value: string): string {
  const href = buildUrlHref(value)
  if (!href) return ""
  try {
    return new URL(href).hostname.replace(/^www\./i, "").toLowerCase()
  } catch {
    return ""
  }
}

/** The website a listing gives, from its contact links. */
function listingWebsite(contactLinks: unknown): string {
  const links = cleanContactLinks(contactLinks)
  const website = links.menuLinks.find((link) => link.type === "website")
  return website?.value ?? ""
}

/**
 * Whether the address being proved is at the listing's own domain.
 *
 * **A mismatch is never a refusal.** Plenty of real owners use a Gmail address,
 * and plenty of listings have no website at all. This is a flag on the admin's
 * screen so they read an answer instead of comparing two strings by eye.
 */
export function emailMatchesWebsite(email: string, website: string): boolean {
  const emailHost = email.split("@")[1]?.replace(/^www\./i, "").toLowerCase()
  const siteHost = hostOf(website)
  if (!emailHost || !siteHost) return false
  return emailHost === siteHost || siteHost.endsWith(`.${emailHost}`)
}

/** The index whose refusal is the one thing this file turns into a sentence. */
const APPROVED_CLAIM_INDEX = "ux_directory_claims_approved_listing"

/**
 * Whether this is the database refusing a second owner for one listing.
 *
 * **Walks the cause chain**, because the query builder wraps the driver's error
 * in its own "Failed query" one — matching only the outer error would mean this
 * never returns true and the useful sentence never gets shown.
 *
 * Both the code and the index name have to match. `23505` is *any* unique
 * violation, so a clash on some future index on this table is a different
 * problem and must not be reported as this one.
 */
function isApprovedClaimClash(error: unknown): boolean {
  for (let step: unknown = error, depth = 0; step && depth < 5; depth += 1) {
    if (typeof step !== "object") return false
    const detail = step as {
      code?: unknown
      constraint?: unknown
      constraint_name?: unknown
      message?: unknown
      cause?: unknown
    }
    const named = String(
      detail.constraint ?? detail.constraint_name ?? detail.message ?? ""
    )
    if (detail.code === "23505" && named.includes(APPROVED_CLAIM_INDEX)) {
      return true
    }
    step = detail.cause
  }
  return false
}

export type ClaimState = {
  /** Somebody already owns this listing. Says nothing about who. */
  claimed: boolean
  /** Where this visitor's own claim stands, if they have made one. */
  mine: ReviewStatus | null
}

/**
 * What the claim button should say to this visitor.
 *
 * Deliberately says nothing about *who* owns a claimed listing — a visitor is
 * told the page is looked after, never by whom.
 */
export async function claimStateFor(
  workspaceId: string,
  listingId: string,
  userId: string | null,
  database: CustomShellDb = db
): Promise<ClaimState> {
  const rows = await database
    .select({ userId: directoryClaims.userId, status: directoryClaims.status })
    .from(directoryClaims)
    .where(
      and(
        eq(directoryClaims.workspaceId, workspaceId),
        eq(directoryClaims.listingId, listingId)
      )
    )

  const claimed = rows.some((row) => row.status === "approved")
  // Their approved claim if they have one, otherwise whichever they made — an
  // approved claim is the only one worth reporting when there are several.
  const ours = userId ? rows.filter((row) => row.userId === userId) : []
  const mine = (ours.find((row) => row.status === "approved") ?? ours[0])
    ?.status as ReviewStatus | undefined

  return { claimed, mine: mine ?? null }
}

/** Which of these listings somebody looks after, for the tick on a card. */
export async function claimedListingIds(
  workspaceId: string,
  listingIds: string[],
  database: CustomShellDb = db
): Promise<Set<string>> {
  if (listingIds.length === 0) return new Set()

  const rows = await database
    .select({ listingId: directoryClaims.listingId })
    .from(directoryClaims)
    .where(
      and(
        eq(directoryClaims.workspaceId, workspaceId),
        eq(directoryClaims.status, "approved"),
        inArray(directoryClaims.listingId, listingIds)
      )
    )
  return new Set(rows.map((row) => row.listingId))
}

export type ClaimInput = {
  contactEmail: string
  claimantName: string
  roleTitle?: string
  phone?: string
  message?: string
  proofUrl?: string
}

/**
 * Somebody asking for a listing.
 *
 * Returns the plain token with the row, because this is the only moment it is
 * readable; the table keeps its hash.
 */
export async function createClaim(
  workspaceId: string,
  listingId: string,
  userId: string,
  input: ClaimInput,
  database: CustomShellDb = db
): Promise<{ claim: DirectoryClaim; token: string; listingTitle: string }> {
  const [listing] = await database
    .select({
      id: directoryListings.id,
      title: directoryListings.title,
      contactLinks: directoryListings.contactLinks,
      status: directoryListings.status,
    })
    .from(directoryListings)
    .where(
      and(
        eq(directoryListings.id, listingId),
        eq(directoryListings.workspaceId, workspaceId),
        // A draft has no public page to claim, and telling somebody one exists
        // is the same leak as showing it.
        eq(directoryListings.status, "published")
      )
    )
    .limit(1)

  if (!listing) throw new Error("That listing no longer exists.")

  const contactEmail = (input.contactEmail ?? "").trim().toLowerCase().slice(0, 255)
  if (!looksLikeEmail(contactEmail)) {
    throw new Error("That does not look like an email address.")
  }
  const claimantName = (input.claimantName ?? "").trim().slice(0, 200)
  if (!claimantName) throw new Error("Please give your name.")

  const existing = await claimStateFor(workspaceId, listingId, userId, database)
  if (existing.claimed) {
    throw new Error(
      "Somebody already looks after this listing. If that is wrong, use the contact link on the page."
    )
  }
  if (existing.mine === "pending_verification" || existing.mine === "pending_review") {
    throw new Error("You have already asked for this one. We are still looking at it.")
  }

  const at = now()
  const token = createSecretToken()

  const [row] = await database
    .insert(directoryClaims)
    .values({
      id: uuid(),
      workspaceId,
      listingId,
      userId,
      contactEmail,
      claimantName,
      roleTitle: (input.roleTitle ?? "").trim().slice(0, 120),
      phone: (input.phone ?? "").trim().slice(0, 60),
      message: (input.message ?? "").trim().slice(0, CLAIM_MESSAGE_MAX),
      // Sanitized, not merely trimmed: this is a link an admin will click from
      // their own screen, so `javascript:` is dropped rather than stored.
      proofUrl: sanitizeContactHref(input.proofUrl ?? "").slice(0, 2000),
      emailDomainMatches: emailMatchesWebsite(
        contactEmail,
        listingWebsite(listing.contactLinks)
      ),
      status: "pending_verification",
      verifyTokenHash: hashToken(token),
      verifyExpiresAt: new Date(at.getTime() + VERIFY_WINDOW_MS),
      createdAt: at,
      updatedAt: at,
    })
    .returning()

  if (!row) throw new Error("That could not be sent. Please try again.")
  return { claim: toClaim(row), token, listingTitle: listing.title }
}

export async function verifyClaim(
  token: string,
  database: CustomShellDb = db
): Promise<
  | { outcome: "verified"; workspaceId: string; listingId: string }
  | { outcome: "expired" }
  | { outcome: "unknown" }
  | { outcome: "already" }
> {
  const [row] = await database
    .select()
    .from(directoryClaims)
    .where(eq(directoryClaims.verifyTokenHash, hashToken(token)))
    .limit(1)

  if (!row) return { outcome: "unknown" }
  if (row.status !== "pending_verification") return { outcome: "already" }
  if (!row.verifyExpiresAt || row.verifyExpiresAt <= now()) {
    return { outcome: "expired" }
  }

  const at = now()
  await database
    .update(directoryClaims)
    .set({
      status: "pending_review",
      verifiedAt: at,
      verifyTokenHash: null,
      verifyExpiresAt: null,
      updatedAt: at,
    })
    .where(eq(directoryClaims.id, row.id))

  return {
    outcome: "verified",
    workspaceId: row.workspaceId,
    listingId: row.listingId,
  }
}

/** The claims queue. Same rule as submissions: unverified ones are not work. */
export async function listClaims(
  workspaceId: string,
  options: {
    status?: ReviewStatus
    /** Matches the listing's title, the claimant's name or their email. */
    search?: string
    limit?: number
    offset?: number
  } = {},
  database: CustomShellDb = db
): Promise<{ claims: ClaimSummary[]; total: number }> {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200)
  const offset = Math.max(options.offset ?? 0, 0)

  // The site's own claims, always. The search narrows what is already inside
  // that boundary — it never replaces it.
  const filters = [
    eq(directoryClaims.workspaceId, workspaceId),
    options.status
      ? eq(directoryClaims.status, options.status)
      : inArray(directoryClaims.status, [
          "pending_review",
          "approved",
          "rejected",
        ]),
  ]
  const search = options.search?.trim()
  if (search) {
    const pattern = `%${search}%`
    const searchFilter = or(
      ilike(directoryListings.title, pattern),
      ilike(directoryClaims.claimantName, pattern),
      ilike(directoryClaims.contactEmail, pattern)
    )
    if (searchFilter) filters.push(searchFilter)
  }
  const where = and(...filters)

  const [rows, [countRow]] = await Promise.all([
    database
      .select({
        claim: directoryClaims,
        listingTitle: directoryListings.title,
        listingSlug: directoryListings.slug,
        accountEmail: customShellUsers.email,
        accountName: customShellUsers.name,
      })
      .from(directoryClaims)
      .innerJoin(
        directoryListings,
        eq(directoryListings.id, directoryClaims.listingId)
      )
      .innerJoin(customShellUsers, eq(customShellUsers.id, directoryClaims.userId))
      .where(where)
      .orderBy(desc(directoryClaims.createdAt), asc(directoryClaims.id))
      .limit(limit)
      .offset(offset),
    // The same join as the page above it, because the search reaches the
    // listing's title — count without it and "1-50 of N" counts a different
    // set from the one on screen.
    database
      .select({ total: sql<number>`count(*)::int` })
      .from(directoryClaims)
      .innerJoin(
        directoryListings,
        eq(directoryListings.id, directoryClaims.listingId)
      )
      .where(where),
  ])

  return {
    claims: rows.map((row) => ({
      ...toClaim(row.claim),
      listingTitle: row.listingTitle,
      listingSlug: row.listingSlug,
      accountEmail: row.accountEmail,
      accountName: row.accountName,
    })),
    total: countRow?.total ?? 0,
  }
}

export async function pendingClaimCount(
  workspaceId: string,
  database: CustomShellDb = db
): Promise<number> {
  const [row] = await database
    .select({ total: sql<number>`count(*)::int` })
    .from(directoryClaims)
    .where(
      and(
        eq(directoryClaims.workspaceId, workspaceId),
        eq(directoryClaims.status, "pending_review")
      )
    )
  return row?.total ?? 0
}

/**
 * An admin's answer to a claim.
 *
 * Approving is written as a conditional update — the status is part of the
 * match — so two admins pressing Approve at the same moment cannot both get
 * through, and the database's own unique index catches the case where they
 * approve two different claims on one listing.
 */
export async function reviewClaim(
  workspaceId: string,
  id: string,
  input: { decision: "approve" | "reject"; note?: string; reviewerId: string },
  database: CustomShellDb = db
): Promise<{ claim: DirectoryClaim; listingTitle: string; claimantEmail: string }> {
  const [found] = await database
    .select({
      claim: directoryClaims,
      listingTitle: directoryListings.title,
    })
    .from(directoryClaims)
    .innerJoin(
      directoryListings,
      eq(directoryListings.id, directoryClaims.listingId)
    )
    .where(
      and(
        eq(directoryClaims.id, id),
        eq(directoryClaims.workspaceId, workspaceId)
      )
    )
    .limit(1)

  if (!found) throw new Error("That claim no longer exists.")
  if (found.claim.status === "pending_verification") {
    throw new Error(
      "This one is still waiting for the claimant to confirm their email address."
    )
  }
  if (found.claim.status !== "pending_review") {
    throw new Error("Somebody has already dealt with this one.")
  }

  const at = now()
  const status = input.decision === "approve" ? "approved" : "rejected"

  let updated: DirectoryClaimRow | undefined
  try {
    ;[updated] = await database
      .update(directoryClaims)
      .set({
        status,
        reviewedAt: at,
        reviewedByUserId: input.reviewerId,
        reviewNote: (input.note ?? "").trim().slice(0, 500),
        updatedAt: at,
      })
      .where(
        and(
          eq(directoryClaims.id, found.claim.id),
          eq(directoryClaims.status, "pending_review")
        )
      )
      .returning()
  } catch (error) {
    // **Only the one-approved-claim-per-listing index is turned into a
    // sentence.** Catching everything here would report a database that had
    // fallen over as "somebody else got there first", which is a plausible,
    // wrong answer — the worst kind to give somebody trying to work out what
    // happened. Anything else is re-thrown as it is.
    if (!isApprovedClaimClash(error)) throw error
    throw new Error("Somebody else has already been given this listing.")
  }

  if (!updated) throw new Error("Somebody has already dealt with this one.")

  clearPublicDirectoryCache(workspaceId)
  return {
    claim: toClaim(updated),
    listingTitle: found.listingTitle,
    claimantEmail: updated.contactEmail,
  }
}

/** A listing somebody owns, with the site it is on named. */
export type OwnedListing = {
  claimId: string
  listingId: string
  title: string
  slug: string
  metaDescription: string
  featuredImage: string
  status: string
  /**
   * The checked shapes, not `unknown`. A server function refuses to hand
   * `unknown` to a page — it cannot promise it will survive the trip — and a
   * cleaner has already been run over both by the time they get here.
   */
  contactLinks: ContactLinks
  body: WrittenPageNode
  siteName: string
  siteId: string
  siteUrl: string
  badgesEnabled: boolean
  /** The change they have already asked for, if one is waiting. */
  pendingRequestId: string | null
}

/**
 * The listings this account looks after, across every site.
 *
 * Across sites on purpose: the owner area lives on the platform host, where
 * accounts are managed, so somebody who owns a café on one site and a shop on
 * another sees both with each site named.
 */
export async function listingsOwnedBy(
  userId: string,
  database: CustomShellDb = db
): Promise<OwnedListing[]> {
  const rows = await database
    .select({
      claimId: directoryClaims.id,
      listing: directoryListings,
      siteName: customShellWorkspaces.name,
      siteSubdomain: customShellWorkspaces.subdomain,
      siteCustomDomain: customShellWorkspaces.customDomain,
      badgesEnabled: directorySettings.badgesEnabled,
    })
    .from(directoryClaims)
    .innerJoin(
      directoryListings,
      eq(directoryListings.id, directoryClaims.listingId)
    )
    .innerJoin(
      customShellWorkspaces,
      eq(customShellWorkspaces.id, directoryClaims.workspaceId)
    )
    .leftJoin(
      directorySettings,
      eq(directorySettings.workspaceId, directoryClaims.workspaceId)
    )
    .where(
      and(
        eq(directoryClaims.userId, userId),
        eq(directoryClaims.status, "approved")
      )
    )
    .orderBy(asc(customShellWorkspaces.name), asc(directoryListings.title))

  if (rows.length === 0) return []

  const pending = await database
    .select({
      id: directoryOwnerEditRequests.id,
      claimId: directoryOwnerEditRequests.claimId,
    })
    .from(directoryOwnerEditRequests)
    .where(
      and(
        eq(directoryOwnerEditRequests.status, "pending"),
        inArray(
          directoryOwnerEditRequests.claimId,
          rows.map((row) => row.claimId)
        )
      )
    )
  const waiting = new Map(pending.map((row) => [row.claimId, row.id]))

  return rows.map((row) => ({
    claimId: row.claimId,
    listingId: row.listing.id,
    title: row.listing.title,
    slug: row.listing.slug,
    metaDescription: row.listing.metaDescription,
    featuredImage: row.listing.featuredImage,
    status: row.listing.status,
    contactLinks: cleanContactLinks(row.listing.contactLinks),
    body: cleanWrittenPageBody(row.listing.body),
    siteName: row.siteName,
    siteId: row.listing.workspaceId,
    siteUrl: directorySiteUrl({
      subdomain: row.siteSubdomain,
      customDomain: row.siteCustomDomain || null,
    }),
    badgesEnabled: row.badgesEnabled ?? false,
    pendingRequestId: waiting.get(row.claimId) ?? null,
  }))
}

/**
 * What an owner is allowed to propose, and nothing else.
 *
 * The two trees are the checked shapes rather than `unknown`: what comes off
 * the wire is cleaned the moment it arrives, so everything downstream — the
 * admin's review screen included — is looking at something already known to be
 * safe to draw.
 */
export type OwnerChanges = {
  title?: string
  metaDescription?: string
  featuredImage?: string
  contactLinks?: ContactLinks
  body?: WrittenPageNode
}

/**
 * An owner asking for a change.
 *
 * The claim is looked up by claim *and* account, so an id from somebody else's
 * claim is simply not found. One pending request at a time: a second replaces
 * the first rather than stacking, because an admin reviewing two half-changes
 * to one listing has no way to apply both sensibly.
 */
export async function requestOwnerEdit(
  userId: string,
  claimId: string,
  // Whatever arrived, not the checked shape: this is the door, and cleaning is
  // what happens on the way through it.
  changes: {
    title?: string
    metaDescription?: string
    featuredImage?: string
    contactLinks?: unknown
    body?: unknown
  },
  database: CustomShellDb = db
): Promise<{ id: string; listingTitle: string; workspaceId: string }> {
  const [claim] = await database
    .select({
      claim: directoryClaims,
      listingTitle: directoryListings.title,
    })
    .from(directoryClaims)
    .innerJoin(
      directoryListings,
      eq(directoryListings.id, directoryClaims.listingId)
    )
    .where(
      and(
        eq(directoryClaims.id, claimId),
        eq(directoryClaims.userId, userId),
        eq(directoryClaims.status, "approved")
      )
    )
    .limit(1)

  if (!claim) throw new Error("You do not look after that listing.")

  // Cleaned here, at the door, and again by `updateListing` when an admin
  // applies it — so what an admin reads on the review screen is what would go
  // live, not something that will be trimmed later.
  const proposed: OwnerChanges = {}
  if (changes.title !== undefined) {
    const title = changes.title.trim().slice(0, 200)
    if (!title) throw new Error("A listing needs a name.")
    proposed.title = title
  }
  if (changes.metaDescription !== undefined) {
    proposed.metaDescription = changes.metaDescription.trim().slice(0, 300)
  }
  if (changes.featuredImage !== undefined) {
    proposed.featuredImage = changes.featuredImage.trim().slice(0, 600)
  }
  if (changes.contactLinks !== undefined) {
    proposed.contactLinks = cleanContactLinks(changes.contactLinks)
  }
  if (changes.body !== undefined) {
    proposed.body = cleanWrittenPageBody(changes.body)
  }

  if (Object.keys(proposed).length === 0) {
    throw new Error("Nothing has been changed yet.")
  }

  const at = now()
  const id = uuid()

  await database.transaction(async (tx) => {
    await tx
      .delete(directoryOwnerEditRequests)
      .where(
        and(
          eq(directoryOwnerEditRequests.claimId, claim.claim.id),
          eq(directoryOwnerEditRequests.status, "pending")
        )
      )
    await tx.insert(directoryOwnerEditRequests).values({
      id,
      workspaceId: claim.claim.workspaceId,
      claimId: claim.claim.id,
      listingId: claim.claim.listingId,
      changes: proposed,
      status: "pending",
      createdAt: at,
      updatedAt: at,
    })
  })

  return {
    id,
    listingTitle: claim.listingTitle,
    workspaceId: claim.claim.workspaceId,
  }
}

export type EditRequestSummary = {
  id: string
  listingId: string
  listingTitle: string
  listingSlug: string
  ownerName: string
  ownerEmail: string
  changes: OwnerChanges
  status: EditRequestStatus
  reviewNote: string
  createdAt: Date
  reviewedAt: Date | null
}

export async function listEditRequests(
  workspaceId: string,
  options: { status?: EditRequestStatus; limit?: number } = {},
  database: CustomShellDb = db
): Promise<EditRequestSummary[]> {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200)

  const rows = await database
    .select({
      request: directoryOwnerEditRequests,
      listingTitle: directoryListings.title,
      listingSlug: directoryListings.slug,
      ownerName: customShellUsers.name,
      ownerEmail: customShellUsers.email,
    })
    .from(directoryOwnerEditRequests)
    .innerJoin(
      directoryListings,
      eq(directoryListings.id, directoryOwnerEditRequests.listingId)
    )
    .innerJoin(
      directoryClaims,
      eq(directoryClaims.id, directoryOwnerEditRequests.claimId)
    )
    .innerJoin(customShellUsers, eq(customShellUsers.id, directoryClaims.userId))
    .where(
      and(
        eq(directoryOwnerEditRequests.workspaceId, workspaceId),
        options.status
          ? eq(directoryOwnerEditRequests.status, options.status)
          : undefined
      )
    )
    .orderBy(
      desc(directoryOwnerEditRequests.createdAt),
      asc(directoryOwnerEditRequests.id)
    )
    .limit(limit)

  return rows.map((row) => ({
    id: row.request.id,
    listingId: row.request.listingId,
    listingTitle: row.listingTitle,
    listingSlug: row.listingSlug,
    ownerName: row.ownerName,
    ownerEmail: row.ownerEmail,
    changes: (row.request.changes ?? {}) as OwnerChanges,
    status: row.request.status as EditRequestStatus,
    reviewNote: row.request.reviewNote,
    createdAt: row.request.createdAt,
    reviewedAt: row.request.reviewedAt,
  }))
}

export async function pendingEditRequestCount(
  workspaceId: string,
  database: CustomShellDb = db
): Promise<number> {
  const [row] = await database
    .select({ total: sql<number>`count(*)::int` })
    .from(directoryOwnerEditRequests)
    .where(
      and(
        eq(directoryOwnerEditRequests.workspaceId, workspaceId),
        eq(directoryOwnerEditRequests.status, "pending")
      )
    )
  return row?.total ?? 0
}

/**
 * An admin applying, or refusing, a change an owner asked for.
 *
 * Applying goes through `updateListing`, the same function the admin's own form
 * uses — so an owner's change is cleaned, capped and slug-checked exactly like
 * an admin's, rather than by a second path that would drift.
 */
export async function reviewEditRequest(
  workspaceId: string,
  id: string,
  input: { decision: "approve" | "reject"; note?: string; reviewerId: string },
  database: CustomShellDb = db
): Promise<{ listingId: string; ownerEmail: string; listingTitle: string }> {
  const [found] = await database
    .select({
      request: directoryOwnerEditRequests,
      ownerEmail: customShellUsers.email,
      listingTitle: directoryListings.title,
    })
    .from(directoryOwnerEditRequests)
    .innerJoin(
      directoryClaims,
      eq(directoryClaims.id, directoryOwnerEditRequests.claimId)
    )
    .innerJoin(customShellUsers, eq(customShellUsers.id, directoryClaims.userId))
    .innerJoin(
      directoryListings,
      eq(directoryListings.id, directoryOwnerEditRequests.listingId)
    )
    .where(
      and(
        eq(directoryOwnerEditRequests.id, id),
        eq(directoryOwnerEditRequests.workspaceId, workspaceId)
      )
    )
    .limit(1)

  if (!found) throw new Error("That request no longer exists.")
  if (found.request.status !== "pending") {
    throw new Error("Somebody has already dealt with this one.")
  }

  const at = now()

  if (input.decision === "reject") {
    await database
      .update(directoryOwnerEditRequests)
      .set({
        status: "rejected",
        reviewedAt: at,
        reviewedByUserId: input.reviewerId,
        reviewNote: (input.note ?? "").trim().slice(0, 500),
        updatedAt: at,
      })
      .where(eq(directoryOwnerEditRequests.id, found.request.id))

    return {
      listingId: found.request.listingId,
      ownerEmail: found.ownerEmail,
      listingTitle: found.listingTitle,
    }
  }

  // The listing and the request together: a listing changed while the request
  // still said "waiting" would come back to the admin a second time and be
  // applied twice.
  await database.transaction(async (tx) => {
    const changes = (found.request.changes ?? {}) as OwnerChanges
    await updateListing(workspaceId, found.request.listingId, changes, tx)

    const [updated] = await tx
      .update(directoryOwnerEditRequests)
      .set({
        status: "approved",
        reviewedAt: at,
        reviewedByUserId: input.reviewerId,
        reviewNote: (input.note ?? "").trim().slice(0, 500),
        updatedAt: at,
      })
      .where(
        and(
          eq(directoryOwnerEditRequests.id, found.request.id),
          eq(directoryOwnerEditRequests.status, "pending")
        )
      )
      .returning()

    if (!updated) throw new Error("Somebody has already dealt with this one.")
  })

  return {
    listingId: found.request.listingId,
    ownerEmail: found.ownerEmail,
    listingTitle: found.listingTitle,
  }
}

/** Claims and waiting changes on these listings, for the delete confirmation. */
export async function claimImpactForListings(
  workspaceId: string,
  listingIds: string[],
  database: CustomShellDb = db
): Promise<{ claims: number; pendingRequests: number }> {
  if (listingIds.length === 0) return { claims: 0, pendingRequests: 0 }

  const [[claimRow], [requestRow]] = await Promise.all([
    database
      .select({ count: sql<number>`count(*)::int` })
      .from(directoryClaims)
      .where(
        and(
          eq(directoryClaims.workspaceId, workspaceId),
          eq(directoryClaims.status, "approved"),
          inArray(directoryClaims.listingId, listingIds)
        )
      ),
    database
      .select({ count: sql<number>`count(*)::int` })
      .from(directoryOwnerEditRequests)
      .where(
        and(
          eq(directoryOwnerEditRequests.workspaceId, workspaceId),
          eq(directoryOwnerEditRequests.status, "pending"),
          inArray(directoryOwnerEditRequests.listingId, listingIds)
        )
      ),
  ])

  return {
    claims: claimRow?.count ?? 0,
    pendingRequests: requestRow?.count ?? 0,
  }
}
