import { createHmac } from "node:crypto"

import type { NetworkId } from "@/lib/protocols/contracts"
import { phemexWsUrl } from "@/lib/protocols/phemex/translate"
import { reconnectDelay } from "@/lib/protocols/timing"
import { parsePhemexCredential } from "@/server/protocols/phemex/client"
import { venueTouchedAt } from "@/server/protocols/touched"

/**
 * One open line to Phemex per API key, whose whole job is to say when
 * something on the account has actually happened.
 *
 * **Why this exists.** Phemex counts signed requests per API key and starts
 * refusing them, and a refused read is a wallet card saying "can't reach it"
 * while the exchange is answering everyone else perfectly well. Sweeping fills
 * was the worst of it: an order list plus a separate read for every coin held,
 * six times a minute, on an account where nothing had happened for hours.
 *
 * **It is a doorbell, not a delivery.** The exchange's `aop_p` line does carry
 * the orders and the executions themselves, and serving them straight from
 * here was the obvious idea and the wrong one. The socket writes the same
 * facts in a different dialect — `execQty` where the REST endpoint says
 * `execQtyRq`, no `tradeType` at all — so a liquidation arrives unlabelled,
 * and a mislabelled liquidation is a wrong line in the Journal about real
 * money. Worse, the message marked `snapshot` is not one: on 22 August 2026 it
 * carried the last fifty things that HAPPENED, thirty-nine of them long
 * rejected and none of them resting.
 *
 * So this line answers exactly one question — {@link phemexQuietSince} — and
 * the reads that were always being made go on being made, unchanged, with
 * every schema and every quirk still in `orders.ts`. What changes is how often
 * they run. An account where nothing has happened is not asked about at all.
 *
 * **Positions and balances are deliberately not covered.** They ride the same
 * line, but Phemex pushes them only when the position itself changes, never
 * when the price moves — and open profit moves every second. Holding a balance
 * because "nothing changed" would freeze the profit on a wallet card, which is
 * worse than the read it saved. Those keep their own short-lived answer in
 * `account.ts`.
 *
 * **When the line will not vouch.** Any of these and it says nothing:
 *
 * - it has not signed in and subscribed
 * - the socket has said nothing for {@link TRUST_MS}
 * - it was not already watching at the moment being asked about, so something
 *   could have happened before it was looking
 *
 * Every one of those ends the same way: the caller reads the exchange, the way
 * it always did. The worst this line can do is save nothing.
 */

/** How long a silent socket stands before its word stops counting. */
const TRUST_MS = 30_000

/** Dropped when nothing has asked about a key for this long. */
const IDLE_MS = 10 * 60_000

/** Phemex drops a silent socket; it asks for a heartbeat inside 30 seconds. */
const PING_EVERY_MS = 5_000

const WATCHDOG_EVERY_MS = 3_000
const STEADY_AFTER_MS = 30_000

type Line = {
  network: NetworkId
  keyId: string
  /**
   * How to read the credential when one is needed, not the credential.
   *
   * **`wallet-auth.ts` states the rule this keeps: decrypted per call, never
   * cached.** A line lives for as long as the app is busy and re-signs on
   * every reconnect, so holding the plaintext would leave an API secret
   * sitting in memory for hours. This closure holds the ciphertext instead and
   * opens it inside {@link authMessage}, where it goes out of scope with the
   * message it signed.
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
  /** When the exchange last said an order or an execution changed. */
  changedAt: number
  reconnectAt: number
  attempts: number
  /** When anything last asked. */
  askedAt: number
}

// On `globalThis` rather than module scope: the dev server reloads modules in
// place, and a module-scoped map would leave the old socket open behind the
// new one.
const scope = globalThis as {
  __tradePhemexPrivateLines?: Map<string, Line>
}

function lines(): Map<string, Line> {
  return (scope.__tradePhemexPrivateLines ??= new Map())
}

function keyFor(network: NetworkId, keyId: string): string {
  return `${network}:${keyId}`
}

/**
 * The line for one API key, opening it if it is not already up.
 *
 * Opening is never awaited. The first caller is told nothing can be promised,
 * reads Phemex the ordinary way, and by the next call the socket is up.
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
    askedAt: Date.now(),
  }
  lines().set(key, made)
  connect(made)
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
export function phemexQuietSince(
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
  // This app's own acts count as changes the instant they finish, without
  // waiting for the exchange to push them back — see `touched.ts`.
  if (venueTouchedAt("phemex") > at) return false
  return line.changedAt <= at
}

/**
 * Closes lines nothing has asked about lately.
 *
 * Called from the pass that reads a portfolio rather than on a timer of its
 * own, which would keep this module alive in a process that has finished with
 * it.
 */
