import type { NetworkId, WalletOrderFill } from "@/lib/protocols/contracts"
import {
  LIGHTER_KEEPALIVE_MS,
  lighterWsUrl,
} from "@/lib/protocols/lighter/translate"
import { reconnectDelay } from "@/lib/protocols/timing"
import { countLighterSocketSend } from "@/server/protocols/lighter/budget"

/**
 * A Lighter account, pushed rather than asked for.
 *
 * **Why this file exists.** Lighter allows sixty requests a minute, the
 * tightest cap of the five venues, and REST and socket spend the same bucket.
 * Before this, one idle browser tab on the Lighter page spent 46 of those
 * sixty — measured on 26 Aug 2026 — reading the same account over and over:
 * 23 for the position, 22 for the resting orders and 14 more for the balance,
 * which asked the very same endpoint from a second caller. The background
 * ceiling is 48, so the chart asked last and was refused, and the person was
 * told "The chart could not load" about a chart that was fine.
 *
 * Every other venue already reads its account this way — Hyperliquid's
 * `open-orders-feed`, Aster's `user-stream`, Phemex's and KuCoin's
 * `private-feed`. Lighter was the only one polling, and it was the only one
 * that could not afford to.
 *
 * **Three channels, and only one of them needs a signature.**
 *
 * - `account_all/{index}` — positions and trades. NO auth. Measured against
 *   Lighter's live socket on 26 Aug 2026: it subscribes on a `?readonly=true`
 *   line and pushes a positions map whose rows carry exactly the fields the
 *   REST account read already parses, so both go through the same converter
 *   in `account.ts` rather than a second copy that could drift.
 * - `user_stats/{index}` — collateral, portfolio value and available balance.
 *   NO auth. This is where the money figures come from; `account_all` does
 *   not state them.
 * - `account_all_orders/{index}` — the resting orders. This one DOES need
 *   auth, and answers `20001 invalid param : auth field is required` without
 *   it. It is the only part that needs the signer, so a server with no
 *   signing files still shows positions and money — the same rule the REST
 *   path already keeps, and the reason a real position once sat on the
 *   exchange with an empty screen in front of it.
 */

/**
 * How long a line gets to send its first snapshot before it is called dead.
 *
 * **Silence afterwards is not staleness.** This is the difference between an
 * account feed and a price feed, and getting it wrong cost a whole round of
 * this work: prices tick several times a second, so twelve seconds of quiet
 * means a broken line — but an account that is not trading says nothing at
 * all after its opening snapshot, sometimes for hours. Ageing the account out
 * after twelve seconds tore the socket down and rebuilt it forever, and left
 * every read falling back to REST, which is the very thing this file exists
 * to stop. So the snapshot stands until Lighter replaces it or the line
 * closes, and the socket's own health is what the watchdog watches.
 */
const FIRST_SNAPSHOT_MS = 15_000
const WATCHDOG_EVERY_MS = 4_000

/**
 * How long a line has to stay up before it counts as recovered.
 *
 * Lighter was measured dropping this socket after about thirteen seconds
 * whenever the minute's allowance was spent, so anything under a minute is
 * not proof of health — it is the same failure on its way round again.
 */
const STEADY_AFTER_MS = 60_000

/**
 * How often the Journal is reconciled against Lighter's own trade history
 * even while the socket looks healthy.
 *
 * Pushed fills alone are not trusted with the Journal. `account_all` carries
 * a `trades` field that was empty every time it was watched, so how it fills
 * in during a real trade is unproven — and a Journal that quietly stops
 * growing is the worst failure this app has, because it looks like a day
 * with no trades. So the REST sweep still runs, just five-minutely instead of
 * every thirty seconds: 1 request per five minutes rather than 3 a minute.
 */
const RECONCILE_EVERY_MS = 5 * 60_000

/**
 * The most often the Journal may be read from Lighter, whatever happens.
 *
 * A floor, so a feed that keeps reconnecting — every drop asks for a
 * reconcile — can never cost more than a plain poll would have. Measured
 * 27 Aug 2026 while browsing thirty coins: at thirty seconds this was the
 * single biggest spender left, ten of thirty-seven requests. At sixty it is
 * half that, and a fill is still written down and announced within a minute
 * of happening.
 */
