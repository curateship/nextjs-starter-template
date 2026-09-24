import { createHmac } from "node:crypto"

import type { NetworkId } from "@/lib/protocols/contracts"
import { binanceRefusal, isClockRefusal } from "@/server/protocols/binance/refusals"
import {
  ACT_TIMEOUT_MS,
  isTimeout,
  READ_TIMEOUT_MS,
  requestSignal,
} from "@/server/protocols/request-timeout"
import { scrubbedMessage } from "@/server/protocols/scrub"

/**
 * How every signed Binance request is made: the hosts, the signature, the
 * clock, and the request allowance. Everything that trades goes through
 * `binanceSigned`, so these rules live once.
 *
 * **Signing.** A private call carries the API key in the `X-MBX-APIKEY`
 * header and ends its query with `timestamp`, `recvWindow` and `signature`,
 * the hex HMAC-SHA256 of the query as sent, keyed with the API secret.
 * Binance's docs call these HMAC keys. Binance also issues Ed25519 and RSA
 * keys, which sign differently and are not accepted here.
 *
 * Mainnet only. Binance's futures testnet needs a separate testnet account,
 * and the task keeps it out (`binance.md`).
 */

const FAPI = "https://fapi.binance.com"
/** The spot host, used only to read what an API key is allowed to do. */
const SAPI = "https://api.binance.com"

export function requireBinanceMainnet(network: NetworkId): void {
  if (network !== "mainnet") throw new Error("BINANCE_NETWORK_UNSUPPORTED")
}

/**
 * Binance's request allowance per internet address, read from
 * `rateLimits` in `/fapi/v1/exchangeInfo` on 24 Sep 2026: 2,400 units a
 * minute. Orders are counted separately (1,200 a minute, 300 per ten
 * seconds per account) and spend nothing from this one.
 *
 * Every answer states how much of the minute is spent in
 * `x-mbx-used-weight-1m`, and that figure includes the backtest's candle
 * reads from the same server. Past 2,000 units, background reads stop until
 * the minute rolls over, so an order still has room. Binance blocks the
 * address outright after repeated refusals, which is the one failure worth
 * all this care.
 */
const WEIGHT_SOFT_LIMIT = 2_000
const DEFAULT_HOLD_MS = 20_000
/** How long Binance keeps a signed request valid after its timestamp. */
const RECV_WINDOW_MS = 5_000
const CLOCK_GOOD_FOR_MS = 5 * 60_000

export type BinancePriority = "background" | "order"

type State = {
  /** Every request waits until then: Binance said 429 or 418. */
  heldUntil: number
  heldBecause: string
  /** Background reads wait until then: the minute is nearly spent. */
  quietUntil: number
  clock: Promise<{ measuredAt: number; offsetMs: number }> | null
}

const scope = globalThis as { __tradeBinanceClient?: State }

function state(): State {
  return (scope.__tradeBinanceClient ??= {
    heldUntil: 0,
    heldBecause: "",
    quietUntil: 0,
    clock: null,
  })
}

function busy(sentence: string): Error {
  return new Error(`EXCHANGE_BUSY:${sentence}`)
}

function assertAvailable(priority: BinancePriority): void {
  const now = Date.now()
  const held = state()
  if (now < held.heldUntil) throw busy(held.heldBecause)
  if (priority === "background" && now < held.quietUntil) {
    throw busy(
      "Binance's request allowance for this minute is nearly spent. Trade is keeping what is left for orders and will read again when the minute rolls over."
    )
  }
}

function observeWeight(header: string | null): void {
  const used = Number(header)
  if (!Number.isFinite(used) || used < WEIGHT_SOFT_LIMIT) return
  const now = Date.now()
  state().quietUntil = now - (now % 60_000) + 60_000
}

function hold(response: Response): Error {
  const seconds = Number(response.headers.get("retry-after"))
  const ms =
    Number.isFinite(seconds) && seconds > 0 ? seconds * 1_000 : DEFAULT_HOLD_MS
  const minutes = Math.max(1, Math.ceil(ms / 60_000))
  const sentence =
    response.status === 418
      ? `Binance has blocked this server's internet address for about ${minutes} minute${minutes === 1 ? "" : "s"}, because it was asked too often. Trade will not ask again until then.`
      : "Binance asked Trade to slow down. Trade has paused Binance requests and will try again after the hold."
  const held = state()
  held.heldUntil = Date.now() + ms
  held.heldBecause = sentence
  return busy(sentence)
}

