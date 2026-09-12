import {
  BaseError,
  createWalletClient,
  encodeFunctionData,
  erc20Abi,
  formatUnits,
  http,
  isAddress,
  keccak256,
  maxUint256,
  type Address,
  type Hash,
  type TransactionReceipt,
} from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { bsc } from "viem/chains"
import type {
  NetworkId,
  OrderAuth,
  PlaceOrderOutcome,
  PlaceOrderParams,
  SwapQuote,
  WalletOrderInfo,
} from "@/lib/protocols/contracts"
import { assertPlaceOrderValues } from "@/server/protocols/connector-helpers"
import { assertRealMoneyAllowed } from "@/server/protocols/real-money"
import { BNB_USDT, BNB_WRAPPED_NATIVE, bnbRpcUrl } from "./client"
import { clearBnbAccountState, fetchBnbPortfolio } from "./account"
import {
  bnbBuyRefusal,
  bnbKnownUnsellable,
  bnbAccountMarkets,
  fetchBnbPrices,
} from "./markets"
import {
  bnbRefused,
  bnbRefusalError,
  bnbRefusalSentence,
  bnbNodeRefusalCode,
  explainBnbError,
  type BnbRefusalDetail,
} from "./refusals"
import { bnbReadClient, bnbTokenDecimals } from "./rpc"
import {
  bnbSlippage,
  bnbUnits,
  kyberRequest,
  parseBnbRoute,
  validateBnbBuild,
  type BnbRoute,
} from "./quote"
import { bnbReceiptFailure, bnbReceiptFill } from "./receipts"
import {
  finishBnbSend,
  noteBnbTransaction,
  pendingBnbSends,
  recordBnbFill,
  rememberBnbSend,
  withBnbSendLock,
  type BnbOwner,
  type BnbApproval,
} from "./ledger"
import { verifyBnbWallet, packBnbCredential } from "./wallet"

function inputs(
  network: NetworkId,
  wallet: string,
  token: string
): { wallet: Address; token: Address } {
  if (network !== "mainnet") throw new Error("BNB_NETWORK_UNSUPPORTED")
  if (
    !isAddress(wallet, { strict: false }) ||
    !isAddress(token, { strict: false }) ||
    token.toLowerCase() === BNB_USDT
  )
    throw new Error("LIVE_MARKET")
  return {
    wallet: wallet.toLowerCase() as Address,
    token: token.toLowerCase() as Address,
  }
}
async function quote(
  input: {
    token: Address
    side: "buy" | "sell"
    amount: bigint
    decimals: number
    px: number | null
    slippage: number
  },
  priority: "read" | "order"
): Promise<BnbRoute> {
  if (input.amount <= 0n) throw new Error("LIVE_SIZE")
  const raw = await kyberRequest(
    "routes",
    {
      tokenIn: input.side === "buy" ? BNB_USDT : input.token,
      tokenOut: input.side === "buy" ? input.token : BNB_USDT,
      amountIn: String(input.amount),
    },
    priority
  )
  return parseBnbRoute(raw, input)
}
export async function quoteBnbSwap(
  network: NetworkId,
  address: string,
  params: {
    marketId: string
    side: "buy" | "sell"
    sz: number
    px: number
    slippage: number
  }
): Promise<SwapQuote> {
  try {
    const { token } = inputs(network, address, params.marketId)
    if (!(params.sz > 0 && params.px > 0)) throw new Error("LIVE_SIZE")
    const decimals = await bnbTokenDecimals(token)
    const slippage = bnbSlippage(params.slippage)
    const amount = bnbUnits(
      params.side === "buy" ? params.sz * params.px : params.sz,
      params.side === "buy" ? 18 : decimals
    )
    const route = await quote(
      { token, ...params, amount, decimals, slippage },
      "read"
    )
    if (params.side === "buy")
      route.quote.refusal = (await bnbBuyRefusal(token)) ?? route.quote.refusal
    return route.quote
  } catch (error) {
    throw explainBnbError(error)
  }
}

/** Recognized preflight revert only. A broadcast or receipt never enters this retry. */
export function transferFromFailed(error: unknown): boolean {
  return (
    error instanceof BaseError &&
    error.walk(
      (e) => e instanceof Error && e.message.includes("TRANSFER_FROM_FAILED")
    ) instanceof Error
  )
}
async function bnbPrice(): Promise<number> {
  const known = (await bnbAccountMarkets()).prices.get(BNB_WRAPPED_NATIVE)
  const price =
    known ??
    (await fetchBnbPrices("mainnet", [BNB_WRAPPED_NATIVE])).get(
      BNB_WRAPPED_NATIVE
    )
  if (!(price && Number.isFinite(price) && price > 0))
    throw bnbRefused(
      "BNB's fee price is unavailable. Nothing was signed. Try again shortly."
    )
  return price
}

