import { z } from "zod"
import { decodeFunctionData, parseAbi, type Address, type Hex } from "viem"
import {
  READ_TIMEOUT_MS,
  requestSignal,
} from "@/server/protocols/request-timeout"
import type { KyberRouteInput } from "./kyber"
import { evmRefused, type EvmRefusals } from "./refusals"
import { routeQuote } from "./route-quote"
import type { SwapRouter } from "./swap"

/**
 * Velora's router (AugustusV6), at the same address on every chain it serves.
 * Pinned, so a response naming any other contract is refused.
 */
const AUGUSTUS_V6 = "0x6a000f20005980200259b80c5102003040001068"
/** Low 14 bits of `partnerAndFee` are the partner's fee in basis points. */
const FEE_BITS = 0x3fffn

/** From the verified AugustusV6 contract. Only the general swap is asked for. */
const augustusAbi = parseAbi([
  "struct GenericData { address srcToken; address destToken; uint256 fromAmount; uint256 toAmount; uint256 quotedAmount; bytes32 metadata; address beneficiary; }",
  "function swapExactAmountIn(address executor, GenericData swapData, uint256 partnerAndFee, bytes permit, bytes executorData) payable returns (uint256 receivedAmount, uint256 paraswapShare, uint256 partnerShare)",
])

/** What Velora needs to know about one chain. */
type VeloraChain = {
  /** Velora's API address, without a trailing slash. */
  api: string
  /** The chain id Velora knows the chain by. */
  network: number
  /**
   * The partner name sent with every request. With a name of our own,
   * Velora builds the swap with no partner and no partner fee; left out,
   * it adds its default partner's 0.01%.
   */
  partner: string
  /** Counts one request against the chain's Velora allowance, or throws. */
  reserve(priority: "read" | "order"): void
  dollarCoin: Address
  dollarDecimals: number
  refusals: EvmRefusals
}

const address = z
  .string()
  .regex(/^0x[\da-f]{40}$/i)
  .transform((value) => value.toLowerCase() as Address)
const integer = z.string().regex(/^\d+$/)
const dollars = z
  .string()
  .refine((value) => Number.isFinite(Number(value)) && Number(value) > 0)
const priceRouteSchema = z
  .object({
    srcToken: address,
    destToken: address,
    srcAmount: integer,
    destAmount: integer,
    srcUSD: dollars,
    destUSD: dollars,
    contractAddress: address,
    contractMethod: z.string(),
    bestRoute: z.array(
      z
        .object({
          swaps: z.array(
            z
              .object({
                swapExchanges: z.array(
                  z.object({ exchange: z.string().min(1).max(100) }).passthrough()
                ),
              })
              .passthrough()
          ),
        })
        .passthrough()
    ),
  })
  .passthrough()
const pricesSchema = z.object({ priceRoute: priceRouteSchema })
const buildSchema = z.object({
  to: address,
  value: z.string(),
  data: z
    .string()
    .regex(/^0x(?:[\da-f]{2})+$/i)
    .transform((value) => value as Hex),
})

/** Velora's error sentences, as codes this app already has words for. */
function veloraRefusal(refusals: EvmRefusals, body: unknown): Error {
  const text =
    body && typeof body === "object" && "error" in body
      ? String((body as { error: unknown }).error).slice(0, 500)
      : ""
  if (/no routes?|liquidity/i.test(text))
    return refusals.error("no-route", { router: "Velora" })
  if (/token.*(not found|not supported|invalid)|invalid.*token/i.test(text))
    return refusals.error("unknown-token", { router: "Velora" })
  if (/too (big|large|high)|max(imum)? amount|max_impact|estimated_loss/i.test(text))
    return refusals.error("maximum", { router: "Velora" })
  return refusals.error("unknown")
}

/**
 * Velora as one of a chain's routers. Asked for the general swap only, so one
 * checked layout covers every transaction it builds.
 */
