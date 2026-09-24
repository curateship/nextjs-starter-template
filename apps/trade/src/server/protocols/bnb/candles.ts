import { evmCandles } from "@/server/protocols/evm-chain/candles"
import { bnbServiceGet } from "./client"
import { bestBnbPairs, fetchBnbMarkets } from "./markets"

const candles = evmCandles({
  code: "BNB",
  unsupportedNetwork: "BNB_NETWORK_UNSUPPORTED",
  geckoNetwork: "bsc",
  dexChain: "bsc",
  get: bnbServiceGet,
  catalog: fetchBnbMarkets,
  bestPairs: bestBnbPairs,
})

export const parseBnbCandles = candles.parse
export const fetchBnbCandleHistory = candles.history
export const fetchBnbCandles = candles.candles
