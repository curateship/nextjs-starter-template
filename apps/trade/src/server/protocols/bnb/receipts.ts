import { evmReceipts } from "@/server/protocols/evm-chain/receipts"
import { BNB_USDT } from "./client"
import { bnbRefusals } from "./refusals"

const receipts = evmReceipts({
  dollarCoin: BNB_USDT,
  dollarDecimals: 18,
  feeCoin: "BNB",
  refusals: bnbRefusals,
})

export const bnbReceiptFill = receipts.fill
export const bnbReceiptFailure = receipts.failure
