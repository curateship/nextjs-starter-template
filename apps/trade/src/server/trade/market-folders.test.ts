import { readdir, readFile } from "node:fs/promises"
import { PGlite } from "@electric-sql/pglite"
import { drizzle } from "drizzle-orm/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import type { CustomShellDb } from "@/server/db"
import { createTestDatabase, insertUser } from "@/server/test-support"
import {
  createMarketFolder,
  deleteMarketFolder,
  loadMarketFolders,
  reorderMarketFolders,
  renameMarketFolder,
  setMarketInFolder,
} from "@/server/trade/market-folders"
import {
  tradeMarketFavorites,
  tradeMarketFolderItems,
  tradeMarketFolders,
} from "@/server/trade/schema"

let client: PGlite
let database: CustomShellDb
let userId: string

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

  it("protects Fav and allows a named folder to be renamed and deleted", async () => {
    const folders = await createMarketFolder(
      userId,
      { protocol: "hyperliquid", network: "mainnet", name: "Daily" },
      database
    )
    const fav = folders.find((folder) => folder.isFav)!
    const daily = folders.find((folder) => folder.name === "Daily")!

    await expect(
      renameMarketFolder(userId, fav.id, "Other", database)
    ).rejects.toThrow("cannot be renamed")
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

  it("keeps a folder at the 100-coin limit", async () => {
    const [fav] = await loadMarketFolders(
      userId,
      "hyperliquid",
      "mainnet",
      database
    )
    await database.insert(tradeMarketFolderItems).values(
      Array.from({ length: 100 }, (_, index) => ({
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
    ).rejects.toThrow("at most 100 coins")
  })

  it("keeps named folders inside the reorder limit", async () => {
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

  it("reorders every named folder while Fav stays first", async () => {
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
    const daily = folders.find((folder) => folder.name === "Daily")!
    const watching = folders.find((folder) => folder.name === "Watching")!

    const reordered = await reorderMarketFolders(
      userId,
      {
        protocol: "hyperliquid",
        network: "mainnet",
        folderIds: [watching.id, daily.id],
      },
      database
    )
    expect(reordered.map((folder) => folder.name)).toEqual([
      "Fav",
      "Watching",
      "Daily",
    ])
    await expect(
      reorderMarketFolders(
        userId,
        {
          protocol: "hyperliquid",
          network: "mainnet",
          folderIds: [daily.id],
        },
        database
      )
    ).rejects.toThrow("could not be reordered")
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
  })
})
