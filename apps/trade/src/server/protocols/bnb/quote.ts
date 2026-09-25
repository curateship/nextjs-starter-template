import { kyberSwap } from "@/server/protocols/evm-chain/kyber"
import { BNB_USDT, reserveBnbRequest } from "./client"
import { bnbRefusals } from "./refusals"


const kyber = kyberSwap({
  api: "https://aggregator-api.kyberswap.com/bsc/api/v1/",
  reserve: (priority) => reserveBnbRequest("kyber", priority),
  dollarCoin: BNB_USDT,
  dollarDecimals: 18,
  refusals: bnbRefusals,
})

export const kyberRequest = kyber.request
export const parseBnbRoute = kyber.parseRoute
export const validateBnbBuild = kyber.validateBuild
