import { z } from "zod"
import {
  decodeFunctionData,
  formatUnits,
  parseAbi,
  type Address,
  type Hex,
} from "viem"
import type { SwapQuote } from "@/lib/protocols/contracts"
import { BNB_USDT, reserveBnbRequest } from "./client"
import { bnbRefused, bnbRefusalError, kyberRefusalCode } from "./refusals"
import {
  requestSignal,
  READ_TIMEOUT_MS,
} from "@/server/protocols/request-timeout"

export const DEFAULT_BNB_SLIPPAGE = 0.005
export const KYBER_CLIENT_ID = "nodabot-trade"
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
export type BnbRoute = {
  quote: SwapQuote
  summary: z.infer<typeof summarySchema>
  router: Address
}

/** Truncate decimal text before integer arithmetic; never round a spend up. */
export function bnbUnits(amount: number, decimals: number): bigint {
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
export function bnbSlippage(value: number | null | undefined): number {
  const cap = value ?? DEFAULT_BNB_SLIPPAGE
  if (!Number.isFinite(cap) || cap < 0 || cap > 0.5)
    throw bnbRefused("Enter a worst-fill allowance between 0 and 50 percent.")
  return Math.floor(cap * 10_000) / 10_000
}

/** Unsigned quote/build only. One 429 retry, charged to the same allowance. */
export async function kyberRequest(
  path: "routes" | "route/build",
  params: Record<string, string> | Record<string, unknown>,
  priority: "read" | "order"
): Promise<unknown> {
  const url = new URL(`https://aggregator-api.kyberswap.com/bsc/api/v1/${path}`)
  if (path === "routes")
    for (const [key, value] of Object.entries(params))
      url.searchParams.set(key, String(value))
  async function send(): Promise<Response> {
    try {
      reserveBnbRequest("kyber", priority)
    } catch {
      throw bnbRefusalError("kyber-busy")
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
      throw bnbRefusalError("unknown")
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
    throw bnbRefusalError("kyber-busy")
  }
  let body: unknown
  try {
    body = await response.json()
  } catch {
    throw bnbRefusalError("unknown")
  }
  const refusal = kyberRefusalCode(body)
  if (refusal || !response.ok) throw bnbRefusalError(refusal ?? "unknown")
  return body
}

export function parseBnbRoute(
  raw: unknown,
  input: {
    token: Address
    side: "buy" | "sell"
    amount: bigint
    decimals: number
    px: number | null
    slippage: number
  }
): BnbRoute {
  const refusalCode = kyberRefusalCode(raw)
  if (refusalCode) throw bnbRefusalError(refusalCode)
  const result = routeSchema.safeParse(raw)
  if (!result.success)
    throw bnbRefused(
      "KyberSwap did not return a usable route. Nothing was signed."
    )
  const { routeSummary: summary, routerAddress: router } = result.data.data
  const buy = input.side === "buy"
  if (
    summary.tokenIn !== (buy ? BNB_USDT : input.token) ||
    summary.tokenOut !== (buy ? input.token : BNB_USDT) ||
    BigInt(summary.amountIn) !== input.amount ||
    BigInt(summary.amountOut) <= 0n ||
    /^0x0{40}$/.test(router)
  )
    throw bnbRefused(
      "KyberSwap returned a route for different coins or amounts. Nothing was signed."
    )
  const sz = Number(
    formatUnits(
      BigInt(buy ? summary.amountOut : summary.amountIn),
      input.decimals
    )
  )
  const usd = Number(
    formatUnits(BigInt(buy ? summary.amountIn : summary.amountOut), 18)
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

// ABI from the verified MetaAggregationRouterV2 contract. Router addresses
// still come from each fresh API response; no deployed address is pinned here.
export const kyberSwapAbi = parseAbi([
  "struct Description { address srcToken; address dstToken; address[] srcReceivers; uint256[] srcAmounts; address[] feeReceivers; uint256[] feeAmounts; address dstReceiver; uint256 amount; uint256 minReturnAmount; uint256 flags; bytes permit; }",
  "struct Execution { address callTarget; address approveTarget; bytes targetData; Description desc; bytes clientData; }",
  "function swap(Execution execution) payable returns (uint256 returnAmount, uint256 gasUsed)",
  "function swapSimpleMode(address caller, Description desc, bytes executorData, bytes clientData) returns (uint256 returnAmount, uint256 gasUsed)",
])
export function validateBnbBuild(
  raw: unknown,
  route: BnbRoute,
  wallet: Address,
  slippage: number
): { data: Hex; router: Address; amountOut: bigint } {
  const refusalCode = kyberRefusalCode(raw)
  if (refusalCode) throw bnbRefusalError(refusalCode)
  const parsed = buildSchema.safeParse(raw)
  if (!parsed.success)
    throw bnbRefused(
      "KyberSwap could not build a readable transaction. Nothing was signed."
    )
  const build = parsed.data.data
  try {
    const call = decodeFunctionData({ abi: kyberSwapAbi, data: build.data })
    const desc = call.functionName === "swap" ? call.args[0].desc : call.args[1]
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
    throw bnbRefused(
      "The built transaction does not match the approved coins, recipient, amount or worst fill. Nothing was signed."
    )
  }
}
