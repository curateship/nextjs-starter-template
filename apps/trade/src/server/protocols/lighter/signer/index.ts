import { existsSync } from "node:fs"
import { readFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import "./assets/wasm_exec.js"

/**
 * Lighter's own signing library, run in this process.
 *
 * **Lighter does not sign the way any other venue here does.** It runs its own
 * chain, and its signatures are Poseidon hashes over its own curve rather than
 * the Ethereum signing Aster and Hyperliquid use, so `viem` cannot produce
 * them. There is no official JavaScript kit either — only community copies on
 * npm, which is not something to hand a private key to. What Lighter does
 * publish is a compiled WebAssembly build of its Go library, and that is what
 * this folder holds. `PROVENANCE.md` records exactly which file, from which
 * commit, and its checksum.
 *
 * Nothing outside this folder may import the `.wasm` or Go's `wasm_exec.js`
 * glue: `fence.test.ts` fails the build if anything does. Everything the app
 * needs goes through the small typed surface at the bottom of this file, so
 * no caller ever touches a global the Go runtime installed.
 */

/** Lighter's chain, as its own examples and its API both use. */
export const LIGHTER_CHAIN_ID = 304

/** Lighter refuses anything that is not exactly forty bytes. Measured. */
export const LIGHTER_PRIVATE_KEY_BYTES = 40

/**
 * Lighter's own numbers for the kinds of order, read from
 * `types/txtypes/constants.go` in the same repo the signer came from rather
 * than from prose, because sending the wrong one buys the wrong thing.
 */
export const LIGHTER_ORDER_TYPE = {
  limit: 0,
  market: 1,
  stopLoss: 2,
  stopLossLimit: 3,
  takeProfit: 4,
  takeProfitLimit: 5,
} as const

/**
 * How long an order may live. **Post-only is the one this app sends.** A
 * post-only order that would take the market is refused by Lighter instead
 * of filling, which is what `trading-rules.md` demands: this app never sends
 * a market order.
 */
export const LIGHTER_TIME_IN_FORCE = {
  immediateOrCancel: 0,
  goodTillTime: 1,
  postOnly: 2,
} as const

type SignerGlobals = {
  Go: new () => {
    importObject: WebAssembly.Imports
    run(instance: WebAssembly.Instance): void
  }
  /**
   * Both of Lighter's browser-build functions are curried and promise-shaped:
   * calling one returns a function, and calling THAT returns the promise.
   * The wrappers below hide that, so nothing else in the app has to know.
   */
  _createClientByPrv?: (
    privateKey: string,
    chainId: number,
    accountIndex: number,
    nonce: number,
    apiKeyIndex: number,
    skipNonce?: boolean
  ) => () => Promise<unknown>
  _createAuthToken?: (
    accountIndex: number,
    apiKeyIndex: number
  ) => () => Promise<unknown>
  /** Sizes and prices go as STRINGS of whole numbers, already scaled. */
  _signCreateOrder?: (
    accountIndex: number,
    marketIndex: number,
    clientOrderIndex: number,
    baseAmount: string,
    price: string,
    isAsk: number,
    orderType: number,
    timeInForce: number,
    reduceOnly: number,
    triggerPrice: string,
    orderExpiry: number,
    nonce: number
  ) => () => Promise<unknown>
  _signCancelOrder?: (
    accountIndex: number,
    marketIndex: number,
    orderIndex: string,
    nonce: number
  ) => () => Promise<unknown>
  /** Hundredths of a percent, then 0 cross or 1 isolated. */
  _signUpdateLeverage?: (
    accountIndex: number,
    marketIndex: number,
    initialMarginFraction: number,
    marginMode: number,
    nonce: number
  ) => () => Promise<unknown>
  /** Millionths of a dollar, then 0 to add or 1 to take back. */
  _signUpdateMargin?: (
    accountIndex: number,
    marketIndex: number,
    usdcAmount: number,
    direction: number,
    nonce: number
  ) => () => Promise<unknown>
}

let loading: Promise<SignerGlobals> | null = null

/**
 * Starts the Go runtime once and keeps it.
 *
 * `go.run` starts a scheduler that never finishes on purpose — Lighter's main
 * registers its functions and then blocks forever — so this must happen once
 * per process, not once per signature. Loading is about a second; a signature
 * after that is a couple of milliseconds.
 */
/** The binary is server data. Go's glue is bundled by the import above. */
const WASM_FILE = "lighter-signer.wasm"

/**
 * Reads the signer binary in each layout this module runs under.
 *
 * Nitro carries the web server's copy as a server asset. Direct Node tests and
 * development read the source file, while the worker reads the copy beside its
 * bundle. Lighter publishes these bytes openly, so the move is about keeping
 * 7.7 MB out of the website download folder rather than hiding a secret.
 */
async function signerBytes(): Promise<Uint8Array> {
  try {
    const { useStorage: nitroStorage } = await import("nitro/storage")
    const stored = await nitroStorage("assets").getItem(
      `lighter-signer/${WASM_FILE}`
    )
    if (stored instanceof Uint8Array) return stored
  } catch {
    // Direct Node tests and the worker have no Nitro virtual storage.
  }

  // `fileURLToPath`, not `.pathname`: this app's own checkout lives under
  // "Application Support", and a raw pathname leaves the space encoded.
  const beside = dirname(fileURLToPath(import.meta.url))
  const tried = [
    // Running from source or a direct Node test.
    join(beside, "assets"),
    join(
      process.cwd(),
      "src",
      "server",
      "protocols",
      "lighter",
      "signer",
      "assets"
    ),
    // The trading engine's build copies the binary beside its bundle.
    beside,
    join(process.cwd(), "worker", "dist"),
  ]
  for (const home of tried) {
    const file = join(home, WASM_FILE)
    if (existsSync(file)) return new Uint8Array(await readFile(file))
  }
  throw new Error(
    `LIGHTER_SIGNER_MISSING:Lighter's signing file is not on this server, so nothing Lighter can be signed. The build has to carry it as server data; looked in Nitro's server assets and ${tried.join(", ")}.`
  )
}

async function load(): Promise<SignerGlobals> {
  const scope = globalThis as unknown as SignerGlobals
  if (typeof scope.Go !== "function") {
    throw new Error("LIGHTER_SIGNER_UNAVAILABLE")
  }
  const go = new scope.Go()
  const bytes = await signerBytes()
  const { instance } = await WebAssembly.instantiate(
    bytes.slice().buffer as ArrayBuffer,
    go.importObject
  )
  go.run(instance)
  // Proven, not assumed: a build that instantiated but registered nothing
  // would otherwise fail later as "undefined is not a function", deep inside
  // a signing call with a key in hand.
  if (
    typeof scope._createClientByPrv !== "function" ||
    typeof scope._createAuthToken !== "function" ||
    typeof scope._signCreateOrder !== "function" ||
    typeof scope._signCancelOrder !== "function" ||
    typeof scope._signUpdateLeverage !== "function" ||
    typeof scope._signUpdateMargin !== "function"
  ) {
    throw new Error("LIGHTER_SIGNER_UNAVAILABLE")
  }
  return scope
}

function signer(): Promise<SignerGlobals> {
  loading ??= load().catch((error: unknown) => {
    // A failed load must not stick forever; the next attempt tries again.
    loading = null
    throw error
  })
  return loading
}

/** What Lighter answers when it will not accept a key or a request. */
function errorOf(answer: unknown): string | null {
  if (answer === null || typeof answer !== "object") return null
  const stated = (answer as { error?: unknown }).error
  return typeof stated === "string" && stated !== "" ? stated : null
}

export type LighterAuthToken = {
  /** `deadline:accountIndex:apiKeyIndex:signature`, as Lighter wants it. */
  token: string
  /** Epoch SECONDS the token stops being accepted. */
  deadline: number
}

/**
 * Loads a key into the signer and answers the public key Lighter would have
 * registered for it.
 *
 * The public key is the whole point of this call: comparing it against what
 * Lighter says is registered proves a pasted key belongs to an account,
 * without signing anything or spending an order.
 *
 * The key is held in the WASM's own memory afterwards, filed under the
 * account index. Loading the same account again replaces it, so only one key
 * per account is ever resident.
 */
export async function loadLighterKey(input: {
  privateKey: string
  accountIndex: number
  apiKeyIndex: number
  nonce?: number
}): Promise<{ publicKey: string }> {
  const scope = await signer()
  const answer = await scope._createClientByPrv!(
    input.privateKey,
    LIGHTER_CHAIN_ID,
    input.accountIndex,
    input.nonce ?? 0,
    input.apiKeyIndex
  )()
  const failed = errorOf(answer)
  // Lighter's message names the byte length it wanted and got, which is safe
  // to keep. It never contains the key.
  if (failed) throw new Error(`LIGHTER_SIGNER_KEY:${failed}`)
  const publicKey = (answer as { pk?: unknown }).pk
  if (typeof publicKey !== "string" || publicKey === "") {
    throw new Error("LIGHTER_SIGNER_KEY:no public key")
  }
  return { publicKey }
}

/**
 * One auth token for Lighter's private reads and its private socket
 * channels. `loadLighterKey` must have run for this account first.
 *
 * **Not called by a screen yet, and not dead.** Reading a Lighter account is
 * public, so nothing in the app needs a token today; the private fill stream
 * and the order path both will. It stays because it is the only thing that
 * proves the vendored binary can SIGN rather than merely derive a public key,
 * and that proof is the whole point of `signer.test.ts` — the biggest risk in
 * the Lighter work is this binary quietly not working.
 *
 * **Lighter's own build fixes the life of this token at one hour**, measured
 * 26 Aug 2026, whichever longer figure its written docs mention. Callers
 * renew against `deadline` rather than assuming any number.
 */
export async function lighterAuthToken(input: {
  accountIndex: number
  apiKeyIndex: number
}): Promise<LighterAuthToken> {
  const scope = await signer()
  const answer = await scope._createAuthToken!(
    input.accountIndex,
    input.apiKeyIndex
  )()
  const failed = errorOf(answer)
  if (failed) throw new Error(`LIGHTER_SIGNER_TOKEN:${failed}`)
  const token = (answer as { token?: unknown }).token
  const deadline = (answer as { deadline?: unknown }).deadline
  if (typeof token !== "string" || typeof deadline !== "number") {
    throw new Error("LIGHTER_SIGNER_TOKEN:unreadable answer")
  }
  return { token, deadline }
}

/**
 * Lighter's numbers for the KIND of transaction, which `sendTx` must be told
 * separately.
 *
 * The signer does not answer with them. Lighter's plain build returns a
 * `txType` beside the body and its own Node example reads one, but the
 * browser build vendored here returns only the body and its hash — so the
 * number comes from `types/txtypes/constants.go`, where the signer's own
 * source keeps it.
 */
export const LIGHTER_TX_TYPE = {
  createOrder: 14,
  cancelOrder: 15,
  cancelAllOrders: 16,
  modifyOrder: 17,
  updateLeverage: 20,
  updateMargin: 29,
} as const

/** A signed transaction body, ready for `sendTx` beside its type number. */
export type LighterSignedTx = {
  /** The signed body, as the JSON string Lighter wants posted verbatim. */
  txInfo: string
  txHash: string
}

function signedTxOf(answer: unknown, what: string): LighterSignedTx {
  const failed = errorOf(answer)
  if (failed) throw new Error(`LIGHTER_SIGNER_${what}:${failed}`)
  const row = (answer ?? {}) as { txInfo?: unknown; txHash?: unknown }
  if (typeof row.txInfo !== "string" || typeof row.txHash !== "string") {
    throw new Error(`LIGHTER_SIGNER_${what}:unreadable answer`)
  }
  return { txInfo: row.txInfo, txHash: row.txHash }
}

/**
 * Signs one order. Every number here is already a whole number scaled by the
 * market's own decimals — see `scaleLighterPrice` — because that is the only
 * shape Lighter accepts.
 *
 * **Nothing is sent.** This produces a signed body; posting it is the
 * client's job, and the two are kept apart so an order can be checked
 * without a network at all.
 */
export async function signLighterOrder(input: {
  accountIndex: number
  marketIndex: number
  /** The app's own order number, which comes back on the fill. */
  clientOrderIndex: number
  baseAmount: number
  price: number
  side: "buy" | "sell"
  orderType: number
  timeInForce: number
  reduceOnly: boolean
  triggerPrice?: number
  /** Epoch ms, or -1 for Lighter's own 28-day default. */
  orderExpiry?: number
  nonce: number
}): Promise<LighterSignedTx> {
  const scope = await signer()
  return signedTxOf(
    await scope._signCreateOrder!(
      input.accountIndex,
      input.marketIndex,
      input.clientOrderIndex,
      String(input.baseAmount),
      String(input.price),
      input.side === "sell" ? 1 : 0,
      input.orderType,
      input.timeInForce,
      input.reduceOnly ? 1 : 0,
      String(input.triggerPrice ?? 0),
      input.orderExpiry ?? -1,
      input.nonce
    )(),
    "ORDER"
  )
}

/** Signs the cancellation of one resting order, by Lighter's own order id. */
export async function signLighterCancel(input: {
  accountIndex: number
  marketIndex: number
  orderIndex: string
  nonce: number
}): Promise<LighterSignedTx> {
  const scope = await signer()
  return signedTxOf(
    await scope._signCancelOrder!(
      input.accountIndex,
      input.marketIndex,
      input.orderIndex,
      input.nonce
    )(),
    "CANCEL"
  )
}

/**
 * How Lighter states leverage in a transaction: hundredths of a percent of
 * the position's value, so 50x is 2% is 200.
 *
 * **Not the same units the account read uses.** A position states
 * `initial_margin_fraction` as a plain percent — "2.00" — while the market
 * catalogue and this transaction both count hundredths. Mixing the two sends
 * a leverage a hundred times off on real money, so the conversion lives here
 * and nowhere else.
 */
export function lighterMarginFraction(leverage: number): number {
  if (!(leverage > 0)) throw new Error("LIGHTER_LEVERAGE_INVALID")
  const fraction = Math.round(10_000 / leverage)
  // The field is a uint16 in Lighter's own transaction.
  if (fraction < 1 || fraction > 65_535) {
    throw new Error("LIGHTER_LEVERAGE_INVALID")
  }
  /**
   * **The rounding has to be harmless, not just legal.** Whole units run out
   * at the top: 20,000x rounds to one unit, and one unit is 10,000x — half
   * what was asked, sent without a word. So the number is turned back and
   * compared, and anything that does not survive the trip is refused instead
   * of quietly becoming a different leverage on real money.
   */
  const implied = 10_000 / fraction
  if (Math.abs(implied - leverage) / leverage > 0.005) {
    throw new Error("LIGHTER_LEVERAGE_INVALID")
  }
  return fraction
}

/** Cross and isolated, as Lighter's transactions number them. */
export const LIGHTER_MARGIN_MODE = { cross: 0, isolated: 1 } as const

/**
 * Signs the leverage and margin mode for one market.
 *
 * Argument order read from `web-wasm/main.go` at the pinned commit rather
 * than guessed: a wrong order here still signs, and the transaction is only
 * refused once it reaches Lighter — or worse, applied to the wrong market.
 */
export async function signLighterUpdateLeverage(input: {
  accountIndex: number
  marketIndex: number
  /** Hundredths of a percent — use `lighterMarginFraction`. */
  marginFraction: number
  marginMode: number
  nonce: number
}): Promise<LighterSignedTx> {
  const scope = await signer()
  return signedTxOf(
    await scope._signUpdateLeverage!(
      input.accountIndex,
      input.marketIndex,
      input.marginFraction,
      input.marginMode,
      input.nonce
    )(),
    "LEVERAGE"
  )
}

/**
 * Signs a change to the cash behind one isolated position.
 *
 * `usdcAmount` is a whole number of millionths, the same six decimals every
 * Lighter quote uses, and `direction` says which way it moves: 0 adds, 1
 * takes back. Lighter carries the direction separately, so the amount itself
 * is never negative.
 */
export async function signLighterUpdateMargin(input: {
  accountIndex: number
  marketIndex: number
  usdcAmount: number
  direction: number
  nonce: number
}): Promise<LighterSignedTx> {
  const scope = await signer()
  return signedTxOf(
    await scope._signUpdateMargin!(
      input.accountIndex,
      input.marketIndex,
      input.usdcAmount,
      input.direction,
      input.nonce
    )(),
    "MARGIN"
  )
}

/** Adding cash to a position, and taking it back. */
export const LIGHTER_MARGIN_DIRECTION = { add: 0, remove: 1 } as const
