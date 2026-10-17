import { and, asc, desc, eq, ilike, inArray, or, sql } from "drizzle-orm"

import { cleanContactLinks } from "@/lib/directory/contact-links"
import {
  MAX_DUPLICATES_PER_SUBMISSION,
  duplicateMatchKinds,
  duplicateNameKey,
  duplicatePhoneKey,
  duplicateWebsiteKey,
  submissionDuplicateKeys,
  type DuplicateMatch,
} from "@/lib/directory/submission-duplicates"
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
import { directorySettingsFor } from "@/server/directory/settings"
import { directorySiteUrl } from "@/server/directory/site-url"
import { customShellWorkspaces } from "@/server/schema"
import {
  fireSubmissionApproved,
  fireSubmissionArrived,
} from "@/server/directory/automation-events"
import {
  categories,
  directoryClaims,
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

  // Now it is in the review queue. Never throws: a flow that cannot start
  // must not stand between the sender and "thanks, we have it".
  await fireSubmissionArrived(row, database)

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
  options: {
    status?: ReviewStatus
    /** Matches the business name or the contact email. */
    search?: string
    limit?: number
    offset?: number
  } = {},
  database: CustomShellDb = db
): Promise<{ submissions: SubmissionSummary[]; total: number }> {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200)
  const offset = Math.max(options.offset ?? 0, 0)

  // The site's own submissions, always. The search narrows what is already
  // inside that boundary — it never replaces it, or one site's admin would be
  // searching every other site's queue.
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
  const search = options.search?.trim()
  if (search) {
    const pattern = `%${search}%`
    const searchFilter = or(
      ilike(directorySubmissions.businessName, pattern),
      ilike(directorySubmissions.contactEmail, pattern)
    )
    if (searchFilter) filters.push(searchFilter)
  }
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

function textArray(values: string[]) {
  if (!values.length) return sql`ARRAY[]::text[]`
  return sql`ARRAY[${sql.join(
    values.map((value) => sql`${value}`),
    sql`, `
  )}]::text[]`
}

/** Enough candidates for a page of fifty submissions that each name a chain. */
const DUPLICATE_CANDIDATE_LIMIT = 500

/**
 * The listings already on this site that each submission looks like.
 *
 * **One query for the whole page**, however many submissions are on it. The
 * query only narrows the site's listings down to the ones that could match:
 * a name key equal to or inside one of the submitted names, a phone whose
 * last ten digits are one of the submitted numbers, or a website that contains
 * one of the submitted hosts. Which submission each one matches, and on what,
 * is then decided by `lib/directory/submission-duplicates.ts`, so there is one
 * rule and not two.
 *
 * Every status of listing counts. A draft somebody started last week is the
 * same business as the one being submitted today.
 */
