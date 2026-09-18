import { and, asc, desc, eq, ilike, or, sql } from "drizzle-orm"

import { LISTING_REPORT_NOTE_MAX } from "@/lib/directory/field-lengths"
import { looksLikeEmail } from "@/lib/directory/submission-fields"
import {
  LISTING_REPORT_REASONS,
  type ListingReportReason,
  type ListingReportStatus,
} from "@/lib/directory/report-reasons"
import { now, uuid } from "@/server/auth/security"
import { db, type CustomShellDb } from "@/server/db"
import {
  directoryListingReports,
  directoryListings,
  type DirectoryListingReportRow,
} from "@/server/directory/schema"

/**
 * Problems visitors reported on a listing.
 *
 * One rule shapes this file: **a report changes nothing.** It does not edit the
 * listing, it never appears on a public page, and closing one only marks the
 * row. Everything an admin does about a report they do by hand to the listing
 * itself, which is why the queue links to the listing's editor rather than
 * offering to apply anything.
 *
 * Every read takes the site first and filters on it. A report filed on alpha is
 * invisible to beta's admins, and that is enforced here rather than in a route.
 */

export type DirectoryListingReport = {
  id: string
  listingId: string
  reason: ListingReportReason
  note: string
  reporterEmail: string
  status: ListingReportStatus
  closedAt: Date | null
  createdAt: Date
}

/** A queue row: the report plus the listing it is about, so nobody joins twice. */
export type ListingReportSummary = DirectoryListingReport & {
  listingTitle: string
  listingSlug: string
}

function toReport(row: DirectoryListingReportRow): DirectoryListingReport {
  return {
    id: row.id,
    listingId: row.listingId,
    reason: row.reason as ListingReportReason,
    note: row.note,
    reporterEmail: row.reporterEmail,
    status: row.status as ListingReportStatus,
    closedAt: row.closedAt,
    createdAt: row.createdAt,
  }
}

export type ListingReportInput = {
  listingId: string
  reason: string
  note?: string
  reporterEmail?: string
}

/**
 * The checks that need no database, so the caller can run them first.
 *
 * Separated for one reason: the public endpoint counts an attempt against a
 * rate limit, and a visitor who forgot the note would otherwise spend their one
 * report an hour on a typo and be locked out of saying the thing they came to
 * say. So the endpoint cleans the words first, counts second, writes third.
 *
 * `createReport` runs it again, so the server module is still safe called on
 * its own. Running it twice costs nothing.
 */
export function cleanReportInput(input: ListingReportInput): {
  reason: ListingReportReason
  note: string
  email: string
} {
  const reason = LISTING_REPORT_REASONS.find((known) => known === input.reason)
  if (!reason) throw new Error("Pick what is wrong with this listing.")

  // The same number the counter beside the box shows, read from the one file
  // that holds it. A literal here is how the two quietly start disagreeing.
  const note = (input.note ?? "").trim().slice(0, LISTING_REPORT_NOTE_MAX)
  // "Something else" with nothing else said gives the admin nothing to act on,
  // so it is refused at the door rather than filed and puzzled over later.
  if (reason === "other" && !note) {
    throw new Error("Tell us in a line or two what is wrong.")
  }

  const email = (input.reporterEmail ?? "").trim().toLowerCase().slice(0, 255)
  // Optional, but a typed address that is not an address is worth saying so
  // about — it is the only way the admin could have come back to them.
  if (email && !looksLikeEmail(email)) {
    throw new Error("That does not look like an email address.")
  }

  return { reason, note, email }
}

/**
 * A new report, filed by somebody with no account.
 *
 * The listing has to exist, be on this site and be published. A draft is not
 * found rather than refused, the same as everywhere else in the directory: a
 * page a visitor cannot read is a page they cannot have a complaint about, and
 * saying "that is a draft" would make drafts findable by guessing ids.
 */
