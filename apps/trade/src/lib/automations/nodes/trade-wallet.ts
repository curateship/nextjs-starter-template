import { WalletIcon } from "lucide-react"
import { z } from "zod"

import { defineNode } from "@/lib/automations/node-descriptor"
import { formatUsd } from "@/lib/trade/format"
import { MAKER_FEE_RATE, TAKER_FEE_RATE } from "@/lib/trade/paper"
import { WALLET_LABEL_MAX, type WalletKind } from "@/lib/trade/wallets"

/** The palette heading Trade's own steps sit under. */
export const TRADE_PALETTE_GROUP = "Trading"

/** What a backtest starts with when nobody has said otherwise. */
export const DEFAULT_BACKTEST_START_USD = 10_000

/**
 * How much worse a market order is assumed to fill, in percent, before anyone
 * touches the field.
 *
 * Not zero, deliberately. Stops and market buys really do fill a little past
 * the price that triggered them, and a test that assumes otherwise flatters
 * every stop it takes. A twentieth of a percent is small and honest; the field
 * is there so a thin coin can be given a bigger number.
 */
export const DEFAULT_SLIPPAGE_PCT = 0.05

/** Fees and slippage are typed as percents, so the field reads the way it looks. */
const pctSchema = z.number().min(0).max(5)

/** The most a pot — pretend or real — may be set to. */
export const MAX_POT_USD = 100_000_000

export const tradeWalletSettingsSchema = z.object({
  startingUsd: z.number().positive().max(MAX_POT_USD),
  takerFeePct: pctSchema,
  makerFeePct: pctSchema,
  slippagePct: pctSchema,
  /**
   * The saved wallet this flow trades, or null for pretend money.
   *
   * **This one field is the switch.** Null means a backtest — which is what
   * every flow drawn before this existed reads back as, so nothing had to be
   * migrated and no old flow changed behaviour. Anything else means the flow
   * trades forward against a wallet that really holds positions.
   */
  walletId: z.string().max(36).nullable().default(null),
  /**
   * The wallet's name, kept here only so the canvas card can say it.
   *
   * A copy, and never the truth: anything that acts on money looks the wallet
   * up by `walletId`, and nothing anywhere matches on this string. It exists
   * because a step's canvas card is drawn from its settings alone — the shell
   * calls `description(settings)` with nothing else and no way to wait for a
   * read — so without a copy the card could not name the wallet at all, and a
   * card that cannot say which wallet is about to be spent is worse than a
   * name that is a rename behind. The panel corrects it when it next opens.
   */
  walletLabel: z.string().max(WALLET_LABEL_MAX).nullable().default(null),
  /**
   * Practice or real, kept for the same reason as the label — but this one
   * cannot go stale. A wallet's kind is fixed when it is made; nothing in the
   * app can change it afterwards.
   */
  walletKind: z.enum(["paper", "live"]).nullable().default(null),
  /**
   * The exchange the wallet is on, and whether that is the real network or the
   * practice one.
   *
   * Copied for the same reason as the kind, and as safe: a wallet's exchange
   * and network are fixed when it is made — `updateWalletSchema` cannot change
   * either — so neither can drift. The Markets step reads them to offer the
   * coins this wallet could actually trade, without asking the exchange a
   * second time from a second panel.
   */
  walletProtocol: z.string().max(20).nullable().default(null),
  walletNetwork: z.enum(["mainnet", "testnet"]).nullable().default(null),
  /**
   * The most of that wallet this flow may spend, in dollars.
   *
   * Stands in for `startingUsd` once a wallet is named: it is the pot the
   * ladder's "most of the pot, per coin" is measured against, so every sum
   * already written for backtests carries straight over. It is **not** money
   * set aside — the rest of the wallet stays free and so does this, right up
   * until a buy actually happens.
   */
  spendCapUsd: z.number().positive().max(MAX_POT_USD).nullable().default(null),
})

export type TradeWalletSettings = z.infer<typeof tradeWalletSettingsSchema>

/** The wallet a flow trades, as much of it as the step itself remembers. */
export type ChosenWallet = {
  id: string
  label: string
  kind: WalletKind
  /** Null only on a flow edited by hand; the panel always writes one. */
  capUsd: number | null
  /**
   * Null on a flow saved before these were carried. The Wallet step fills them
   * in the next time it is opened, so nothing needs migrating; until then the
   * Markets step simply cannot narrow itself and says so.
   */
  protocol: string | null
  network: "mainnet" | "testnet" | null
}

/**
 * Which wallet this step names, or null when it spends pretend money.
 *
 * The one question everything else asks. Takes a loose shape so the panel can
 * ask it of half-read settings and the flow reader of parsed ones.
 */