const SWEEP_FLOOR_MS = 60_000

type Listener = (fill: WalletOrderFill) => void

type Account = {
  index: number
  /** Lighter's own rows, kept raw so `account.ts` does the reading. */
  positions: unknown[]
  stats: Record<string, unknown> | null
  restingOrders: unknown[] | null
  /** When each part last arrived, so a half-open line is never called fresh. */
  positionsAt: number
  statsAt: number
  ordersAt: number
  /** This account's own token supplier, for its orders channel alone. */
  auth: (() => Promise<string | null>) | null
  seenTrades: Set<string>
  needsRecovery: boolean
}

type Hub = {
  network: NetworkId
  accounts: Map<number, Account>
  socket: WebSocket | null
  generation: number
  openedAt: number
  lastPingAt: number
  reconnectAt: number
  attempts: number
  /**
   * **One dial at a time.**
   *
   * Three readers open this feed in the same poll — the position, the balance
   * and the resting orders — and each used to be able to start its own
   * connection, every one of them tearing down the last. Lighter then saw a
   * burst of handshakes and refused some outright (`1002`, a line that never
   * upgraded), which read as a flaky socket and sent every account read back
   * to REST. Aster's user stream has carried this same flag from the start.
   */
  dialling: boolean
  watchdog: ReturnType<typeof setInterval> | null
}

const scope = globalThis as {
  __tradeLighterPrivateHubs?: Map<NetworkId, Hub>
  __tradeLighterAccountIndexes?: Map<string, number>
  __tradeLighterFillAttempts?: Map<string, number>
  __tradeLighterRecoveredAt?: Map<string, number>
}

function hubs(): Map<NetworkId, Hub> {
  return (scope.__tradeLighterPrivateHubs ??= new Map())
}

/**
 * Which account number sits behind a wallet address.
 *
 * The fills sweep asks its questions by address and cannot wait for an
 * answer — `fillsNeedRecovery` is called on a synchronous path — while
 * Lighter names an account by number. So the number is remembered the first
 * time something looks it up. An address never seen before is treated as
 * needing recovery, which reads from Lighter's own history: the safe answer.
 */
function indexes(): Map<string, number> {
  return (scope.__tradeLighterAccountIndexes ??= new Map())
}

/**
 * When each wallet's Journal was last read from Lighter, kept BY ADDRESS.
 *
 * Deliberately not on the account: the floor below has to hold before the
 * account number is even known. A wallet whose lookup is failing has no
 * account, so it answered "recover" every time — and saying that takes the
 * sweep off its own throttle, turning one read every thirty seconds into one
 * on every four-second poll, exactly when the venue is already unhappy.
 */
function recoveredAt(): Map<string, number> {
  return (scope.__tradeLighterRecoveredAt ??= new Map())
}

function fillAttempts(): Map<string, number> {
  return (scope.__tradeLighterFillAttempts ??= new Map())
}

function addressKey(network: NetworkId, address: string): string {
  return `${network}:${address.toLowerCase()}`
}

export function rememberLighterAccountIndex(
  network: NetworkId,
  address: string,
  accountIndex: number
): void {
  indexes().set(addressKey(network, address), accountIndex)
}

function indexForAddress(
  network: NetworkId,
  address: string
): number | undefined {
  return indexes().get(addressKey(network, address))
}

function hubFor(network: NetworkId): Hub {
  const found = hubs().get(network)
  if (found) return found
  const made: Hub = {
    network,
    accounts: new Map(),
    socket: null,
    generation: 0,
    openedAt: 0,
    lastPingAt: 0,
    reconnectAt: 0,
    attempts: 0,
    dialling: false,
    watchdog: null,
  }
  hubs().set(network, made)
  return made
}

