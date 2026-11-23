import {
  evmServices,
  type ServiceConfig,
} from "@/server/protocols/evm-chain/services"

export const BNB_CHAIN_ID = 56
export const BNB_DEX_REQUESTS_PER_MINUTE = 300

export function bnbRpcUrl(): string {
  return process.env.TRADE_BNB_RPC?.trim() || "https://bsc-dataseed.binance.org"
}

/**
 * The node that reads trade history, which is not the node that sends trades.
 *
 * **Not every BSC node answers `eth_getLogs`, and the popular one does not.**
 * `bsc-dataseed.binance.org` refuses every log request with "limit exceeded",
 * a single block included, so it is not a range to page around: that node does
 * not serve logs at all. It was the node this app sent trades through and read
 * history through, so from 20 Sep 2026 every BNB fills sweep failed and no
 * swap reached the Journal. Sending is left where it was, because that part
 * worked.
 */
export function bnbLogsRpcUrl(): string {
  return (
    process.env.TRADE_BNB_LOGS_RPC?.trim() || "https://bsc-rpc.publicnode.com"
  )
}

export const BNB_USDT = "0x55d398326f99059ff775485246999027b3197955"
export const BNB_WRAPPED_NATIVE = "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c"

const services = {
  tokens: {
    label: "PancakeSwap",
    base: "https://tokens.pancakeswap.finance",
    cap: 2,
    windowMs: 60_000,
    reserve: 0,
  },
  security: {
    label: "GoPlus",
    base: "https://api.gopluslabs.io",
    cap: 30,
    windowMs: 60_000,
    reserve: 5,
  },
  kyber: {
    label: "KyberSwap",
    base: "https://aggregator-api.kyberswap.com",
    cap: 30,
    windowMs: 10_000,
    reserve: 10,
  },
  gecko: {
    label: "GeckoTerminal",
    base: "https://api.geckoterminal.com",
    cap: 30,
    windowMs: 60_000,
    reserve: 0,
    pauseAfter429: true,
  },
  dex: {
    label: "DexScreener",
    base: "https://api.dexscreener.com",
    cap: BNB_DEX_REQUESTS_PER_MINUTE,
    windowMs: 60_000,
    reserve: 0,
  },
} satisfies Record<string, ServiceConfig>

const bnbServices = evmServices(services, "BNB_SERVICE")

export const reserveBnbRequest = bnbServices.reserve
/** Reads only. Signed transactions must never use a retrying request. */
export const bnbServiceGet = bnbServices.get
/** Actual outgoing requests in each rolling window, including retries. */
export const bnbRequestCounts = bnbServices.counts
