import { and, asc, count, desc, eq, ilike, inArray, or, sql } from "drizzle-orm"

import { cleanContactLinks } from "@/lib/directory/contact-links"
import { now, uuid } from "@/server/auth/security"
import { db, type CustomShellDb } from "@/server/db"
import {
  directoryListings,
  directorySaveCollections,
  directorySaveItems,
} from "@/server/directory/schema"
import { customShellUsers, customShellWorkspaces } from "@/server/schema"
import { directorySiteUrl } from "@/server/directory/site-url"
import {
  publicListingCardsByIds,
  type PublicListingCard,
  type PublicSite,
} from "@/server/directory/public"

export type SaveCollectionState = {
  id: string
  name: string
  saved: boolean
  itemCount: number
}

export type SavedListing = {
  id: string
  title: string
  slug: string
  featuredImage: string
  address: string
  savedAt: Date
}

export type SavedCollection = {
  id: string
  name: string
  isPublic: boolean
  siteId: string
  siteName: string
  profileUrl: string
  items: SavedListing[]
}

export type PublicSavedCollection = {
  id: string
  name: string
  listings: PublicListingCard[]
}

export type PublicSavedProfile = {
  site: PublicSite
  collections: PublicSavedCollection[]
}

export type AdminSavedCollection = SavedCollection & {
  ownerId: string
  ownerName: string
  ownerEmail: string
}

export type AdminSavedCollectionSummary = {
  id: string
  name: string
  isPublic: boolean
  ownerName: string
  ownerEmail: string
  itemCount: number
}

export type SavedCollectionSortColumn =
  "name" | "owner" | "visibility" | "listings"

async function publishedListing(
  workspaceId: string,
  listingId: string,
  database: CustomShellDb
) {
  const [listing] = await database
    .select({ id: directoryListings.id })
    .from(directoryListings)
    .where(
      and(
        eq(directoryListings.id, listingId),
        eq(directoryListings.workspaceId, workspaceId),
        eq(directoryListings.status, "published")
      )
    )
    .limit(1)
  if (!listing) throw new Error("That listing is not available to save.")
  return listing
}

async function ensureFirstCollection(
  workspaceId: string,
  userId: string,
  database: CustomShellDb
) {
  const [existing] = await database
    .select({ id: directorySaveCollections.id })
    .from(directorySaveCollections)
    .where(
      and(
        eq(directorySaveCollections.workspaceId, workspaceId),
        eq(directorySaveCollections.userId, userId)
      )
    )
    .limit(1)
  if (existing) return

  const at = now()
  await database
    .insert(directorySaveCollections)
    .values({
      id: uuid(),
      workspaceId,
      userId,
      name: "Saved",
      createdAt: at,
      updatedAt: at,
    })
    .onConflictDoNothing()
}

/** A listing's save folders for this account and this site only. */
export async function saveStateFor(
  workspaceId: string,
  userId: string,
  listingId: string,
  database: CustomShellDb = db
): Promise<SaveCollectionState[]> {
  await publishedListing(workspaceId, listingId, database)
  await ensureFirstCollection(workspaceId, userId, database)

  const rows = await database
    .select({
      id: directorySaveCollections.id,
      name: directorySaveCollections.name,
      saved: sql<boolean>`coalesce(bool_or(${directorySaveItems.listingId} = ${listingId}), false)`,
      itemCount: sql<number>`count(${directorySaveItems.id})::int`,
    })
    .from(directorySaveCollections)
    .leftJoin(
      directorySaveItems,
      and(
        eq(directorySaveItems.collectionId, directorySaveCollections.id),
        eq(directorySaveItems.userId, userId),
        eq(directorySaveItems.workspaceId, workspaceId)
      )
    )
    .where(
      and(
        eq(directorySaveCollections.workspaceId, workspaceId),
        eq(directorySaveCollections.userId, userId)
      )
    )
    .groupBy(directorySaveCollections.id)
    .orderBy(
      asc(directorySaveCollections.createdAt),
      asc(directorySaveCollections.name)
    )

  return rows
}

