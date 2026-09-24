import {
  evmRefusals,
  type EvmRefusal,
} from "@/server/protocols/evm-chain/refusals"

export const BNB_FEE_RESERVE = 0.005
export type BnbRefusal = EvmRefusal

export const bnbRefusals = evmRefusals({
  chain: "BNB Chain",
  feeCoin: "BNB",
  feeReserve: BNB_FEE_RESERVE,
  explorer: "bscscan.com",
  historyHelp:
    "Point TRADE_BNB_LOGS_RPC at a node that answers eth_getLogs, such as bsc-rpc.publicnode.com.",
  unsupportedNetwork: "BNB_NETWORK_UNSUPPORTED",
})

export const bnbRefusalSentence = bnbRefusals.sentence
export const bnbRefusalError = bnbRefusals.error
export const bnbHistoryRefusalError = bnbRefusals.historyError
export const explainBnbError = bnbRefusals.explain
