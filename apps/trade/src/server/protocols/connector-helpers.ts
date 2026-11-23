import type {
  NetworkId,
  OrderAuth,
  PlaceOrderParams,
} from "@/lib/protocols/contracts"
import {
  loadHeldPromise,
  type TimedPromise,
} from "@/lib/protocols/promise-cache"
import { scrubbedMessage } from "@/server/protocols/scrub"

export {
  loadHeldPromise,
  rememberPromise,
  type TimedPromise,
} from "@/lib/protocols/promise-cache"

/**
 * Whether an exchange answer may stand on its age or a live feed's word. The
 * feed predicate is supplied by the connector, so this helper never branches
 * on an exchange name.
 */
export function heldAnswerStillStands(
  at: number,
  goodForMs: number,
  maximumMs: number,
  quietSince: () => boolean,
  now: number = Date.now()
): boolean {
  const age = now - at
  if (age < goodForMs) return true
  if (age >= maximumMs) return false
  return quietSince()
}

/** Applies the shared age rule with one connector's quiet-since function. */
export function connectorAnswerStillStands(
  network: NetworkId,
  keyId: string,
  credential: () => string | null,
  at: number,
  goodForMs: number,
  maximumMs: number,
  quietSince: (
    network: NetworkId,
    keyId: string,
    credential: () => string | null,
    at: number
  ) => boolean
): boolean {
  return heldAnswerStillStands(at, goodForMs, maximumMs, () =>
    quietSince(network, keyId, credential, at)
  )
}

type ConnectorHeldOptions = {
  network: NetworkId
  keyId: string
  credential: () => string | null
  goodForMs: number
  maximumMs: number
  quietSince: (
    network: NetworkId,
    keyId: string,
    credential: () => string | null,
    at: number
  ) => boolean
}

/** Reads through the age-and-private-feed cache shared by signed connectors. */
export function loadConnectorHeldPromise<K, V>(
  cache: Map<K, TimedPromise<V>>,
  key: K,
  options: ConnectorHeldOptions,
  load: () => Promise<V>
): Promise<V> {
  return loadHeldPromise(
    cache,
    key,
    (at) =>
      connectorAnswerStillStands(
        options.network,
        options.keyId,
        options.credential,
        at,
        options.goodForMs,
        options.maximumMs,
        options.quietSince
      ),
    load
  )
}

type DecimalOptions = {
  allowNegative?: boolean
  errorCode?: "LIVE_PRICE" | "LIVE_SIZE"
  maximumFractionDigits?: number
}

/** A finite number as plain decimal text, with negative order values refused. */
export function decimalString(
  value: number,
  options: DecimalOptions = {}
): string {
  const errorCode = options.errorCode ?? "LIVE_PRICE"
  if (!Number.isFinite(value) || (value < 0 && !options.allowNegative)) {
    throw new Error(errorCode)
  }

  const sign = value < 0 ? "-" : ""
  const maximumFractionDigits = options.maximumFractionDigits ?? 12
  if (
    !Number.isInteger(maximumFractionDigits) ||
    maximumFractionDigits < 0 ||
    maximumFractionDigits > 100
  ) {
    throw new Error(errorCode)
  }
  const rounded = Number(Math.abs(value).toFixed(maximumFractionDigits))
  const printed = String(rounded)
  const exponentAt = printed.search(/e/i)
  if (exponentAt === -1) return `${sign}${printed}`

  const coefficient = printed.slice(0, exponentAt)
  const exponent = Number(printed.slice(exponentAt + 1))
  const [whole, fraction = ""] = coefficient.split(".")
  const digits = `${whole}${fraction}`
  const pointAt = whole.length + exponent
  if (pointAt <= 0) return `${sign}0.${"0".repeat(-pointAt)}${digits}`
  if (pointAt >= digits.length) {
    return `${sign}${digits}${"0".repeat(pointAt - digits.length)}`
  }
  return `${sign}${digits.slice(0, pointAt)}.${digits.slice(pointAt)}`
}

/** Refuses a negative or unreadable size or price before an exchange request. */
export function assertOrderValue(
  value: number,
  errorCode: "LIVE_PRICE" | "LIVE_SIZE"
): void {
  if (!Number.isFinite(value) || value < 0) throw new Error(errorCode)
}

/** Checks every price and size that may leave with an entry order. */
export function assertPlaceOrderValues(
  params: Pick<PlaceOrderParams, "px" | "sz" | "tpPx" | "slPx">
): void {
  assertOrderValue(params.sz, "LIVE_SIZE")
  assertOrderValue(params.px, "LIVE_PRICE")
  if (params.tpPx !== null) assertOrderValue(params.tpPx, "LIVE_PRICE")
  if (params.slPx !== null) assertOrderValue(params.slPx, "LIVE_PRICE")
}

type BracketValues = {
  targets: ReadonlyArray<{ px: number; sz: number | null }>
  slPx: number | null
  slSz: number | null
}

/** Checks a complete replacement before any old or new protection can move. */
export function assertBracketValues(params: BracketValues): void {
  if (params.slPx !== null) {
    assertOrderValue(params.slPx, "LIVE_PRICE")
    if (params.slSz !== null) assertOrderValue(params.slSz, "LIVE_SIZE")
  }
  for (const target of params.targets) {
    assertOrderValue(target.px, "LIVE_PRICE")
    if (target.sz !== null) assertOrderValue(target.sz, "LIVE_SIZE")
  }
}

/** Opens an order credential for one call without giving it another lifetime. */
export function orderCredential<T>(
  orderAuth: OrderAuth,
  parse: (value: string) => T
): T {
  return parse(orderAuth.agentKey)
}

type ConnectorErrorOptions = {
  explain: (reason: string) => string
  refusedWhen?: (message: string) => boolean
  credentialRefused?: (error: unknown) => boolean
}

/** Builds the two error paths shared by signed connector requests. */
export function connectorErrors(options: ConnectorErrorOptions): {
  exchange: (error: unknown) => Error
  refused: (error: unknown) => Error
} {
  function common(error: unknown): Error | null {
    const message = error instanceof Error ? error.message : String(error)
    if (message === "EXCHANGE_BUSY") return new Error("EXCHANGE_BUSY")
    if (options.credentialRefused?.(error)) return new Error("LIVE_WALLET_KEY")
    return null
  }

  function exchange(error: unknown): Error {
    const known = common(error)
    if (known) return known
    return new Error(`LIVE_EXCHANGE:${options.explain(scrubbedMessage(error))}`)
  }

  function refused(error: unknown): Error {
    const known = common(error)
    if (known) return known
    const message = error instanceof Error ? error.message : String(error)
    if (options.refusedWhen?.(message)) {
      return new Error(
        `LIVE_ORDER_REFUSED:${options.explain(scrubbedMessage(error))}`
      )
    }
    return exchange(error)
  }

  return { exchange, refused }
}
