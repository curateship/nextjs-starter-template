import { and, asc, desc, eq, ne, sql } from "drizzle-orm"

import { cleanWidgetLayout, type WidgetLayout } from "@/lib/admin-dashboard/overview-widgets"
import {
  DEFAULT_LISTINGS_WIDGETS,
  defaultListingsPage,
  LISTINGS_PAGE_BLOCK_TYPES,
  LISTINGS_PAGE_ERRORS,
  LISTINGS_WIDGET_IDS,
  withListingsSectionsBlock,
} from "@/lib/directory/listings-dashboard-page"
import { LISTINGS_LIST_SECTIONS, type ListingsListSection, type ListingsSection } from "@/lib/directory/listings-dashboard-search"
import { PAGE_MAX_LENGTH, storedPageBody, type StoredPage } from "@/lib/notes/page-body"
import { readCoverImages } from "@/lib/notes/page-cover"
import { now } from "@/server/auth/security"
import { db, type CustomShellDb } from "@/server/db"
import { featuredAdminOverview } from "@/server/directory/featured"
import { outreachHistory, outreachListings } from "@/server/directory/outreach"
import { mostSavedListings } from "@/server/directory/saves"
import { listingViewCounts } from "@/server/directory/views"
import {
  categories,
  directoryClaimOutreach,
  directoryClaims,
  directoryCustomSections,
  directoryFeaturedEntitlements,
  directoryFeaturedPlans,
  directoryGuideItems,
  directoryGuides,
  directoryListingPages,
  directoryListingReports,
  directoryListings,
  directoryOwnerEditRequests,
  directorySaveCollections,
  directorySaveItems,
  directorySubmissions,
} from "@/server/directory/schema"
import { siteEvents } from "@/server/events/schema"
import { sitePromotions } from "@/server/promotions/schema"

/**
 * The Listings dashboard's own records (Tyler, 18 Nov 2026: "Cosolidate
 * listings into one 3 panel dashboard"): the site's left page, its
 * Dashboards block's rows and Overview's layout, every row's count, what
 * needs an admin, and Overview's figures. One page per site, as the shell's
 * Automations page is, since every admin of a site looks after the same
 * listings. Every read and write is the site's own.
 */

const EMPTY_PAGE = JSON.stringify({ type: "doc", content: [{ type: "paragraph" }] })

/** A page cleaned to what it may hold, its Dashboards block always kept. */
function cleanPage(text: string) {
  const stored = storedPageBody(text, LISTINGS_PAGE_BLOCK_TYPES) || EMPTY_PAGE
  return JSON.stringify(withListingsSectionsBlock(JSON.parse(stored)))
}

async function pageRow(workspaceId: string, database: Pick<CustomShellDb, "select">) {
  const [row] = await database
    .select()
    .from(directoryListingPages)
    .where(eq(directoryListingPages.workspaceId, workspaceId))
    .limit(1)
  return row
}

function pageOf(row: Awaited<ReturnType<typeof pageRow>>): StoredPage {
  // Only a page never saved starts with its first blocks.
  const body = row?.body ? cleanPage(row.body) : JSON.stringify(defaultListingsPage())
  return {
    body,
    locked: row?.locked ?? false,
    coverUrl: row?.coverUrl ?? null,
    coverImages: readCoverImages(row?.coverImages),
  }
}

async function upsertPage(
  workspaceId: string,
  values: Partial<{
    body: string
    locked: boolean
    coverUrl: string | null
    coverImages: string[]
    widgets: WidgetLayout
    sections: ListingsSections
  }>,
  database: CustomShellDb
) {
  const at = now()
  await database
    .insert(directoryListingPages)
    .values({ workspaceId, body: "", locked: false, coverUrl: null, coverImages: [], sections: {}, ...values, updatedAt: at })
    .onConflictDoUpdate({ target: directoryListingPages.workspaceId, set: { ...values, updatedAt: at } })
}

