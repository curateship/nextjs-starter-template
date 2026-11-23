import { createHmac } from "node:crypto"

import type { NetworkId } from "@/lib/protocols/contracts"
import {
  assertApexNotHeld,
  clearApexBudgets,
  holdApexLane,
  releaseApexLane,
  reserveApexRequest,
  type ApexPriority,
} from "@/server/protocols/apex/budget"
import { apexTimestamp, clearApexClocks } from "@/server/protocols/apex/clock"
import {
  apexIsClockRefusal,
  apexIsRationing,
  apexRefusalError,
  type ApexRefusalContext,
} from "@/server/protocols/apex/refusals"
import {
  ACT_TIMEOUT_MS,
  isTimeout,
  READ_TIMEOUT_MS,
  requestSignal,
} from "@/server/protocols/request-timeout"
import { scrubbedMessage } from "@/server/protocols/scrub"

/**
 * ApeX Omni's addresses. This folder and `lib/protocols/apex/` are the only
 * places that name one, and `fence.test.ts` fails the suite otherwise.
 *
 * Mainnet only (Tyler, 5 Sep 2026). ApeX's testnet twins on
 * `testnet.omni.apex.exchange` answered too and are deliberately not
 * carried, so the order path is proven the way Lighter's was: signed reads
 * first, then one tiny real order Tyler places himself.
 */
export function apexRestBase(network: NetworkId): string {
  if (network !== "mainnet") throw new Error("APEX_NETWORK_UNSUPPORTED")
  return (
    process.env.TRADE_APEX_REST?.trim() || "https://omni.apex.exchange/api/v3"
  ).replace(/\/+$/, "")
}

/** The quote host both sockets hang off, without a path. */
export function apexWsBase(network: NetworkId): string {
  if (network !== "mainnet") throw new Error("APEX_NETWORK_UNSUPPORTED")
  return (
    process.env.TRADE_APEX_WS?.trim() || "wss://quote.omni.apex.exchange"
  ).replace(/\/+$/, "")
}

/** The public lane every unsigned read shares. */
const PUBLIC_LANE = "public"

type Envelope = { code?: unknown; msg?: unknown; data?: unknown }

/**
 * ApeX answers a refusal on HTTP 200 with a `code` inside, so every answer's
 * code is read. A healthy answer carries no code at all (measured on every
 * public read, 24 Sep 2026); ApeX's own connector treats any truthy code as
 * a refusal, and so does this.
 */
function codeOf(payload: Envelope | null, status: number): string | null {
  if (payload && (typeof payload.code === "number" || typeof payload.code === "string")) {
    const code = String(payload.code)
    if (code !== "0" && code !== "") return code
  }
  return status >= 200 && status < 300 ? null : String(status)
}

function busyError(seconds: number): Error {
  return new Error(
    `EXCHANGE_BUSY:ApeX Omni — asked Trade to slow down, asking again in ${seconds} seconds`
  )
}

async function readEnvelope(response: Response): Promise<Envelope | null> {
  return (await response.json().catch(() => null)) as Envelope | null
}

/**
 * One budgeted public read, unwrapped to its `data`.
 *
 * `priority` as on Lighter: `"watched"` for a chart somebody just opened,
 * `"order"` for a read needed to accept an order.
 */
export async function apexPublic(
  network: NetworkId,
  path: string,
  params: Record<string, string | number> = {},
  priority: ApexPriority = "background"
): Promise<unknown> {
  assertApexNotHeld(network, PUBLIC_LANE)
  const url = new URL(`${apexRestBase(network)}${path}`)
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value))
  }
  reserveApexRequest(network, { priority })

  let response: Response
  try {
    response = await fetch(url, {
      headers: { accept: "application/json" },
      signal: requestSignal(READ_TIMEOUT_MS),
    })
  } catch (error) {
    if (isTimeout(error)) throw new Error("EXCHANGE_BUSY:ApeX Omni — did not answer in time")
    throw new Error(scrubbedMessage(error))
  }
  const payload = await readEnvelope(response)
  const code = codeOf(payload, response.status)
  if (code !== null && apexIsRationing(response.status, code)) {
    throw busyError(holdApexLane(network, PUBLIC_LANE) / 1_000)
  }
  if (code !== null) {
    throw apexRefusalError({ status: response.status, code, msg: payload?.msg })
  }
  releaseApexLane(network, PUBLIC_LANE)
  return payload?.data
}

