import { PGlite } from "@electric-sql/pglite"
import { and, eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { BacktestSpec } from "@/lib/trade/backtest/flow"
import { defaultDcaParams } from "@/lib/trade/dca"
import type { CustomShellDb } from "@/server/db"
import { createTestDatabase, insertUser } from "@/server/test-support"
import {
  backtestWindow,
  claimBacktestGroup,
  createBacktest,
  failBacktestGroup,
  heartbeatBacktestGroup,
  listBacktests,
  readBacktestGroup,
  releaseBacktestGroup,
  replaceUnnamedRuns,
  saveBacktestResult,
} from "@/server/trade/backtest/store"
import { tradeBacktestGroups, tradeBacktests } from "@/server/trade/schema"

/**
 * Where runs are kept, and how one is picked up to be worked on.
 *
 * Everything here is about a run surviving something going wrong: two passes
 * racing for the same run, a restart leaving one claimed forever, three
 * failures in a row, and Stop. A backtest that quietly sat at "running" after a
 * deploy would be indistinguishable from one that was simply slow.
 */

const FOUR_HOURS = 14_400_000
const NOW = 1_700_000_000_000

// Only `getProtocol` is replaced. The rest of the module comes through as
// itself, because `ordersOf` and its siblings live here too — a mock that
// listed just this one left them undefined, and every live test died on a
// call to nothing.
vi.mock("@/server/protocols/registry", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getProtocol: () => ({ markets: { intervalMs: () => FOUR_HOURS } }),
}))

function specOf(marketKeys: string[]): BacktestSpec {
  return {
    wallet: {
      startingUsd: 10_000,
      takerFeePct: 0.045,
      makerFeePct: 0.015,
      slippagePct: 0.05,
      walletId: null,
      walletLabel: null,
      walletKind: null,
      walletProtocol: null,
      walletNetwork: null,
    },
    markets: {
      protocol: "hyperliquid",
      folderId: null,
      folderName: null,
      folderCount: null,
      marketKeys,
      days: 30,
      from: null,
      to: null,
    },
    interval: "4h" as const,
    strategy: {
      kind: "dca" as const,
      dca: { params: defaultDcaParams(), interval: "4h" as const },
    },
  }
}

let client: PGlite
let db: CustomShellDb
let userId: string

beforeEach(async () => {
  ;({ client, db } = await createTestDatabase())
  userId = (await insertUser(db)).id
})

afterEach(async () => {
  await client.close()
})

async function makeRun(
  keys = ["hyperliquid:mainnet:AAA", "hyperliquid:mainnet:BBB"],
  automationId = "flow-1",
  // When it was started. The row's `createdAt` is this, so a test about which
  // run is newest has to be able to say.
  now = NOW
) {
  return createBacktest(
    userId,
    {
      automationId,
      automationName: "My strategy",
      spec: specOf(keys),
      now,
    },
    db
  )
}