/** Saves what is written, cleaned first. A locked page refuses. */
export async function saveListingsPageBody(workspaceId: string, body: string, database: CustomShellDb = db) {
  if (body.length > PAGE_MAX_LENGTH) throw new Error(LISTINGS_PAGE_ERRORS.tooLong)
  const page = pageOf(await pageRow(workspaceId, database))
  if (page.locked) throw new Error(LISTINGS_PAGE_ERRORS.locked)
  await upsertPage(workspaceId, { body: cleanPage(body) }, database)
}

export async function setListingsPageLock(workspaceId: string, locked: boolean, database: CustomShellDb = db) {
  await upsertPage(workspaceId, { locked }, database)
}

/** The cover picked (none, the sky or a picture) and the page's pictures, saved together. */
export async function setListingsPageCover(
  workspaceId: string,
  cover: { coverUrl: string | null; coverImages: string[] },
  database: CustomShellDb = db
) {
  await upsertPage(workspaceId, cover, database)
}

/** The Dashboards block's rows left out, and the order they were dragged into. Overview is never in either. */
export type ListingsSections = { hidden: ListingsListSection[]; order: ListingsListSection[] }

function readSections(value: unknown): ListingsListSection[] {
  if (!Array.isArray(value)) return []
  return [
    ...new Set(
      value.filter((section): section is ListingsListSection =>
        (LISTINGS_LIST_SECTIONS as readonly unknown[]).includes(section)
      )
    ),
  ]
}

function sectionsOf(row: Awaited<ReturnType<typeof pageRow>>): ListingsSections {
  return { hidden: readSections(row?.sections.hidden), order: readSections(row?.sections.order) }
}

export async function saveListingsSections(workspaceId: string, sections: ListingsSections, database: CustomShellDb = db) {
  await upsertPage(
    workspaceId,
    { sections: { hidden: readSections(sections.hidden), order: readSections(sections.order) } },
    database
  )
}

/** Overview's layout as stored, or the starting one. */
export async function getListingsWidgets(
  workspaceId: string,
  database: Pick<CustomShellDb, "select"> = db
): Promise<WidgetLayout> {
  const row = await pageRow(workspaceId, database)
  return cleanWidgetLayout(row?.widgets ?? DEFAULT_LISTINGS_WIDGETS, LISTINGS_WIDGET_IDS, DEFAULT_LISTINGS_WIDGETS)
}

/** Saves Overview's layout, cleaned, and answers with it as stored. */
export async function saveListingsWidgets(
  workspaceId: string,
  layout: unknown,
  database: CustomShellDb = db
): Promise<WidgetLayout> {
  const cleaned = cleanWidgetLayout(layout, LISTINGS_WIDGET_IDS, DEFAULT_LISTINGS_WIDGETS)
  await upsertPage(workspaceId, { widgets: cleaned }, database)
  return cleaned
}

/** Each row's pill: everything in it, or for a queue, what is waiting. */
export type ListingsSectionCounts = Record<Exclude<ListingsSection, "overview">, number>

async function countOf(query: PromiseLike<{ total: number }[]>) {
  const [row] = await query
  return row?.total ?? 0
}

const total = sql<number>`count(*)::int`

