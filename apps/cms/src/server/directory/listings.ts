import {
  and,
  asc,
  desc,
  eq,
  getTableColumns,
  ilike,
  inArray,
  ne,
  notInArray,
  or,
  sql,
} from "drizzle-orm"

import {
  cleanContactLinks,
  type ContactLinks,
} from "@/lib/directory/contact-links"
import { LISTING_META_DESCRIPTION_MAX } from "@/lib/directory/field-lengths"
import { slugFromTitle, slugProblem } from "@/lib/directory/slugs"
import {
  isListingRating,
  LISTING_RATING_ERROR,
} from "@/lib/directory/listing-rating"
import {
  cleanListingCoordinates,
  cleanListingGallery,
  cleanListingHours,
  requireListingCoordinates,
  type ListingHours,
} from "@/lib/directory/listing-details"
import {
  firstFreeSlug as firstFreeSlugRule,
  requireFreeSlug as requireFreeSlugRule,
} from "@/server/directory/slug-rules"
import type {
  ListingSortColumn,
  ListingViewRange,
} from "@/lib/directory/listing-sort"
import {
  cleanWrittenPageBody,
  emptyWrittenPageBody,
  type WrittenPageNode,
} from "@/lib/pages/written-page-body"
import { db, type CustomShellDb } from "@/server/db"
import { now, uuid } from "@/server/auth/security"
import {
  categories,
  categoryRelationships,
  directoryListings,
  LISTING_CONTENT_TYPE,
  type DirectoryListingRow,
} from "@/server/directory/schema"
import {
  listingViewCounts,
  listingViewJoin,
  listingViewTotal,
} from "@/server/directory/views"
import { clearPublicDirectoryCache } from "@/server/directory/public-cache"
import { customShellTrafficDailyFacts } from "@/server/schema"

/**
 * Directory listings: a page per business or place. A listing is a plain
 * record — fixed columns, contact links, one written body — edited with a
 * normal form. The refusals here are sentences on purpose: every one is about
 * something an admin typed, and the form shows it straight back.
 */

export const MAX_LISTING_TITLE = 200

export type ListingStatus = "draft" | "published"

export type DirectoryListing = {
  id: string
  title: string
  slug: string
  metaDescription: string
  rating: number | null
  status: ListingStatus
  displayOrder: number
  featuredImage: string
  gallery: string[]
  hours: ListingHours
  latitude: number | null
  longitude: number | null
  contactLinks: ContactLinks
  body: WrittenPageNode
  createdAt: Date
  updatedAt: Date
}

/** A dashboard row: the listing without its body, plus its category names. */
export type ListingSummary = Omit<
  DirectoryListing,
  "body" | "contactLinks" | "gallery" | "hours" | "latitude" | "longitude"
> & { categories: string[]; views: number }