describe("writing a run down", () => {
  it("makes one row per coin, in alphabetical order", async () => {
    const { groupId, coins } = await makeRun([
      "hyperliquid:mainnet:ZZZ",
      "hyperliquid:mainnet:AAA",
    ])

    expect(coins).toBe(2)
    const found = await readBacktestGroup(userId, groupId, db)
    expect(found?.coins.map((coin) => coin.symbol)).toEqual(["AAA", "ZZZ"])
    expect(found?.coins.every((coin) => coin.status === "waiting")).toBe(true)
  })

  it("freezes the window it will walk, not just the number of days", async () => {
    // A run started a minute later must cover the same ground, or two results
    // could differ for a reason nobody could see.
    const { groupId } = await makeRun()
    const found = await readBacktestGroup(userId, groupId, db)
    const window = backtestWindow(NOW, { days: 30 }, FOUR_HOURS)

    expect(found?.group.spec.from).toBe(window.from)
    expect(found?.group.spec.to).toBe(window.to)
  })

  it("walks exactly the days somebody named, last day included", () => {
    // October 1st to October 10th is ten days, because that is what somebody
    // typing those two dates means. Ending at the 10th's own midnight would
    // drop the 10th — which on a real run is the day they picked the dates to
    // look at.
    const window = backtestWindow(
      NOW,
      { days: 30, from: "2023-10-01", to: "2023-10-10" },
      FOUR_HOURS
    )

    expect(new Date(window.from).toISOString()).toBe("2023-10-01T00:00:00.000Z")
    expect(new Date(window.to).toISOString()).toBe("2023-10-11T00:00:00.000Z")
    expect((window.to - window.from) / 86_400_000).toBe(10)
  })

  it("ignores the day count once two dates are named", () => {
    // The 30 sitting on the step is left alone underneath the dates, so this
    // is the one that decides whether it is still being read. Six months, not
    // thirty days.
    const dated = backtestWindow(
      NOW,
      { days: 30, from: "2023-01-01", to: "2023-06-30" },
      FOUR_HOURS
    )

    expect(new Date(dated.from).toISOString()).toBe("2023-01-01T00:00:00.000Z")
    expect(new Date(dated.to).toISOString()).toBe("2023-07-01T00:00:00.000Z")
  })

  it("cuts a window that runs past today back to the last finished bar", () => {
    // Naming today, or a day that has not arrived, means "up to now" — not a
    // stretch of empty future the run would walk with no prices in it.
    const window = backtestWindow(
      NOW,
      { days: 30, from: "2020-01-01", to: "2999-01-01" },
      FOUR_HOURS
    )

    expect(window.to).toBe(Math.floor(NOW / FOUR_HOURS) * FOUR_HOURS)
  })

  it("writes down how long the run really covers, not the number on the step", async () => {
    // The day count is left alone underneath the dates, so every screen that
    // captions a run would otherwise call a six-month window "30 days".
    const spec = specOf(["hyperliquid:mainnet:AAA"])
    const { groupId } = await createBacktest(
      userId,
      {
        automationId: "flow-dates",
        automationName: "Dates",
        spec: {
          ...spec,
          markets: { ...spec.markets, from: "2023-01-01", to: "2023-06-30" },
        },
        now: NOW,
      },
      db
    )

    const found = await readBacktestGroup(userId, groupId, db)
    expect(found?.group.spec.days).toBe(181)
    expect(new Date(found?.group.spec.from ?? 0).toISOString()).toBe(
      "2023-01-01T00:00:00.000Z"
    )
  })

  it("refuses a window that has not happened yet", async () => {
    const spec = specOf(["hyperliquid:mainnet:AAA"])
    await expect(
      createBacktest(
        userId,
        {
          automationId: "flow-future",
          automationName: "Future",
          spec: {
            ...spec,
            markets: { ...spec.markets, from: "2999-01-01", to: "2999-02-01" },
          },
          now: NOW,
        },
        db
      )
    ).rejects.toThrow("BACKTEST_WINDOW")
  })

  it("refuses a run that mixes exchanges", async () => {
    await expect(
      makeRun(["hyperliquid:mainnet:AAA", "binance:mainnet:BTC"])
    ).rejects.toThrow("BACKTEST_MARKET")
  })
})

