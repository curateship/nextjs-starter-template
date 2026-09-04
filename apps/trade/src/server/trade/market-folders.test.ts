import { readdir, readFile } from "node:fs/promises"
import { PGlite } from "@electric-sql/pglite"
import { drizzle } from "drizzle-orm/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import type { NetworkId, ProtocolId } from "@/lib/protocols/contracts"
import { readMarketPanelRows } from "@/lib/trade/market-folders"
import type { CustomShellDb } from "@/server/db"
import { createTestDatabase, insertUser } from "@/server/test-support"
import {
  createMarketFolder,
  deleteMarketFolder,
  loadMarketFolders,
  renameMarketFolder,
  saveMarketPanelLayout,
  setMarketHidden,
  setMarketInFolder,
} from "@/server/trade/market-folders"
import {
  tradeMarketFavorites,
  tradeMarketFolderItems,
  tradeMarketFolders,
  tradePrefs,
} from "@/server/trade/schema"

let client: PGlite
let database: CustomShellDb
let userId: string

/** The stored arrangement for one exchange, read the way a dashboard reads it. */
async function savedPanelRows(protocol: ProtocolId, network: NetworkId) {
  const [row] = await database
    .select({ value: tradePrefs.marketPanelRows })
    .from(tradePrefs)
    .where(eq(tradePrefs.userId, userId))
    .limit(1)
  return readMarketPanelRows(row?.value?.[`${protocol}:${network}`])
}

beforeEach(async () => {
  ;({ client, db: database } = await createTestDatabase())
  userId = (await insertUser(database)).id
})

afterEach(async () => {
  await client.close()
})

