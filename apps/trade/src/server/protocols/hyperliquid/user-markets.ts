import type { NetworkId } from "@/lib/protocols/contracts"
import { subscriptionClient } from "@/server/protocols/hyperliquid/client"

/**
 * Which of Hyperliquid's markets a wallet is actually using, told to us rather
 * than asked for.
 *
 * **The problem this replaces.** Hyperliquid is not one market — it is a main
 * one for coins plus however many others people have opened, each with its own
 * list and its own answer to "what does this wallet hold". There is no way to
 * ask all of them at once over the ordinary API, so finding a wallet's money
 * meant asking each in turn: fine at ten, ruinous at two hundred and forty-nine.
 * One sweep of the practice network cost about 5,500 of the 1,200 requests a
 * minute the exchange allows, so the app spent its whole allowance discovering
 * markets it does not use and had nothing left to ask a price with.
 *
 * The exchange will simply tell you instead. One socket, every market, pushed
 * as it changes — which is both free and faster than the asking ever was.
 *
 * **This never answers "what does the wallet hold".** It answers only "which
 * markets are worth asking about", and the ordinary read still does the rest.
 * A socket can be behind, dropped or not up yet, and a position drawn from a
 * stale push is a wrong number about real money. The set of markets in use is
 * the safe half: being slightly out of date there costs one extra read.
 */

/** Dropped if nothing has asked about a wallet for this long. */
const IDLE_MS = 10 * 60_000

/**
 * How stale a push may be before it stops being trusted as the whole answer.
 *
 * The exchange pushes on change, so a quiet wallet is quiet for a long time —
 * this is not about the last message, it is about the socket having been alive
 * since it opened. A feed that has died goes back to being no answer at all,
 * and the caller falls back to reading the hard way rather than believing a
 * list that stopped being updated.
 */
const TRUST_MS = 5 * 60_000

type Feed = {
  /** Market names the wallet holds something on. "" is the main one. */
  inUse: Set<string>
  /**
   * Market names the wallet has money on, held or not.
   *
   * **Not the same question as what it holds.** Hyperliquid keeps each
   * market's money separate: cash in the main account does not back a trade on
   * a market somebody else opened, and the exchange refuses those with
   * "Insufficient margin" however healthy the main balance looks. This is the
   * set a coin can actually be traded from.
   */
  funded: Set<string>
  /** When a push last arrived. */
  at: number
  /** When this feed was opened, for telling "warming up" from "gone quiet". */
  openedAt: number
  /** When anything last asked. */
  askedAt: number
  close: () => void
}

const feeds = new Map<string, Feed>()

function keyFor(network: NetworkId, address: string): string {
  return `${network}:${address.toLowerCase()}`
}

/**
 * The markets this wallet has money on, or null when the feed cannot say yet.
 *
 * **Null is not "none".** It means the socket has not spoken, and the caller
 * must go and ask properly — treating it as an empty list would quietly hide a
 * position. Asking also keeps the feed alive, so a wallet nothing looks at
 * stops costing a connection.
 */
export function marketsWalletUses(
  network: NetworkId,
  address: string
): string[] | null {
  const key = keyFor(network, address)
  const feed = feeds.get(key)
  if (feed) {
    feed.askedAt = Date.now()
    if (feed.at > 0 && Date.now() - feed.at < TRUST_MS) return [...feed.inUse]
    return null
  }
  void open(network, address)
  return null
}

/** Opens the feed for a wallet, once. */
async function open(network: NetworkId, address: string): Promise<void> {
  const key = keyFor(network, address)
  if (feeds.has(key)) return

  const now = Date.now()
  // Registered BEFORE the await, so two callers a millisecond apart cannot
  // both open a socket for the same wallet — the exchange allows ten.
  const feed: Feed = {
    inUse: new Set(),
    funded: new Set(),
    at: 0,
    openedAt: now,
    askedAt: now,
    close: () => {},
  }
  feeds.set(key, feed)

  try {
    const client = subscriptionClient(network)
    const subscription = await client.allDexsClearinghouseState(
      { user: address.toLowerCase() as `0x${string}` },
      (event) => {
        const inUse = new Set<string>()
        const funded = new Set<string>()
        for (const [market, state] of event.clearinghouseStates) {
          if (state.assetPositions.length > 0) inUse.add(market)
          if (Number(state.marginSummary.accountValue) > 0) funded.add(market)
        }
        feed.funded = funded
        // The main market is always worth reading, held or not: it is where a
        // wallet's cash sits and where almost everything is traded.
        inUse.add("")
        feed.inUse = inUse
        feed.at = Date.now()
      }
    )
    feed.close = () => void subscription.unsubscribe().catch(() => {})
  } catch {
    // A socket that will not open is not an error worth stopping anything for
    // — the caller reads the hard way. Dropped so the next ask tries again.
    feeds.delete(key)
  }
}

/**
 * Closes feeds nothing has asked about lately.
 *
 * Called from the same pass that reads wallets, rather than on a timer of its
 * own: a timer would keep this module alive in a process that has finished
 * with it.
 */
export function dropIdleWalletFeeds(now: number = Date.now()): void {
  for (const [key, feed] of feeds) {
    if (now - feed.askedAt < IDLE_MS) continue
    feed.close()
    feeds.delete(key)
  }
}

/**
 * The markets this wallet has money on, or null when the feed cannot say yet.
 *
 * **Null means "do not filter".** A coin hidden because the app had not yet
 * heard from the exchange is a coin somebody cannot find and cannot explain,
 * which is worse than offering one the exchange will refuse with a sentence
 * that now says exactly why.
 */
export function marketsWalletHasMoneyOn(
  network: NetworkId,
  address: string
): string[] | null {
  const key = keyFor(network, address)
  const feed = feeds.get(key)
  if (feed) {
    feed.askedAt = Date.now()
    if (feed.at > 0 && Date.now() - feed.at < TRUST_MS) return [...feed.funded]
    return null
  }
  void open(network, address)
  return null
}

/**
 * The funded-markets answer, waited for briefly when the feed is cold.
 *
 * Switching a flow on is a human pressing a button once, so it can afford a
 * moment's wait for the exchange's push — unlike the per-coin placement path,
 * which runs hundreds of times a minute and only ever peeks. Null still means
 * "could not say", and the caller must skip its check rather than treat
 * silence as an empty wallet.
 */
export async function awaitMarketsWalletHasMoneyOn(
  network: NetworkId,
  address: string,
  waitMs = 1_500
): Promise<string[] | null> {
  const first = marketsWalletHasMoneyOn(network, address)
  if (first !== null) return first
  const deadline = Date.now() + waitMs
  while (Date.now() < deadline) {
    await new Promise((done) => setTimeout(done, 100))
    const again = marketsWalletHasMoneyOn(network, address)
    if (again !== null) return again
  }
  return null
}

/**
 * True while a wallet's feed has just been opened and no push has landed yet.
 *
 * **The startup burst lived here.** On a fresh server the feed is always
 * cold, so the portfolio read's fallback swept every market the exchange
 * hosts — five hundred calls in the first half minute of every boot, and the
 * first thing a restarted app did was get itself rate-limited. The exchange's
 * first push arrives within a few seconds; while it is on its way, reading
 * the main market alone is the right answer, not sweeping.
 */
export function walletFeedWarmingUp(
  network: NetworkId,
  address: string
): boolean {
  const feed = feeds.get(keyFor(network, address))
  if (!feed || feed.at > 0) return false
  return Date.now() - feed.openedAt < 15_000
}
