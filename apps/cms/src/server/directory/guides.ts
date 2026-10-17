import {
  and,
  asc,
  desc,
  eq,
  ilike,
  inArray,
  ne,
  or,
  sql,
} from "drizzle-orm"

import {
  guidePlacesText,
  MAX_GUIDE_INTRO,
  MAX_GUIDE_LISTINGS,
  MAX_GUIDE_TITLE,
  type GuideSortColumn,
  type GuideStatus,
} from "@/lib/directory/guides"
import {
  readListingStatus,
  type ListingStatus,
} from "@/lib/directory/listing-status"
import { listingShareImageVersion } from "@/lib/directory/listing-share-image"
import { slugFromTitle, slugProblem } from "@/lib/directory/slugs"
import {
  searchSnippet,
  siteSearchPattern,
  type SiteSearchResult,
} from "@/lib/pages/site-search"
import type { SitemapEntry } from "@/server/app-options"
import { now, uuid } from "@/server/auth/security"
import { readPageVisibility } from "@/server/content/pages"
import { db, type CustomShellDb } from "@/server/db"
import {
  forgetAddressesOf,
  releaseAddress,
  saveKeepingOldAddress,
} from "@/server/directory/old-addresses"
import {
  publicListingCardsByIds,
  type PublicListingCard,
  type PublicSite,
  type VisitorSite,
} from "@/server/directory/public"
import {
  cachedPublicDirectoryRead,
  clearPublicDirectoryCache,
} from "@/server/directory/public-cache"
import {
  directoryGuideItems,
  directoryGuides,
  directoryListings,
} from "@/server/directory/schema"
import {
  firstFreeSlug as firstFreeSlugRule,
  requireFreeSlug as requireFreeSlugRule,
} from "@/server/directory/slug-rules"

/**
 * Guides the site's editor writes: "Best brunch in the west end", a named
 * list of listings in the order the editor chose, with a cover and two
 * sentences at the top, at /guides/<address>.
 *
 * A guide is the site's own piece of writing, so it is nothing like a
 * visitor's saved list in `saves.ts`, which belongs to one visitor and is
 * left exactly as it was.
 *
 * Two rules about the listings in it:
 *
 * - **A deleted listing leaves the guide.** The database deletes its row.
 * - **A listing that is not published stays in the guide and is left off the
 *   public page.** The window marks it, so the editor sees why the page shows
 *   eight places when the guide holds nine. Publishing it again puts it back
 *   where it was.
 */

