import { PGlite } from "@electric-sql/pglite"
import { and, eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { setDbForTests, type CustomShellDb } from "@/server/db"
import { createTestDatabase, insertUser } from "@/server/test-support"
import { tradeLiveFills, tradeWallets } from "@/server/trade/schema"
import { walletProfitWindowStart } from "@/lib/trade/wallets"
import {
  createWallet,
  deleteWallet,
  findWallets,
  findTradingWallet,
  listWallets,
  loadWalletSummaries,
  updateWallet,
} from "@/server/trade/wallets"

// The exchange is a mock: these tests are about the store, and a real
// network call would make them flaky and slow. The mock answers like the
// adapter does — figures, or a rejection for an address it cannot reach —
// and the key check answers approved unless a test says otherwise.
const fetchAccount = vi.fn()
const verifyAgent = vi.fn()
/**
 * What shape the mock exchange takes. `account` off is a venue that cannot
 * read holdings yet (Solana before its holdings task); `make` on is one whose
 * wallet the app can make itself.
 */
const shape = {
  account: true,
  make: false,
  addressPattern: "^0x[0-9a-fA-F]{40}$",
}
const MADE_ADDRESS = "0xfeedfeedfeedfeedfeedfeedfeedfeedfeedfeed"
const MADE_SECRET = "cd".repeat(32)
// Only `getProtocol` is replaced. The rest of the module comes through as
// itself, because `ordersOf` and its siblings live here too — a mock that
// listed just this one left them undefined, and every live test died on a
// call to nothing.
vi.mock("@/server/protocols/registry", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getProtocol: () => ({
    label: "Mock",
    networks: ["mainnet", "testnet"],
    defaultNetwork: "mainnet",
    account: shape.account ? { fetch: fetchAccount } : undefined,
    agent: { verify: verifyAgent },
    credentials: {
      form: {
        addressLabel: "Account address",
        addressHint: "0x…",
        addressPattern: shape.addressPattern,
        secretLabel: "Trading key",
        needsPassphrase: false,
        secretIsAgentKey: true,
        canMakeWallet: shape.make,
        keyHelp: "",
      },
      // The store's own tests speak the wallet-shaped dialect: the blob IS
      // the pasted key, exactly as the Hyperliquid entry packs it.
      pack: (input: { agentKey?: string; secret?: string }) => {
        const agentKey = (input.agentKey ?? input.secret)?.trim() ?? ""
        if (!agentKey) throw new Error("KEY_REQUIRED")
        return agentKey
      },
      make: shape.make
        ? () => ({ address: MADE_ADDRESS, secret: MADE_SECRET })
        : undefined,
    },
  }),
}))

const ADDRESS = "0x1234567890abcdef1234567890abcdef12345678"
const KEY = "ab".repeat(32)
const CIPHERTEXT_SHAPE = /^[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+$/

let client: PGlite
let database: CustomShellDb

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  process.env.CUSTOM_SHELL_SECRET_ENCRYPTION_KEY = "a test-only secret"
  fetchAccount.mockReset()
  fetchAccount.mockResolvedValue({
    equity: 24_000,
    free: 20_000,
    inTrades: 4_000,
    openProfit: 150,
  })
  verifyAgent.mockReset()
  verifyAgent.mockResolvedValue({ validUntil: null })
  shape.account = true
  shape.make = false
  shape.addressPattern = "^0x[0-9a-fA-F]{40}$"
})

afterEach(async () => {
  await client.close()
})

async function person() {
  return (await insertUser(database)).id
}

function paperInput(label = "Practice") {
  return {
    label,
    kind: "paper" as const,
    protocol: "hyperliquid" as const,
    network: "mainnet" as const,
    startingBalance: 10_000,
  }
}

function liveInput(label = "Live") {
  return {
    label,
    kind: "live" as const,
    protocol: "hyperliquid" as const,
    network: "mainnet" as const,
    address: ADDRESS,
    agentKey: KEY,
  }
}

describe("the engine's wallet batch", () => {
  it("uses one wallet query for twenty keys and none for an empty pass", async () => {
    let selects = 0
    const queryDb = {
      select: () => {
        selects += 1
        return {
          from: () => ({ where: async () => [] }),
        }
      },
    } as unknown as CustomShellDb
    setDbForTests(queryDb)
    try {
      await findWallets([])
      expect(selects).toBe(0)

      await findWallets(
        Array.from({ length: 20 }, (_, index) => ({
          userId: `u${index}`,
          walletId: `w${index}`,
        }))
      )
      expect(selects).toBe(1)
    } finally {
      setDbForTests(database)
    }
  })
})

