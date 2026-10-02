import { randomUUID } from "node:crypto"
import { and, asc, count, eq, inArray, max, ne, sql } from "drizzle-orm"

import { MAX_SOCIAL_FOLDERS, type SocialFolder } from "@/lib/trade/social/feed"
import { db, type CustomShellDb } from "@/server/db"
import {
  tradeSocialCreators,
  tradeSocialFolderCreators,
  tradeSocialFolders,
} from "@/server/trade/schema"

/**
 * Folders of creators, the social feed's left panel.
 *
 * The same moves as `market-folders.ts` with a different subject, minus what
 * creators do not have: there is no Fav, no exchange scope, and no preference
 * row, because the Everyone entry is pinned to the top of the panel rather
 * than being a row that can be dragged or hidden.
 *
 * **Every query is filtered by the member's own id** in the same `where` as
 * the row it is looking for, never checked after the fact.
 */

function cleanName(value: string) {
  const name = value.trim().replace(/\s+/g, " ")
  if (!name) throw new Error("Give the folder a name.")
  if (name.length > 80)
    throw new Error("Folder names can be at most 80 characters.")
  return name
}

/** All of one member's folders, in saved order, each with its creators. */
export async function loadSocialFolders(
  userId: string,
  database: CustomShellDb = db
): Promise<SocialFolder[]> {
  const rows = await database
    .select({
      id: tradeSocialFolders.id,
      name: tradeSocialFolders.name,
      position: tradeSocialFolders.position,
      hidden: tradeSocialFolders.hidden,
      creatorId: tradeSocialFolderCreators.creatorId,
    })
    .from(tradeSocialFolders)
    .leftJoin(
      tradeSocialFolderCreators,
      eq(tradeSocialFolderCreators.folderId, tradeSocialFolders.id)
    )
    .where(eq(tradeSocialFolders.userId, userId))
    .orderBy(
      asc(tradeSocialFolders.position),
      asc(tradeSocialFolders.createdAt),
      asc(tradeSocialFolderCreators.createdAt)
    )

  const folders = new Map<string, SocialFolder>()
  for (const row of rows) {
    const folder = folders.get(row.id) ?? {
      id: row.id,
      name: row.name,
      position: row.position,
      hidden: row.hidden,
      creatorIds: [],
    }
    if (row.creatorId) folder.creatorIds.push(row.creatorId)
    folders.set(row.id, folder)
  }
  return [...folders.values()]
}

async function ownedFolder(
  userId: string,
  folderId: string,
  database: CustomShellDb
) {
  const [folder] = await database
    .select()
    .from(tradeSocialFolders)
    .where(
      and(
        eq(tradeSocialFolders.id, folderId),
        eq(tradeSocialFolders.userId, userId)
      )
    )
    .limit(1)
  if (!folder) throw new Error("That folder no longer exists.")
  return folder
}

async function ownedCreator(
  userId: string,
  creatorId: string,
  database: CustomShellDb
) {
  const [creator] = await database
    .select({ id: tradeSocialCreators.id })
    .from(tradeSocialCreators)
    .where(
      and(
        eq(tradeSocialCreators.id, creatorId),
        eq(tradeSocialCreators.userId, userId)
      )
    )
    .limit(1)
  if (!creator) throw new Error("That creator is not one you track.")
  return creator
}

export async function createSocialFolder(
  userId: string,
  input: { name: string; creatorId?: string },
  database: CustomShellDb = db
): Promise<SocialFolder[]> {
  const name = cleanName(input.name)
  if (input.creatorId) await ownedCreator(userId, input.creatorId, database)
  const id = randomUUID()
  try {
    await database.transaction(async (tx) => {
      const [duplicate] = await tx
        .select({ id: tradeSocialFolders.id })
        .from(tradeSocialFolders)
        .where(
          and(
            eq(tradeSocialFolders.userId, userId),
            sql`lower(${tradeSocialFolders.name}) = ${name.toLowerCase()}`
          )
        )
        .limit(1)
      if (duplicate) {
        throw new Error("You already have a folder with that name.")
      }
      const [total] = await tx
        .select({ value: count() })
        .from(tradeSocialFolders)
        .where(eq(tradeSocialFolders.userId, userId))
      if (Number(total?.value ?? 0) >= MAX_SOCIAL_FOLDERS) {
        throw new Error(
          `You can have at most ${MAX_SOCIAL_FOLDERS} folders of creators.`
        )
      }
      const [last] = await tx
        .select({ value: max(tradeSocialFolders.position) })
        .from(tradeSocialFolders)
        .where(eq(tradeSocialFolders.userId, userId))
      await tx.insert(tradeSocialFolders).values({
        id,
        userId,
        name,
        position: Number(last?.value ?? 0) + 1,
      })
      if (input.creatorId) {
        await tx
          .insert(tradeSocialFolderCreators)
          .values({ folderId: id, creatorId: input.creatorId })
      }
    })
  } catch (error) {
    // Two windows racing to the same name: the unique index refuses the
    // loser, whose error text is the failed query rather than a sentence.
    if (error instanceof Error && /unique|duplicate/i.test(error.message)) {
      throw new Error("You already have a folder with that name.")
    }
    throw error
  }
  return loadSocialFolders(userId, database)
}