function toListing(row: DirectoryListingRow): DirectoryListing {
  const coordinates = cleanListingCoordinates(row.latitude, row.longitude)
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    metaDescription: row.metaDescription,
    rating: row.rating,
    status: row.status === "published" ? "published" : "draft",
    displayOrder: row.displayOrder,
    featuredImage: row.featuredImage,
    gallery: cleanListingGallery(row.gallery),
    hours: cleanListingHours(row.hours),
    latitude: coordinates?.latitude ?? null,
    longitude: coordinates?.longitude ?? null,
    // Cleaned on the way out as well as in: a row edited straight in the
    // database is still only allowed to hand a page safe shapes.
    contactLinks: cleanContactLinks(row.contactLinks),
    body: cleanWrittenPageBody(row.body),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

async function slugIsTaken(
  workspaceId: string,
  slug: string,
  exceptId: string | null,
  database: CustomShellDb
): Promise<boolean> {
  const [row] = await database
    .select({ id: directoryListings.id })
    .from(directoryListings)
    // **Taken on this site.** Another site using the address is not a clash —
    // that is the whole point of the unique index moving.
    .where(
      and(
        eq(directoryListings.workspaceId, workspaceId),
        eq(directoryListings.slug, slug),
        exceptId ? ne(directoryListings.id, exceptId) : undefined
      )
    )
    .limit(1)
  return Boolean(row)
}

const LISTING_NOUN = { one: "listing", many: "listings" }

/** The address a new or copied listing gets, numbered past any clash. */
function firstFreeSlug(
  workspaceId: string,
  wanted: string,
  database: CustomShellDb
) {
  return firstFreeSlugRule(
    wanted,
    (candidate) => slugIsTaken(workspaceId, candidate, null, database),
    LISTING_NOUN
  )
}

/** Refuses a hand-picked address that is taken, rather than renaming it. */
function requireFreeSlug(
  workspaceId: string,
  slug: string,
  exceptId: string | null,
  database: CustomShellDb
) {
  return requireFreeSlugRule(
    slug,
    (candidate) => slugIsTaken(workspaceId, candidate, exceptId, database),
    LISTING_NOUN
  )
}

function cleanTitle(raw: string): string {
  const title = raw.trim().slice(0, MAX_LISTING_TITLE)
  if (!title) throw new Error("A listing needs a title.")
  return title
}

/** The category names for each of these listings, for the dashboard rows. */
async function categoryNamesFor(
  workspaceId: string,
  listingIds: string[],
  database: CustomShellDb
): Promise<Map<string, string[]>> {
  if (listingIds.length === 0) return new Map()

  const rows = await database
    .select({
      contentId: categoryRelationships.contentId,
      name: categories.name,
      isPrimary: categoryRelationships.isPrimary,
    })
    .from(categoryRelationships)
    .innerJoin(categories, eq(categories.id, categoryRelationships.categoryId))
    .where(
      and(
        eq(categoryRelationships.workspaceId, workspaceId),
        eq(categoryRelationships.contentType, LISTING_CONTENT_TYPE),
        inArray(categoryRelationships.contentId, listingIds)
      )
    )
    .orderBy(desc(categoryRelationships.isPrimary), asc(categories.name))

  const names = new Map<string, string[]>()
  for (const row of rows) {
    const list = names.get(row.contentId) ?? []
    list.push(row.name)
    names.set(row.contentId, list)
  }
  return names
}

export async function listListings(
  workspaceId: string,
  options: {
    search?: string
    status?: ListingStatus
    sort?: ListingSortColumn
    direction?: "asc" | "desc"
    viewDays?: ListingViewRange
    limit?: number
    offset?: number
  } = {},
  database: CustomShellDb = db
): Promise<{ listings: ListingSummary[]; total: number }> {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200)
  const offset = Math.max(options.offset ?? 0, 0)
  const search = options.search?.trim()

  // The site's own listings, always. This is the whole boundary for the list:
  // take it out and every site's listings appear on every other's screen.
  const filters = [eq(directoryListings.workspaceId, workspaceId)]
  if (search) {
    const pattern = `%${search}%`
    const searchFilter = or(
      ilike(directoryListings.title, pattern),
      ilike(directoryListings.slug, pattern)
    )
    if (searchFilter) filters.push(searchFilter)
  }
  if (options.status) {
    filters.push(eq(directoryListings.status, options.status))
  }
  const where = and(...filters)
  const sortsByViews = options.sort === "views"
  const views = listingViewTotal()

  // Ordered here rather than in the browser: the page only ever holds one
  // page of listings, so sorting what already arrived would shuffle those
  // rows and leave the rest of the list where it was.
  const order = options.direction === "asc" ? asc : desc
  const column = {
    title: directoryListings.title,
    status: directoryListings.status,
    views,
    created: directoryListings.createdAt,
    updated: directoryListings.updatedAt,
  }[options.sort ?? "created"]

  const rowsQuery = sortsByViews
    ? database
        .select({ ...getTableColumns(directoryListings), views })
        .from(directoryListings)
        .leftJoin(
          customShellTrafficDailyFacts,
          listingViewJoin(workspaceId, options.viewDays ?? "all")
        )
        .where(where)
        .groupBy(directoryListings.id)
        // The id breaks ties, so a page boundary cannot land mid-tie and show
        // the same listing twice or skip one.
        .orderBy(order(views), asc(directoryListings.id))
        .limit(limit)
        .offset(offset)
    : database
        .select({
          ...getTableColumns(directoryListings),
          views: sql<number>`0`.mapWith(Number),
        })
        .from(directoryListings)
        .where(where)
        .orderBy(order(column), asc(directoryListings.id))
        .limit(limit)
        .offset(offset)

  const [rows, [countRow]] = await Promise.all([
    rowsQuery,
    database
      .select({ total: sql<number>`count(*)::int` })
      .from(directoryListings)
      .where(where),
  ])

  const listingIds = rows.map((row) => row.id)
  const [names, counts] = await Promise.all([
    categoryNamesFor(workspaceId, listingIds, database),
    sortsByViews
      ? new Map(rows.map((row) => [row.id, row.views]))
      : listingViewCounts(
          workspaceId,
          listingIds,
          options.viewDays ?? "all",
          database
        ),
  ])

  return {
    listings: rows.map((row) => {
      const {
        body: _body,
        contactLinks: _links,
        gallery: _gallery,
        hours: _hours,
        latitude: _latitude,
        longitude: _longitude,
        ...rest
      } = toListing(row)
      return {
        ...rest,
        categories: names.get(row.id) ?? [],
        views: counts.get(row.id) ?? 0,
      }
    }),
    total: countRow?.total ?? 0,
  }
}

