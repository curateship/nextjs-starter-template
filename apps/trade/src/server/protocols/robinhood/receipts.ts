import { evmReceipts } from "@/server/protocols/evm-chain/receipts"
import { ROBINHOOD_USDG } from "./client"
import { robinhoodRefusals } from "./refusals"

export const robinhoodReceipts = evmReceipts({
  dollarCoin: ROBINHOOD_USDG,
  dollarDecimals: 6,
  feeCoin: "ETH",
  refusals: robinhoodRefusals,
})