export type DirectoryGuide = {
  id: string
  title: string
  slug: string
  intro: string
  coverImage: string
  status: GuideStatus
  publishedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

/** A row on the Guides screen. */
export type GuideSummary = DirectoryGuide & {
  /** Every listing in it. */
  listings: number
  /** How many of those a visitor sees: the published ones. */
  shown: number
}

/** One listing in the guide window, in the guide's order. */
export type GuideListing = {
  id: string
  title: string
  status: ListingStatus
  featuredImage: string
}

export type GuideForEdit = {
  guide: DirectoryGuide
  listings: GuideListing[]
}

const GUIDE_NOUN = { one: "guide", many: "guides" }

type GuideRow = typeof directoryGuides.$inferSelect

function toGuide(row: GuideRow): DirectoryGuide {
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    intro: row.intro,
    coverImage: row.coverImage,
    status: row.status === "published" ? "published" : "draft",
    publishedAt: row.publishedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

function cleanTitle(raw: string): string {
  const title = raw.trim().slice(0, MAX_GUIDE_TITLE)
  if (!title) throw new Error("A guide needs a title.")
  return title
}

async function slugIsTaken(
  workspaceId: string,
  slug: string,
  exceptId: string | null,
  database: CustomShellDb
): Promise<boolean> {
  const [row] = await database
    .select({ id: directoryGuides.id })
    .from(directoryGuides)
    .where(
      and(
        eq(directoryGuides.workspaceId, workspaceId),
        eq(directoryGuides.slug, slug),
        exceptId ? ne(directoryGuides.id, exceptId) : undefined
      )
    )
    .limit(1)
  return Boolean(row)
}

/**
 * How many listings each guide holds, and how many of them are published.
 *
 * Table names written out: drizzle prints a column bare when the outer query
 * reads one table, and a bare `id` inside the subquery is then ambiguous.
 */
function itemCounts() {
  return {
    listings: sql<number>`(
      select count(*)::int from directory_guide_items item
      where item.guide_id = directory_guides.id
    )`.mapWith(Number),
    shown: sql<number>`(
      select count(*)::int from directory_guide_items item
      inner join directory_listings listing on listing.id = item.listing_id
      where item.guide_id = directory_guides.id
        and listing.status = 'published'
    )`.mapWith(Number),
  }
}

export async function listGuides(
  workspaceId: string,
  options: {
    search?: string
    status?: GuideStatus
    sort?: GuideSortColumn
    direction?: "asc" | "desc"
    limit?: number
    offset?: number
  } = {},
  database: CustomShellDb = db
): Promise<{ guides: GuideSummary[]; total: number }> {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200)
  const offset = Math.max(options.offset ?? 0, 0)
  const search = options.search?.trim()

  // The site's own guides, always: the whole boundary for this list.
  const filters = [eq(directoryGuides.workspaceId, workspaceId)]
  if (search) {
    const pattern = `%${search}%`
    const searchFilter = or(
      ilike(directoryGuides.title, pattern),
      ilike(directoryGuides.slug, pattern)
    )
    if (searchFilter) filters.push(searchFilter)
  }
  if (options.status) filters.push(eq(directoryGuides.status, options.status))
  const where = and(...filters)

  const counts = itemCounts()
  const sort = options.sort ?? "updated"
  const column = {
    title: directoryGuides.title,
    status: directoryGuides.status,
    listings: counts.listings,
    updated: directoryGuides.updatedAt,
  }[sort]
  const order = options.direction === "asc" ? asc : desc

  const [rows, [countRow]] = await Promise.all([
    database
      .select({ guide: directoryGuides, ...counts })
      .from(directoryGuides)
      .where(where)
      // The id breaks ties, so a page boundary cannot show a guide twice.
      .orderBy(order(column), asc(directoryGuides.id))
      .limit(limit)
      .offset(offset),
    database
      .select({ total: sql<number>`count(*)::int` })
      .from(directoryGuides)
      .where(where),
  ])

  return {
    guides: rows.map((row) => ({
      ...toGuide(row.guide),
      listings: row.listings,
      shown: row.shown,
    })),
    total: countRow?.total ?? 0,
  }
}

/** One guide with its listings in order, or null when it is not on this site. */
export async function findGuideForEdit(
  workspaceId: string,
  id: string,
  database: CustomShellDb = db
): Promise<GuideForEdit | null> {
  const [row] = await database
    .select()
    .from(directoryGuides)
    .where(
      and(
        eq(directoryGuides.id, id),
        eq(directoryGuides.workspaceId, workspaceId)
      )
    )
    .limit(1)
  if (!row) return null

  const listings = await database
    .select({
      id: directoryListings.id,
      title: directoryListings.title,
      status: directoryListings.status,
      featuredImage: directoryListings.featuredImage,
    })
    .from(directoryGuideItems)
    .innerJoin(
      directoryListings,
      eq(directoryListings.id, directoryGuideItems.listingId)
    )
    .where(eq(directoryGuideItems.guideId, id))
    .orderBy(asc(directoryGuideItems.position))

  return {
    guide: toGuide(row),
    listings: listings.map((listing) => ({
      ...listing,
      status: readListingStatus(listing.status),
    })),
  }
}

/** A new guide: a title, a free address from it, born a draft and empty. */
export async function createGuide(
  workspaceId: string,
  input: { title: string; slug?: string },
  database: CustomShellDb = db
): Promise<DirectoryGuide> {
  const title = cleanTitle(input.title)
  const chosen = input.slug?.trim()
  const wanted = chosen || slugFromTitle(title)
  const problem = slugProblem(wanted)
  if (problem) throw new Error(problem)

  const isTaken = (candidate: string) =>
    slugIsTaken(workspaceId, candidate, null, database)
  let slug = wanted
  if (chosen) await requireFreeSlugRule(wanted, isTaken, GUIDE_NOUN)
  else slug = await firstFreeSlugRule(wanted, isTaken, GUIDE_NOUN)

  const at = now()
  const [row] = await database
    .insert(directoryGuides)
    .values({
      id: uuid(),
      workspaceId,
      title,
      slug,
      createdAt: at,
      updatedAt: at,
    })
    .returning()
  if (!row) throw new Error("The guide was not created.")
  await releaseAddress(database, workspaceId, "guide", [row.slug])
  return toGuide(row)
}

/**
 * Saves the window. `listingIds` is the whole list in the guide's new order:
 * the rows are replaced in one transaction, so a reload shows exactly the
 * order that was saved and never half of it.
 */
export async function updateGuide(
  workspaceId: string,
  id: string,
  input: {
    title?: string
    slug?: string
    intro?: string
    coverImage?: string
    status?: GuideStatus
    listingIds?: string[]
  },
  database: CustomShellDb = db
): Promise<DirectoryGuide> {
  const at = now()
  const values: Partial<typeof directoryGuides.$inferInsert> = {
    updatedAt: at,
  }
  if (input.title !== undefined) values.title = cleanTitle(input.title)
  if (input.slug !== undefined) {
    const slug = input.slug.trim()
    await requireFreeSlugRule(
      slug,
      (candidate) => slugIsTaken(workspaceId, candidate, id, database),
      GUIDE_NOUN
    )
    values.slug = slug
  }
  if (input.intro !== undefined) {
    values.intro = input.intro.trim().slice(0, MAX_GUIDE_INTRO)
  }
  if (input.coverImage !== undefined) {
    values.coverImage = input.coverImage.trim().slice(0, 600)
  }

  const thisGuide = and(
    eq(directoryGuides.id, id),
    eq(directoryGuides.workspaceId, workspaceId)
  )

  const write = async (tx: CustomShellDb) => {
    const [updated] = await tx
      .update(directoryGuides)
      .set({
        ...values,
        ...(input.status !== undefined
          ? {
              status: input.status,
              // The first publish dates the guide; later ones keep that date.
              ...(input.status === "published"
                ? {
                    publishedAt: sql`coalesce(${directoryGuides.publishedAt}, ${at.toISOString()}::timestamptz)`,
                  }
                : {}),
            }
          : {}),
      })
      .where(thisGuide)
      .returning()
    if (updated && input.listingIds !== undefined) {
      await writeGuideListings(workspaceId, id, input.listingIds, tx)
    }
    return updated
  }

  // The guide, its order and its old address in one transaction, so a save
  // that fails half way leaves the guide as it was.
  const row = await database.transaction((tx) =>
    saveKeepingOldAddress(
      tx,
      {
        siteId: workspaceId,
        kind: "guide",
        changesAddress: input.slug !== undefined,
      },
      async (inner) => {
        const [before] = await inner
          .select({ slug: directoryGuides.slug })
          .from(directoryGuides)
          .where(thisGuide)
        return before?.slug ?? null
      },
      write
    )
  )

  if (!row) throw new Error("That guide no longer exists.")
  clearPublicDirectoryCache(workspaceId)
  return toGuide(row)
}

/**
 * The guide's listings, replaced by these in this order. Only this site's
 * listings are kept: an id from another site, or one deleted while the window
 * was open, is dropped rather than failing the save.
 */
async function writeGuideListings(
  workspaceId: string,
  guideId: string,
  listingIds: string[],
  tx: CustomShellDb
): Promise<void> {
  const wanted = [...new Set(listingIds)].slice(0, MAX_GUIDE_LISTINGS)
  const onSite = wanted.length
    ? await tx
        .select({ id: directoryListings.id })
        .from(directoryListings)
        .where(
          and(
            eq(directoryListings.workspaceId, workspaceId),
            inArray(directoryListings.id, wanted)
          )
        )
    : []
  const keep = new Set(onSite.map((row) => row.id))
  const ordered = wanted.filter((listingId) => keep.has(listingId))

  await tx
    .delete(directoryGuideItems)
    .where(eq(directoryGuideItems.guideId, guideId))
  if (ordered.length) {
    await tx.insert(directoryGuideItems).values(
      ordered.map((listingId, position) => ({
        id: uuid(),
        guideId,
        listingId,
        position,
      }))
    )
  }
}

/** One request for the whole selection; `kept` is what was already gone. */
export async function deleteGuides(
  workspaceId: string,
  ids: string[],
  database: CustomShellDb = db
): Promise<{ done: string[]; kept: string[] }> {
  if (ids.length === 0) return { done: [], kept: [] }
  const deleted = await database.transaction(async (tx) => {
    const rows = await tx
      .delete(directoryGuides)
      .where(
        and(
          eq(directoryGuides.workspaceId, workspaceId),
          inArray(directoryGuides.id, ids)
        )
      )
      .returning({ id: directoryGuides.id, slug: directoryGuides.slug })
    // A deleted guide's old addresses stop forwarding.
    await forgetAddressesOf(
      tx,
      workspaceId,
      "guide",
      rows.map((row) => row.slug)
    )
    return rows
  })
  const done = deleted.map((row) => row.id)
  if (done.length) clearPublicDirectoryCache(workspaceId)
  const doneSet = new Set(done)
  return { done, kept: ids.filter((id) => !doneSet.has(id)) }
}

// ---------------------------------------------------------------------------
// What a visitor may read: published guides only, on the visited site only.
// The page doors in `lib/api/directory/public.ts` check the Guides page's
// switch, members included, before calling these. The sitemap, the feed,
// search and the share card are read by nobody signed in, so they list guides
// only while the page is open to everyone.
// ---------------------------------------------------------------------------

/** Whether guides may be advertised to somebody who is not signed in. */
export async function guidesArePublic(
  siteId: string,
  database: CustomShellDb = db
): Promise<boolean> {
  return (await readPageVisibility(siteId, "/guides", database)) === "everyone"
}

function publishedGuidesOnSite(siteId: string) {
  return and(
    eq(directoryGuides.workspaceId, siteId),
    eq(directoryGuides.status, "published")
  )
}

export type PublicGuide = {
  id: string
  title: string
  slug: string
  intro: string
  coverImage: string
  publishedAt: Date
  updatedAt: Date
}

export type PublicGuidePage = {
  site: PublicSite
  guide: PublicGuide
  /** The published listings, in the guide's order, as browse-grid cards. */
  listings: PublicListingCard[]
  shareImageVersion: string
}

function toPublicGuide(row: GuideRow): PublicGuide {
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    intro: row.intro,
    coverImage: row.coverImage,
    // A published guide always has one; the check in 0130 says so.
    publishedAt: row.publishedAt ?? row.createdAt,
    updatedAt: row.updatedAt,
  }
}

