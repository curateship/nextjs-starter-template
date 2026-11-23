import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { CustomShellDb } from "@/server/db"
import { createTestDatabase, insertUser } from "@/server/test-support"
import {
  tradeLiveFills,
  tradePublicHandleHolds,
  tradeRecordWallets,
  tradeWallets,
} from "@/server/trade/schema"

const verify = vi.fn()
/** What each wallet's saved key decrypts to. Null is a key the server cannot read. */
let savedKey: string | null = "a key"

vi.mock("@/server/protocols/registry", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  agentOf: () => ({ verify }),
}))

vi.mock("@/server/trade/wallets", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/trade/wallets")>()
  return {
    ...actual,
    listWalletsWithCredentials: async (userId: string) => {
      const { wallets } = await actual.listWalletsWithCredentials(userId)
      return {
        wallets,
        credentials: new Map(wallets.map((one) => [one.id, () => savedKey])),
      }
    },
  }
})

const {
  loadLeaderboard,
  loadMyPublicProfile,
  loadPublicProfileView,
  saveMyPublicProfile,
  setProfileHidden,
  switchMyPublicProfile,
} = await import("@/server/trade/public-profiles")

const DAY = 86_400_000
const NOW = Date.now()
const ADDRESS = "0x1234567890abcdef1234567890abcdef12345678"

let client: PGlite
let database: CustomShellDb

const describeError = (error: unknown) =>
  error instanceof Error ? error.message : String(error)

function input(handle: string) {
  return {
    handle,
    displayName: "Sam",
    picture: null,
    bio: "",
    links: [],
    searchable: false,
  }
}

async function member(): Promise<string> {
  return (await insertUser(database)).id
}

/** A live mainnet wallet with `trades` whole trades, the first 40 days ago. */
async function traded(userId: string, trades: number) {
  await database.insert(tradeWallets).values({
    userId,
    id: `w-${userId.slice(0, 8)}`,
    label: "Real",
    kind: "live",
    protocol: "hyperliquid",
    network: "mainnet",
    startingBalance: 1_000,
    address: ADDRESS,
  })
  const rows = Array.from({ length: trades }, (_, index) => {
    const at = NOW - 40 * DAY + index * 3_600_000
    return [
      {
        userId,
        walletId: `w-${userId.slice(0, 8)}`,
        fillId: `b${index}`,
        orderId: `ob${index}`,
        marketKey: "hyperliquid:mainnet:BTC",
        side: "buy" as const,
        px: 100,
        sz: 1,
        at,
        dir: "Open Long",
      },
      {
        userId,
        walletId: `w-${userId.slice(0, 8)}`,
        fillId: `s${index}`,
        orderId: `os${index}`,
        marketKey: "hyperliquid:mainnet:BTC",
        side: "sell" as const,
        px: 110,
        sz: 1,
        at: at + 60_000,
        closedPnl: 10,
        dir: "Close Long",
      },
    ]
  }).flat()
  if (rows.length) await database.insert(tradeLiveFills).values(rows)
}

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  verify.mockReset()
  verify.mockResolvedValue({ validUntil: null })
  savedKey = "a key"
})

afterEach(async () => {
  await client.close()
})

describe("handles", () => {
  it("refuses a handle somebody else has", async () => {
    await saveMyPublicProfile(await member(), input("sam"))
    await expect(
      saveMyPublicProfile(await member(), input("Sam"))
    ).rejects.toThrow("PROFILE_HANDLE_TAKEN")
  })

  it("holds a given-up handle from everybody else for 90 days", async () => {
    const first = await member()
    await saveMyPublicProfile(first, input("sam"))
    await saveMyPublicProfile(first, input("sammy"))

    const second = await member()
    await expect(saveMyPublicProfile(second, input("sam"))).rejects.toThrow(
      "PROFILE_HANDLE_HELD"
    )

    await database
      .update(tradePublicHandleHolds)
      .set({ releasedAt: new Date(NOW - 91 * DAY) })
      .where(eq(tradePublicHandleHolds.handle, "sam"))
    await expect(
      saveMyPublicProfile(second, input("sam"))
    ).resolves.toBeUndefined()
  })

  it("lets the member who gave a handle up take it back", async () => {
    const first = await member()
    await saveMyPublicProfile(first, input("sam"))
    await saveMyPublicProfile(first, input("sammy"))
    await expect(
      saveMyPublicProfile(first, input("sam"))
    ).resolves.toBeUndefined()
  })

  it("refuses a reserved handle", async () => {
    await expect(
      saveMyPublicProfile(await member(), input("admin"))
    ).rejects.toThrow("PROFILE_INPUT:That handle is kept for Trade.")
  })
})

