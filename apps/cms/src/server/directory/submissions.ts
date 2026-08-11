import { and, asc, desc, eq, inArray, sql } from "drizzle-orm"

import { looksLikeEmail } from "@/lib/directory/submission-fields"
import type { ReviewStatus } from "@/lib/directory/review-status"
import { cleanWrittenPageBody } from "@/lib/pages/written-page-body"
import {
  createSecretToken,
  hashToken,
  now,
  uuid,
} from "@/server/auth/security"
import { db, type CustomShellDb } from "@/server/db"
import {
  categories,
  directoryListings,
  directorySubmissions,
  type DirectorySubmissionRow,
} from "@/server/directory/schema"
import {
  createListing,
  setListingCategories,
  updateListing,
} from "@/server/directory/listings"

/**
 * Listings the public asked for.
 *
 * The shape of this file is one rule: **a submission is not a listing and never
 * quietly becomes one.** It is a row of what somebody typed, it is invisible
 * until they prove the email address, and it turns into a published listing only
 * when an admin says so — once, because the row remembers what it became.
 *
 * Every read takes the site first and filters on it, exactly like the listings
 * beside it. A submission made on alpha can only ever become a listing on alpha,
 * and that is enforced here rather than in a route.
 */

/** How long a verification link works for. Long enough to survive a weekend. */
const VERIFY_WINDOW_MS = 3 * 24 * 60 * 60 * 1000

export type SubmissionInput = {
  businessName: string
  contactEmail: string
  address?: string
  phone?: string
  website?: string
  description?: string
  categoryIds?: string[]
}

export type DirectorySubmission = {
  id: string
  businessName: string
  contactEmail: string
  address: string
  phone: string
  website: string
  description: string
  categoryIds: string[]
  status: ReviewStatus
  verifiedAt: Date | null
  reviewedAt: Date | null
  reviewNote: string
  listingId: string | null
  createdAt: Date
}

/** A queue row: the same record plus the category names, so nobody joins twice. */
export type SubmissionSummary = DirectorySubmission & {
  categoryNames: string[]
}

function toSubmission(row: DirectorySubmissionRow): DirectorySubmission {
  return {
    id: row.id,
    businessName: row.businessName,
    contactEmail: row.contactEmail,
    address: row.address,
    phone: row.phone,
    website: row.website,
    description: row.description,
    categoryIds: Array.isArray(row.categoryIds)
      ? (row.categoryIds as unknown[]).filter(
          (id): id is string => typeof id === "string"
        )
      : [],
    status: row.status as ReviewStatus,
    verifiedAt: row.verifiedAt,
    reviewedAt: row.reviewedAt,
    reviewNote: row.reviewNote,
    listingId: row.listingId,
    createdAt: row.createdAt,
  }
}

function cleanLine(value: string | undefined, max: number): string {
  return (value ?? "").trim().slice(0, max)
}

/**
 * A new submission, waiting on its email.
 *
 * Returns the plain token as well as the row, because this is the only moment
 * it exists in readable form — the table keeps the hash. The caller emails it
 * and then has nothing to hand anybody a second time, which is the point.
 */
export async function createSubmission(
  workspaceId: string,
  input: SubmissionInput,
  database: CustomShellDb = db
): Promise<{ submission: DirectorySubmission; token: string }> {
  const businessName = cleanLine(input.businessName, 200)
  if (!businessName) throw new Error("The business needs a name.")

  const contactEmail = cleanLine(input.contactEmail, 255).toLowerCase()
  if (!looksLikeEmail(contactEmail)) {
    throw new Error("That does not look like an email address.")
  }

  // Only this site's categories, and only ones that exist. A picker showing a
  // stale tree must not be able to file a submission under another site's
  // category.
  const wanted = [...new Set(input.categoryIds ?? [])].slice(0, 20)
  const known = wanted.length
    ? await database
        .select({ id: categories.id })
        .from(categories)
        .where(
          and(
            eq(categories.workspaceId, workspaceId),
            inArray(categories.id, wanted)
          )
        )
    : []

  const at = now()
  const token = createSecretToken()

  const [row] = await database
    .insert(directorySubmissions)
    .values({
      id: uuid(),
      workspaceId,
      businessName,
      contactEmail,
      address: cleanLine(input.address, 300),
      phone: cleanLine(input.phone, 60),
      website: cleanLine(input.website, 2000),
      description: cleanLine(input.description, 2000),
      categoryIds: known.map((category) => category.id),
      status: "pending_verification",
      verifyTokenHash: hashToken(token),
      verifyExpiresAt: new Date(at.getTime() + VERIFY_WINDOW_MS),
      createdAt: at,
      updatedAt: at,
    })
    .returning()

  if (!row) throw new Error("That could not be sent. Please try again.")
  return { submission: toSubmission(row), token }
}

/**
 * Somebody clicked the link in the email.
 *
 * The token is looked up by its hash across every site: a link in an inbox
 * carries no host, and the row itself says which site it belongs to. Consuming
 * it clears the hash, so the same link cannot be replayed.
 *
 * The three ways this fails are told apart on purpose — an expired link should
 * offer to send another, and an unknown one should not.
 */
