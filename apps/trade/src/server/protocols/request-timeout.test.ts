import { afterEach, describe, expect, it, vi } from "vitest"

import { giveUpAfter, isTimeout } from "@/server/protocols/request-timeout"
import { fetchKucoinMarkets } from "@/server/protocols/kucoin/markets"
import { fetchPhemexMarkets } from "@/server/protocols/phemex/markets"

/**
 * What happens when an exchange takes the request and never answers.
 *
 * `fetch` has no timeout of its own, so a stalled connection never settles.
 * A route loader waiting on one of those does not fail — the page hangs on a
 * spinner, and because the router is still waiting for that route every link
 * on the page stops working too. That is exactly what was reported on
 * 19 Aug 2026, and it is why every exchange request now carries a deadline.
 *
 * The check is the one that matters: a stalled read must REJECT, so the panel
 * shows its error state and the page stays alive.
 */

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("a library call that takes no abort signal", () => {
  it("lets the caller go once the limit passes", async () => {
    await expect(
      giveUpAfter(new Promise(() => {}), 5, "no answer")
    ).rejects.toThrow("no answer")
  })

  it("answers with the call when it finishes in time", async () => {
    await expect(giveUpAfter(Promise.resolve(7), 1_000, "no answer")).resolves.toBe(7)
  })
})

/** A connection that hangs until its deadline, exactly like a stalled one. */
function stubStalledFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      (_url: string | URL, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          const signal = init?.signal
          if (!signal) return // Never settles — the bug this test guards.
          signal.addEventListener("abort", () =>
            reject((signal as AbortSignal).reason)
          )
        })
    )
  )
}

describe("a request that is given no answer", () => {
  it("gives up rather than hanging the page — KuCoin", async () => {
    stubStalledFetch()
    await expect(fetchKucoinMarkets("mainnet")).rejects.toThrow()
  }, 30_000)

  it("gives up rather than hanging the page — Phemex", async () => {
    stubStalledFetch()
    await expect(fetchPhemexMarkets("mainnet")).rejects.toThrow()
  }, 30_000)
})

describe("telling a deadline from a real answer", () => {
  it("knows a timeout, and does not mistake an ordinary error for one", () => {
    expect(isTimeout(new DOMException("timed out", "TimeoutError"))).toBe(true)
    expect(isTimeout(new DOMException("aborted", "AbortError"))).toBe(true)
    expect(isTimeout(new Error("KUCOIN_400100:bad parameter"))).toBe(false)
    expect(isTimeout(null)).toBe(false)
  })
})