describe("the public page", () => {
  it("is off until switched on, and off again keeps the record", async () => {
    const userId = await member()
    await traded(userId, 3)
    await saveMyPublicProfile(userId, input("offon"))
    expect(await loadPublicProfileView("offon", NOW)).toBeNull()

    await switchMyPublicProfile(userId, true, describeError)
    const on = await loadPublicProfileView("OFFON", NOW + 61_000)
    expect(on?.figures.closedTrades).toBe(3)

    await switchMyPublicProfile(userId, false, describeError)
    expect(await loadPublicProfileView("offon", NOW + 122_000)).toBeNull()
    await switchMyPublicProfile(userId, true, describeError)
    expect(
      (await loadPublicProfileView("offon", NOW + 183_000))?.figures
        .closedTrades
    ).toBe(3)
  })

  it("marks a wallet whose key the exchange no longer accepts, and leaves it out", async () => {
    const userId = await member()
    await traded(userId, 2)
    await saveMyPublicProfile(userId, input("keyless"))
    verify.mockRejectedValue(
      new Error("KEY_NOT_APPROVED:Hyperliquid does not list it.")
    )

    const checks = await switchMyPublicProfile(userId, true, describeError)
    expect(checks).toEqual([expect.objectContaining({ result: "failed" })])
    const view = await loadPublicProfileView("keyless", NOW)
    expect(view?.wallets[0].check).toBe("failed")
    expect(view?.figures.closedTrades).toBe(0)
    // The exchange's own words are for the member, not for every visitor.
    expect(view?.wallets[0].checkNote).toBe(
      "Trade could not confirm this wallet still belongs to its key."
    )
    const mine = await loadMyPublicProfile(userId)
    expect(mine.wallets[0].checkNote).toContain("Hyperliquid does not list it.")
  })

  it("leaves a wallet counting when the server cannot read its key", async () => {
    const userId = await member()
    await traded(userId, 2)
    await saveMyPublicProfile(userId, input("unreadable"))
    savedKey = null

    const checks = await switchMyPublicProfile(userId, true, describeError)
    expect(checks[0].result).toBe("unchecked")
    expect(verify).not.toHaveBeenCalled()
    expect(
      (await loadPublicProfileView("unreadable", NOW))?.figures.closedTrades
    ).toBe(2)
  })

  it("sends the month grid as day totals, never each fill", async () => {
    const userId = await member()
    await traded(userId, 3)
    await saveMyPublicProfile(userId, input("daily"))
    await switchMyPublicProfile(userId, true, describeError)

    const view = await loadPublicProfileView("daily", NOW)
    expect(view?.days).toHaveLength(1)
    expect(view?.days[0]).toEqual({
      day: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      money: 30,
      unpriced: 0,
      trades: 3,
    })
  })

  it("keeps the last answer when the exchange could not be asked", async () => {
    const userId = await member()
    await traded(userId, 2)
    await saveMyPublicProfile(userId, input("quiet"))
    verify.mockRejectedValue(new Error("KEY_CHECK_UNAVAILABLE"))

    const checks = await switchMyPublicProfile(userId, true, describeError)
    expect(checks[0].result).toBe("unchecked")
    const [kept] = await database.select().from(tradeRecordWallets)
    expect(kept.proof).toBeNull()
  })

  it("disappears when an admin hides it, and the record stays", async () => {
    const userId = await member()
    await traded(userId, 2)
    await saveMyPublicProfile(userId, input("hidden"))
    await switchMyPublicProfile(userId, true, describeError)
    await setProfileHidden(userId, "Screenshots of someone else's account.")

    expect(await loadPublicProfileView("hidden", NOW)).toBeNull()
    await setProfileHidden(userId, null)
    expect(
      (await loadPublicProfileView("hidden", NOW))?.figures.closedTrades
    ).toBe(2)
  })
})

describe("the leaderboard", () => {
  it("leaves out a profile with 19 closed trades and lists one with 20", async () => {
    const nineteen = await member()
    await traded(nineteen, 19)
    await saveMyPublicProfile(nineteen, input("nineteen"))
    await switchMyPublicProfile(nineteen, true, describeError)

    const twenty = await member()
    await traded(twenty, 20)
    await saveMyPublicProfile(twenty, input("twenty"))
    await switchMyPublicProfile(twenty, true, describeError)

    const rows = await loadLeaderboard(NOW)
    expect(rows.map((row) => row.handle)).toEqual(["twenty"])
    expect(rows[0]).toMatchObject({ wonPer100: 100, closedTrades: 20 })
  })
})
