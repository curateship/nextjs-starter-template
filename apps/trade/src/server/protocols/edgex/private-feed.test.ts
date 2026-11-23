import { describe, expect, it, vi } from "vitest"

import saved from "./edgex.fixture.json"
import sdk from "./sdk-signatures.fixture.json"
import { toEdgexCatalogue } from "@/server/protocols/edgex/catalogue"
import { edgexSignature, parseEdgexCredential, packEdgexCredential } from "@/server/protocols/edgex/client"
import {
  edgexPrivateHandshake,
  edgexPushedFills,
  toEdgexFill,
} from "@/server/protocols/edgex/private-feed"

const catalogue = toEdgexCatalogue(saved.metadata)

vi.mock("@/server/protocols/edgex/catalogue", async (original) => ({
  ...(await original<typeof import("@/server/protocols/edgex/catalogue")>()),
  edgexMarketIdOf: vi.fn(
    async (_network: unknown, contractId: string) =>
      catalogue.contracts.find((one) => one.contractId === contractId)?.marketId ?? null
  ),
}))

/**
 * edgeX's private-socket page's own `ORDER_UPDATE` example: a stop that
 * fired, its fill carrying no `realizePnl` and no contract, which only the
 * order in the same push names. The contract id is moved from the old
 * host's ETH (10000002) to BTC on the v2 host (30000001).
 */
const orderUpdate = {
  type: "trade-event",
  content: {
    event: "ORDER_UPDATE",
    version: 916,
    time: 1773833120269,
    accountId: 0,
    data: {
      order: [
        {
          id: "729107150223180559",
          contractId: "30000001",
          side: "SELL",
          type: "STOP_MARKET",
          status: "FILLED",
          triggerPrice: "2310.00",
          cumMatchSize: "0.02",
          cumMatchValue: "46.1952",
          cumMatchFee: "0.017554",
        },
      ],
      orderFillTransaction: [
        {
          id: "729108951626416911",
          orderId: "729107150223180559",
          fillSize: "0.02",
          fillValue: "46.1952",
          fillFee: "0.017554",
          fillPrice: "2309.76",
          direction: "TAKER",
          matchTime: "1773833120252",
        },
      ],
    },
  },
}

/** edgeX's fill-page example: an opening fill whose profit is minus its fee. */
const fillPageRow = {
  id: "564815957260763406",
  contractId: "30000001",
  orderId: "564815695875932430",
  orderSide: "BUY",
  fillSize: "0.001",
  fillValue: "97.4445",
  fillFee: "0.017540",
  fillPrice: "97444.5",
  liquidateFee: "0",
  realizePnl: "-0.017540",
  direction: "MAKER",
  matchTime: "1734662617982",
}

describe("edgeX fills", () => {
  it("turns a fill-page row into a Journal row with the fee kept apart from the profit", async () => {
    const fill = await toEdgexFill("mainnet", fillPageRow)
    expect(fill).toEqual({
      fillId: "564815957260763406",
      orderId: "564815695875932430",
      marketId: "BTCUSDC",
      side: "buy",
      px: 97444.5,
      sz: 0.001,
      at: 1734662617982,
      // edgeX folds the fee into realizePnl; an opening fill banks nothing.
      closedPnl: 0,
      fee: 0.01754,
      dir: "Buy",
      liquidation: false,
    })
  })

  it("reads a pushed fill's profit back from the fill page when the push leaves it out", async () => {
    const readOrderFills = vi.fn(async () => [
      { ...orderUpdate.content.data.orderFillTransaction[0], realizePnl: "1.2000" },
    ])
    const fills = await edgexPushedFills("mainnet", orderUpdate, readOrderFills)
    expect(readOrderFills).toHaveBeenCalledWith("729107150223180559")
    expect(fills).toHaveLength(1)
    expect(fills[0]).toMatchObject({
      fillId: "729108951626416911",
      marketId: "BTCUSDC",
      side: "sell",
      px: 2309.76,
      sz: 0.02,
      fee: 0.017554,
    })
    expect(fills[0].closedPnl).toBeCloseTo(1.2 + 0.017554, 9)
  })

  it("makes no row, rather than a zero profit, when the page has not got the fill yet", async () => {
    const fills = await edgexPushedFills("mainnet", orderUpdate, async () => [])
    expect(fills).toEqual([])
  })

  it("uses a pushed fill as it is when it carries its profit, without asking again", async () => {
    const push = structuredClone(orderUpdate)
    Object.assign(push.content.data.orderFillTransaction[0], { realizePnl: "0.5" })
    const readOrderFills = vi.fn(async () => [])
    const fills = await edgexPushedFills("mainnet", push, readOrderFills)
    expect(readOrderFills).not.toHaveBeenCalled()
    expect(fills[0].closedPnl).toBeCloseTo(0.517554, 9)
  })
})

describe("edgeX's private socket handshake", () => {
  it("signs GET, the path and the account id with the timestamp, as edgeX's SDKs do", () => {
    const credential = parseEdgexCredential(
      packEdgexCredential({
        address: sdk.accountId,
        secret: `made-up-key ${sdk.secret} ${sdk.signerKey}`,
        passphrase: "made-up-passphrase",
      })
    )
    const handshake = edgexPrivateHandshake("wss://quote.example", credential, 1790280000789)
    expect(handshake.url).toBe(
      `wss://quote.example/api/v1/private/ws?accountId=${sdk.accountId}&timestamp=1790280000789`
    )
    expect(handshake.headers).toEqual({
      "X-edgeX-Api-Key": "made-up-key",
      "X-edgeX-Passphrase": "made-up-passphrase",
      "X-edgeX-Timestamp": "1790280000789",
      "X-edgeX-Signature": edgexSignature({
        timestamp: 1790280000789,
        method: "GET",
        path: "/api/v1/private/ws",
        body: `accountId=${sdk.accountId}&timestamp=1790280000789`,
        secret: sdk.secret,
      }),
    })
  })
})
