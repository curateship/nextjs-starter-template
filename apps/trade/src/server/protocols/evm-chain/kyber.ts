import { z } from "zod"
import {
  decodeFunctionData,
  formatUnits,
  parseAbi,
  type Address,
  type Hex,
} from "viem"
import type { SwapQuote } from "@/lib/protocols/contracts"
import {
  evmRefused,
  kyberRefusalCode,
  type EvmRefusals,
} from "./refusals"
import {
  requestSignal,
  READ_TIMEOUT_MS,
} from "@/server/protocols/request-timeout"

const DEFAULT_SLIPPAGE = 0.005
/** Named on every request, because KyberSwap limits anonymous callers harder. */
export const KYBER_CLIENT_ID = "nodabot-trade"

/** What KyberSwap needs to know about one chain. */
type KyberChain = {
  /** The chain's aggregator address, ending in `/api/v1/`. */
  api: string
  /** Counts one request against the chain's KyberSwap allowance, or throws. */
  reserve(priority: "read" | "order"): void
  /** The dollar coin every swap buys with or sells into. */
  dollarCoin: Address
  dollarDecimals: number
  refusals: EvmRefusals
}

const address = z
  .string()
  .regex(/^0x[\da-f]{40}$/i)
  .transform((s) => s.toLowerCase() as Address)
const integer = z.string().regex(/^\d+$/)
const dollars = z
  .string()
  .refine((value) => Number.isFinite(Number(value)) && Number(value) > 0)
const summarySchema = z
  .object({
    tokenIn: address,
    tokenOut: address,
    amountIn: integer,
    amountOut: integer,
    amountInUsd: dollars,
    amountOutUsd: dollars,
    route: z.array(
      z.array(z.object({ exchange: z.string().min(1).max(100) }).passthrough())
    ),
  })
  .passthrough()
const routeSchema = z.object({
  code: z.literal(0),
  data: z.object({ routeSummary: summarySchema, routerAddress: address }),
})
const buildSchema = z.object({
  code: z.literal(0),
  data: z.object({
    amountIn: integer,
    amountOut: integer,
    routerAddress: address,
    data: z
      .string()
      .regex(/^0x(?:[\da-f]{2})+$/i)
      .transform((s) => s as Hex),
    transactionValue: integer,
  }),
})
export type KyberRoute = {
  quote: SwapQuote
  summary: z.infer<typeof summarySchema>
  router: Address
}
export type KyberRouteInput = {
  token: Address
  side: "buy" | "sell"
  amount: bigint
  decimals: number
  px: number | null
  slippage: number
}

/** Truncate decimal text before integer arithmetic; never round a spend up. */
export function evmUnits(amount: number, decimals: number): bigint {
  if (
    !Number.isFinite(amount) ||
    amount < 0 ||
    !Number.isInteger(decimals) ||
    decimals < 0 ||
    decimals > 255
  )
    throw new Error("LIVE_SIZE")
  const [mantissa, exponent = "0"] = String(amount).split("e")
  const [whole, fraction = ""] = mantissa.split(".")
  const digits = whole + fraction
  const shift = Number(exponent) + decimals - fraction.length
  return BigInt(
    shift >= 0
      ? digits + "0".repeat(shift)
      : digits.slice(0, Math.max(0, digits.length + shift)) || "0"
  )
}
export function evmSlippage(value: number | null | undefined): number {
  const cap = value ?? DEFAULT_SLIPPAGE
  if (!Number.isFinite(cap) || cap < 0 || cap > 0.5)
    throw evmRefused("Enter a worst-fill allowance between 0 and 50 percent.")
  return Math.floor(cap * 10_000) / 10_000
}

// ABI from the verified MetaAggregationRouterV2 contract. Router addresses
// still come from each fresh API response; no deployed address is pinned here.
export const kyberSwapAbi = parseAbi([
  "struct Description { address srcToken; address dstToken; address[] srcReceivers; uint256[] srcAmounts; address[] feeReceivers; uint256[] feeAmounts; address dstReceiver; uint256 amount; uint256 minReturnAmount; uint256 flags; bytes permit; }",
  "struct Execution { address callTarget; address approveTarget; bytes targetData; Description desc; bytes clientData; }",
  "function swap(Execution execution) payable returns (uint256 returnAmount, uint256 gasUsed)",
  "function swapSimpleMode(address caller, Description desc, bytes executorData, bytes clientData) returns (uint256 returnAmount, uint256 gasUsed)",
])

