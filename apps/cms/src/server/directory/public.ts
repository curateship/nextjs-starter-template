import { and, asc, desc, eq, ilike, inArray, ne, or, sql } from "drizzle-orm"
import { getRequestHeader } from "@tanstack/react-start/server"

import type { ContactLinks } from "@/lib/directory/contact-links"
import { cleanContactLinks } from "@/lib/directory/contact-links"
import {
  DIRECTORY_PAGE_SIZE,
  RELATED_LISTING_COUNT,
  type DirectorySort,
} from "@/lib/directory/public-search"
import {
  cleanWrittenPageBody,
  type WrittenPageNode,
} from "@/lib/pages/written-page-body"
import { appUrl } from "@/server/app-url"
import { db, type CustomShellDb } from "@/server/db"
import { claimedListingIds, claimStateFor } from "@/server/directory/claims"
import {
  activeFeaturedForListings,
  featuredPriorityFor,
} from "@/server/directory/featured"
import { directorySettingsFor } from "@/server/directory/settings"
import type { ReviewStatus } from "@/lib/directory/review-status"
import { customShellWorkspaces } from "@/server/schema"
import {
  categories,
  categoryRelationships,
  directoryListings,
  LISTING_CONTENT_TYPE,
} from "@/server/directory/schema"
import { visitorWorkspaceId } from "@/server/workspaces/for-request"

/**
 * What a visitor is allowed to read.
 *
 * Every read here takes the site as its first argument and filters on it, the
 * same as the admin's reads — and adds the one rule the admin's do not: **only
 * published listings**. A draft is not "hidden from the list", it is not
 * readable at all, by its address or by any other route into this file.
 *
 * The site is never a value the browser sends. It comes from
 * `visitorSite()` below, which asks the shell's one answer, which reads the
 * Host header on the server. A site id in a request body would let anybody ask
 * for any site's content — including a switched-off one.
 */

/** The site a public directory page is being drawn for. */
export type VisitorSite = {
  id: string
  name: string
  /**
   * Where this site lives, built from the address actually being answered —
   * `https://alpha.example.com`, never the deployment's own address.
   *
   * It matters because it goes into the page's JSON-LD, and a search engine
   * told that Alpha's listing lives on the platform's domain would index the
   * wrong address.
   */
  url: string
}

/**
 * The address being answered, as a bare origin.
 *
 * Read on the server from the request, like everything else about the host.
 * Outside a request — a script, a test — there is no host, and the
 * deployment's own address is the truthful answer.
 */
function requestOrigin(): string {
  let host: string | null = null
  let forwarded: string | null = null
  try {
    host = getRequestHeader("host") ?? null
    forwarded = getRequestHeader("x-forwarded-proto") ?? null
  } catch {
    host = null
  }
  if (!host) return appUrl()

  // Behind a proxy the app itself speaks http while the visitor typed https,
  // so the proxy's word beats ours. With no proxy, whatever the deployment
  // says about itself.
  const scheme = forwarded?.split(",")[0]?.trim()
  if (scheme === "http" || scheme === "https") return `${scheme}://${host}`

  try {
    return `${new URL(appUrl()).protocol}//${host}`
  } catch {
    return `https://${host}`
  }
}

/** The site whose address the visitor typed, or null when there is none. */
export async function visitorSite(
  database: CustomShellDb = db
): Promise<VisitorSite | null> {
  // The shell's one answer, so a public directory page and a public written
  // page can never disagree about which site they are on.
  const id = await visitorWorkspaceId(database)
  if (!id) return null

  const [row] = await database
    .select({ id: customShellWorkspaces.id, name: customShellWorkspaces.name })
    .from(customShellWorkspaces)
    .where(eq(customShellWorkspaces.id, id))
    .limit(1)

  return row ? { id: row.id, name: row.name, url: requestOrigin() } : null
}

/** What a page is told about the site it is drawing. Never its id. */
export type PublicSite = { name: string; url: string }