describe("claiming a run", () => {
  it("hands it to one pass and not the other", async () => {
    await makeRun()

    const first = await claimBacktestGroup(NOW, db)
    const second = await claimBacktestGroup(NOW, db)

    expect(first).not.toBeNull()
    expect(second).toBeNull()
  })

  it("takes back one a restart left claimed forever", async () => {
    await makeRun()
    await claimBacktestGroup(NOW, db)

    // Nothing released it, because the process holding it went away. Six
    // minutes on, it is fair game again.
    const later = await claimBacktestGroup(NOW + 6 * 60_000, db)
    expect(later).not.toBeNull()
  })

  it("does not take a long run back while its heartbeat is current", async () => {
    const { groupId } = await makeRun()
    await claimBacktestGroup(NOW, db)
    await heartbeatBacktestGroup(userId, groupId, 1, NOW + 4 * 60_000, db)

    expect(await claimBacktestGroup(NOW + 6 * 60_000, db)).toBeNull()
    expect(await claimBacktestGroup(NOW + 10 * 60_000, db)).not.toBeNull()
    await expect(
      heartbeatBacktestGroup(userId, groupId, 1, NOW + 11 * 60_000, db)
    ).rejects.toThrow("BACKTEST_CLAIM_LOST")
  })

  it("lets go without finishing, so the next pass carries on", async () => {
    const { groupId } = await makeRun()
    const claimed = await claimBacktestGroup(NOW, db)
    await releaseBacktestGroup(userId, groupId, claimed!.attempts, db)

    expect(await claimBacktestGroup(NOW, db)).not.toBeNull()
  })

  it("gives up after three passes that never came back", async () => {
    // A pass that dies takes the process with it, so it never releases its
    // claim — the only mark it leaves is the count the claim put there. Three
    // of those in a row and the run is broken rather than unlucky.
    await makeRun()

    const ORPHAN = 6 * 60_000
    for (let attempt = 0; attempt < 3; attempt += 1) {
      expect(
        await claimBacktestGroup(NOW + attempt * ORPHAN, db)
      ).not.toBeNull()
    }

    expect(await claimBacktestGroup(NOW + 3 * ORPHAN, db)).toBeNull()
  })

  it("forgets the count as soon as a pass finishes its slice", async () => {
    // The bug this is here for: a run lets go of its claim every few coins on
    // purpose, so counting those as tries abandoned any run with more coins
    // than the limit allows — silently, half done.
    await makeRun()

    for (let pass = 0; pass < 10; pass += 1) {
      const claimed = await claimBacktestGroup(NOW, db)
      expect(
        claimed,
        `pass ${pass + 1} should still be claimable`
      ).not.toBeNull()
      await releaseBacktestGroup(
        userId,
        claimed!.groupId,
        claimed!.attempts,
        db
      )
    }
  })

  it("never picks up one that already finished", async () => {
    const { groupId } = await makeRun()
    await db
      .update(tradeBacktestGroups)
      .set({ finishedAt: new Date(NOW) })
      .where(
        and(
          eq(tradeBacktestGroups.userId, userId),
          eq(tradeBacktestGroups.id, groupId)
        )
      )

    expect(await claimBacktestGroup(NOW, db)).toBeNull()
  })
})

describe("a run that keeps failing", () => {
  it("says so on every coin instead of sitting at running", async () => {
    const { groupId } = await makeRun()
    await failBacktestGroup(userId, groupId, "the exchange said no", NOW, db)

    const found = await readBacktestGroup(userId, groupId, db)
    expect(found?.coins.every((coin) => coin.status === "error")).toBe(true)
    expect(found?.coins[0].error).toBe("the exchange said no")
    expect(found?.group.finishedAt).not.toBeNull()
  })
})