/** Add or remove one listing. Every id is checked against the account and site. */
export async function setListingSaved(
  workspaceId: string,
  userId: string,
  input: { collectionId: string; listingId: string; saved: boolean },
  database: CustomShellDb = db
) {
  await publishedListing(workspaceId, input.listingId, database)
  const [collection] = await database
    .select({ id: directorySaveCollections.id })
    .from(directorySaveCollections)
    .where(
      and(
        eq(directorySaveCollections.id, input.collectionId),
        eq(directorySaveCollections.workspaceId, workspaceId),
        eq(directorySaveCollections.userId, userId)
      )
    )
    .limit(1)
  if (!collection) throw new Error("That saved list no longer exists.")

  if (input.saved) {
    await database
      .insert(directorySaveItems)
      .values({
        id: uuid(),
        workspaceId,
        userId,
        collectionId: collection.id,
        listingId: input.listingId,
        createdAt: now(),
      })
      .onConflictDoNothing()
  } else {
    await database
      .delete(directorySaveItems)
      .where(
        and(
          eq(directorySaveItems.workspaceId, workspaceId),
          eq(directorySaveItems.userId, userId),
          eq(directorySaveItems.collectionId, collection.id),
          eq(directorySaveItems.listingId, input.listingId)
        )
      )
  }

  await database
    .update(directorySaveCollections)
    .set({ updatedAt: now() })
    .where(eq(directorySaveCollections.id, collection.id))
  return saveStateFor(workspaceId, userId, input.listingId, database)
}

/** Create a named list and put this listing in it as one transaction. */
export async function createSaveCollection(
  workspaceId: string,
  userId: string,
  input: { listingId: string; name: string },
  database: CustomShellDb = db
) {
  await publishedListing(workspaceId, input.listingId, database)
  const name = input.name.trim().replace(/\s+/g, " ").slice(0, 80)
  if (!name) throw new Error("Give the saved list a name.")

  const [duplicate] = await database
    .select({ id: directorySaveCollections.id })
    .from(directorySaveCollections)
    .where(
      and(
        eq(directorySaveCollections.workspaceId, workspaceId),
        eq(directorySaveCollections.userId, userId),
        sql`lower(${directorySaveCollections.name}) = ${name.toLowerCase()}`
      )
    )
    .limit(1)
  if (duplicate)
    throw new Error("You already have a saved list with that name.")

  const at = now()
  await database.transaction(async (tx) => {
    const collectionId = uuid()
    const [created] = await tx
      .insert(directorySaveCollections)
      .values({
        id: collectionId,
        workspaceId,
        userId,
        name,
        createdAt: at,
        updatedAt: at,
      })
      .onConflictDoNothing()
      .returning({ id: directorySaveCollections.id })
    if (!created)
      throw new Error("You already have a saved list with that name.")
    await tx.insert(directorySaveItems).values({
      id: uuid(),
      workspaceId,
      userId,
      collectionId,
      listingId: input.listingId,
      createdAt: at,
    })
  })
  return saveStateFor(workspaceId, userId, input.listingId, database)
}

