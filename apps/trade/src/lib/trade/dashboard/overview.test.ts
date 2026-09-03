import { describe, expect, it } from "vitest"

import {
  buildTradingOverviewBots,
  buildTradingOverviewProfit,
  buildTradingOverviewActiveTrades,
  buildTradingOverviewWatchingOrders,
  isTradingOverviewWallet,
  mergeTradingOverviewRefresh,
  tradingOverviewWalletPerformance,
} from "./overview"
import {
  moneyForWalletFill,
  walletProfitWindowDaysAgo,
  walletProfitWindowLabel,
  walletProfitWindowStart,
} from "../wallets"

function botRun(
  over: Partial<Parameters<typeof buildTradingOverviewBots>[0][number]>
): Parameters<typeof buildTradingOverviewBots>[0][number] {
  return {
    id: "run-1",
    automationId: "flow-1",
    automationName: "Buy the dip",
    status: "running",
    paused: false,
    holding: false,
    working: 2,
    startedAt: 100,
    stoppedReason: null,
    headline: null,
    coins: 12,
    holdingCoins: 3,
    netUsd: 12.5,
    ...over,
  }
}

describe("running bots on the trading overview", () => {
  it("orders running, waiting, paused and unexpected stops", () => {
    const bots = buildTradingOverviewBots([
      botRun({
        id: "stopped",
        automationId: "stopped-flow",
        automationName: "Needs attention",
        status: "stopped",
        stoppedReason: "The wallet was deleted.",
        startedAt: 400,
      }),
      botRun({
        id: "paused",
        automationId: "paused-flow",
        automationName: "Paused bot",
        paused: true,
        startedAt: 300,
      }),
      botRun({
        id: "waiting",
        automationId: "waiting-flow",
        automationName: "Waiting bot",
        holding: true,
        working: 0,
        headline: {
          words: "BTC — not enough free cash to place the whole ladder.",
          problem: true,
        },
        startedAt: 200,
      }),
      botRun({ id: "running", startedAt: 100 }),
    ])

    expect(bots.map((bot) => bot.state)).toEqual([
      "running",
      "waiting",
      "paused",
      "stopped",
    ])
    expect(bots[1].statusWords).toBe(
      "BTC — not enough free cash to place the whole ladder."
    )
    expect(bots[3].statusWords).toBe("The wallet was deleted.")
  })

  it("keeps an unexpected stop until deletion or restart", () => {
    const stopped = botRun({
      id: "old-stop",
      status: "stopped",
      stoppedReason: "The wallet was deleted.",
      startedAt: 100,
    })

    expect(buildTradingOverviewBots([stopped])).toHaveLength(1)
    expect(
      buildTradingOverviewBots([
        stopped,
        botRun({
          id: "new-run",
          startedAt: 200,
          coins: 7,
          holdingCoins: 2,
          netUsd: 31,
        }),
      ])
    ).toEqual([
      expect.objectContaining({
        automationId: "flow-1",
        runId: "new-run",
        marketCount: 7,
        positionCount: 2,
        netUsd: 31,
      }),
    ])
    expect(
      buildTradingOverviewBots([
        botRun({
          ...stopped,
          stoppedReason: "Switched off by hand.",
        }),
      ])
    ).toEqual([])
  })
})

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
        targets: [],
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
        new Map([[positions[0].marketKey, 110]]),
        [
          {
            id: "ladder-1",
            walletId: "paper-1",
            marketKey: positions[0].marketKey,
            kind: "dca",
            createdAt: 400,
          },
        ]
      )
    ).toEqual([
      expect.objectContaining({
        accountType: "Practice",
        protocol: "KuCoin",
        market: "SOLUSDTM",
        orderKind: "dca",
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
      targets: [],
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
    ).toEqual(
      expect.objectContaining({
        orderKind: "manual",
        value: null,
        profit: null,
      })
    )
  })

  it("lists manual prices, ladders, grids and signals under Watching", () => {
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
    const orders = (["watch", "dca", "grid", "signal"] as const).map(
      (kind, index) => ({
        id: `${kind}-1`,
        walletId: wallet.id,
        marketKey: `kucoin:mainnet:${kind.toUpperCase()}USDTM`,
        kind,
        createdAt: index,
      })
    )

    expect(
      buildTradingOverviewWatchingOrders(orders, [wallet]).map((order) => ({
        market: order.market,
        orderKind: order.orderKind,
        accountType: order.accountType,
      }))
    ).toEqual([
      {
        market: "WATCHUSDTM",
        orderKind: "manual",
        accountType: "Practice",
      },
      {
        market: "DCAUSDTM",
        orderKind: "dca",
        accountType: "Practice",
      },
      {
        market: "GRIDUSDTM",
        orderKind: "grid",
        accountType: "Practice",
      },
      {
        market: "SIGNALUSDTM",
        orderKind: "signal",
        accountType: "Practice",
      },
    ])
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

describe("a later overview read", () => {
  const first: Parameters<typeof mergeTradingOverviewRefresh>[0] = {
    readAt: 100,
    wallets: [
      {
        id: "wallet-1",
        label: "Main",
        network: "mainnet",
        venue: "Hyperliquid",
        startingBalance: 1_000,
        summary: {
          walletId: "wallet-1",
          state: "ok",
          equity: 1_020,
          free: 900,
          inTrades: 120,
          openProfit: 20,
          madeOrLost: 20,
          settled: 0,
          unpricedFills: 0,
        },
        performance: { settled: 0, fees: 0, open: 20, madeOrLost: 20 },
        profit: [{ at: 100, money: 20 }],
      },
    ],
    fills: [],
    activeTrades: [
      {
        id: "position-1",
        walletId: "wallet-1",
        walletLabel: "Main",
        accountType: "Real",
        protocol: "Hyperliquid",
        marketKey: "hyperliquid:mainnet:BTC",
        market: "BTC",
        side: "long",
        orderKind: "manual",
        value: 500,
        profit: 20,
        profitShare: 0.2,
      },
    ],
    activeTradesUnavailable: [],
    bots: [],
    profit: [{ at: 100, money: 20 }],
    missingVenues: [],
    unpricedFills: 0,
  }

  it("keeps good wallet and position figures through a partial failure", () => {
    const merged = mergeTradingOverviewRefresh(first, {
      ...first,
      readAt: 200,
      wallets: [
        {
          ...first.wallets[0]!,
          summary: { walletId: "wallet-1", state: "unreachable" },
          performance: null,
          profit: null,
        },
      ],
      activeTrades: [],
      activeTradesUnavailable: ["wallet-1"],
      profit: [],
      missingVenues: ["Hyperliquid"],
    })

    expect(merged.wallets).toBe(first.wallets)
    expect(merged.activeTrades).toEqual(first.activeTrades)
    expect(merged.profit).toBe(first.profit)
    expect(merged.readAt).toBe(100)
  })

  it("removes a closed position after a complete read", () => {
    const merged = mergeTradingOverviewRefresh(first, {
      ...first,
      readAt: 200,
      activeTrades: [],
      activeTradesUnavailable: [],
    })

    expect(merged.activeTrades).toEqual([])
    expect(merged.readAt).toBe(200)
  })
})
