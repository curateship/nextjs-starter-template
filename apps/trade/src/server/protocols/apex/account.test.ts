import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import docs from "./account-docs.fixture.json"
import fixture from "./apex.fixture.json"
import signatures from "./signer/connector-signatures.fixture.json"
import {
  clearApexAccountReads,
  fetchApexAccount,
  toApexAccountRead,
  toApexBalance,
  toApexWalletPositions,
} from "@/server/protocols/apex/account"
import { verifyApexAgentKey } from "@/server/protocols/apex/agent"
import { clearApexCatalogue } from "@/server/protocols/apex/catalogue"
import { apexPrivate, apexPublic } from "@/server/protocols/apex/client"
import { readApexIndexPrices } from "@/server/protocols/apex/live-prices"

vi.mock("@/server/protocols/apex/client", async (original) => ({
  ...(await original<typeof import("@/server/protocols/apex/client")>()),
  apexPrivate: vi.fn(),
  apexPublic: vi.fn(),
}))
vi.mock("@/server/protocols/apex/live-prices", () => ({
  readApexIndexPrices: vi.fn(() => new Map()),
  readApexLivePrices: vi.fn(() => ({ prices: new Map() })),
}))

const privateRead = vi.mocked(apexPrivate)
const publicRead = vi.mocked(apexPublic)
const indexPrices = vi.mocked(readApexIndexPrices)

const ADDRESS = "0x1111111111111111111111111111111111111111"
const BLOB = JSON.stringify({
  key: "11111111-2222-3333-4444-555555555555",
  secret: "made-up-secret",
  passphrase: "made-up-passphrase",
  omniKey: signatures.omniKey,
})

function answers(account: unknown, balance: unknown = docs.balance) {
  privateRead.mockImplementation(async (_network, _credential, _method, path) =>
    path === "/account" ? account : balance
  )
}

beforeEach(() => {
  privateRead.mockReset()
  publicRead.mockReset()
  indexPrices.mockReset()
  indexPrices.mockReturnValue(new Map())
  publicRead.mockImplementation(async (_network, path) => {
    if (path === "/symbols") return fixture.symbols.data
    throw new Error(`unexpected public read ${path}`)
  })
  clearApexAccountReads()
  clearApexCatalogue()
})

afterEach(() => {
  clearApexAccountReads()
})

describe("ApeX Omni's account read", () => {
  it("reads the ids, the signing key and the fee rates every order needs", () => {
    const { facts, positions } = toApexAccountRead(docs.accountEmpty)
    expect(facts).toEqual({
      accountId: "588972539589427317",
      zkAccountId: "123456",
      l2Key: signatures.cases[0].output.pubKey,
      ethereumAddress: ADDRESS,
      makerFeeRate: "0.00020",
      takerFeeRate: "0.00050",
      profitPrice: "index",
    })
    // ApeX lists a market the account touched with a size of zero.
    expect(positions).toEqual([])
  })

  it("reads the balance as worth, free and margin held", () => {
    expect(toApexBalance(docs.balance)).toEqual({
      equity: 251.5,
      free: 180.25,
      inTrades: 80.4,
      oracle: new Map([["BTC-USDT", 84100]]),
    })
  })

  it("reads leverage off the account where it set one and off the market where it did not", async () => {
    const rows = await toApexWalletPositions(
      "mainnet",
      toApexAccountRead(docs.accountWithPositions),
      toApexBalance(docs.balance).oracle
    )
    expect(rows.map((row) => [row.marketId, row.szi, row.leverage, row.marginMode, row.liquidationPx])).toEqual([
      ["BTCUSDT", 0.003, 5, "cross", null],
      // SPCX's own default rate is 0.2, so 5x, from the saved catalogue.
      ["SPCXUSDT", -1, 5, "cross", null],
    ])
    // ApeX's formula: size x oracle price x margin rate.
    expect(rows[0].marginUsed).toBeCloseTo(0.003 * 84100 * 0.2)
    // No oracle price for SPCX in the answer: the entry price stands in.
    expect(rows[1].marginUsed).toBeCloseTo(1 * 150 * 0.2)
  })

  it("prices open profit on the index, as ApeX says it does", async () => {
    answers(docs.accountWithPositions)
    indexPrices.mockReturnValue(new Map([["BTCUSDT", 85000], ["SPCXUSDT", 149]]))
    const figures = await fetchApexAccount("mainnet", ADDRESS, () => BLOB)
    // BTC long 0.003 from $84,000 to $85,000 is +$3; SPCX short 1 from $150
    // to $149 is +$1.
    expect(figures).toEqual({ equity: 251.5, free: 180.25, inTrades: 80.4, openProfit: 4 })
  })

  it("shares one read between panels that ask inside two seconds", async () => {
    answers(docs.accountEmpty)
    await Promise.all([
      fetchApexAccount("mainnet", ADDRESS, () => BLOB),
      fetchApexAccount("mainnet", ADDRESS, () => BLOB),
    ])
    expect(privateRead).toHaveBeenCalledTimes(2)
  })
})

