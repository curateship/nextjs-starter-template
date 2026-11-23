import { evmSwaps } from "@/server/protocols/evm-chain/swap"
import {
  finishRobinhoodSend,
  noteRobinhoodTransaction,
  pendingRobinhoodSends,
  recordRobinhoodFill,
  rememberRobinhoodSend,
  withRobinhoodSendLock,
} from "@/server/protocols/robinhood-ledger"
import { clearRobinhoodAccountState } from "./account"
import {
  robinhoodChain,
  robinhoodRpcUrl,
  ROBINHOOD_USDG,
  ROBINHOOD_WETH,
} from "./client"
import {
  fetchRobinhoodMarkets,
  robinhoodBuyRefusal,
  robinhoodEthPrice,
  robinhoodKnownUnsellable,
} from "./markets"
import { robinhoodRouters } from "./quote"
import { robinhoodReceipts } from "./receipts"
import { robinhoodRefusals } from "./refusals"
import { robinhoodReadClient, robinhoodTokenDecimals } from "./rpc"
import { packRobinhoodCredential, verifyRobinhoodWallet } from "./wallet"

/**
 * Buying and selling on Robinhood Chain: the shared swap, with Robinhood's
 * two routers, its own ledger, and an approval of each swap's exact amount.
 *
 * Blocks are 100 milliseconds apart and the chain's sequencer orders them
 * alone, so one confirmation is enough and the receipt is looked for every
 * quarter second. BNB Chain waits for two, once a second.
 */
const swaps = evmSwaps({
  name: "Robinhood Chain",
  feeCoin: "ETH",
  viemChain: robinhoodChain,
  rpcUrl: robinhoodRpcUrl,
  dollarCoin: ROBINHOOD_USDG,
  dollarDecimals: 6,
  wrappedNative: ROBINHOOD_WETH,
  unsupportedNetwork: "ROBINHOOD_NETWORK_UNSUPPORTED",
  refusals: robinhoodRefusals,
  routers: robinhoodRouters,
  approval: "exact",
  receiptWait: { confirmations: 1, pollingInterval: 250, timeout: 15_000 },
  receipts: robinhoodReceipts,
  wallet: { verify: verifyRobinhoodWallet, pack: packRobinhoodCredential },
  readClient: robinhoodReadClient,
  tokenDecimals: robinhoodTokenDecimals,
  buyRefusal: robinhoodBuyRefusal,
  knownUnsellable: robinhoodKnownUnsellable,
  feeCoinPrice: robinhoodEthPrice,
  ledger: {
    withSendLock: withRobinhoodSendLock,
    pending: pendingRobinhoodSends,
    remember: (owner, send) =>
      rememberRobinhoodSend(owner, {
        ...send,
        approvals: send.approvals.map(({ hash, fee }) => ({
          hash,
          feeEth: fee,
        })),
      }),
    finish: finishRobinhoodSend,
    note: noteRobinhoodTransaction,
    record: recordRobinhoodFill,
  },
  clearAccountState: clearRobinhoodAccountState,
})

/**
 * Said once on each stock-token buy's quote line, never as a block. Tyler,
 * 5 Sep 2026: whether he may hold them is his to settle.
 */
const STOCK_TOKEN_NOTE =
  "Robinhood's terms bar Stock Tokens in the US and restrict them in Canada, the UK and Switzerland, so whether you may hold them is yours to check."

export async function quoteRobinhoodSwap(
  ...args: Parameters<typeof swaps.quote>
): ReturnType<typeof swaps.quote> {
  const quote = await swaps.quote(...args)
  const [, , params] = args
  if (params.side !== "buy") return quote
  const listed = await fetchRobinhoodMarkets("mainnet")
  const row = listed.rows.find(
    (one) => one.marketId === params.marketId.toLowerCase()
  )
  return row?.category === "stocks" ? { ...quote, note: STOCK_TOKEN_NOTE } : quote
}
export const placeRobinhoodOrder = swaps.place
export const closeRobinhoodPosition = swaps.close
export const cancelRobinhoodOrder = swaps.cancel
export const modifyRobinhoodOrder = swaps.modify
export const setRobinhoodBrackets = swaps.setBrackets
export const fetchRobinhoodOrderInfo = swaps.orderInfo
