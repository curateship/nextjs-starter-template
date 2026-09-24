import { kyberRouter, kyberSwap } from "@/server/protocols/evm-chain/kyber"
import { veloraRouter } from "@/server/protocols/evm-chain/velora"
import {
  reserveRobinhoodRequest,
  ROBINHOOD_CHAIN_ID,
  ROBINHOOD_KYBER_API,
  ROBINHOOD_USDG,
  VELORA_API,
} from "./client"
import { robinhoodRefusals } from "./refusals"

/**
 * Both routers, asked for every swap; the better route wins. Tyler, 24 Sep
 * 2026: KyberSwap with Velora as backup, better price wins. KyberSwap had
 * refused this chain five times running that day.
 */
export const robinhoodRouters = [
  kyberRouter(
    kyberSwap({
      api: ROBINHOOD_KYBER_API,
      reserve: (priority) => reserveRobinhoodRequest("kyber", priority),
      dollarCoin: ROBINHOOD_USDG,
      dollarDecimals: 6,
      refusals: robinhoodRefusals,
    }),
    ROBINHOOD_USDG
  ),
  veloraRouter({
    api: VELORA_API,
    network: ROBINHOOD_CHAIN_ID,
    partner: "nodabot-trade",
    reserve: (priority) => reserveRobinhoodRequest("velora", priority),
    dollarCoin: ROBINHOOD_USDG,
    dollarDecimals: 6,
    refusals: robinhoodRefusals,
  }),
]
