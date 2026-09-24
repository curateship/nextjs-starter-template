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
