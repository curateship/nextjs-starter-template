import { describe, expect, it } from "vitest"

import type { AutomationCompiledConfig } from "@/lib/automations/compile"
import { tradeDcaNode } from "@/lib/automations/nodes/trade-dca"
import {
  candlesPerCoin,
  coinsAllowedFor,
  MAX_BACKTEST_DAYS,
  MAX_BACKTEST_MARKETS,
  tradeMarketsNode,
  tradeMarketsSettingsSchema,
} from "@/lib/automations/nodes/trade-markets"
import { tradeWalletNode } from "@/lib/automations/nodes/trade-wallet"
import { backtestSpecFromFlow } from "@/lib/trade/backtest/flow"

/**
 * Reading a backtest out of a drawn flow. The whole job is refusing clearly:
 * a flow missing a step must come back as a sentence somebody can act on, not
 * as a run that quietly tested something else.
 */

function flowOf(
  nodes: Record<string, { kind: string; settings: Record<string, unknown> }>
): AutomationCompiledConfig {
  return { v: 1, kind: "automation", nodes: nodes as never, edges: [] }
}

const wallet = { kind: tradeWalletNode.kind, settings: tradeWalletNode.createSettings() }
const markets = {
  kind: tradeMarketsNode.kind,
  settings: {
    ...tradeMarketsNode.createSettings(),
    marketKeys: ["hyperliquid:mainnet:BTC"],
  },
}
const ladder = { kind: tradeDcaNode.kind, settings: tradeDcaNode.createSettings() }

describe("a flow that is a backtest", () => {
  it("reads all three steps off it", () => {
    const read = backtestSpecFromFlow(flowOf({ a: wallet, b: markets, c: ladder }))

    expect(read.problem).toBeNull()
    expect(read.spec?.wallet.startingUsd).toBe(10_000)
    expect(read.spec?.markets.marketKeys).toEqual(["hyperliquid:mainnet:BTC"])
    expect(read.spec?.dca.interval).toBe("4h")
  })

  it("ignores steps that are not part of a backtest", () => {
    // A flow may hold other steps beside these three; that is the app's own
    // business and not a reason to refuse.
    const read = backtestSpecFromFlow(
      flowOf({
        a: wallet,
        b: markets,
        c: ladder,
        d: { kind: "placeholder", settings: {} },
      })
    )

    expect(read.problem).toBeNull()
  })
})

describe("a flow that is not one yet", () => {
  it("names the missing wallet", () => {
    const read = backtestSpecFromFlow(flowOf({ b: markets, c: ladder }))
    expect(read.spec).toBeNull()
    expect(read.problem).toContain("Pretend wallet")
  })

  it("names the missing markets step", () => {
    const read = backtestSpecFromFlow(flowOf({ a: wallet, c: ladder }))
    expect(read.problem).toContain("Markets to test")
  })

  it("names the missing ladder", () => {
    const read = backtestSpecFromFlow(flowOf({ a: wallet, b: markets }))
    expect(read.problem).toContain("DCA ladder")
  })

  it("refuses two wallets rather than picking one", () => {
    // A backtest spends one pot. Choosing silently would make the result about
    // settings nobody could see.
    const read = backtestSpecFromFlow(
      flowOf({ a: wallet, a2: wallet, b: markets, c: ladder })
    )
    expect(read.problem).toContain("two Pretend wallet")
  })

  it("refuses two markets steps", () => {
    const read = backtestSpecFromFlow(
      flowOf({ a: wallet, b: markets, b2: markets, c: ladder })
    )
    expect(read.problem).toContain("two Markets to test")
  })

  it("refuses two ladders", () => {
    const read = backtestSpecFromFlow(
      flowOf({ a: wallet, b: markets, c: ladder, c2: ladder })
    )
    expect(read.problem).toContain("two DCA ladder")
  })

  it("asks for at least one coin", () => {
    const read = backtestSpecFromFlow(
      flowOf({
        a: wallet,
        b: { kind: tradeMarketsNode.kind, settings: { marketKeys: [], days: 30 } },
        c: ladder,
      })
    )
    expect(read.problem).toContain("at least one coin")
  })
})

