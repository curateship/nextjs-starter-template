import { and, asc, desc, eq, ilike, isNotNull, or, sql } from "drizzle-orm"

import { LISTING_REPORT_NOTE_MAX } from "@/lib/directory/field-lengths"
import { looksLikeEmail } from "@/lib/directory/submission-fields"
import {
  EVENT_REPORT_REASONS,
  LISTING_REPORT_REASONS,
  PROMOTION_REPORT_REASONS,
  type ReportKind,
  type ReportReason,
  type ListingReportStatus,
} from "@/lib/directory/report-reasons"
import { enforceRateLimit } from "@/server/auth/rate-limit"
import { now, uuid } from "@/server/auth/security"
import { db, type CustomShellDb } from "@/server/db"
import {
  directoryListingReports,
  directoryListings,
  type DirectoryListingReportRow,
} from "@/server/directory/schema"
import { findReportableEvent } from "@/server/events/public"
import { siteEvents } from "@/server/events/schema"
import { findReportableDeal } from "@/server/promotions/public"
import { sitePromotions } from "@/server/promotions/schema"

/**
 * Problems visitors reported on a listing, an event or a deal.
 *
 * One rule shapes this file: **a report changes nothing.** It does not edit the
 * listing or event, it never appears on a public page, and closing one only
 * marks the row. Everything an admin does about a report they do by hand to
 * the page itself, which is why the queue links to its editor rather than
 * offering to apply anything.
 *
 * Every read takes the site first and filters on it. A report filed on alpha is
 * invisible to beta's admins, and that is enforced here rather than in a route.
 */

export type ProblemReport = {
  id: string
  kind: ReportKind
  /** The listing's id or the event's id, whichever `kind` says. */
  subjectId: string
  reason: ReportReason
  note: string
  reporterEmail: string
  status: ListingReportStatus
  closedAt: Date | null
  createdAt: Date
}

/**
 * A queue row: the report plus the title and address of what it is about, so
 * nobody joins twice.
 */
export type ProblemReportSummary = ProblemReport & {
  subjectTitle: string
  subjectSlug: string
}

function toReport(row: DirectoryListingReportRow): ProblemReport {
  // The database holds exactly one of the three ids, so the one that is set
  // says which kind this is.
  const kind: ReportKind = row.promotionId
    ? "promotion"
    : row.eventId
      ? "event"
      : "listing"
  return {
    id: row.id,
    kind,
    subjectId: row.promotionId ?? row.eventId ?? row.listingId ?? "",
    reason: row.reason as ReportReason,
    note: row.note,
    reporterEmail: row.reporterEmail,
    status: row.status as ListingReportStatus,
    closedAt: row.closedAt,
    createdAt: row.createdAt,
  }
}

export type ReportInput = {
  kind: ReportKind
  /** The listing's id or the event's id. */
  subjectId: string
  reason: string
  note?: string
  reporterEmail?: string
}

const REASONS_FOR: Record<ReportKind, readonly string[]> = {
  listing: LISTING_REPORT_REASONS,
  event: EVENT_REPORT_REASONS,
  promotion: PROMOTION_REPORT_REASONS,
}

