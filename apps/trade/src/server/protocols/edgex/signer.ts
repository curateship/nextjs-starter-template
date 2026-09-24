import { createHash } from "node:crypto"

import { privateKeyToAccount } from "viem/accounts"

import type { EdgexContract, EdgexSigningFacts } from "@/server/protocols/edgex/catalogue"
import type { EdgexCredential } from "@/server/protocols/edgex/client"

/**
 * edgeX's order signature, the second of the two every order carries.
 *
 * The request is signed with the API secret (`client.ts`). The order itself
 * is signed with the SDK Signer key as EIP-712 typed data, the Ethereum
 * signing `viem` does for Hyperliquid and Aster. Read from edgeX's "L2
 * Signature" page and its Go and Python SDKs (`createOrderV2`,
 * `create_order`), and proved against the Python SDK 2.0.1: three orders
 * signed by edgeX's own code with a made-up key are
 * reproduced byte for byte in `signer.test.ts`.
 *
 * Where edgeX's page and its SDKs disagree, the SDKs win, because they are
 * what edgeX's servers are tested against: the page's example derives the
 * nonce as SHA-256 modulo 2^63, and both SDKs (and the order page) use the
 * first 32 bits of the hash.
 */

const ORDER_BASE = [
  { name: "nonce", type: "uint256" },
  { name: "signer", type: "address" },
  { name: "accountId", type: "uint64" },
  { name: "expirationTimestamp", type: "uint256" },
] as const

const LIMIT_ORDER_PARAMS = [
  { name: "base", type: "OrderBase" },
  { name: "amountSynthetic", type: "int256" },
  { name: "amountCollateral", type: "int256" },
  { name: "amountFee", type: "uint256" },
  { name: "assetIdSynthetic", type: "uint64" },
  { name: "assetIdCollateral", type: "uint64" },
  { name: "isBuyingSynthetic", type: "bool" },
  { name: "parentOrderHash", type: "bytes32" },
  { name: "subOrderIndex", type: "uint256" },
] as const

const DAY_MS = 24 * 3_600_000
/** An order's signature lives 30 days, as both SDKs sign it. */
const ORDER_SIGNATURE_LIFE_MS = 30 * DAY_MS
/**
 * The order itself expires 8 days before its signature: edgeX's page says
 * `l2ExpireTime` must be at least `expireTime` plus 8 days. So an order
 * rests for 22 days.
 */
const L1_OFFSET_MS = 8 * DAY_MS

const ZERO_HASH = `0x${"0".repeat(64)}` as const

/** The nonce edgeX derives from a client order id: SHA-256's first 32 bits. */
export function edgexNonce(clientOrderId: string): number {
  return Number.parseInt(createHash("sha256").update(clientOrderId).digest("hex").slice(0, 8), 16)
}

/** The address a signer key signs as, which edgeX holds for the account. */
export function edgexSignerAddress(signerKey: `0x${string}`): `0x${string}` {
  return privateKeyToAccount(signerKey).address
}

/** A decimal written as text, held exactly: digits and a power of ten. */
type Exact = { digits: bigint; scale: number }

function exact(text: string): Exact {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(text.trim())
  if (!match) throw new Error("EDGEX_AMOUNT_UNREADABLE")
  const fraction = match[2] ?? ""
  return { digits: BigInt(`${match[1]}${fraction}`), scale: fraction.length }
}

function times(left: Exact, right: Exact): Exact {
  return { digits: left.digits * right.digits, scale: left.scale + right.scale }
}

/** Whole units, rounded toward zero, as Python's `int()` and Go's `BigInt()` do. */
function wholeOf(value: Exact): bigint {
  return value.digits / 10n ** BigInt(value.scale)
}

/** Whole units, rounded up. */
function ceilingOf(value: Exact): bigint {
  const unit = 10n ** BigInt(value.scale)
  return (value.digits + unit - 1n) / unit
}

/** Text without trailing zeros, the way Go's decimal prints it. */
function textOf(value: Exact): string {
  if (value.scale === 0) return value.digits.toString()
  const padded = value.digits.toString().padStart(value.scale + 1, "0")
  const whole = padded.slice(0, padded.length - value.scale)
  const fraction = padded.slice(padded.length - value.scale).replace(/0+$/, "")
  return fraction ? `${whole}.${fraction}` : whole
}