/** The ids of a guide's listings in its order, published or not. */
async function guideListingIds(guideId: string, database: CustomShellDb) {
  const rows = await database
    .select({ listingId: directoryGuideItems.listingId })
    .from(directoryGuideItems)
    .where(eq(directoryGuideItems.guideId, guideId))
    .orderBy(asc(directoryGuideItems.position))
  return rows.map((row) => row.listingId)
}

/** The share card's words, read by the page and by the card's own address. */
function guideShareInput(
  site: VisitorSite,
  guide: { title: string; updatedAt: Date },
  places: number
) {
  return {
    title: guide.title,
    kicker: `Guide · ${guidePlacesText(places)}`,
    siteName: site.name,
    accentColor: site.accentColor ?? "",
    updatedAt: guide.updatedAt,
  }
}

async function readPublicGuideUncached(
  site: VisitorSite,
  slug: string,
  database: CustomShellDb
): Promise<PublicGuidePage | null> {
  const [row] = await database
    .select()
    .from(directoryGuides)
    .where(and(publishedGuidesOnSite(site.id), eq(directoryGuides.slug, slug)))
    .limit(1)
  if (!row) return null

  // Published listings only, in the order asked for: the same read the
  // Recently viewed row uses, so a draft or closed listing is skipped here
  // exactly as it is there.
  const listings = await publicListingCardsByIds(
    site.id,
    await guideListingIds(row.id, database),
    database
  )
  return {
    site: { name: site.name, url: site.url },
    guide: toPublicGuide(row),
    listings,
    shareImageVersion: listingShareImageVersion(
      guideShareInput(site, row, listings.length)
    ),
  }
}

