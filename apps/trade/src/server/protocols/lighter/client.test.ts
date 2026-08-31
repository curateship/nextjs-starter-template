import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  clearLighterClientState,
  lighterPublic,
  lighterSendTx,
} from "@/server/protocols/lighter/client"

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  })
}

const fetchMock = vi.fn<typeof fetch>()

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal("fetch", fetchMock)
  fetchMock.mockReset()
  clearLighterClientState()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
  clearLighterClientState()
})

describe("the Lighter client", () => {
  it("answers a healthy read and spends one request", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { code: 200, order_book_details: [] })
    )
    const answer = (await lighterPublic(
      "mainnet",
      "/api/v1/orderBookDetails",
      300,
      { filter: "perp" }
    )) as { code: number }
    expect(answer.code).toBe(200)
    const url = String(fetchMock.mock.calls[0]?.[0])
    expect(url).toContain("https://mainnet.zklighter.elliot.ai")
    expect(url).toContain("filter=perp")
  })

  it("turns a 429 into the named hold and refuses for sixty seconds", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(429, {}))
    await expect(
      lighterPublic("mainnet", "/api/v1/candles", 300)
    ).rejects.toThrow(/^EXCHANGE_BUSY:/)

    // The next call never reaches Lighter while the hold stands.
    await expect(
      lighterPublic("mainnet", "/api/v1/candles", 300)
    ).rejects.toThrow("EXCHANGE_BUSY")
    expect(fetchMock).toHaveBeenCalledTimes(1)

    // Lighter's firewall cooldown is a static sixty seconds; after it the
    // client asks again.
    vi.advanceTimersByTime(60_001)
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { code: 200 }))
    await lighterPublic("mainnet", "/api/v1/candles", 300)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("treats Lighter's 405 firewall answer exactly like a 429", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(405, {}))
    await expect(
      lighterPublic("mainnet", "/api/v1/candles", 300)
    ).rejects.toThrow(/^EXCHANGE_BUSY:/)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("refuses any network but mainnet before a request is built", async () => {
    // Lighter's testnet is deliberately not carried. A call for one is a bug
    // in this app, so it stops here loudly instead of reaching a host
    // nothing should ever talk to.
    await expect(
      lighterPublic("testnet", "/api/v1/candles", 300)
    ).rejects.toThrow("LIGHTER_NETWORK_UNSUPPORTED")
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("remembers a country refusal for a minute and blocks itself", async () => {
    // Tyler's rule, 31 Aug 2026: "we just need to block the country". Lighter
    // is the authority on which country that is — one 20558 answer and the
    // next minute's sends refuse locally, before anything is sent.
    fetchMock.mockResolvedValueOnce(jsonResponse(403, { code: 20_558 }))
    await expect(
      lighterSendTx("mainnet", { txType: 14, txInfo: "{}" })
    ).rejects.toThrow("country")
    expect(fetchMock).toHaveBeenCalledTimes(1)

    await expect(
      lighterSendTx("mainnet", { txType: 14, txInfo: "{}" })
    ).rejects.toThrow("country")
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("lets the country hold lapse, because the answer can be flaky", async () => {
    // The deployed server was refused at 03:32:09 on 31 Aug 2026 and placed
    // an order 24 seconds later. Believing one answer for long would turn a
    // wobble into a real outage, and trading is never switched off on a guess.
    fetchMock.mockResolvedValueOnce(jsonResponse(403, { code: 20_558 }))
    await expect(
      lighterSendTx("mainnet", { txType: 14, txInfo: "{}" })
    ).rejects.toThrow("country")

    vi.advanceTimersByTime(61_000)
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { code: 200 }))
    await lighterSendTx("mainnet", { txType: 14, txInfo: "{}" })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("keeps Lighter's refusal code and drops its free-form text", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(400, { code: 21_952, message: "secret-adjacent words" })
    )
    await expect(
      lighterPublic("mainnet", "/api/v1/candles", 300)
    ).rejects.toSatisfy((error: Error) => {
      expect(error.message).toContain("21952")
      expect(error.message).not.toContain("secret-adjacent")
      return true
    })
  })
})
