import { createHmac } from "node:crypto"

import type { NetworkId } from "@/lib/protocols/contracts"
import {
  assertEdgexNotHeld,
  clearEdgexBudgets,
  holdEdgexLane,
  releaseEdgexLane,
  reserveEdgexRequest,
  type EdgexPriority,
} from "@/server/protocols/edgex/budget"
import { clearEdgexClocks, edgexTimestamp } from "@/server/protocols/edgex/clock"
import {
  edgexIsClockRefusal,
  edgexIsRationing,
  edgexRefusalError,
  type EdgexRefusalContext,
} from "@/server/protocols/edgex/refusals"
import {
  ACT_TIMEOUT_MS,
  isTimeout,
  READ_TIMEOUT_MS,
  requestSignal,
} from "@/server/protocols/request-timeout"
import { scrubbedMessage } from "@/server/protocols/scrub"

/**
 * edgeX's addresses. This folder and `lib/protocols/edgex/` are the only
 * places that name one, and `fence.test.ts` fails the suite otherwise.
 *
 * **Only the v2 host.** edgeX's older host still lists its markets but
 * answers no prices, candles or funding, and signs orders a different way,
 * so it is never named anywhere in the code.
 *
 * Mainnet only: edgeX's practice network redirects to a staff-only login
 * (Tyler, 5 Sep 2026). The first order is one tiny real one Tyler places.
 */
export function edgexRestBase(network: NetworkId): string {
  if (network !== "mainnet") throw new Error("EDGEX_NETWORK_UNSUPPORTED")
  return (
    process.env.TRADE_EDGEX_REST?.trim() || "https://edgex-prod-v2.edgex.exchange"
  ).replace(/\/+$/, "")
}

/** The quote host both sockets hang off, without a path. */
export function edgexWsBase(network: NetworkId): string {
  if (network !== "mainnet") throw new Error("EDGEX_NETWORK_UNSUPPORTED")
  return (
    process.env.TRADE_EDGEX_WS?.trim() || "wss://edgex-quote-prod-v2.edgex.exchange"
  ).replace(/\/+$/, "")
}

/** The public lane every unsigned read shares. */
const PUBLIC_LANE = "public"

type Envelope = { code?: unknown; data?: unknown }

/**
 * Every edgeX answer carries `code`, and `SUCCESS` is the only healthy one.
 * A refusal comes on a 4xx or on an ordinary 200, so the status alone is
 * never trusted. Nothing but the code is kept: `msg` and `errorParam` quote
 * the request back, key included.
 */
function codeOf(payload: Envelope | null, status: number): string | null {
  const code = typeof payload?.code === "string" ? payload.code : null
  if (code === "SUCCESS" && status >= 200 && status < 300) return null
  if (code && /^[A-Z0-9_]{1,80}$/.test(code)) return code
  return `HTTP_${status}`
}

function busyError(network: NetworkId, lane: string): Error {
  const hold = holdEdgexLane(network, lane)
  return new Error(
    `EXCHANGE_BUSY:edgeX — asked Trade to slow down ${hold.count === 1 ? "once" : `${hold.count} times in a row`}, asking again in ${hold.lastMs / 1_000} seconds`
  )
}

async function readEnvelope(response: Response): Promise<Envelope | null> {
  return (await response.json().catch(() => null)) as Envelope | null
}

/**
 * The query string edgeX signs and receives: `key=value` pairs sorted by
 * name, empty values left out, as both of edgeX's SDKs build it. The values
 * are the signed text as they are; the URL carries them encoded, and edgeX
 * decodes before it checks.
 */
export function edgexQueryString(
  params: Record<string, string | number | undefined | null>
): string {
  return Object.keys(params)
    .sort()
    .flatMap((name) => {
      const value = params[name]
      if (value === undefined || value === null || value === "") return []
      return [`${name}=${String(value)}`]
    })
    .join("&")
}

/**
 * A request body as the text edgeX signs it: every key sorted, `key=value`
 * joined by `&`; a list's items joined by `&`; an object folded the same way
 * as the body; true and false in lower case. This is `getValue` in edgeX's
 * Go and Python SDKs, line for line.
 *
 * Trade never sends a null: a field with nothing to say is left out of the
 * body, so the signed text and the sent JSON always name the same fields.
 */