/**
 * The fee rate every order's fee cap is signed at: the higher of the
 * contract's taker and maker rates, as both SDKs take it (0.045% on every
 * contract on 24 Sep 2026). A contract that states neither signs at 0.1%,
 * the SDKs' own fallback.
 */
function feeRateOf(contract: Pick<EdgexContract, "takerFeeRate" | "makerFeeRate">): Exact {
  const rates = [contract.takerFeeRate, contract.makerFeeRate].filter((one) => one !== "")
  if (rates.length === 0) return exact("0.001")
  return rates.map(exact).reduce((best, one) =>
    one.digits * 10n ** BigInt(best.scale) > best.digits * 10n ** BigInt(one.scale) ? one : best
  )
}

/** The fields an order sends beside its own terms, all signed. */
export type EdgexOrderSignature = {
  expireTime: string
  l2Nonce: string
  l2Value: string
  l2Size: string
  l2LimitFee: string
  l2ExpireTime: string
  l2Signature: `0x${string}`
}

/**
 * Signs one order.
 *
 * - `size` and `l2Price` are the decimal text sent, already on the step and
 *   tick. `l2Price` is the order's price for a limit order; for a stop or
 *   target it is the worst price the order may fill at, as the SDK signs it.
 * - The amounts are size and value times the resolutions in edgeX's
 *   metadata, and the fee cap is value times the fee rate rounded up to a
 *   whole dollar, exactly as the SDKs compute them. It is a cap, not the fee
 *   charged: edgeX charges its own rate on what fills.
 */
export async function signEdgexOrder(input: {
  credential: Pick<EdgexCredential, "accountId" | "signerKey">
  facts: EdgexSigningFacts
  contract: Pick<EdgexContract, "contractId" | "resolution" | "takerFeeRate" | "makerFeeRate">
  side: "BUY" | "SELL"
  size: string
  l2Price: string
  clientOrderId: string
  now?: number
}): Promise<EdgexOrderSignature> {
  const size = exact(input.size)
  const value = times(exact(input.l2Price), size)
  const limitFee = ceilingOf(times(value, feeRateOf(input.contract)))
  const collateral: Exact = { digits: input.facts.collateralResolution, scale: 0 }
  const synthetic: Exact = { digits: input.contract.resolution, scale: 0 }
  const now = input.now ?? Date.now()
  const l2ExpireTime = now + ORDER_SIGNATURE_LIFE_MS
  const expireTime = l2ExpireTime - L1_OFFSET_MS
  const nonce = edgexNonce(input.clientOrderId)
  const account = privateKeyToAccount(input.credential.signerKey)
  const signature = await account.signTypedData({
    domain: {
      name: "EdgeX",
      version: "1",
      chainId: input.facts.chainId,
      verifyingContract: input.facts.verifyingContract,
    },
    types: { OrderBase: ORDER_BASE, LimitOrderParams: LIMIT_ORDER_PARAMS },
    primaryType: "LimitOrderParams",
    message: {
      base: {
        nonce: BigInt(nonce),
        signer: account.address,
        accountId: BigInt(input.credential.accountId),
        expirationTimestamp: BigInt(Math.floor(expireTime / 1_000)),
      },
      amountSynthetic: wholeOf(times(size, synthetic)),
      amountCollateral: wholeOf(times(value, collateral)),
      amountFee: limitFee * input.facts.collateralResolution,
      assetIdSynthetic: BigInt(input.contract.contractId),
      assetIdCollateral: BigInt(input.facts.collateralCoinId),
      isBuyingSynthetic: input.side === "BUY",
      parentOrderHash: ZERO_HASH,
      subOrderIndex: 0n,
    },
  })
  return {
    expireTime: String(expireTime),
    l2Nonce: String(nonce),
    l2Value: textOf(value),
    l2Size: input.size,
    l2LimitFee: limitFee.toString(),
    l2ExpireTime: String(l2ExpireTime),
    l2Signature: signature,
  }
}
