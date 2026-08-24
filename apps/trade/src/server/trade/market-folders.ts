import { randomUUID } from "node:crypto"
import { and, asc, count, eq, max, ne, sql } from "drizzle-orm"

import {
  parseMarketKey,
  type NetworkId,
  type ProtocolId,
} from "@/lib/protocols/contracts"
import {
  ALL_ROW,
  WATCHED_ROW,
  type MarketFolder,
  type MarketPanelRows,
} from "@/lib/trade/market-folders"
import { db, type CustomShellDb } from "@/server/db"
import { saveMarketPanelRows } from "@/server/trade/prefs"
import {
  tradeMarketFolderItems,
  tradeMarketFolders,
} from "@/server/trade/schema"

// Raised from 100 on 23 Aug 2026: Tyler keeps whole-category folders — every
// stock, every liquid coin — and Hyperliquid alone lists more than 100 of
// each. 500 still bounds a runaway script without cutting a real folder off.
const MAX_FOLDER_MARKETS = 500
const MAX_NAMED_FOLDERS = 100

function cleanName(value: string) {
  const name = value.trim().replace(/\s+/g, " ")
  if (!name) throw new Error("Give the folder a name.")
  if (name.length > 80)
    throw new Error("Folder names can be at most 80 characters.")
  return name
}

async function ensureFavFolder(
  userId: string,
  protocol: ProtocolId,
  network: NetworkId,
  database: CustomShellDb
) {
  const [existing] = await database
    .select({ id: tradeMarketFolders.id })
    .from(tradeMarketFolders)
    .where(
      and(
        eq(tradeMarketFolders.userId, userId),
        eq(tradeMarketFolders.protocol, protocol),
        eq(tradeMarketFolders.network, network),
        eq(tradeMarketFolders.isFav, true)
      )
    )
    .limit(1)
  if (existing) return existing.id

  const id = randomUUID()
  const [created] = await database
    .insert(tradeMarketFolders)
    .values({
      id,
      userId,
      protocol,
      network,
      name: "Fav",
      isFav: true,
      position: 0,
    })
    .onConflictDoNothing()
    .returning({ id: tradeMarketFolders.id })
  if (created) return created.id

  const [wonRace] = await database
    .select({ id: tradeMarketFolders.id })
    .from(tradeMarketFolders)
    .where(
      and(
        eq(tradeMarketFolders.userId, userId),
        eq(tradeMarketFolders.protocol, protocol),
        eq(tradeMarketFolders.network, network),
        eq(tradeMarketFolders.isFav, true)
      )
    )
    .limit(1)
  if (!wonRace) throw new Error("Your Fav folder could not be created.")
  return wonRace.id
}

/**
 * All folders in one exchange scope, in saved order with item order kept.
 * Fav is no longer pinned to the front: it drags like any other row.
 */
