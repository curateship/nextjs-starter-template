import type { AutomationCompiledConfig } from "@/lib/automations/compile"
import { parseMarketKey } from "@/lib/protocols/contracts"
import {
  tradeDcaNode,
  tradeDcaSettingsSchema,
  type TradeDcaSettings,
} from "@/lib/automations/nodes/trade-dca"
import {
  candlesPerCoin,
  coinsAllowedFor,
  tradeMarketsNode,
  tradeMarketsSettingsSchema,
  windowDays,
  windowProblem,
  type TradeMarketsSettings,
} from "@/lib/automations/nodes/trade-markets"
import {
  chosenWallet,
  tradeWalletNode,
  tradeWalletSettingsSchema,
  walletMoneyWords,
  type TradeWalletSettings,
} from "@/lib/automations/nodes/trade-wallet"

/**
 * Reading a backtest out of a drawn flow.
 *
 * The three steps hold everything a run needs, so this is the one place that
 * turns "what somebody drew" into "what to run". It never guesses: a flow
 * missing a step, or holding two of one, comes back as a sentence somebody can
 * act on rather than a run that quietly tested something else.
 *
 * Browser-safe on purpose. The panel that draws the flow and the server that
 * starts the run ask the same question of the same code, so the editor can say
 * what is wrong before anybody presses Run.
 */

/** Everything one backtest needs, read off the steps. */
export type BacktestSpec = {
  wallet: TradeWalletSettings
  markets: TradeMarketsSettings
  dca: TradeDcaSettings
}

export type BacktestSpecResult =
  | { spec: BacktestSpec; problem: null }
  | { spec: null; problem: string }

function stepsOfKind(config: AutomationCompiledConfig, kind: string) {
  return Object.entries(config.nodes).filter(
    ([, node]) => node.kind === kind
  )
}

/**
 * The backtest a compiled flow describes, or a plain-words reason it is not one.
 *
 * Deliberately silent about anything that is not a backtest step. A flow can
 * hold other steps beside these three — that is the app's own business — and
 * this only refuses when the three it needs are not there exactly once each.
 */
export function backtestSpecFromFlow(
  config: AutomationCompiledConfig
): BacktestSpecResult {
  const wallets = stepsOfKind(config, tradeWalletNode.kind)
  const markets = stepsOfKind(config, tradeMarketsNode.kind)
  const ladders = stepsOfKind(config, tradeDcaNode.kind)

  if (wallets.length === 0) {
    return { spec: null, problem: "Add a Wallet step to this flow." }
  }
  if (wallets.length > 1) {
    return {
      spec: null,
      problem:
        "This flow has two Wallet steps. A backtest spends one pot, so delete one of them.",
    }
  }
  if (markets.length === 0) {
    return {
      spec: null,
      problem: "Add a Markets to test step after the wallet.",
    }
  }
  if (markets.length > 1) {
    return {
      spec: null,
      problem:
        "This flow has two Markets to test steps. Put every coin on one of them and delete the other.",
    }
  }
  if (ladders.length === 0) {
    return { spec: null, problem: "Add a DCA ladder step after the markets." }
  }
  if (ladders.length > 1) {
    return {
      spec: null,
      problem:
        "This flow has two DCA ladder steps. A backtest tests one strategy, so delete one of them.",
    }
  }

  // Already strict-parsed at compile time, so a failure here means a saved flow
  // written by a different build. Refusing beats running half-read settings.
  const wallet = tradeWalletSettingsSchema.safeParse(wallets[0][1].settings)
  const market = tradeMarketsSettingsSchema.safeParse(markets[0][1].settings)
  const dca = tradeDcaSettingsSchema.safeParse(ladders[0][1].settings)

  if (!wallet.success) {
    return {
      spec: null,
      problem: "The Wallet step's settings could not be read. Open it and check the numbers.",
    }
  }

  // Asked before anything else about the flow, because it is not a complaint
  // about the flow — it is the wrong button. Somebody whose Wallet step names a
  // real account should not first be told their coin list is empty.
  const named = chosenWallet(wallet.data)
  if (named) {
    return {
      spec: null,
      problem:
        `This flow trades ${named.label} with ${walletMoneyWords(named.kind)}, so there is nothing to backtest. ` +
        "Set its Wallet step back to pretend money to test it.",
    }
  }

  if (!market.success) {
    return {
      spec: null,
      problem: "The Markets to test step needs at least one coin.",
    }
  }
  if (!dca.success) {
    return {
      spec: null,
      problem: "The DCA ladder step's settings could not be read. Open it and check the numbers.",
    }
  }

  const marketRefs = market.data.marketKeys.map(parseMarketKey)
  if (
    marketRefs.some(
      (ref) =>
        !ref ||
        ref.protocol !== market.data.protocol ||
        ref.network !== "mainnet"
    )
  ) {
    return {
      spec: null,
      problem:
        "Choose every coin from the exchange shown in the Markets step. Backtests use mainnet price history.",
    }
  }

  // Two dates that do not describe a stretch of time, before anything is
  // worked out from them.
  const dates = windowProblem(market.data)
  if (dates !== null) return { spec: null, problem: dates }

  // Coins × candles is what the run has to hold in memory at once, and only
  // here are both known: the coins and the window sit on one step, the candle
  // size on another. This refuses the shape that would take the process down,
  // not the shape that is merely slow — see `MAX_BACKTEST_CANDLES`.
  //
  // The length comes from `windowDays` rather than off the step, so a window
  // given as two dates is weighed the same as one given as a number. Reading
  // `days` here would have waved through two years of 5-minute candles any
  // time the dates were set and the number underneath still said 30.
  const days = windowDays(market.data)
  const allowed = coinsAllowedFor(dca.data.interval, days)
  if (market.data.marketKeys.length > allowed) {
    const each = candlesPerCoin(dca.data.interval, days)
    return {
      spec: null,
      problem:
        `That is ${market.data.marketKeys.length} coins of ${dca.data.interval} candles over ${days} days — about ${each.toLocaleString()} candles each, and every coin's candles are held in memory at once. ` +
        `Pick at most ${allowed} coins, shorten the window, or use a bigger candle.`,
    }
  }

  return {
    spec: {
      wallet: wallet.data,
      markets: market.data,
      // Always measured from the base, whatever a flow saved earlier says.
      //
      // Nobody clicks anything in a replay, so "the price you clicked" meant
      // "start the ladder wherever price happens to be" — the bar after the
      // last ladder finished. That put buys halfway up a rally with no floor
      // beneath them, and the run still produced real-looking numbers, which
      // is the dangerous part. The app this is a port of has no such choice at
      // all: its first rung is always measured from the base.
      // Rungs buy at the price they are set at, whatever a flow saved.
      //
      // Same reason as the anchor above: this was never a choice the panel
      // offered, so every flow simply carries whichever default was in force
      // the day it was saved. Waiting for a candle to CLOSE below a rung needs
      // to know what happened inside that candle, and a 4h bar cannot say — so
      // it filled a dump at whatever the bar opened at and buys piled up in
      // one spot. "You got the price you asked for" is the one assumption a 4h
      // replay can state honestly.
      dca: {
        ...dca.data,
        params: {
          ...dca.data.params,
          anchor: "base" as const,
          rungEntry: "limit" as const,
        },
      },
    },
    problem: null,
  }
}
