import { WalletIcon } from "lucide-react"
import { z } from "zod"

import { defineNode } from "@/lib/automations/node-descriptor"
import { formatUsd } from "@/lib/trade/format"
import { MAKER_FEE_RATE, TAKER_FEE_RATE } from "@/lib/trade/paper"

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

export const tradeWalletSettingsSchema = z.object({
  startingUsd: z.number().positive().max(100_000_000),
  takerFeePct: pctSchema,
  makerFeePct: pctSchema,
  slippagePct: pctSchema,
})

export type TradeWalletSettings = z.infer<typeof tradeWalletSettingsSchema>

/**
 * The pretend wallet a backtest spends: a starting pot, and what trading costs.
 *
 * **Pretend money only.** A real wallet and a practice wallet both hold
 * positions that exist; a backtest invents a wallet for the length of the run
 * and throws it away. Letting it point at either of the real ones would mean a
 * test could move money, and that is not a mistake worth being one keystroke
 * away from. When a flow can be switched on for real, this same step is where a
 * real wallet gets picked — and it will say so.
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
    description: "The pretend pot a backtest spends",
  },
  createSettings: () => ({
    startingUsd: DEFAULT_BACKTEST_START_USD,
    takerFeePct: TAKER_FEE_RATE * 100,
    makerFeePct: MAKER_FEE_RATE * 100,
    slippagePct: DEFAULT_SLIPPAGE_PCT,
  }),
  settingsSchema: tradeWalletSettingsSchema,
  name: () => "Pretend wallet",
  description: (settings) => {
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

/** The costs on this step, as the fractions the engine works in. */
export function walletCostRates(settings: TradeWalletSettings) {
  return {
    takerFeeRate: settings.takerFeePct / 100,
    makerFeeRate: settings.makerFeePct / 100,
    slippageRate: settings.slippagePct / 100,
  }
}