export async function loadMarketFolders(
  userId: string,
  protocol: ProtocolId,
  network: NetworkId,
  database: CustomShellDb = db
): Promise<MarketFolder[]> {
  await ensureFavFolder(userId, protocol, network, database)
  const rows = await database
    .select({
      id: tradeMarketFolders.id,
      name: tradeMarketFolders.name,
      isFav: tradeMarketFolders.isFav,
      position: tradeMarketFolders.position,
      hidden: tradeMarketFolders.hidden,
      marketKey: tradeMarketFolderItems.marketKey,
    })
    .from(tradeMarketFolders)
    .leftJoin(
      tradeMarketFolderItems,
      eq(tradeMarketFolderItems.folderId, tradeMarketFolders.id)
    )
    .where(
      and(
        eq(tradeMarketFolders.userId, userId),
        eq(tradeMarketFolders.protocol, protocol),
        eq(tradeMarketFolders.network, network)
      )
    )
    .orderBy(
      asc(tradeMarketFolders.position),
      asc(tradeMarketFolders.createdAt),
      asc(tradeMarketFolderItems.createdAt)
    )

  const folders = new Map<string, MarketFolder>()
  for (const row of rows) {
    const folder = folders.get(row.id) ?? {
      id: row.id,
      name: row.name,
      isFav: row.isFav,
      position: row.position,
      hidden: row.hidden,
      marketKeys: [],
    }
    if (row.marketKey) folder.marketKeys.push(row.marketKey)
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
    .from(tradeMarketFolders)
    .where(
      and(
        eq(tradeMarketFolders.id, folderId),
        eq(tradeMarketFolders.userId, userId)
      )
    )
    .limit(1)
  if (!folder) throw new Error("That market folder no longer exists.")
  return folder
}

/** Add or remove one market after checking both the owner and exchange. */
export async function setMarketInFolder(
  userId: string,
  input: { folderId: string; marketKey: string; saved: boolean },
  database: CustomShellDb = db
) {
  const folder = await ownedFolder(userId, input.folderId, database)
  const ref = parseMarketKey(input.marketKey)
  if (
    !ref ||
    ref.protocol !== folder.protocol ||
    ref.network !== folder.network
  ) {
    throw new Error("That coin belongs to another exchange.")
  }

  await database.transaction(async (tx) => {
    const [locked] = await tx
      .select({ id: tradeMarketFolders.id })
      .from(tradeMarketFolders)
      .where(
        and(
          eq(tradeMarketFolders.id, folder.id),
          eq(tradeMarketFolders.userId, userId)
        )
      )
      .for("update")
    if (!locked) throw new Error("That market folder no longer exists.")

    if (input.saved) {
      const [total] = await tx
        .select({ value: count() })
        .from(tradeMarketFolderItems)
        .where(eq(tradeMarketFolderItems.folderId, folder.id))
      const [already] = await tx
        .select({ marketKey: tradeMarketFolderItems.marketKey })
        .from(tradeMarketFolderItems)
        .where(
          and(
            eq(tradeMarketFolderItems.folderId, folder.id),
            eq(tradeMarketFolderItems.marketKey, input.marketKey)
          )
        )
        .limit(1)
      if (!already && Number(total?.value ?? 0) >= MAX_FOLDER_MARKETS) {
        throw new Error(
          `A market folder can hold at most ${MAX_FOLDER_MARKETS} coins.`
        )
      }
      await tx
        .insert(tradeMarketFolderItems)
        .values({ folderId: folder.id, marketKey: input.marketKey })
        .onConflictDoNothing()
    } else {
      await tx
        .delete(tradeMarketFolderItems)
        .where(
          and(
            eq(tradeMarketFolderItems.folderId, folder.id),
            eq(tradeMarketFolderItems.marketKey, input.marketKey)
          )
        )
    }
    await tx
      .update(tradeMarketFolders)
      .set({ updatedAt: new Date() })
      .where(eq(tradeMarketFolders.id, folder.id))
  })
  return loadMarketFolders(userId, folder.protocol, folder.network, database)
}

export async function createMarketFolder(
  userId: string,
  input: {
    protocol: ProtocolId
    network: NetworkId
    name: string
    marketKey?: string
  },
  database: CustomShellDb = db
) {
  const name = cleanName(input.name)
  if (input.marketKey) {
    const ref = parseMarketKey(input.marketKey)
    if (
      !ref ||
      ref.protocol !== input.protocol ||
      ref.network !== input.network
    ) {
      throw new Error("That coin belongs to another exchange.")
    }
  }
  const favId = await ensureFavFolder(
    userId,
    input.protocol,
    input.network,
    database
  )
  const id = randomUUID()
  try {
    await database.transaction(async (tx) => {
      await tx
        .select({ id: tradeMarketFolders.id })
        .from(tradeMarketFolders)
        .where(eq(tradeMarketFolders.id, favId))
        .for("update")
      const [duplicate] = await tx
        .select({ id: tradeMarketFolders.id })
        .from(tradeMarketFolders)
        .where(
          and(
            eq(tradeMarketFolders.userId, userId),
            eq(tradeMarketFolders.protocol, input.protocol),
            eq(tradeMarketFolders.network, input.network),
            sql`lower(${tradeMarketFolders.name}) = ${name.toLowerCase()}`
          )
        )
        .limit(1)
      if (duplicate) {
        throw new Error("You already have a market folder with that name.")
      }
      const [folderTotal] = await tx
        .select({ value: count() })
        .from(tradeMarketFolders)
        .where(
          and(
            eq(tradeMarketFolders.userId, userId),
            eq(tradeMarketFolders.protocol, input.protocol),
            eq(tradeMarketFolders.network, input.network),
            eq(tradeMarketFolders.isFav, false)
          )
        )
      if (Number(folderTotal?.value ?? 0) >= MAX_NAMED_FOLDERS) {
        throw new Error("You can have at most 100 named market folders.")
      }
      const [last] = await tx
        .select({ value: max(tradeMarketFolders.position) })
        .from(tradeMarketFolders)
        .where(
          and(
            eq(tradeMarketFolders.userId, userId),
            eq(tradeMarketFolders.protocol, input.protocol),
            eq(tradeMarketFolders.network, input.network)
          )
        )
      await tx.insert(tradeMarketFolders).values({
        id,
        userId,
        protocol: input.protocol,
        network: input.network,
        name,
        position: Number(last?.value ?? 0) + 1,
      })
      if (input.marketKey) {
        await tx
          .insert(tradeMarketFolderItems)
          .values({ folderId: id, marketKey: input.marketKey })
      }
    })
  } catch (error) {
    if (error instanceof Error && /unique|duplicate/i.test(error.message)) {
      throw new Error("You already have a market folder with that name.")
    }
    throw error
  }
  return loadMarketFolders(userId, input.protocol, input.network, database)
}

/**
 * Rename any folder, Fav included. Fav is found by its own flag rather than by
 * being called Fav, so the star and the picker follow the new name and nothing
 * has to be called Fav for them to work.
 */
export async function renameMarketFolder(
  userId: string,
  folderId: string,
  value: string,
  database: CustomShellDb = db
) {
  const folder = await ownedFolder(userId, folderId, database)
  const name = cleanName(value)
  // Asked before writing, the same way a new folder is. The unique index
  // behind it raises a database error whose text is the failed query, so
  // reading that error was never going to produce a sentence for the toast.
  await database.transaction(async (tx) => {
    const [duplicate] = await tx
      .select({ id: tradeMarketFolders.id })
      .from(tradeMarketFolders)
      .where(
        and(
          eq(tradeMarketFolders.userId, userId),
          eq(tradeMarketFolders.protocol, folder.protocol),
          eq(tradeMarketFolders.network, folder.network),
          ne(tradeMarketFolders.id, folder.id),
          sql`lower(${tradeMarketFolders.name}) = ${name.toLowerCase()}`
        )
      )
      .limit(1)
    if (duplicate) {
      throw new Error("You already have a market folder with that name.")
    }
    await tx
      .update(tradeMarketFolders)
      .set({ name, updatedAt: new Date() })
      .where(
        and(
          eq(tradeMarketFolders.id, folder.id),
          eq(tradeMarketFolders.userId, userId)
        )
      )
  })
  return loadMarketFolders(userId, folder.protocol, folder.network, database)
}

/**
 * The whole markets panel in one write: what order every row sits in, and
 * which rows the eye has switched off.
 *
 * One call rather than one per row, because a drag moves every row below the
 * one being dragged, and because the two rows that are not folders live in the
 * preference row instead of the folder table. Both writes share a transaction,
 * so a half-saved arrangement cannot be read back.
 *
 * The ids sent must be exactly the rows this exchange has, each once. A list
 * that has drifted — a folder deleted in another tab, a row sent twice — is
 * refused rather than written, which leaves the saved arrangement alone.
 */
export async function saveMarketPanelLayout(
  userId: string,
  input: {
    protocol: ProtocolId
    network: NetworkId
    /** Every row id, top of the panel first. */
    rowIds: string[]
    /** The rows the eye has switched off. */
    hiddenRowIds: string[]
  },
  database: CustomShellDb = db
): Promise<{ folders: MarketFolder[]; panelRows: MarketPanelRows }> {
  const favId = await ensureFavFolder(
    userId,
    input.protocol,
    input.network,
    database
  )
  const hidden = new Set(input.hiddenRowIds)
  const panelRows = await database.transaction(async (tx) => {
    await tx
      .select({ id: tradeMarketFolders.id })
      .from(tradeMarketFolders)
      .where(eq(tradeMarketFolders.id, favId))
      .for("update")
    const saved = await tx
      .select({ id: tradeMarketFolders.id })
      .from(tradeMarketFolders)
      .where(
        and(
          eq(tradeMarketFolders.userId, userId),
          eq(tradeMarketFolders.protocol, input.protocol),
          eq(tradeMarketFolders.network, input.network)
        )
      )
    const rows = new Set([WATCHED_ROW, ALL_ROW, ...saved.map((one) => one.id)])
    if (
      input.rowIds.length !== rows.size ||
      new Set(input.rowIds).size !== input.rowIds.length ||
      input.rowIds.some((id) => !rows.has(id)) ||
      [...hidden].some((id) => !rows.has(id))
    ) {
      throw new Error("That folder arrangement could not be saved.")
    }
    for (const [index, id] of input.rowIds.entries()) {
      if (id === WATCHED_ROW || id === ALL_ROW) continue
      await tx
        .update(tradeMarketFolders)
        .set({ position: index, hidden: hidden.has(id), updatedAt: new Date() })
        .where(
          and(
            eq(tradeMarketFolders.id, id),
            eq(tradeMarketFolders.userId, userId),
            eq(tradeMarketFolders.protocol, input.protocol),
            eq(tradeMarketFolders.network, input.network)
          )
        )
    }
    return saveMarketPanelRows(
      userId,
      { protocol: input.protocol, network: input.network },
      {
        watched: {
          position: input.rowIds.indexOf(WATCHED_ROW),
          hidden: hidden.has(WATCHED_ROW),
        },
        all: {
          position: input.rowIds.indexOf(ALL_ROW),
          hidden: hidden.has(ALL_ROW),
        },
      },
      tx
    )
  })
  return {
    folders: await loadMarketFolders(
      userId,
      input.protocol,
      input.network,
      database
    ),
    panelRows,
  }
}

export async function deleteMarketFolder(
  userId: string,
  folderId: string,
  database: CustomShellDb = db
) {
  const folder = await ownedFolder(userId, folderId, database)
  if (folder.isFav) throw new Error("Fav cannot be deleted.")
  await database
    .delete(tradeMarketFolders)
    .where(
      and(
        eq(tradeMarketFolders.id, folder.id),
        eq(tradeMarketFolders.userId, userId)
      )
    )
  return loadMarketFolders(userId, folder.protocol, folder.network, database)
}

/** One folder at run start, scoped to its owner. */
export async function marketFolderForRun(
  userId: string,
  folderId: string,
  database: CustomShellDb = db
) {
  const folder = await ownedFolder(userId, folderId, database)
  const items = await database
    .select({ marketKey: tradeMarketFolderItems.marketKey })
    .from(tradeMarketFolderItems)
    .where(eq(tradeMarketFolderItems.folderId, folder.id))
    .orderBy(asc(tradeMarketFolderItems.createdAt))
  return { ...folder, marketKeys: items.map((item) => item.marketKey) }
}
