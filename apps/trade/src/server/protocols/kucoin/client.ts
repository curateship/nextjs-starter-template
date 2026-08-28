import { createHmac } from "node:crypto"

import type { NetworkId } from "@/lib/protocols/contracts"
import {
  isRationed,
  startRationing,
  stopRationing,
} from "@/server/protocols/rationing"
import {
  ACT_TIMEOUT_MS,
  isTimeout,
  READ_TIMEOUT_MS,
  requestSignal,
} from "@/server/protocols/request-timeout"
import { venueTouched } from "@/server/protocols/touched"
import { scrubSecrets } from "@/server/protocols/scrub"

/**
 * How every KuCoin Futures request is made: the host, the signature, the
 * envelope, and the rate-limit manners. Everything else in this folder goes
 * through these two functions, so the quirks live once.
 *
 * **Signing.** A private call carries five headers. `KC-API-KEY` is the key's
 * id, `KC-API-TIMESTAMP` is now in milliseconds, and `KC-API-SIGN` is the
 * base64 HMAC-SHA256 of `timestamp + METHOD + path-with-query + body`, keyed
 * by the API secret. The passphrase is not sent as itself: on key version 2
 * it is signed with the same secret and sent base64 as `KC-API-PASSPHRASE`,
 * with `KC-API-KEY-VERSION: 2` saying so. All three values — key id, secret
 * and passphrase — come from this folder's credential blob and are scrubbed
 * out of anything thrown.
 *
 * **Envelope.** KuCoin answers `{code, data}` where `"200000"` is success and
 * everything else is a refusal carrying its own code. Unwrapped here so
 * callers only ever see the payload.
 *
 * Mainnet only. KuCoin shut its practice environment down in 2023, so there
 * is no second host to choose and a request for another network is a bug,
 * stopped loudly rather than sent somewhere.
 */

function restBase(network: NetworkId): string {
  if (network !== "mainnet") throw new Error("KUCOIN_NETWORK_UNSUPPORTED")
  return "https://api-futures.kucoin.com"
}

export type KucoinCredential = {
  keyId: string
  secret: string
  passphrase: string
}

/**
 * The credential blob this folder wrote at save time, read back. Opaque to
 * everything outside this folder — see `OrderAuth.agentKey`.
 */
export function parseKucoinCredential(blob: string): KucoinCredential {
  try {
    const parsed = JSON.parse(blob) as Record<string, unknown>
    const { keyId, secret, passphrase } = parsed
    if (
      typeof keyId === "string" &&
      keyId.length > 0 &&
      typeof secret === "string" &&
      secret.length > 0 &&
      typeof passphrase === "string" &&
      passphrase.length > 0
    ) {
      return { keyId, secret, passphrase }
    }
  } catch {
    // Falls through to the refusal below.
  }
  // A blob this folder cannot read is a wallet saved wrong, not an exchange
  // problem — the same code the order rails use for a missing key.
  throw new Error("LIVE_WALLET_KEY")
}

/**
 * The dialog's three fields folded into the one string that gets encrypted.
 * The key id rides inside the blob as well as in the wallet's address column,
 * so signing needs nothing but the blob.
 */
export function packKucoinCredential(input: {
  address?: string
  secret?: string
  passphrase?: string
}): string {
  const keyId = input.address?.trim() ?? ""
  const secret = input.secret?.trim() ?? ""
  const passphrase = input.passphrase?.trim() ?? ""
  if (!keyId) throw new Error("KEY_REQUIRED")
  if (!secret) throw new Error("KEY_SECRET_REQUIRED")
  if (!passphrase) throw new Error("KEY_PASSPHRASE_REQUIRED")
  return JSON.stringify({ keyId, secret, passphrase })
}

function queryOf(params: Record<string, string | number | boolean>): string {
  const parts = Object.entries(params)
    .filter(([, value]) => value !== "" && value !== undefined)
    .map(([key, value]) => `${key}=${encodeURIComponent(String(value))}`)
  return parts.join("&")
}

type Envelope = { code?: string; msg?: string; data?: unknown }

/**
 * Turns a request that ran out of time into a refusal that says so. An act
 * that timed out gets its own code, because "we stopped waiting" is not the
 * same as "it did not happen" and only a person can settle which.
 */
function timedOut(path: string, acting = false) {
  return (error: unknown): never => {
    if (!isTimeout(error)) throw error
    throw new Error(
      acting
        ? `LIVE_NO_ANSWER:The exchange did not answer in time on ${path}. It may or may not have gone through — check the exchange before trying again.`
        : "EXCHANGE_BUSY"
    )
  }
}

function unwrap(payload: Envelope, path: string): unknown {
  if (payload.code !== undefined && payload.code !== "200000") {
    throw new Error(
      `KUCOIN_${payload.code}:${scrubSecrets(String(payload.msg ?? path))}`
    )
  }
  return payload.data
}

