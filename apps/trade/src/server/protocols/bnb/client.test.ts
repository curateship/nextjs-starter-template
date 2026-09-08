import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

beforeEach(() => {
  vi.resetModules()
  vi.useFakeTimers()
  vi.setSystemTime(100_000)
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe("BNB client", () => {
  it("uses the public node unless configured", async () => {
    const { bnbRpcUrl, BNB_CHAIN_ID } = await import("./client")
    vi.stubEnv("TRADE_BNB_RPC", "")
    expect(bnbRpcUrl()).toBe("https://bsc-dataseed.binance.org")
    expect(BNB_CHAIN_ID).toBe(56)
    vi.stubEnv("TRADE_BNB_RPC", " https://node.example/rpc ")
    expect(bnbRpcUrl()).toBe("https://node.example/rpc")
  })
  it("reserves ten Kyber requests and expires requests at the window boundary", async () => {
    const { reserveBnbRequest } = await import("./client")
    for (let n = 0; n < 20; n++) reserveBnbRequest("kyber")
    expect(() => reserveBnbRequest("kyber")).toThrow(
      "EXCHANGE_BUSY:KyberSwap spent 20 of 20"
    )
    for (let n = 0; n < 10; n++) reserveBnbRequest("kyber", "order")
    expect(() => reserveBnbRequest("kyber", "order")).toThrow("spent 30 of 30")
    vi.advanceTimersByTime(10_000)
    expect(() => reserveBnbRequest("kyber")).not.toThrow()
  })
  it("gives the two market services independent minute allowances", async () => {
    const { reserveBnbRequest } = await import("./client")
    for (let n = 0; n < 30; n++) reserveBnbRequest("gecko")
    expect(() => reserveBnbRequest("gecko")).toThrow("spent 30 of 30")
    for (let n = 0; n < 300; n++) reserveBnbRequest("dex")
    expect(() => reserveBnbRequest("dex")).toThrow("spent 300 of 300")
    vi.advanceTimersByTime(60_000)
    expect(() => reserveBnbRequest("gecko")).not.toThrow()
    expect(() => reserveBnbRequest("dex")).not.toThrow()
  })
  it("retries a 429 once, caps the wait and counts the retry", async () => {
    const { bnbServiceGet, reserveBnbRequest } = await import("./client")
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, { status: 429, headers: { "retry-after": "999" } })
      )
      .mockResolvedValueOnce(Response.json({ ok: true }))
    vi.stubGlobal("fetch", fetch)
    const result = bnbServiceGet("kyber", "/bsc/api/v1/routes")
    await vi.advanceTimersByTimeAsync(4999)
    expect(fetch).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    await expect(result).resolves.toEqual({ ok: true })
    expect(fetch).toHaveBeenCalledTimes(2)
    for (let n = 0; n < 18; n++) reserveBnbRequest("kyber")
    expect(() => reserveBnbRequest("kyber")).toThrow("spent 20 of 20")
  })
  it("stops after the second 429 and refuses paths to another host", async () => {
    const { bnbServiceGet } = await import("./client")
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 429 }))
    vi.stubGlobal("fetch", fetch)
    const result = expect(
      bnbServiceGet("dex", "/tokens/v1/bsc/test")
    ).rejects.toThrow("EXCHANGE_BUSY:")
    await vi.advanceTimersByTimeAsync(1000)
    await result
    expect(fetch).toHaveBeenCalledTimes(2)
    await expect(
      bnbServiceGet("dex", "https://untrusted.example")
    ).rejects.toThrow("BNB_SERVICE_PATH")
    expect(fetch).toHaveBeenCalledTimes(2)
  })
  it("refuses a full allowance before fetching and sanitizes failures", async () => {
    const { bnbServiceGet, reserveBnbRequest } = await import("./client")
    const fetch = vi
      .fn()
      .mockRejectedValue(new Error("sensitive-provider-detail"))
    vi.stubGlobal("fetch", fetch)
    await expect(bnbServiceGet("dex", "/test")).rejects.toThrow(
      "EXCHANGE_BUSY:DexScreener did not answer"
    )
    for (let n = 0; n < 20; n++) reserveBnbRequest("kyber")
    await expect(bnbServiceGet("kyber", "/test")).rejects.toThrow(
      "spent 20 of 20"
    )
    expect(fetch).toHaveBeenCalledTimes(1)
  })
  it("reports non-JSON and HTTP failures without a retry", async () => {
    const { bnbServiceGet } = await import("./client")
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response("bad"))
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
    vi.stubGlobal("fetch", fetch)
    await expect(bnbServiceGet("dex", "/test")).rejects.toThrow("invalid-json")
    await expect(bnbServiceGet("dex", "/test")).rejects.toThrow("503")
    expect(fetch).toHaveBeenCalledTimes(2)
  })
})

it("pauses GeckoTerminal after its first 429 and resumes after Retry-After", async () => {
  const { bnbServiceGet, bnbRequestCounts } = await import("./client")
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(null, {
        status: 429,
        headers: { "retry-after": "120" },
      })
    )
    .mockResolvedValue(Response.json({ ok: true }))
  vi.stubGlobal("fetch", fetch)
  await expect(bnbServiceGet("gecko", "/api/v2/networks")).rejects.toThrow(
    "requests are paused"
  )
  await vi.advanceTimersByTimeAsync(119_999)
  await expect(bnbServiceGet("gecko", "/api/v2/networks")).rejects.toThrow(
    "requests are paused"
  )
  expect(fetch).toHaveBeenCalledTimes(1)
  await vi.advanceTimersByTimeAsync(1)
  await expect(bnbServiceGet("gecko", "/api/v2/networks")).resolves.toEqual({
    ok: true,
  })
  expect(fetch).toHaveBeenCalledTimes(2)
  expect(bnbRequestCounts().gecko).toBe(1)
})

it.each([
  [null, 60_000],
  ["invalid", 60_000],
  [new Date(190_000).toUTCString(), 90_000],
] as const)(
  "uses a Gecko cooldown for Retry-After %s",
  async (header, delay) => {
    const { bnbServiceGet } = await import("./client")
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, {
          status: 429,
          headers: header ? { "retry-after": header } : {},
        })
      )
      .mockResolvedValue(Response.json({ ok: true }))
    vi.stubGlobal("fetch", fetch)
    await expect(bnbServiceGet("gecko", "/api/v2/networks")).rejects.toThrow(
      "requests are paused"
    )
    vi.advanceTimersByTime(delay - 1)
    await expect(bnbServiceGet("gecko", "/api/v2/networks")).rejects.toThrow(
      "requests are paused"
    )
    expect(fetch).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(1)
    await expect(bnbServiceGet("gecko", "/api/v2/networks")).resolves.toEqual({
      ok: true,
    })
  }
)