/** One listing with everything the edit form holds, or null when it is gone. */
export async function findListing(
  workspaceId: string,
  id: string,
  database: CustomShellDb = db
): Promise<DirectoryListing | null> {
  const [row] = await database
    .select()
    .from(directoryListings)
    // The site is part of the lookup rather than checked after: an id from
    // another site is simply not found, which is both the safe answer and the
    // honest one.
    .where(
      and(
        eq(directoryListings.id, id),
        eq(directoryListings.workspaceId, workspaceId)
      )
    )
    .limit(1)
  return row ? toListing(row) : null
}

/**
 * A new listing: a title, a free address derived from it, and everything else
 * at its blank default. Born a draft on purpose — publishing is its own
 * decision, made on the edit form once there is something to publish.
 */
export async function createListing(
  workspaceId: string,
  input: { title: string; slug?: string },
  database: CustomShellDb = db
): Promise<DirectoryListing> {
  const title = cleanTitle(input.title)
  const chosen = input.slug?.trim()

  const wanted = chosen || slugFromTitle(title)
  const problem = slugProblem(wanted)
  if (problem) throw new Error(problem)

  let slug: string
  if (chosen) {
    // Hand-picked, so a clash is refused out loud rather than quietly renamed
    // into something the person did not ask for.
    await requireFreeSlug(workspaceId, wanted, null, database)
    slug = wanted
  } else {
    slug = await firstFreeSlug(workspaceId, wanted, database)
  }

  const at = now()
  const [row] = await database
    .insert(directoryListings)
    .values({
      id: uuid(),
      workspaceId,
      title,
      slug,
      contactLinks: cleanContactLinks(null),
      body: emptyWrittenPageBody(),
      createdAt: at,
      updatedAt: at,
    })
    .returning()

  if (!row) throw new Error("The listing was not created.")
  clearPublicDirectoryCache(workspaceId)
  return toListing(row)
}

export async function updateListing(
  workspaceId: string,
  id: string,
  input: {
    title?: string
    slug?: string
    metaDescription?: string
    rating?: number | null
    status?: ListingStatus
    displayOrder?: number
    featuredImage?: string
    gallery?: unknown
    hours?: unknown
    latitude?: number | null
    longitude?: number | null
    contactLinks?: unknown
    body?: unknown
  },
  database: CustomShellDb = db
): Promise<DirectoryListing> {
  const values: Record<string, unknown> = { updatedAt: now() }

  if (input.title !== undefined) values.title = cleanTitle(input.title)
  if (input.slug !== undefined) {
    const slug = input.slug.trim()
    await requireFreeSlug(workspaceId, slug, id, database)
    values.slug = slug
  }
  if (input.metaDescription !== undefined) {
    values.metaDescription = input.metaDescription
      .trim()
      .slice(0, LISTING_META_DESCRIPTION_MAX)
  }
  if (input.rating !== undefined) {
    if (input.rating !== null && !isListingRating(input.rating)) {
      throw new Error(LISTING_RATING_ERROR)
    }
    values.rating = input.rating
  }
  if (input.status !== undefined) values.status = input.status
  if (input.displayOrder !== undefined) {
    values.displayOrder = Math.trunc(input.displayOrder)
  }
  if (input.featuredImage !== undefined) {
    values.featuredImage = input.featuredImage.trim().slice(0, 600)
  }
  if (input.gallery !== undefined) {
    values.gallery = cleanListingGallery(input.gallery)
  }
  if (input.hours !== undefined) values.hours = cleanListingHours(input.hours)
  if (input.latitude !== undefined || input.longitude !== undefined) {
    const coordinates = requireListingCoordinates(
      input.latitude,
      input.longitude
    )
    values.latitude = coordinates?.latitude ?? null
    values.longitude = coordinates?.longitude ?? null
  }
  if (input.contactLinks !== undefined) {
    values.contactLinks = cleanContactLinks(input.contactLinks)
  }
  if (input.body !== undefined) values.body = cleanWrittenPageBody(input.body)

  const [row] = await database
    .update(directoryListings)
    .set(values)
    .where(
      and(
        eq(directoryListings.id, id),
        eq(directoryListings.workspaceId, workspaceId)
      )
    )
    .returning()

  if (!row) throw new Error("That listing no longer exists.")
  clearPublicDirectoryCache(workspaceId)
  return toListing(row)
}