export async function verifySubmission(
  token: string,
  database: CustomShellDb = db
): Promise<
  | { outcome: "verified"; workspaceId: string; businessName: string }
  | { outcome: "expired" }
  | { outcome: "unknown" }
  | { outcome: "already" }
> {
  const [row] = await database
    .select()
    .from(directorySubmissions)
    .where(eq(directorySubmissions.verifyTokenHash, hashToken(token)))
    .limit(1)

  if (!row) return { outcome: "unknown" }
  if (row.status !== "pending_verification") return { outcome: "already" }
  if (!row.verifyExpiresAt || row.verifyExpiresAt <= now()) {
    return { outcome: "expired" }
  }

  const at = now()
  await database
    .update(directorySubmissions)
    .set({
      status: "pending_review",
      verifiedAt: at,
      // Consumed. The link is not a password to keep.
      verifyTokenHash: null,
      verifyExpiresAt: null,
      updatedAt: at,
    })
    .where(eq(directorySubmissions.id, row.id))

  return {
    outcome: "verified",
    workspaceId: row.workspaceId,
    businessName: row.businessName,
  }
}

/** A fresh link for somebody whose last one went stale. */
export async function resendSubmissionVerification(
  workspaceId: string,
  email: string,
  database: CustomShellDb = db
): Promise<{ submission: DirectorySubmission; token: string } | null> {
  const [row] = await database
    .select()
    .from(directorySubmissions)
    .where(
      and(
        eq(directorySubmissions.workspaceId, workspaceId),
        eq(directorySubmissions.contactEmail, email.trim().toLowerCase()),
        eq(directorySubmissions.status, "pending_verification")
      )
    )
    .orderBy(desc(directorySubmissions.createdAt))
    .limit(1)

  if (!row) return null

  const at = now()
  const token = createSecretToken()
  const [updated] = await database
    .update(directorySubmissions)
    .set({
      verifyTokenHash: hashToken(token),
      verifyExpiresAt: new Date(at.getTime() + VERIFY_WINDOW_MS),
      updatedAt: at,
    })
    .where(eq(directorySubmissions.id, row.id))
    .returning()

  return updated ? { submission: toSubmission(updated), token } : null
}

/**
 * The queue.
 *
 * **Never shows `pending_verification`.** A submission nobody has proved the
 * address of is not work for an admin, and a queue full of them is how a review
 * screen becomes something people stop opening.
 */
export async function listSubmissions(
  workspaceId: string,
  options: { status?: ReviewStatus; limit?: number; offset?: number } = {},
  database: CustomShellDb = db
): Promise<{ submissions: SubmissionSummary[]; total: number }> {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200)
  const offset = Math.max(options.offset ?? 0, 0)

  const filters = [
    eq(directorySubmissions.workspaceId, workspaceId),
    options.status
      ? eq(directorySubmissions.status, options.status)
      : inArray(directorySubmissions.status, [
          "pending_review",
          "approved",
          "rejected",
        ]),
  ]
  const where = and(...filters)

  const [rows, [countRow]] = await Promise.all([
    database
      .select()
      .from(directorySubmissions)
      .where(where)
      // Newest first, with the id breaking ties so a page boundary cannot land
      // mid-tie and show the same submission twice or skip one.
      .orderBy(
        desc(directorySubmissions.createdAt),
        asc(directorySubmissions.id)
      )
      .limit(limit)
      .offset(offset),
    database
      .select({ total: sql<number>`count(*)::int` })
      .from(directorySubmissions)
      .where(where),
  ])

  const names = await categoryNames(
    workspaceId,
    rows.flatMap((row) =>
      Array.isArray(row.categoryIds) ? (row.categoryIds as string[]) : []
    ),
    database
  )

  return {
    submissions: rows.map((row) => {
      const submission = toSubmission(row)
      return {
        ...submission,
        categoryNames: submission.categoryIds
          .map((id) => names.get(id))
          .filter((name): name is string => Boolean(name)),
      }
    }),
    total: countRow?.total ?? 0,
  }
}

/** One lookup for every category named across the whole page of rows. */
async function categoryNames(
  workspaceId: string,
  ids: string[],
  database: CustomShellDb
): Promise<Map<string, string>> {
  const unique = [...new Set(ids)]
  if (unique.length === 0) return new Map()

  const rows = await database
    .select({ id: categories.id, name: categories.name })
    .from(categories)
    .where(
      and(
        eq(categories.workspaceId, workspaceId),
        inArray(categories.id, unique)
      )
    )
  return new Map(rows.map((row) => [row.id, row.name]))
}

/** How many are waiting, for the screen to say so without loading the list. */
export async function pendingSubmissionCount(
  workspaceId: string,
  database: CustomShellDb = db
): Promise<number> {
  const [row] = await database
    .select({ total: sql<number>`count(*)::int` })
    .from(directorySubmissions)
    .where(
      and(
        eq(directorySubmissions.workspaceId, workspaceId),
        eq(directorySubmissions.status, "pending_review")
      )
    )
  return row?.total ?? 0
}