/** ApeX's own time, which every signed request is stamped with. */
async function readApexTime(network: NetworkId): Promise<number> {
  const data = (await apexPublic(network, "/time", {}, "order")) as {
    time?: unknown
  } | null
  return typeof data?.time === "number" ? data.time : Number.NaN
}

/** ApeX's time now, for a stamp that is not a REST request (the socket login). */
export function apexNow(network: NetworkId): Promise<number> {
  return apexTimestamp({ network, readTime: readApexTime })
}

/**
 * The credentials one ApeX wallet signs with, all four copied from ApeX's
 * API management page. The key, secret and passphrase sign each request;
 * the omni key is the zkLink seed every order is signed with. The wallet's
 * own Ethereum key is never asked for, so nothing here can withdraw.
 */
export type ApexCredential = {
  key: string
  secret: string
  passphrase: string
  omniKey: string
}

/**
 * The sorted `key=value` string ApeX signs and receives.
 *
 * Sorted by name, as ApeX's docs and both its SDKs do. Empty values are left
 * out, the way its Node connector leaves them out. Values are written as
 * they are, unencoded: every value this app sends is digits, letters, dots,
 * dashes or underscores, so the signed string and the sent string are the
 * same text. A value outside that set is refused rather than encoded, since
 * encoding one side and not the other is a forgery as far as ApeX can tell.
 */
export function apexDataString(
  params: Record<string, string | number | boolean | undefined | null>
): string {
  return Object.keys(params)
    .sort()
    .flatMap((name) => {
      const value = params[name]
      if (value === undefined || value === null || value === "") return []
      const text = String(value)
      if (!/^[0-9A-Za-z._-]+$/.test(text)) throw new Error("APEX_PARAM_UNSAFE")
      return [`${name}=${text}`]
    })
    .join("&")
}

/**
 * ApeX's request signature: HMAC-SHA256 over timestamp, method, path and
 * data string, keyed with the base64 of the secret, answered in base64.
 * Read from ApeX's docs and `PrivateApi.sign` in its Node connector.
 */
export function apexSignature(input: {
  timestamp: number
  method: "GET" | "POST"
  path: string
  data: string
  secret: string
}): string {
  const key = Buffer.from(input.secret).toString("base64")
  return createHmac("sha256", key)
    .update(`${input.timestamp}${input.method}${input.path}${input.data}`)
    .digest("base64")
}

/**
 * One signed request, unwrapped to its `data`.
 *
 * **Nothing is retried except the one clock case.** A 20002 means ApeX
 * refused the timestamp before looking at anything else, so the request
 * never happened: the clock is re-read once and the same request goes out
 * once more with a fresh stamp. A second 20002 is refused. Anything else is
 * never resent, because a resent order is a possible double order.
 */
export async function apexPrivate(
  network: NetworkId,
  credential: ApexCredential,
  method: "GET" | "POST",
  path: string,
  params: Record<string, string | number | boolean | undefined | null> = {},
  options: { priority?: ApexPriority; context?: ApexRefusalContext } = {}
): Promise<unknown> {
  const priority = options.priority ?? (method === "POST" ? "order" : "background")
  const data = apexDataString(params)
  // The signed path is the full path ApeX sees, version prefix included.
  const prefix = new URL(apexRestBase(network)).pathname.replace(/\/+$/, "")
  const signedPath = method === "GET" && data ? `${prefix}${path}?${data}` : `${prefix}${path}`
  const url = `${apexRestBase(network)}${method === "GET" && data ? `${path}?${data}` : path}`

  for (const refresh of [false, true]) {
    assertApexNotHeld(network, PUBLIC_LANE)
    assertApexNotHeld(network, credential.key)
    const timestamp = await apexTimestamp({
      network,
      readTime: readApexTime,
      refresh,
    })
    reserveApexRequest(network, {
      priority,
      account: { key: credential.key, method },
    })
    const body = method === "POST" ? data : ""
    let response: Response
    try {
      response = await fetch(url, {
        method,
        headers: {
          accept: "application/json",
          ...(method === "POST"
            ? { "content-type": "application/x-www-form-urlencoded" }
            : {}),
          "APEX-API-KEY": credential.key,
          "APEX-PASSPHRASE": credential.passphrase,
          "APEX-TIMESTAMP": String(timestamp),
          "APEX-SIGNATURE": apexSignature({
            timestamp,
            method,
            path: signedPath,
            data: body,
            secret: credential.secret,
          }),
        },
        ...(method === "POST" ? { body } : {}),
        signal: requestSignal(method === "POST" ? ACT_TIMEOUT_MS : READ_TIMEOUT_MS),
      })
    } catch (error) {
      if (!isTimeout(error)) throw new Error(scrubbedMessage(error))
      throw new Error(
        method === "POST"
          ? "LIVE_NO_ANSWER:ApeX Omni did not answer in time. The change may or may not have gone through, so check ApeX's own site before trying again."
          : "EXCHANGE_BUSY:ApeX Omni — did not answer in time"
      )
    }
    const payload = await readEnvelope(response)
    const code = codeOf(payload, response.status)
    if (code === null) {
      releaseApexLane(network, credential.key)
      return payload?.data
    }
    if (apexIsRationing(response.status, code)) {
      const lane = response.status === 403 ? PUBLIC_LANE : credential.key
      throw busyError(holdApexLane(network, lane) / 1_000)
    }
    if (apexIsClockRefusal(code) && !refresh) continue
    throw apexRefusalError(
      { status: response.status, code, msg: payload?.msg },
      options.context
    )
  }
  // Unreachable: the second pass either returns or throws.
  throw new Error("APEX_CLOCK")
}