export async function listingsSectionCounts(
  workspaceId: string,
  database: CustomShellDb = db
): Promise<ListingsSectionCounts> {
  const [
    listings,
    categoryCount,
    fields,
    guides,
    submissions,
    claims,
    changes,
    reports,
    plans,
    placements,
    saved,
    outreach,
  ] = await Promise.all([
    countOf(database.select({ total }).from(directoryListings).where(eq(directoryListings.workspaceId, workspaceId))),
    countOf(database.select({ total }).from(categories).where(eq(categories.workspaceId, workspaceId))),
    countOf(
      database.select({ total }).from(directoryCustomSections).where(eq(directoryCustomSections.workspaceId, workspaceId))
    ),
    countOf(database.select({ total }).from(directoryGuides).where(eq(directoryGuides.workspaceId, workspaceId))),
    countOf(
      database
        .select({ total })
        .from(directorySubmissions)
        .where(and(eq(directorySubmissions.workspaceId, workspaceId), eq(directorySubmissions.status, "pending_review")))
    ),
    countOf(
      database
        .select({ total })
        .from(directoryClaims)
        .where(and(eq(directoryClaims.workspaceId, workspaceId), eq(directoryClaims.status, "pending_review")))
    ),
    countOf(
      database
        .select({ total })
        .from(directoryOwnerEditRequests)
        .where(and(eq(directoryOwnerEditRequests.workspaceId, workspaceId), eq(directoryOwnerEditRequests.status, "pending")))
    ),
    countOf(
      database
        .select({ total })
        .from(directoryListingReports)
        .where(and(eq(directoryListingReports.workspaceId, workspaceId), eq(directoryListingReports.status, "open")))
    ),
    countOf(database.select({ total }).from(directoryFeaturedPlans).where(eq(directoryFeaturedPlans.workspaceId, workspaceId))),
    countOf(
      database
        .select({ total })
        .from(directoryFeaturedEntitlements)
        .where(
          and(
            eq(directoryFeaturedEntitlements.workspaceId, workspaceId),
            ne(directoryFeaturedEntitlements.status, "revoked"),
            sql`${directoryFeaturedEntitlements.endsAt} > now()`
          )
        )
    ),
    countOf(
      database.select({ total }).from(directorySaveCollections).where(eq(directorySaveCollections.workspaceId, workspaceId))
    ),
    outreachListings(workspaceId, { limit: 1 }, database).then((page) => page.total),
  ])
  return {
    listings,
    categories: categoryCount,
    fields,
    guides,
    submissions,
    claims,
    changes,
    reports,
    plans,
    placements,
    saved,
    outreach,
  }
}

/** One record waiting on an admin, for the Needs you block. */
export type NeedsYouRow = {
  id: string
  section: "submissions" | "claims" | "changes" | "reports"
  name: string
  waitingSince: Date
}

/** How many of each kind the block reads before it picks the oldest. */
const NEEDS_EACH = 10

/**
 * The oldest records waiting on an admin, every kind together, oldest
 * first (Tyler's polish pick, 18 Nov 2026: "A \"/\" block on the left page
 * lists the oldest waiting submissions, claims and reports, each opening its
 * row"). Owner changes wait as claims do, so they are in it too.
 */
export async function needsYou(
  workspaceId: string,
  database: CustomShellDb = db,
  /** The counts, when the caller already read them. */
  known?: ListingsSectionCounts
): Promise<{ rows: NeedsYouRow[]; total: number }> {
  const [submissions, claims, changes, reports] = await Promise.all([
    database
      .select({ id: directorySubmissions.id, name: directorySubmissions.businessName, at: directorySubmissions.createdAt })
      .from(directorySubmissions)
      .where(and(eq(directorySubmissions.workspaceId, workspaceId), eq(directorySubmissions.status, "pending_review")))
      .orderBy(asc(directorySubmissions.createdAt), asc(directorySubmissions.id))
      .limit(NEEDS_EACH),
    database
      .select({ id: directoryClaims.id, name: directoryListings.title, at: directoryClaims.createdAt })
      .from(directoryClaims)
      .innerJoin(directoryListings, eq(directoryListings.id, directoryClaims.listingId))
      .where(and(eq(directoryClaims.workspaceId, workspaceId), eq(directoryClaims.status, "pending_review")))
      .orderBy(asc(directoryClaims.createdAt), asc(directoryClaims.id))
      .limit(NEEDS_EACH),
    database
      .select({ id: directoryOwnerEditRequests.id, name: directoryListings.title, at: directoryOwnerEditRequests.createdAt })
      .from(directoryOwnerEditRequests)
      .innerJoin(directoryListings, eq(directoryListings.id, directoryOwnerEditRequests.listingId))
      .where(and(eq(directoryOwnerEditRequests.workspaceId, workspaceId), eq(directoryOwnerEditRequests.status, "pending")))
      .orderBy(asc(directoryOwnerEditRequests.createdAt), asc(directoryOwnerEditRequests.id))
      .limit(NEEDS_EACH),
    database
      .select({
        id: directoryListingReports.id,
        name: sql<string>`coalesce(${directoryListings.title}, ${siteEvents.title}, ${sitePromotions.title}, '')`,
        at: directoryListingReports.createdAt,
      })
      .from(directoryListingReports)
      .leftJoin(directoryListings, eq(directoryListings.id, directoryListingReports.listingId))
      .leftJoin(siteEvents, eq(siteEvents.id, directoryListingReports.eventId))
      .leftJoin(sitePromotions, eq(sitePromotions.id, directoryListingReports.promotionId))
      .where(and(eq(directoryListingReports.workspaceId, workspaceId), eq(directoryListingReports.status, "open")))
      .orderBy(asc(directoryListingReports.createdAt), asc(directoryListingReports.id))
      .limit(NEEDS_EACH),
  ])
  const rows: NeedsYouRow[] = [
    ...submissions.map((row) => ({ id: row.id, section: "submissions" as const, name: row.name, waitingSince: row.at })),
    ...claims.map((row) => ({ id: row.id, section: "claims" as const, name: row.name, waitingSince: row.at })),
    ...changes.map((row) => ({ id: row.id, section: "changes" as const, name: row.name, waitingSince: row.at })),
    ...reports.map((row) => ({ id: row.id, section: "reports" as const, name: row.name, waitingSince: row.at })),
  ].sort((a, b) => a.waitingSince.getTime() - b.waitingSince.getTime() || a.id.localeCompare(b.id))
  const counts = known ?? (await listingsSectionCounts(workspaceId, database))
  return {
    rows: rows.slice(0, NEEDS_EACH),
    total: counts.submissions + counts.claims + counts.changes + counts.reports,
  }
}