describe("adding wallets", () => {
  it("saves a practice wallet with its starting cash and no key", async () => {
    const userId = await person()
    const wallet = await createWallet(userId, paperInput())

    expect(wallet.kind).toBe("paper")
    expect(wallet.status).toBe("active")
    expect(wallet.startingBalance).toBe(10_000)
    expect(wallet.hasKey).toBe(false)
    expect(wallet.address).toBeNull()
    expect(await listWallets(userId)).toEqual([wallet])
  })

  it("records a live wallet's value at add time as its baseline", async () => {
    const userId = await person()
    const wallet = await createWallet(userId, liveInput())
    expect(wallet.startingBalance).toBe(24_000)
    expect(wallet.hasKey).toBe(true)
  })

  it("stores the trading key only as ciphertext, and never answers with it", async () => {
    const userId = await person()
    const wallet = await createWallet(userId, liveInput())

    const rows = await database
      .select()
      .from(tradeWallets)
      .where(eq(tradeWallets.userId, userId))
    expect(rows[0].agentKeyEncrypted).toMatch(CIPHERTEXT_SHAPE)
    expect(rows[0].agentKeyEncrypted).not.toContain(KEY)

    // The answer says a key exists and nothing more.
    expect(JSON.stringify(wallet)).not.toContain(KEY)
    expect(JSON.stringify(await listWallets(userId))).not.toContain(KEY)
  })

  it("refuses a key the exchange does not approve of, saving nothing", async () => {
    const userId = await person()
    verifyAgent.mockRejectedValue(new Error("KEY_IS_ACCOUNT"))

    await expect(createWallet(userId, liveInput())).rejects.toThrow(
      "KEY_IS_ACCOUNT"
    )
    expect(await listWallets(userId)).toEqual([])
  })

  it("records the key's expiry when the exchange reports one", async () => {
    const userId = await person()
    const expiry = Date.now() + 90 * 86_400_000
    verifyAgent.mockResolvedValue({ validUntil: expiry })

    const wallet = await createWallet(userId, liveInput())
    expect(wallet.keyValidUntil).toBe(expiry)
  })

  it("records the account's position mode when the exchange reports one", async () => {
    const userId = await person()
    verifyAgent.mockResolvedValue({
      validUntil: null,
      positionMode: "one-way",
    })

    await createWallet(userId, liveInput())
    const [row] = await database
      .select({ positionMode: tradeWallets.positionMode })
      .from(tradeWallets)
      .where(eq(tradeWallets.userId, userId))

    expect(row.positionMode).toBe("one-way")
  })

  it("refuses an address the exchange cannot answer for, saving nothing", async () => {
    const userId = await person()
    fetchAccount.mockRejectedValue(new Error("no such account"))

    await expect(createWallet(userId, liveInput())).rejects.toThrow(
      "WALLET_UNREACHABLE"
    )
    expect(await listWallets(userId)).toEqual([])
  })

  it("refuses to store a key when secret storage is not set up", async () => {
    const userId = await person()
    delete process.env.CUSTOM_SHELL_SECRET_ENCRYPTION_KEY

    await expect(createWallet(userId, liveInput())).rejects.toThrow(
      "ENCRYPTION_NOT_CONFIGURED"
    )
    expect(await listWallets(userId)).toEqual([])
  })

  it("makes a wallet on the exchange's behalf and shows only the address", async () => {
    const userId = await person()
    shape.make = true
    const wallet = await createWallet(userId, {
      label: "Made",
      kind: "live",
      protocol: "hyperliquid",
      network: "mainnet",
      makeWallet: true,
    })

    expect(wallet.address).toBe(MADE_ADDRESS)
    expect(wallet.hasKey).toBe(true)
    // The made secret is proved and encrypted like a pasted one, and the
    // answer never carries it.
    expect(verifyAgent).toHaveBeenCalledWith("mainnet", MADE_ADDRESS, MADE_SECRET)
    const rows = await database
      .select()
      .from(tradeWallets)
      .where(eq(tradeWallets.userId, userId))
    expect(rows[0].agentKeyEncrypted).toMatch(CIPHERTEXT_SHAPE)
    expect(rows[0].agentKeyEncrypted).not.toContain(MADE_SECRET)
    expect(JSON.stringify(wallet)).not.toContain(MADE_SECRET)
  })

  it("refuses to make a wallet where the exchange cannot, saving nothing", async () => {
    const userId = await person()
    await expect(
      createWallet(userId, {
        label: "Made",
        kind: "live",
        protocol: "hyperliquid",
        network: "mainnet",
        makeWallet: true,
      })
    ).rejects.toThrow("WALLET_MAKE_UNSUPPORTED")
    expect(await listWallets(userId)).toEqual([])
  })

  it("saves a wallet on an exchange that cannot read holdings yet, at a zero baseline", async () => {
    const userId = await person()
    shape.account = false
    const wallet = await createWallet(userId, liveInput())

    // Nothing to read means nothing to ask: the exchange is never called,
    // and the baseline is the honest zero rather than a made-up figure.
    expect(fetchAccount).not.toHaveBeenCalled()
    expect(wallet.startingBalance).toBe(0)
    expect(wallet.hasKey).toBe(true)
    expect(wallet.address).toBe(ADDRESS)
  })

  it("keeps a 44-character base58 address whole", async () => {
    // The column was sized for a 42-character Ethereum address, and the
    // first Solana wallet was refused by Postgres with "value too long".
    const userId = await person()
    shape.account = false
    shape.addressPattern = "^[1-9A-HJ-NP-Za-km-z]{32,44}$"
    const address = "6rF3e9bmmBSdE2dLMyW7N5bT6Q3455WwJ1QzkZBMErBe"
    expect(address).toHaveLength(44)
    const wallet = await createWallet(userId, { ...liveInput(), address })
    expect(wallet.address).toBe(address)
    expect((await listWallets(userId))[0]?.address).toBe(address)
  })

  it("stops at the cap", async () => {
    const userId = await person()
    for (let i = 0; i < 20; i++) {
      await createWallet(userId, paperInput(`Wallet ${i}`))
    }
    await expect(createWallet(userId, paperInput("One more"))).rejects.toThrow(
      "WALLET_LIMIT"
    )
  })
})