describe("market folders", () => {
  it("creates an empty Fav separately for each exchange", async () => {
    const hyperliquid = await loadMarketFolders(
      userId,
      "hyperliquid",
      "mainnet",
      database
    )
    const phemex = await loadMarketFolders(
      userId,
      "phemex",
      "mainnet",
      database
    )

    expect(hyperliquid).toMatchObject([
      { name: "Fav", isFav: true, marketKeys: [] },
    ])
    expect(phemex).toMatchObject([{ name: "Fav", isFav: true, marketKeys: [] }])
    expect(phemex[0].id).not.toBe(hyperliquid[0].id)
  })

  it("adds a coin to a named folder without changing Fav", async () => {
    const created = await createMarketFolder(
      userId,
      {
        protocol: "hyperliquid",
        network: "mainnet",
        name: "Daily",
        marketKey: "hyperliquid:mainnet:BTC",
      },
      database
    )

    expect(created.find((folder) => folder.name === "Fav")?.marketKeys).toEqual(
      []
    )
    expect(
      created.find((folder) => folder.name === "Daily")?.marketKeys
    ).toEqual(["hyperliquid:mainnet:BTC"])
  })

  it("refuses another account and another exchange", async () => {
    const [fav] = await loadMarketFolders(
      userId,
      "hyperliquid",
      "mainnet",
      database
    )
    const otherUser = (await insertUser(database)).id

    await expect(
      setMarketInFolder(
        otherUser,
        {
          folderId: fav.id,
          marketKey: "hyperliquid:mainnet:BTC",
          saved: true,
        },
        database
      )
    ).rejects.toThrow("no longer exists")
    await expect(
      setMarketInFolder(
        userId,
        {
          folderId: fav.id,
          marketKey: "phemex:mainnet:BTCUSDT",
          saved: true,
        },
        database
      )
    ).rejects.toThrow("another exchange")
  })

  it("renames Fav, refuses to delete it, and renames and deletes a named folder", async () => {
    const folders = await createMarketFolder(
      userId,
      { protocol: "hyperliquid", network: "mainnet", name: "Daily" },
      database
    )
    const fav = folders.find((folder) => folder.isFav)!
    const daily = folders.find((folder) => folder.name === "Daily")!

    const favRenamed = await renameMarketFolder(
      userId,
      fav.id,
      "Core",
      database
    )
    expect(favRenamed.find((folder) => folder.isFav)?.name).toBe("Core")
    await expect(
      renameMarketFolder(userId, fav.id, "Daily", database)
    ).rejects.toThrow("already have a market folder with that name")
    await expect(deleteMarketFolder(userId, fav.id, database)).rejects.toThrow(
      "cannot be deleted"
    )
    const renamed = await renameMarketFolder(
      userId,
      daily.id,
      "Watching",
      database
    )
    expect(renamed.some((folder) => folder.name === "Watching")).toBe(true)
    const remaining = await deleteMarketFolder(userId, daily.id, database)
    expect(remaining).toHaveLength(1)
    expect(remaining[0].isFav).toBe(true)
  })

  it("keeps a folder at the 500-coin limit", async () => {
    const [fav] = await loadMarketFolders(
      userId,
      "hyperliquid",
      "mainnet",
      database
    )
    await database.insert(tradeMarketFolderItems).values(
      Array.from({ length: 500 }, (_, index) => ({
        folderId: fav.id,
        marketKey: `hyperliquid:mainnet:COIN${index}`,
      }))
    )

    await expect(
      setMarketInFolder(
        userId,
        {
          folderId: fav.id,
          marketKey: "hyperliquid:mainnet:ONE_MORE",
          saved: true,
        },
        database
      )
    ).rejects.toThrow("at most 500 coins")
  })

  it("keeps named folders inside the hundred-folder limit", async () => {
    await loadMarketFolders(userId, "hyperliquid", "mainnet", database)
    await database.insert(tradeMarketFolders).values(
      Array.from({ length: 100 }, (_, index) => ({
        id: `folder-${index}`,
        userId,
        protocol: "hyperliquid" as const,
        network: "mainnet" as const,
        name: `Folder ${index}`,
        position: index + 1,
      }))
    )

    await expect(
      createMarketFolder(
        userId,
        { protocol: "hyperliquid", network: "mainnet", name: "One more" },
        database
      )
    ).rejects.toThrow("at most 100 named market folders")
  })

  it("saves one order and one set of hidden rows for the whole panel", async () => {
    await createMarketFolder(
      userId,
      { protocol: "hyperliquid", network: "mainnet", name: "Daily" },
      database
    )
    const folders = await createMarketFolder(
      userId,
      { protocol: "hyperliquid", network: "mainnet", name: "Watching" },
      database
    )
    const fav = folders.find((folder) => folder.isFav)!
    const daily = folders.find((folder) => folder.name === "Daily")!
    const watching = folders.find((folder) => folder.name === "Watching")!
    const scope = { protocol: "hyperliquid", network: "mainnet" } as const

    const saved = await saveMarketPanelLayout(
      userId,
      {
        ...scope,
        rowIds: ["all", watching.id, "watched", daily.id, fav.id],
        hiddenRowIds: ["watched", daily.id],
      },
      database
    )

    expect(saved.folders.map((folder) => folder.name)).toEqual([
      "Watching",
      "Daily",
      "Fav",
    ])
    expect(saved.folders.map((folder) => folder.hidden)).toEqual([
      false,
      true,
      false,
    ])
    expect(saved.panelRows).toEqual({
      all: { position: 0, hidden: false },
      watched: { position: 2, hidden: true },
      hiddenMarketKeys: [],
    })
    expect(await savedPanelRows("hyperliquid", "mainnet")).toEqual(
      saved.panelRows
    )
    // Another exchange keeps its own arrangement rather than this one.
    expect(await savedPanelRows("phemex", "mainnet")).toEqual({
      watched: { position: -1, hidden: false },
      all: { position: Number.MAX_SAFE_INTEGER, hidden: false },
      hiddenMarketKeys: [],
    })
  })

  it("hides a coin by hand, keeps it through a drag, and shows it again", async () => {
    const scope = { protocol: "hyperliquid", network: "mainnet" } as const
    const hidden = await setMarketHidden(
      userId,
      { ...scope, marketKey: "hyperliquid:mainnet:DOGE", hidden: true },
      database
    )
    expect(hidden.hiddenMarketKeys).toEqual(["hyperliquid:mainnet:DOGE"])
    // The row layout was never saved, so it reads as the original order.
    expect(hidden.watched.position).toBe(-1)

    await setMarketHidden(
      userId,
      { ...scope, marketKey: "hyperliquid:mainnet:PEPE", hidden: true },
      database
    )
    // Hiding the same coin twice does not list it twice.
    await setMarketHidden(
      userId,
      { ...scope, marketKey: "hyperliquid:mainnet:PEPE", hidden: true },
      database
    )

    // A drag of the rows leaves the hidden coins alone, and the other way.
    const folders = await loadMarketFolders(userId, "hyperliquid", "mainnet", database)
    const dragged = await saveMarketPanelLayout(
      userId,
      { ...scope, rowIds: ["all", "watched", folders[0]!.id], hiddenRowIds: [] },
      database
    )
    expect(dragged.panelRows).toEqual({
      all: { position: 0, hidden: false },
      watched: { position: 1, hidden: false },
      hiddenMarketKeys: ["hyperliquid:mainnet:DOGE", "hyperliquid:mainnet:PEPE"],
    })

    const shown = await setMarketHidden(
      userId,
      { ...scope, marketKey: "hyperliquid:mainnet:DOGE", hidden: false },
      database
    )
    expect(shown).toEqual({
      all: { position: 0, hidden: false },
      watched: { position: 1, hidden: false },
      hiddenMarketKeys: ["hyperliquid:mainnet:PEPE"],
    })
    // Another exchange's list is its own.
    expect((await savedPanelRows("phemex", "mainnet")).hiddenMarketKeys).toEqual([])

    await expect(
      setMarketHidden(
        userId,
        { ...scope, marketKey: "phemex:mainnet:DOGE", hidden: true },
        database
      )
    ).rejects.toThrow("another exchange")
  })

  it("stops the hidden list at 200 coins", async () => {
    const scope = { protocol: "hyperliquid", network: "mainnet" } as const
    for (let index = 0; index < 200; index += 1) {
      await setMarketHidden(
        userId,
        { ...scope, marketKey: `hyperliquid:mainnet:C${index}`, hidden: true },
        database
      )
    }
    await expect(
      setMarketHidden(
        userId,
        { ...scope, marketKey: "hyperliquid:mainnet:ONEMORE", hidden: true },
        database
      )
    ).rejects.toThrow("at most 200")
    // One already on the list is fine to send again.
    const same = await setMarketHidden(
      userId,
      { ...scope, marketKey: "hyperliquid:mainnet:C7", hidden: true },
      database
    )
    expect(same.hiddenMarketKeys).toHaveLength(200)
  })

  it("refuses a list of rows that is not the panel's own", async () => {
    const folders = await createMarketFolder(
      userId,
      { protocol: "hyperliquid", network: "mainnet", name: "Daily" },
      database
    )
    const fav = folders.find((folder) => folder.isFav)!
    const daily = folders.find((folder) => folder.name === "Daily")!
    const scope = { protocol: "hyperliquid", network: "mainnet" } as const

    // A folder missing, one sent twice, and a row that is not on this panel.
    for (const rowIds of [
      ["watched", "all", fav.id],
      ["watched", "all", fav.id, daily.id, daily.id],
      [
        "watched",
        "all",
        fav.id,
        daily.id,
        "00000000-0000-4000-8000-000000009999",
      ],
    ]) {
      await expect(
        saveMarketPanelLayout(
          userId,
          { ...scope, rowIds, hiddenRowIds: [] },
          database
        )
      ).rejects.toThrow("could not be saved")
    }
    await expect(
      saveMarketPanelLayout(
        userId,
        {
          ...scope,
          rowIds: ["watched", "all", fav.id, daily.id],
          hiddenRowIds: ["nothing-like-a-row"],
        },
        database
      )
    ).rejects.toThrow("could not be saved")
    // Nothing was written by any of the refusals.
    expect(await savedPanelRows("hyperliquid", "mainnet")).toEqual({
      watched: { position: -1, hidden: false },
      all: { position: Number.MAX_SAFE_INTEGER, hidden: false },
      hiddenMarketKeys: [],
    })
  })
})