function accountFor(hub: Hub, index: number): Account {
  const found = hub.accounts.get(index)
  if (found) return found
  const made: Account = {
    index,
    positions: [],
    stats: null,
    restingOrders: null,
    positionsAt: 0,
    statsAt: 0,
    ordersAt: 0,
    auth: null,
    seenTrades: new Set(),
    needsRecovery: true,
  }
  hub.accounts.set(index, made)
  return made
}

function sendCounted(hub: Hub, frame: object): void {
  const socket = hub.socket
  if (!socket || socket.readyState !== WebSocket.OPEN) return
  try {
    socket.send(JSON.stringify(frame))
    countLighterSocketSend(hub.network)
  } catch {
    // The watchdog replaces a socket that cannot accept a frame.
  }
}

/**
 * Ask for one account's channels. The two public ones go out immediately; the
 * orders channel waits on the token and is simply skipped when there is no
 * signer, which costs positions and money nothing.
 */
function subscribe(hub: Hub, account: Account): void {
  sendCounted(hub, {
    type: "subscribe",
    channel: `account_all/${account.index}`,
  })
  sendCounted(hub, {
    type: "subscribe",
    channel: `user_stats/${account.index}`,
  })
  /**
   * **The token belongs to this account and to no other.** One socket carries
   * every Lighter wallet on this server, and they belong to different people.
   * Holding the token supplier on the hub meant whichever wallet connected
   * last supplied the token for ALL of them — one person's signature asking
   * for another person's resting orders. Lighter would very likely refuse it,
   * but tenancy is this app's job to keep, not the exchange's.
   */
  const auth = account.auth
  if (!auth) return
  const generation = hub.generation
  void auth()
    .then((token) => {
      // A token that arrives after the line was replaced belongs to a socket
      // that no longer exists; the new line asks for itself.
      if (!token || generation !== hub.generation) return
      sendCounted(hub, {
        type: "subscribe",
        channel: `account_all_orders/${account.index}`,
        auth: token,
      })
    })
    .catch(() => {
      // No token means no resting orders over the socket. The portfolio read
      // falls back to REST for that half alone, and says so.
    })
}

/**
 * Lighter's pushed rows in the shape its REST account read answers, so
 * `toLighterPortfolio` and `toLighterAccountFigures` stay the only two
 * readers of a Lighter account. Two readers of one payload is how a socket
 * and a REST path quietly start disagreeing about money.
 *
 * Pure, and tested against frames captured from the live socket.
 */
export function lighterAccountShape(
  accountIndex: number,
  positions: readonly unknown[],
  stats: Record<string, unknown> | null
): Record<string, unknown> {
  const from = stats ?? {}
  return {
    account_index: accountIndex,
    collateral: from.collateral,
    available_balance: from.available_balance,
    // Lighter calls it the portfolio value on the socket and the total asset
    // value over REST. Same number, checked against both.
    total_asset_value: from.portfolio_value,
    positions: [...positions],
  }
}

/** The positions on an `account_all` frame — a map keyed by market id. */
export function lighterPositionsFromFrame(packet: unknown): unknown[] | null {
  if (!packet || typeof packet !== "object") return null
  const positions = (packet as { positions?: unknown }).positions
  if (!positions || typeof positions !== "object") return null
  return Array.isArray(positions)
    ? positions
    : Object.values(positions as Record<string, unknown>)
}

/** The money figures on a `user_stats` frame. */
export function lighterStatsFromFrame(
  packet: unknown
): Record<string, unknown> | null {
  if (!packet || typeof packet !== "object") return null
  const stats = (packet as { stats?: unknown }).stats
  if (!stats || typeof stats !== "object") return null
  return stats as Record<string, unknown>
}

/** The account number a frame is about, from `account_all:337499`. */
function indexOf(channel: unknown): number | null {
  if (typeof channel !== "string") return null
  const tail = channel.slice(channel.lastIndexOf(":") + 1)
  const found = Number(tail)
  return Number.isInteger(found) ? found : null
}