describe("saving what a run found", () => {
  const summary = {
    startingUsd: 10_000,
    endingUsd: 11_000,
    madeOrLost: 1_000,
    madeOrLostPct: 10,
    fundingPaid: 12.5,
    worstDipUsd: 200,
    worstDipAt: NOW,
    worstDipPct: 1.8,
    worstDipPeakUsd: 11_200,
    coinsTested: 1,
    coinsSkipped: 1,
    coinsThatMadeMoney: 1,
    peakInPlayUsd: 2_000,
    peakInPlayPct: 18.2,
    peakInPlayAt: NOW,
    peakInPlayHeldMs: 3_600_000,
    typicalInPlayUsd: 1_000,
    typicalInPlayPct: 9.1,
    potAtWorstDipUsd: 9_800,
    coinsOpenAtEnd: 0,
    openAtEndUsd: 0,
    buyAndHold: 500,
    trades: 4,
    tradesClosed: 3,
    tradesWon: 2,
    tradesLiquidated: 0,
    liquidatedUsd: 0,
    warnings: [],
  }

  it("keeps a skipped coin as a skipped row, never as an absence", async () => {
    // A coin that quietly vanished is the difference between "two coins made
    // this" and "the one that had history made this".
    const { groupId } = await makeRun()
    const claimed = await claimBacktestGroup(NOW, db)

    await saveBacktestResult(
      userId,
      groupId,
      {
        attempt: claimed!.attempts,
        summary,
        result: { equity: [], inPlay: [], coins: [], skipped: [] },
        coins: [
          {
            marketKey: "hyperliquid:mainnet:AAA",
            status: "done",
            skipReason: null,
            summary: null,
            trades: [],
            fills: [],
          },
          {
            marketKey: "hyperliquid:mainnet:BBB",
            status: "skipped",
            skipReason: "Listed last week.",
            summary: null,
            trades: null,
            fills: null,
          },
        ],
        now: NOW,
      },
      db
    )

    const found = await readBacktestGroup(userId, groupId, db)
    expect(found?.coins).toHaveLength(2)
    const skipped = found?.coins.find((coin) => coin.symbol === "BBB")
    expect(skipped?.status).toBe("skipped")
    expect(skipped?.skipReason).toBe("Listed last week.")
  })

  it("lets go of the claim so nothing picks it up again", async () => {
    const { groupId } = await makeRun()
    const claimed = await claimBacktestGroup(NOW, db)
    await saveBacktestResult(
      userId,
      groupId,
      {
        attempt: claimed!.attempts,
        summary,
        result: { equity: [], inPlay: [], coins: [], skipped: [] },
        coins: [],
        now: NOW,
      },
      db
    )

    expect(await claimBacktestGroup(NOW, db)).toBeNull()
  })

  it("refuses a result from a worker whose claim was replaced", async () => {
    const { groupId } = await makeRun()
    const first = await claimBacktestGroup(NOW, db)
    const second = await claimBacktestGroup(NOW + 6 * 60_000, db)
    expect(second?.attempts).toBe(2)

    await expect(
      saveBacktestResult(
        userId,
        groupId,
        {
          attempt: first!.attempts,
          summary,
          result: { equity: [], inPlay: [], coins: [], skipped: [] },
          coins: [],
          now: NOW + 7 * 60_000,
        },
        db
      )
    ).rejects.toThrow("BACKTEST_CLAIM_LOST")

    const found = await readBacktestGroup(userId, groupId, db)
    expect(found?.group.finishedAt).toBeNull()
  })
})

describe("replacing an unnamed run", () => {
  async function finish(groupId: string) {
    await db
      .update(tradeBacktestGroups)
      .set({ finishedAt: new Date(NOW) })
      .where(
        and(
          eq(tradeBacktestGroups.userId, userId),
          eq(tradeBacktestGroups.id, groupId)
        )
      )
  }

  it("clears the flow's last unnamed run when the next one finishes", async () => {
    // Tuning a strategy makes a run a minute, and a list of forty near-identical
    // ones is a list nobody reads.
    const older = await makeRun()
    await finish(older.groupId)
    const newer = await makeRun()
    await finish(newer.groupId)

    await replaceUnnamedRuns(userId, "flow-1", newer.groupId, db)

    const left = await listBacktests(userId, {}, db)
    expect(left.map((run) => run.id)).toEqual([newer.groupId])
  })

  it("never touches a named one", async () => {
    const kept = await makeRun()
    await finish(kept.groupId)
    await db
      .update(tradeBacktestGroups)
      .set({ name: "The good one" })
      .where(
        and(
          eq(tradeBacktestGroups.userId, userId),
          eq(tradeBacktestGroups.id, kept.groupId)
        )
      )

    const newer = await makeRun()
    await finish(newer.groupId)
    await replaceUnnamedRuns(userId, "flow-1", newer.groupId, db)

    const left = await listBacktests(userId, {}, db)
    expect(left).toHaveLength(2)
  })

  it("never touches a pinned one", async () => {
    const kept = await makeRun()
    await finish(kept.groupId)
    await db
      .update(tradeBacktestGroups)
      .set({ pinned: true })
      .where(
        and(
          eq(tradeBacktestGroups.userId, userId),
          eq(tradeBacktestGroups.id, kept.groupId)
        )
      )

    const newer = await makeRun()
    await finish(newer.groupId)
    await replaceUnnamedRuns(userId, "flow-1", newer.groupId, db)

    expect(await listBacktests(userId, {}, db)).toHaveLength(2)
  })

  it("never reaches across to another flow's runs", async () => {
    const other = await makeRun(["hyperliquid:mainnet:AAA"], "flow-2")
    await finish(other.groupId)
    const mine = await makeRun(["hyperliquid:mainnet:AAA"], "flow-1")
    await finish(mine.groupId)

    await replaceUnnamedRuns(userId, "flow-1", mine.groupId, db)

    expect(await listBacktests(userId, {}, db)).toHaveLength(2)
  })

  it("never touches one that has not finished", async () => {
    const running = await makeRun()
    const newer = await makeRun()
    await finish(newer.groupId)

    await replaceUnnamedRuns(userId, "flow-1", newer.groupId, db)

    const left = await listBacktests(userId, {}, db)
    expect(left.map((run) => run.id).sort()).toEqual(
      [running.groupId, newer.groupId].sort()
    )
  })
})