describe("how many coins one run may take on", () => {
  it("takes four hundred coins of 4h candles over two years", () => {
    // The whole point of the change: this is what somebody wants to test, and
    // the old budget turned it away at about two hundred and twenty.
    expect(coinsAllowedFor("4h", 730)).toBeGreaterThanOrEqual(400)

    // What somebody actually wants to test, and what the old candle budget
    // refused at about two hundred and twenty. The app this is a port of has
    // no such rule — it runs one market at a time and adds the results up.
    const read = tradeMarketsSettingsSchema.safeParse({
      marketKeys: Array.from({ length: 400 }, (_, index) => `hyperliquid:mainnet:C${index}`),
      days: 730,
    })

    expect(read.success).toBe(true)
  })

  it("refuses a list that would not fit in memory", () => {
    // Four hundred coins of 5-minute candles over two years is eighty-four
    // million bars, and every coin's are held at once. That is a crash, not a
    // slow run.
    expect(coinsAllowedFor("5m", 730)).toBeLessThan(20)
  })

  it("still refuses a list longer than the markets that exist", () => {
    const read = tradeMarketsSettingsSchema.safeParse({
      marketKeys: Array.from(
        { length: MAX_BACKTEST_MARKETS + 1 },
        (_, index) => `hyperliquid:mainnet:C${index}`
      ),
      days: 30,
    })

    expect(read.success).toBe(false)
  })

  it("lets the window go back further than any price data exists for", () => {
    // The window is what somebody chooses; the coin count is what follows from
    // it. So the day limit must not be an opinion about how long a useful test
    // is — it is only here to stop somebody typing 99999 and waiting.
    //
    // It used to be 730, which turned the field red on perfectly answerable
    // windows. Ten years is past anything Binance holds — its first USDT
    // perpetuals listed in September 2019 — so what actually bounds a run is
    // the history that exists, and a coin younger than the window comes back
    // as skipped rather than refused.
    expect(MAX_BACKTEST_DAYS).toBeGreaterThan(8 * 365)
    expect(
      tradeMarketsSettingsSchema.safeParse({
        marketKeys: ["hyperliquid:mainnet:BTC"],
        days: 3 * 365,
      }).success
    ).toBe(true)
    expect(
      tradeMarketsSettingsSchema.safeParse({
        marketKeys: ["hyperliquid:mainnet:BTC"],
        days: MAX_BACKTEST_DAYS + 1,
      }).success
    ).toBe(false)
  })

  it("hands out fewer coins the further back the window goes", () => {
    // The rule the panel lives by, and the thing that replaced the flat cap:
    // a coin costs its window of candles, so a longer window simply buys
    // fewer coins. Nothing is refused that could be answered with a number.
    const oneYear = coinsAllowedFor("4h", 365)
    const threeYears = coinsAllowedFor("4h", 3 * 365)
    const tenYears = coinsAllowedFor("4h", 10 * 365)

    expect(oneYear).toBeGreaterThan(threeYears)
    expect(threeYears).toBeGreaterThan(tenYears)
    expect(tenYears).toBeGreaterThanOrEqual(1)
    // Two years of 4h candles must still leave room for the whole list, which
    // is the run this was all built for.
    expect(coinsAllowedFor("4h", 730)).toBe(MAX_BACKTEST_MARKETS)
  })

  it("still says how much reading a choice comes to", () => {
    // Kept because the panel shows it. Two years of 4h bars is about 4,380
    // candles a coin; the same window of 5-minute bars is seventy times that.
    expect(candlesPerCoin("4h", 730)).toBe(4_380)
    expect(candlesPerCoin("5m", 730)).toBeGreaterThan(200_000)
  })
})

describe("a ladder saved with the old click setting", () => {
  it("is measured from the base anyway, the way the old app always was", () => {
    // A replay has nothing to click. Left alone this ran happily and produced
    // real-looking numbers that were really just "buy here, whenever here was".
    const settings = tradeDcaNode.createSettings() as {
      params: Record<string, unknown>
    }
    const clicked = {
      kind: tradeDcaNode.kind,
      settings: {
        ...settings,
        params: { ...settings.params, anchor: "click" },
      },
    }
    const read = backtestSpecFromFlow(flowOf({ a: wallet, b: markets, c: clicked }))

    expect(read.problem).toBeNull()
    expect(read.spec?.dca.params.anchor).toBe("base")
  })
})