export function edgexSignedValue(value: unknown): string {
  if (value === null || value === undefined) return ""
  if (typeof value === "string") return value
  if (typeof value === "boolean") return value ? "true" : "false"
  if (typeof value === "number") return String(value)
  if (Array.isArray(value)) return value.map(edgexSignedValue).join("&")
  if (typeof value === "object") {
    const record = value as Record<string, unknown>
    return Object.keys(record)
      .sort()
      .map((key) => `${key}=${edgexSignedValue(record[key])}`)
      .join("&")
  }
  return String(value)
}

/**
 * edgeX's request signature: HMAC-SHA256 over timestamp, method, path and
 * the sorted parameters, keyed with **the base64 of the secret's text**,
 * answered in hex.
 *
 * The task notes said "base64-decoded secret". edgeX's authentication page,
 * its Go SDK (`base64.StdEncoding.EncodeToString([]byte(c.apiSecret))`) and
 * its Python SDK (`base64.b64encode(api_secret.encode())`) all encode it, so
 * this encodes it.
 */
export function edgexSignature(input: {
  timestamp: number
  method: "GET" | "POST"
  path: string
  body: string
  secret: string
}): string {
  const key = Buffer.from(input.secret).toString("base64")
  return createHmac("sha256", key)
    .update(`${input.timestamp}${input.method}${input.path}${input.body}`)
    .digest("hex")
}

/**
 * One budgeted public read, unwrapped to its `data`.
 *
 * `priority` as on Lighter: `"watched"` for a chart somebody just opened,
 * `"order"` for a read needed to accept an order.
 */
export async function edgexPublic(
  network: NetworkId,
  path: string,
  params: Record<string, string | number | undefined | null> = {},
  priority: EdgexPriority = "background"
): Promise<unknown> {
  assertEdgexNotHeld(network, PUBLIC_LANE)
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") query.set(key, String(value))
  }
  const text = query.toString()
  const url = `${edgexRestBase(network)}${path}${text ? `?${text}` : ""}`
  reserveEdgexRequest(network, priority)

  let response: Response
  try {
    response = await fetch(url, {
      headers: { accept: "application/json" },
      signal: requestSignal(READ_TIMEOUT_MS),
    })
  } catch (error) {
    if (isTimeout(error)) throw new Error("EXCHANGE_BUSY:edgeX — did not answer in time")
    throw new Error(scrubbedMessage(error))
  }
  const payload = await readEnvelope(response)
  if (edgexIsRationing(response.status)) throw busyError(network, PUBLIC_LANE)
  const code = codeOf(payload, response.status)
  if (code !== null) throw edgexRefusalError({ status: response.status, code })
  releaseEdgexLane(network, PUBLIC_LANE)
  return payload?.data
}

/** edgeX's own time, which every signed request is stamped with. */
async function readEdgexTime(network: NetworkId): Promise<number> {
  const data = (await edgexPublic(network, "/api/v2/public/meta/getServerTime", {}, "order")) as {
    timeMillis?: unknown
  } | null
  return Number(data?.timeMillis ?? Number.NaN)
}

/** edgeX's time now, for a stamp that is not a REST request (the socket). */
export function edgexNow(network: NetworkId): Promise<number> {
  return edgexTimestamp({ network, readTime: readEdgexTime })
}

/**
 * The values one edgeX wallet signs with, all copied from edgeX's
 * API Management → Perps V2 → SDK Signer dialog. The key, secret and
 * passphrase sign each request; the signer key signs every order. The
 * wallet's own key is never asked for, so nothing here can withdraw.
 */
export type EdgexCredential = {
  accountId: string
  key: string
  secret: string
  passphrase: string
  signerKey: `0x${string}`
}

/** The four headers every private request and the private socket carry. */
export function edgexAuthHeaders(input: {
  credential: EdgexCredential
  timestamp: number
  method: "GET" | "POST"
  path: string
  body: string
}): Record<string, string> {
  return {
    "X-edgeX-Api-Key": input.credential.key,
    "X-edgeX-Passphrase": input.credential.passphrase,
    "X-edgeX-Timestamp": String(input.timestamp),
    "X-edgeX-Signature": edgexSignature({
      timestamp: input.timestamp,
      method: input.method,
      path: input.path,
      body: input.body,
      secret: input.credential.secret,
    }),
  }
}