type Payload = { code?: unknown; msg?: unknown } | unknown[] | null

function codeOf(payload: Payload): string | null {
  if (!payload || Array.isArray(payload)) return null
  const code = payload.code
  if (typeof code === "number" && code < 0) return String(code)
  if (typeof code === "string" && /^-\d+$/.test(code)) return code
  return null
}

async function send(
  url: string,
  init: RequestInit,
  acting: boolean
): Promise<unknown> {
  let response: Response
  try {
    response = await fetch(url, {
      ...init,
      signal: requestSignal(acting ? ACT_TIMEOUT_MS : READ_TIMEOUT_MS),
    })
  } catch (error) {
    if (!isTimeout(error)) throw new Error(scrubbedMessage(error))
    throw acting
      ? new Error(
          "LIVE_NO_ANSWER:Binance did not answer in time. The change may or may not have gone through, so check Binance's own site before trying again."
        )
      : busy("Binance did not answer in time. Trade will ask again shortly.")
  }
  if (url.startsWith(FAPI)) {
    observeWeight(response.headers.get("x-mbx-used-weight-1m"))
  }
  if (response.status === 418 || response.status === 429) {
    // The spot host has its own allowance, and it is asked only for a key's
    // permissions. Its refusal is answered as busy without pausing futures.
    if (!url.startsWith(FAPI)) {
      throw busy("Binance asked Trade to slow down. Trade will ask again shortly.")
    }
    throw hold(response)
  }

  const payload = (await response.json().catch(() => null)) as Payload
  const code = codeOf(payload) ?? (response.ok ? null : String(response.status))
  if (code === null) return payload
  if (code === "-1003" || code === "-1015" || code === "-1008") {
    throw busy(
      "Binance says it is busy or that too many requests were sent. Trade will try again shortly."
    )
  }
  if (code === "-1007") {
    // Binance's own words for this code: "Send status unknown; execution
    // status unknown." Resending could make a second order.
    if (acting) {
      throw new Error(
        "LIVE_NO_ANSWER:Binance's own servers timed out, and Binance says it does not know whether the change went through. Check Binance's own site before trying again."
      )
    }
    throw busy("Binance's own servers timed out. Trade will ask again shortly.")
  }
  throw binanceRefusal(code, response.status)
}

/** One unsigned read on the futures host. */
export async function binancePublic(
  network: NetworkId,
  path: string,
  params: Record<string, string | number> = {},
  priority: BinancePriority = "background"
): Promise<unknown> {
  requireBinanceMainnet(network)
  assertAvailable(priority)
  const query = new URLSearchParams()
  for (const [name, value] of Object.entries(params)) {
    query.set(name, String(value))
  }
  const text = query.toString()
  return send(
    `${FAPI}${path}${text ? `?${text}` : ""}`,
    { headers: { accept: "application/json" } },
    false
  )
}

async function measureClock(): Promise<{
  measuredAt: number
  offsetMs: number
}> {
  const started = Date.now()
  const answer = (await binancePublic("mainnet", "/fapi/v1/time", {}, "order")) as {
    serverTime?: unknown
  } | null
  const finished = Date.now()
  const serverTime = Number(answer?.serverTime)
  if (!Number.isSafeInteger(serverTime) || serverTime <= 0) {
    throw new Error("BINANCE_CLOCK_UNREADABLE")
  }
  return { measuredAt: finished, offsetMs: serverTime - (started + finished) / 2 }
}

/**
 * Binance's time now. Binance refuses a timestamp more than a second ahead
 * of its own clock or older than the receive window, so the offset is
 * measured against `/fapi/v1/time` and kept five minutes.
 */