export async function possibleDuplicatesFor(
  workspaceId: string,
  submissions: Pick<
    DirectorySubmission,
    "id" | "businessName" | "phone" | "website"
  >[],
  database: CustomShellDb = db
): Promise<Map<string, DuplicateMatch[]>> {
  const keyed = submissions.map((submission) => ({
    id: submission.id,
    keys: submissionDuplicateKeys(submission),
  }))
  const names = [...new Set(keyed.map((row) => row.keys.name).filter(Boolean))]
  const phones = [...new Set(keyed.map((row) => row.keys.phone).filter(Boolean))]
  const websites = [
    ...new Set(keyed.map((row) => row.keys.website).filter(Boolean)),
  ]
  if (!names.length && !phones.length && !websites.length) return new Map()

  // The name key is worked out once per listing, in the first step, rather
  // than once per listing per submitted name: 50 names against 3,333 listings
  // took 550ms the other way and 56ms this way. `duplicateNameKey` is the same
  // rule in TypeScript, and the test that names "The Luigi's Pizza & Pasta"
  // holds the two together.
  const result = await database.execute(sql`
    WITH site_listing AS MATERIALIZED (
      SELECT
        listing.id,
        listing.title,
        listing.slug,
        listing.status,
        listing.contact_links,
        regexp_replace(
          regexp_replace(
            regexp_replace(lower(listing.title), '&', 'and', 'g'),
            '^\\s*the\\s+', ''
          ),
          '[^a-z0-9]+', '', 'g'
        ) AS name_key,
        CASE WHEN jsonb_typeof(listing.contact_links->'menuLinks') = 'array'
          THEN listing.contact_links->'menuLinks'
          ELSE '[]'::jsonb
        END AS menu_links
      FROM directory_listings listing
      WHERE listing.workspace_id = ${workspaceId}
    )
    SELECT id, title, slug, status, contact_links AS "contactLinks"
    FROM site_listing
    WHERE EXISTS (
        SELECT 1 FROM unnest(${textArray(names)}) AS wanted(key)
        WHERE wanted.key = site_listing.name_key
          OR (length(wanted.key) >= 8 AND position(wanted.key IN site_listing.name_key) > 0)
          OR (length(site_listing.name_key) >= 8 AND position(site_listing.name_key IN wanted.key) > 0)
      )
      OR EXISTS (
        SELECT 1 FROM jsonb_array_elements(site_listing.menu_links) AS link
        WHERE link->>'type' = 'phone'
          AND right(regexp_replace(link->>'value', '\\D', '', 'g'), 10) = ANY(${textArray(phones)})
      )
      OR EXISTS (
        SELECT 1
        FROM jsonb_array_elements(site_listing.menu_links) AS link,
          unnest(${textArray(websites)}) AS wanted(key)
        WHERE link->>'type' = 'website'
          AND position(wanted.key IN lower(link->>'value')) > 0
      )
    ORDER BY title, id
    LIMIT ${DUPLICATE_CANDIDATE_LIMIT}
  `)
  const candidates = result.rows as Array<{
    id: string
    title: string
    slug: string
    status: string
    contactLinks: unknown
  }>

  const listings = candidates.map((row) => {
    const links = cleanContactLinks(row.contactLinks).menuLinks
    return {
      row,
      keys: {
        name: duplicateNameKey(row.title),
        phones: new Set(
          links
            .filter((link) => link.type === "phone")
            .map((link) => duplicatePhoneKey(link.value))
            .filter(Boolean)
        ),
        websites: new Set(
          links
            .filter((link) => link.type === "website")
            .map((link) => duplicateWebsiteKey(link.value))
            .filter(Boolean)
        ),
      },
    }
  })

  const found = new Map<string, DuplicateMatch[]>()
  for (const submission of keyed) {
    const matches = listings
      .map(({ row, keys }) => ({
        listingId: row.id,
        title: row.title,
        slug: row.slug,
        status: row.status,
        matched: duplicateMatchKinds(submission.keys, keys),
      }))
      .filter((match) => match.matched.length > 0)
      // More things matching first, and a phone before a website before a
      // name, because a shared number is the surest sign of the three.
      .sort(
        (a, b) =>
          b.matched.length - a.matched.length ||
          strength(a.matched) - strength(b.matched)
      )
      .slice(0, MAX_DUPLICATES_PER_SUBMISSION)
    if (matches.length) found.set(submission.id, matches)
  }
  return found
}

function strength(kinds: DuplicateMatch["matched"]) {
  return kinds.includes("phone") ? 0 : kinds.includes("website") ? 1 : 2
}

/**
 * Where a rejected sender is sent instead, when the admin rejected the
 * submission because the business is already listed.
 *
 * The claim form when the site offers claiming and nobody owns the listing
 * yet, so the sender can look after the page that exists. Otherwise the page
 * itself. Only a published listing can be pointed to, because a draft has no
 * page for a stranger to open.
 */
