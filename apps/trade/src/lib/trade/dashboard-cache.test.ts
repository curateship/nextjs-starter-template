// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest"

import { ladderPlanSchema } from "@/lib/trade/dca"
import {
  readSmartOrdersCache,
  readWalletPanelCache,
  writeSmartOrdersCache,
  writeWalletPanelCache,
} from "@/lib/trade/dashboard-cache"
import type { SmartOrder } from "@/lib/trade/smart-plan"

const scope = "person:hyperliquid"

beforeEach(() => window.localStorage.clear())

describe("the dashboard cache", () => {
  it("keeps an empty wallet answer as a real cached answer", () => {
    writeWalletPanelCache(scope, {
      wallets: [],
      summaries: [],
      lastWalletId: null,
    })

    expect(readWalletPanelCache(scope)).toEqual({
      wallets: [],
      summaries: [],
      lastWalletId: null,
    })
  })

  it("does not keep a wallet address in browser storage", () => {
    writeWalletPanelCache(scope, {
      wallets: [
        {
          id: "wallet",
          label: "Main",
          kind: "live",
          status: "active",
          protocol: "hyperliquid",
          network: "mainnet",
          startingBalance: 1_000,
          address: "0xprivate-account-id",
          hasKey: true,
          keyValidUntil: null,
        },
      ],
      summaries: [],
      lastWalletId: "wallet",
    })

    expect(readWalletPanelCache(scope)?.wallets[0]?.address).toBeNull()
    expect(
      window.localStorage.getItem(`trade-wallet-panel-${scope}`)
    ).not.toContain("0xprivate-account-id")
  })

  it("keeps smart orders with a plan that still passes the current reader", () => {
    const order: SmartOrder = {
      id: "one",
      walletId: "wallet",
      marketKey: "hyperliquid:mainnet:XMR",
      status: "active",
      kind: "dca",
      flowRunId: null,
      createdAt: 1,
      updatedAt: 1,
      plan: ladderPlanSchema.parse({
        anchorPx: 100,
        sizeDecimals: 2,
        maxLeverage: 20,
        rungs: [
          {
            px: 95,
            sz: 1,
            status: "waiting",
            orderId: null,
            sellOrderId: null,
            dead: false,
            touched: false,
          },
        ],
        takeProfit: null,
        stopLoss: null,
        aimedTpPx: null,
        aimedSlPx: null,
        twoGreen: false,
        greenInterval: null,
        green: null,
      }),
    }

    writeSmartOrdersCache(scope, [order])

    expect(readSmartOrdersCache(scope)).toEqual([order])
  })

  it("ignores stored data from an older or broken shape", () => {
    window.localStorage.setItem(
      `trade-smart-orders-panel-${scope}`,
      JSON.stringify([{ id: "broken" }])
    )

    expect(readSmartOrdersCache(scope)).toBeNull()
  })
})