describe("signing in to ApeX Omni", () => {
  it("saves values whose omni key signs as the account's own key", async () => {
    answers(docs.accountEmpty)
    await expect(verifyApexAgentKey("mainnet", ADDRESS, BLOB)).resolves.toEqual({
      validUntil: null,
      positionMode: null,
    })
  })

  it("refuses a wrong omni key before saving", async () => {
    answers({ ...docs.accountEmpty, l2Key: `0x${"ab".repeat(32)}` })
    await expect(verifyApexAgentKey("mainnet", ADDRESS, BLOB)).rejects.toThrow(
      /^KEY_NOT_APPROVED:The omni key does not belong to this account/
    )
  })

  it("refuses values that belong to a different wallet", async () => {
    answers(docs.accountEmpty)
    await expect(
      verifyApexAgentKey("mainnet", "0x2222222222222222222222222222222222222222", BLOB)
    ).rejects.toThrow(/^KEY_NOT_APPROVED:These API values belong to a different wallet/)
  })

  it("refuses a bad key, secret or passphrase in ApeX's own sentence and never repeats them", async () => {
    privateRead.mockRejectedValue(
      new Error(
        "LIVE_ORDER_REFUSED:ApeX Omni did not accept these API values. Copy the API key, secret and passphrase again from ApeX's API management page; a wrong secret or passphrase is refused the same way as a wrong key."
      )
    )
    const refusal = await verifyApexAgentKey("mainnet", ADDRESS, BLOB).catch((error: Error) => error.message)
    expect(refusal).toMatch(/^KEY_NOT_APPROVED:ApeX Omni did not accept these API values/)
    expect(refusal).not.toContain("made-up")
    expect(refusal).not.toContain("11111111-2222")
  })

  it("asks ApeX again for a changed passphrase instead of reusing a held success", async () => {
    answers(docs.accountEmpty)
    await verifyApexAgentKey("mainnet", ADDRESS, BLOB)
    privateRead.mockRejectedValue(
      new Error("LIVE_ORDER_REFUSED:ApeX Omni did not accept these API values.")
    )
    const wrong = JSON.stringify({ ...JSON.parse(BLOB), passphrase: "another" })
    await expect(verifyApexAgentKey("mainnet", ADDRESS, wrong)).rejects.toThrow(/^KEY_NOT_APPROVED:/)
  })

  it("says ApeX could not be reached, rather than blaming the values, when it is busy", async () => {
    privateRead.mockRejectedValue(new Error("EXCHANGE_BUSY:ApeX Omni — did not answer in time"))
    await expect(verifyApexAgentKey("mainnet", ADDRESS, BLOB)).rejects.toThrow(/^KEY_CHECK_UNAVAILABLE$/)
  })
})