export function veloraRouter(chain: VeloraChain): SwapRouter {
  const { refusals } = chain

  /** Unsigned quote/build only. One 429 retry, charged to the same allowance. */
  async function request(
    path: string,
    init: { method: "GET" } | { method: "POST"; body: unknown },
    priority: "read" | "order"
  ): Promise<unknown> {
    const url = new URL(`${chain.api}${path}`)
    async function send(): Promise<Response> {
      try {
        chain.reserve(priority)
      } catch {
        throw evmRefused(
          "Velora is limiting requests. Wait a moment and try again.",
          true
        )
      }
      try {
        return await fetch(url, {
          method: init.method,
          headers: {
            accept: "application/json",
            ...(init.method === "POST"
              ? { "content-type": "application/json" }
              : {}),
          },
          ...(init.method === "POST" ? { body: JSON.stringify(init.body) } : {}),
          redirect: "error",
          signal: requestSignal(READ_TIMEOUT_MS),
        })
      } catch {
        throw evmRefused("Velora did not answer. Try again shortly.", true)
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
      throw evmRefused(
        "Velora is limiting requests. Wait a moment and try again.",
        true
      )
    }
    let body: unknown
    try {
      body = await response.json()
    } catch {
      throw refusals.error("unknown")
    }
    if (
      !response.ok ||
      (body !== null && typeof body === "object" && "error" in body)
    )
      throw veloraRefusal(refusals, body)
    return body
  }

  return async (input: KyberRouteInput, priority) => {
    const buy = input.side === "buy"
    const tokenIn = buy ? chain.dollarCoin : input.token
    const tokenOut = buy ? input.token : chain.dollarCoin
    const inDecimals = buy ? chain.dollarDecimals : input.decimals
    const outDecimals = buy ? input.decimals : chain.dollarDecimals
    const query = new URLSearchParams({
      srcToken: tokenIn,
      srcDecimals: String(inDecimals),
      destToken: tokenOut,
      destDecimals: String(outDecimals),
      amount: String(input.amount),
      side: "SELL",
      network: String(chain.network),
      version: "6.2",
      includeContractMethods: "swapExactAmountIn",
      partner: chain.partner,
    })
    const raw = await request(`/prices?${query}`, { method: "GET" }, priority)
    const parsed = pricesSchema.safeParse(raw)
    if (!parsed.success)
      throw evmRefused(
        "Velora did not return a usable route. Nothing was signed."
      )
    const route = parsed.data.priceRoute
    if (
      route.srcToken !== tokenIn ||
      route.destToken !== tokenOut ||
      BigInt(route.srcAmount) !== input.amount ||
      BigInt(route.destAmount) <= 0n ||
      route.contractAddress !== AUGUSTUS_V6 ||
      route.contractMethod !== "swapExactAmountIn"
    )
      throw evmRefused(
        "Velora returned a route for different coins, amounts or contract. Nothing was signed."
      )
    const amountOut = BigInt(route.destAmount)
    return {
      amountOut,
      quote: routeQuote({
        provider: "Velora",
        pools: route.bestRoute.flatMap((leg) =>
          leg.swaps.flatMap((step) =>
            step.swapExchanges.map((pool) => pool.exchange)
          )
        ),
        swap: input,
        dollarDecimals: chain.dollarDecimals,
        amountIn: input.amount,
        amountOut,
        inUsd: Number(route.srcUSD),
        outUsd: Number(route.destUSD),
      }),
      async build({ wallet, bps, deadline }) {
        const built = await request(
          `/transactions/${chain.network}?ignoreChecks=true&ignoreGasEstimate=true`,
          {
            method: "POST",
            body: {
              srcToken: tokenIn,
              destToken: tokenOut,
              srcAmount: route.srcAmount,
              srcDecimals: inDecimals,
              destDecimals: outDecimals,
              // The route exactly as Velora answered it.
              priceRoute: (raw as { priceRoute: unknown }).priceRoute,
              slippage: bps,
              userAddress: wallet,
              receiver: wallet,
              partner: chain.partner,
              deadline,
            },
          },
          "order"
        )
        const tx = buildSchema.safeParse(built)
        if (!tx.success)
          throw evmRefused(
            "Velora could not build a readable transaction. Nothing was signed."
          )
        // Velora can round the minimum down one atom from the quoted output.
        const minimum =
          (amountOut * BigInt(10_000 - bps)) / 10_000n - 1n
        try {
          const call = decodeFunctionData({
            abi: augustusAbi,
            data: tx.data.data,
          })
          const [, swap, partnerAndFee, permit] = call.args
          if (
            tx.data.to !== AUGUSTUS_V6 ||
            tx.data.value !== "0" ||
            swap.srcToken.toLowerCase() !== tokenIn ||
            swap.destToken.toLowerCase() !== tokenOut ||
            swap.fromAmount !== input.amount ||
            swap.toAmount < minimum ||
            swap.beneficiary.toLowerCase() !== wallet.toLowerCase() ||
            permit !== "0x" ||
            partnerAndFee >> 96n !== 0n ||
            (partnerAndFee & FEE_BITS) !== 0n
          )
            throw new Error()
        } catch {
          throw evmRefused(
            "The built transaction does not match the approved coins, recipient, amount, worst fill or fee. Nothing was signed."
          )
        }
        return { data: tx.data.data, to: tx.data.to }
      },
    }
  }
}
