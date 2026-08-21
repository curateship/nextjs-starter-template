import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { clearHeldHistory, heldHistory } from "@/server/protocols/full-history"
import { clearRationing } from "@/server/protocols/rationing"
import { fetchKucoinCandles } from "@/server/protocols/kucoin/candles"
import { fetchPhemexCandles } from "@/server/protocols/phemex/candles"

/**
 * The four-hour chart loads every bar the exchange has, and the two exchanges
 * that page for it walk BACKWARDS until a page comes back empty. Two things
 * can go wrong there and neither shows on screen: the walk stops too early
 * and quietly draws a short history, or it never stops and hammers the
 * exchange with page after page of nothing.
 */

const H4 = 4 * 3_600_000

beforeEach(() => {
  clearHeldHistory()
  clearRationing()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

/** An exchange holding `count` four-hour bars and nothing before them. */
function stubExchange(count: number, shape: "phemex" | "kucoin") {
  const listedAt = Date.now() - count * H4
  let calls = 0
  let inFlight = 0
  let atOnce = 0
  const fetcher = vi.fn(async (url: string | URL) => {
    calls += 1
    inFlight += 1
    atOnce = Math.max(atOnce, inFlight)
    // A tick of waiting, so pages asked for together really do overlap.
    await new Promise((resolve) => setTimeout(resolve, 1))
    inFlight -= 1
    const query = new URL(String(url)).searchParams
    // Phemex counts in seconds and KuCoin in milliseconds.
    const scale = shape === "phemex" ? 1_000 : 1
    const from = Number(query.get("from")) * scale
    const to = Number(query.get("to")) * scale
    const rows: unknown[] = []
    for (let at = Math.max(from, listedAt); at < to; at += H4) {
      const time = Math.floor(at / H4) * H4
      rows.push(
        shape === "phemex"
          ? [time / 1_000, 0, 100, 110, 90, 105, 1, 1]
          : [time, 100, 105, 110, 90, 1, 1]
      )
    }
    return new Response(
      JSON.stringify(
        shape === "phemex"
          ? { code: 0, data: { rows } }
          : { code: "200000", data: rows }
      ),
      { status: 200, headers: { "content-type": "application/json" } }
    )
  })
  vi.stubGlobal("fetch", fetcher)
  return { calls: () => calls, atOnce: () => atOnce }
}

describe("walking back to a coin's listing day", () => {
  it("Phemex: never asks for a window that ends in the future", async () => {
    // Phemex answers a 400 and nothing else when `to` is past now, which took
    // the whole four-hour chart out on 19 Aug 2026 — the page drew nothing and
    // the only sign was one refusal in the network log.
    const asked: number[] = []
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL) => {
        asked.push(Number(new URL(String(url)).searchParams.get("to")) * 1_000)
        return new Response(JSON.stringify({ code: 0, data: { rows: [] } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      })
    )
    await fetchPhemexCandles("mainnet", "BTCUSDT", "4h")
    expect(asked.length).toBeGreaterThan(0)
    for (const to of asked) expect(to).toBeLessThanOrEqual(Date.now())
  })

  it("Phemex: takes every bar there is and then stops asking", async () => {
    // Two and a half pages' worth, so the walk has to page and then stop.
    const seen = stubExchange(2_400, "phemex")
    const bars = await fetchPhemexCandles("mainnet", "BTCUSDT", "4h")
    expect(bars.length).toBeGreaterThan(2_300)
    expect(bars.length).toBeLessThanOrEqual(2_401)
    // Six pages go out together, then six more that are empty and end the
    // walk. Anything much higher means it kept asking for nothing.
    expect(seen.calls()).toBeLessThanOrEqual(12)
    // The point of the batch: they overlap rather than queueing one behind
    // the other, which is what took the four-hour chart from six and a half
    // seconds to one and a half.
    expect(seen.atOnce()).toBeGreaterThan(1)
    // Oldest first, and no bar repeated across a page boundary.
    expect(bars[0].openTime).toBeLessThan(bars[bars.length - 1].openTime)
    expect(new Set(bars.map((bar) => bar.openTime)).size).toBe(bars.length)
  })

  it("KuCoin: same, in its own two-hundred-bar pages", async () => {
    const seen = stubExchange(500, "kucoin")
    const bars = await fetchKucoinCandles("mainnet", "XBTUSDTM", "4h")
    expect(bars.length).toBeGreaterThan(450)
    expect(seen.calls()).toBeLessThanOrEqual(12)
    expect(seen.atOnce()).toBeGreaterThan(1)
    expect(new Set(bars.map((bar) => bar.openTime)).size).toBe(bars.length)
  })

  it("a coin listed yesterday ends the walk at once", async () => {
    const seen = stubExchange(6, "kucoin")
    const bars = await fetchKucoinCandles("mainnet", "NEWUSDTM", "4h")
    expect(bars.length).toBeLessThanOrEqual(7)
    // One batch holds it, and the next is empty and stops the walk. A young
    // coin costs twelve cheap public reads rather than two — the price of
    // asking six at a time, and worth it on every coin that is not young.
    expect(seen.calls()).toBe(12)
  })
})

describe("holding a full history", () => {
  it("asks once and answers the next look from what it holds", async () => {
    let loads = 0
    const load = async () => {
      loads += 1
      return []
    }
    await heldHistory("a", load)
    await heldHistory("a", load)
    expect(loads).toBe(1)
    // A different market is its own history.
    await heldHistory("b", load)
    expect(loads).toBe(2)
  })

  it("never holds on to a failure", async () => {
    let loads = 0
    const failing = async (): Promise<never> => {
      loads += 1
      throw new Error("EXCHANGE_BUSY")
    }
    await expect(heldHistory("c", failing)).rejects.toThrow()
    await expect(heldHistory("c", failing)).rejects.toThrow()
    expect(loads).toBe(2)
  })
})