/** All saved folders for an account, grouped by site by the caller. */
export async function savedCollectionsForUser(
  userId: string,
  database: CustomShellDb = db
): Promise<SavedCollection[]> {
  const rows = await database
    .select({
      collectionId: directorySaveCollections.id,
      collectionName: directorySaveCollections.name,
      isPublic: directorySaveCollections.isPublic,
      siteId: directorySaveCollections.workspaceId,
      siteName: customShellWorkspaces.name,
      siteSubdomain: customShellWorkspaces.subdomain,
      siteCustomDomain: customShellWorkspaces.customDomain,
      listingId: directoryListings.id,
      title: directoryListings.title,
      slug: directoryListings.slug,
      featuredImage: directoryListings.featuredImage,
      contactLinks: directoryListings.contactLinks,
      savedAt: directorySaveItems.createdAt,
    })
    .from(directorySaveCollections)
    .innerJoin(
      customShellWorkspaces,
      eq(customShellWorkspaces.id, directorySaveCollections.workspaceId)
    )
    .leftJoin(
      directorySaveItems,
      and(
        eq(directorySaveItems.collectionId, directorySaveCollections.id),
        eq(directorySaveItems.userId, userId)
      )
    )
    .leftJoin(
      directoryListings,
      and(
        eq(directoryListings.id, directorySaveItems.listingId),
        eq(directoryListings.workspaceId, directorySaveCollections.workspaceId),
        eq(directoryListings.status, "published")
      )
    )
    .where(eq(directorySaveCollections.userId, userId))
    .orderBy(
      asc(customShellWorkspaces.name),
      asc(directorySaveCollections.createdAt),
      desc(directorySaveItems.createdAt)
    )

  const collections = new Map<string, SavedCollection>()
  for (const row of rows) {
    let collection = collections.get(row.collectionId)
    if (!collection) {
      collection = {
        id: row.collectionId,
        name: row.collectionName,
        isPublic: row.isPublic,
        siteId: row.siteId,
        siteName: row.siteName,
        profileUrl: `${directorySiteUrl({
          subdomain: row.siteSubdomain,
          customDomain: row.siteCustomDomain || null,
        })}/profile/${userId}`,
        items: [],
      }
      collections.set(row.collectionId, collection)
    }
    if (row.listingId && row.title && row.slug && row.savedAt) {
      collection.items.push({
        id: row.listingId,
        title: row.title,
        slug: row.slug,
        featuredImage: row.featuredImage ?? "",
        address: cleanContactLinks(row.contactLinks).address,
        savedAt: row.savedAt,
      })
    }
  }
  return [...collections.values()]
}

/** Change one list's public status after checking its owner and site. */
export async function setSaveCollectionPublic(
  workspaceId: string,
  userId: string,
  collectionId: string,
  isPublic: boolean,
  database: CustomShellDb = db
) {
  return updateSaveCollectionPublic(
    workspaceId,
    collectionId,
    isPublic,
    database,
    userId
  )
}

export async function setSaveCollectionPublicAsAdmin(
  workspaceId: string,
  collectionId: string,
  isPublic: boolean,
  database: CustomShellDb = db
) {
  return updateSaveCollectionPublic(
    workspaceId,
    collectionId,
    isPublic,
    database
  )
}

async function updateSaveCollectionPublic(
  workspaceId: string,
  collectionId: string,
  isPublic: boolean,
  database: CustomShellDb,
  userId?: string
) {
  const [updated] = await database
    .update(directorySaveCollections)
    .set({ isPublic, updatedAt: now() })
    .where(
      and(
        eq(directorySaveCollections.id, collectionId),
        eq(directorySaveCollections.workspaceId, workspaceId),
        ...(userId ? [eq(directorySaveCollections.userId, userId)] : [])
      )
    )
    .returning({ id: directorySaveCollections.id })

  if (!updated) throw new Error("That saved list no longer exists.")
  return { collectionId: updated.id, isPublic }
}

async function editableSaveCollection(
  workspaceId: string,
  collectionId: string,
  database: CustomShellDb,
  userId?: string
) {
  const [collection] = await database
    .select({
      id: directorySaveCollections.id,
      userId: directorySaveCollections.userId,
    })
    .from(directorySaveCollections)
    .where(
      and(
        eq(directorySaveCollections.id, collectionId),
        eq(directorySaveCollections.workspaceId, workspaceId),
        ...(userId ? [eq(directorySaveCollections.userId, userId)] : [])
      )
    )
    .limit(1)
  if (!collection) throw new Error("That saved list no longer exists.")
  return collection
}

async function renameEditableSaveCollection(
  workspaceId: string,
  collectionId: string,
  nameInput: string,
  database: CustomShellDb,
  userId?: string
) {
  const collection = await editableSaveCollection(
    workspaceId,
    collectionId,
    database,
    userId
  )
  const name = nameInput.trim().replace(/\s+/g, " ").slice(0, 80)
  if (!name) throw new Error("Give the saved list a name.")

  const [duplicate] = await database
    .select({ id: directorySaveCollections.id })
    .from(directorySaveCollections)
    .where(
      and(
        eq(directorySaveCollections.workspaceId, workspaceId),
        eq(directorySaveCollections.userId, collection.userId),
        sql`lower(${directorySaveCollections.name}) = ${name.toLowerCase()}`,
        sql`${directorySaveCollections.id} <> ${collection.id}`
      )
    )
    .limit(1)
  if (duplicate)
    throw new Error("That account already has a saved list with that name.")

  try {
    await database
      .update(directorySaveCollections)
      .set({ name, updatedAt: now() })
      .where(eq(directorySaveCollections.id, collection.id))
  } catch (error) {
    if (isSavedListNameClash(error)) {
      throw new Error("That account already has a saved list with that name.")
    }
    throw error
  }
  return { collectionId: collection.id, name }
}