/** One public GET, unwrapped, with polite retries on a rate limit. */
export async function kucoinPublic(
  network: NetworkId,
  path: string,
  params: Record<string, string | number | boolean> = {}
): Promise<unknown> {
  if (isRationed("kucoin", network, "public")) throw new Error("EXCHANGE_BUSY")
  const query = queryOf(params)
  const url = `${restBase(network)}${path}${query ? `?${query}` : ""}`

  {
    const response = await fetch(url, {
      headers: { accept: "application/json" },
      signal: requestSignal(READ_TIMEOUT_MS),
    }).catch(timedOut(path))
    if (response.status === 429) {
      startRationing("kucoin", network, "public")
      throw new Error("EXCHANGE_BUSY")
    }
    if (!response.ok) throw new Error(`KUCOIN_HTTP_${response.status}:${path}`)
    stopRationing("kucoin", network, "public")
    return unwrap((await response.json()) as Envelope, path)
  }
}

/** One public POST — the socket-token handshake is the only one. */
export async function kucoinPublicPost(
  network: NetworkId,
  path: string
): Promise<unknown> {
  const response = await fetch(`${restBase(network)}${path}`, {
    method: "POST",
    headers: { accept: "application/json" },
    signal: requestSignal(READ_TIMEOUT_MS),
  }).catch(timedOut(path))
  if (response.status === 429) throw new Error("EXCHANGE_BUSY")
  if (!response.ok) throw new Error(`KUCOIN_HTTP_${response.status}:${path}`)
  return unwrap((await response.json()) as Envelope, path)
}

/**
 * One signed request, unwrapped. Nothing is ever retried here: a retried
 * order is a possible double order, and "the exchange was busy" is an answer
 * a caller can act on where "it happened twice" is not. A refusal to slow
 * down is believed instead — see `rationing.ts`.
 */
export async function kucoinSigned(
  network: NetworkId,
  credential: KucoinCredential,
  method: "GET" | "POST" | "DELETE",
  path: string,
  params: Record<string, string | number | boolean> = {},
  body: unknown = undefined
): Promise<unknown> {
  if (isRationed("kucoin", network, "signed")) throw new Error("EXCHANGE_BUSY")
  const query = queryOf(params)
  // The signed string uses the path AS SENT, query and all — sign one thing
  // and send another and the exchange reads it as a forgery.
  const endpoint = `${path}${query ? `?${query}` : ""}`
  const bodyText = body === undefined ? "" : JSON.stringify(body)

  {
    // A fresh timestamp, and so a fresh signature, per attempt: a retry a few
    // seconds later must not walk in with a stale clock.
    const timestamp = String(Date.now())
    const signature = createHmac("sha256", credential.secret)
      .update(timestamp + method + endpoint + bodyText)
      .digest("base64")
    const passphrase = createHmac("sha256", credential.secret)
      .update(credential.passphrase)
      .digest("base64")

    const acting = method !== "GET"
    // **Every act rings the doorbell here rather than at 9 call sites.**
    // Anything but a GET changes this account, and the socket in
    // `private-feed.ts` says so a moment later — but a moment is long enough
    // for the next pass to be told the account is quiet and skip the read that
    // would have shown its own order. Ringing it here means a new kind of act
    // cannot forget to.
    //
    // **Rung when the request finishes, not when it starts.** An act takes a
    // couple of hundred milliseconds, and a read that lands in the middle of
    // one sees the account as it was BEFORE it. Ringing first would let that
    // read be held as current for the next two minutes; ringing last rejects
    // it, because it was taken before the bell. A refused act rings too: the
    // exchange may have carried it out anyway and only said so late.
    //
    // The socket's own ticket is the exception: it is a POST that changes
    // nothing, and counting it would have every reconnect ring its own bell.
    const ringsBell = acting && path !== "/api/v1/bullet-private"
    const response = await fetch(`${restBase(network)}${endpoint}`, {
      signal: requestSignal(acting ? ACT_TIMEOUT_MS : READ_TIMEOUT_MS),
      method,
      headers: {
        accept: "application/json",
        ...(bodyText ? { "content-type": "application/json" } : {}),
        "KC-API-KEY": credential.keyId,
        "KC-API-SIGN": signature,
        "KC-API-TIMESTAMP": timestamp,
        "KC-API-PASSPHRASE": passphrase,
        "KC-API-KEY-VERSION": "2",
      },
      ...(bodyText ? { body: bodyText } : {}),
    })
      .finally(() => {
        if (ringsBell) venueTouched("kucoin")
      })
      .catch(timedOut(path, acting))

    if (response.status === 429) {
      startRationing("kucoin", network, "signed")
      throw new Error("EXCHANGE_BUSY")
    }
    if (response.status === 401 || response.status === 403) {
      // The one place a bad credential surfaces on every signed path — named
      // so the wallet screens can say "the key", not "the exchange broke".
      throw new Error("KUCOIN_AUTH")
    }
    if (!response.ok) throw new Error(`KUCOIN_HTTP_${response.status}:${path}`)
    stopRationing("kucoin", network, "signed")
    return unwrap((await response.json()) as Envelope, path)
  }
}

/**
 * KuCoin states an auth failure in its own numbers as well as in HTTP status:
 * 400003 unknown key, 400004 bad passphrase, 400005 bad signature, 400007 no
 * permission, 400006 an IP the key is not allowed from. All of them mean the
 * same thing to a person — this credential will not work — so the wallet
 * screens see one code.
 */
export function isKucoinCredentialRefusal(error: unknown): boolean {
  const message = error instanceof Error ? error.message : ""
  if (message === "KUCOIN_AUTH") return true
  return /^KUCOIN_4000(03|04|05|06|07)/.test(message)
}
