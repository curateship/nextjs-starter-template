import { evmCandles } from "@/server/protocols/evm-chain/candles"
import { robinhoodServiceGet } from "./client"
import { fetchRobinhoodMarkets, bestRobinhoodPairs } from "./markets"

const candles = evmCandles({
  code: "ROBINHOOD",
  unsupportedNetwork: "ROBINHOOD_NETWORK_UNSUPPORTED",
  geckoNetwork: "robinhood",
  dexChain: "robinhood",
  get: robinhoodServiceGet,
  catalog: fetchRobinhoodMarkets,
  bestPairs: bestRobinhoodPairs,
})

export const fetchRobinhoodCandleHistory = candles.history
export const fetchRobinhoodCandles = candles.candles