/**
 * One signed request, unwrapped to its `data`.
 *
 * GET parameters are signed as the sorted query; a POST body is signed with
 * `edgexSignedValue` and sent as the same object in JSON. `accountId` is
 * filled in here, so no caller can name a different account.
 *
 * **Nothing is retried except the one clock case.** A timestamp refusal means
 * edgeX refused the request before looking at it, so the request never
 * happened: the clock is re-read once and the same request goes out once
 * more with a fresh stamp. A second one is refused. Anything else is never
 * resent, because a resent order is a possible double order.
 */
export async function edgexPrivate(
  network: NetworkId,
  credential: EdgexCredential,
  method: "GET" | "POST",
  path: string,
  params: Record<string, unknown> = {},
  options: { priority?: EdgexPriority; context?: EdgexRefusalContext } = {}
): Promise<unknown> {
  const priority = options.priority ?? (method === "POST" ? "order" : "background")
  const withAccount: Record<string, unknown> = { ...params, accountId: credential.accountId }
  let signedBody: string
  let url: string
  let sentBody: string | undefined
  if (method === "GET") {
    const query = withAccount as Record<string, string | number | undefined | null>
    signedBody = edgexQueryString(query)
    const encoded = new URLSearchParams()
    for (const key of Object.keys(query).sort()) {
      const value = query[key]
      if (value !== undefined && value !== null && value !== "") encoded.set(key, String(value))
    }
    url = `${edgexRestBase(network)}${path}?${encoded.toString()}`
  } else {
    const body = Object.fromEntries(
      Object.entries(withAccount).filter(([, value]) => value !== undefined && value !== null)
    )
    signedBody = edgexSignedValue(body)
    sentBody = JSON.stringify(body)
    url = `${edgexRestBase(network)}${path}`
  }

  for (const refresh of [false, true]) {
    assertEdgexNotHeld(network, PUBLIC_LANE)
    assertEdgexNotHeld(network, credential.key)
    const timestamp = await edgexTimestamp({ network, readTime: readEdgexTime, refresh })
    reserveEdgexRequest(network, priority)
    let response: Response
    try {
      response = await fetch(url, {
        method,
        headers: {
          accept: "application/json",
          ...(method === "POST" ? { "content-type": "application/json" } : {}),
          ...edgexAuthHeaders({ credential, timestamp, method, path, body: signedBody }),
        },
        ...(sentBody !== undefined ? { body: sentBody } : {}),
        signal: requestSignal(method === "POST" ? ACT_TIMEOUT_MS : READ_TIMEOUT_MS),
      })
    } catch (error) {
      if (!isTimeout(error)) throw new Error(scrubbedMessage(error))
      throw new Error(
        method === "POST"
          ? "LIVE_NO_ANSWER:edgeX did not answer in time. The change may or may not have gone through, so check edgeX's own site before trying again."
          : "EXCHANGE_BUSY:edgeX — did not answer in time"
      )
    }
    const payload = await readEnvelope(response)
    if (edgexIsRationing(response.status)) throw busyError(network, credential.key)
    const code = codeOf(payload, response.status)
    if (code === null) {
      releaseEdgexLane(network, credential.key)
      return payload?.data
    }
    if (edgexIsClockRefusal(code) && !refresh) continue
    throw edgexRefusalError({ status: response.status, code }, options.context)
  }
  // Unreachable: the second pass either returns or throws.
  throw new Error("EDGEX_CLOCK")
}

const HEX_KEY = /^(?:0x)?[0-9a-fA-F]{64}$/

/**
 * Which of three pasted values is the signer key, or -1 when none can be.
 *
 * edgeX's SDK Signer dialog lists Private Key, API Key and secret, in that
 * order (its docs' screenshot), and the API key and secret are both long
 * enough to be 64 hex characters too. So the shape decides only when it
 * points at one value: the one written with `0x`, or else the only 64-hex
 * one. When it cannot tell, the dialog's order does, and the first value is
 * the signer key. A wrong guess is refused by the sign-in check, never saved.
 */
