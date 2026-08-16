import { describe, expect, it } from "vitest"

import type { AutomationCompiledConfig } from "@/lib/automations/compile"
import { automationGraphSchema } from "@/lib/automations/graph"
import { tradeDcaNode } from "@/lib/automations/nodes/trade-dca"
import {
  candlesPerCoin,
  coinsAllowedFor,
  dayStartMs,
  MAX_BACKTEST_DAYS,
  MAX_BACKTEST_MARKETS,
  tradeMarketsNode,
  tradeMarketsSettingsSchema,
  windowDays,
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
// The exchange is pinned rather than taken from the default, so these tests go
// on being about the window and the memory budget when the default moves.
const markets = {
  kind: tradeMarketsNode.kind,
  settings: {
    ...tradeMarketsNode.createSettings(),
    protocol: "hyperliquid",
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
    expect(read.spec?.interval).toBe("4h")
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
    expect(read.problem).toContain("Add a Wallet step")
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
    expect(read.problem).toContain("two Wallet steps")
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

  it("refuses coins from a different exchange than the step", () => {
    const read = backtestSpecFromFlow(
      flowOf({
        a: wallet,
        b: {
          kind: tradeMarketsNode.kind,
          settings: {
            ...tradeMarketsNode.createSettings(),
            protocol: "hyperliquid",
            marketKeys: ["binance:mainnet:BTC"],
          },
        },
        c: ladder,
      })
    )

    expect(read.spec).toBeNull()
    expect(read.problem).toContain("exchange shown")
  })
})

describe("saved market editor settings", () => {
  it("keeps the editor's volume range in the saved draft", () => {
    const graph = automationGraphSchema.parse({
      nodes: [
        {
          id: "markets-1",
          kind: tradeMarketsNode.kind,
          x: 0,
          y: 0,
          settings: {
            ...tradeMarketsNode.createSettings(),
            minimumVolume: ".5",
            maximumVolume: "100",
          },
        },
      ],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 },
    })

    expect(graph.nodes[0].settings.minimumVolume).toBe(".5")
    expect(graph.nodes[0].settings.maximumVolume).toBe("100")
  })
})