/** The page, its rows, the counts and what needs you, from one visit, as the dashboard opens. */
export async function getListingsPage(workspaceId: string, database: CustomShellDb = db) {
  const [row, counts] = await Promise.all([pageRow(workspaceId, database), listingsSectionCounts(workspaceId, database)])
  const needs = await needsYou(workspaceId, database, counts)
  return { page: pageOf(row), sections: sectionsOf(row), counts, needs }
}

/** What Overview's five widgets draw. */
export async function listingsOverview(workspaceId: string, database: CustomShellDb = db) {
  const [featured, saved, sends] = await Promise.all([
    featuredAdminOverview(workspaceId, { limit: 1 }, database),
    mostSavedListings(workspaceId, database),
    outreachHistory(workspaceId, { limit: 50 }, database),
  ])
  return {
    revenue: featured.revenue,
    running: featured.activeCount,
    plansOffered: featured.plans.filter((plan) => plan.active).length,
    plans: featured.plans.length,
    mostSaved: saved.slice(0, 50).map((row) => ({ id: row.id, title: row.title, saves: Number(row.saves), people: row.people })),
    sends: sends.history.map((row) => ({
      id: row.id,
      listingId: row.listingId,
      title: row.listingTitle,
      email: row.email,
      status: row.status,
      at: row.createdAt,
    })),
  }
}

export type ListingsOverview = Awaited<ReturnType<typeof listingsOverview>>

/**
 * What the listing's record on the right shows beside its own fields
 * (Tyler's polish picks, 18 Nov 2026): who looks after it or has asked to,
 * its open reports and how many saved it ("The listing's right panel shows
 * its owner claim, open reports and save count"); its views ("The listing's
 * right panel gets a card with its views"); and where else it appears ("The
 * listing's right panel names its guides, upcoming events and live deals").
 * Each one opens its own record.
 */
