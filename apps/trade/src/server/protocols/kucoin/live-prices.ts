import type { NetworkId } from "@/lib/protocols/contracts"
import { num } from "@/lib/protocols/kucoin/translate"
import { reconnectDelay } from "@/lib/protocols/timing"
import { kucoinLiveTicket } from "@/server/protocols/kucoin/live-ticket"

/**
 * An open line to KuCoin, on the server: mark prices arrive here, they are
 * not asked for. The same job — and deliberately the same shape — as the
 * Hyperliquid and Phemex hubs beside it: long-lived sockets shared by the
 * process, health judged by data arriving rather than by the socket claiming
 * to be up, stale answers marked stale, and a caller that finds the feed quiet
 * falls back to asking the REST way.
 *
 * **Two things this exchange does differently.**
 *
 * It will not accept a connection without a ticket, fetched over HTTP first.
 * So opening is not instant here: the ticket is asked for, and the socket is
 * dialled when it arrives. Everything carries on asking the REST way in the
 * meantime, which is what the freshness check is for.
 *
 * And it publishes no all-markets feed. The other two push every market in
 * one message; KuCoin is subscribed to per market, so this hub is told which
 * markets matter and subscribes to those. Measured against the live exchange
 * on 20 Aug 2026: `/contractMarket/tickerV2:all` is accepted without
 * complaint and then never sends anything, which is the sort of thing that
 * looks like a working feed until a trade depends on it.
 *
 * The topic is `/contract/instrument`, which carries `markPrice` — not
 * `tickerV2`, which carries the best bid and ask. The mark price is what the
 * engine fires triggers on and what the other two hubs push, and on a thin
 * book the two are percentage points apart.
 *
 * Public market data only. No key, no session, nothing signed.
 */

/**
 * How many markets one socket will carry.
 *
 * **Going over does not lose the extras. It kills the whole line.** Measured
 * against the live exchange on 22 Aug 2026, same markets each time, 40 seconds
 * of listening: 100 markets on one connection ticked normally, and 130, 160,
 * 200 and 250 each delivered NOTHING AT ALL. Not the first hundred and then
 * silence — silence from the first market on. So the cap is somewhere between
 * 100 and 130, and overshooting it is not a partial answer but a dead feed
 * that still reports itself connected.
 *
 * 90 keeps a margin under the lowest number that worked. It is not worth
 * shaving: one more market per line saves a fraction of a connection, and
 * being wrong costs every price on that line.
 */
const MARKETS_PER_SOCKET = 90

/**
 * How many lines this hub will open for one network.
 *
 * KuCoin publishes no all-markets feed, so covering a wallet on hundreds of
 * markets means several connections. Six were opened at once and all six
 * carried prices, measured the same day, so six is known to work rather than
 * hoped. Eight is the ceiling here to leave headroom without inviting a
 * runaway: a wallet wanting more than 720 markets gets the rest from the REST
 * read, which is slower but truthful.
 */
const MAX_SOCKETS = 8

const STALE_AFTER_MS = 8_000
const WATCHDOG_EVERY_MS = 3_000
const STEADY_AFTER_MS = 30_000

type Hub = {
  network: NetworkId
  openedAt: number
  prices: Map<string, number>
  /** The markets someone has asked this hub to carry. */
  wanted: Set<string>
  /** The markets this socket has actually been subscribed to. */
  subscribed: Set<string>
  lastMessageAt: number
  generation: number
  socket: WebSocket | null
  /** True while a ticket is being fetched, so a second open does not race. */
  dialling: boolean
  watchdog: ReturnType<typeof setInterval> | null
  pinger: ReturnType<typeof setInterval> | null
  reconnectAt: number
  attempts: number
}

// On `globalThis` rather than module scope: the dev server reloads modules
// in place, and a module-scoped map would leave the old sockets open behind
// the new ones.
const scope = globalThis as { __tradeKucoinPriceHubs?: Map<NetworkId, Hub[]> }

/**
 * The lines open for one network. Several, because one is not enough here.
 *
 * Every other exchange in this app needs a single connection: they push every
 * market in one message. KuCoin is subscribed to per market and one connection
 * will not hold more than about a hundred of them, so a wallet on 454 markets
 * needs six lines. Each is an ordinary hub of its own — its own socket, its own
 * watchdog, its own reconnect back-off — and nothing about one line knows or
 * cares about another. That is deliberate: a line that dies takes only its own
 * markets off the feed, and the caller asks the exchange for those while the
 * rest keep arriving.
 */
