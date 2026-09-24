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
  type Chain,
  type Hash,
  type PublicClient,
  type TransactionReceipt,
} from "viem"
import { privateKeyToAccount } from "viem/accounts"
import type {
  NetworkId,
  OrderAuth,
  PlaceOrderOutcome,
  PlaceOrderParams,
  SwapQuote,
  WalletOrderFill,
  WalletOrderInfo,
} from "@/lib/protocols/contracts"
import { assertPlaceOrderValues } from "@/server/protocols/connector-helpers"
import { assertRealMoneyAllowed } from "@/server/protocols/real-money"
import {
  evmRefused,
  nodeRefusalCode,
  type EvmRefusalDetail,
  type EvmRefusals,
} from "./refusals"
import {
  evmSlippage,
  evmUnits,
  KYBER_CLIENT_ID,
  type KyberRoute,
  type KyberRouteInput,
  type kyberSwap,
} from "./kyber"
import type { evmReceipts } from "./receipts"

type Owner = { userId: string; walletId: string }
/** One confirmed approval, its fee in the chain's fee coin. */
type SwapApproval = { hash: string; fee: number }

/** Where a chain keeps its sends, so none is ever made twice. */
type SwapLedger = {
  /** A second worker cannot allocate the same chain nonce for this address. */
  withSendLock<T>(address: string, work: () => Promise<T>): Promise<T>
  pending(owner: Owner): Promise<{ hash: string }[]>
  remember(
    owner: Owner,
    input: {
      hash: string
      address: string
      marketId: string
      kind: "approval" | "swap"
      approvals: SwapApproval[]
    }
  ): Promise<void>
  finish(
    owner: Owner,
    hash: string,
    state: "confirmed" | "failed",
    note: string
  ): Promise<void>
  note(owner: Owner, marketId: string, note: string): Promise<void>
  record(owner: Owner, fill: WalletOrderFill): Promise<void>
}

/** Everything one Ethereum-shaped chain hands the shared swap. */
type SwapChain = {
  /** The chain's printed name, as in "Nothing rests on <name>". */
  name: string
  feeCoin: string
  viemChain: Chain
  rpcUrl(): string
  /** Lowercase contract addresses. */
  dollarCoin: Address
  dollarDecimals: number
  wrappedNative: Address
  unsupportedNetwork: string
  refusals: EvmRefusals
  kyber: ReturnType<typeof kyberSwap>
  receipts: ReturnType<typeof evmReceipts>
  wallet: {
    verify(
      network: NetworkId,
      address: string,
      blob: string
    ): Promise<unknown>
    pack(input: { secret?: string }): string
  }
  readClient(): PublicClient
  tokenDecimals(token: Address): Promise<number>
  /** A sentence refusing a buy of this coin, or null. */
  buyRefusal(token: Address): Promise<string | null>
  /** True when this coin is already known to refuse a sale. */
  knownUnsellable(token: Address): boolean
  /** The fee coin's dollar price, or a refusal. */
  feeCoinPrice(): Promise<number>
  ledger: SwapLedger
  clearAccountState(): void
}

