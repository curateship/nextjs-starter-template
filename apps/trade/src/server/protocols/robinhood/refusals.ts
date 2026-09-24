import { evmRefusals } from "@/server/protocols/evm-chain/refusals"

/**
 * ETH a wallet should keep for network fees. A swap measured on 5 Sep 2026
 * cost about 0.00012 ETH (0.4 gwei times 300,000 gas); a real one on 24 Sep
 * cost 0.000016 ETH (0.042 gwei times 382,266 gas). 0.001 ETH covers about
 * eight swaps at the dearer figure.
 */
export const ROBINHOOD_FEE_RESERVE = 0.001

export const robinhoodRefusals = evmRefusals({
  chain: "Robinhood Chain",
  feeCoin: "ETH",
  feeReserve: ROBINHOOD_FEE_RESERVE,
  explorer: "robinhoodchain.blockscout.com",
  historyHelp:
    "The swaps this app sent are still read from their own receipts; swaps made elsewhere reach the Journal once the explorer answers again.",
  unsupportedNetwork: "ROBINHOOD_NETWORK_UNSUPPORTED",
})
