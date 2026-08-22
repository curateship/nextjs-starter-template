import type { NetworkId, WalletOrderFill } from "@/lib/protocols/contracts"
import { subscriptionClient } from "@/server/protocols/hyperliquid/client"
import { readHyperliquidFill } from "@/server/protocols/hyperliquid/fill"

/**
 * A wallet's fills, pushed by the exchange instead of asked for.
 *
 * **Why this exists.** Asking costs 20 of the 1,200 request-weight Hyperliquid
 * allows a minute, and the engine's pass is a second, so asking every pass is
 * 1,200 a minute for ONE wallet — the whole budget, on the one question that
 * decides nothing. It was throttled to once every five seconds on 22 Aug 2026
 * to stop exactly that, and throttling a poll is still a poll. Tyler's rule in
 * `trading-rules.md`: "We do not poll unless it's absolutely necessary."
 *
 * **A fills feed is not a snapshot feed, and that is the whole difficulty.**
 * `open-orders-feed.ts` beside this one is easy: every push carries the whole
 * list, so the newest push is the answer and an old one is simply discarded.
 * Fills only ever arrive as new events, so this has to ACCUMULATE — and an
 * accumulated list is only worth anything if you know it has no holes in it.
 *
 * So the feed keeps a window it can vouch for rather than just a pile of
 * fills, and answers `null` for anything outside it. Three things can put a
 * hole in the window, and each has an answer:
 *
 * - **Before the feed was listening.** A caller asking for fills since last
 *   Tuesday is asking about a time nothing was watching. It gets null and asks
 *   the exchange, which is the same path as before this feed existed.
 * - **A dropped connection.** The transport reconnects and resubscribes on its
 *   own, and the exchange answers a new subscription with a fresh snapshot. A
 *   snapshot that is not the first one is therefore how a reconnect announces
 *   itself, and it means fills may have happened while the line was down. The
 *   window is reopened from that moment and the caller asks once to cover the
 *   gap. This is the "ask again to recover a disconnect" the rule allows.
 * - **A subscription that dies for good.** The SDK calls `onError` once when a
 *   confirmed subscription can never come back. The feed is dropped, the next
 *   ask goes to the exchange, and opening starts again from scratch.
 *
 * **Silence is not suspicious here**, which is what makes a fills feed safe
 * without a timeout. A wallet that has not traded for an hour genuinely has no
 * fills to be told about, and the two ways this feed can really be broken both
 * announce themselves above. That is why there is no "quiet for too long" rule
 * like the resting-orders feed has: there, silence and death look identical;
 * here, death has its own callback.
 */

/** How long a wallet is kept listening after nothing has asked about it. */
const IDLE_MS = 10 * 60_000

/**
 * How many fills one wallet's feed holds before the oldest are let go.
 *
 * **Because the engine never stops asking, this map never idles out.** A grid
 * that recycles for months would otherwise pile up every fill it ever made, in
 * memory, for the life of the process. Dropping the oldest is safe only
 * because `coveredFrom` moves up with them: the feed then says out loud that it
 * can no longer vouch for that far back, and a caller asking about it is sent
 * to the exchange. Losing the promise silently is what would be dangerous, not
 * losing the rows.
 */
const KEEP_FILLS = 5_000

type Feed = {
  /** Every fill seen, by the exchange's own id, so a repeat changes nothing. */
  fills: Map<string, WalletOrderFill>
  /**
   * The oldest moment this feed can answer for. A question about anything
   * earlier is a question about a time nobody was listening.
   */
  coveredFrom: number
  /** Whether the first snapshot has landed. Until it has, this knows nothing. */
  started: boolean
  /** When anything last asked, so an unwatched wallet can be let go. */
  askedAt: number
  /** Set when a reconnect is spotted; cleared once the caller has covered it. */
  gapFrom: number | null
  /**
   * Bumped every time a reconnect opens a hole.
   *
   * A caller that asks the exchange carries this number away with it and hands
   * it back. If it has moved on by the time the answer lands, a SECOND hole
   * opened while the read was in flight, and that read cannot have covered it.
   * Without this, the second hole was quietly marked covered by a read that
   * finished before it happened, and the fills inside it were lost for good.
   */
  gaps: number
  close: () => void
}

const feeds = new Map<string, Feed>()

function keyFor(network: NetworkId, address: string): string {
  return `${network}:${address.toLowerCase()}`
}

/**
 * This wallet's fills since `since`, or null when the feed cannot say and the
 * exchange has to be asked.
 *
 * **Null is not "no fills".** It means this feed cannot vouch for that stretch
 * of time, and treating it as an empty list would lose a trade out of the
 * Journal and leave an order's watermark behind where it should be.
 */