/**
 * A copy to start from: same content, "Copy of" title, the next free numbered
 * address, and always a draft — a duplicate that published itself would put a
 * twin page live before anyone touched it.
 */
export async function duplicateListing(
  workspaceId: string,
  id: string,
  database: CustomShellDb = db
): Promise<DirectoryListing> {
  const source = await findListing(workspaceId, id, database)
  if (!source) throw new Error("That listing no longer exists.")

  const title = `Copy of ${source.title}`.slice(0, MAX_LISTING_TITLE)
  const slug = await firstFreeSlug(workspaceId, slugFromTitle(title), database)

  const at = now()
  // The copy and its categories together: a copy that lost its categories on
  // the way would look like a listing somebody had untagged on purpose.
  const row = await database.transaction(async (tx) => {
    const [created] = await tx
      .insert(directoryListings)
      .values({
        id: uuid(),
        workspaceId,
        title,
        slug,
        metaDescription: source.metaDescription,
        rating: source.rating,
        status: "draft",
        displayOrder: source.displayOrder,
        featuredImage: source.featuredImage,
        gallery: source.gallery,
        hours: source.hours,
        latitude: source.latitude,
        longitude: source.longitude,
        contactLinks: source.contactLinks,
        body: source.body,
        createdAt: at,
        updatedAt: at,
      })
      .returning()

    if (!created) throw new Error("The listing was not copied.")

    const links = await categoriesForListing(workspaceId, id, tx)
    if (links.length) {
      // The write half directly: these ids came out of the database a moment
      // ago, so there is nothing to check, and the public function would open
      // a transaction inside this one.
      await writeListingCategories(
        workspaceId,
        created.id,
        links.map((link) => link.categoryId),
        links.find((link) => link.isPrimary)?.categoryId ?? null,
        tx
      )
    }
    return created
  })

  clearPublicDirectoryCache(workspaceId)
  return toListing(row)
}

/**
 * What deleting these would take with it, for the confirmation to say out
 * loud before anything happens.
 */
export async function listingDeleteImpact(
  workspaceId: string,
  ids: string[],
  database: CustomShellDb = db
): Promise<{ listings: number; categoryLinks: number }> {
  if (ids.length === 0) return { listings: 0, categoryLinks: 0 }

  const [[listingRow], [linkRow]] = await Promise.all([
    database
      .select({ count: sql<number>`count(*)::int` })
      .from(directoryListings)
      .where(
        and(
          eq(directoryListings.workspaceId, workspaceId),
          inArray(directoryListings.id, ids)
        )
      ),
    database
      .select({ count: sql<number>`count(*)::int` })
      .from(categoryRelationships)
      .where(
        and(
          eq(categoryRelationships.workspaceId, workspaceId),
          eq(categoryRelationships.contentType, LISTING_CONTENT_TYPE),
          inArray(categoryRelationships.contentId, ids)
        )
      ),
  ])

  return {
    listings: listingRow?.count ?? 0,
    categoryLinks: linkRow?.count ?? 0,
  }
}

/**
 * One request for the whole selection. `kept` is what did not go — today that
 * can only mean a row somebody else already deleted — so the toast can count
 * honestly instead of saying "deleted" about things that were not.
 */
export async function deleteListings(
  workspaceId: string,
  ids: string[],
  database: CustomShellDb = db
): Promise<{ done: string[]; kept: string[] }> {
  if (ids.length === 0) return { done: [], kept: [] }

  // Both statements or neither. The relationship table is polymorphic, so it
  // has no foreign key to follow and the database will not tidy up after a
  // deleted listing — a failure between the two would leave rows pointing at
  // something that is gone, which every later impact summary would count.
  const done = await database.transaction(async (tx) => {
    const deleted = await tx
      .delete(directoryListings)
      .where(
        and(
          eq(directoryListings.workspaceId, workspaceId),
          inArray(directoryListings.id, ids)
        )
      )
      .returning({ id: directoryListings.id })
    const removed = deleted.map((row) => row.id)

    if (removed.length) {
      await tx
        .delete(categoryRelationships)
        .where(
          and(
            eq(categoryRelationships.workspaceId, workspaceId),
            eq(categoryRelationships.contentType, LISTING_CONTENT_TYPE),
            inArray(categoryRelationships.contentId, removed)
          )
        )
    }
    return removed
  })

  const doneSet = new Set(done)
  if (done.length) clearPublicDirectoryCache(workspaceId)
  return { done, kept: ids.filter((id) => !doneSet.has(id)) }
}