const SAVED_LIST_NAME_INDEX = "ux_directory_save_collections_site_user_name"

function isSavedListNameClash(error: unknown): boolean {
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
    if (detail.code === "23505" && named.includes(SAVED_LIST_NAME_INDEX)) {
      return true
    }
    step = detail.cause
  }
  return false
}

export function renameSaveCollection(
  workspaceId: string,
  userId: string,
  collectionId: string,
  name: string,
  database: CustomShellDb = db
) {
  return renameEditableSaveCollection(
    workspaceId,
    collectionId,
    name,
    database,
    userId
  )
}

export function renameSaveCollectionAsAdmin(
  workspaceId: string,
  collectionId: string,
  name: string,
  database: CustomShellDb = db
) {
  return renameEditableSaveCollection(workspaceId, collectionId, name, database)
}

async function deleteEditableSaveCollection(
  workspaceId: string,
  collectionId: string,
  database: CustomShellDb,
  userId?: string
) {
  const collection = await editableSaveCollection(
    workspaceId,
    collectionId,
    database,
    userId
  )
  await database
    .delete(directorySaveCollections)
    .where(eq(directorySaveCollections.id, collection.id))
  return { collectionId: collection.id }
}

export function deleteSaveCollection(
  workspaceId: string,
  userId: string,
  collectionId: string,
  database: CustomShellDb = db
) {
  return deleteEditableSaveCollection(
    workspaceId,
    collectionId,
    database,
    userId
  )
}

export async function deleteSaveCollectionsAsAdmin(
  workspaceId: string,
  collectionIds: string[],
  database: CustomShellDb = db
) {
  if (collectionIds.length === 0) return { deleted: [] as string[] }
  const deleted = await database
    .delete(directorySaveCollections)
    .where(
      and(
        eq(directorySaveCollections.workspaceId, workspaceId),
        inArray(directorySaveCollections.id, collectionIds)
      )
    )
    .returning({ id: directorySaveCollections.id })
  return { deleted: deleted.map((row) => row.id) }
}

export async function removeSavedItemAsAdmin(
  workspaceId: string,
  collectionId: string,
  listingId: string,
  database: CustomShellDb = db
) {
  const collection = await editableSaveCollection(
    workspaceId,
    collectionId,
    database
  )
  await database
    .delete(directorySaveItems)
    .where(
      and(
        eq(directorySaveItems.workspaceId, workspaceId),
        eq(directorySaveItems.userId, collection.userId),
        eq(directorySaveItems.collectionId, collection.id),
        eq(directorySaveItems.listingId, listingId)
      )
    )
  await database
    .update(directorySaveCollections)
    .set({ updatedAt: now() })
    .where(eq(directorySaveCollections.id, collection.id))
  return { collectionId: collection.id, listingId }
}

