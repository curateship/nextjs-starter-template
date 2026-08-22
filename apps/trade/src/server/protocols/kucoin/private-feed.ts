import { z } from "zod"

import type { NetworkId } from "@/lib/protocols/contracts"
import {
  kucoinSigned,
  parseKucoinCredential,
} from "@/server/protocols/kucoin/client"
import { kucoinTouchedAt } from "@/server/protocols/kucoin/touched"

/**
 * One open line to KuCoin per API key, whose whole job is to say when
 * something on the account has actually happened.
 *
 * **Why this exists.** KuCoin has no practice environment and it rations
 * signed requests hard, and this app was asking it the same questions on every
 * pass of the engine and every tick of an open Trade tab: what is resting,
 * what has filled. On an account where nothing has happened for hours the
 * answer is the same every time and the cost is not.
 *
 * **It is a doorbell, not a delivery.** KuCoin's private channels carry the
 * orders and the executions themselves, and serving them straight from here
 * was the obvious idea and the wrong one. Its channels push CHANGES only —
 * subscribing tells you nothing about what you already hold — so the app would
 * have to seed from a read, follow along, and be right about every event shape
 * KuCoin sends. Being wrong about one of them means an order shown as resting
 * that filled an hour ago, on real money.
 *
 * So this line answers exactly one question — {@link kucoinQuietSince} — and
 * the reads that were always being made go on being made, unchanged, with
 * every schema still in `orders.ts`. What changes is how often they run. An
 * account where nothing has happened is not asked about at all.
 *
 * **Positions and balances are deliberately not covered.** `/contract/positionAll`
 * is on the same line, and it was measured on 22 August 2026: three open
 * positions, prices moving the whole time, and forty-five seconds of complete
 * silence. It speaks when a position CHANGES, never when the price does — so
 * holding a balance because "nothing changed" would freeze open profit on a
 * wallet card, which is worse than the read it saved.
 *
 * **What it costs to run.** One signed POST for a ticket when the line opens,
 * and again after a reconnect. That is the "ask once when a feed starts, and
 * again to recover a disconnect" the trading rules allow, and on KuCoin it is
 * not optional: the socket will not accept a connection without one.
 *
 * **When the line will not vouch.** Any of these and it says nothing:
 *
 * - it has no ticket, or has not subscribed
 * - the socket has said nothing for {@link TRUST_MS}
 * - it was not already watching at the moment being asked about
 *
 * Every one of those ends the same way: the caller reads the exchange, the way
 * it always did. The worst this line can do is save nothing.
 */

/** How long a silent socket stands before its word stops counting. */
const TRUST_MS = 60_000

/** Dropped when nothing has asked about a key for this long. */
const IDLE_MS = 10 * 60_000

const WATCHDOG_EVERY_MS = 3_000
const RECONNECT_BACKOFF_MS = [1_000, 2_000, 5_000, 10_000, 30_000]
const STEADY_AFTER_MS = 30_000

/**
 * The one channel worth listening to.
 *
 * `/contractMarket/tradeOrders` carries this account's own order life: opened,
 * matched, filled, cancelled. Positions and the wallet balance have their own
 * channels and are not subscribed, because nothing here reads them — see the
 * note above about frozen open profit.
 */
const ORDERS_TOPIC = "/contractMarket/tradeOrders"

const bulletSchema = z.object({
  token: z.string(),
  instanceServers: z
    .array(
      z.object({
        endpoint: z.string(),
        pingInterval: z.number().optional(),
      })
    )
    .min(1),
})

type Line = {
  network: NetworkId
  keyId: string
  /**
   * How to read the credential when one is needed, not the credential.
   *
   * **`wallet-auth.ts` states the rule this keeps: decrypted per call, never
   * cached.** A line lives for as long as the app is busy and asks for a fresh
   * ticket on every reconnect, so holding the plaintext would leave an API
   * secret and its passphrase sitting in memory for hours. This closure holds
   * the ciphertext instead and opens it inside {@link connect}, where it goes
   * out of scope with the request it signed.
   */
  credential: () => string | null
  socket: WebSocket | null
  generation: number
  watchdog: ReturnType<typeof setInterval> | null
  pinger: ReturnType<typeof setInterval> | null
  openedAt: number
  lastMessageAt: number
  /**
   * Since when this line has been watching without a break, or 0 when it is
   * not watching. Reset by every drop, because a line that was away cannot
   * promise nothing happened while it was.
   */
  watchingSince: number
  /** When the exchange last said an order changed. */
  changedAt: number
  reconnectAt: number
  attempts: number
  /** A ticket is being fetched; a second attempt would spend another request. */
  dialling: boolean
  /** When anything last asked. */
  askedAt: number
}

