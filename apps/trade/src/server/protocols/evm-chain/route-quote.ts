import { formatUnits } from "viem"
import type { SwapQuote } from "@/lib/protocols/contracts"
import type { KyberRouteInput } from "./kyber"

/**
 * One router's route, in the words the order window shows: coins, dollars,
 * price, price impact, and a refusal when the route breaks the order's rules.
 * Every router's route is judged by this one function, so two routers can
 * never disagree about what "too much impact" means.
 */
export function routeQuote(input: {
  provider: string
  /** The pools the route passes through, in order. */
  pools: readonly string[]
  swap: KyberRouteInput
  dollarDecimals: number
  amountIn: bigint
  amountOut: bigint
  /** The router's own dollar valuations of each side. */
  inUsd: number
  outUsd: number
}): SwapQuote {
  const { swap } = input
  const buy = swap.side === "buy"
  const sz = Number(
    formatUnits(buy ? input.amountOut : input.amountIn, swap.decimals)
  )
  const usd = Number(
    formatUnits(buy ? input.amountIn : input.amountOut, input.dollarDecimals)
  )
  if (!(sz > 0 && usd > 0) || !Number.isFinite(usd / sz))
    throw new Error("LIVE_SIZE")
  // Routers supply the two dollar valuations, not a price impact figure.
  const priceImpact = Math.max(0, 1 - input.outUsd / input.inUsd)
  const price = usd / sz
  let refusal: string | null = null
  if (priceImpact > swap.slippage)
    refusal =
      "This swap's price impact exceeds the worst-fill allowance. Lower the size or adjust the allowance."
  if (
    swap.px !== null &&
    (buy
      ? price > swap.px * (1 + swap.slippage)
      : price < swap.px * (1 - swap.slippage))
  )
    refusal = `${input.provider}'s quote is worse than the order price allows. Nothing was signed. Wait for the price or adjust the order.`
  return {
    provider: input.provider,
    sz,
    usd,
    price,
    priceImpact,
    route: [...new Set(input.pools)].join(" → ") || input.provider,
    refusal,
  }
}