describe("editing wallets", () => {
  it("moves a wallet between active and inactive", async () => {
    const userId = await person()
    const wallet = await createWallet(userId, paperInput())

    const inactive = await updateWallet(userId, {
      id: wallet.id,
      status: "inactive",
    })
    expect(inactive.status).toBe("inactive")
    expect((await listWallets(userId))[0].status).toBe("inactive")
    await expect(findTradingWallet(userId, wallet.id)).rejects.toThrow(
      "WALLET_INACTIVE"
    )

    const active = await updateWallet(userId, {
      id: wallet.id,
      status: "active",
    })
    expect(active.status).toBe("active")
    expect(await findTradingWallet(userId, wallet.id)).toEqual(active)
  })

  it("renames, and changes a practice wallet's starting cash", async () => {
    const userId = await person()
    const wallet = await createWallet(userId, paperInput())
    const saved = await updateWallet(userId, {
      id: wallet.id,
      label: "Scalper",
      startingBalance: 5_000,
    })
    expect(saved.label).toBe("Scalper")
    expect(saved.startingBalance).toBe(5_000)
  })

  it("refuses a starting-cash change on a live wallet — that would rewrite its history", async () => {
    const userId = await person()
    const wallet = await createWallet(userId, liveInput())
    await expect(
      updateWallet(userId, { id: wallet.id, startingBalance: 1 })
    ).rejects.toThrow("WALLET_BALANCE_KIND")
  })

  it("refuses a trading key on a practice wallet", async () => {
    const userId = await person()
    const wallet = await createWallet(userId, paperInput())
    await expect(
      updateWallet(userId, { id: wallet.id, agentKey: KEY })
    ).rejects.toThrow("WALLET_KEY_KIND")
  })

  it("proves a replacement key too, keeping the old one on refusal", async () => {
    const userId = await person()
    const wallet = await createWallet(userId, liveInput())
    const before = (
      await database
        .select()
        .from(tradeWallets)
        .where(
          and(eq(tradeWallets.userId, userId), eq(tradeWallets.id, wallet.id))
        )
    )[0].agentKeyEncrypted

    verifyAgent.mockRejectedValue(new Error("KEY_NOT_APPROVED"))
    await expect(
      updateWallet(userId, { id: wallet.id, agentKey: "cd".repeat(32) })
    ).rejects.toThrow("KEY_NOT_APPROVED")

    const after = (
      await database
        .select()
        .from(tradeWallets)
        .where(
          and(eq(tradeWallets.userId, userId), eq(tradeWallets.id, wallet.id))
        )
    )[0].agentKeyEncrypted
    expect(after).toBe(before)
  })

  it("replaces a key with fresh ciphertext", async () => {
    const userId = await person()
    const wallet = await createWallet(userId, liveInput())
    const before = (
      await database
        .select()
        .from(tradeWallets)
        .where(
          and(eq(tradeWallets.userId, userId), eq(tradeWallets.id, wallet.id))
        )
    )[0].agentKeyEncrypted

    const freshExpiry = Date.now() + 120 * 86_400_000
    verifyAgent.mockResolvedValue({ validUntil: freshExpiry })
    await updateWallet(userId, { id: wallet.id, agentKey: "cd".repeat(32) })
    const after = (
      await database
        .select()
        .from(tradeWallets)
        .where(
          and(eq(tradeWallets.userId, userId), eq(tradeWallets.id, wallet.id))
        )
    )[0]

    expect(after.agentKeyEncrypted).toMatch(CIPHERTEXT_SHAPE)
    expect(after.agentKeyEncrypted).not.toBe(before)
    expect(after.agentValidUntil?.getTime()).toBe(freshExpiry)
  })

  it("cannot reach another person's wallet", async () => {
    const mine = await person()
    const theirs = await person()
    const wallet = await createWallet(theirs, paperInput())

    await expect(
      updateWallet(mine, { id: wallet.id, label: "Taken" })
    ).rejects.toThrow("WALLET_NOT_FOUND")

    await deleteWallet(mine, wallet.id)
    expect(await listWallets(theirs)).toHaveLength(1)
  })

  it("deletes a wallet and everything it stored", async () => {
    const userId = await person()
    const wallet = await createWallet(userId, liveInput())
    await deleteWallet(userId, wallet.id)
    expect(await listWallets(userId)).toEqual([])
  })
})