/** One bounded page for the admin table. List contents load only when opened. */
export async function savedCollectionPageForWorkspace(
  workspaceId: string,
  options: {
    search?: string
    sort?: SavedCollectionSortColumn
    direction?: "asc" | "desc"
    limit?: number
    offset?: number
  } = {},
  database: CustomShellDb = db
): Promise<{ collections: AdminSavedCollectionSummary[]; total: number }> {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 100)
  const offset = Math.max(options.offset ?? 0, 0)
  const filters = [eq(directorySaveCollections.workspaceId, workspaceId)]
  const search = options.search?.trim()
  if (search) {
    const pattern = `%${search}%`
    const searchFilter = or(
      ilike(directorySaveCollections.name, pattern),
      ilike(customShellUsers.name, pattern),
      ilike(customShellUsers.email, pattern)
    )
    if (searchFilter) filters.push(searchFilter)
  }
  const where = and(...filters)
  const itemCount = sql<number>`count(${directoryListings.id})::int`
  const order = options.direction === "desc" ? desc : asc
  const column = {
    name: directorySaveCollections.name,
    owner: customShellUsers.name,
    visibility: directorySaveCollections.isPublic,
    listings: itemCount,
  }[options.sort ?? "name"]

  const [collections, [totalRow]] = await Promise.all([
    database
      .select({
        id: directorySaveCollections.id,
        name: directorySaveCollections.name,
        isPublic: directorySaveCollections.isPublic,
        ownerName: customShellUsers.name,
        ownerEmail: customShellUsers.email,
        itemCount,
      })
      .from(directorySaveCollections)
      .innerJoin(
        customShellUsers,
        eq(customShellUsers.id, directorySaveCollections.userId)
      )
      .leftJoin(
        directorySaveItems,
        and(
          eq(directorySaveItems.collectionId, directorySaveCollections.id),
          eq(directorySaveItems.workspaceId, workspaceId)
        )
      )
      .leftJoin(
        directoryListings,
        and(
          eq(directoryListings.id, directorySaveItems.listingId),
          eq(directoryListings.workspaceId, workspaceId),
          eq(directoryListings.status, "published")
        )
      )
      .where(where)
      .groupBy(
        directorySaveCollections.id,
        customShellUsers.name,
        customShellUsers.email
      )
      .orderBy(order(column), asc(directorySaveCollections.id))
      .limit(limit)
      .offset(offset),
    database
      .select({ total: sql<number>`count(*)::int` })
      .from(directorySaveCollections)
      .innerJoin(
        customShellUsers,
        eq(customShellUsers.id, directorySaveCollections.userId)
      )
      .where(where),
  ])

  return { collections, total: totalRow?.total ?? 0 }
}

/** The opened list and its published items, still limited to the selected site. */
export async function savedCollectionForWorkspace(
  workspaceId: string,
  collectionId: string,
  database: CustomShellDb = db
): Promise<AdminSavedCollection | null> {
  const rows = await database
    .select({
      collectionId: directorySaveCollections.id,
      collectionName: directorySaveCollections.name,
      isPublic: directorySaveCollections.isPublic,
      ownerId: directorySaveCollections.userId,
      ownerName: customShellUsers.name,
      ownerEmail: customShellUsers.email,
      siteId: directorySaveCollections.workspaceId,
      siteName: customShellWorkspaces.name,
      siteSubdomain: customShellWorkspaces.subdomain,
      siteCustomDomain: customShellWorkspaces.customDomain,
      listingId: directoryListings.id,
      title: directoryListings.title,
      slug: directoryListings.slug,
      featuredImage: directoryListings.featuredImage,
      contactLinks: directoryListings.contactLinks,
      savedAt: directorySaveItems.createdAt,
    })
    .from(directorySaveCollections)
    .innerJoin(
      customShellUsers,
      eq(customShellUsers.id, directorySaveCollections.userId)
    )
    .innerJoin(
      customShellWorkspaces,
      eq(customShellWorkspaces.id, directorySaveCollections.workspaceId)
    )
    .leftJoin(
      directorySaveItems,
      and(
        eq(directorySaveItems.collectionId, directorySaveCollections.id),
        eq(directorySaveItems.workspaceId, workspaceId)
      )
    )
    .leftJoin(
      directoryListings,
      and(
        eq(directoryListings.id, directorySaveItems.listingId),
        eq(directoryListings.workspaceId, workspaceId),
        eq(directoryListings.status, "published")
      )
    )
    .where(
      and(
        eq(directorySaveCollections.workspaceId, workspaceId),
        eq(directorySaveCollections.id, collectionId)
      )
    )
    .orderBy(
      asc(customShellUsers.name),
      asc(directorySaveCollections.createdAt),
      desc(directorySaveItems.createdAt)
    )

  const collections = new Map<string, AdminSavedCollection>()
  for (const row of rows) {
    let collection = collections.get(row.collectionId)
    if (!collection) {
      collection = {
        id: row.collectionId,
        name: row.collectionName,
        isPublic: row.isPublic,
        ownerId: row.ownerId,
        ownerName: row.ownerName,
        ownerEmail: row.ownerEmail,
        siteId: row.siteId,
        siteName: row.siteName,
        profileUrl: `${directorySiteUrl({
          subdomain: row.siteSubdomain,
          customDomain: row.siteCustomDomain || null,
        })}/profile/${row.ownerId}`,
        items: [],
      }
      collections.set(row.collectionId, collection)
    }
    if (row.listingId && row.title && row.slug && row.savedAt) {
      collection.items.push({
        id: row.listingId,
        title: row.title,
        slug: row.slug,
        featuredImage: row.featuredImage ?? "",
        address: cleanContactLinks(row.contactLinks).address,
        savedAt: row.savedAt,
      })
    }
  }
  return collections.get(collectionId) ?? null
}