export function fillsFromFeed(
  network: NetworkId,
  address: string,
  since: number
): WalletOrderFill[] | null {
  const feed = feeds.get(keyFor(network, address))
  if (!feed) {
    void open(network, address)
    return null
  }
  feed.askedAt = Date.now()
  if (!feed.started) return null
  // A reconnect left a hole. One ask covers it, and `coveredFrom` moves back
  // to the hole's start so this answers null until that ask has happened.
  if (feed.gapFrom !== null) return null
  if (since < feed.coveredFrom) return null
  return [...feed.fills.values()].filter((fill) => fill.at >= since)
}

/** How many holes this feed has had, for a caller about to ask the exchange. */
export function fillsFeedGaps(network: NetworkId, address: string): number {
  return feeds.get(keyFor(network, address))?.gaps ?? 0
}

/**
 * Told that the exchange has been asked directly for everything since `since`,
 * so the feed may treat that stretch as covered again.
 *
 * Called by whoever did the asking, because only they know it succeeded. A
 * read that failed must leave the hole where it is.
 *
 * `gapsWhenAsked` is the count taken before the read went out. A read cannot
 * cover a hole that opened after it started, so a count that has moved on
 * leaves the hole open for the next pass to cover. The fills are still kept —
 * they are real either way — it is only the promise that is withheld.
 */
export function fillsFeedCovered(
  network: NetworkId,
  address: string,
  since: number,
  fills: readonly WalletOrderFill[],
  gapsWhenAsked: number
): void {
  const feed = feeds.get(keyFor(network, address))
  if (!feed) return
  for (const fill of fills) feed.fills.set(fill.fillId, fill)
  if (feed.gaps !== gapsWhenAsked) return
  feed.coveredFrom = Math.min(feed.coveredFrom, since)
  feed.gapFrom = null
  forget(feed)
}

/**
 * Lets the oldest fills go, and moves the promise up with them.
 *
 * The two lines have to happen together. Dropping rows while still claiming to
 * cover the time they were in is how a feed answers with a hole in it.
 */
function forget(feed: Feed): void {
  if (feed.fills.size <= KEEP_FILLS) return
  const byTime = [...feed.fills.values()].sort((left, right) => left.at - right.at)
  const drop = byTime.slice(0, feed.fills.size - KEEP_FILLS)
  for (const fill of drop) feed.fills.delete(fill.fillId)
  const oldest = byTime[drop.length]
  if (oldest) feed.coveredFrom = Math.max(feed.coveredFrom, oldest.at)
}

/** Opens the feed for one wallet, once. */
async function open(network: NetworkId, address: string): Promise<void> {
  const key = keyFor(network, address)
  if (feeds.has(key)) return

  const now = Date.now()
  // Registered BEFORE the await, or two callers a millisecond apart both open
  // a subscription for the same wallet.
  const feed: Feed = {
    fills: new Map(),
    // Nothing is claimed for the past. The first snapshot may well carry older
    // fills and they are kept, but this feed only VOUCHES from the moment it
    // started listening.
    coveredFrom: now,
    started: false,
    askedAt: now,
    gapFrom: null,
    gaps: 0,
    close: () => {},
  }
  feeds.set(key, feed)

  try {
    const subscription = await subscriptionClient(network).userFills(
      { user: address.toLowerCase() as `0x${string}` },
      (event) => {
        if (!Array.isArray(event.fills)) return
        // A snapshot that is not the first one means the transport reconnected
        // and resubscribed, and fills may have landed while it was away.
        if (event.isSnapshot && feed.started) {
          feed.gapFrom = Date.now()
          feed.gaps += 1
        }
        for (const row of event.fills) {
          const fill = readHyperliquidFill(row)
          if (fill) feed.fills.set(fill.fillId, fill)
        }
        feed.started = true
        forget(feed)
      },
      {
        onError: () => {
          // Confirmed and now permanently gone. Dropped rather than left
          // looking healthy, so the next ask reaches the exchange and opens a
          // new subscription.
          feeds.delete(key)
        },
      }
    )
    feed.close = () => void subscription.unsubscribe().catch(() => {})
  } catch {
    // A socket that will not open is not worth stopping anything for — the
    // caller asks the exchange instead. Dropped so the next ask retries.
    feeds.delete(key)
  }
}

/**
 * Closes feeds nothing has asked about lately.
 *
 * Called from the pass that reads fills rather than on a timer of its own,
 * which would keep this module alive in a process that has finished with it.
 */
export function dropIdleUserFillFeeds(now: number = Date.now()): void {
  for (const [key, feed] of feeds) {
    if (now - feed.askedAt < IDLE_MS) continue
    feed.close()
    feeds.delete(key)
  }
}

/** Tests drive their own feeds; one left open would answer the next test. */
export function clearUserFillFeeds(): void {
  for (const feed of feeds.values()) feed.close()
  feeds.clear()
}
