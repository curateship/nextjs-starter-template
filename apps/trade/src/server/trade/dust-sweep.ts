import { marketKey as marketKeyOf } from "@/lib/protocols/contracts"
import {
  judgeLeftover,
  leftoverCoins,
  sweepDollarCoin,
  type DustSweepPreview,
  type DustSweepResult,
  type LeftoverRow,
} from "@/lib/trade/dust-sweep"
import { BNB_USDC } from "@/server/protocols/bnb/account"
import { getProtocol, ordersOf } from "@/server/protocols/registry"
import { SOL_MINT } from "@/server/protocols/solana/account"
import {
  closeLivePosition,
  liveWallet,
  type LiveWalletRow,
} from "@/server/trade/live-orders"
import { realMoneySwitch } from "@/server/trade/workers"

/**
 * The leftover sweep's two server steps. See `lib/trade/dust-sweep.ts` for the
 * rules and `workspace/docs/wallets/dust-sweeper.md` for the behaviour.
 *
 * Nothing here signs anything of its own. The preview only reads and quotes,
 * and each coin's sale goes through `closeLivePosition`, the same path the
 * positions table's Close button takes, so the real-money switches, the
 * refusal sentences and the Journal row all come from there.
 */

/**
 * Never swept: SOL pays every Solana fee, and BNB Chain's USDC is already
 * dollars. BNB itself pays BNB Chain's fees and is never listed as a holding.
 */
const KEEP = new Set<string>([SOL_MINT, BNB_USDC])

/**
 * The same price limit a close uses, so a coin the preview passes is a coin
 * the close would also take.
 */
const SWEEP_SLIPPAGE = 0.005

function sweepableWallet(row: LiveWalletRow) {
  if (!sweepDollarCoin({ kind: row.kind, protocol: row.protocol, network: row.network }))
    throw new Error("DUST_SWEEP_UNSUPPORTED")
}

/** Every leftover in the wallet, quoted and judged, smallest first. */
async function judgedLeftovers(
  row: LiveWalletRow,
  limitUsd: number,
  describeError: (error: unknown) => string,
  only?: string
): Promise<LeftoverRow[]> {
  const orders = ordersOf(getProtocol(row.protocol))
  const quoteSale = orders.quote
  if (!quoteSale) throw new Error("DUST_SWEEP_UNSUPPORTED")
  const portfolio = await orders.portfolio(row.network, row.address ?? "", () => null)
  const held = portfolio.positions.map((one) => ({
    marketKey: marketKeyOf({
      protocol: row.protocol,
      network: row.network,
      marketId: one.marketId,
    }),
    marketId: one.marketId,
    coins: one.szi,
    // On a chain wallet the entry field holds today's price: the chain does
    // not remember what was paid (`solana/account.ts`, `evm-chain/balances.ts`).
    price: one.owned?.priced === false ? null : one.entryPx,
  }))
  const { measured, unpriced } = leftoverCoins(
    only ? held.filter((one) => one.marketKey === only) : held,
    limitUsd,
    KEEP
  )
  const rows: LeftoverRow[] = []
  // One at a time: the quotes share the venue's read allowance with every
  // chart and wallet on the page.
  for (const coin of measured) {
    try {
      const quote = await quoteSale(row.network, row.address ?? "", {
        marketId: coin.marketId,
        side: "sell",
        sz: coin.coins,
        // A close sells at today's price with no floor. The smallest price
        // there is never trips the quote's price check, and a sell is sized
        // in coins, so the preview asks exactly what the close will.
        px: Number.MIN_VALUE,
        slippage: SWEEP_SLIPPAGE,
      })
      if (quote.refusal) {
        rows.push({
          marketKey: coin.marketKey,
          coins: coin.coins,
          valueUsd: coin.valueUsd,
          feeUsd: null,
          backUsd: null,
          verdict: "skip",
          reason: quote.refusal,
        })
        continue
      }
      rows.push({
        marketKey: coin.marketKey,
        coins: coin.coins,
        valueUsd: coin.valueUsd,
        backUsd: quote.usd,
        ...judgeLeftover({
          valueUsd: coin.valueUsd,
          backUsd: quote.usd,
          networkFeeUsd: quote.networkFeeUsd ?? 0,
        }),
      })
    } catch (error) {
      rows.push({
        marketKey: coin.marketKey,
        coins: coin.coins,
        valueUsd: coin.valueUsd,
        feeUsd: null,
        backUsd: null,
        verdict: "skip",
        reason: describeError(error),
      })
    }
  }
  return [...rows, ...unpriced]
}

export async function previewDustSweep(
  userId: string,
  walletId: string,
  limitUsd: number,
  describeError: (error: unknown) => string
): Promise<DustSweepPreview> {
  const row = await liveWallet(userId, walletId)
  sweepableWallet(row)
  const [rows, real] = await Promise.all([
    judgedLeftovers(row, limitUsd, describeError),
    realMoneySwitch(),
  ])
  return {
    rows,
    dollarCoin: sweepDollarCoin(row)!,
    realMoneyOn: real.masterAllowed && real.enabled,
  }
}

/**
 * One coin's sale. The coin is read, quoted and judged again first, because
 * the price may have moved since the preview: a coin that now costs more than
 * half its worth to swap, or is no longer under the limit, is skipped rather
 * than sold. A refused sale throws, in the close path's own words.
 */
export async function sweepDustCoin(
  userId: string,
  input: { walletId: string; marketKey: string; limitUsd: number },
  describeError: (error: unknown) => string
): Promise<DustSweepResult> {
  const row = await liveWallet(userId, input.walletId)
  sweepableWallet(row)
  const [judged] = await judgedLeftovers(
    row,
    input.limitUsd,
    describeError,
    input.marketKey
  )
  if (!judged)
    return {
      status: "skipped",
      reason: "This wallet no longer holds a leftover of this coin.",
    }
  if (judged.verdict === "skip")
    return { status: "skipped", reason: judged.reason ?? "Skipped." }
  const closed = await closeLivePosition(userId, {
    walletId: input.walletId,
    marketKey: input.marketKey,
  })
  return {
    status: "swept",
    backUsd:
      closed.avgPx !== null && closed.filledSz !== null
        ? closed.avgPx * closed.filledSz
        : null,
  }
}