/** One listing as a card in a grid: enough to draw it, and nothing more. */
export type PublicListingCard = {
  id: string
  title: string
  slug: string
  metaDescription: string
  featuredImage: string
  /** The primary category if it has one, else the first it is in. */
  category: PublicCategoryLink | null
  /**
   * The business itself looks after this page. Says nothing about who they are
   * — a visitor is told the page is looked after, never by whom.
   */
  claimed: boolean
  /** A paid placement that is active at the moment this row is read. */
  featured: boolean
}

/** A category as a link: the two fields anything pointing at one needs. */
export type PublicCategoryLink = {
  name: string
  slug: string
}

/** A category with everything a chip or a child tile shows. */
export type PublicCategory = {
  id: string
  name: string
  slug: string
  description: string
  parentId: string | null
  /** Published listings in this category itself, not its children's. */
  listingCount: number
}

export type PublicListing = {
  id: string
  title: string
  slug: string
  metaDescription: string
  featuredImage: string
  contactLinks: ContactLinks
  body: WrittenPageNode
  updatedAt: Date
  createdAt: Date
  featured: boolean
}

/** One page of the browse list, plus the filters the toolbar draws. */
export type PublicBrowse = {
  site: PublicSite
  listings: PublicListingCard[]
  total: number
  page: number
  pageSize: number
  categories: PublicCategory[]
}

/**
 * Everything the claim button on a listing's page needs to draw itself.
 *
 * The wording travels with it rather than being fetched separately, because the
 * button and its message are one decision — a page that had the button but not
 * the sentence under it would be the setting half applied.
 */
export type PublicClaimState = {
  /** This site offers claiming at all. */
  enabled: boolean
  /**
   * Whether the reader has an account, so the page can offer sign-in rather
   * than a form that would refuse them at the end.
   *
   * A plain yes or no, never the id. The page has no use for who they are, and
   * a public page is not a place to put one.
   */
  signedIn: boolean
  /** Somebody already looks after it. Never says who. */
  claimed: boolean
  /** Where the reader's own claim stands, when they have made one. */
  mine: ReviewStatus | null
  buttonLabel: string
  pendingMessage: string
  approvedMessage: string
}

export type PublicListingPage = {
  site: PublicSite
  listing: PublicListing
  categories: PublicCategoryLink[]
  primaryCategory: PublicCategoryLink | null
  related: PublicListingCard[]
  claim: PublicClaimState
}

export type PublicCategoryPage = {
  site: PublicSite
  category: PublicCategory
  /** Home → … → this one, for the breadcrumb. Ends with the category itself. */
  ancestors: PublicCategoryLink[]
  children: PublicCategory[]
  listings: PublicListingCard[]
  total: number
  page: number
  pageSize: number
}

/** Published, on this site. The whole of what a visitor may see. */
function publishedOnSite(siteId: string) {
  return and(
    eq(directoryListings.workspaceId, siteId),
    eq(directoryListings.status, "published")
  )
}

function orderFor(sort: DirectorySort, workspaceId: string) {
  // Paid placement leads every public list, whatever ordering the visitor
  // chooses. Expired placement yields the minimum value and immediately falls
  // back to the ordinary order below without a cleanup job.
  const featured = desc(featuredPriorityFor(workspaceId))
  // The id breaks every tie, so a page boundary cannot land mid-tie and show
  // the same listing twice or skip one.
  switch (sort) {
    case "newest":
      return [featured, desc(directoryListings.createdAt), asc(directoryListings.id)]
    case "title":
      return [featured, asc(directoryListings.title), asc(directoryListings.id)]
    case "order":
      return [
        featured,
        asc(directoryListings.displayOrder),
        desc(directoryListings.createdAt),
        asc(directoryListings.id),
      ]
  }
}

/**
 * The category each of these listings is shown under: its primary one, or the
 * first by name when nobody marked one.
 *
 * One query for the whole page rather than one per card — twelve cards used to
 * mean twelve round trips, and the page only ever holds one page of them.
 */
