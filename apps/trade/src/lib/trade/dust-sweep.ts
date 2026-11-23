import type { NetworkId, ProtocolId } from "@/lib/protocols/contracts"
import { formatUsd } from "@/lib/trade/format"

/**
 * The leftover sweep: small coin balances in a chain wallet swapped back into
 * the wallet's dollar coin, one coin at a time. `workspace/docs/wallets/dust-sweeper.md`
 * says what it does and why; this file holds the two rules it lives by, so
 * the preview and the sweep can never judge one coin differently.
 */

/** The chains whose wallets hold coins outright and swap them back. */
const SWEEP_CHAINS: Partial<Record<ProtocolId, "USDC" | "USDT">> = {
  solana: "USDC",
  // BNB Chain's swaps buy with and sell into USDT, so that is what comes back.
  bnb: "USDT",
}

export const DEFAULT_LEFTOVER_LIMIT_USD = 25
export const MAX_LEFTOVER_LIMIT_USD = 1000

/** The dollar coin a sweep turns leftovers into, or null where there is no sweep. */
export function sweepDollarCoin(wallet: {
  kind: string
  protocol: ProtocolId
  network: NetworkId
}): "USDC" | "USDT" | null {
  if (wallet.kind !== "live" || wallet.network !== "mainnet") return null
  return SWEEP_CHAINS[wallet.protocol] ?? null
}

export type LeftoverRow = {
  marketKey: string
  coins: number
  /** What the coins are worth at the wallet's last price. Null with no price. */
  valueUsd: number | null
  /** What the swap loses: the route's cut and price move, plus the chain's fee. */
  feeUsd: number | null
  /** Dollars the quote says come back. */
  backUsd: number | null
  verdict: "sweep" | "skip"
  /** Why a skipped coin is skipped, in a sentence. */
  reason: string | null
}

export type DustSweepPreview = {
  rows: LeftoverRow[]
  dollarCoin: "USDC" | "USDT"
  /** Both real-money switches: the server's lock and the Settings switch. */
  realMoneyOn: boolean
}

export type DustSweepResult =
  | { status: "swept"; backUsd: number | null }
  | { status: "skipped"; reason: string }

/**
 * The fee rule. A coin is swapped only when what the swap costs is at most
 * half of what the coin is worth.
 *
 * The cost is the gap between the coin's worth and the dollars quoted back,
 * which holds the router's fee and the price the swap moves, plus the chain's
 * own fee for sending it. A quote that pays more than the last price is not a
 * negative fee: the gap counts as zero.
 */
export function judgeLeftover(input: {
  valueUsd: number
  backUsd: number
  networkFeeUsd: number
}): Pick<LeftoverRow, "feeUsd" | "verdict" | "reason"> {
  const feeUsd =
    Math.max(0, input.valueUsd - input.backUsd) + input.networkFeeUsd
  if (feeUsd > input.valueUsd / 2) {
    return {
      feeUsd,
      verdict: "skip",
      reason: `The fee, about ${feeUsd < 0.01 ? "under $0.01" : formatUsd(feeUsd)}, is more than half of the ${formatUsd(input.valueUsd)} it is worth.`,
    }
  }
  return { feeUsd, verdict: "sweep", reason: null }
}

/** One holding as the wallet read reports it. */
export type HeldCoin = {
  marketKey: string
  marketId: string
  coins: number
  /** The wallet's current price for the coin, or null when it has none. */
  price: number | null
}

/**
 * The holdings that count as leftovers: worth more than nothing and less than
 * the limit. Coins in `keep` never count: the coin that pays the chain's fees,
 * and a dollar coin that is already dollars. A coin with no price cannot be
 * measured against the limit, so it is listed as skipped rather than guessed.
 */
export function leftoverCoins(
  held: readonly HeldCoin[],
  limitUsd: number,
  keep: ReadonlySet<string>
): { measured: (HeldCoin & { price: number; valueUsd: number })[]; unpriced: LeftoverRow[] } {
  const measured: (HeldCoin & { price: number; valueUsd: number })[] = []
  const unpriced: LeftoverRow[] = []
  for (const coin of held) {
    if (!(coin.coins > 0) || keep.has(coin.marketId)) continue
    if (coin.price === null || !(coin.price > 0)) {
      unpriced.push({
        marketKey: coin.marketKey,
        coins: coin.coins,
        valueUsd: null,
        feeUsd: null,
        backUsd: null,
        verdict: "skip",
        reason: "There is no price for this coin, so its worth is unknown.",
      })
      continue
    }
    const valueUsd = coin.coins * coin.price
    if (valueUsd < limitUsd) measured.push({ ...coin, price: coin.price, valueUsd })
  }
  measured.sort((a, b) => a.valueUsd - b.valueUsd)
  return { measured, unpriced }
}
