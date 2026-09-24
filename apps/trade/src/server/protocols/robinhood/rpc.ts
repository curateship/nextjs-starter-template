import { createPublicClient, erc20Abi, http, type Address } from "viem"
import { robinhoodChain, robinhoodRpcUrl } from "./client"
import { robinhoodRefusals } from "./refusals"

export function robinhoodReadClient() {
  return createPublicClient({
    chain: robinhoodChain,
    transport: http(robinhoodRpcUrl(), { retryCount: 0, timeout: 10_000 }),
  })
}

/** Read from the coin itself: USDG has 6, stock tokens 18. Never assumed. */
export async function robinhoodTokenDecimals(token: Address): Promise<number> {
  try {
    return await robinhoodReadClient().readContract({
      address: token,
      abi: erc20Abi,
      functionName: "decimals",
    })
  } catch (error) {
    throw robinhoodRefusals.explain(error)
  }
}
