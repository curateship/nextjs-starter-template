import { describe, expect, it } from "vitest"

import {
  buildTradingOverviewProfit,
  buildTradingOverviewActiveTrades,
  isTradingOverviewWallet,
  tradingOverviewWalletPerformance,
} from "./overview"
import {
  moneyForWalletFill,
  walletProfitWindowDaysAgo,
  walletProfitWindowLabel,
  walletProfitWindowStart,
} from "../wallets"

describe("trading overview money", () => {
  it("combines open trades from every wallet", () => {
    const positions = [
      {
        id: "position-1",
        walletId: "paper-1",
        marketKey: "kucoin:mainnet:SOLUSDTM",
        szi: 2,
        entryPx: 100,
        leverage: 5,
        maxLeverage: 5,
        tpPx: null,
        slPx: null,
        feesPaid: 1,
        updatedAt: 500,
      },
    ]
    const wallets = [
      {
        id: "paper-1",
        label: "Practice KuCoin",
        kind: "paper" as const,
        status: "active" as const,
        protocol: "kucoin" as const,
        network: "mainnet" as const,
        startingBalance: 1_000,
        address: null,
        hasKey: false,
        keyValidUntil: null,
      },
    ]

    expect(
      buildTradingOverviewActiveTrades(
        positions,
        wallets,
        new Map([[positions[0].marketKey, 110]])
      )
    ).toEqual([
      expect.objectContaining({
        accountType: "Practice",
        protocol: "KuCoin",
        market: "SOLUSDTM",
        value: 220,
        profit: 20,
        profitShare: 0.5,
      }),
    ])
  })

  it("leaves current value unavailable when the market has no price", () => {
    const position = {
      id: "position-1",
      walletId: "paper-1",
      marketKey: "kucoin:mainnet:SOLUSDTM",
      szi: 2,
      entryPx: 100,
      leverage: 5,
      maxLeverage: 5,
      tpPx: null,
      slPx: null,
      feesPaid: 1,
      updatedAt: 500,
    }
    const wallet = {
      id: "paper-1",
      label: "Practice KuCoin",
      kind: "paper" as const,
      status: "active" as const,
      protocol: "kucoin" as const,
      network: "mainnet" as const,
      startingBalance: 1_000,
      address: null,
      hasKey: false,
      keyValidUntil: null,
    }

    expect(
      buildTradingOverviewActiveTrades([position], [wallet], new Map())[0]
    ).toEqual(expect.objectContaining({ value: null, profit: null }))
  })

  it("uses live mainnet wallets and excludes every kind of practice money", () => {
    expect(isTradingOverviewWallet({ kind: "live", network: "mainnet" })).toBe(
      true
    )
    expect(isTradingOverviewWallet({ kind: "live", network: "testnet" })).toBe(
      false
    )
    expect(isTradingOverviewWallet({ kind: "paper", network: "mainnet" })).toBe(
      false
    )
  })

  it("leaves a partial sale unpriced where the venue prices whole closes", () => {
    expect(
      moneyForWalletFill({
        profitPerSale: false,
        side: "sell",
        closedPnl: 0,
        fee: 0.2,
      })
    ).toBeNull()
  })

  it("trusts a stated zero on a venue that prices every sale", () => {
    // The same numbers as the case above, from a venue that does speak. A
    // sale that genuinely broke even still cost its fee, and that fee is a
    // real loss — not something to leave out of the day.
    expect(
      moneyForWalletFill({
        profitPerSale: true,
        side: "sell",
        closedPnl: 0,
        fee: 0.2,
      })
    ).toBe(-0.2)
  })

  it("never leaves a buy unpriced, whatever the venue states", () => {
    // A buy banks nothing anywhere, so its zero is never an admission of
    // silence — only its fee counts.
    expect(
      moneyForWalletFill({
        profitPerSale: false,
        side: "buy",
        closedPnl: 0,
        fee: 0.3,
      })
    ).toBe(-0.3)
  })

  it("uses the venue's stated profit less its fee", () => {
    expect(
      moneyForWalletFill({
        profitPerSale: true,
        side: "sell",
        closedPnl: 12,
        fee: 0.5,
      })
    ).toBe(11.5)
  })

  it("keeps deposits out of wallet performance", () => {
    expect(
      tradingOverviewWalletPerformance(
        "wallet-1",
        11.4,
        [
          { walletId: "wallet-1", money: 500, fee: 20, at: 99 },
          { walletId: "wallet-1", money: 2.5, fee: 0.4, at: 100 },
          { walletId: "wallet-1", money: null, fee: 0.2, at: 101 },
          { walletId: "wallet-2", money: 900, fee: 30, at: 101 },
        ],
        100
      )
    ).toEqual({
      settled: 2.5,
      fees: 0.6000000000000001,
      open: 11.4,
      madeOrLost: 13.9,
    })
  })

  it("starts at midnight on 20 August 2026 in Toronto, whatever day it is", () => {
    expect(walletProfitWindowStart()).toBe(
      new Date("2026-08-20T04:00:00.000Z").getTime()
    )
  })

  it("counts the days since the start day, so the label grows", () => {
    expect(
      walletProfitWindowDaysAgo(new Date("2026-08-24T16:00:00.000Z"))
    ).toBe(4)
    expect(
      walletProfitWindowDaysAgo(new Date("2026-08-25T16:00:00.000Z"))
    ).toBe(5)
    expect(walletProfitWindowLabel(new Date("2026-08-24T16:00:00.000Z"))).toBe(
      "4 days ago"
    )
    expect(walletProfitWindowLabel(new Date("2026-08-21T16:00:00.000Z"))).toBe(
      "1 day ago"
    )
  })

  it("charts profit from the start day through the current open profit", () => {
    expect(
      buildTradingOverviewProfit(
        [
          { at: 99, money: 500 },
          { at: 101, money: 20 },
          { at: 102, money: null },
          { at: 103, money: 5.9 },
        ],
        100,
        50,
        104
      )
    ).toEqual([
      { at: 100, money: 0 },
      { at: 101, money: 20 },
      { at: 103, money: 25.9 },
      { at: 104, money: 75.9 },
    ])
  })
})
