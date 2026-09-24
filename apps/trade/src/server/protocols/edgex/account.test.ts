import { beforeEach, describe, expect, it, vi } from "vitest"

import answers from "./account-docs.fixture.json"
import saved from "./edgex.fixture.json"
import {
  clearEdgexAccountReads,
  fetchEdgexAccount,
  toEdgexAccountRead,
  toEdgexWalletPositions,
} from "@/server/protocols/edgex/account"
import { verifyEdgexAgentKey } from "@/server/protocols/edgex/agent"
import { toEdgexCatalogue } from "@/server/protocols/edgex/catalogue"
import { edgexPrivate, packEdgexCredential } from "@/server/protocols/edgex/client"

/**
 * `account-docs.fixture.json` is edgeX's own documented `getAccountAsset`
 * answer, its contract ids moved from the old host's 10000001 to the v2
 * host's 30000001, and one short SPY position written beside it by hand. No
 * real account answer has been read yet: that waits for Tyler's key.
 */
const catalogue = toEdgexCatalogue(saved.metadata)

vi.mock("@/server/protocols/edgex/client", async (original) => ({
  ...(await original<typeof import("@/server/protocols/edgex/client")>()),
  edgexPrivate: vi.fn(),
}))
vi.mock("@/server/protocols/edgex/catalogue", async (original) => {
  const real = await original<typeof import("@/server/protocols/edgex/catalogue")>()
  return {
    ...real,
    edgexContract: vi.fn(async (_network: unknown, marketId: string) => {
      const found = catalogue.contracts.find((one) => one.marketId === marketId)
      if (!found) throw new Error("EDGEX_MARKET_UNKNOWN")
      return found
    }),
    edgexMarketIdOf: vi.fn(
      async (_network: unknown, contractId: string) =>
        catalogue.contracts.find((one) => one.contractId === contractId)?.marketId ?? null
    ),
  }
})

const privateCall = vi.mocked(edgexPrivate)
const SIGNER = `0x${"0123456789abcdef".repeat(4)}`
const blob = packEdgexCredential({
  address: "543429922991899150",
  secret: `made-up-key made-up-secret ${SIGNER}`,
  passphrase: "made-up-passphrase",
})

beforeEach(() => {
  clearEdgexAccountReads()
  privateCall.mockReset()
})

describe("edgeX's account", () => {
  it("reads worth, free cash and margin in trades off the collateral row", () => {
    const read = toEdgexAccountRead(answers.documented)
    expect(read.accountId).toBe("543429922991899150")
    expect(read.equity).toBeCloseTo(15.791238609, 8)
    expect(read.free).toBe(13.83655)
    expect(read.inTrades).toBeCloseTo(1.954688532, 8)
    expect(read.leverageByContract.get("30000001")).toBe(50)
  })

  it("reads a long coin and a short stock position with edgeX's own entry, liquidation and leverage", async () => {
    const rows = await toEdgexWalletPositions("mainnet", toEdgexAccountRead(answers.documented))
    expect(rows).toHaveLength(2)
    const btc = rows.find((one) => one.marketId === "BTCUSDC")!
    expect(btc).toMatchObject({
      szi: 0.001,
      entryPx: 97444.5,
      liquidationPx: 82354.9,
      leverage: 50,
      // edgeX's account page names no margin mode, so none is claimed.
      marginMode: null,
    })
    expect(btc.marginUsed).toBeCloseTo(1.954688532, 8)
    const spy = rows.find((one) => one.marketId === "SPYUSDC")!
    expect(spy).toMatchObject({ szi: -0.06, entryPx: 767.12, liquidationPx: 905.5, leverage: 5 })
  })

  it("adds up edgeX's stated open profit for the wallet card", async () => {
    privateCall.mockResolvedValue(answers.documented)
    const figures = await fetchEdgexAccount("mainnet", "543429922991899150", () => blob)
    expect(figures.openProfit).toBeCloseTo(0.2899266 - 0.0218, 6)
    expect(figures.free).toBe(13.83655)
  })

  it("reads an account with nothing deposited as zeros, not a failure", () => {
    const read = toEdgexAccountRead(answers.empty)
    expect(read).toMatchObject({ equity: 0, free: 0, inTrades: 0, positions: [] })
  })

  it("holds one read for two seconds, so every panel shares it", async () => {
    privateCall.mockResolvedValue(answers.documented)
    await fetchEdgexAccount("mainnet", "543429922991899150", () => blob)
    await fetchEdgexAccount("mainnet", "543429922991899150", () => blob)
    expect(privateCall).toHaveBeenCalledTimes(1)
  })
})

describe("signing in to edgeX", () => {
  it("proves the values with one signed read of the account", async () => {
    privateCall.mockResolvedValue(answers.documented)
    await expect(verifyEdgexAgentKey("mainnet", "543429922991899150", blob)).resolves.toEqual({
      validUntil: null,
      positionMode: null,
    })
    expect(privateCall).toHaveBeenCalledTimes(1)
    expect(privateCall.mock.calls[0][2]).toBe("GET")
  })

  it("refuses a key that answers for a different account", async () => {
    privateCall.mockResolvedValue({ ...answers.documented, account: { ...answers.documented.account, id: "999" } })
    await expect(verifyEdgexAgentKey("mainnet", "543429922991899150", blob)).rejects.toThrow(
      /^KEY_NOT_APPROVED:This API key belongs to a different edgeX account/
    )
  })

  it("refuses a signer key that signs as a different address than edgeX holds", async () => {
    privateCall.mockResolvedValue({
      ...answers.documented,
      account: { ...answers.documented.account, l2Key: "0x1111111111111111111111111111111111111111" },
    })
    await expect(verifyEdgexAgentKey("mainnet", "543429922991899150", blob)).rejects.toThrow(
      /^KEY_NOT_APPROVED:The signer key signs as 0x/
    )
  })

  it("passes edgeX's own refusal sentence through, and says unreachable when busy", async () => {
    privateCall.mockRejectedValueOnce(
      new Error("LIVE_ORDER_REFUSED:edgeX did not accept the passphrase. Type the passphrase you chose.")
    )
    await expect(verifyEdgexAgentKey("mainnet", "543429922991899150", blob)).rejects.toThrow(
      "KEY_NOT_APPROVED:edgeX did not accept the passphrase. Type the passphrase you chose."
    )
    privateCall.mockRejectedValueOnce(new Error("EXCHANGE_BUSY:edgeX — did not answer in time"))
    await expect(verifyEdgexAgentKey("mainnet", "543429922991899150", blob)).rejects.toThrow(
      "KEY_CHECK_UNAVAILABLE"
    )
  })
})