async function pointerToListing(
  workspaceId: string,
  listingId: string,
  database: CustomShellDb
): Promise<{ sentence: string; action: { label: string; url: string } }> {
  const [listing] = await database
    .select({
      id: directoryListings.id,
      title: directoryListings.title,
      slug: directoryListings.slug,
      status: directoryListings.status,
    })
    .from(directoryListings)
    .where(
      and(
        eq(directoryListings.id, listingId),
        eq(directoryListings.workspaceId, workspaceId)
      )
    )
    .limit(1)
  if (!listing) throw new Error("That listing no longer exists.")
  if (listing.status !== "published") {
    throw new Error(
      `${listing.title} is a draft, so there is no page to send the sender to. Publish it first, or reject without pointing to it.`
    )
  }

  const [[site], settings, [owned]] = await Promise.all([
    database
      .select({
        name: customShellWorkspaces.name,
        subdomain: customShellWorkspaces.subdomain,
        customDomain: customShellWorkspaces.customDomain,
      })
      .from(customShellWorkspaces)
      .where(eq(customShellWorkspaces.id, workspaceId))
      .limit(1),
    directorySettingsFor(workspaceId, database),
    database
      .select({ id: directoryClaims.id })
      .from(directoryClaims)
      .where(
        and(
          eq(directoryClaims.workspaceId, workspaceId),
          eq(directoryClaims.listingId, listing.id),
          eq(directoryClaims.status, "approved")
        )
      )
      .limit(1),
  ])
  if (!site) throw new Error("That site no longer exists.")

  // The site's own address, never the admin's: an admin working on the
  // deployment's host must not send a stranger there.
  const page = `${directorySiteUrl(site)}/directory/${listing.slug}`
  if (settings.claimsEnabled && !owned) {
    return {
      sentence: `It looks like ${listing.title}, which is already listed on ${site.name}. If it is your business, claim it from its page and you can keep its details up to date.`,
      action: { label: `Claim ${listing.title}`, url: `${page}?claim=start` },
    }
  }
  return {
    sentence: `It looks like ${listing.title}, which is already listed on ${site.name}.`,
    action: { label: `See ${listing.title}`, url: page },
  }
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
    /**
     * Rejecting because this listing already exists. The note sent says so,
     * and the email carries a button to that listing's claim form or page.
     */
    alreadyListedId?: string
  },
  database: CustomShellDb = db
): Promise<{
  submission: DirectorySubmission
  listingId: string | null
  /** The button the rejection email carries, when it points to a listing. */
  pointTo: { label: string; url: string } | null
}> {
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
    const pointer = input.alreadyListedId
      ? await pointerToListing(workspaceId, input.alreadyListedId, database)
      : null
    // The sentence goes into the note itself, so the record of what was sent
    // and the email are the same words. The admin's own note follows it.
    const sentNote = pointer
      ? [pointer.sentence, note].filter(Boolean).join("\n\n").slice(0, 500)
      : note

    const [updated] = await database
      .update(directorySubmissions)
      .set({
        status: "rejected",
        reviewedAt: at,
        reviewedByUserId: input.reviewerId,
        reviewNote: sentNote,
        updatedAt: at,
      })
      .where(eq(directorySubmissions.id, row.id))
      .returning()

    if (!updated) throw new Error("That submission no longer exists.")
    return {
      submission: toSubmission(updated),
      listingId: null,
      pointTo: pointer?.action ?? null,
    }
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
    return {
      submission: toSubmission(updated),
      listingId: listing.id,
      pointTo: null,
    }
  })

  // After the listing is saved, never inside the transaction, and it never
  // throws, so a flow that cannot start cannot undo the approval.
  await fireSubmissionApproved(row, result.listingId, database)

  return result
}

/**
 * The email the sender gets about the decision. A rejection that points to an
 * existing listing carries that listing's button, and its address underneath
 * for a mail reader that drops buttons.
 */
export function submissionDecisionEmail(
  submission: Pick<DirectorySubmission, "businessName" | "reviewNote">,
  decision: SubmissionDecision,
  pointTo: { label: string; url: string } | null
): {
  subject: string
  lines: string[]
  action?: { label: string; url: string }
} {
  if (decision === "approve") {
    return {
      subject: `${submission.businessName} is now listed`,
      lines: [
        `${submission.businessName} is on the site now.`,
        submission.reviewNote,
      ].filter(Boolean),
    }
  }
  return {
    subject: `About your listing for ${submission.businessName}`,
    lines: [
      `We are not adding ${submission.businessName} at the moment.`,
      submission.reviewNote ||
        "If you think this is a mistake, reply to this email.",
    ],
    ...(pointTo ? { action: pointTo } : {}),
  }
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