async function swap(
  network: NetworkId,
  auth: OrderAuth,
  params: {
    marketId: string
    side: "buy" | "sell"
    sz: number
    px: number | null
    slippage: number
    reduceOnly: boolean
  }
): Promise<PlaceOrderOutcome> {
  const detail: BnbRefusalDetail = {}
  try {
    return await executeSwap(network, auth, params, detail)
  } catch (error) {
    throw explainBnbError(error, detail)
  }
}

async function executeSwap(
  network: NetworkId,
  auth: OrderAuth,
  params: {
    marketId: string
    side: "buy" | "sell"
    sz: number
    px: number | null
    slippage: number
    reduceOnly: boolean
  },
  detail: BnbRefusalDetail
): Promise<PlaceOrderOutcome> {
  const { wallet, token } = inputs(
    network,
    auth.accountAddress ?? "",
    params.marketId
  )
  const decimals = await bnbTokenDecimals(token)
  const slippage = bnbSlippage(params.slippage)
  const client = bnbReadClient()
  let amount = bnbUnits(
    params.side === "buy" ? params.sz * (params.px ?? 0) : params.sz,
    params.side === "buy" ? 18 : decimals
  )
  if (params.side === "sell") {
    const held = await client.readContract({
      address: token,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [wallet],
    })
    if (held === 0n)
      throw bnbRefused(
        token === BNB_WRAPPED_NATIVE
          ? "This wallet has no wrapped BNB to sell. Native BNB stays available for network fees."
          : "This wallet holds none of this coin, so there is nothing to sell."
      )
    if (amount > held) {
      if (!params.reduceOnly)
        throw bnbRefused(
          `This wallet holds ${formatUnits(held, decimals)} coins. Lower the size or tick "Sell only what I hold".`
        )
      amount = held
    }
  }
  if (params.side === "buy") {
    const refusal = await bnbBuyRefusal(token)
    if (refusal) throw bnbRefused(refusal)
  }
  const route = await quote(
    { token, ...params, amount, decimals, slippage },
    "order"
  )
  if (route.quote.refusal) throw bnbRefused(route.quote.refusal)
  // Quote slippage and execution slippage must not compound beyond the order's cap.
  let buildBps = Math.floor(slippage * 10_000)
  if (params.px !== null) {
    const minimum =
      bnbUnits(
        params.side === "buy"
          ? route.quote.usd / (params.px * (1 + slippage))
          : route.quote.sz * params.px * (1 - slippage),
        params.side === "buy" ? decimals : 18
      ) + 1n
    const out = BigInt(route.summary.amountOut)
    buildBps = Math.min(buildBps, Number(((out - minimum) * 10_000n) / out))
    if (minimum > out || buildBps < 0)
      throw bnbRefused(
        "The quote no longer fits the order's worst fill. Nothing was signed."
      )
  }
  const deadline = Math.floor(Date.now() / 1000) + 120
  const built = validateBnbBuild(
    await kyberRequest(
      "route/build",
      {
        routeSummary: route.summary,
        sender: wallet,
        recipient: wallet,
        slippageTolerance: buildBps,
        deadline,
        source: "nodabot-trade",
        ignoreCappedSlippage: true,
      },
      "order"
    ),
    route,
    wallet,
    buildBps / 10_000
  )
  const feePrice = await bnbPrice()
  await assertRealMoneyAllowed(network)
  if (!auth.owner) throw new Error("LIVE_WALLET_NOT_FOUND")
  const owner: BnbOwner = auth.owner
  await verifyBnbWallet(network, wallet, auth.agentKey)
  const account = privateKeyToAccount(
    packBnbCredential({ secret: auth.agentKey }) as Hash
  )
  const writer = createWalletClient({
    account,
    chain: bsc,
    transport: http(bnbRpcUrl(), { retryCount: 0, timeout: 10_000 }),
  })
  return withBnbSendLock(wallet, async () => {
    const pending = await pendingBnbSends(owner)
    if (pending.length)
      throw bnbRefusalError("pending", { hash: pending[0].hash })
    if (params.side === "sell") {
      const held = await client.readContract({
        address: token,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [wallet],
      })
      if (held < amount)
        throw bnbRefused(
          "The holding changed while the route was built. Nothing was signed. Try the sell again."
        )
    }
    let approvalNote = ""
    let approvalFee = 0
    const approvals: BnbApproval[] = []
    const signSend = async (
      to: Address,
      data: Hash,
      kind: "approval" | "swap",
      gas?: bigint
    ): Promise<{
      hash: Hash
      receipt: TransactionReceipt | null
      note?: string
    }> => {
      if (Date.now() / 1000 >= deadline)
        throw bnbRefused(
          "The route expired before signing. Nothing further was sent. Request a fresh quote."
        )
      await assertRealMoneyAllowed(network)
      const prepared = await writer.prepareTransactionRequest({
        account,
        to,
        data,
        value: 0n,
        type: "legacy",
        ...(gas ? { gas } : {}),
      })
      // Preparing nonce and fees can wait on the node. Check again at signing.
      await assertRealMoneyAllowed(network)
      if (Date.now() / 1000 >= deadline)
        throw bnbRefused(
          "The route expired before signing. Nothing further was sent. Request a fresh quote."
        )
      const signed = await writer.signTransaction(prepared)
      const hash = keccak256(signed)
      await rememberBnbSend(owner, {
        hash,
        address: wallet,
        marketId: token,
        kind,
        approvals: kind === "swap" ? approvals : [],
      })
      Object.assign(detail, {
        hash,
        pending: true,
        approval: kind === "approval",
      })
      // Save the known hash before any network ambiguity. Never rebuild or resend.
      await noteBnbTransaction(
        owner,
        token,
        `${kind === "approval" ? "Approval" : "Swap"} submitted as ${hash}. Confirmation is pending.`
      )
      try {
        await writer.sendRawTransaction({ serializedTransaction: signed })
      } catch (error) {
        return {
          hash,
          receipt: null,
          note: bnbRefusalSentence(bnbNodeRefusalCode(error), detail),
        }
      }
      try {
        const receipt = await client.waitForTransactionReceipt({
          hash,
          confirmations: 2,
          timeout: 30_000,
          pollingInterval: 1_000,
        })
        if (
          receipt.transactionHash &&
          receipt.transactionHash.toLowerCase() !== hash.toLowerCase()
        ) {
          return {
            hash,
            receipt: null,
            note: bnbRefusalSentence("replaced", {
              ...detail,
              replacementHash: receipt.transactionHash,
            }),
          }
        }
        detail.pending = false
        detail.feeWei = receipt.gasUsed * receipt.effectiveGasPrice
        return { hash, receipt }
      } catch (error) {
        return {
          hash,
          receipt: null,
          note: bnbRefusalSentence(
            bnbNodeRefusalCode(error) === "unknown"
              ? "pending"
              : bnbNodeRefusalCode(error),
            detail
          ),
        }
      }
    }
    const approve = async () => {
      const sent = await signSend(
        route.summary.tokenIn,
        encodeFunctionData({
          abi: erc20Abi,
          functionName: "approve",
          args: [built.router, maxUint256],
        }),
        "approval"
      )
      if (!sent.receipt)
        throw bnbRefused(
          `${sent.note ?? bnbRefusalSentence("pending", detail)} No swap was sent.`,
          true
        )
      const failure = bnbReceiptFailure(sent.hash, "approval", sent.receipt)
      await finishBnbSend(
        owner,
        sent.hash,
        sent.receipt.status === "success" ? "confirmed" : "failed",
        sent.receipt.status === "success"
          ? `Approval confirmed: ${sent.hash}.`
          : failure
      )
      if (sent.receipt.status !== "success") throw bnbRefused(failure)
      detail.approvalFeeWei =
        (detail.approvalFeeWei ?? 0n) +
        sent.receipt.gasUsed * sent.receipt.effectiveGasPrice
      detail.feeWei = undefined
      detail.hash = undefined
      const allowance = await client.readContract({
        address: route.summary.tokenIn,
        abi: erc20Abi,
        functionName: "allowance",
        args: [wallet, built.router],
      })
      if (allowance < amount)
        throw bnbRefusalError("approval", { ...detail, hash: sent.hash })
      const fee = Number(
        formatUnits(sent.receipt.gasUsed * sent.receipt.effectiveGasPrice, 18)
      )
      approvals.push({ hash: sent.hash, feeBnb: fee })
      approvalFee += fee * feePrice
      approvalNote += ` Unlimited approval confirmed for ${route.summary.tokenIn} to router ${built.router}, transaction ${sent.hash}, fee ${fee} BNB.`
      await noteBnbTransaction(owner, token, approvalNote.trim())
    }
    const allowance = await client.readContract({
      address: route.summary.tokenIn,
      abi: erc20Abi,
      functionName: "allowance",
      args: [wallet, built.router],
    })
    if (allowance < amount) await approve()
    let gas: bigint
    try {
      gas = await client.estimateGas({
        account,
        to: built.router,
        data: built.data,
        value: 0n,
      })
    } catch (error) {
      if (!transferFromFailed(error)) throw explainBnbError(error, detail)
      await approve()
      try {
        gas = await client.estimateGas({
          account,
          to: built.router,
          data: built.data,
          value: 0n,
        })
      } catch (error) {
        throw explainBnbError(error, detail)
      }
    }
    const sent = await signSend(
      built.router,
      built.data,
      "swap",
      gas + gas / 5n
    )
    const uncertain: PlaceOrderOutcome = {
      status: "filled",
      orderId: sent.hash,
      avgPx: null,
      filledSz: null,
      protection: null,
      protectionNote: null,
      executionNote: `${sent.note ?? bnbRefusalSentence("pending", { ...detail, pending: true })}${approvalNote}`,
    }
    if (!sent.receipt) return uncertain
    if (sent.receipt.status !== "success") {
      let reason: unknown
      // A receipt has status and gas, but no revert reason. Replaying at the
      // mined block can explain the failure; an unavailable replay stays unknown.
      try {
        await client.call({
          account: wallet,
          to: built.router,
          data: built.data,
          value: 0n,
          blockNumber: sent.receipt.blockNumber,
        })
      } catch (error) {
        reason = error
      }
      const note = bnbReceiptFailure(sent.hash, "swap", sent.receipt, {
        reason,
        unsellable: params.side === "sell" && bnbKnownUnsellable(token),
        approvalFeeWei: detail.approvalFeeWei,
      })
      await finishBnbSend(owner, sent.hash, "failed", note)
      throw bnbRefused(note)
    }
    // After a successful send, a slow node or database must never turn the
    // accepted transaction into an exception that makes a watched order send twice.
    try {
      const block = await client.getBlock({
        blockNumber: sent.receipt.blockNumber,
      })
      const fill = bnbReceiptFill(
        sent.receipt,
        wallet,
        Number(block.timestamp) * 1000,
        new Map([[token, decimals]]),
        feePrice,
        token
      )
      if (!fill || fill.side !== params.side) return uncertain
      fill.fee += approvalFee
      fill.executionNote += approvalNote
      await recordBnbFill(owner, fill)

      clearBnbAccountState()
      return {
        ...uncertain,
        avgPx: fill.px,
        filledSz: fill.sz,
        executionNote: fill.executionNote,
      }
    } catch {
      return uncertain
    }
  })
}