function apply(hub: Hub, packet: unknown): void {
  if (!packet || typeof packet !== "object") return
  const frame = packet as Record<string, unknown>
  const type = typeof frame.type === "string" ? frame.type : ""
  const index = indexOf(frame.channel)
  if (index === null) return
  const account = hub.accounts.get(index)
  if (!account) return
  const now = Date.now()

  if (type.endsWith("/account_all")) {
    const positions = lighterPositionsFromFrame(frame)
    if (positions) {
      account.positions = positions
      account.positionsAt = now
    }
    pushTrades(account, frame.trades)
    return
  }
  if (type.endsWith("/user_stats")) {
    const stats = lighterStatsFromFrame(frame)
    if (stats) {
      account.stats = stats
      account.statsAt = now
    }
    return
  }
  if (type.endsWith("/account_all_orders")) {
    const orders = frame.orders
    if (orders && typeof orders === "object") {
      account.restingOrders = Array.isArray(orders)
        ? orders
        : Object.values(orders as Record<string, unknown>).flatMap((one) =>
            Array.isArray(one) ? one : [one]
          )
      account.ordersAt = now
    }
  }
}

/**
 * Hand every trade the socket names to whoever is listening, once each.
 *
 * Shape-tolerant on purpose: this field was empty every time it was watched,
 * so it may arrive as a list or as a map of lists. Anything that cannot be
 * read is left for the five-minutely reconcile rather than guessed at.
 */
function pushTrades(account: Account, raw: unknown): void {
  if (!raw || typeof raw !== "object") return
  const rows = Array.isArray(raw)
    ? raw
    : Object.values(raw as Record<string, unknown>).flatMap((one) =>
        Array.isArray(one) ? one : [one]
      )
  for (const row of rows) {
    if (!row || typeof row !== "object") continue
    const id = (row as Record<string, unknown>).trade_id_str
    const key = typeof id === "string" ? id : JSON.stringify(row).slice(0, 80)
    if (account.seenTrades.has(key)) continue
    account.seenTrades.add(key)
    // The row still has to be turned into a fill, and only the caller knows
    // this wallet's account number and the market's name. Recovery is the
    // honest answer here rather than a half-read fill.
    account.needsRecovery = true
  }
  forgetOldTrades(account)
}

function forgetOldTrades(account: Account): void {
  if (account.seenTrades.size <= 500) return
  const keep = [...account.seenTrades].slice(-250)
  account.seenTrades = new Set(keep)
}

function teardown(hub: Hub): void {
  const socket = hub.socket
  hub.socket = null
  if (socket) {
    try {
      socket.close()
    } catch {
      // Already gone.
    }
  }
  // A dropped line means the Journal may have missed a fill, and every
  // account on it goes back to being reconciled from Lighter's own history.
  for (const account of hub.accounts.values()) {
    account.needsRecovery = true
    account.positionsAt = 0
    account.statsAt = 0
    account.ordersAt = 0
  }
}

function scheduleReconnect(hub: Hub): void {
  hub.reconnectAt = Date.now() + reconnectDelay(hub.attempts)
  hub.attempts += 1
}