function hubsFor(network: NetworkId): Hub[] {
  const byNetwork = (scope.__tradeKucoinPriceHubs ??= new Map())
  const found = byNetwork.get(network)
  if (found) return found
  const made: Hub[] = []
  byNetwork.set(network, made)
  return made
}

function makeHub(network: NetworkId): Hub {
  return {
    network,
    openedAt: 0,
    prices: new Map(),
    wanted: new Set(),
    subscribed: new Set(),
    lastMessageAt: 0,
    generation: 0,
    socket: null,
    dialling: false,
    watchdog: null,
    pinger: null,
    reconnectAt: 0,
    attempts: 0,
  }
}

/**
 * Makes sure enough lines are up to carry these markets. Free once they are up
 * and the markets are already on them.
 */
export function openKucoinLivePrices(
  network: NetworkId,
  marketIds: readonly string[] = []
): void {
  const hubs = hubsFor(network)
  const already = new Set(hubs.flatMap((hub) => [...hub.wanted]))
  /** Lines that gained a market and so have something new to subscribe to. */
  const changed = new Set<Hub>()

  for (const marketId of marketIds) {
    if (already.has(marketId)) continue
    // The first line with room. Filling them in order keeps the count as low
    // as the markets allow, so a wallet on 95 markets opens two lines and not
    // eight.
    let hub = hubs.find((one) => one.wanted.size < MARKETS_PER_SOCKET)
    if (!hub) {
      // Every line full. Past the ceiling the remaining markets are left to
      // the REST read rather than opened for: slower and rationed, but honest,
      // and the caller already asks for whatever this feed cannot answer.
      if (hubs.length >= MAX_SOCKETS) break
      hub = makeHub(network)
      hubs.push(hub)
    }
    hub.wanted.add(marketId)
    already.add(marketId)
    changed.add(hub)
  }

  for (const hub of hubs) {
    if (hub.socket) {
      if (changed.has(hub)) subscribeWanted(hub)
      continue
    }
    if (hub.dialling || hub.reconnectAt > 0) continue
    void connect(hub)
  }
}

export function readKucoinLivePrices(network: NetworkId): {
  prices: ReadonlyMap<string, number>
  ageMs: number
} {
  const hubs = hubsFor(network)
  const now = Date.now()
  const prices = new Map<string, number>()
  let youngest = Infinity

  for (const hub of hubs) {
    const age = hub.lastMessageAt === 0 ? Infinity : now - hub.lastMessageAt
    youngest = Math.min(youngest, age)
    // **Only what a line can still vouch for.** A price is offered for
    // trading, so a line that has gone quiet offers none of its own — its
    // markets are simply absent, and the caller asks the exchange for those
    // by name. With one line this could be left to `ageMs` and the caller's
    // freshness check; with several it cannot, because a single age cannot
    // speak for six sockets that fail one at a time. The price itself is kept
    // on the hub, so a line that comes back has not lost its place.
    if (age > STALE_AFTER_MS) continue
    for (const [marketId, price] of hub.prices) prices.set(marketId, price)
  }

  return { prices, ageMs: youngest }
}

export function kucoinLivePricesFresh(network: NetworkId): boolean {
  // Any line delivering means this feed has something worth reading. Which
  // markets it can actually answer for is settled by `read`, one line at a
  // time, and the caller asks for whatever is missing.
  return readKucoinLivePrices(network).ageMs <= STALE_AFTER_MS
}

/** Shuts every line. Only the tests and a clean process exit need this. */
export function closeKucoinLivePrices(network: NetworkId): void {
  for (const hub of hubsFor(network)) {
    hub.generation += 1
    teardown(hub)
    if (hub.watchdog) {
      clearInterval(hub.watchdog)
      hub.watchdog = null
    }
    hub.wanted.clear()
    hub.prices.clear()
    hub.lastMessageAt = 0
    hub.reconnectAt = 0
    hub.attempts = 0
  }
  // Dropped rather than kept empty, so the next open starts from one line
  // instead of however many the last wallet happened to need.
  scope.__tradeKucoinPriceHubs?.delete(network)
}

function teardown(hub: Hub): void {
  if (hub.pinger) {
    clearInterval(hub.pinger)
    hub.pinger = null
  }
  const socket = hub.socket
  hub.socket = null
  hub.subscribed.clear()
  if (socket) {
    try {
      socket.close()
    } catch {
      // A socket that refuses to close is already gone.
    }
  }
}

function scheduleReconnect(hub: Hub): void {
  const wait = reconnectDelay(hub.attempts)
  hub.attempts += 1
  hub.reconnectAt = Date.now() + wait
}

