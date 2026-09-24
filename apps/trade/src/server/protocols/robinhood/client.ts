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
} satisfies Record<string, ServiceConfig>

const robinhoodServices = evmServices(services, "ROBINHOOD_SERVICE")

/** Reads only. Signed transactions must never use a retrying request. */
export const robinhoodServiceGet = robinhoodServices.get
/** Actual outgoing requests in each rolling window, including retries. */
export const robinhoodRequestCounts = robinhoodServices.counts
