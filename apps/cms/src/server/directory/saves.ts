import { and, asc, count, desc, eq, inArray, sql } from "drizzle-orm"

import { cleanContactLinks } from "@/lib/directory/contact-links"
import { now, uuid } from "@/server/auth/security"
import { db, type CustomShellDb } from "@/server/db"
import {
  directoryListings,
  directorySaveCollections,
  directorySaveItems,
} from "@/server/directory/schema"
import { customShellWorkspaces } from "@/server/schema"

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
  siteId: string
  siteName: string
  items: SavedListing[]
}

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
    .values({ id: uuid(), workspaceId, userId, name: "Saved", createdAt: at, updatedAt: at })
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
    .orderBy(asc(directorySaveCollections.createdAt), asc(directorySaveCollections.name))

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
  if (duplicate) throw new Error("You already have a saved list with that name.")

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
    if (!created) throw new Error("You already have a saved list with that name.")
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
      siteId: directorySaveCollections.workspaceId,
      siteName: customShellWorkspaces.name,
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
        siteId: row.siteId,
        siteName: row.siteName,
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
    .innerJoin(directoryListings, eq(directoryListings.id, directorySaveItems.listingId))
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