/** The description as a body: its paragraphs, and nothing that could be markup. */
function bodyFromDescription(description: string) {
  const paragraphs = description
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean)

  return cleanWrittenPageBody({
    type: "doc",
    content: paragraphs.map((text) => ({
      type: "paragraph",
      content: [{ type: "text", text }],
    })),
  })
}

/** The links a submitted business gets, built from the boxes it filled in. */
function contactLinksFromSubmission(row: DirectorySubmissionRow) {
  const menuLinks: { id: string; type: string; label: string; value: string }[] =
    []
  if (row.phone) {
    menuLinks.push({ id: "menu-phone", type: "phone", label: "", value: row.phone })
  }
  if (row.website) {
    menuLinks.push({
      id: "menu-website",
      type: "website",
      label: "",
      value: row.website,
    })
  }
  menuLinks.push({
    id: "menu-email",
    type: "email",
    label: "",
    value: row.contactEmail,
  })
  if (row.address) {
    menuLinks.push({
      id: "menu-directions",
      type: "directions",
      label: "",
      value: row.address,
    })
  }
  // Cleaned by `updateListing`, which runs every value through
  // `cleanContactLinks` — nothing typed into a public form reaches the column
  // as it was typed.
  return { address: row.address, menuLinks, socialLinks: [] }
}

export type SubmissionDecision = "approve" | "reject"

/**
 * An admin's answer.
 *
 * Approving builds the listing in one transaction: create, fill in, publish,
 * tag, and mark the submission with what it became. **Approving twice cannot
 * make two listings** — the row already carries a `listingId`, and the second
 * attempt is refused rather than quietly making a twin.
 */
export async function reviewSubmission(
  workspaceId: string,
  id: string,
  input: {
    decision: SubmissionDecision
    note?: string
    reviewerId: string
  },
  database: CustomShellDb = db
): Promise<{ submission: DirectorySubmission; listingId: string | null }> {
  const [row] = await database
    .select()
    .from(directorySubmissions)
    .where(
      and(
        eq(directorySubmissions.id, id),
        eq(directorySubmissions.workspaceId, workspaceId)
      )
    )
    .limit(1)

  if (!row) throw new Error("That submission no longer exists.")
  if (row.status === "pending_verification") {
    throw new Error(
      "This one is still waiting for the sender to confirm their email address."
    )
  }
  if (row.status !== "pending_review") {
    throw new Error("Somebody has already dealt with this one.")
  }

  const at = now()
  const note = (input.note ?? "").trim().slice(0, 500)

  if (input.decision === "reject") {
    const [updated] = await database
      .update(directorySubmissions)
      .set({
        status: "rejected",
        reviewedAt: at,
        reviewedByUserId: input.reviewerId,
        reviewNote: note,
        updatedAt: at,
      })
      .where(eq(directorySubmissions.id, row.id))
      .returning()

    if (!updated) throw new Error("That submission no longer exists.")
    return { submission: toSubmission(updated), listingId: null }
  }

  // All of it or none of it. A listing created without its categories, or a
  // submission left saying "pending" beside a listing that already exists, are
  // both states nothing in the app can produce on purpose.
  const result = await database.transaction(async (tx) => {
    const listing = await createListing(
      workspaceId,
      { title: row.businessName },
      tx
    )
    await updateListing(
      workspaceId,
      listing.id,
      {
        status: "published",
        metaDescription: row.description.slice(0, 300),
        contactLinks: contactLinksFromSubmission(row),
        body: bodyFromDescription(row.description),
      },
      tx
    )

    const categoryIds = Array.isArray(row.categoryIds)
      ? (row.categoryIds as string[])
      : []
    if (categoryIds.length) {
      await setListingCategories(
        workspaceId,
        listing.id,
        categoryIds,
        categoryIds[0] ?? null,
        tx
      )
    }

    const [updated] = await tx
      .update(directorySubmissions)
      .set({
        status: "approved",
        reviewedAt: at,
        reviewedByUserId: input.reviewerId,
        reviewNote: note,
        listingId: listing.id,
        updatedAt: at,
      })
      // The status is part of the match, so two admins pressing Approve at the
      // same moment cannot both get through: the second updates nothing.
      .where(
        and(
          eq(directorySubmissions.id, row.id),
          eq(directorySubmissions.status, "pending_review")
        )
      )
      .returning()

    if (!updated) throw new Error("Somebody has already dealt with this one.")
    return { submission: toSubmission(updated), listingId: listing.id }
  })

  return result
}

/** The listing an approved submission became, for the queue to link to. */
export async function listingTitlesFor(
  workspaceId: string,
  ids: string[],
  database: CustomShellDb = db
): Promise<Map<string, { title: string; slug: string }>> {
  const unique = ids.filter(Boolean)
  if (unique.length === 0) return new Map()

  const rows = await database
    .select({
      id: directoryListings.id,
      title: directoryListings.title,
      slug: directoryListings.slug,
    })
    .from(directoryListings)
    .where(
      and(
        eq(directoryListings.workspaceId, workspaceId),
        inArray(directoryListings.id, unique)
      )
    )
  return new Map(rows.map((row) => [row.id, { title: row.title, slug: row.slug }]))
}
