import { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  WALLET_CHECK_KEEP_MS,
  WALLET_CHECK_PER_MINUTE,
  WALLET_CHECK_PER_VISITOR,
} from "@/lib/free-tools/wallet-checker"
import type { WalletOrderFill } from "@/lib/protocols/contracts"
import type { CustomShellDb } from "@/server/db"
import { createTestDatabase, insertUser } from "@/server/test-support"
import { tradePublicProfiles, tradeRecordWallets } from "@/server/trade/schema"

/**
 * The wallet checker's server half: what it asks the exchange, what it keeps,
 * what it refuses, and when a checked wallet is linked to its Trade profile.
 * The figures themselves are proved in `@/lib/free-tools/wallet-checker`.
 */

const asked: string[] = []
let answer = {
  fills: [] as WalletOrderFill[],
  capped: false,
  openPositions: 0,
}
let refuse: Error | null = null
/** Set to hold every read open until it is resolved, so two can overlap. */
let hold: { promise: Promise<void>; release: () => void } | null = null

vi.mock("@/server/protocols/hyperliquid/public-wallet", () => ({
  readPublicWalletActivity: async (_network: string, address: string) => {
    asked.push(address)
    if (hold) await hold.promise
    if (refuse) throw refuse
    return answer
  },
}))

const { checkWallet, forgetWalletChecks } = await import(
  "@/server/free-tools/wallet-checker"
)

const ADDRESS = "0x3f0000000000000000000000000000000000ea91"
const OTHER = "0x4a0000000000000000000000000000000000bb02"
const NOW = Date.UTC(2026, 8, 24, 16)
const IP = "198.51.100.7"

let client: PGlite
let database: CustomShellDb

beforeEach(async () => {
  ;({ client, db: database } = await createTestDatabase())
  asked.length = 0
  answer = { fills: [], capped: false, openPositions: 0 }
  refuse = null
  hold = null
  forgetWalletChecks()
  vi.spyOn(console, "error").mockImplementation(() => {})
})

afterEach(async () => {
  vi.restoreAllMocks()
  await client.close()
})

function check(typed: string, ip = IP, now = NOW) {
  return checkWallet(typed, ip, now, database)
}

describe("refusing an address that is not one", () => {
  it("refuses before the exchange is asked or the limit is counted", async () => {
    await expect(check("not-a-wallet")).rejects.toThrow(
      "WALLET_ADDRESS_INVALID"
    )
    expect(asked).toEqual([])
    // The minute is untouched, so a typo never costs a real check.
    for (let attempt = 0; attempt < WALLET_CHECK_PER_VISITOR; attempt += 1) {
      await expect(check(ADDRESS)).resolves.toBeDefined()
      forgetWalletChecks()
    }
  })
})

describe("keeping an answer", () => {
  it("asks the exchange once and hands the kept copy to everybody after", async () => {
    const first = await check(ADDRESS)
    const again = await check(ADDRESS, "203.0.113.9", NOW + 60_000)
    expect(asked).toEqual([ADDRESS])
    expect(again).toBe(first)
    expect(again.readAt).toBe(NOW)
  })

  it("lowercases the address, so the same wallet typed loudly is one copy", async () => {
    await check(`0X${ADDRESS.slice(2).toUpperCase()}`)
    await check(ADDRESS)
    expect(asked).toEqual([ADDRESS])
  })

  it("asks again once the copy is ten minutes old", async () => {
    await check(ADDRESS)
    await check(ADDRESS, IP, NOW + WALLET_CHECK_KEEP_MS)
    expect(asked).toEqual([ADDRESS, ADDRESS])
  })

  it("never spends a visitor's minute on a kept copy", async () => {
    await check(ADDRESS)
    for (let repeat = 0; repeat < WALLET_CHECK_PER_MINUTE * 2; repeat += 1) {
      await expect(check(ADDRESS)).resolves.toBeDefined()
    }
    expect(asked).toEqual([ADDRESS])
  })
})

