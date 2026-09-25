import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import {
  deleteBacktestGroups,
  setBacktestFlag,
} from "@/server/trade/backtest/actions"
import type { BacktestSpecSnapshot } from "@/lib/trade/backtest/result"
import { defaultDcaParams } from "@/lib/trade/dca"
import type { CustomShellDb } from "@/server/db"
import { createTestDatabase, insertUser } from "@/server/test-support"
import { tradeBacktestGroups, tradeBacktests } from "@/server/trade/schema"

const SPEC: BacktestSpecSnapshot = {
  startingUsd: 10_000,
  takerFeePct: 0.045,
  makerFeePct: 0.015,
  slippagePct: 0.05,
  days: 30,
  interval: "4h",
  marketKeys: ["hyperliquid:mainnet:AAA"],
  strategy: { kind: "dca", params: defaultDcaParams() },
  from: 1_700_000_000_000,
  to: 1_700_086_400_000,
}

let client: PGlite
let database: CustomShellDb
let userId: string
let foreignUserId: string

async function addGroup(
  ownerId: string,
  id: string,
  flags: { pinned?: boolean; archived?: boolean } = {}
) {
  await database.insert(tradeBacktestGroups).values({
    userId: ownerId,
    id,
    automationId: `flow-${id}`,
    automationName: id,
    spec: SPEC,
    ...flags,
  })
}

beforeEach(async () => {
  ;({ client, db: database } = await createTestDatabase())
  userId = (await insertUser(database)).id
  foreignUserId = (await insertUser(database)).id
})

afterEach(async () => {
  await client.close()
})

describe("saved backtest bulk actions", () => {
  it("pins or archives every owned row once and reports only real changes", async () => {
    await addGroup(userId, "owned-a")
    await addGroup(userId, "owned-b", { archived: true })
    await addGroup(foreignUserId, "foreign")

    await expect(
      setBacktestFlag(
        userId,
        ["owned-b", "foreign", "missing", "owned-a", "owned-a"],
        "archived",
        true,
        database
      )
    ).resolves.toEqual({ changed: ["owned-a"] })

    await expect(
      setBacktestFlag(
        userId,
        ["owned-b", "owned-a"],
        "pinned",
        true,
        database
      )
    ).resolves.toEqual({ changed: ["owned-b", "owned-a"] })

    const owned = await database
      .select({
        id: tradeBacktestGroups.id,
        pinned: tradeBacktestGroups.pinned,
      })
      .from(tradeBacktestGroups)
      .where(eq(tradeBacktestGroups.userId, userId))
    expect(owned.every((row) => row.pinned)).toBe(true)

    const [foreign] = await database
      .select()
      .from(tradeBacktestGroups)
      .where(eq(tradeBacktestGroups.id, "foreign"))
    expect(foreign.archived).toBe(false)
    expect(foreign.pinned).toBe(false)
  })

  it("deletes all owned groups together and lets the database remove their coins", async () => {
    await addGroup(userId, "owned-a")
    await addGroup(userId, "owned-b")
    await addGroup(foreignUserId, "foreign")
    await database.insert(tradeBacktests).values([
      {
        userId,
        id: "coin-a",
        groupId: "owned-a",
        marketKey: "hyperliquid:mainnet:AAA",
        symbol: "AAA",
      },
      {
        userId,
        id: "coin-b",
        groupId: "owned-b",
        marketKey: "hyperliquid:mainnet:BBB",
        symbol: "BBB",
      },
    ])

    await expect(
      deleteBacktestGroups(
        userId,
        ["foreign", "missing", "owned-b", "owned-a"],
        database
      )
    ).resolves.toEqual({ deleted: ["owned-b", "owned-a"] })

    const groups = await database.select().from(tradeBacktestGroups)
    expect(groups.map((group) => group.id)).toEqual(["foreign"])
    expect(await database.select().from(tradeBacktests)).toEqual([])
  })
})