export async function createReport(
  workspaceId: string,
  input: ListingReportInput,
  database: CustomShellDb = db
): Promise<{ report: DirectoryListingReport; listingTitle: string }> {
  const { reason, note, email } = cleanReportInput(input)

  const [listing] = await database
    .select({ id: directoryListings.id, title: directoryListings.title })
    .from(directoryListings)
    .where(
      and(
        eq(directoryListings.id, input.listingId),
        eq(directoryListings.workspaceId, workspaceId),
        eq(directoryListings.status, "published")
      )
    )
    .limit(1)

  if (!listing) throw new Error("That listing is no longer on this site.")

  const at = now()
  const [row] = await database
    .insert(directoryListingReports)
    .values({
      id: uuid(),
      workspaceId,
      listingId: listing.id,
      reason,
      note,
      reporterEmail: email,
      status: "open",
      createdAt: at,
      updatedAt: at,
    })
    .returning()

  if (!row) throw new Error("That could not be sent. Please try again.")
  return { report: toReport(row), listingTitle: listing.title }
}

export async function listReports(
  workspaceId: string,
  options: {
    status?: ListingReportStatus
    /** Matches the listing's title and the text of the note. */
    search?: string
    limit?: number
    offset?: number
  } = {},
  database: CustomShellDb = db
): Promise<{ reports: ListingReportSummary[]; total: number }> {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200)
  const offset = Math.max(options.offset ?? 0, 0)

  // The site's own reports, always. The search narrows what is already inside
  // that boundary — it never replaces it.
  const filters = [eq(directoryListingReports.workspaceId, workspaceId)]
  if (options.status) {
    filters.push(eq(directoryListingReports.status, options.status))
  }
  const search = options.search?.trim()
  if (search) {
    const pattern = `%${search}%`
    const searchFilter = or(
      ilike(directoryListings.title, pattern),
      ilike(directoryListingReports.note, pattern)
    )
    if (searchFilter) filters.push(searchFilter)
  }
  const where = and(...filters)

  const [rows, [countRow]] = await Promise.all([
    database
      .select({
        report: directoryListingReports,
        listingTitle: directoryListings.title,
        listingSlug: directoryListings.slug,
      })
      .from(directoryListingReports)
      .innerJoin(
        directoryListings,
        eq(directoryListings.id, directoryListingReports.listingId)
      )
      .where(where)
      .orderBy(
        desc(directoryListingReports.createdAt),
        asc(directoryListingReports.id)
      )
      .limit(limit)
      .offset(offset),
    // The same join as the page above it, because the search reaches the
    // listing's title — count without it and "1-50 of N" counts a different set
    // from the one on screen.
    database
      .select({ total: sql<number>`count(*)::int` })
      .from(directoryListingReports)
      .innerJoin(
        directoryListings,
        eq(directoryListings.id, directoryListingReports.listingId)
      )
      .where(where),
  ])

  return {
    reports: rows.map((row) => ({
      ...toReport(row.report),
      listingTitle: row.listingTitle,
      listingSlug: row.listingSlug,
    })),
    total: countRow?.total ?? 0,
  }
}

/** How many are still waiting on this site, for the count on the queue screen. */
export async function openReportCount(
  workspaceId: string,
  database: CustomShellDb = db
): Promise<number> {
  const [row] = await database
    .select({ total: sql<number>`count(*)::int` })
    .from(directoryListingReports)
    .where(
      and(
        eq(directoryListingReports.workspaceId, workspaceId),
        eq(directoryListingReports.status, "open")
      )
    )
  return row?.total ?? 0
}

/**
 * An admin marking a report dealt with.
 *
 * The old status is part of the match, so two admins pressing Fixed at the same
 * moment cannot both get through and the second is told somebody beat them to
 * it rather than silently overwriting the first answer.
 */
export async function closeReport(
  workspaceId: string,
  id: string,
  input: { decision: "fixed" | "dismissed"; reviewerId: string },
  database: CustomShellDb = db
): Promise<DirectoryListingReport> {
  const at = now()
  const [updated] = await database
    .update(directoryListingReports)
    .set({
      status: input.decision,
      closedAt: at,
      closedByUserId: input.reviewerId,
      updatedAt: at,
    })
    .where(
      and(
        eq(directoryListingReports.id, id),
        eq(directoryListingReports.workspaceId, workspaceId),
        eq(directoryListingReports.status, "open")
      )
    )
    .returning()

  if (!updated) throw new Error("Somebody has already dealt with this one.")
  return toReport(updated)
}