describe("staying inside the exchange's budget", () => {
  /** A fresh address every time, so the kept copy never hides a limit. */
  function nth(index: number): string {
    return `0x${String(index).padStart(40, "0")}`
  }

  it("lets one visitor check five wallets a minute and then stops them", async () => {
    for (let index = 0; index < WALLET_CHECK_PER_VISITOR; index += 1) {
      await expect(check(nth(index))).resolves.toBeDefined()
    }
    await expect(check(nth(99))).rejects.toThrow("RATE_LIMITED")
    // Another visitor is unaffected: the limit is counted per address.
    await expect(check(nth(50), "203.0.113.9")).resolves.toBeDefined()
  })

  it("stops everybody at twelve a minute, and says so differently", async () => {
    let index = 0
    for (let visitor = 0; visitor < 4; visitor += 1) {
      for (let one = 0; one < 3; one += 1) {
        await expect(check(nth(index), `10.0.0.${visitor}`)).resolves.toBeDefined()
        index += 1
      }
    }
    expect(asked).toHaveLength(WALLET_CHECK_PER_MINUTE)
    await expect(check(nth(index), "10.0.0.9")).rejects.toThrow(
      "WALLET_CHECK_BUSY"
    )
  })
})

describe("two visitors asking about the same wallet at once", () => {
  it("asks the exchange once and gives both the same answer", async () => {
    let release = () => {}
    hold = {
      promise: new Promise<void>((resolve) => {
        release = resolve
      }),
      release,
    }
    const both = Promise.all([
      check(ADDRESS, "10.0.0.1"),
      check(ADDRESS, "10.0.0.2"),
    ])
    // Both are now waiting on one read. Letting it finish answers both.
    await new Promise((resolve) => setTimeout(resolve, 0))
    hold.release()
    hold = null
    const [first, second] = await both
    expect(asked).toEqual([ADDRESS])
    expect(second).toBe(first)
  })

  it("lets the next visitor start a fresh read once a failed one is over", async () => {
    refuse = new Error("429")
    await expect(check(ADDRESS)).rejects.toThrow("WALLET_CHECK_UNAVAILABLE")
    refuse = null
    await expect(check(ADDRESS)).resolves.toBeDefined()
    expect(asked).toEqual([ADDRESS, ADDRESS])
  })
})

describe("an exchange that will not answer", () => {
  it("gives one sentence back and keeps nothing", async () => {
    refuse = new Error("429 Too Many Requests")
    await expect(check(ADDRESS)).rejects.toThrow("WALLET_CHECK_UNAVAILABLE")
    refuse = null
    await expect(check(ADDRESS)).resolves.toBeDefined()
    expect(asked).toEqual([ADDRESS, ADDRESS])
  })
})

describe("a database that will not answer", () => {
  it("is not reported as a busy page", async () => {
    const broken = {
      ...database,
      insert: () => {
        throw new Error("connection terminated")
      },
    } as unknown as CustomShellDb
    await expect(
      checkWallet(ADDRESS, IP, NOW, broken)
    ).rejects.toThrow("connection terminated")
    expect(asked).toEqual([])
  })
})

describe("the Trade profile a wallet belongs to", () => {
  async function profileWith(
    over: {
      address?: string | null
      enabled?: boolean
      hiddenAt?: Date | null
      removedAt?: Date | null
      proof?: "proved" | "failed" | null
    } = {}
  ) {
    const user = await insertUser(database)
    await database.insert(tradePublicProfiles).values({
      userId: user.id,
      handle: "sam",
      displayName: "Sam",
      enabled: over.enabled ?? true,
      hiddenAt: over.hiddenAt ?? null,
    })
    await database.insert(tradeRecordWallets).values({
      userId: user.id,
      walletId: "w-1",
      protocol: "hyperliquid",
      // Stored as the member saved it, which may be the checksummed form.
      address: over.address === undefined ? ADDRESS.toUpperCase() : over.address,
      label: "Real",
      removedAt: over.removedAt ?? null,
      proof: over.proof ?? "proved",
    })
  }

  it("links the profile whatever case the address was saved in", async () => {
    await profileWith()
    expect((await check(ADDRESS)).profileHandle).toBe("sam")
  })

  it("says nothing when no profile holds the address", async () => {
    await profileWith({ address: OTHER })
    expect((await check(ADDRESS)).profileHandle).toBeNull()
  })

  it("leaves out a profile that is switched off, hidden, or whose wallet failed its check or was deleted", async () => {
    for (const over of [
      { enabled: false },
      { hiddenAt: new Date() },
      { proof: "failed" as const },
      { removedAt: new Date() },
    ]) {
      await database.delete(tradeRecordWallets)
      await database.delete(tradePublicProfiles)
      forgetWalletChecks()
      await profileWith(over)
      expect((await check(ADDRESS)).profileHandle, JSON.stringify(over)).toBeNull()
    }
  })
})