async function binanceNow(refresh = false): Promise<number> {
  const held = state()
  if (
    refresh ||
    !held.clock ||
    Date.now() - (await held.clock.catch(() => ({ measuredAt: 0 }))).measuredAt >=
      CLOCK_GOOD_FOR_MS
  ) {
    const load = measureClock()
    held.clock = load
    load.catch(() => {
      if (state().clock === load) state().clock = null
    })
  }
  const { offsetMs } = await held.clock!
  return Math.floor(Date.now() + offsetMs)
}

export type BinanceCredential = { key: string; secret: string }

/**
 * The Add wallet window's two fields folded into the one string that is
 * encrypted and stored. The API key also sits in the wallet's address column,
 * the way Phemex's key id does, so the wallet card can name which key it is.
 * Opaque outside this folder, as `OrderAuth.agentKey` requires.
 */
export function packBinanceCredential(input: {
  address?: string
  secret?: string
}): string {
  const key = input.address?.trim() ?? ""
  const secret = input.secret?.trim() ?? ""
  if (!key) throw new Error("KEY_REQUIRED")
  if (!secret) throw new Error("KEY_SECRET_REQUIRED")
  if (!/^[0-9A-Za-z]{16,128}$/.test(secret)) {
    throw new Error(
      "KEY_NOT_APPROVED:That secret is not the shape of a Binance API secret. Copy the Secret Key again from Binance's API Management page. Trade takes the ordinary kind of key Binance calls system-generated (HMAC), not an Ed25519 or RSA key."
    )
  }
  return JSON.stringify({ key, secret })
}

/** Reads back what `packBinanceCredential` stored. Never echoes it. */
export function parseBinanceCredential(blob: string | null): BinanceCredential {
  if (!blob) throw new Error("LIVE_WALLET_KEY")
  try {
    const parsed = JSON.parse(blob) as { key?: unknown; secret?: unknown }
    if (
      typeof parsed.key === "string" &&
      parsed.key.length > 0 &&
      typeof parsed.secret === "string" &&
      parsed.secret.length > 0
    ) {
      return { key: parsed.key, secret: parsed.secret }
    }
  } catch {
    // Falls through to the refusal below.
  }
  throw new Error("LIVE_WALLET_KEY")
}

/** The signed query exactly as it is sent, signature last. */
export function binanceSignedQuery(
  params: Record<string, string | number>,
  secret: string,
  timestamp: number
): string {
  const query = new URLSearchParams()
  for (const [name, value] of Object.entries(params)) {
    query.set(name, String(value))
  }
  query.set("recvWindow", String(RECV_WINDOW_MS))
  query.set("timestamp", String(timestamp))
  const text = query.toString()
  const signature = createHmac("sha256", secret).update(text).digest("hex")
  return `${text}&signature=${signature}`
}

/**
 * One signed request. The secret and the signature never leave this
 * function.
 *
 * **Nothing is resent except a refused timestamp.** Binance answers -1021
 * before it reads anything else, so that request never happened: the clock
 * is measured again and the request goes out once more. Anything else is
 * never resent, because a resent order is a possible double order.
 */
export async function binanceSigned(
  network: NetworkId,
  credential: BinanceCredential,
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  params: Record<string, string | number> = {},
  options: {
    host?: "futures" | "spot"
    priority?: BinancePriority
    /** False for a request that changes nothing a person would check. */
    acting?: boolean
  } = {}
): Promise<unknown> {
  requireBinanceMainnet(network)
  const acting = options.acting ?? method !== "GET"
  const priority = options.priority ?? (acting ? "order" : "background")
  const base = options.host === "spot" ? SAPI : FAPI
  for (const refresh of [false, true]) {
    assertAvailable(priority)
    const query = binanceSignedQuery(
      params,
      credential.secret,
      await binanceNow(refresh)
    )
    try {
      return await send(
        `${base}${path}?${query}`,
        {
          method,
          headers: {
            accept: "application/json",
            "X-MBX-APIKEY": credential.key,
          },
        },
        acting
      )
    } catch (error) {
      if (isClockRefusal(error) && !refresh) continue
      throw error
    }
  }
  // Unreachable: the second pass either returns or throws.
  throw new Error("BINANCE_CLOCK_UNREADABLE")
}

/** Test state must not carry a hold or a clock from one case into another. */
export function clearBinanceClientState(): void {
  scope.__tradeBinanceClient = undefined
}