type SwapParams = {
  marketId: string
  side: "buy" | "sell"
  sz: number
  px: number | null
  slippage: number
  reduceOnly: boolean
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

/**
 * A spot swap through KyberSwap, signed on the server with the wallet's key.
 *
 * Nothing rests: every order is a swap that fills when it is sent, so cancel,
 * modify and brackets refuse in plain words. The key never leaves the server.
 */
export function evmSwaps(chain: SwapChain) {
  const { refusals, kyber, receipts, ledger, feeCoin } = chain

  function inputs(
    network: NetworkId,
    wallet: string,
    token: string
  ): { wallet: Address; token: Address } {
    if (network !== "mainnet") throw new Error(chain.unsupportedNetwork)
    if (
      !isAddress(wallet, { strict: false }) ||
      !isAddress(token, { strict: false }) ||
      token.toLowerCase() === chain.dollarCoin
    )
      throw new Error("LIVE_MARKET")
    return {
      wallet: wallet.toLowerCase() as Address,
      token: token.toLowerCase() as Address,
    }
  }

  async function route(
    input: KyberRouteInput,
    priority: "read" | "order"
  ): Promise<KyberRoute> {
    if (input.amount <= 0n) throw new Error("LIVE_SIZE")
    const raw = await kyber.request(
      "routes",
      {
        tokenIn: input.side === "buy" ? chain.dollarCoin : input.token,
        tokenOut: input.side === "buy" ? input.token : chain.dollarCoin,
        amountIn: String(input.amount),
      },
      priority
    )
    return kyber.parseRoute(raw, input)
  }

  async function quote(
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
      const decimals = await chain.tokenDecimals(token)
      const slippage = evmSlippage(params.slippage)
      const amount = evmUnits(
        params.side === "buy" ? params.sz * params.px : params.sz,
        params.side === "buy" ? chain.dollarDecimals : decimals
      )
      const found = await route(
        { token, ...params, amount, decimals, slippage },
        "read"
      )
      if (params.side === "buy")
        found.quote.refusal =
          (await chain.buyRefusal(token)) ?? found.quote.refusal
      return found.quote
    } catch (error) {
      throw refusals.explain(error)
    }
  }

  async function swap(
    network: NetworkId,
    auth: OrderAuth,
    params: SwapParams
  ): Promise<PlaceOrderOutcome> {
    const detail: EvmRefusalDetail = {}
    try {
      return await executeSwap(network, auth, params, detail)
    } catch (error) {
      throw refusals.explain(error, detail)
    }
  }

  async function executeSwap(
    network: NetworkId,
    auth: OrderAuth,
    params: SwapParams,
    detail: EvmRefusalDetail
  ): Promise<PlaceOrderOutcome> {
    const { wallet, token } = inputs(
      network,
      auth.accountAddress ?? "",
      params.marketId
    )
    const decimals = await chain.tokenDecimals(token)
    const slippage = evmSlippage(params.slippage)
    const client = chain.readClient()
    let amount = evmUnits(
      params.side === "buy" ? params.sz * (params.px ?? 0) : params.sz,
      params.side === "buy" ? chain.dollarDecimals : decimals
    )
    if (params.side === "sell") {
      const held = await client.readContract({
        address: token,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [wallet],
      })
      if (held === 0n)
        throw evmRefused(
          token === chain.wrappedNative
            ? `This wallet has no wrapped ${feeCoin} to sell. Native ${feeCoin} stays available for network fees.`
            : "This wallet holds none of this coin, so there is nothing to sell."
        )
      if (amount > held) {
        if (!params.reduceOnly)
          throw evmRefused(
            `This wallet holds ${formatUnits(held, decimals)} coins. Lower the size or tick "Sell only what I hold".`
          )
        amount = held
      }
    }
    if (params.side === "buy") {
      const refusal = await chain.buyRefusal(token)
      if (refusal) throw evmRefused(refusal)
    }
    const found = await route(
      { token, ...params, amount, decimals, slippage },
      "order"
    )
    if (found.quote.refusal) throw evmRefused(found.quote.refusal)
    // Quote slippage and execution slippage must not compound beyond the order's cap.
    let buildBps = Math.floor(slippage * 10_000)
    if (params.px !== null) {
      const minimum =
        evmUnits(
          params.side === "buy"
            ? found.quote.usd / (params.px * (1 + slippage))
            : found.quote.sz * params.px * (1 - slippage),
          params.side === "buy" ? decimals : chain.dollarDecimals
        ) + 1n
      const out = BigInt(found.summary.amountOut)
      buildBps = Math.min(buildBps, Number(((out - minimum) * 10_000n) / out))
      if (minimum > out || buildBps < 0)
        throw evmRefused(
          "The quote no longer fits the order's worst fill. Nothing was signed."
        )
    }
    const deadline = Math.floor(Date.now() / 1000) + 120
    const built = kyber.validateBuild(
      await kyber.request(
        "route/build",
        {
          routeSummary: found.summary,
          sender: wallet,
          recipient: wallet,
          slippageTolerance: buildBps,
          deadline,
          source: KYBER_CLIENT_ID,
          ignoreCappedSlippage: true,
        },
        "order"
      ),
      found,
      wallet,
      buildBps / 10_000
    )
    const feePrice = await chain.feeCoinPrice()
    await assertRealMoneyAllowed(network)
    if (!auth.owner) throw new Error("LIVE_WALLET_NOT_FOUND")
    const owner: Owner = auth.owner
    await chain.wallet.verify(network, wallet, auth.agentKey)
    const account = privateKeyToAccount(
      chain.wallet.pack({ secret: auth.agentKey }) as Hash
    )
    const writer = createWalletClient({
      account,
      chain: chain.viemChain,
      transport: http(chain.rpcUrl(), { retryCount: 0, timeout: 10_000 }),
    })
    return ledger.withSendLock(wallet, async () => {
      const pending = await ledger.pending(owner)
      if (pending.length)
        throw refusals.error("pending", { hash: pending[0].hash })
      if (params.side === "sell") {
        const held = await client.readContract({
          address: token,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [wallet],
        })
        if (held < amount)
          throw evmRefused(
            "The holding changed while the route was built. Nothing was signed. Try the sell again."
          )
      }
      let approvalNote = ""
      let approvalFee = 0
      const approvals: SwapApproval[] = []
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
          throw evmRefused(
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
          throw evmRefused(
            "The route expired before signing. Nothing further was sent. Request a fresh quote."
          )
        const signed = await writer.signTransaction(prepared)
        const hash = keccak256(signed)
        await ledger.remember(owner, {
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
        await ledger.note(
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
            note: refusals.sentence(nodeRefusalCode(error), detail),
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
              note: refusals.sentence("replaced", {
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
            note: refusals.sentence(
              nodeRefusalCode(error) === "unknown"
                ? "pending"
                : nodeRefusalCode(error),
              detail
            ),
          }
        }
      }
      const approve = async () => {
        const sent = await signSend(
          found.summary.tokenIn,
          encodeFunctionData({
            abi: erc20Abi,
            functionName: "approve",
            args: [built.router, maxUint256],
          }),
          "approval"
        )
        if (!sent.receipt)
          throw evmRefused(
            `${sent.note ?? refusals.sentence("pending", detail)} No swap was sent.`,
            true
          )
        const failure = receipts.failure(sent.hash, "approval", sent.receipt)
        await ledger.finish(
          owner,
          sent.hash,
          sent.receipt.status === "success" ? "confirmed" : "failed",
          sent.receipt.status === "success"
            ? `Approval confirmed: ${sent.hash}.`
            : failure
        )
        if (sent.receipt.status !== "success") throw evmRefused(failure)
        detail.approvalFeeWei =
          (detail.approvalFeeWei ?? 0n) +
          sent.receipt.gasUsed * sent.receipt.effectiveGasPrice
        detail.feeWei = undefined
        detail.hash = undefined
        const allowance = await client.readContract({
          address: found.summary.tokenIn,
          abi: erc20Abi,
          functionName: "allowance",
          args: [wallet, built.router],
        })
        if (allowance < amount)
          throw refusals.error("approval", { ...detail, hash: sent.hash })
        const fee = Number(
          formatUnits(sent.receipt.gasUsed * sent.receipt.effectiveGasPrice, 18)
        )
        approvals.push({ hash: sent.hash, fee })
        approvalFee += fee * feePrice
        approvalNote += ` Unlimited approval confirmed for ${found.summary.tokenIn} to router ${built.router}, transaction ${sent.hash}, fee ${fee} ${feeCoin}.`
        await ledger.note(owner, token, approvalNote.trim())
      }
      const allowance = await client.readContract({
        address: found.summary.tokenIn,
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
        if (!transferFromFailed(error)) throw refusals.explain(error, detail)
        await approve()
        try {
          gas = await client.estimateGas({
            account,
            to: built.router,
            data: built.data,
            value: 0n,
          })
        } catch (error) {
          throw refusals.explain(error, detail)
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
        executionNote: `${sent.note ?? refusals.sentence("pending", { ...detail, pending: true })}${approvalNote}`,
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
        const note = receipts.failure(sent.hash, "swap", sent.receipt, {
          reason,
          unsellable: params.side === "sell" && chain.knownUnsellable(token),
          approvalFeeWei: detail.approvalFeeWei,
        })
        await ledger.finish(owner, sent.hash, "failed", note)
        throw evmRefused(note)
      }
      // After a successful send, a slow node or database must never turn the
      // accepted transaction into an exception that makes a watched order send twice.
      try {
        const block = await client.getBlock({
          blockNumber: sent.receipt.blockNumber,
        })
        const fill = receipts.fill(
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
        await ledger.record(owner, fill)

        chain.clearAccountState()
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

  const noStops = `${chain.name} holds no stop or target. Place a watched sell at the desired price.`

  async function place(
    network: NetworkId,
    auth: OrderAuth,
    params: PlaceOrderParams
  ): Promise<PlaceOrderOutcome> {
    assertPlaceOrderValues(params)
    if (params.kind !== "market")
      throw evmRefused(
        `Nothing rests on ${chain.name}. Watch a price here and swap when it reaches that price.`
      )
    if (params.side === "buy" && params.reduceOnly)
      throw evmRefused(
        '"Sell only what I hold" applies to sells. Untick it for a buy.'
      )
    const result = await swap(network, auth, {
      ...params,
      slippage: evmSlippage(params.slippage),
    })
    if (params.tpPx !== null || params.slPx !== null)
      return { ...result, protection: "partial", protectionNote: noStops }
    return result
  }

  async function close(
    network: NetworkId,
    auth: OrderAuth,
    params: { marketId: string; szi: number }
  ): Promise<PlaceOrderOutcome> {
    if (!(params.szi > 0)) throw new Error("LIVE_SIZE")
    return swap(network, auth, {
      marketId: params.marketId,
      side: "sell",
      sz: params.szi,
      px: null,
      slippage: evmSlippage(null),
      reduceOnly: true,
    })
  }

  async function cancel(): Promise<void> {
    throw evmRefused(
      `A ${chain.name} swap does not rest and cannot be cancelled after sending. Cancel a watched level here before it fires.`
    )
  }

  async function modify(): Promise<void> {
    throw evmRefused(
      `A ${chain.name} swap cannot be moved after sending. Move the watched level here before it fires.`
    )
  }

  async function setBrackets(): Promise<{ slOrderId: string | null }> {
    throw evmRefused(noStops)
  }

  async function orderInfo(): Promise<WalletOrderInfo> {
    return { kind: "none", triggerPx: null }
  }

  return { quote, place, close, cancel, modify, setBrackets, orderInfo }
}
