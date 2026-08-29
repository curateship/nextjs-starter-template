import type { NetworkId } from "@/lib/protocols/contracts"
import { subscriptionClient } from "@/server/protocols/hyperliquid/client"

/**
 * A wallet's resting orders, pushed by the exchange instead of asked for.
 *
 * **Why this exists.** Asking costs 20 request-weight and the app asks every
 * four seconds while a Trade tab is open — 300 of the 1,200 weight a minute
 * Hyperliquid allows, for one wallet, on a question whose answer is usually
 * the same as last time. Counted, not guessed: see
 * `account-cost.test.ts` and `workspace/docs/exchanges/hyperliquid-rate-limits.md`.
 * The socket sends the identical list, in full, for nothing.
 *
 * **This is a snapshot feed, not a stream of changes.** Every push carries the
 * whole list the way the REST answer does, so there is no running total to get
 * out of step. What could still go wrong is the list being old, and three
 * rules stop an old list ever being shown:
 *
 * - **Nothing is trusted until a push has landed.** A feed that has just
 *   opened, or one whose socket will not open at all, says "cannot say" and
 *   the caller asks the exchange the ordinary way.
 * - **Nothing said before this app last changed an order is trusted.** Placing,
 *   cancelling or moving anything sets a line in the sand, and the feed is
 *   silent until the exchange pushes a list from after that moment. So the app
 *   can never be shown its own order as though it had not happened.
 * - **A feed that has gone quiet for {@link TRUST_MS} stops being believed.**
 *   The exchange pushes on change, so a quiet wallet is genuinely quiet — but
 *   a socket that died is quiet in exactly the same way, and only one of those
 *   is safe.
 *
 * Every failure ends in the same place: the exchange gets asked directly, the
 * way it always was. The worst this feed can do is save nothing.
 */

/** How long a pushed list stands before the exchange is asked directly. */
const TRUST_MS = 5 * 60_000

/** Dropped if nothing has asked about a wallet for this long. */
const IDLE_MS = 10 * 60_000

type Feed = {
  /**
   * The last list pushed, exactly as the exchange sent it.
   *
   * Named `resting` rather than `orders` deliberately. `order-book-version.ts`
   * guards the practice book's order list by failing on any `.orders` mutation
   * that does not bump its version counter, and it is blind to what the
   * `.orders` is hanging off — on purpose, because a rule with a hole in it
   * reads as cover. This is the exchange's own list of what is resting, not
   * that book, so it takes a different name rather than a waiver.
   */
  resting: unknown[]
  /** When that push arrived, or 0 if none has. */
  at: number
  /** When anything last asked. */
  askedAt: number
  close: () => void
}

const feeds = new Map<string, Feed>()

/**
 * Nothing pushed before this moment is trusted.
 *
 * One line for every wallet rather than one per wallet: an order call carries
 * a signing key and not the account address, so the code that changes an order
 * cannot always name whose it was — the same reason the portfolio cache is
 * thrown away whole.
 */
let distrustBefore = 0

function keyFor(network: NetworkId, address: string, dex: string): string {
  return `${network}:${address.toLowerCase()}:${dex}`
}

/**
 * This wallet's resting orders on one market, or null when the socket cannot
 * say and the exchange has to be asked.
 *
 * **Null is not "no orders".** It means nobody has told us yet, and treating
 * it as an empty list would take a real resting order off the screen.
 */
export function restingOrdersFromFeed(
  network: NetworkId,
  address: string,
  dex: string
): unknown[] | null {
  const key = keyFor(network, address, dex)
  const feed = feeds.get(key)
  if (!feed) {
    void open(network, address, dex)
    return null
  }
  feed.askedAt = Date.now()
  if (feed.at === 0) return null
  if (feed.at <= distrustBefore) return null
  if (Date.now() - feed.at >= TRUST_MS) return null
  return feed.resting
}

/** This app just changed an order, so every pushed list is now out of date. */
export function distrustOpenOrderFeeds(): void {
  distrustBefore = Date.now()
}

/** Opens the feed for one wallet on one market, once. */
async function open(
  network: NetworkId,
  address: string,
  dex: string
): Promise<void> {
  const key = keyFor(network, address, dex)
  if (feeds.has(key)) return

  const now = Date.now()
  // Registered BEFORE the await, so two callers a millisecond apart cannot
  // both open a subscription for the same wallet.
  const feed: Feed = { resting: [], at: 0, askedAt: now, close: () => {} }
  feeds.set(key, feed)

  try {
    const subscription = await subscriptionClient(network).openOrders(
      { user: address.toLowerCase() as `0x${string}`, dex },
      (event) => {
        if (!Array.isArray(event.orders)) return
        feed.resting = event.orders
        feed.at = Date.now()
      }
    )
    feed.close = () => void subscription.unsubscribe().catch(() => {})
  } catch {
    // A socket that will not open is not an error worth stopping anything for
    // — the caller asks the exchange instead. Dropped so the next ask retries.
    feeds.delete(key)
  }
}

/**
 * Closes feeds nothing has asked about lately.
 *
 * Called from the pass that reads a portfolio rather than on a timer of its
 * own, which would keep this module alive in a process that has finished
 * with it.
 */
export function dropIdleOpenOrderFeeds(now: number = Date.now()): void {
  for (const [key, feed] of feeds) {
    if (now - feed.askedAt < IDLE_MS) continue
    feed.close()
    feeds.delete(key)
  }
}
