import { readFile } from "node:fs/promises"

import { PGlite } from "@electric-sql/pglite"
import { drizzle } from "drizzle-orm/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import type { CustomShellDb } from "@/server/db"
import {
  listWalletFunding,
  syncWalletFunding,
  type FundingEvent,
} from "@/server/funding"
import * as schema from "@/server/schema"
import { now, uuid } from "@/server/util"

let client: PGlite
let database: ReturnType<typeof drizzle<typeof schema>>

beforeEach(async () => {
  client = new PGlite()
  for (const file of [
    "../../drizzle/0000_custom_shell_baseline.sql",
    "../../drizzle/0004_trading.sql",
    "../../drizzle/0021_wallet_onboarding.sql",
    "../../drizzle/0052_wallet_funding.sql",
  ]) {
    await client.exec(await readFile(new URL(file, import.meta.url), "utf8"))
  }
  database = drizzle(client, { schema })
})

afterEach(async () => {
  await client.close()
})

const db = () => database as unknown as CustomShellDb

async function createUser(email: string) {
  const id = uuid()
  const createdAt = now()
  await database.insert(schema.customShellUsers).values({
    id,
    email,
    name: "Trader",
    role: "user",
    passwordHash: "hash",
    createdAt,
    updatedAt: createdAt,
  })
  return id
}

async function createWallet(userId: string, network = "mainnet") {
  const id = uuid()
  const createdAt = now()
  await database.insert(schema.tradingWallets).values({
    id,
    userId,
    label: "Main",
    network,
    accountAddress: "0x1111111111111111111111111111111111111111",
    agentAddress: `0x${uuid().replaceAll("-", "").slice(0, 40)}`,
    encryptedPrivateKey: "enc",
    createdAt,
    updatedAt: createdAt,
  })
  return id
}

/**
 * Times must land inside the sync's 365-day backfill window, so they are
 * offsets from "yesterday" rather than absolute epochs.
 */
const BASE = Date.now() - 86_400_000

/** A funding payment as the exchange reports it (verified live sign rules). */
function event(offsetMs: number, coin: string, usdc: string): FundingEvent {
  return { time: BASE + offsetMs, coin, usdc, szi: "-1.5", fundingRate: "0.0000125" }
}

describe("syncWalletFunding", () => {
  it("stores payments and re-running adds nothing twice", async () => {
    const userId = await createUser("dedupe@example.com")
    const walletId = await createWallet(userId)

    const events = [
      event(0, "BTC", "1.25"),
      event(0, "ETH", "-0.40"),
      event(3_600_000, "BTC", "0.80"),
    ]
    const fetcher = async (
      _network: string,
      _user: string,
      startTime: number
    ) => events.filter((e) => e.time >= startTime)

    await syncWalletFunding(userId, db(), { fetcher, force: true })
    const first = await listWalletFunding([walletId], 0, db())
    expect(first.get(walletId)).toHaveLength(3)

    // The second pass re-reads an overlapping window; the unique
    // (wallet, market, time) index must make every duplicate a no-op.
    await syncWalletFunding(userId, db(), { fetcher, force: true })
    const second = await listWalletFunding([walletId], 0, db())
    expect(second.get(walletId)).toHaveLength(3)
  })

  it("keeps the exchange's sign: positive received, negative paid", async () => {
    const userId = await createUser("signs@example.com")
    const walletId = await createWallet(userId)

    const fetcher = async () => [
      event(0, "SOL", "-104.957353"),
      event(0, "ATOM", "2.974431"),
    ]
    await syncWalletFunding(userId, db(), { fetcher, force: true })

    const entries = (await listWalletFunding([walletId], 0, db())).get(
      walletId
    )
    expect(entries).toBeDefined()
    const byCoin = new Map(entries!.map((e) => [e.coin, e.amount]))
    expect(byCoin.get("SOL")).toBeCloseTo(-104.957353)
    expect(byCoin.get("ATOM")).toBeCloseTo(2.974431)
  })

  it("pages through capped responses until the history is complete", async () => {
    const userId = await createUser("paging@example.com")
    const walletId = await createWallet(userId)

    // The exchange caps a response at 500 entries. Serve one full page and a
    // remainder; a sync that ignores the cap silently loses the second page.
    const all: FundingEvent[] = []
    for (let i = 0; i < 620; i++) {
      all.push(event(i * 3_600_000, "BTC", "0.10"))
    }
    const calls: number[] = []
    const fetcher = async (
      _network: string,
      _user: string,
      startTime: number
    ) => {
      calls.push(startTime)
      return all.filter((e) => e.time >= startTime).slice(0, 500)
    }

    await syncWalletFunding(userId, db(), { fetcher, force: true })

    const entries = (await listWalletFunding([walletId], 0, db())).get(
      walletId
    )
    expect(entries).toHaveLength(620)
    expect(calls.length).toBeGreaterThan(1)
  })

  it("one failing wallet is reported without sinking the others", async () => {
    const userId = await createUser("partial@example.com")
    const okWallet = await createWallet(userId)
    const badWallet = await createWallet(userId, "testnet")

    const fetcher = async (network: string) => {
      if (network === "testnet") throw new Error("exchange unreachable")
      return [event(0, "BTC", "0.55")]
    }
    const status = await syncWalletFunding(userId, db(), {
      fetcher,
      force: true,
    })

    const byWallet = new Map(status.map((s) => [s.walletId, s.ok]))
    expect(byWallet.get(okWallet)).toBe(true)
    expect(byWallet.get(badWallet)).toBe(false)

    const stored = await listWalletFunding([okWallet, badWallet], 0, db())
    expect(stored.get(okWallet)).toHaveLength(1)
    expect(stored.get(badWallet)).toBeUndefined()
  })

  it("only returns payments inside the requested window", async () => {
    const userId = await createUser("window@example.com")
    const walletId = await createWallet(userId)

    const fetcher = async () => [
      event(0, "BTC", "0.10"),
      event(9_000_000, "BTC", "0.20"),
    ]
    await syncWalletFunding(userId, db(), { fetcher, force: true })

    const entries = (
      await listWalletFunding([walletId], BASE + 5_000_000, db())
    ).get(walletId)
    expect(entries).toHaveLength(1)
    expect(entries![0].time).toBe(BASE + 9_000_000)
  })
})
