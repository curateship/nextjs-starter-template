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
 * How every Phemex request is made: the hosts, the signature, the envelope,
 * and the rate-limit manners. Everything else in this folder goes through
 * these two functions, so the quirks live once.
 *
 * **Signing.** A private call carries three headers: the API key id
 * (`x-phemex-access-token`), an expiry a minute out in epoch seconds
 * (`x-phemex-request-expiry`), and `x-phemex-request-signature` — hex
 * HMAC-SHA256 of `path + queryString + expiry + body`, keyed by the API
 * secret. The secret arrives as this folder's credential blob, parsed here
 * and nowhere else, and is scrubbed out of anything thrown.
 *
 * **Envelopes.** Phemex answers in two shapes: `{code, msg, data}` where
 * code 0 is success, and (on the market-data host paths) `{error, id,
 * result}` where a null error is success. Both are unwrapped here so callers
 * only ever see the payload.
 */

/**
 * Mainnet only. The registry lists no other network for Phemex, the wallet
 * store refuses one, and the markets endpoint refuses one — so a testnet
 * call reaching this deep is a bug, stopped loudly rather than sent to a
 * host nothing should ever talk to.
 */
function restBase(network: NetworkId): string {
  if (network !== "mainnet") throw new Error("PHEMEX_NETWORK_UNSUPPORTED")
  return "https://api.phemex.com"
}

/**
 * The credential blob this folder wrote at save time, read back. Opaque to
 * everything outside this folder — see `OrderAuth.agentKey`.
 */
export function parsePhemexCredential(blob: string): {
  keyId: string
  secret: string
} {
  try {
    const parsed = JSON.parse(blob) as { keyId?: unknown; secret?: unknown }
    if (
      typeof parsed.keyId === "string" &&
      parsed.keyId.length > 0 &&
      typeof parsed.secret === "string" &&
      parsed.secret.length > 0
    ) {
      return { keyId: parsed.keyId, secret: parsed.secret }
    }
  } catch {
    // Falls through to the refusal below.
  }
  // A blob this folder cannot read is a wallet saved wrong, not an exchange
  // problem — the same code the order rails use for a missing key.
  throw new Error("LIVE_WALLET_KEY")
}

/**
 * The dialog's fields folded into the one string that gets encrypted. The
 * key id rides inside the blob (as well as in the wallet's address column)
 * so that signing needs nothing but the blob — `OrderAuth` carries exactly
 * one opaque string, whichever exchange it is for.
 */
export function packPhemexCredential(input: {
  address?: string
  secret?: string
}): string {
  const keyId = input.address?.trim() ?? ""
  const secret = input.secret?.trim() ?? ""
  if (!keyId) throw new Error("KEY_REQUIRED")
  if (!secret) throw new Error("KEY_SECRET_REQUIRED")
  return JSON.stringify({ keyId, secret })
}

/** How long a signed request stays valid. Phemex reads it as an expiry moment. */
const EXPIRY_SECONDS = 60

type Envelope = {
  code?: number
  msg?: string
  data?: unknown
  error?: unknown
  result?: unknown
}

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

function queryOf(params: Record<string, string | number | boolean>): string {
  const parts = Object.entries(params)
    .filter(([, value]) => value !== "")
    // Commas stay raw: Phemex writes lists as `a,b,c` and verifies the
    // signature against the query AS SENT — an encoded `%2C` made the
    // exchange answer "API Signature verification failed" (code 10500),
    // found the day the first list parameter was used for real.
    .map(
      ([key, value]) =>
        `${key}=${encodeURIComponent(String(value)).replace(/%2C/gi, ",")}`
    )
  return parts.join("&")
}

function unwrap(payload: Envelope, context: string): unknown {
  if (typeof payload.code === "number") {
    if (payload.code !== 0) {
      throw new Error(
        `PHEMEX_${payload.code}:${scrubSecrets(String(payload.msg ?? context))}`
      )
    }
    return payload.data
  }
  if ("error" in payload) {
    if (payload.error !== null && payload.error !== undefined) {
      throw new Error(
        `PHEMEX_MD:${scrubSecrets(JSON.stringify(payload.error))}`
      )
    }
    return payload.result
  }
  // Neither envelope — answer as-is; the caller's schema checking decides.
  return payload
}

/** One public GET, unwrapped, with polite retries on a rate limit. */
export async function phemexPublic(
  network: NetworkId,
  path: string,
  params: Record<string, string | number | boolean> = {}
): Promise<unknown> {
  if (isRationed("phemex", network, "public")) throw new Error("EXCHANGE_BUSY")
  const query = queryOf(params)
  const url = `${restBase(network)}${path}${query ? `?${query}` : ""}`

  {
    const response = await fetch(url, {
      headers: { accept: "application/json" },
      signal: requestSignal(READ_TIMEOUT_MS),
    }).catch(timedOut(path))
    if (response.status === 429) {
      startRationing("phemex", network, "public")
      throw new Error("EXCHANGE_BUSY")
    }
    if (!response.ok) {
      throw new Error(`PHEMEX_HTTP_${response.status}:${path}`)
    }
    stopRationing("phemex", network, "public")
    return unwrap((await response.json()) as Envelope, path)
  }
}

/**
 * One signed request, unwrapped. Nothing is ever retried here: a retried
 * order is a possible double order, and "the exchange was busy" is an answer
 * a caller can act on where "it happened twice" is not. A refusal to slow
 * down is believed instead — see `rationing.ts`.
 */
export async function phemexSigned(
  network: NetworkId,
  credential: { keyId: string; secret: string },
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  params: Record<string, string | number | boolean> = {},
  body: unknown = undefined
): Promise<unknown> {
  if (isRationed("phemex", network, "signed")) throw new Error("EXCHANGE_BUSY")
  const query = queryOf(params)
  const bodyText = body === undefined ? "" : JSON.stringify(body)

  {
    // Fresh expiry (and so a fresh signature) per attempt, not per call — a
    // retry a few seconds later must not walk in with a stale clock.
    const expiry = Math.floor(Date.now() / 1_000) + EXPIRY_SECONDS
    const signature = createHmac("sha256", credential.secret)
      .update(path + query + String(expiry) + bodyText)
      .digest("hex")

    const acting = method !== "GET"
    // **Every act rings the doorbell here rather than at 5 call sites.**
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
    const response = await fetch(
      `${restBase(network)}${path}${query ? `?${query}` : ""}`,
      {
        signal: requestSignal(acting ? ACT_TIMEOUT_MS : READ_TIMEOUT_MS),
        method,
        headers: {
          accept: "application/json",
          ...(bodyText ? { "content-type": "application/json" } : {}),
          "x-phemex-access-token": credential.keyId,
          "x-phemex-request-expiry": String(expiry),
          "x-phemex-request-signature": signature,
        },
        ...(bodyText ? { body: bodyText } : {}),
      }
    )
      .finally(() => {
        if (acting) venueTouched("phemex")
      })
      .catch(timedOut(path, acting))
    if (response.status === 429) {
      startRationing("phemex", network, "signed")
      throw new Error("EXCHANGE_BUSY")
    }
    if (response.status === 401 || response.status === 403) {
      // The one place a bad key surfaces on every signed path — named so the
      // wallet screens can say "the key", not "the exchange broke".
      throw new Error("PHEMEX_AUTH")
    }
    if (response.status === 429) {
      throw new Error("EXCHANGE_BUSY")
    }
    if (!response.ok) {
      throw new Error(`PHEMEX_HTTP_${response.status}:${path}`)
    }
    stopRationing("phemex", network, "signed")
    return unwrap((await response.json()) as Envelope, path)
  }
}
