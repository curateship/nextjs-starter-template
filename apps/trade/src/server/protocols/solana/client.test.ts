import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  clearSolanaClientState,
  JUPITER_REQUESTS_PER_MINUTE,
  jupiterApiKey,
  jupiterGet,
  jupiterRequestsThisMinute,
  reserveJupiterRequest,
  solanaRpcUrl,
} from "@/server/protocols/solana/client"

const ENV = ["TRADE_SOLANA_RPC", "TRADE_SOLANA_DEVNET_RPC", "TRADE_JUPITER_API_KEY"]

function jsonResponse(
  status: number,
  body: unknown,
  headers: Record<string, string> = {}
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  })
}

const fetchMock = vi.fn<typeof fetch>()
const saved = new Map<string, string | undefined>()

beforeEach(() => {
  for (const name of ENV) {
    saved.set(name, process.env[name])
    delete process.env[name]
  }
  vi.useFakeTimers()
  vi.stubGlobal("fetch", fetchMock)
  fetchMock.mockReset()
  clearSolanaClientState()
})

afterEach(() => {
  for (const name of ENV) {
    const value = saved.get(name)
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
  }
  vi.unstubAllGlobals()
  vi.useRealTimers()
  clearSolanaClientState()
})

describe("the .env settings", () => {
  it("falls back to Solana's public nodes", () => {
    expect(solanaRpcUrl("mainnet")).toBe("https://api.mainnet-beta.solana.com")
    expect(solanaRpcUrl("testnet")).toBe("https://api.devnet.solana.com")
    expect(jupiterApiKey()).toBeNull()
  })

  it("takes a paid node and the key from .env, ignoring blanks", () => {
    process.env.TRADE_SOLANA_RPC = " https://example.helius-rpc.com/?api-key=x "
    process.env.TRADE_SOLANA_DEVNET_RPC = "   "
    process.env.TRADE_JUPITER_API_KEY = "jup-key"
    expect(solanaRpcUrl("mainnet")).toBe(
      "https://example.helius-rpc.com/?api-key=x"
    )
    // A blank setting is no setting.
    expect(solanaRpcUrl("testnet")).toBe("https://api.devnet.solana.com")
    expect(jupiterApiKey()).toBe("jup-key")
  })
})

describe("asking Jupiter", () => {
  it("works with no key at all, on Jupiter's keyless host", async () => {
    // The key authorises nothing; it buys allowance. Measured 4 Sep 2026:
    // the whole token list, a real quote and a built swap all came back
    // keyless. So no key means the free host rather than no Solana.
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { ok: true }))
    const answer = jupiterGet("/tokens/v2/tag", { query: "verified" })
    await vi.runAllTimersAsync()
    expect(await answer).toEqual({ ok: true })
    const [url, init] = fetchMock.mock.calls[0]!
    expect(String(url)).toBe(
      "https://lite-api.jup.ag/tokens/v2/tag?query=verified"
    )
    // A wrong key is refused outright, so no header goes without a real one.
    expect(init?.headers).not.toHaveProperty("x-api-key")
  })

  it("carries the key as x-api-key against api.jup.ag", async () => {
    process.env.TRADE_JUPITER_API_KEY = "jup-key"
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { ok: true }))
    const answer = jupiterGet("/tokens/v2/tag", { query: "verified" })
    await vi.runAllTimersAsync()
    expect(await answer).toEqual({ ok: true })
    const [url, init] = fetchMock.mock.calls[0]!
    expect(String(url)).toBe("https://api.jup.ag/tokens/v2/tag?query=verified")
    expect((init?.headers as Record<string, string>)["x-api-key"]).toBe(
      "jup-key"
    )
  })

  it("waits out one 429 and asks again, then gives up as busy", async () => {
    process.env.TRADE_JUPITER_API_KEY = "jup-key"
    fetchMock
      .mockResolvedValueOnce(jsonResponse(429, {}, { "retry-after": "2" }))
      .mockResolvedValueOnce(jsonResponse(200, { second: true }))
    const retried = jupiterGet("/price/v3")
    await vi.advanceTimersByTimeAsync(1_999)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(await retried).toEqual({ second: true })

    fetchMock
      .mockResolvedValueOnce(jsonResponse(429, {}))
      .mockResolvedValueOnce(jsonResponse(429, {}))
    const busy = jupiterGet("/price/v3")
    // Rejections must be listened for before the timers run them out.
    const outcome = busy.then(
      () => "answered",
      (error: Error) => error.message
    )
    await vi.runAllTimersAsync()
    expect(await outcome).toBe("EXCHANGE_BUSY")
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })

  it("keeps a second between requests, which is the free tier's rule", async () => {
    process.env.TRADE_JUPITER_API_KEY = "jup-key"
    // A fresh Response per call: a body can only be read once.
    fetchMock.mockImplementation(async () => jsonResponse(200, {}))
    const first = jupiterGet("/a")
    const second = jupiterGet("/b")
    await vi.advanceTimersByTimeAsync(0)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(999)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    await Promise.all([first, second])
  })

  it("keeps twenty of the minute's sixty back for swaps", () => {
    // Forty reads fit; the forty-first is refused at once, without waiting
    // a turn, while an order may still use the rest of the minute.
    for (let i = 0; i < JUPITER_REQUESTS_PER_MINUTE - 20; i += 1) {
      reserveJupiterRequest("read")
    }
    expect(() => reserveJupiterRequest("read")).toThrow(
      /^EXCHANGE_BUSY:Jupiter — spent 40 of 40 this minute/
    )
    for (let i = 0; i < 20; i += 1) reserveJupiterRequest("order")
    expect(() => reserveJupiterRequest("order")).toThrow(/^EXCHANGE_BUSY:/)
    expect(jupiterRequestsThisMinute()).toBe(JUPITER_REQUESTS_PER_MINUTE)
    // A minute later the window has moved on.
    vi.advanceTimersByTime(60_001)
    expect(jupiterRequestsThisMinute()).toBe(0)
    expect(() => reserveJupiterRequest("read")).not.toThrow()
  })

  it("refuses a read the minute has no room for before sending anything", async () => {
    process.env.TRADE_JUPITER_API_KEY = "jup-key"
    for (let i = 0; i < 40; i += 1) reserveJupiterRequest("read")
    await expect(jupiterGet("/price/v3")).rejects.toThrow(/^EXCHANGE_BUSY:/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("names the status when Jupiter refuses for another reason", async () => {
    process.env.TRADE_JUPITER_API_KEY = "jup-key"
    fetchMock.mockResolvedValueOnce(jsonResponse(401, {}))
    const outcome = jupiterGet("/price/v3").then(
      () => "answered",
      (error: Error) => error.message
    )
    await vi.runAllTimersAsync()
    expect(await outcome).toBe("SOLANA_JUPITER_REFUSED:401")
  })
})