describe("the figures sweep", () => {
  it("derives a practice wallet from its starting cash alone", async () => {
    const userId = await person()
    const wallet = await createWallet(userId, paperInput())
    const { summaries } = await loadWalletSummaries(userId)

    expect(summaries).toEqual([
      {
        walletId: wallet.id,
        state: "ok",
        equity: 10_000,
        free: 10_000,
        inTrades: 0,
        openProfit: 0,
        settled: 0,
        madeOrLost: 0,
        unpricedFills: 0,
      },
    ])
  })

  it("never asks the exchange about a wallet that is switched off", async () => {
    const userId = await person()
    const wallet = await createWallet(userId, liveInput())
    await updateWallet(userId, { id: wallet.id, status: "inactive" })
    fetchAccount.mockClear()

    const { summaries } = await loadWalletSummaries(userId)

    // Every live wallet costs three requests to the exchange on every poll,
    // and the allowance is shared. A wallet nobody is trading with must not
    // spend any of it.
    expect(fetchAccount).not.toHaveBeenCalled()
    expect(summaries).toEqual([{ walletId: wallet.id, state: "inactive" }])
  })

  it("says a wallet is unread, not unreachable, where holdings cannot be read yet", async () => {
    const userId = await person()
    shape.account = false
    const wallet = await createWallet(userId, liveInput())

    const { summaries } = await loadWalletSummaries(userId)

    expect(fetchAccount).not.toHaveBeenCalled()
    expect(summaries).toEqual([
      {
        walletId: wallet.id,
        state: "unread",
        reason: expect.stringContaining("cannot read what a Mock wallet holds yet"),
      },
    ])
  })

  it("uses settled profit since the start day instead of the wallet baseline", async () => {
    const userId = await person()
    const wallet = await createWallet(userId, {
      ...liveInput(),
      protocol: "kucoin",
    })
    const since = walletProfitWindowStart()
    await database.insert(tradeLiveFills).values([
      {
        userId,
        walletId: wallet.id,
        fillId: "old-profit",
        orderId: "old-order",
        marketKey: "kucoin:mainnet:XBTUSDTM",
        side: "sell",
        px: 100,
        sz: 1,
        at: since - 1,
        closedPnl: 3_718.94,
        fee: 1,
      },
      {
        userId,
        walletId: wallet.id,
        fillId: "recent-profit",
        orderId: "recent-order",
        marketKey: "kucoin:mainnet:XBTUSDTM",
        side: "sell",
        px: 100,
        sz: 1,
        at: since + 1,
        closedPnl: 67.88,
        fee: 1,
      },
      {
        userId,
        walletId: wallet.id,
        fillId: "recent-unpriced",
        orderId: "partial-order",
        marketKey: "kucoin:mainnet:XBTUSDTM",
        side: "sell",
        px: 100,
        sz: 0.5,
        at: since + 2,
        closedPnl: 0,
        fee: 0.25,
      },
    ])
    fetchAccount.mockResolvedValue({
      equity: 24_500,
      free: 19_000,
      inTrades: 5_500,
      openProfit: 9.02,
    })

    const { summaries } = await loadWalletSummaries(userId)
    expect(summaries[0]).toMatchObject({
      walletId: wallet.id,
      state: "ok",
      equity: 24_500,
      free: 19_000,
      inTrades: 5_500,
      openProfit: 9.02,
      settled: 66.88,
      unpricedFills: 1,
    })
    if (summaries[0].state !== "ok") throw new Error("expected figures")
    expect(summaries[0].madeOrLost).toBeCloseTo(75.9, 10)
  })

  it("lets one unreachable wallet stay its own problem", async () => {
    const userId = await person()
    await createWallet(userId, paperInput())
    const live = await createWallet(userId, liveInput())
    fetchAccount.mockRejectedValue(new Error("down"))

    const { summaries } = await loadWalletSummaries(userId)
    expect(summaries).toHaveLength(2)
    expect(summaries[0].state).toBe("ok")
    expect(summaries[1]).toEqual({ walletId: live.id, state: "unreachable" })
  })
})
