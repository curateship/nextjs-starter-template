import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

type Listener = (event: { fills: unknown[]; isSnapshot?: true }) => void

const opened = vi.hoisted(() => ({
  count: 0,
  push: null as Listener | null,
  fail: null as (() => void) | null,
  refuse: false,
}))

vi.mock("@/server/protocols/hyperliquid/client", () => ({
  subscriptionClient: () => ({
    userFills: async (
      _params: unknown,
      listener: Listener,
      options?: { onError?: () => void }
    ) => {
      if (opened.refuse) throw new Error("no socket today")
      opened.count += 1
      opened.push = listener
      opened.fail = () => options?.onError?.()
      return { unsubscribe: async () => {} }
    },
  }),
}))

const {
  clearUserFillFeeds,
  fillsFeedCovered,
  fillsFeedGaps,
  fillsFromFeed,
  hyperliquidFillsNeedRecovery,
  watchHyperliquidFills,
} = await import("@/server/protocols/hyperliquid/user-fills-feed")

/**
 * The window a pushed fills feed can vouch for.
 *
 * A fills feed accumulates rather than replacing, so the only thing that makes
 * it worth anything is knowing it has no holes. Every case below is a hole, or
 * the absence of one.
 */

const ADDRESS = "0xDe60897C62A3343f72a4EE8296B14b078aF81a74"

function row(tid: string, at: number, px = 100) {
  return {
    coin: "CHIP",
    px: String(px),
    sz: "10",
    side: "B",
    time: at,
    oid: 1,
    tid,
    closedPnl: "0",
    fee: "0.01",
    dir: "Open Long",
  }
}

/** Opens the feed and lets the subscribe promise settle. */
async function settle() {
  fillsFromFeed("mainnet", ADDRESS, Date.now())
  for (let tick = 0; tick < 4; tick += 1) {
    await new Promise((done) => setTimeout(done, 0))
  }
}

beforeEach(() => {
  opened.count = 0
  opened.push = null
  opened.fail = null
  opened.refuse = false
})

afterEach(() => {
  clearUserFillFeeds()
})

