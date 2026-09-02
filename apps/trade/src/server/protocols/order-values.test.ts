import { describe, expect, it } from "vitest"

import type { OrderAuth, PlaceOrderParams } from "@/lib/protocols/contracts"
import { placeAsterOrder } from "@/server/protocols/aster/orders"
import { placeHyperliquidOrder } from "@/server/protocols/hyperliquid/orders"
import { placeKucoinOrder } from "@/server/protocols/kucoin/orders"
import { placeLighterOrder } from "@/server/protocols/lighter/orders"
import { placePhemexOrder } from "@/server/protocols/phemex/orders"

const auth: OrderAuth = {
  agentKey: "not-opened-for-invalid-values",
  accountAddress: "0x0000000000000000000000000000000000000001",
  allocateNonce: async () => 1,
}

const valid: PlaceOrderParams = {
  marketId: "BTC",
  side: "buy",
  kind: "limit",
  px: 100,
  sz: 1,
  reduceOnly: false,
  leverage: null,
  marginMode: null,
  tpPx: null,
  slPx: null,
}

const placers = [
  ["Hyperliquid", placeHyperliquidOrder],
  ["Phemex", placePhemexOrder],
  ["KuCoin", placeKucoinOrder],
  ["Aster", placeAsterOrder],
  ["Lighter", placeLighterOrder],
] as const

describe.each(placers)("%s order values", (_name, place) => {
  it("refuses a negative size before opening the credential", async () => {
    await expect(place("testnet", auth, { ...valid, sz: -1 })).rejects.toThrow(
      "LIVE_SIZE"
    )
  })

  it("refuses a negative price before opening the credential", async () => {
    await expect(place("testnet", auth, { ...valid, px: -1 })).rejects.toThrow(
      "LIVE_PRICE"
    )
  })

  it("refuses a negative target before changing the account", async () => {
    await expect(
      place("testnet", auth, { ...valid, tpPx: -1 })
    ).rejects.toThrow("LIVE_PRICE")
  })

  it("refuses a negative stop before changing the account", async () => {
    await expect(
      place("testnet", auth, { ...valid, slPx: -1 })
    ).rejects.toThrow("LIVE_PRICE")
  })
})