// On `globalThis` rather than module scope: the dev server reloads modules in
// place, and a module-scoped map would leave the old socket open behind the
// new one.
const scope = globalThis as {
  __tradeKucoinPrivateLines?: Map<string, Line>
}

function lines(): Map<string, Line> {
  return (scope.__tradeKucoinPrivateLines ??= new Map())
}

function keyFor(network: NetworkId, keyId: string): string {
  return `${network}:${keyId}`
}

/**
 * The line for one API key, opening it if it is not already up.
 *
 * Opening is never awaited. The first caller is told nothing can be promised,
 * reads KuCoin the ordinary way, and by the next call the socket is up.
 */
function lineFor(
  network: NetworkId,
  keyId: string,
  credential: () => string | null
): Line {
  const key = keyFor(network, keyId)
  const found = lines().get(key)
  if (found) {
    found.askedAt = Date.now()
    // Refreshed so the newest way of reading the credential is the one a
    // reconnect uses. The id is what the line is filed under, so a genuinely
    // different key is a different line.
    found.credential = credential
    return found
  }
  const made: Line = {
    network,
    keyId,
    credential,
    socket: null,
    generation: 0,
    watchdog: null,
    pinger: null,
    openedAt: 0,
    lastMessageAt: 0,
    watchingSince: 0,
    changedAt: 0,
    reconnectAt: 0,
    attempts: 0,
    dialling: false,
    askedAt: Date.now(),
  }
  lines().set(key, made)
  void connect(made)
  return made
}

/**
 * True only if the exchange has told us nothing happened on this account
 * since `at`, and the line was already watching then.
 *
 * **False is the safe answer and it is the default.** Not knowing and knowing
 * something changed both come back false, so a caller can only ever be told to
 * skip a read when the exchange has genuinely been silent through the whole
 * stretch it is asking about.
 */
export function kucoinQuietSince(
  network: NetworkId,
  keyId: string,
  credential: () => string | null,
  at: number
): boolean {
  const line = lineFor(network, keyId, credential)
  if (line.watchingSince === 0) return false
  if (!line.socket) return false
  const now = Date.now()
  if (now - line.lastMessageAt >= TRUST_MS) return false
  // The line has to have been watching BEFORE the moment being asked about.
  // Watching since after it leaves a gap nobody was looking at.
  if (line.watchingSince > at) return false
  // This app's own acts count as changes even before the exchange pushes them
  // back — see `touched.ts` for why that window matters.
  if (kucoinTouchedAt() > at) return false
  return line.changedAt <= at
}

/**
 * Closes lines nothing has asked about lately.
 *
 * Called from the pass that reads a portfolio rather than on a timer of its
 * own, which would keep this module alive in a process that has finished with
 * it.
 */
export function dropIdleKucoinPrivateFeeds(now: number = Date.now()): void {
  for (const [key, line] of lines()) {
    if (now - line.askedAt < IDLE_MS) continue
    line.generation += 1
    teardown(line)
    if (line.watchdog) {
      clearInterval(line.watchdog)
      line.watchdog = null
    }
    lines().delete(key)
  }
}

/** Shuts every line. Only the tests and a clean process exit need this. */
export function closeKucoinPrivateFeeds(): void {
  dropIdleKucoinPrivateFeeds(Infinity)
}

function teardown(line: Line): void {
  if (line.pinger) {
    clearInterval(line.pinger)
    line.pinger = null
  }
  const socket = line.socket
  line.socket = null
  if (socket) {
    try {
      socket.close()
    } catch {
      // A socket that refuses to close is already gone.
    }
  }
  // Nobody was watching from here on, so nothing can be promised about it.
  line.watchingSince = 0
}

function scheduleReconnect(line: Line): void {
  const wait =
    RECONNECT_BACKOFF_MS[
      Math.min(line.attempts, RECONNECT_BACKOFF_MS.length - 1)
    ]
  line.attempts += 1
  line.reconnectAt = Date.now() + wait
}