export function dropIdlePhemexPrivateFeeds(now: number = Date.now()): void {
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
export function closePhemexPrivateFeeds(): void {
  dropIdlePhemexPrivateFeeds(Infinity)
}

/**
 * Whether a message says anything about this account's orders.
 *
 * `aop_p` carries three arrays and unrelated market chatter rides the same
 * socket, so only an `orders_p` with rows in it counts. An empty array is the
 * exchange saying nothing happened, and treating it as a change would make the
 * line ring its own doorbell.
 */
function saysSomethingHappened(message: unknown): boolean {
  const orders = (message as { orders_p?: unknown }).orders_p
  return Array.isArray(orders) && orders.length > 0
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
  const wait = reconnectDelay(line.attempts)
  line.attempts += 1
  line.reconnectAt = Date.now() + wait
}

/**
 * Signing in on the socket.
 *
 * The signature is HMAC-SHA256 of the key id joined to an expiry in epoch
 * seconds — the same secret as a REST call, a different string to sign. Built
 * here, sent once, never stored.
 */
function authMessage(line: Line): string | null {
  const blob = line.credential()
  if (!blob) return null
  let secret: string
  try {
    secret = parsePhemexCredential(blob).secret
  } catch {
    // A credential this folder cannot read is a wallet saved wrong, not an
    // exchange problem. The line simply never signs in, and every read falls
    // back to asking — which will refuse for the same reason, out loud.
    return null
  }
  const expiry = Math.floor(Date.now() / 1000) + 120
  const signature = createHmac("sha256", secret)
    .update(`${line.keyId}${expiry}`)
    .digest("hex")
  return JSON.stringify({
    id: 1,
    method: "user.auth",
    params: ["API", line.keyId, signature, expiry],
  })
}

function connect(line: Line): void {
  const generation = (line.generation += 1)
  teardown(line)

  let socket: WebSocket
  try {
    socket = new WebSocket(phemexWsUrl(line.network))
  } catch {
    // **The watchdog is started before giving up, not after.** It used to be
    // started only at the end of a successful connect, so a line whose very
    // first socket refused to open had nothing left to retry it. It stayed
    // safe — a line with no socket never vouches for anything — and quietly
    // never saved a single request, which is the most expensive kind of
    // silence.
    scheduleReconnect(line)
    startWatchdog(line)
    return
  }
  line.socket = socket

  socket.addEventListener("open", () => {
    if (generation !== line.generation) return
    line.openedAt = Date.now()
    line.lastMessageAt = Date.now()
    const auth = authMessage(line)
    if (!auth) {
      teardown(line)
      scheduleReconnect(line)
      return
    }
    try {
      socket.send(auth)
    } catch {
      // The watchdog notices a socket that cannot be written to.
    }
    line.pinger = setInterval(() => {
      try {
        socket.send(
          JSON.stringify({ id: 9, method: "server.ping", params: [] })
        )
      } catch {
        // The watchdog handles a dead socket; the ping must not throw.
      }
    }, PING_EVERY_MS)
    line.pinger.unref?.()
  })

  socket.addEventListener("message", (event) => {
    if (generation !== line.generation) return
    // ANY message proves the line is alive, a pong included. `aop_p` speaks
    // only when something changes, so a quiet account would look dead without
    // the heartbeat counting.
    line.lastMessageAt = Date.now()
    if (line.attempts > 0 && Date.now() - line.openedAt > STEADY_AFTER_MS) {
      line.attempts = 0
    }
    let message: unknown
    try {
      message = JSON.parse(String(event.data))
    } catch {
      return
    }
    const reply = message as { id?: unknown; error?: unknown }
    if (reply.id === 1) {
      // Signed in, or refused. A refusal is not retried in a tight loop: the
      // socket goes and the ordinary backoff applies, because a key the
      // exchange will not accept is not going to start working this second.
      if (reply.error) {
        teardown(line)
        scheduleReconnect(line)
        return
      }
      try {
        socket.send(
          JSON.stringify({ id: 2, method: "aop_p.subscribe", params: [] })
        )
      } catch {
        // The watchdog will notice.
      }
      return
    }
    if (reply.id === 2) {
      if (reply.error) {
        teardown(line)
        scheduleReconnect(line)
        return
      }
      // Watching starts here and not a moment earlier. The first message after
      // this is a fifty-row backlog of things that happened before anyone was
      // looking, so it must be counted as a change — which it is, by the rule
      // below — and `watchingSince` being now means no caller is told the
      // account was quiet across that backlog.
      line.watchingSince = Date.now()
      return
    }
    if (reply.id === 9) return
    if (saysSomethingHappened(message)) line.changedAt = Date.now()
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
      connect(line)
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
