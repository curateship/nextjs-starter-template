import { describe, expect, it, vi } from "vitest"

import { apexLoginFrame, fetchApexOrderFills, toApexFill } from "@/server/protocols/apex/private-feed"
import { apexPrivate } from "@/server/protocols/apex/client"

vi.mock("@/server/protocols/apex/catalogue", () => ({
  apexMarketIdOf: vi.fn(async (_network: unknown, symbol: string) => symbol.replace("-", "")),
}))
vi.mock("@/server/protocols/apex/client", async (original) => ({
  ...(await original<typeof import("@/server/protocols/apex/client")>()),
  apexPrivate: vi.fn(),
}))

/**
 * ApeX's docs, "Successful Order Execution Push", read 24 Sep 2026. No real
 * account was available, so this is ApeX's documented frame.
 */
const DOCUMENTED_FILL_PUSH = {
  type: "delta",
  timestamp: 1647502440973,
  topic: "ws_zk_accounts_v3",
  contents: {
    fills: [
      {
        symbol: "ETH-USDT",
        side: "BUY",
        orderId: "2048046080",
        fee: "0.625000",
        liquidity: "TAKER",
        accountId: "1024000",
        createdAt: 1652185521361,
        isOpen: true,
        size: "0.500",
        price: "2500.0",
        quoteAmount: "1250.0000",
        id: "2048000182272",
        updatedAt: 1652185678345,
      },
    ],
  },
}

const DOCS_CREDENTIAL = JSON.stringify({
  key: "f6c1e736-fa6b-01df-2822-b9359b3918ae",
  secret: "sAVchdqy_n9zY7TOIDsqkyg0we3uF0_gGbvyIoob",
  passphrase: "Ri08mFrOt2Uaiym",
  omniKey: `0x${"11".repeat(65)}`,
})

describe("ApeX Omni's private socket", () => {
  it("signs in with ApeX's documented login frame", async () => {
    const frame = await apexLoginFrame("mainnet", DOCS_CREDENTIAL, 1647502440973)
    expect(frame?.op).toBe("login")
    expect(JSON.parse(frame!.args[0])).toEqual({
      type: "login",
      topics: ["ws_zk_accounts_v3"],
      httpMethod: "GET",
      requestPath: "/ws/accounts",
      apiKey: "f6c1e736-fa6b-01df-2822-b9359b3918ae",
      passphrase: "Ri08mFrOt2Uaiym",
      timestamp: 1647502440973,
      // ApeX's documented Python signer on the same example gives this.
      signature: "5XhSvvA/XrlhlWi5xDD6KGgq67PD/VDHYwhLAUdYLrw=",
    })
  })

  it("does not sign in with a credential that does not read", async () => {
    expect(await apexLoginFrame("mainnet", "{}", 1)).toBeNull()
  })

  it("turns a pushed fill into a Journal row keyed by ApeX's fill id", async () => {
    const fill = await toApexFill("mainnet", DOCUMENTED_FILL_PUSH.contents.fills[0])
    expect(fill).toEqual({
      fillId: "2048000182272",
      orderId: "2048046080",
      marketId: "ETHUSDT",
      side: "buy",
      px: 2500,
      sz: 0.5,
      at: 1652185521361,
      // ApeX states no profit on a fill; 0 here means "not stated".
      closedPnl: 0,
      fee: 0.625,
      dir: "Open Long",
      liquidation: false,
    })
  })

  it("names a closing sell and skips a fill ApeX has not settled", async () => {
    const closing = await toApexFill("mainnet", { ...DOCUMENTED_FILL_PUSH.contents.fills[0], side: "SELL", isOpen: false })
    expect(closing?.dir).toBe("Close Long")
    expect(await toApexFill("mainnet", { ...DOCUMENTED_FILL_PUSH.contents.fills[0], status: "PENDING" })).toBeNull()
  })

  it("reads the same fill back in a recovery under the same key, so it is one row", async () => {
    vi.mocked(apexPrivate).mockResolvedValueOnce({ orders: DOCUMENTED_FILL_PUSH.contents.fills, totalSize: 1 })
    const fills = await fetchApexOrderFills("mainnet", "0x1111111111111111111111111111111111111111", 0, () => DOCS_CREDENTIAL)
    expect(fills.map((one) => one.fillId)).toEqual(["2048000182272"])
    expect(vi.mocked(apexPrivate).mock.calls[0].slice(2, 5)).toEqual([
      "GET",
      "/fills",
      { beginTimeInclusive: 0, limit: 100, page: 0 },
    ])
  })
})
