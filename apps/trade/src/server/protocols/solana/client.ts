import type { NetworkId } from "@/lib/protocols/contracts"
import {
  isTimeout,
  READ_TIMEOUT_MS,
  requestSignal,
} from "@/server/protocols/request-timeout"
import { scrubbedMessage } from "@/server/protocols/scrub"

/**
 * The only file that knows where Solana and Jupiter live.
 *
 * Two services, two jobs. A Solana **node** is how any wallet reaches the
 * chain: it reads balances and takes a signed transaction. **Jupiter** is the
 * swap router: one call finds the best price across every pool on Solana and
 * a second hands back a ready transaction for the node to send. Jupiter never
 * holds money and never needs an account, only a free API key.
 *
 * Every address and the key are read here and nowhere else. The fence test
 * fails any file outside this folder that names a node or Jupiter address.
 *
 * **The swap calls live under `/ultra/v1`, on both hosts.** Measured 4 Sep
 * 2026: `/swap/v2/order`, the path the task file names, answered "Route not
 * found" on the free host and the same body as `/ultra/v1/order` on the
 * keyed one. `/ultra/v1/order` and `/ultra/v1/execute` answered on both, so
 * they are the paths `orders.ts` uses whichever host the key picks.
 */

/** Solana's own public node. Free, rate-limited, and enough to start with. */
const PUBLIC_MAINNET_RPC = "https://api.mainnet-beta.solana.com"

/**
 * Solana's practice network. It has a faucet, so the wallet half can be
 * rehearsed there — but Jupiter cannot swap on it, which is why the registry
 * lists mainnet only. Held here so the rehearsal has one place to point at.
 */
const PUBLIC_DEVNET_RPC = "https://api.devnet.solana.com"

/**
 * Jupiter's two hosts, and why the key is optional.
 *
 * **The key authorises nothing.** It is a rate-limit token: Jupiter never
 * holds money and has no account, so the only thing that can authorise a
 * trade is the wallet's own secret key signing the transaction Jupiter
 * builds. Measured 4 Sep 2026, with no key at all: the whole verified token
 * list (3,189 coins) came back from both hosts, a real quote came back, and
 * Jupiter built a real unsigned swap transaction.
 *
 * So the key chooses a host rather than switching Solana on:
 *
 * - **No key: `lite-api.jup.ag`**, the free host. 70 requests back to back
 *   were answered without one refusal.
 * - **A key: `api.jup.ag`**, the keyed host, at the free tier's stated sixty
 *   a minute. Without a key that host allows only 5 requests per 10 seconds
 *   and then refuses, which is why it is never used unkeyed.
 *
 * A key is still worth having before real swaps: an order refused for want
 * of an allowance is a trade that did not happen.
 */
const KEYED_BASE = "https://api.jup.ag"
const FREE_BASE = "https://lite-api.jup.ag"

function setting(name: string): string | null {
  const value = process.env[name]?.trim()
  return value ? value : null
}

/**
 * The node for a network. `TRADE_SOLANA_RPC` replaces the public mainnet
 * node with a paid one (Helius, QuickNode) when the public one is not enough;
 * `TRADE_SOLANA_DEVNET_RPC` does the same for rehearsals. "testnet" is this
 * app's word for a practice network, and on Solana that is devnet.
 */
export function solanaRpcUrl(network: NetworkId): string {
  return network === "mainnet"
    ? (setting("TRADE_SOLANA_RPC") ?? PUBLIC_MAINNET_RPC)
    : (setting("TRADE_SOLANA_DEVNET_RPC") ?? PUBLIC_DEVNET_RPC)
}

export function jupiterApiKey(): string | null {
  return setting("TRADE_JUPITER_API_KEY")
}

