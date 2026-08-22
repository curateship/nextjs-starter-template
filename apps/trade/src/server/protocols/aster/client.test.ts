import { afterEach, describe, expect, it, vi } from "vitest"

import {
  asterPublic,
  clearAsterClientState,
} from "@/server/protocols/aster/client"
import { isRationed } from "@/server/protocols/rationing"

function exchangeInfoResponse(): Response {
  return Response.json({
    rateLimits: [
      {
        rateLimitType: "REQUEST_WEIGHT",
        interval: "MINUTE",
        intervalNum: 1,
        limit: 2_400,
      },
      {
        rateLimitType: "ORDERS",
        interval: "MINUTE",
        intervalNum: 1,
        limit: 1_200,
      },
    ],
  })
}

afterEach(() => {
  clearAsterClientState()
  vi.unstubAllGlobals()
})

describe("Aster public reads", () => {
  it("reads the limit once, then uses the network host and query values", async () => {
    const fetchMock = vi.fn(async (url: URL) =>
      String(url).endsWith("/fapi/v3/exchangeInfo")
        ? exchangeInfoResponse()
        : Response.json({ serverTime: 1 })
    )
    vi.stubGlobal("fetch", fetchMock)

    await asterPublic("testnet", "/fapi/v3/klines", 5, {
      symbol: "BTCUSDT",
      interval: "4h",
    })
    await asterPublic("testnet", "/fapi/v3/time", 1)

    expect(String(fetchMock.mock.calls[1][0])).toBe(
      "https://fapi.asterdex-testnet.com/fapi/v3/klines?symbol=BTCUSDT&interval=4h"
    )
    expect(
      fetchMock.mock.calls.filter(([url]) =>
        String(url).endsWith("/fapi/v3/exchangeInfo")
      )
    ).toHaveLength(1)
  })

  it("refreshes exchangeInfo market data after using the first read for limits", async () => {
    let version = 0
    const fetchMock = vi.fn(async () => {
      version += 1
      const response = exchangeInfoResponse()
      const payload = (await response.json()) as Record<string, unknown>
      return Response.json({ ...payload, version })
    })
    vi.stubGlobal("fetch", fetchMock)

    await expect(
      asterPublic("mainnet", "/fapi/v3/exchangeInfo", 1)
    ).resolves.toMatchObject({ version: 1 })
    await expect(
      asterPublic("mainnet", "/fapi/v3/exchangeInfo", 1)
    ).resolves.toMatchObject({ version: 2 })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("starts the public hold after a too-fast answer", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(exchangeInfoResponse())
      .mockResolvedValueOnce(new Response(null, { status: 429 }))
    vi.stubGlobal("fetch", fetchMock)

    await expect(asterPublic("mainnet", "/fapi/v3/time", 1)).rejects.toThrow(
      "EXCHANGE_BUSY"
    )
    expect(isRationed("aster", "mainnet", "public")).toBe(true)

    await expect(asterPublic("mainnet", "/fapi/v3/time", 1)).rejects.toThrow(
      "EXCHANGE_BUSY"
    )
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("slows down locally before another request reaches Aster", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          rateLimits: [
            {
              rateLimitType: "REQUEST_WEIGHT",
              interval: "MINUTE",
              intervalNum: 1,
              limit: 10,
            },
            {
              rateLimitType: "ORDERS",
              interval: "MINUTE",
              intervalNum: 1,
              limit: 2,
            },
          ],
        })
      )
      .mockResolvedValueOnce(Response.json({ serverTime: 1 }))
    vi.stubGlobal("fetch", fetchMock)

    await asterPublic("mainnet", "/fapi/v3/time", 7)
    await expect(asterPublic("mainnet", "/fapi/v3/time", 1)).rejects.toThrow(
      "EXCHANGE_BUSY"
    )
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("stops every later request after an address ban", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(exchangeInfoResponse())
      .mockResolvedValueOnce(new Response(null, { status: 418 }))
    vi.stubGlobal("fetch", fetchMock)

    await expect(asterPublic("mainnet", "/fapi/v3/time", 1)).rejects.toThrow(
      "ASTER_IP_BANNED"
    )
    await expect(asterPublic("testnet", "/fapi/v3/time", 1)).rejects.toThrow(
      "ASTER_IP_BANNED"
    )
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("refuses to guess when exchangeInfo has no minute allowance", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ rateLimits: [] }))
    )

    await expect(asterPublic("mainnet", "/fapi/v3/time", 1)).rejects.toThrow(
      "ASTER_REQUEST_LIMIT_MISSING"
    )
  })
})