function connect(hub: Hub): void {
  // A dial already under way is the answer for every caller behind it.
  if (hub.dialling) return
  hub.dialling = true
  const generation = (hub.generation += 1)
  teardown(hub)
  let socket: WebSocket
  try {
    // `?readonly=true` is required: the bare address answers a non-101 status
    // and the line dies at close code 1002. The two public channels work on a
    // readonly line, and the orders channel authenticates in its own frame.
    socket = new WebSocket(`${lighterWsUrl(hub.network)}?readonly=true`)
  } catch {
    hub.dialling = false
    scheduleReconnect(hub)
    return
  }
  hub.socket = socket
  socket.addEventListener("open", () => {
    hub.dialling = false
    if (generation !== hub.generation) return
    hub.openedAt = Date.now()
    hub.lastPingAt = Date.now()
    for (const account of hub.accounts.values()) subscribe(hub, account)
  })
  socket.addEventListener("message", (event) => {
    if (generation !== hub.generation) return
    /**
     * **The backoff is NOT reset here**, and that is the whole point.
     *
     * Lighter drops a socket when the minute's allowance is spent, and it
     * keeps dropping it while the allowance stays spent. Clearing the count
     * on the first frame meant every drop was followed by a one-second
     * reconnect and three more subscribe frames — spent from the very bucket
     * that was already empty — so the line died again about thirteen seconds
     * later, measured, over and over. The reads in each gap fell back to
     * REST, which spent more still. A line that keeps dying has to wait
     * longer each time, and only a line that STAYS up has recovered, which
     * the watchdog decides below.
     */
    try {
      apply(hub, JSON.parse(String(event.data)))
    } catch {
      // A malformed frame carries nothing usable.
    }
  })
  const gone = () => {
    hub.dialling = false
    if (generation !== hub.generation) return
    teardown(hub)
    scheduleReconnect(hub)
  }
  socket.addEventListener("close", gone)
  socket.addEventListener("error", gone)

  if (!hub.watchdog) {
    hub.watchdog = setInterval(() => {
      if (hub.reconnectAt > 0 && Date.now() >= hub.reconnectAt) {
        hub.reconnectAt = 0
        connect(hub)
        return
      }
      // A line that has died without anyone noticing is dialled again here,
      // rather than left in place blocking every future attempt.
      if (!isLive(hub)) {
        if (hub.reconnectAt === 0) scheduleReconnect(hub)
        return
      }
      if (hub.reconnectAt > 0) return
      // A line that has stayed up this long is genuinely healthy, so the
      // backoff starts again from the beginning. Anything shorter is a line
      // Lighter is still dropping, and it must keep waiting longer.
      if (Date.now() - hub.openedAt >= STEADY_AFTER_MS) hub.attempts = 0
      // Lighter closes a line whose CLIENT stays silent for two minutes.
      // Pushed frames do not count, so the hub pings on its own clock.
      if (Date.now() - hub.lastPingAt >= LIGHTER_KEEPALIVE_MS) {
        hub.lastPingAt = Date.now()
        sendCounted(hub, { type: "ping" })
      }
      /**
       * The only failure a quiet account feed can show: a line that opened
       * and never sent its opening snapshot. Once every account has one, the
       * line is judged by whether it is still open, which the close and error
       * handlers above answer.
       */
      if (Date.now() - hub.openedAt <= FIRST_SNAPSHOT_MS) return
      const silent = [...hub.accounts.values()].some(
        (one) => one.positionsAt === 0 || one.statsAt === 0
      )
      if (!silent) return
      teardown(hub)
      scheduleReconnect(hub)
    }, WATCHDOG_EVERY_MS)
    hub.watchdog.unref?.()
  }
}

/**
 * Start listening to one account, or note that it is still wanted. Cheap to
 * call on every read: an account already subscribed costs nothing.
 */
export function openLighterPrivateFeed(
  network: NetworkId,
  accountIndex: number,
  auth?: () => Promise<string | null>
): void {
  // Lighter is mainnet only. Anything else does nothing rather than retrying
  // a refusal forever — the caller falls back to REST and names it once.
  if (network !== "mainnet") return
  const hub = hubFor(network)
  const fresh = !hub.accounts.has(accountIndex)
  const account = accountFor(hub, accountIndex)
  if (auth) account.auth = auth
  /**
   * **This caller is the retry engine, not the watchdog.** The watchdog is
   * created inside a successful connection, so a first attempt that failed
   * left a reconnect time nothing would ever act on: the feed was wedged
   * shut for the life of the process and every read fell back to REST. This
   * runs on every account read, which is exactly the clock a retry wants,
   * and it still respects the backoff that `scheduleReconnect` set.
   */
  if (
    !isLive(hub) &&
    (hub.reconnectAt === 0 || Date.now() >= hub.reconnectAt)
  ) {
    hub.reconnectAt = 0
    connect(hub)
    return
  }
  if (fresh) subscribe(hub, account)
}

/**
 * The account as Lighter's REST read would have stated it, or null when the
 * socket has not said enough yet.
 *
 * Assembled into the REST shape on purpose, so `toLighterPortfolio` and
 * `toLighterAccountFigures` stay the only two places that read Lighter's
 * account fields. Two readers of one payload is how the socket and the REST
 * path quietly start disagreeing about money.
 */