/** Subscribes to every wanted market this socket is not carrying yet. */
function subscribeWanted(hub: Hub): void {
  const socket = hub.socket
  if (!socket) return
  for (const marketId of hub.wanted) {
    if (hub.subscribed.has(marketId)) continue
    try {
      socket.send(
        JSON.stringify({
          id: `${Date.now()}-${marketId}`,
          type: "subscribe",
          topic: `/contract/instrument:${marketId}`,
          response: false,
        })
      )
      hub.subscribed.add(marketId)
    } catch {
      // The watchdog handles a dead socket; this must not throw.
      return
    }
  }
}

/**
 * One pushed mark price applied to the map. Anything that is not a mark
 * price — the index price rides the same topic under its own subject —
 * changes nothing.
 */
function applyTick(hub: Hub, message: unknown): void {
  const packet = message as {
    type?: unknown
    subject?: unknown
    topic?: unknown
    data?: { markPrice?: unknown }
  }
  if (packet.type !== "message" || packet.subject !== "mark.index.price") return
  const topic = typeof packet.topic === "string" ? packet.topic : ""
  const marketId = topic.startsWith("/contract/instrument:")
    ? topic.slice("/contract/instrument:".length)
    : ""
  const price = num(packet.data?.markPrice)
  if (!marketId || price === null || !(price > 0)) return
  hub.prices.set(marketId, price)
  hub.lastMessageAt = Date.now()
}

async function connect(hub: Hub): Promise<void> {
  const generation = (hub.generation += 1)
  teardown(hub)
  hub.dialling = true

  let ticket: Awaited<ReturnType<typeof kucoinLiveTicket>>
  try {
    ticket = await kucoinLiveTicket(hub.network)
  } catch {
    hub.dialling = false
    if (generation === hub.generation) {
      scheduleReconnect(hub)
      startWatchdog(hub)
    }
    return
  }
  // The ticket took a moment to arrive, and the world may have moved on.
  if (generation !== hub.generation) {
    hub.dialling = false
    return
  }

  let socket: WebSocket
  try {
    socket = new WebSocket(`${ticket.endpoint}?token=${ticket.token}`)
  } catch {
    hub.dialling = false
    scheduleReconnect(hub)
    startWatchdog(hub)
    return
  }
  hub.socket = socket
  hub.dialling = false

  socket.addEventListener("open", () => {
    if (generation !== hub.generation) return
    hub.openedAt = Date.now()
    subscribeWanted(hub)
    // The exchange drops a socket it has not heard from. It states its own
    // interval in the ticket; greeting twice as often costs nothing.
    hub.pinger = setInterval(
      () => {
        try {
          socket.send(JSON.stringify({ id: `${Date.now()}`, type: "ping" }))
        } catch {
          // The watchdog handles a dead socket; the ping just must not throw.
        }
      },
      Math.max(5_000, Math.floor(ticket.pingIntervalMs / 2))
    )
    hub.pinger.unref?.()
  })

  socket.addEventListener("message", (event) => {
    if (generation !== hub.generation) return
    if (hub.attempts > 0 && Date.now() - hub.openedAt > STEADY_AFTER_MS) {
      hub.attempts = 0
    }
    try {
      applyTick(hub, JSON.parse(String(event.data)))
    } catch {
      // A message that is not JSON is not a price.
    }
  })

  const gone = () => {
    if (generation !== hub.generation) return
    teardown(hub)
    scheduleReconnect(hub)
  }
  socket.addEventListener("close", gone)
  socket.addEventListener("error", gone)

  startWatchdog(hub)
}

function startWatchdog(hub: Hub): void {
  if (hub.watchdog) return
  hub.watchdog = setInterval(() => {
    if (hub.reconnectAt > 0 && Date.now() >= hub.reconnectAt) {
      hub.reconnectAt = 0
      void connect(hub)
      return
    }
    if (!hub.socket || hub.reconnectAt > 0 || hub.dialling) return
    // Nothing has been asked for yet, so silence is expected rather than
    // broken — reconnecting on it would be a loop that never carries a price.
    if (hub.wanted.size === 0) return
    if (Date.now() - hub.lastMessageAt <= STALE_AFTER_MS) return
    // The socket may still claim to be healthy; the data disagrees, and the
    // data is what a trade is decided on.
    teardown(hub)
    scheduleReconnect(hub)
  }, WATCHDOG_EVERY_MS)
  hub.watchdog.unref?.()
}