/**
 * The minute's allowance, and how it is shared.
 *
 * Sixty a minute, which is the keyed free tier's stated figure and is
 * comfortably under what the keyless host served when it was measured. Reads
 * (the market list, prices, a lookup) may spend forty of them; the last
 * twenty are kept back so a swap is never refused for want of a request
 * while somebody is clicking through the list. One constant, here, is the
 * whole budget: the market list's two calls a minute, the price pages and
 * the lookups all draw on it.
 */
export const JUPITER_REQUESTS_PER_MINUTE = 60
const JUPITER_SWAP_RESERVE = 20

export type JupiterPriority = "read" | "order"

/** When each request of the last minute left, oldest first. */
const sentAt: number[] = []

/**
 * Takes one request out of the minute, or refuses at once as busy. A
 * refused read is answered "busy" without waiting, so the caller keeps what
 * it has and asks again on its next poll.
 */
export function reserveJupiterRequest(priority: JupiterPriority): void {
  const cutoff = Date.now() - 60_000
  while (sentAt.length > 0 && sentAt[0] < cutoff) sentAt.shift()
  const cap =
    priority === "order"
      ? JUPITER_REQUESTS_PER_MINUTE
      : JUPITER_REQUESTS_PER_MINUTE - JUPITER_SWAP_RESERVE
  if (sentAt.length >= cap) {
    throw new Error(
      `EXCHANGE_BUSY:Jupiter — spent ${sentAt.length} of ${cap} this minute`
    )
  }
  sentAt.push(Date.now())
}

/** How many requests left in the last minute. For the doc and the tests. */
export function jupiterRequestsThisMinute(): number {
  const cutoff = Date.now() - 60_000
  return sentAt.filter((at) => at >= cutoff).length
}

/**
 * At most one Jupiter request a second, which is the free tier's own rule.
 *
 * Requests queue behind each other here rather than racing and collecting
 * 429s. The queue is a promise chain: each call waits for the one before it
 * and then for the second to be up. A refused request still counts as sent.
 */
const MIN_GAP_MS = 1_000
let lane: Promise<void> = Promise.resolve()
let lastSentAt = 0

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function takeTurn(): Promise<void> {
  const turn = lane.then(async () => {
    const wait = lastSentAt + MIN_GAP_MS - Date.now()
    if (wait > 0) await sleep(wait)
    lastSentAt = Date.now()
  })
  // A failed turn must not jam the lane for everyone after it.
  lane = turn.catch(() => {})
  return turn
}

/**
 * How long to wait after a 429 before the one retry. Jupiter says how long
 * in `retry-after` when it says anything; otherwise one second, the length
 * of its own window. Capped so a strange header cannot hold a request for a
 * minute — the rationing file explains why a long wait inside a request is
 * the wrong answer in this app.
 */
const RETRY_CAP_MS = 5_000

function retryDelay(response: Response): number {
  const header = Number(response.headers.get("retry-after"))
  const seconds = Number.isFinite(header) && header > 0 ? header : 1
  return Math.min(seconds * 1_000, RETRY_CAP_MS)
}

/**
 * One Jupiter read, with the key on it.
 *
 * A 429 is waited out once and the request sent again; a second 429 is
 * answered "busy" so the caller keeps what it has and asks on its next poll.
 * The one wait is bounded (see `RETRY_CAP_MS`), which is what makes it safe
 * where the Hyperliquid-era retry loop was not.
 */
export async function jupiterGet(
  path: string,
  params: Record<string, string | number> = {},
  options: { priority?: JupiterPriority } = {}
): Promise<unknown> {
  const key = jupiterApiKey()
  const priority = options.priority ?? "read"

  const url = new URL(path, key === null ? FREE_BASE : KEYED_BASE)
  for (const [name, value] of Object.entries(params)) {
    url.searchParams.set(name, String(value))
  }

  let response = await send(url, key, priority, {})
  if (response.status === 429) {
    await sleep(retryDelay(response))
    response = await send(url, key, priority, {})
    if (response.status === 429) throw new Error("EXCHANGE_BUSY")
  }
  if (!response.ok) {
    throw new Error(`SOLANA_JUPITER_REFUSED:${response.status}`)
  }
  return response.json()
}