export function lighterAccountFromFeed(
  network: NetworkId,
  accountIndex: number
): { account: Record<string, unknown>; ageMs: number } | null {
  const hub = hubs().get(network)
  const held = hub?.accounts.get(accountIndex)
  if (!held || held.positionsAt === 0 || held.statsAt === 0) return null
  // Open line, snapshot in hand: this IS the account, however long ago
  // Lighter last had something to say about it. A closed line clears the
  // timestamps in `teardown`, so a stale snapshot can never be served.
  if (!isOpen(hub)) return null
  const ageMs = Date.now() - Math.min(held.positionsAt, held.statsAt)
  return {
    account: lighterAccountShape(held.index, held.positions, held.stats),
    ageMs,
  }
}

/** The resting orders as Lighter last pushed them, or null when unsigned. */
export function lighterOrdersFromFeed(
  network: NetworkId,
  accountIndex: number
): unknown[] | null {
  const hub = hubs().get(network)
  const held = hub?.accounts.get(accountIndex)
  if (!held || held.restingOrders === null || held.ordersAt === 0) return null
  return isOpen(hub) ? held.restingOrders : null
}

/** Whether the line is up. A closed one has already cleared its snapshots. */
function isOpen(hub: Hub | undefined): boolean {
  return Boolean(hub?.socket && hub.socket.readyState === WebSocket.OPEN)
}

/**
 * Whether this hub still has a socket worth waiting for.
 *
 * **"There is a socket" is not the same as "the socket works."** A closed one
 * stays on the hub until something clears it, and the hub outlives the module
 * that made it — it is kept on `globalThis` so a reload does not orphan a live
 * line. Testing for a socket rather than a working socket meant one dead line
 * stopped the feed from ever dialling again, and every read fell back to REST
 * for good. That is exactly the failure this file was written to end, so it is
 * asked properly in all three places that ask.
 */
function isLive(hub: Hub): boolean {
  const socket = hub.socket
  if (!socket) return false
  return (
    socket.readyState === WebSocket.OPEN ||
    socket.readyState === WebSocket.CONNECTING
  )
}

/**
 * Whether the Journal still has to be reconciled against Lighter's own trade
 * history. True while the line is down or newly up, and true again every five
 * minutes so a missed push cannot leave the Journal quietly short.
 */
export function lighterFillsNeedRecovery(
  network: NetworkId,
  address: string,
  now = Date.now()
): boolean {
  /**
   * **Never ask more often than the poll this replaced.** Saying "recover"
   * takes the sweep off its own thirty-second throttle entirely, so a flag
   * that sticks on — a line that reconnects a few times, say — turns one read
   * every thirty seconds into one on every four-second poll. That is the
   * opposite of the point, and it was measured happening: 3 reads a minute
   * became 10. This floor is checked before anything else, so it holds even
   * for a wallet whose account number is not known yet.
   */
  const key = addressKey(network, address)
  const lastAttempt = fillAttempts().get(key) ?? 0
  if (now - lastAttempt < SWEEP_FLOOR_MS) return false
  const last = recoveredAt().get(key) ?? 0
  if (now - last < SWEEP_FLOOR_MS) return false
  const index = indexForAddress(network, address)
  if (index === undefined) return true
  const held = hubs().get(network)?.accounts.get(index)
  if (!held) return true
  if (held.needsRecovery) return true
  return now - last >= RECONCILE_EVERY_MS
}

/** Start the floor even when Lighter refuses the read. */
export function markLighterFillsAttempted(
  network: NetworkId,
  address: string,
  now = Date.now()
): void {
  fillAttempts().set(addressKey(network, address), now)
}

/** Said by the fills sweep once it has read Lighter's history successfully. */
export function markLighterFillsReconciled(
  network: NetworkId,
  address: string
): void {
  // Recorded by address first, so the floor holds even when nothing yet
  // knows which Lighter account this wallet is.
  recoveredAt().set(addressKey(network, address), Date.now())
  const index = indexForAddress(network, address)
  if (index === undefined) return
  const held = hubs().get(network)?.accounts.get(index)
  if (!held) return
  held.needsRecovery = false
}

