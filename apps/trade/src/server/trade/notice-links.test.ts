import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import type { TradeWallet } from "@/lib/trade/wallets"
import type { CustomShellDb } from "@/server/db"
import { customShellNotifications, customShellUsers } from "@/server/schema"
import {
  createTestDatabase,
  insertUser,
  insertWorkspace,
} from "@/server/test-support"
import { recordLiveFills } from "@/server/trade/live-fills"
import {
  tradeNoticeLinksFor,
  tradeSoundEventsAfter,
} from "@/server/trade/notice-links"
import { writeTradeNotice } from "@/server/trade/notices"
import { tradeWallets } from "@/server/trade/schema"

let client: PGlite
let database: CustomShellDb

/** One account with a workspace of its own, which every notice needs. */
async function makePerson(): Promise<string> {
  const user = await insertUser(database)
  const workspace = await insertWorkspace(database, { userId: user.id })
  await database
    .update(customShellUsers)
    .set({ currentWorkspaceId: workspace.id })
    .where(eq(customShellUsers.id, user.id))
  return user.id
}

/** The ids of one person's notices, newest first is not needed here. */
async function noticeIdsOf(userId: string): Promise<string[]> {
  const rows = await database
    .select({ id: customShellNotifications.id })
    .from(customShellNotifications)
    .where(eq(customShellNotifications.recipientUserId, userId))
  return rows.map((row) => row.id)
}

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
})

afterEach(async () => client.close())

describe("where a trade notice leads", () => {
  it("gives back the page a notice was written with", async () => {
    const userId = await makePerson()
    await writeTradeNotice({
      userId,
      title: "Bought $500 of ETH at $90 (Main)",
      body: "The order filled on the exchange.",
      level: "info",
      href: "/admin/hyper-liquid?market=hyperliquid%3Amainnet%3AETH",
      database,
    })

    const [noticeId] = await noticeIdsOf(userId)
    expect(await tradeNoticeLinksFor(userId, [noticeId])).toEqual({
      [noticeId]: "/admin/hyper-liquid?market=hyperliquid%3Amainnet%3AETH",
    })
  })

  it("says nothing about a notice written without a page", async () => {
    const userId = await makePerson()
    await writeTradeNotice({
      userId,
      title: "Something happened",
      body: "With nowhere to go and look at it.",
      level: "info",
      database,
    })

    const [noticeId] = await noticeIdsOf(userId)
    expect(await tradeNoticeLinksFor(userId, [noticeId])).toEqual({})
  })

  // The id of somebody else's notice is a guess anyone can make, and the
  // address it leads to names a wallet's exchange and coin. Asking for one has
  // to come back empty rather than come back true.
  it("refuses somebody else's notice even when the id is right", async () => {
    const mine = await makePerson()
    const theirs = await makePerson()
    await writeTradeNotice({
      userId: theirs,
      title: "Stop hit on ETH: sold at $80 (Their wallet)",
      body: "The stop order fired and closed the position.",
      level: "warning",
      href: "/admin/hyper-liquid?market=hyperliquid%3Amainnet%3AETH",
      database,
    })

    const [theirNoticeId] = await noticeIdsOf(theirs)
    expect(await tradeNoticeLinksFor(mine, [theirNoticeId])).toEqual({})
  })

  it("asks nothing of the database when there is nothing to ask about", async () => {
    const userId = await makePerson()
    expect(await tradeNoticeLinksFor(userId, [])).toEqual({})
  })

  /**
   * The one that would break quietly. Everything above tests the plumbing
   * with an address handed in by the test; this walks the path a real fill
   * takes, so dropping the address where the notice is actually written fails
   * here rather than turning every fill notice back into a dead click.
   */
  it("puts the coin's chart behind a fill notice, through the real fill path", async () => {
    const user = await insertUser(database)
    const workspace = await insertWorkspace(database, { userId: user.id })
    await database
      .update(customShellUsers)
      .set({ currentWorkspaceId: workspace.id })
      .where(eq(customShellUsers.id, user.id))

    const wallet: TradeWallet = {
      id: crypto.randomUUID(),
      label: "Aster",
      kind: "live",
      status: "active",
      protocol: "aster",
      network: "testnet",
      startingBalance: 0,
      address: "0x1111111111111111111111111111111111111111",
      hasKey: true,
      keyValidUntil: null,
    }
    await database.insert(tradeWallets).values({
      userId: user.id,
      id: wallet.id,
      label: wallet.label,
      kind: wallet.kind,
      status: wallet.status,
      protocol: wallet.protocol,
      network: wallet.network,
      startingBalance: 0,
      address: wallet.address,
      agentKeyEncrypted: "encrypted-test-value",
    })

    // Just now, because a fill older than fifteen minutes goes into the
    // Journal silently and never becomes a notice at all.
    await recordLiveFills(user.id, wallet, [
      {
        fillId: "88",
        orderId: "42",
        marketId: "BTCUSDT",
        side: "sell",
        px: 101,
        sz: 0.25,
        at: Date.now(),
        closedPnl: 0,
        fee: 0.01,
        dir: "Close long",
        liquidation: false,
      },
    ])

    const ids = await noticeIdsOf(user.id)
    expect(ids).toHaveLength(1)
    // The practice network, not the real one wearing the same coin's name.
    expect(await tradeNoticeLinksFor(user.id, ids)).toEqual({
      [ids[0]]: "/admin/aster?market=aster%3Atestnet%3ABTCUSDT",
    })
  })

  it("answers only for the notices that have a page, out of a mixed handful", async () => {
    const userId = await makePerson()
    await writeTradeNotice({
      userId,
      title: "Flow Ladder stopped",
      body: "The wallet was switched off.",
      level: "warning",
      href: "/flow-runs/run-7",
      database,
    })
    await writeTradeNotice({
      userId,
      title: "Something with no page",
      body: "Words only.",
      level: "info",
      database,
    })

    const ids = await noticeIdsOf(userId)
    expect(ids).toHaveLength(2)
    const found = await tradeNoticeLinksFor(userId, ids)
    expect(Object.values(found)).toEqual(["/flow-runs/run-7"])
  })
})

describe("the sounds behind trade notices", () => {
  it("returns new fill and stop sounds in order without exposing another account", async () => {
    const mine = await makePerson()
    const theirs = await makePerson()
    await writeTradeNotice({
      userId: mine,
      title: "Filled",
      body: "One fill.",
      level: "info",
      soundKind: "fill",
      createdAt: new Date(1_001),
      database,
    })
    await writeTradeNotice({
      userId: theirs,
      title: "Their stop",
      body: "Not ours.",
      level: "warning",
      soundKind: "stop",
      createdAt: new Date(1_002),
      database,
    })
    await writeTradeNotice({
      userId: mine,
      title: "Stop hit",
      body: "One stop.",
      level: "warning",
      soundKind: "stop",
      createdAt: new Date(1_003),
      database,
    })

    const answer = await tradeSoundEventsAfter(mine, {
      afterAt: 1_000,
      afterId: "",
    })
    expect(answer.events.map((event) => event.kind)).toEqual(["fill", "stop"])
    expect(answer.cursor).toEqual({
      afterAt: 1_003,
      afterId: answer.events[1].id,
    })
    await expect(tradeSoundEventsAfter(mine, answer.cursor)).resolves.toEqual({
      events: [],
      cursor: answer.cursor,
    })
  })
})