export async function listingRecordFacts(workspaceId: string, listingId: string, database: CustomShellDb = db) {
  const [claims, reports, [saveRow], guides, events, deals, ...views] = await Promise.all([
    database
      .select({
        id: directoryClaims.id,
        status: directoryClaims.status,
        name: directoryClaims.claimantName,
        at: directoryClaims.createdAt,
      })
      .from(directoryClaims)
      .where(
        and(
          eq(directoryClaims.workspaceId, workspaceId),
          eq(directoryClaims.listingId, listingId),
          sql`${directoryClaims.status} in ('approved', 'pending_review')`
        )
      )
      .orderBy(sql`case ${directoryClaims.status} when 'approved' then 0 else 1 end`, asc(directoryClaims.createdAt))
      .limit(5),
    database
      .select({ id: directoryListingReports.id, reason: directoryListingReports.reason, at: directoryListingReports.createdAt })
      .from(directoryListingReports)
      .where(
        and(
          eq(directoryListingReports.workspaceId, workspaceId),
          eq(directoryListingReports.listingId, listingId),
          eq(directoryListingReports.status, "open")
        )
      )
      .orderBy(asc(directoryListingReports.createdAt))
      .limit(20),
    database
      .select({ total, people: sql<number>`count(distinct ${directorySaveItems.userId})::int` })
      .from(directorySaveItems)
      .where(and(eq(directorySaveItems.workspaceId, workspaceId), eq(directorySaveItems.listingId, listingId))),
    database
      .select({ id: directoryGuides.id, title: directoryGuides.title, status: directoryGuides.status })
      .from(directoryGuideItems)
      .innerJoin(directoryGuides, eq(directoryGuides.id, directoryGuideItems.guideId))
      .where(and(eq(directoryGuides.workspaceId, workspaceId), eq(directoryGuideItems.listingId, listingId)))
      .orderBy(asc(directoryGuides.title))
      .limit(20),
    database
      .select({ id: siteEvents.id, title: siteEvents.title, startDate: siteEvents.startDate })
      .from(siteEvents)
      .where(
        and(
          eq(siteEvents.workspaceId, workspaceId),
          eq(siteEvents.listingId, listingId),
          eq(siteEvents.status, "published"),
          sql`coalesce(${siteEvents.endDate}, ${siteEvents.startDate}) >= current_date`
        )
      )
      .orderBy(asc(siteEvents.startDate))
      .limit(10),
    database
      .select({ id: sitePromotions.id, title: sitePromotions.title, endDate: sitePromotions.endDate })
      .from(sitePromotions)
      .where(
        and(
          eq(sitePromotions.workspaceId, workspaceId),
          eq(sitePromotions.listingId, listingId),
          eq(sitePromotions.status, "published"),
          sql`${sitePromotions.startDate} <= current_date`,
          sql`(${sitePromotions.endDate} is null or ${sitePromotions.endDate} >= current_date)`
        )
      )
      .orderBy(asc(sitePromotions.title))
      .limit(10),
    ...([7, 30, 365, "all"] as const).map((days) =>
      listingViewCounts(workspaceId, [listingId], days, database).then((counts) => counts.get(listingId) ?? 0)
    ),
  ])
  const owner = claims.find((claim) => claim.status === "approved") ?? null
  return {
    owner: owner ? { id: owner.id, name: owner.name } : null,
    waitingClaims: claims.filter((claim) => claim.status === "pending_review").map((claim) => ({ id: claim.id, name: claim.name, at: claim.at })),
    reports: reports.map((report) => ({ id: report.id, reason: report.reason, at: report.at })),
    saves: saveRow?.total ?? 0,
    savedBy: saveRow?.people ?? 0,
    views: { week: views[0] ?? 0, month: views[1] ?? 0, year: views[2] ?? 0, all: views[3] ?? 0 },
    guides,
    events,
    deals,
  }
}

export type ListingRecordFacts = Awaited<ReturnType<typeof listingRecordFacts>>

/** Every claim invitation written about one listing, newest first, for its Outreach record. */
export async function listingSends(workspaceId: string, listingId: string, database: CustomShellDb = db) {
  return database
    .select({
      id: directoryClaimOutreach.id,
      email: directoryClaimOutreach.toEmail,
      status: directoryClaimOutreach.status,
      error: directoryClaimOutreach.error,
      at: directoryClaimOutreach.createdAt,
    })
    .from(directoryClaimOutreach)
    .where(and(eq(directoryClaimOutreach.workspaceId, workspaceId), eq(directoryClaimOutreach.listingId, listingId)))
    .orderBy(desc(directoryClaimOutreach.createdAt), asc(directoryClaimOutreach.id))
    .limit(50)
}