async function categoryForCards(
  siteId: string,
  listingIds: string[],
  database: CustomShellDb
): Promise<Map<string, PublicCategoryLink>> {
  if (listingIds.length === 0) return new Map()

  const rows = await database
    .select({
      contentId: categoryRelationships.contentId,
      name: categories.name,
      slug: categories.slug,
    })
    .from(categoryRelationships)
    .innerJoin(categories, eq(categories.id, categoryRelationships.categoryId))
    .where(
      and(
        eq(categoryRelationships.workspaceId, siteId),
        eq(categoryRelationships.contentType, LISTING_CONTENT_TYPE),
        inArray(categoryRelationships.contentId, listingIds)
      )
    )
    .orderBy(desc(categoryRelationships.isPrimary), asc(categories.name))

  const found = new Map<string, PublicCategoryLink>()
  for (const row of rows) {
    // Primary first in the sort, so the first row wins and the rest are the
    // listing's other categories.
    if (!found.has(row.contentId)) {
      found.set(row.contentId, { name: row.name, slug: row.slug })
    }
  }
  return found
}

async function toCards(
  siteId: string,
  rows: {
    id: string
    title: string
    slug: string
    metaDescription: string
    featuredImage: string
  }[],
  database: CustomShellDb
): Promise<PublicListingCard[]> {
  const ids = rows.map((row) => row.id)
  // Both for the whole page at once. One query each rather than one per card:
  // twelve cards used to mean twelve round trips for the category alone.
  const [shownUnder, claimed, featured] = await Promise.all([
    categoryForCards(siteId, ids, database),
    claimedListingIds(siteId, ids, database),
    activeFeaturedForListings(siteId, ids, database),
  ])
  return rows.map((row) => ({
    ...row,
    category: shownUnder.get(row.id) ?? null,
    claimed: claimed.has(row.id),
    featured: featured.has(row.id),
  }))
}

/** The columns a card needs, so a grid never fetches a listing's whole body. */
const cardColumns = {
  id: directoryListings.id,
  title: directoryListings.title,
  slug: directoryListings.slug,
  metaDescription: directoryListings.metaDescription,
  featuredImage: directoryListings.featuredImage,
}

/**
 * Every category on this site that has something published in it, with how
 * many. A category holding only drafts is not shown: a visitor clicking it
 * would land on an empty page and reasonably think the site was broken.
 */
export async function publicCategories(
  siteId: string,
  database: CustomShellDb = db
): Promise<PublicCategory[]> {
  const [rows, counts] = await Promise.all([
    database
      .select()
      .from(categories)
      .where(eq(categories.workspaceId, siteId))
      .orderBy(asc(categories.displayOrder), asc(categories.name)),
    database
      .select({
        categoryId: categoryRelationships.categoryId,
        count: sql<number>`count(*)::int`,
      })
      .from(categoryRelationships)
      .innerJoin(
        directoryListings,
        eq(directoryListings.id, categoryRelationships.contentId)
      )
      .where(
        and(
          eq(categoryRelationships.workspaceId, siteId),
          eq(categoryRelationships.contentType, LISTING_CONTENT_TYPE),
          publishedOnSite(siteId)
        )
      )
      .groupBy(categoryRelationships.categoryId),
  ])

  const countFor = new Map(counts.map((row) => [row.categoryId, row.count]))
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    parentId: row.parentId ?? null,
    listingCount: countFor.get(row.id) ?? 0,
  }))
}

/**
 * The ids of the listings in one category.
 *
 * **This category only, never its children.** That is what the directory app
 * does, and rolling children up would mean a listing appearing on a page it
 * was never put on.
 */
function listingIdsInCategory(
  siteId: string,
  categoryId: string,
  database: CustomShellDb
) {
  return database
    .select({ id: categoryRelationships.contentId })
    .from(categoryRelationships)
    .where(
      and(
        eq(categoryRelationships.workspaceId, siteId),
        eq(categoryRelationships.contentType, LISTING_CONTENT_TYPE),
        eq(categoryRelationships.categoryId, categoryId)
      )
    )
}