export async function placeBnbOrder(
  network: NetworkId,
  auth: OrderAuth,
  params: PlaceOrderParams
): Promise<PlaceOrderOutcome> {
  assertPlaceOrderValues(params)
  if (params.kind !== "market")
    throw bnbRefused(
      "Nothing rests on BNB Chain. Watch a price here and swap when it reaches that price."
    )
  if (params.side === "buy" && params.reduceOnly)
    throw bnbRefused(
      '"Sell only what I hold" applies to sells. Untick it for a buy.'
    )
  const result = await swap(network, auth, {
    ...params,
    slippage: bnbSlippage(params.slippage),
  })
  if (params.tpPx !== null || params.slPx !== null)
    return {
      ...result,
      protection: "partial",
      protectionNote:
        "BNB Chain holds no stop or target. Place a watched sell at the desired price.",
    }
  return result
}
export async function closeBnbPosition(
  network: NetworkId,
  auth: OrderAuth,
  params: { marketId: string; szi: number }
) {
  if (!(params.szi > 0)) throw new Error("LIVE_SIZE")
  return swap(network, auth, {
    marketId: params.marketId,
    side: "sell",
    sz: params.szi,
    px: null,
    slippage: bnbSlippage(null),
    reduceOnly: true,
  })
}
export async function cancelBnbOrder(): Promise<void> {
  throw bnbRefused(
    "A BNB Chain swap does not rest and cannot be cancelled after sending. Cancel a watched level here before it fires."
  )
}
export async function modifyBnbOrder(): Promise<void> {
  throw bnbRefused(
    "A BNB Chain swap cannot be moved after sending. Move the watched level here before it fires."
  )
}
export async function setBnbBrackets(): Promise<{ slOrderId: string | null }> {
  throw bnbRefused(
    "BNB Chain holds no stop or target. Place a watched sell at the desired price."
  )
}
export async function fetchBnbOrderInfo(): Promise<WalletOrderInfo> {
  return { kind: "none", triggerPx: null }
}
export { fetchBnbPortfolio }