export function chosenWallet(settings: {
  walletId?: unknown
  walletLabel?: unknown
  walletKind?: unknown
  spendCapUsd?: unknown
  walletProtocol?: unknown
  walletNetwork?: unknown
}): ChosenWallet | null {
  const id = settings.walletId
  if (typeof id !== "string" || id === "") return null
  return {
    id,
    label:
      typeof settings.walletLabel === "string" && settings.walletLabel !== ""
        ? settings.walletLabel
        : "a saved wallet",
    kind: settings.walletKind === "live" ? "live" : "paper",
    capUsd:
      typeof settings.spendCapUsd === "number" ? settings.spendCapUsd : null,
    protocol:
      typeof settings.walletProtocol === "string" &&
      settings.walletProtocol !== ""
        ? settings.walletProtocol
        : null,
    // Anything but the word "testnet" is the real network. A step that cannot
    // be read must not quietly become the practice one, where every price is
    // invented.
    network:
      settings.walletNetwork === "testnet"
        ? "testnet"
        : settings.walletNetwork === "mainnet"
          ? "mainnet"
          : null,
  }
}

/** "real money" or "practice money", for a sentence somebody has to act on. */
export function walletMoneyWords(kind: WalletKind): string {
  return kind === "live" ? "real money" : "practice money"
}

/**
 * The money a flow spends: pretend for a backtest, or one of your wallets.
 *
 * **This step is the switch, and it is deliberately the only one.** Name no
 * wallet and the flow is a backtest — it invents a wallet for the length of the
 * run and throws it away. Name one and the flow trades forward against a wallet
 * that really holds positions. Everything else about the flow is drawn the
 * same either way, which is the point: a strategy is proved and then run
 * without being rebuilt.
 *
 * The switch lives here rather than on the flow itself because the money is
 * the only thing that actually differs, and because a person about to spend
 * has to be looking at the wallet's name when they decide.
 *
 * Every chosen coin shares this one pot. That is the whole reason the wallet is
 * a step of its own rather than a number on the ladder: twenty coins each
 * starting with $10,000 is not a strategy anybody could run.
 */
export const tradeWalletNode = defineNode({
  kind: "tradeWallet",
  palette: {
    key: "trade-wallet",
    group: TRADE_PALETTE_GROUP,
    description: "Pretend money, or one of your wallets",
  },
  createSettings: () => ({
    startingUsd: DEFAULT_BACKTEST_START_USD,
    takerFeePct: TAKER_FEE_RATE * 100,
    makerFeePct: MAKER_FEE_RATE * 100,
    slippagePct: DEFAULT_SLIPPAGE_PCT,
    walletId: null,
    walletLabel: null,
    walletKind: null,
    walletProtocol: null,
    walletNetwork: null,
    spendCapUsd: null,
  }),
  settingsSchema: tradeWalletSettingsSchema,
  name: () => "Wallet",
  description: (settings) => {
    const wallet = chosenWallet(settings)
    if (wallet) {
      // Real money says so first, in capitals, before anything else on the
      // card. A live flow must be impossible to mistake for a backtest at a
      // glance, and this line is the glance.
      const lead = wallet.kind === "live" ? "REAL MONEY — " : ""
      const money = walletMoneyWords(wallet.kind)
      if (wallet.capUsd === null) {
        return `${lead}Trades ${wallet.label} — ${money}. Say how much of it this flow may use.`
      }
      // The cap is a ceiling, never a promise of money. "Up to $10,000 of
      // real money" on a wallet holding $900 read as the flow having ten
      // thousand to spend; what it spends is the SMALLER of the cap and what
      // the wallet actually holds.
      return `${lead}Trades ${wallet.label} — ${money}, capped at ${formatUsd(wallet.capUsd)}. It can never spend more than the wallet holds.`
    }
    const starting =
      typeof settings.startingUsd === "number" ? settings.startingUsd : null
    if (starting === null) return "Pretend money for a backtest to spend."
    return `Starts with ${formatUsd(starting)} of pretend money, shared by every coin.`
  },
  icon: WalletIcon,
  outputPorts: [{ id: "then", label: "Then" }],
  hasInput: true,
  connectionError: () => null,
  fields: () => import("@/components/automations/nodes/trade-wallet-panel"),
})

/**
 * The costs on this step, as the fractions the engine works in.
 *
 * Takes only the three it reads, so a saved run's snapshot can be handed
 * straight in without inventing the rest of a wallet step around it.
 */
export function walletCostRates(settings: {
  takerFeePct: number
  makerFeePct: number
  slippagePct: number
}) {
  return {
    takerFeeRate: settings.takerFeePct / 100,
    makerFeeRate: settings.makerFeePct / 100,
    slippageRate: settings.slippagePct / 100,
  }
}