/** Which categories this listing is in, primary first. */
export async function categoriesForListing(
  workspaceId: string,
  listingId: string,
  database: CustomShellDb = db
): Promise<{ categoryId: string; isPrimary: boolean }[]> {
  const rows = await database
    .select({
      categoryId: categoryRelationships.categoryId,
      isPrimary: categoryRelationships.isPrimary,
    })
    .from(categoryRelationships)
    .where(
      and(
        eq(categoryRelationships.workspaceId, workspaceId),
        eq(categoryRelationships.contentType, LISTING_CONTENT_TYPE),
        eq(categoryRelationships.contentId, listingId)
      )
    )
    .orderBy(desc(categoryRelationships.isPrimary))
  return rows
}

/**
 * Makes the listing's category rows match the form: rows for these ids and no
 * others, with `primaryId` the one primary. A primary that is not in the list
 * is a form bug said out loud rather than silently added.
 */
export async function setListingCategories(
  workspaceId: string,
  listingId: string,
  categoryIds: string[],
  primaryId: string | null,
  database: CustomShellDb = db
): Promise<void> {
  const wanted = [...new Set(categoryIds)].slice(0, 50)
  if (primaryId && !wanted.includes(primaryId)) {
    throw new Error("The primary category has to be one of the chosen ones.")
  }

  // Only real categories get rows; an id that stopped existing between the
  // form loading and saving is dropped rather than failing the whole save.
  const existing = wanted.length
    ? await database
        .select({ id: categories.id })
        .from(categories)
        // A category from another site is not one of this listing's choices —
        // dropped here rather than refused, the same as one that stopped
        // existing between the form loading and the save.
        .where(
          and(
            eq(categories.workspaceId, workspaceId),
            inArray(categories.id, wanted)
          )
        )
    : []
  const keep = existing.map((row) => row.id)
  const keepSet = new Set(keep)
  const primary = primaryId && keepSet.has(primaryId) ? primaryId : null

  await database.transaction((tx) =>
    writeListingCategories(workspaceId, listingId, keep, primary, tx)
  )
  clearPublicDirectoryCache(workspaceId)
}

/**
 * The write half of the above, already inside a transaction — all of it or
 * none of it.
 *
 * These four statements only make sense together: drop the categories that
 * went, add the ones that arrived, take the primary marker off everything,
 * put it back on one. Failing between any two of them leaves a listing in a
 * state the form can never produce — tagged with a category nobody chose, or
 * with two primaries, or none.
 *
 * Separate from the public function so a caller that is already in a
 * transaction (copying a listing) can use it without opening a second one.
 * `keep` is trusted here: the caller has already checked those categories
 * exist.
 */
async function writeListingCategories(
  workspaceId: string,
  listingId: string,
  keep: string[],
  primary: string | null,
  tx: CustomShellDb
): Promise<void> {
  const listingRows = [
    eq(categoryRelationships.workspaceId, workspaceId),
    eq(categoryRelationships.contentType, LISTING_CONTENT_TYPE),
    eq(categoryRelationships.contentId, listingId),
  ]

  await tx
    .delete(categoryRelationships)
    .where(
      and(
        ...listingRows,
        ...(keep.length
          ? [notInArray(categoryRelationships.categoryId, keep)]
          : [])
      )
    )

  const current = await categoriesForListing(workspaceId, listingId, tx)
  const currentIds = new Set(current.map((row) => row.categoryId))

  const at = now()
  const missing = keep.filter((id) => !currentIds.has(id))
  if (missing.length) {
    await tx.insert(categoryRelationships).values(
      missing.map((categoryId) => ({
        id: uuid(),
        workspaceId,
        categoryId,
        contentType: LISTING_CONTENT_TYPE,
        contentId: listingId,
        isPrimary: false,
        createdAt: at,
      }))
    )
  }

  await tx
    .update(categoryRelationships)
    .set({ isPrimary: false })
    .where(and(...listingRows))
  if (primary) {
    await tx
      .update(categoryRelationships)
      .set({ isPrimary: true })
      .where(and(...listingRows, eq(categoryRelationships.categoryId, primary)))
  }
}