/** One page of published listings, ordered and counted. */
async function listingPage(
  siteId: string,
  options: {
    search?: string
    categoryId?: string
    sort: DirectorySort
    page: number
  },
  database: CustomShellDb
): Promise<{ listings: PublicListingCard[]; total: number; page: number }> {
  const page = Math.max(1, Math.trunc(options.page))
  const offset = (page - 1) * DIRECTORY_PAGE_SIZE

  const filters = [publishedOnSite(siteId)]

  const search = options.search?.trim()
  if (search) {
    const pattern = `%${search}%`
    // Title and the line under it. Not the slug — a visitor searches for what
    // a place is called, and the admin's list already searches addresses.
    const searchFilter = or(
      ilike(directoryListings.title, pattern),
      ilike(directoryListings.metaDescription, pattern)
    )
    if (searchFilter) filters.push(searchFilter)
  }

  if (options.categoryId) {
    filters.push(
      inArray(
        directoryListings.id,
        // Written as a subquery rather than two round trips: an empty category
        // then matches nothing on its own, with no "did I get an empty list"
        // branch to get wrong.
        listingIdsInCategory(siteId, options.categoryId, database)
      )
    )
  }

  const where = and(...filters)

  const [rows, [countRow]] = await Promise.all([
    database
      .select(cardColumns)
      .from(directoryListings)
      .where(where)
      .orderBy(...orderFor(options.sort, siteId))
      .limit(DIRECTORY_PAGE_SIZE)
      .offset(offset),
    database
      .select({ total: sql<number>`count(*)::int` })
      .from(directoryListings)
      .where(where),
  ])

  return {
    listings: await toCards(siteId, rows, database),
    total: countRow?.total ?? 0,
    page,
  }
}

/** The browse page: one page of listings and the filters above it. */
export async function readPublicBrowse(
  site: VisitorSite,
  options: { search?: string; category?: string; sort: DirectorySort; page: number },
  database: CustomShellDb = db
): Promise<PublicBrowse> {
  const allCategories = await publicCategories(site.id, database)
  const chosen = options.category
    ? allCategories.find((category) => category.slug === options.category)
    : undefined

  // A category address nobody has is treated as no filter rather than as an
  // error: a stale link should still show the directory.
  const { listings, total, page } = await listingPage(
    site.id,
    { ...options, categoryId: chosen?.id },
    database
  )

  return {
    site: { name: site.name, url: site.url },
    listings,
    total,
    page,
    pageSize: DIRECTORY_PAGE_SIZE,
    categories: allCategories.filter((category) => category.listingCount > 0),
  }
}

/**
 * Other published listings sharing a category with this one.
 *
 * Same rule as the directory app: anything in one of its categories, itself
 * excluded, in the hand-set order. A listing in no category has no related
 * listings, which is right — there is nothing saying what it is like.
 */
async function relatedListings(
  siteId: string,
  listingId: string,
  categoryIds: string[],
  database: CustomShellDb
): Promise<PublicListingCard[]> {
  if (categoryIds.length === 0) return []

  const siblings = database
    .select({ id: categoryRelationships.contentId })
    .from(categoryRelationships)
    .where(
      and(
        eq(categoryRelationships.workspaceId, siteId),
        eq(categoryRelationships.contentType, LISTING_CONTENT_TYPE),
        inArray(categoryRelationships.categoryId, categoryIds)
      )
    )

  const rows = await database
    .select(cardColumns)
    .from(directoryListings)
    .where(
      and(
        publishedOnSite(siteId),
        ne(directoryListings.id, listingId),
        inArray(directoryListings.id, siblings)
      )
    )
    .orderBy(...orderFor("order", siteId))
    .limit(RELATED_LISTING_COUNT)

  return toCards(siteId, rows, database)
}

/**
 * One listing by its address, or null.
 *
 * Null covers all three ways this misses — no such address, a draft, another
 * site's listing — on purpose. A visitor is told the same thing in each case,
 * and so is anybody calling this endpoint directly.
 */
