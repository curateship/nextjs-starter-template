import { defineChain } from "viem"
import {
  evmServices,
  type ServiceConfig,
} from "@/server/protocols/evm-chain/services"

/**
 * Robinhood Chain's addresses. This is the only file that names one.
 *
 * Robinhood Chain is Robinhood's own network, an Ethereum layer built on
 * Arbitrum. Measured on 5 Sep 2026: the public node below answered with no
 * key, reported chain id 4663 and a gas price of 0.4 gwei, and pushed a new
 * block every 100 milliseconds. Mainnet only: KyberSwap does not route on the
 * testnet (chain id 46630).
 */
export const ROBINHOOD_CHAIN_ID = 4663

export function robinhoodRpcUrl(): string {
  return (
    process.env.TRADE_ROBINHOOD_RPC?.trim() ||
    "https://rpc.mainnet.chain.robinhood.com"
  )
}

/** Robinhood Chain as the signing library knows it. */
export const robinhoodChain = defineChain({
  id: ROBINHOOD_CHAIN_ID,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.mainnet.chain.robinhood.com"] } },
  blockExplorers: {
    default: {
      name: "Blockscout",
      url: "https://robinhoodchain.blockscout.com",
    },
  },
})

/** KyberSwap's aggregator for this chain; its slug is `robinhood`. */
export const ROBINHOOD_KYBER_API =
  "https://aggregator-api.kyberswap.com/robinhood/api/v1/"
/** Velora (formerly ParaSwap). Its API names the chain by id, 4663. */
export const VELORA_API = "https://api.paraswap.io"

/** DexScreener's allowance, shared by every chain this app reads. */
export const ROBINHOOD_DEX_REQUESTS_PER_MINUTE = 300

/** Paxos's dollar coin. Every pool on the chain is paired with it. */
export const ROBINHOOD_USDG = "0x5fc5360d0400a0fd4f2af552add042d716f1d168"
/**
 * The chain's wrapped ETH: Arbitrum's standard `aeWETH` contract, with
 * 560,856 holders on 23 Sep 2026. At least seven other tokens call
 * themselves WETH.
 */
export const ROBINHOOD_WETH = "0x0bd7d308f8e1639fab988df18a8011f41eacad73"
/**
 * Robinhood's StockFactory. Every real stock token is one it deployed, and
 * each deploy is a `Deployed` event on this address. A name proves nothing:
 * on 23 Sep 2026, 539 tokens were named "... • Robinhood Token", including 18
 * called NVDA, and the factory had made 204.
 */
export const ROBINHOOD_STOCK_FACTORY =
  "0x4783c67b63de2b358ac5951a7d41f47a38f3c046"

/** Robinhood's own picture of a stock token, one per token address. */
export function robinhoodStockLogo(address: string): string {
  return `https://cdn.robinhood.com/ncw_assets/logos/${address.toLowerCase()}.png`
}

const services = {
  explorer: {
    label: "Blockscout",
    base: "https://robinhoodchain.blockscout.com",
    cap: 30,
    windowMs: 60_000,
    reserve: 0,
    // Cloudflare in front of the explorer answers a plain request with a
    // "Just a moment" page. A browser's User-Agent together with the
    // explorer's own page as the Referer is let through; on 23 Sep 2026
    // either one alone was refused.
    headers: {
      "user-agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
      referer: "https://robinhoodchain.blockscout.com/tokens",
    },
  },
  security: {
    label: "GoPlus",
    base: "https://api.gopluslabs.io",
    cap: 30,
    windowMs: 60_000,
    reserve: 5,
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
    cap: ROBINHOOD_DEX_REQUESTS_PER_MINUTE,
    windowMs: 60_000,
    reserve: 0,
  },
  // One allowance with BNB Chain's KyberSwap: the service limits the
  // caller, whichever chain it asks about.
  kyber: {
    label: "KyberSwap",
    base: "https://aggregator-api.kyberswap.com",
    cap: 30,
    windowMs: 10_000,
    reserve: 10,
  },
  // Velora publishes no allowance and sent no limit headers on 24 Sep 2026.
  // Sixty a minute with twenty kept for swaps is a guess on the safe side.
  velora: {
    label: "Velora",
    base: VELORA_API,
    cap: 60,
    windowMs: 60_000,
    reserve: 20,
  },
} satisfies Record<string, ServiceConfig>

const robinhoodServices = evmServices(services, "ROBINHOOD_SERVICE")

/** Reads only. Signed transactions must never use a retrying request. */
export const robinhoodServiceGet = robinhoodServices.get
export const reserveRobinhoodRequest = robinhoodServices.reserve
/** Actual outgoing requests in each rolling window, including retries. */
export const robinhoodRequestCounts = robinhoodServices.counts