describe("the old-star migration", () => {
  it("copies each exchange's keys into its own Fav folder", async () => {
    const legacyClient = new PGlite()
    try {
      const migrationFolder = new URL("../../../drizzle/", import.meta.url)
      const migrations = (await readdir(migrationFolder))
        .filter((file) => file.endsWith(".sql") && file < "0141_")
        .sort()
      for (const migration of migrations) {
        await legacyClient.exec(
          await readFile(new URL(migration, migrationFolder), "utf8")
        )
      }
      const legacyDb = drizzle(legacyClient) as unknown as CustomShellDb
      const legacyUser = await insertUser(legacyDb)
      await legacyDb.insert(tradeMarketFavorites).values({
        userId: legacyUser.id,
        marketKeys: [
          "hyperliquid:mainnet:BTC",
          "hyperliquid:mainnet:ETH",
          "phemex:mainnet:BTCUSDT",
        ],
      })

      await legacyClient.exec(
        await readFile(
          new URL("0141_trade_market_folders.sql", migrationFolder),
          "utf8"
        )
      )
      const copied = await legacyClient.query<{
        protocol: string
        market_key: string
      }>(
        `SELECT folders.protocol, items.market_key
         FROM trade_market_folders folders
         JOIN trade_market_folder_items items ON items.folder_id = folders.id
         WHERE folders.user_id = $1 AND folders.is_fav = true
         ORDER BY folders.protocol, items.market_key`,
        [legacyUser.id]
      )

      expect(copied.rows).toEqual([
        { protocol: "hyperliquid", market_key: "hyperliquid:mainnet:BTC" },
        { protocol: "hyperliquid", market_key: "hyperliquid:mainnet:ETH" },
        { protocol: "phemex", market_key: "phemex:mainnet:BTCUSDT" },
      ])
    } finally {
      await legacyClient.close()
    }
  }, 10_000)
})
