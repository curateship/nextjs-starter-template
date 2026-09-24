import { bsc } from "viem/chains"
import { evmSwaps } from "@/server/protocols/evm-chain/swap"
import { evmRefused } from "@/server/protocols/evm-chain/refusals"
import { BNB_USDT, BNB_WRAPPED_NATIVE, bnbRpcUrl } from "./client"
import { clearBnbAccountState } from "./account"
import {
  bnbBuyRefusal,
  bnbKnownUnsellable,
  bnbAccountMarkets,
  fetchBnbPrices,
} from "./markets"
import { bnbRefusals } from "./refusals"
import { bnbReadClient, bnbTokenDecimals } from "./rpc"
import { kyberRequest, parseBnbRoute, validateBnbBuild } from "./quote"
import { bnbReceiptFailure, bnbReceiptFill } from "./receipts"
import {
  finishBnbSend,
  noteBnbTransaction,
  pendingBnbSends,
  recordBnbFill,
  rememberBnbSend,
  withBnbSendLock,
} from "./ledger"
import { verifyBnbWallet, packBnbCredential } from "./wallet"

async function bnbPrice(): Promise<number> {
  const known = (await bnbAccountMarkets()).prices.get(BNB_WRAPPED_NATIVE)
  const price =
    known ??
    (await fetchBnbPrices("mainnet", [BNB_WRAPPED_NATIVE])).get(
      BNB_WRAPPED_NATIVE
    )
  if (!(price && Number.isFinite(price) && price > 0))
    throw evmRefused(
      "BNB's fee price is unavailable. Nothing was signed. Try again shortly."
    )
  return price
}

const swaps = evmSwaps({
  name: "BNB Chain",
  feeCoin: "BNB",
  viemChain: bsc,
  rpcUrl: bnbRpcUrl,
  dollarCoin: BNB_USDT,
  dollarDecimals: 18,
  wrappedNative: BNB_WRAPPED_NATIVE,
  unsupportedNetwork: "BNB_NETWORK_UNSUPPORTED",
  refusals: bnbRefusals,
  kyber: {
    request: kyberRequest,
    parseRoute: parseBnbRoute,
    validateBuild: validateBnbBuild,
  },
  receipts: { fill: bnbReceiptFill, failure: bnbReceiptFailure },
  wallet: { verify: verifyBnbWallet, pack: packBnbCredential },
  readClient: bnbReadClient,
  tokenDecimals: bnbTokenDecimals,
  buyRefusal: bnbBuyRefusal,
  knownUnsellable: bnbKnownUnsellable,
  feeCoinPrice: bnbPrice,
  ledger: {
    withSendLock: withBnbSendLock,
    pending: pendingBnbSends,
    // The stored field is `feeBnb`, and stored fields keep their names.
    remember: (owner, send) =>
      rememberBnbSend(owner, {
        ...send,
        approvals: send.approvals.map(({ hash, fee }) => ({
          hash,
          feeBnb: fee,
        })),
      }),
    finish: finishBnbSend,
    note: noteBnbTransaction,
    record: recordBnbFill,
  },
  clearAccountState: clearBnbAccountState,
})

export const quoteBnbSwap = swaps.quote
export const placeBnbOrder = swaps.place
export const closeBnbPosition = swaps.close
export const cancelBnbOrder = swaps.cancel
export const modifyBnbOrder = swaps.modify
export const setBnbBrackets = swaps.setBrackets
export const fetchBnbOrderInfo = swaps.orderInfo