/**
 * One published guide's page, or null. Null covers no such address, a draft
 * and another site's guide alike, so a draft cannot be told apart from a guide
 * never written.
 */
export function readPublicGuide(
  site: VisitorSite,
  slug: string,
  database: CustomShellDb = db
): Promise<PublicGuidePage | null> {
  return cachedPublicDirectoryRead(
    site.id,
    "guide",
    {
      site: { name: site.name, url: site.url, accentColor: site.accentColor },
      slug,
    },
    () => readPublicGuideUncached(site, slug, database)
  )
}

export type PublicGuideCard = {
  id: string
  title: string
  slug: string
  intro: string
  coverImage: string
  /** The published listings a visitor will find in it. */
  places: number
}

/** The most guides the Guides page draws. No site writes this many. */
const GUIDES_ON_THE_PAGE = 120

/** Every published guide on the site, newest first, for the Guides page. */
export function readPublicGuides(
  site: VisitorSite,
  database: CustomShellDb = db
): Promise<{ site: PublicSite; guides: PublicGuideCard[] }> {
  return cachedPublicDirectoryRead(
    site.id,
    "guides",
    { site: { name: site.name, url: site.url } },
    async () => {
      const rows = await database
        .select({ guide: directoryGuides, places: itemCounts().shown })
        .from(directoryGuides)
        .where(publishedGuidesOnSite(site.id))
        .orderBy(desc(directoryGuides.publishedAt), asc(directoryGuides.id))
        .limit(GUIDES_ON_THE_PAGE)
      return {
        site: { name: site.name, url: site.url },
        guides: rows.map((row) => ({
          id: row.guide.id,
          title: row.guide.title,
          slug: row.guide.slug,
          intro: row.guide.intro,
          coverImage: row.guide.coverImage,
          places: row.places,
        })),
      }
    }
  )
}