describe("the list", () => {
  it("floats pinned runs to the top and hides archived ones", async () => {
    const pinned = await makeRun()
    const plain = await makeRun()
    const archived = await makeRun()
    await db
      .update(tradeBacktestGroups)
      .set({ pinned: true })
      .where(eq(tradeBacktestGroups.id, pinned.groupId))
    await db
      .update(tradeBacktestGroups)
      .set({ archived: true })
      .where(eq(tradeBacktestGroups.id, archived.groupId))

    const shown = await listBacktests(userId, {}, db)
    expect(shown[0].id).toBe(pinned.groupId)
    expect(shown.map((run) => run.id)).not.toContain(archived.groupId)

    const withArchived = await listBacktests(
      userId,
      { includeArchived: true },
      db
    )
    expect(withArchived).toHaveLength(3)
    expect(withArchived.map((run) => run.id)).toContain(plain.groupId)
  })

  it("says how many coins are done without loading the heavy result", async () => {
    const { groupId } = await makeRun()
    await db
      .update(tradeBacktests)
      .set({ status: "done", progress: 1 })
      .where(
        and(
          eq(tradeBacktests.userId, userId),
          eq(tradeBacktests.marketKey, "hyperliquid:mainnet:AAA")
        )
      )

    const [row] = await listBacktests(userId, { automationId: "flow-1" }, db)
    expect(row.id).toBe(groupId)
    expect(row.coinsDone).toBe(1)
    expect(row.coinsTotal).toBe(2)
  })

  it("shows the active download instead of a coin already waiting", async () => {
    const { groupId } = await makeRun()
    await db
      .update(tradeBacktests)
      .set({
        status: "running",
        progress: 0.3,
        progressNote: "Waiting for the strategy",
      })
      .where(eq(tradeBacktests.marketKey, "hyperliquid:mainnet:AAA"))
    await db
      .update(tradeBacktests)
      .set({
        status: "running",
        progress: 0.1,
        progressNote: "Loading market history",
      })
      .where(eq(tradeBacktests.marketKey, "hyperliquid:mainnet:BBB"))

    const [row] = await listBacktests(userId, { automationId: "flow-1" }, db)
    expect(row.id).toBe(groupId)
    expect(row.progressNote).toBe("Loading market history")
  })

  it("keeps a pinned run from becoming the flow's answer forever", async () => {
    // The bug: pinning a run sorted it to the top of the flow's list, and the
    // canvas takes the first row as "this flow's result" — so every run started
    // afterwards was invisible there. Pinning keeps a run findable on the
    // Backtests screen; it must not decide what the canvas is looking at.
    const kept = await makeRun(["hyperliquid:mainnet:AAA"], "flow-1")
    await db
      .update(tradeBacktestGroups)
      .set({ pinned: true })
      .where(eq(tradeBacktestGroups.id, kept.groupId))

    const newest = await makeRun(
      ["hyperliquid:mainnet:BBB"],
      "flow-1",
      NOW + 60_000
    )

    const runs = await listBacktests(userId, { automationId: "flow-1" }, db)
    expect(runs.map((run) => run.id)).toEqual([newest.groupId, kept.groupId])
  })

  it("shows only the flow that was asked about", async () => {
    await makeRun(["hyperliquid:mainnet:AAA"], "flow-1")
    await makeRun(["hyperliquid:mainnet:AAA"], "flow-2")

    const mine = await listBacktests(userId, { automationId: "flow-2" }, db)
    expect(mine).toHaveLength(1)
    expect(mine[0].automationId).toBe("flow-2")
  })
})