/** KyberSwap's quote, build and the checks on both, for one chain. */
export function kyberSwap(chain: KyberChain) {
  const { refusals, dollarCoin, dollarDecimals } = chain

  /** Unsigned quote/build only. One 429 retry, charged to the same allowance. */
  async function request(
    path: "routes" | "route/build",
    params: Record<string, string> | Record<string, unknown>,
    priority: "read" | "order"
  ): Promise<unknown> {
    const url = new URL(path, chain.api)
    if (path === "routes")
      for (const [key, value] of Object.entries(params))
        url.searchParams.set(key, String(value))
    async function send(): Promise<Response> {
      try {
        chain.reserve(priority)
      } catch {
        throw refusals.error("kyber-busy")
      }
      try {
        return await fetch(url, {
          method: path === "routes" ? "GET" : "POST",
          headers: {
            "X-Client-Id": KYBER_CLIENT_ID,
            "Content-Type": "application/json",
            accept: "application/json",
          },
          ...(path === "route/build" ? { body: JSON.stringify(params) } : {}),
          redirect: "error",
          signal: requestSignal(READ_TIMEOUT_MS),
        })
      } catch {
        throw refusals.error("unknown")
      }
    }
    let response = await send()
    if (response.status === 429) {
      const seconds = Number(response.headers.get("retry-after"))
      const delay =
        Number.isFinite(seconds) && seconds > 0
          ? Math.min(seconds * 1000, 5000)
          : 1000
      await response.body?.cancel()
      await new Promise((resolve) => setTimeout(resolve, delay))
      response = await send()
    }
    if (response.status === 429) {
      await response.body?.cancel()
      throw refusals.error("kyber-busy")
    }
    let body: unknown
    try {
      body = await response.json()
    } catch {
      throw refusals.error("unknown")
    }
    const refusal = kyberRefusalCode(body)
    if (refusal || !response.ok) throw refusals.error(refusal ?? "unknown")
    return body
  }

  function parseRoute(raw: unknown, input: KyberRouteInput): KyberRoute {
    const refusalCode = kyberRefusalCode(raw)
    if (refusalCode) throw refusals.error(refusalCode)
    const result = routeSchema.safeParse(raw)
    if (!result.success)
      throw evmRefused(
        "KyberSwap did not return a usable route. Nothing was signed."
      )
    const { routeSummary: summary, routerAddress: router } = result.data.data
    const buy = input.side === "buy"
    if (
      summary.tokenIn !== (buy ? dollarCoin : input.token) ||
      summary.tokenOut !== (buy ? input.token : dollarCoin) ||
      BigInt(summary.amountIn) !== input.amount ||
      BigInt(summary.amountOut) <= 0n ||
      /^0x0{40}$/.test(router)
    )
      throw evmRefused(
        "KyberSwap returned a route for different coins or amounts. Nothing was signed."
      )
    const sz = Number(
      formatUnits(
        BigInt(buy ? summary.amountOut : summary.amountIn),
        input.decimals
      )
    )
    const usd = Number(
      formatUnits(
        BigInt(buy ? summary.amountIn : summary.amountOut),
        dollarDecimals
      )
    )
    if (!(sz > 0 && usd > 0) || !Number.isFinite(usd / sz))
      throw new Error("LIVE_SIZE")
    // Kyber supplies the two dollar valuations, not a priceImpact field.
    const priceImpact = Math.max(
      0,
      1 - Number(summary.amountOutUsd) / Number(summary.amountInUsd)
    )
    const price = usd / sz
    let refusal: string | null = null
    if (priceImpact > input.slippage)
      refusal =
        "This swap's price impact exceeds the worst-fill allowance. Lower the size or adjust the allowance."
    if (
      input.px !== null &&
      (buy
        ? price > input.px * (1 + input.slippage)
        : price < input.px * (1 - input.slippage))
    )
      refusal =
        "KyberSwap's quote is worse than the order price allows. Nothing was signed. Wait for the price or adjust the order."
    return {
      summary,
      router,
      quote: {
        provider: "KyberSwap",
        sz,
        usd,
        price,
        priceImpact,
        route:
          [...new Set(summary.route.flat().map((hop) => hop.exchange))].join(
            " → "
          ) || "KyberSwap",
        refusal,
      },
    }
  }

  function validateBuild(
    raw: unknown,
    route: KyberRoute,
    wallet: Address,
    slippage: number
  ): { data: Hex; router: Address; amountOut: bigint } {
    const refusalCode = kyberRefusalCode(raw)
    if (refusalCode) throw refusals.error(refusalCode)
    const parsed = buildSchema.safeParse(raw)
    if (!parsed.success)
      throw evmRefused(
        "KyberSwap could not build a readable transaction. Nothing was signed."
      )
    const build = parsed.data.data
    try {
      const call = decodeFunctionData({ abi: kyberSwapAbi, data: build.data })
      const desc =
        call.functionName === "swap" ? call.args[0].desc : call.args[1]
      // Kyber can round the build output down one atom from the route output.
      const minimum =
        (BigInt(route.summary.amountOut) *
          BigInt(10_000 - Math.floor(slippage * 10_000))) /
        10_000n
      if (
        build.routerAddress !== route.router ||
        build.amountIn !== route.summary.amountIn ||
        build.transactionValue !== "0" ||
        BigInt(build.amountOut) < minimum ||
        desc.srcToken.toLowerCase() !== route.summary.tokenIn ||
        desc.dstToken.toLowerCase() !== route.summary.tokenOut ||
        desc.dstReceiver.toLowerCase() !== wallet.toLowerCase() ||
        desc.amount !== BigInt(route.summary.amountIn) ||
        desc.minReturnAmount + 1n < minimum ||
        (desc.flags & 1n) !== 0n ||
        desc.srcAmounts.reduce((sum, n) => sum + n, 0n) !== desc.amount ||
        desc.permit !== "0x" ||
        desc.feeAmounts.some((n) => n !== 0n)
      )
        throw new Error()
      return {
        data: build.data,
        router: build.routerAddress,
        amountOut: BigInt(build.amountOut),
      }
    } catch {
      throw evmRefused(
        "The built transaction does not match the approved coins, recipient, amount or worst fill. Nothing was signed."
      )
    }
  }

  return { request, parseRoute, validateBuild }
}