/** Published guides for the sitemap, while the Guides page is public. */
export async function guideSitemapEntries(
  siteId: string,
  database: CustomShellDb = db
): Promise<SitemapEntry[]> {
  if (!(await guidesArePublic(siteId, database))) return []
  const rows = await database
    .select({ slug: directoryGuides.slug, updatedAt: directoryGuides.updatedAt })
    .from(directoryGuides)
    .where(publishedGuidesOnSite(siteId))
    .orderBy(asc(directoryGuides.slug))
  return rows.map((row) => ({
    path: `/guides/${row.slug}`,
    updatedAt: row.updatedAt,
  }))
}

/** Published guide results contributed to the shell's whole-site search. */
export async function guideSearchResults(
  siteId: string,
  rawQuery: string,
  limit: number,
  database: CustomShellDb = db
): Promise<SiteSearchResult[]> {
  const query = rawQuery.trim()
  if (!query || limit < 1) return []
  if (!(await guidesArePublic(siteId, database))) return []

  const pattern = siteSearchPattern(query)
  const rows = await database
    .select({
      title: directoryGuides.title,
      slug: directoryGuides.slug,
      intro: directoryGuides.intro,
    })
    .from(directoryGuides)
    .where(
      and(
        publishedGuidesOnSite(siteId),
        or(
          ilike(directoryGuides.title, pattern),
          ilike(directoryGuides.intro, pattern)
        )
      )
    )
    .orderBy(
      desc(ilike(directoryGuides.title, pattern)),
      asc(directoryGuides.title),
      asc(directoryGuides.id)
    )
    .limit(limit)

  return rows.map((row) => ({
    type: "Guide",
    title: row.title,
    snippet: searchSnippet(row.intro, query),
    path: `/guides/${row.slug}`,
  }))
}

/** The newest published guides, for the feed. */
export async function newestGuidesForFeed(
  siteId: string,
  limit: number,
  database: CustomShellDb = db
): Promise<{ title: string; slug: string; intro: string; publishedAt: Date }[]> {
  if (!(await guidesArePublic(siteId, database))) return []
  const rows = await database
    .select()
    .from(directoryGuides)
    .where(publishedGuidesOnSite(siteId))
    .orderBy(desc(directoryGuides.publishedAt), asc(directoryGuides.id))
    .limit(limit)
  return rows.map((row) => {
    const guide = toPublicGuide(row)
    return {
      title: guide.title,
      slug: guide.slug,
      intro: guide.intro,
      publishedAt: guide.publishedAt,
    }
  })
}

/**
 * What the drawn share card says for a published guide, or null. Read by the
 * card's own address, which a link preview fetches without signing in.
 */
export async function guideShareInputFor(
  site: VisitorSite,
  slug: string,
  database: CustomShellDb
) {
  if (!(await guidesArePublic(site.id, database))) return null
  const [row] = await database
    .select({
      id: directoryGuides.id,
      title: directoryGuides.title,
      updatedAt: directoryGuides.updatedAt,
    })
    .from(directoryGuides)
    .where(and(publishedGuidesOnSite(site.id), eq(directoryGuides.slug, slug)))
    .limit(1)
  if (!row) return null
  const cards = await publicListingCardsByIds(
    site.id,
    await guideListingIds(row.id, database),
    database
  )
  return guideShareInput(site, row, cards.length)
}