function signerIndexOf(tokens: readonly string[]): number {
  const hex = tokens.flatMap((token, index) => (HEX_KEY.test(token) ? [index] : []))
  if (hex.length === 0) return -1
  const prefixed = hex.filter((index) => /^0x/i.test(tokens[index]))
  if (prefixed.length === 1) return prefixed[0]
  if (hex.length === 1) return hex[0]
  return hex.includes(0) ? 0 : -1
}

/**
 * Folds the Add wallet window's fields into the one string that is
 * encrypted and stored.
 *
 * The window has the account id in its first box, one "SDK Signer values"
 * box and a Passphrase box. The values box is a single line, and a browser
 * strips line breaks out of a single-line box, so the three values go in it
 * separated by spaces, in the order edgeX's dialog shows them: the private
 * (signer) key, the API key and the secret. The signer key is found by its
 * shape where that is enough (`signerIndexOf`); the other two keep the
 * dialog's order, API key before secret. A label pasted with a value
 * ("API Key:") is ignored.
 *
 * Opaque outside this folder, as `OrderAuth.agentKey` requires.
 */
export function packEdgexCredential(input: {
  address?: string
  agentKey?: string
  secret?: string
  passphrase?: string
}): string {
  const accountId = input.address?.trim() ?? ""
  if (!/^\d{1,20}$/.test(accountId)) {
    throw new Error(
      "KEY_NOT_APPROVED:The account id is the number in the Account ID column of edgeX's API Management list, digits only."
    )
  }
  const pasted = (input.secret ?? input.agentKey ?? "").trim()
  if (!pasted) throw new Error("KEY_SECRET_REQUIRED")
  const passphrase = input.passphrase?.trim() ?? ""
  if (!passphrase) throw new Error("KEY_PASSPHRASE_REQUIRED")
  const tokens = pasted
    .replace(
      /\b(?:api\s*key|api\s*secret|secret|passphrase|signer\s*key|private\s*key|key|account\s*id)\s*[:=]/gi,
      " "
    )
    .split(/[\s,;]+/)
    .filter(Boolean)
  const signerAt = tokens.length === 3 ? signerIndexOf(tokens) : -1
  const rest = tokens.filter((_, index) => index !== signerAt)
  if (signerAt === -1 || rest.length !== 2) {
    throw new Error(
      "KEY_NOT_APPROVED:Paste three values from edgeX's SDK Signer dialog into SDK Signer values, separated by spaces, in the order the dialog shows them: the Private Key, the API Key and the secret. The Private Key is 64 hex characters. The passphrase goes in its own box."
    )
  }
  const credential: EdgexCredential = {
    accountId,
    key: rest[0],
    secret: rest[1],
    passphrase,
    signerKey: `0x${tokens[signerAt].replace(/^0x/i, "").toLowerCase()}`,
  }
  return JSON.stringify(credential)
}

/**
 * Reads back what `packEdgexCredential` stored. A blob that no longer reads
 * is a stored-credential problem, refused with the code the trading paths
 * already know. Never echoes any part of it.
 */
export function parseEdgexCredential(blob: string | null): EdgexCredential {
  if (!blob) throw new Error("LIVE_WALLET_KEY")
  let parsed: unknown
  try {
    parsed = JSON.parse(blob)
  } catch {
    throw new Error("LIVE_WALLET_KEY")
  }
  const one = parsed as Partial<Record<keyof EdgexCredential, unknown>>
  const text = (value: unknown) => (typeof value === "string" ? value : "")
  const credential = {
    accountId: text(one.accountId),
    key: text(one.key),
    secret: text(one.secret),
    passphrase: text(one.passphrase),
    signerKey: text(one.signerKey),
  }
  if (
    Object.values(credential).some((value) => value === "") ||
    !/^\d{1,20}$/.test(credential.accountId) ||
    !/^0x[0-9a-f]{64}$/.test(credential.signerKey)
  ) {
    throw new Error("LIVE_WALLET_KEY")
  }
  return { ...credential, signerKey: credential.signerKey as `0x${string}` }
}

/** Test state must not carry a spent minute, a hold or a clock across cases. */
export function clearEdgexClientState(): void {
  clearEdgexBudgets()
  clearEdgexClocks()
}