export async function readPublicListing(
  site: VisitorSite,
  slug: string,
  // Who is reading, when they are signed in. Only ever used to tell them where
  // their *own* claim stands; nothing about anybody else's is returned.
  options: { viewerId?: string | null } = {},
  database: CustomShellDb = db
): Promise<PublicListingPage | null> {
  const [row] = await database
    .select()
    .from(directoryListings)
    .where(and(publishedOnSite(site.id), eq(directoryListings.slug, slug)))
    .limit(1)

  if (!row) return null

  const links = await database
    .select({
      id: categories.id,
      name: categories.name,
      slug: categories.slug,
      isPrimary: categoryRelationships.isPrimary,
    })
    .from(categoryRelationships)
    .innerJoin(categories, eq(categories.id, categoryRelationships.categoryId))
    .where(
      and(
        eq(categoryRelationships.workspaceId, site.id),
        eq(categoryRelationships.contentType, LISTING_CONTENT_TYPE),
        eq(categoryRelationships.contentId, row.id)
      )
    )
    .orderBy(desc(categoryRelationships.isPrimary), asc(categories.name))

  const primary = links.find((link) => link.isPrimary) ?? links[0] ?? null

  const [settings, claimState, featured] = await Promise.all([
    directorySettingsFor(site.id, database),
    claimStateFor(site.id, row.id, options.viewerId ?? null, database),
    activeFeaturedForListings(site.id, [row.id], database),
  ])

  return {
    site: { name: site.name, url: site.url },
    listing: {
      id: row.id,
      title: row.title,
      slug: row.slug,
      metaDescription: row.metaDescription,
      featuredImage: row.featuredImage,
      // Cleaned on the way out as well as in, exactly as the admin's read
      // does: a row edited straight in the database is still only allowed to
      // hand a page shapes it knows are safe.
      contactLinks: cleanContactLinks(row.contactLinks),
      body: cleanWrittenPageBody(row.body),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      featured: featured.has(row.id),
    },
    categories: links.map((link) => ({ name: link.name, slug: link.slug })),
    primaryCategory: primary
      ? { name: primary.name, slug: primary.slug }
      : null,
    related: await relatedListings(
      site.id,
      row.id,
      links.map((link) => link.id),
      database
    ),
    claim: {
      enabled: settings.claimsEnabled,
      signedIn: Boolean(options.viewerId),
      claimed: claimState.claimed,
      mine: claimState.mine,
      buttonLabel: settings.claimButtonLabel,
      pendingMessage: settings.claimPendingMessage,
      approvedMessage: settings.claimApprovedMessage,
    },
  }
}

/** Home → … → this category, for the breadcrumb. */
function ancestorsOf(
  category: PublicCategory,
  all: PublicCategory[]
): PublicCategoryLink[] {
  const byId = new Map(all.map((row) => [row.id, row]))
  const chain: PublicCategoryLink[] = []

  let walker: PublicCategory | undefined = category
  // A tree that somehow pointed at itself would loop forever, so the walk is
  // bounded rather than trusted. The same twenty the admin's own tree check
  // uses.
  for (let depth = 0; walker && depth < 20; depth += 1) {
    chain.unshift({ name: walker.name, slug: walker.slug })
    walker = walker.parentId ? byId.get(walker.parentId) : undefined
  }
  return chain
}

/** One category's page, or null when this site has no category at that address. */
export async function readPublicCategory(
  site: VisitorSite,
  slug: string,
  options: { page: number },
  database: CustomShellDb = db
): Promise<PublicCategoryPage | null> {
  const all = await publicCategories(site.id, database)
  const category = all.find((row) => row.slug === slug)
  if (!category) return null

  // Always the hand-set order. A category page is one shelf and an admin
  // arranged it; there is no control on the page to say otherwise.
  const { listings, total, page } = await listingPage(
    site.id,
    { categoryId: category.id, sort: "order", page: options.page },
    database
  )

  return {
    site: { name: site.name, url: site.url },
    category,
    ancestors: ancestorsOf(category, all),
    children: all.filter((row) => row.parentId === category.id),
    listings,
    total,
    page,
    pageSize: DIRECTORY_PAGE_SIZE,
  }
}