/**
 * Opens the line: a signed POST for a private ticket, then the socket it
 * names.
 *
 * The ticket costs one request, which is why `dialling` guards it — a
 * watchdog tick landing while the POST is in flight would spend another one
 * for nothing, on the very key this whole file exists to spare.
 */
async function connect(line: Line): Promise<void> {
  if (line.dialling) return
  line.dialling = true
  const generation = (line.generation += 1)
  teardown(line)

  let endpoint: string
  let token: string
  let pingEveryMs: number
  try {
    // Opened here and nowhere else, and it goes out of scope with this call.
    const blob = line.credential()
    if (!blob) throw new Error("LIVE_WALLET_KEY")
    const answer = bulletSchema.parse(
      await kucoinSigned(
        line.network,
        parseKucoinCredential(blob),
        "POST",
        "/api/v1/bullet-private"
      )
    )
    endpoint = answer.instanceServers[0].endpoint
    token = answer.token
    // KuCoin states how often it wants greeting; two thirds of that leaves
    // room for a slow round trip without ever being late.
    pingEveryMs = Math.max(
      2_000,
      Math.floor((answer.instanceServers[0].pingInterval ?? 18_000) * 0.66)
    )
  } catch {
    line.dialling = false
    // A ticket the exchange would not grant is not an error worth stopping
    // anything for. The caller reads the ordinary way and this tries again.
    scheduleReconnect(line)
    startWatchdog(line)
    return
  }
  if (generation !== line.generation) {
    line.dialling = false
    return
  }

  let socket: WebSocket
  try {
    socket = new WebSocket(
      `${endpoint}?token=${encodeURIComponent(token)}&connectId=trade-${Date.now()}`
    )
  } catch {
    line.dialling = false
    scheduleReconnect(line)
    startWatchdog(line)
    return
  }
  line.socket = socket
  line.dialling = false

  socket.addEventListener("open", () => {
    if (generation !== line.generation) return
    line.openedAt = Date.now()
    line.lastMessageAt = Date.now()
    try {
      socket.send(
        JSON.stringify({
          id: "sub-orders",
          type: "subscribe",
          topic: ORDERS_TOPIC,
          privateChannel: true,
          response: true,
        })
      )
    } catch {
      // The watchdog notices a socket that cannot be written to.
    }
    line.pinger = setInterval(() => {
      try {
        socket.send(JSON.stringify({ id: `p${Date.now()}`, type: "ping" }))
      } catch {
        // The watchdog handles a dead socket; the ping must not throw.
      }
    }, pingEveryMs)
    line.pinger.unref?.()
  })

  socket.addEventListener("message", (event) => {
    if (generation !== line.generation) return
    // ANY message proves the line is alive, a pong included. The orders
    // channel speaks only when something changes, so a quiet account would
    // look dead without the heartbeat counting.
    line.lastMessageAt = Date.now()
    if (line.attempts > 0 && Date.now() - line.openedAt > STEADY_AFTER_MS) {
      line.attempts = 0
    }
    let message: { type?: unknown; topic?: unknown }
    try {
      message = JSON.parse(String(event.data))
    } catch {
      return
    }
    if (message.type === "ack") {
      // Watching starts here and not a moment earlier. Anything before the
      // acknowledgement happened while nobody was looking.
      line.watchingSince = Date.now()
      return
    }
    if (message.type === "error") {
      teardown(line)
      scheduleReconnect(line)
      return
    }
    if (message.type !== "message") return
    if (message.topic === ORDERS_TOPIC) line.changedAt = Date.now()
  })

  const gone = () => {
    if (generation !== line.generation) return
    teardown(line)
    scheduleReconnect(line)
  }
  socket.addEventListener("close", gone)
  socket.addEventListener("error", gone)

  startWatchdog(line)
}

function startWatchdog(line: Line): void {
  if (line.watchdog) return
  line.watchdog = setInterval(() => {
    if (line.reconnectAt > 0 && Date.now() >= line.reconnectAt) {
      line.reconnectAt = 0
      void connect(line)
      return
    }
    if (!line.socket || line.reconnectAt > 0) return
    if (Date.now() - line.lastMessageAt <= TRUST_MS) return
    // The socket may still claim to be healthy; the silence disagrees, and
    // silence is indistinguishable from a line that has died.
    teardown(line)
    scheduleReconnect(line)
  }, WATCHDOG_EVERY_MS)
  line.watchdog.unref?.()
}