/** Public lists for one account on the visited site, or the same miss as no account. */
export async function publicSavedProfile(
  site: { id: string; name: string; url: string },
  profileId: string,
  database: CustomShellDb = db
): Promise<PublicSavedProfile | null> {
  const rows = await database
    .select({
      collectionId: directorySaveCollections.id,
      collectionName: directorySaveCollections.name,
      listingId: directorySaveItems.listingId,
    })
    .from(directorySaveCollections)
    .leftJoin(
      directorySaveItems,
      and(
        eq(directorySaveItems.collectionId, directorySaveCollections.id),
        eq(directorySaveItems.workspaceId, site.id),
        eq(directorySaveItems.userId, profileId)
      )
    )
    .where(
      and(
        eq(directorySaveCollections.workspaceId, site.id),
        eq(directorySaveCollections.userId, profileId),
        eq(directorySaveCollections.isPublic, true)
      )
    )
    .orderBy(
      asc(directorySaveCollections.createdAt),
      desc(directorySaveItems.createdAt)
    )

  if (rows.length === 0) return null

  const cards = await publicListingCardsByIds(
    site.id,
    rows.flatMap((row) => (row.listingId ? [row.listingId] : [])),
    database
  )
  const cardsById = new Map(cards.map((card) => [card.id, card]))
  const collections = new Map<string, PublicSavedCollection>()

  for (const row of rows) {
    let collection = collections.get(row.collectionId)
    if (!collection) {
      collection = {
        id: row.collectionId,
        name: row.collectionName,
        listings: [],
      }
      collections.set(row.collectionId, collection)
    }
    if (row.listingId) {
      const card = cardsById.get(row.listingId)
      if (card) collection.listings.push(card)
    }
  }

  return {
    site: { name: site.name, url: site.url },
    collections: [...collections.values()],
  }
}

/** What an admin sees: the most-saved listings on the site currently selected. */
export async function mostSavedListings(
  workspaceId: string,
  database: CustomShellDb = db
) {
  return database
    .select({
      id: directoryListings.id,
      title: directoryListings.title,
      slug: directoryListings.slug,
      saves: count(directorySaveItems.id),
      people: sql<number>`count(distinct ${directorySaveItems.userId})::int`,
    })
    .from(directorySaveItems)
    .innerJoin(
      directoryListings,
      eq(directoryListings.id, directorySaveItems.listingId)
    )
    .where(eq(directorySaveItems.workspaceId, workspaceId))
    .groupBy(directoryListings.id)
    .orderBy(desc(count(directorySaveItems.id)), asc(directoryListings.title))
    .limit(100)
}

export async function saveImpactForListings(
  workspaceId: string,
  listingIds: string[],
  database: CustomShellDb = db
) {
  if (listingIds.length === 0) return { saves: 0 }
  const [row] = await database
    .select({ saves: count(directorySaveItems.id) })
    .from(directorySaveItems)
    .where(
      and(
        eq(directorySaveItems.workspaceId, workspaceId),
        inArray(directorySaveItems.listingId, listingIds)
      )
    )
  return { saves: row?.saves ?? 0 }
}