/**
 * One Jupiter write: today that is only `/ultra/v1/execute`, which hands
 * Jupiter a signed swap to send.
 *
 * **Never retried.** A GET asked twice costs a request; a signed swap sent
 * twice could be a swap made twice, so a 429 or a timeout here is answered
 * "busy" once and the caller decides. Jupiter answers a refused execute
 * with a 400 and `{code, error}` in the body, and that body is the one thing
 * worth reading back, so a non-2xx answer is returned as the parsed body
 * with its status rather than thrown blind.
 */
export async function jupiterPost(
  path: string,
  body: Record<string, unknown>
): Promise<{ status: number; body: unknown }> {
  const key = jupiterApiKey()
  const url = new URL(path, key === null ? FREE_BASE : KEYED_BASE)
  const response = await send(url, key, "order", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
  if (response.status === 429) throw new Error("EXCHANGE_BUSY")
  let parsed: unknown = null
  try {
    parsed = await response.json()
  } catch {
    throw new Error(`SOLANA_JUPITER_REFUSED:${response.status}`)
  }
  return { status: response.status, body: parsed }
}

async function send(
  url: URL,
  key: string | null,
  priority: JupiterPriority,
  init: { method?: string; headers?: Record<string, string>; body?: string }
): Promise<Response> {
  // Refused before waiting a turn, so a request the minute has no room for
  // does not also queue for a second first.
  reserveJupiterRequest(priority)
  await takeTurn()
  try {
    return await fetch(url, {
      method: init.method ?? "GET",
      headers: {
        accept: "application/json",
        ...(init.headers ?? {}),
        // A wrong key is refused outright (401), so the header goes on only
        // when there is a real one to send.
        ...(key === null ? {} : { "x-api-key": key }),
      },
      body: init.body,
      signal: requestSignal(READ_TIMEOUT_MS),
    })
  } catch (error) {
    if (isTimeout(error)) throw new Error("EXCHANGE_BUSY")
    throw new Error(scrubbedMessage(error))
  }
}

/**
 * One question to the Solana node, in the JSON-RPC shape every node speaks.
 *
 * The node is asked only what the chain itself knows — a balance, the
 * token accounts a wallet owns, and later a signed swap to send. It has no
 * key and no minute's budget: Solana's public node rations by address and
 * answers a 429 of its own, which is passed on as "busy" so the caller keeps
 * the last figures it had. A paid node in `.env` is the same call at another
 * address.
 */
export async function solanaRpc(
  network: NetworkId,
  method: string,
  params: readonly unknown[]
): Promise<unknown> {
  let response: Response
  try {
    response = await fetch(solanaRpcUrl(network), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal: requestSignal(READ_TIMEOUT_MS),
    })
  } catch (error) {
    if (isTimeout(error)) throw new Error("EXCHANGE_BUSY")
    throw new Error(scrubbedMessage(error))
  }
  if (response.status === 429) throw new Error("EXCHANGE_BUSY")
  if (!response.ok) throw new Error(`SOLANA_NODE_REFUSED:${response.status}`)
  let body: { result?: unknown; error?: { code?: number; message?: string } }
  try {
    body = (await response.json()) as typeof body
  } catch {
    // A gateway's HTML page in place of the node's JSON is a node problem,
    // not an account problem, and is named as one.
    throw new Error("SOLANA_NODE_REFUSED:not-json")
  }
  if (body.error) {
    // The node's own words are its code and a short sentence — never a
    // secret, and the one clue when a method or an address is wrong.
    throw new Error(
      `SOLANA_NODE_REFUSED:${body.error.code ?? ""}:${body.error.message ?? ""}`
    )
  }
  return body.result
}

/** Tests must not inherit another case's place in the queue. */
export function clearSolanaClientState(): void {
  lane = Promise.resolve()
  lastSentAt = 0
  sentAt.length = 0
}