describe("the pushed fills feed", () => {
  it("says nothing until the exchange has sent its first snapshot", async () => {
    await settle()
    // The subscription is open but silent. Null is "nobody has told us yet",
    // and reading it as an empty list would lose a trade out of the Journal.
    expect(fillsFromFeed("mainnet", ADDRESS, 0)).toBeNull()
    expect(opened.count).toBe(1)
  })

  it("answers from the line once the snapshot has landed", async () => {
    const start = Date.now()
    await settle()
    opened.push?.({ fills: [row("a", start + 10)], isSnapshot: true })
    const fills = fillsFromFeed("mainnet", ADDRESS, start)
    expect(fills?.map((one) => one.fillId)).toEqual(["a"])
  })

  it("adds each new fill rather than replacing the list", async () => {
    // The difference from the resting-orders feed beside it: that one is sent
    // the whole list every time, this one is only ever sent what is new.
    const start = Date.now()
    await settle()
    opened.push?.({ fills: [row("a", start + 10)], isSnapshot: true })
    opened.push?.({ fills: [row("b", start + 20)] })
    expect(
      fillsFromFeed("mainnet", ADDRESS, start)?.map((o) => o.fillId)
    ).toEqual(["a", "b"])
  })

  it("counts the same fill once however many times it is sent", async () => {
    const start = Date.now()
    await settle()
    opened.push?.({ fills: [row("a", start + 10)], isSnapshot: true })
    opened.push?.({ fills: [row("a", start + 10)] })
    expect(fillsFromFeed("mainnet", ADDRESS, start)).toHaveLength(1)
  })

  it("pushes a new fill to its listener once and keeps recovery as a safety net", async () => {
    const start = Date.now()
    const listener = vi.fn()
    watchHyperliquidFills("mainnet", ADDRESS, "wallet", () => null, listener)
    await settle()
    opened.push?.({ fills: [row("a", start + 10)], isSnapshot: true })
    opened.push?.({ fills: [row("a", start + 10)] })

    expect(listener).toHaveBeenCalledOnce()
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ fillId: "a", marketId: "CHIP" })
    )
    expect(hyperliquidFillsNeedRecovery("mainnet", ADDRESS)).toBe(true)

    fillsFeedCovered(
      "mainnet",
      ADDRESS,
      start,
      [],
      fillsFeedGaps("mainnet", ADDRESS)
    )
    expect(hyperliquidFillsNeedRecovery("mainnet", ADDRESS)).toBe(false)
  })

  it("refuses a stretch of time it was not listening for", async () => {
    const start = Date.now()
    await settle()
    opened.push?.({ fills: [row("a", start + 10)], isSnapshot: true })
    // Asking about yesterday. Nothing was watching, so the caller must ask the
    // exchange rather than be handed a list with a hole in it.
    expect(fillsFromFeed("mainnet", ADDRESS, start - 60_000)).toBeNull()
  })

  it("refuses everything after a reconnect until the gap is covered", async () => {
    const start = Date.now()
    await settle()
    opened.push?.({ fills: [row("a", start + 10)], isSnapshot: true })
    expect(fillsFromFeed("mainnet", ADDRESS, start)).toHaveLength(1)

    // A second snapshot is how a reconnect announces itself: the transport
    // resubscribed, and fills may have landed while the line was down.
    opened.push?.({ fills: [row("a", start + 10)], isSnapshot: true })
    expect(fillsFromFeed("mainnet", ADDRESS, start)).toBeNull()
  })

  it("answers again once the caller has covered the gap", async () => {
    const start = Date.now()
    await settle()
    opened.push?.({ fills: [row("a", start + 10)], isSnapshot: true })
    opened.push?.({ fills: [], isSnapshot: true })
    expect(fillsFromFeed("mainnet", ADDRESS, start)).toBeNull()

    // Whoever asked the exchange hands the answer back, including the fill
    // that landed while the line was down.
    fillsFeedCovered(
      "mainnet",
      ADDRESS,
      start,
      [
        {
          fillId: "b",
          orderId: "2",
          marketId: "CHIP",
          side: "buy",
          px: 1,
          sz: 1,
          at: start + 15,
          closedPnl: 0,
          fee: 0,
          dir: "",
          liquidation: false,
        },
      ],
      fillsFeedGaps("mainnet", ADDRESS)
    )
    expect(
      fillsFromFeed("mainnet", ADDRESS, start)
        ?.map((o) => o.fillId)
        .sort()
    ).toEqual(["a", "b"])
  })

  it("does not widen its window on a read that failed", async () => {
    const start = Date.now()
    await settle()
    opened.push?.({ fills: [row("a", start + 10)], isSnapshot: true })
    // Nobody calls `fillsFeedCovered` when the read threw, so the older
    // stretch stays refused rather than being quietly claimed.
    expect(fillsFromFeed("mainnet", ADDRESS, start - 60_000)).toBeNull()
  })

  it("drops a subscription that has died for good", async () => {
    const start = Date.now()
    await settle()
    opened.push?.({ fills: [row("a", start + 10)], isSnapshot: true })
    expect(fillsFromFeed("mainnet", ADDRESS, start)).toHaveLength(1)

    opened.fail?.()
    // Gone rather than left looking healthy, and asking again opens a new one.
    expect(fillsFromFeed("mainnet", ADDRESS, start)).toBeNull()
    await new Promise((done) => setTimeout(done, 0))
    await new Promise((done) => setTimeout(done, 0))
    expect(opened.count).toBe(2)
  })

  it("opens one subscription however many callers ask at once", async () => {
    fillsFromFeed("mainnet", ADDRESS, Date.now())
    fillsFromFeed("mainnet", ADDRESS, Date.now())
    fillsFromFeed("mainnet", ADDRESS, Date.now())
    for (let tick = 0; tick < 4; tick += 1) {
      await new Promise((done) => setTimeout(done, 0))
    }
    expect(opened.count).toBe(1)
  })

  it("keeps the hole open when a second one opened mid-read", async () => {
    // The dangerous order: a hole opens, the caller starts asking, ANOTHER
    // hole opens before the answer lands. That answer cannot have covered the
    // second hole, and marking it covered loses those fills for good.
    const start = Date.now()
    await settle()
    opened.push?.({ fills: [row("a", start + 10)], isSnapshot: true })

    opened.push?.({ fills: [], isSnapshot: true })
    const gapsWhenAsked = fillsFeedGaps("mainnet", ADDRESS)
    // The read is in flight, and the line drops again.
    opened.push?.({ fills: [], isSnapshot: true })

    fillsFeedCovered("mainnet", ADDRESS, start, [], gapsWhenAsked)
    expect(fillsFromFeed("mainnet", ADDRESS, start)).toBeNull()

    // The next pass asks again, and that one really does cover it.
    fillsFeedCovered(
      "mainnet",
      ADDRESS,
      start,
      [],
      fillsFeedGaps("mainnet", ADDRESS)
    )
    expect(fillsFromFeed("mainnet", ADDRESS, start)).not.toBeNull()
  })

  it("keeps the fills from a read it would not accept as covering", async () => {
    // The rows are real whoever asked for them. Only the promise is withheld.
    const start = Date.now()
    await settle()
    opened.push?.({ fills: [row("a", start + 10)], isSnapshot: true })
    opened.push?.({ fills: [], isSnapshot: true })
    const stale = fillsFeedGaps("mainnet", ADDRESS)
    opened.push?.({ fills: [], isSnapshot: true })

    fillsFeedCovered(
      "mainnet",
      ADDRESS,
      start,
      [
        {
          fillId: "b",
          orderId: "2",
          marketId: "CHIP",
          side: "buy",
          px: 1,
          sz: 1,
          at: start + 15,
          closedPnl: 0,
          fee: 0,
          dir: "",
          liquidation: false,
        },
      ],
      stale
    )
    fillsFeedCovered(
      "mainnet",
      ADDRESS,
      start,
      [],
      fillsFeedGaps("mainnet", ADDRESS)
    )
    expect(
      fillsFromFeed("mainnet", ADDRESS, start)
        ?.map((o) => o.fillId)
        .sort()
    ).toEqual(["a", "b"])
  })

  it("lets old fills go rather than growing for ever, and says so", async () => {
    // The engine asks every second, so this feed never idles out. Without a
    // cap a grid recycling for months piles up every fill it ever made.
    const start = Date.now()
    await settle()
    const many = Array.from({ length: 5_400 }, (_, i) =>
      row(`f${i}`, start + i)
    )
    opened.push?.({ fills: many, isSnapshot: true })

    // 400 of the 5,400 were let go, oldest first.
    expect(fillsFromFeed("mainnet", ADDRESS, start + 400)).toHaveLength(5_000)
    // And the promise moved up with them. Asking about the stretch that was
    // dropped is refused outright rather than answered with a hole in it,
    // which is the only thing that makes dropping them safe.
    expect(fillsFromFeed("mainnet", ADDRESS, start)).toBeNull()
    expect(fillsFromFeed("mainnet", ADDRESS, start + 100)).toBeNull()
  })

  it("falls back to asking when the socket will not open", async () => {
    opened.refuse = true
    await settle()
    // Not an error worth stopping anything for: the caller asks the exchange,
    // which is the path this feed replaced.
    expect(fillsFromFeed("mainnet", ADDRESS, 0)).toBeNull()
  })
})