/** "listing", "event" or "deal", for a sentence a visitor reads. */
const NOUN_FOR: Record<ReportKind, string> = {
  listing: "listing",
  event: "event",
  promotion: "deal",
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
export function cleanReportInput(input: ReportInput): {
  reason: ReportReason
  note: string
  email: string
} {
  // An event reason on a listing is refused like a made-up one, so each kind
  // only ever stores reasons from its own list.
  const reason = REASONS_FOR[input.kind].find((known) => known === input.reason)
  if (!reason) throw new Error(`Pick what is wrong with this ${NOUN_FOR[input.kind]}.`)

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

  return { reason: reason as ReportReason, note, email }
}

/** Counts one attempt, and says in words what this particular limit means. */
async function countAttempt(
  key: string,
  limit: number,
  refusal: string,
  database: CustomShellDb
) {
  try {
    await enforceRateLimit(
      key,
      { maxAttempts: limit, windowSeconds: 60 * 60 },
      database
    )
  } catch (error) {
    if (error instanceof Error && error.message === "RATE_LIMITED") {
      throw new Error(refusal)
    }
    throw error
  }
}

/**
 * The three limits on the public form, counted in this order.
 *
 * - **One report per listing or event per hour, per visitor.** The "sending
 *   twice in a row is refused" rule said in a way the database enforces.
 * - **Ten an hour per visitor**, listings and events together, so one person
 *   cannot report fifty pages.
 * - **Fifty an hour for the whole site**, listings and events together,
 *   because every report is an email to the admins.
 *
 * Each says something different when it refuses, because they mean different
 * things. `from` is the visitor's address; "unknown" when a proxy hid it, and
 * then everybody behind that proxy shares one bucket. Stricter is the right way
 * for this to fail.
 */
export async function countReportAttempt(
  siteId: string,
  from: string,
  about: { kind: ReportKind; subjectId: string },
  database: CustomShellDb = db
) {
  // A listing's key is the one it has always had, so a visitor who reported a
  // listing just before this shipped is still counted.
  const perPage =
    about.kind === "listing"
      ? `directory-report:${siteId}:${from}:${about.subjectId}`
      : `directory-report:${siteId}:${from}:${about.kind}:${about.subjectId}`
  await countAttempt(
    perPage,
    1,
    `You have already sent a report about this ${NOUN_FOR[about.kind]}. Give it a while before sending another.`,
    database
  )
  await countAttempt(
    `directory-report-ip:${siteId}:${from}`,
    10,
    "That is a lot of reports in a short time. Please wait an hour and try again.",
    database
  )
  await countAttempt(
    `directory-report-site:${siteId}`,
    50,
    "This site has had a lot of reports in the last hour. Please try again later.",
    database
  )
}

/**
 * The listing or event a new report is about, or null when a visitor could
 * not have read it here.
 *
 * It has to exist, be on this site and be published. A draft is not found
 * rather than refused, the same as everywhere else: a page a visitor cannot
 * read is a page they cannot have a complaint about, and saying "that is a
 * draft" would make drafts findable by guessing ids.
 */
async function findSubject(
  workspaceId: string,
  kind: ReportKind,
  id: string,
  database: CustomShellDb
): Promise<{ id: string; title: string } | null> {
  if (kind === "event") return findReportableEvent(workspaceId, id, database)
  if (kind === "promotion") return findReportableDeal(workspaceId, id, database)

  const [listing] = await database
    .select({ id: directoryListings.id, title: directoryListings.title })
    .from(directoryListings)
    .where(
      and(
        eq(directoryListings.id, id),
        eq(directoryListings.workspaceId, workspaceId),
        eq(directoryListings.status, "published")
      )
    )
    .limit(1)
  return listing ?? null
}

/** A new report, filed by somebody with no account. */
export async function createReport(
  workspaceId: string,
  input: ReportInput,
  database: CustomShellDb = db
): Promise<{ report: ProblemReport; subjectTitle: string }> {
  const { reason, note, email } = cleanReportInput(input)

  const subject = await findSubject(
    workspaceId,
    input.kind,
    input.subjectId,
    database
  )
  if (!subject) {
    throw new Error(`That ${NOUN_FOR[input.kind]} is no longer on this site.`)
  }

  const at = now()
  const [row] = await database
    .insert(directoryListingReports)
    .values({
      id: uuid(),
      workspaceId,
      listingId: input.kind === "listing" ? subject.id : null,
      eventId: input.kind === "event" ? subject.id : null,
      promotionId: input.kind === "promotion" ? subject.id : null,
      reason,
      note,
      reporterEmail: email,
      status: "open",
      createdAt: at,
      updatedAt: at,
    })
    .returning()

  if (!row) throw new Error("That could not be sent. Please try again.")
  return { report: toReport(row), subjectTitle: subject.title }
}

export async function listReports(
  workspaceId: string,
  options: {
    status?: ListingReportStatus
    /** Only reports about listings, or events, or deals. */
    kind?: ReportKind
    /** Matches the listing's or event's title and the text of the note. */
    search?: string
    limit?: number
    offset?: number
  } = {},
  database: CustomShellDb = db
): Promise<{ reports: ProblemReportSummary[]; total: number }> {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200)
  const offset = Math.max(options.offset ?? 0, 0)

  // Each report joins exactly one of the three, so the others are null and
  // coalesce picks whichever is there.
  const subjectTitle = sql<string>`coalesce(${directoryListings.title}, ${siteEvents.title}, ${sitePromotions.title}, '')`
  const subjectSlug = sql<string>`coalesce(${directoryListings.slug}, ${siteEvents.slug}, ${sitePromotions.slug}, '')`

  // The site's own reports, always. The filters narrow what is already inside
  // that boundary — they never replace it.
  const filters = [eq(directoryListingReports.workspaceId, workspaceId)]
  if (options.status) {
    filters.push(eq(directoryListingReports.status, options.status))
  }
  if (options.kind) {
    filters.push(
      isNotNull(
        {
          listing: directoryListingReports.listingId,
          event: directoryListingReports.eventId,
          promotion: directoryListingReports.promotionId,
        }[options.kind]
      )
    )
  }
  const search = options.search?.trim()
  if (search) {
    const pattern = `%${search}%`
    const searchFilter = or(
      ilike(directoryListings.title, pattern),
      ilike(siteEvents.title, pattern),
      ilike(sitePromotions.title, pattern),
      ilike(directoryListingReports.note, pattern)
    )
    if (searchFilter) filters.push(searchFilter)
  }
  const where = and(...filters)

  const [rows, [countRow]] = await Promise.all([
    database
      .select({
        report: directoryListingReports,
        subjectTitle,
        subjectSlug,
      })
      .from(directoryListingReports)
      .leftJoin(
        directoryListings,
        eq(directoryListings.id, directoryListingReports.listingId)
      )
      .leftJoin(siteEvents, eq(siteEvents.id, directoryListingReports.eventId))
      .leftJoin(
        sitePromotions,
        eq(sitePromotions.id, directoryListingReports.promotionId)
      )
      .where(where)
      .orderBy(
        desc(directoryListingReports.createdAt),
        asc(directoryListingReports.id)
      )
      .limit(limit)
      .offset(offset),
    // The same joins as the page above it, because the search reaches both
    // titles — count without them and "1-50 of N" counts a different set from
    // the one on screen.
    database
      .select({ total: sql<number>`count(*)::int` })
      .from(directoryListingReports)
      .leftJoin(
        directoryListings,
        eq(directoryListings.id, directoryListingReports.listingId)
      )
      .leftJoin(siteEvents, eq(siteEvents.id, directoryListingReports.eventId))
      .leftJoin(
        sitePromotions,
        eq(sitePromotions.id, directoryListingReports.promotionId)
      )
      .where(where),
  ])

  return {
    reports: rows.map((row) => ({
      ...toReport(row.report),
      subjectTitle: row.subjectTitle,
      subjectSlug: row.subjectSlug,
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
): Promise<ProblemReport> {
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