export async function renameSocialFolder(
  userId: string,
  folderId: string,
  value: string,
  database: CustomShellDb = db
): Promise<SocialFolder[]> {
  const folder = await ownedFolder(userId, folderId, database)
  const name = cleanName(value)
  await database.transaction(async (tx) => {
    const [duplicate] = await tx
      .select({ id: tradeSocialFolders.id })
      .from(tradeSocialFolders)
      .where(
        and(
          eq(tradeSocialFolders.userId, userId),
          ne(tradeSocialFolders.id, folder.id),
          sql`lower(${tradeSocialFolders.name}) = ${name.toLowerCase()}`
        )
      )
      .limit(1)
    if (duplicate) {
      throw new Error("You already have a folder with that name.")
    }
    await tx
      .update(tradeSocialFolders)
      .set({ name, updatedAt: new Date() })
      .where(
        and(
          eq(tradeSocialFolders.id, folder.id),
          eq(tradeSocialFolders.userId, userId)
        )
      )
  })
  return loadSocialFolders(userId, database)
}

/** Deleting a folder removes its rows in the join and keeps the creators. */
export async function deleteSocialFolder(
  userId: string,
  folderId: string,
  database: CustomShellDb = db
): Promise<SocialFolder[]> {
  const folder = await ownedFolder(userId, folderId, database)
  await database
    .delete(tradeSocialFolders)
    .where(
      and(
        eq(tradeSocialFolders.id, folder.id),
        eq(tradeSocialFolders.userId, userId)
      )
    )
  return loadSocialFolders(userId, database)
}

/** Put one creator into one folder, or take them out. */
export async function setCreatorInFolder(
  userId: string,
  input: { folderId: string; creatorId: string; saved: boolean },
  database: CustomShellDb = db
): Promise<void> {
  const folder = await ownedFolder(userId, input.folderId, database)
  await ownedCreator(userId, input.creatorId, database)

  if (input.saved) {
    await database
      .insert(tradeSocialFolderCreators)
      .values({ folderId: folder.id, creatorId: input.creatorId })
      .onConflictDoNothing()
  } else {
    await database
      .delete(tradeSocialFolderCreators)
      .where(
        and(
          eq(tradeSocialFolderCreators.folderId, folder.id),
          eq(tradeSocialFolderCreators.creatorId, input.creatorId)
        )
      )
  }
  // Nothing is read back. The browser applies the tick optimistically and
  // only re-reads the folders when the save fails.
}

/**
 * The whole arrangement in one write: what order the folders sit in and which
 * the eye has switched off. One call rather than one per row, because a drag
 * moves every row below the one being dragged.
 *
 * The ids sent must be exactly this member's folders, each once. A list that
 * has drifted — a folder deleted in another tab, a row sent twice — is
 * refused rather than written, which leaves the saved arrangement alone.
 */
export async function saveSocialFolderOrder(
  userId: string,
  input: { folderIds: string[]; hiddenFolderIds: string[] },
  database: CustomShellDb = db
): Promise<SocialFolder[]> {
  const hidden = new Set(input.hiddenFolderIds)
  await database.transaction(async (tx) => {
    const saved = await tx
      .select({ id: tradeSocialFolders.id })
      .from(tradeSocialFolders)
      .where(eq(tradeSocialFolders.userId, userId))
      .for("update")
    const known = new Set(saved.map((one) => one.id))
    if (
      input.folderIds.length !== known.size ||
      new Set(input.folderIds).size !== input.folderIds.length ||
      input.folderIds.some((id) => !known.has(id)) ||
      [...hidden].some((id) => !known.has(id))
    ) {
      throw new Error("That folder arrangement could not be saved.")
    }
    if (input.folderIds.length === 0) return
    // Every row in ONE statement: the CASE hands each folder its own
    // position and eye state, instead of one round trip per folder.
    const positionWhens = sql.join(
      input.folderIds.map((id, index) => sql`when ${id} then ${index}::int`),
      sql` `
    )
    const hiddenWhens = sql.join(
      input.folderIds.map(
        (id) => sql`when ${id} then ${hidden.has(id)}::boolean`
      ),
      sql` `
    )
    await tx
      .update(tradeSocialFolders)
      .set({
        position: sql`case ${tradeSocialFolders.id} ${positionWhens} end`,
        hidden: sql`case ${tradeSocialFolders.id} ${hiddenWhens} end`,
        updatedAt: new Date(),
      })
      .where(
        and(
          inArray(tradeSocialFolders.id, input.folderIds),
          eq(tradeSocialFolders.userId, userId)
        )
      )
  })
  return loadSocialFolders(userId, database)
}