/**
 * Folds the Add wallet window's fields into the one string that is
 * encrypted and stored.
 *
 * The window has one "API values" box and a Passphrase box. The box is a
 * single line, and a browser strips line breaks out of a single-line field,
 * so the three values go in it separated by spaces: the API key, the secret
 * and the omni key. The omni key is found by its shape, 130 hex characters,
 * wherever it sits; the other two are taken in the order ApeX's page lists
 * them. A label pasted with a value ("API Key:") is ignored.
 *
 * Opaque outside this folder, as `OrderAuth.agentKey` requires.
 */
export function packApexCredential(input: {
  agentKey?: string
  secret?: string
  passphrase?: string
}): string {
  const pasted = (input.secret ?? input.agentKey ?? "").trim()
  if (!pasted) throw new Error("KEY_SECRET_REQUIRED")
  const passphrase = input.passphrase?.trim() ?? ""
  if (!passphrase) throw new Error("KEY_PASSPHRASE_REQUIRED")
  const tokens = pasted
    .replace(/\b(?:api\s*key|api\s*secret|secret|passphrase|omni\s*key|key|seeds?)\s*[:=]/gi, " ")
    .split(/[\s,;]+/)
    .filter(Boolean)
  const omniAt = tokens.findIndex((token) =>
    /^(?:0x)?[0-9a-fA-F]{130}$/.test(token)
  )
  const rest = tokens.filter((_, index) => index !== omniAt)
  if (omniAt === -1 || rest.length !== 2) {
    throw new Error(
      "KEY_NOT_APPROVED:Paste three values from ApeX's API management page into API values, separated by spaces: the API key, the secret and the omni key. The omni key is 130 hex characters. The passphrase goes in its own box."
    )
  }
  const credential: ApexCredential = {
    key: rest[0],
    secret: rest[1],
    passphrase,
    omniKey: `0x${tokens[omniAt].replace(/^0x/i, "").toLowerCase()}`,
  }
  return JSON.stringify(credential)
}

/**
 * Reads back what `packApexCredential` stored. A blob that no longer reads
 * is a stored-credential problem, refused with the code the trading paths
 * already know. Never echoes any part of it.
 */
export function parseApexCredential(blob: string | null): ApexCredential {
  if (!blob) throw new Error("LIVE_WALLET_KEY")
  let parsed: unknown
  try {
    parsed = JSON.parse(blob)
  } catch {
    throw new Error("LIVE_WALLET_KEY")
  }
  const one = parsed as Partial<Record<keyof ApexCredential, unknown>>
  const text = (value: unknown) => (typeof value === "string" ? value : "")
  const credential = {
    key: text(one.key),
    secret: text(one.secret),
    passphrase: text(one.passphrase),
    omniKey: text(one.omniKey),
  }
  if (Object.values(credential).some((value) => value === "")) {
    throw new Error("LIVE_WALLET_KEY")
  }
  return credential
}

/** Test state must not carry a spent minute, a hold or a clock across cases. */
export function clearApexClientState(): void {
  clearApexBudgets()
  clearApexClocks()
}
