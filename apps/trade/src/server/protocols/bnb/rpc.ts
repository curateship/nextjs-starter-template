import { createPublicClient, erc20Abi, http, type Address } from "viem"
import { bsc } from "viem/chains"
import { bnbLogsRpcUrl, bnbRpcUrl } from "./client"
import { explainBnbError } from "./refusals"

export function bnbReadClient() {
  return createPublicClient({
    chain: bsc,
    transport: http(bnbRpcUrl(), { retryCount: 0, timeout: 10_000 }),
  })
}

/** Reads trade history. See `bnbLogsRpcUrl` for why it is its own node. */
export function bnbLogsClient() {
  return createPublicClient({
    chain: bsc,
    transport: http(bnbLogsRpcUrl(), { retryCount: 0, timeout: 10_000 }),
  })
}
export async function bnbTokenDecimals(token: Address): Promise<number> {
  try {
    return await bnbReadClient().readContract({
      address: token,
      abi: erc20Abi,
      functionName: "decimals",
    })
  } catch (error) {
    throw explainBnbError(error)
  }
}