/**
 * Keep this wallet's account channels open, and reconcile its Journal when
 * the socket says something happened.
 *
 * **This hands back no fill of its own, on purpose.** `account_all` carries a
 * `trades` field that was empty every time it was watched, so how it fills in
 * during a real trade is unproven — and a fill read wrongly is worse than one
 * read a moment later. What a pushed trade does is mark the account for
 * recovery, which sends the sweep to Lighter's own trade history, the one
 * reader that has been proven against real fills. The saving is still the
 * whole point: that history is read when something happens and otherwise
 * five-minutely, instead of every thirty seconds forever.
 */
export function watchLighterFills(
  network: NetworkId,
  address: string,
  _listenerId: string,
  _credential: () => string | null,
  _onFill: Listener
): void {
  const index = indexForAddress(network, address)
  if (index === undefined) return
  openLighterPrivateFeed(network, index)
}

/**
 * How long one REST answer stands in for the next while the socket is down.
 *
 * **This is what stops the collapse.** Lighter drops the socket when the
 * minute's allowance is spent. With nothing held, every four-second poll then
 * asked over REST — spending the very allowance that was keeping the socket
 * dead, so the line never recovered and the chart was refused. Measured
 * 27 Aug 2026: 46 requests a minute with 11 refusals became 12 with none.
 *
 * Thirty seconds, where Hyperliquid holds its portfolio for four. Longer
 * because Lighter allows sixty requests a minute where Hyperliquid allows
 * thousands, and because this is only ever reached when the socket — which is
 * instant and free — is not answering.
 *
 * Measured 27 Aug 2026 while browsing thirty coins: the account and its
 * resting orders were 34 of the 55 requests spent, all of them this fallback
 * firing every ten seconds. At thirty they come to four a minute, which is
 * the difference between a tight minute and a comfortable one.
 *
 * **What it costs.** A position or a resting order changed somewhere else —
 * on Lighter's own site — can be up to thirty seconds out of date on screen
 * while the socket is down. Anything THIS app sends drops the held answer
 * first, so nothing you do here is ever answered with a stale one.
 */
const REST_HELD_MS = 30_000

const held = new Map<string, { at: number; load: Promise<unknown> }>()

/**
 * One REST read standing in for every caller in the next few seconds.
 *
 * The position read and the balance read ask Lighter the very same endpoint,
 * so without this a single poll cost two requests for one answer.
 */
export function heldLighterRead<T>(
  kind: string,
  network: NetworkId,
  accountIndex: number,
  load: () => Promise<T>
): Promise<T> {
  const key = `${kind}:${network}:${accountIndex}`
  const found = held.get(key)
  if (found && Date.now() - found.at < REST_HELD_MS) {
    return found.load as Promise<T>
  }
  const fresh = load()
  held.set(key, { at: Date.now(), load: fresh })
  fresh.catch(() => {
    if (held.get(key)?.load === fresh) held.delete(key)
  })
  return fresh
}

/**
 * Drop everything held for one account.
 *
 * Called before this app changes anything on the exchange: whatever is held
 * is about to stop being true. Without it an order could be cancelled and
 * still listed for ten seconds — and `setBrackets` cancels the list it is
 * given, so a stale one is a stop taken off a position that still needs it.
 */
export function forgetLighterHeldReads(
  network: NetworkId,
  accountIndex: number
): void {
  for (const key of [...held.keys()]) {
    if (key.endsWith(`:${network}:${accountIndex}`)) held.delete(key)
  }
}

export function closeLighterPrivateFeeds(): void {
  held.clear()
  fillAttempts().clear()
  for (const hub of hubs().values()) {
    hub.generation += 1
    teardown(hub)
    if (hub.watchdog) clearInterval(hub.watchdog)
    hub.watchdog = null
    hub.accounts.clear()
  }
  hubs().clear()
}