describe("naming the two days a run covers", () => {
  function withDates(dates: { from?: string | null; to?: string | null }) {
    return backtestSpecFromFlow(
      flowOf({
        a: wallet,
        b: { ...markets, settings: { ...markets.settings, ...dates } },
        c: ladder,
      })
    )
  }

  it("takes two days and leaves the day count alone underneath them", () => {
    const read = withDates({ from: "2023-01-01", to: "2023-06-30" })

    expect(read.problem).toBeNull()
    expect(read.spec?.markets.from).toBe("2023-01-01")
    expect(read.spec?.markets.to).toBe("2023-06-30")
    // Untouched on purpose: clearing the dates puts you back on the window you
    // had before, rather than on whatever the dates happened to add up to.
    expect(read.spec?.markets.days).toBe(30)
  })

  it("counts both days in, so the length is what somebody would say it is", () => {
    // January 1st to June 30th is 181 days. Counting the gap between the two
    // midnights instead gives 180 and quietly loses the last day.
    expect(windowDays({ days: 30, from: "2023-01-01", to: "2023-06-30" })).toBe(181)
    expect(windowDays({ days: 30, from: "2023-10-01", to: "2023-10-10" })).toBe(10)
    expect(windowDays({ days: 30, from: "2023-10-01", to: "2023-10-01" })).toBe(1)
    // No dates named, so the count on the step is the answer.
    expect(windowDays({ days: 30, from: null, to: null })).toBe(30)
  })

  it("asks for the other date rather than guessing it", () => {
    expect(withDates({ from: "2023-01-01" }).problem).toMatch(/both dates/i)
    expect(withDates({ to: "2023-01-01" }).problem).toMatch(/both dates/i)
  })

  it("says so when the end is before the start", () => {
    expect(withDates({ from: "2023-06-30", to: "2023-01-01" }).problem).toMatch(
      /before the start/i
    )
  })

  it("refuses a day that does not exist", () => {
    // The 31st of February is a typo, and left to itself `Date.parse` answers
    // the 3rd of March rather than refusing — so somebody meaning to end
    // February would have had the window moved into spring without being told.
    expect(dayStartMs("2023-02-31")).toBeNull()
    expect(dayStartMs("2023-13-01")).toBeNull()
    expect(dayStartMs("30 June 2023")).toBeNull()
    expect(dayStartMs("2024-02-29")).not.toBeNull()
  })

  it("weighs a dated window by its real length, not by the count underneath", () => {
    // The trap this closes: two years of 5-minute candles across four hundred
    // coins is a crash, and it used to be waved through any time the dates
    // said two years while the number underneath still said 30.
    const read = backtestSpecFromFlow(
      flowOf({
        a: wallet,
        b: {
          ...markets,
          settings: {
            ...markets.settings,
            days: 30,
            from: "2021-01-01",
            to: "2022-12-31",
            marketKeys: Array.from(
              { length: 400 },
              (_, index) => `hyperliquid:mainnet:C${index}`
            ),
          },
        },
        c: { ...ladder, settings: { ...ladder.settings, interval: "5m" } },
      })
    )

    expect(read.problem).toMatch(/candles are held in memory/i)
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

  it("counts the 4h candles every run reads, whatever it is walking", () => {
    // Kept because the panel shows it, and because the budget is worked out
    // from it. Two years of 4h bars is 4,380 candles a coin, plus the 500 from
    // before the window that the base rule needs to know a level on day one.
    expect(candlesPerCoin("4h", 730)).toBe(4_380 + 500)

    // A run on any OTHER timeframe reads its own candles AND the 4h ones, and
    // the sum has to say so. It used to count only the first, so a run on 1h
    // asked for a quarter more memory than it had been granted — which is a
    // run that passes the check and then runs the server out of memory.
    expect(candlesPerCoin("1h", 730)).toBe(17_520 + 4_380 + 500)
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
    expect(
      read.spec?.strategy.kind === "dca" ? read.spec.strategy.dca.params.anchor : null
    ).toBe("base")
  })
})

describe("a flow whose Wallet step names a wallet", () => {
  /** The wallet step as the panel writes it once a wallet is picked. */
  function tradingWallet(
    patch: Record<string, unknown> = {}
  ): { kind: string; settings: Record<string, unknown> } {
    return {
      kind: tradeWalletNode.kind,
      settings: {
        ...tradeWalletNode.createSettings(),
        walletId: "w1",
        walletLabel: "Practice 2",
        walletKind: "paper",
        spendCapUsd: 500,
        ...patch,
      },
    }
  }

  it("is not a backtest, and says which wallet in the refusal", () => {
    const read = backtestSpecFromFlow(
      flowOf({ a: tradingWallet(), b: markets, c: ladder })
    )

    expect(read.spec).toBeNull()
    expect(read.problem).toContain("Practice 2")
    expect(read.problem).toContain("practice money")
    expect(read.problem).toContain("pretend money")
  })

  it("calls real money what it is", () => {
    const read = backtestSpecFromFlow(
      flowOf({
        a: tradingWallet({ walletKind: "live", walletLabel: "Main" }),
        b: markets,
        c: ladder,
      })
    )

    expect(read.problem).toContain("Main")
    expect(read.problem).toContain("real money")
  })

  it("says so before complaining about the rest of the flow", () => {
    // Somebody who pressed the wrong button should not first be told their
    // coin list is empty. The wallet answer is the useful one.
    const noCoins = {
      kind: tradeMarketsNode.kind,
      settings: {
        ...tradeMarketsNode.createSettings(),
        protocol: "hyperliquid",
        marketKeys: [],
      },
    }
    const read = backtestSpecFromFlow(
      flowOf({ a: tradingWallet(), b: noCoins, c: ladder })
    )

    expect(read.problem).toContain("Practice 2")
  })
})

describe("a flow drawn before the wallet picker existed", () => {
  it("reads back as pretend money, so nothing had to be migrated", () => {
    // Exactly the settings an older build wrote: the four numbers and not one
    // of the new fields.
    const old = {
      kind: tradeWalletNode.kind,
      settings: {
        startingUsd: 25_000,
        takerFeePct: 0.045,
        makerFeePct: 0.015,
        slippagePct: 0.05,
      },
    }
    const read = backtestSpecFromFlow(flowOf({ a: old, b: markets, c: ladder }))

    expect(read.problem).toBeNull()
    expect(read.spec?.wallet.startingUsd).toBe(25_000)
    expect(read.spec?.wallet.walletId).toBeNull()
  })
})
