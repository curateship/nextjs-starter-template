import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  binanceSigned,
  binanceSignedQuery,
  clearBinanceClientState,
  packBinanceCredential,
  parseBinanceCredential,
} from "@/server/protocols/binance/client"
import {
  binanceRefusal,
  isKeyRefusal,
} from "@/server/protocols/binance/refusals"

const CREDENTIAL = { key: "k".repeat(64), secret: "s".repeat(64) }

type Sent = { method: string; url: URL; headers: Headers }

function stub(
  answer: (url: URL, method: string) => Response | Promise<Response>,
  sent: Sent[] = []
): Sent[] {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (raw: string | URL, init?: RequestInit) => {
      const url = new URL(String(raw))
      const method = init?.method ?? "GET"
      sent.push({ method, url, headers: new Headers(init?.headers) })
      if (url.pathname === "/fapi/v1/time") {
        return Response.json({ serverTime: Date.now() })
      }
      return answer(url, method)
    })
  )
  return sent
}

beforeEach(() => clearBinanceClientState())
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe("Binance signing", () => {
  it("matches the worked example in Binance's API docs", () => {
    // Binance's published HMAC example: this secret over this query signs
    // to this hex string.
    const query = binanceSignedQuery(
      {
        symbol: "LTCBTC",
        side: "BUY",
        type: "LIMIT",
        timeInForce: "GTC",
        quantity: 1,
        price: 0.1,
      },
      "NhqPtmdSJYdKjVHjA7PZj4Mge3R5YNiP1e3UZjInClVN65XAbvqqM6A7H5fATj0j",
      1499827319559
    )
    expect(query).toBe(
      "symbol=LTCBTC&side=BUY&type=LIMIT&timeInForce=GTC&quantity=1&price=0.1&recvWindow=5000&timestamp=1499827319559&signature=c8db56825ae71d6d79447849e617115f4a920fa2acdcab2b053c4b2838bd6b71"
    )
  })

  it("sends the key in its header and never the secret", async () => {
    const sent = stub(() => Response.json({ ok: true }))
    await binanceSigned("mainnet", CREDENTIAL, "GET", "/fapi/v3/account")
    const call = sent.find((one) => one.url.pathname === "/fapi/v3/account")
    expect(call?.headers.get("X-MBX-APIKEY")).toBe(CREDENTIAL.key)
    expect(call?.url.toString()).not.toContain(CREDENTIAL.secret)
    expect(call?.url.searchParams.get("signature")).toMatch(/^[0-9a-f]{64}$/)
  })

  it("refuses a testnet request before sending anything", async () => {
    const sent = stub(() => Response.json({}))
    await expect(
      binanceSigned("testnet", CREDENTIAL, "GET", "/fapi/v3/account")
    ).rejects.toThrow("BINANCE_NETWORK_UNSUPPORTED")
    expect(sent).toHaveLength(0)
  })
})

describe("Binance refusals", () => {
  it("sends a refused timestamp once more on a fresh clock, and only once", async () => {
    const sent = stub(() =>
      Response.json({ code: -1021, msg: "Timestamp outside" }, { status: 400 })
    )
    await expect(
      binanceSigned("mainnet", CREDENTIAL, "POST", "/fapi/v1/order", { symbol: "BTCUSDT" })
    ).rejects.toThrow(/LIVE_ORDER_REFUSED:Binance refused the request's time/)
    expect(sent.filter((one) => one.url.pathname === "/fapi/v1/order")).toHaveLength(2)
    expect(sent.filter((one) => one.url.pathname === "/fapi/v1/time")).toHaveLength(2)
  })

  it("never resends any other refused order", async () => {
    const sent = stub(() =>
      Response.json({ code: -2019, msg: "Margin is insufficient." }, { status: 400 })
    )
    await expect(
      binanceSigned("mainnet", CREDENTIAL, "POST", "/fapi/v1/order")
    ).rejects.toThrow(/not enough free margin/)
    expect(sent.filter((one) => one.url.pathname === "/fapi/v1/order")).toHaveLength(1)
  })

  it("says an order's fate is unknown when Binance's own servers time out", async () => {
    stub(() => Response.json({ code: -1007, msg: "Timeout" }, { status: 408 }))
    await expect(
      binanceSigned("mainnet", CREDENTIAL, "POST", "/fapi/v1/order")
    ).rejects.toThrow(/^LIVE_NO_ANSWER:.*check Binance's own site/i)
  })

  it("names the region block in words", () => {
    expect(binanceRefusal("-4402", 400).message).toMatch(
      /^LIVE_ORDER_REFUSED:Binance says futures are not available/
    )
    expect(binanceRefusal("-4087", 400).message).toContain("Canada")
  })

  it("treats the spot host's unknown-key answer as a refused key", () => {
    // Measured 24 Sep 2026: a made-up key on the key-permission read.
    expect(isKeyRefusal(binanceRefusal("-2008", 401))).toBe(true)
  })

  it("shows an unknown code by its number rather than guessing", () => {
    expect(binanceRefusal("-9999", 400).message).toBe(
      "LIVE_ORDER_REFUSED:Binance refused it (code -9999). Nothing else is known about why. Check Binance's own site before trying again."
    )
  })
})

describe("Binance request allowance", () => {
  it("stops asking for as long as a 429 says, then asks again", async () => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(1_000_000)
    let limited = true
    const sent = stub(() =>
      limited
        ? new Response(null, { status: 429, headers: { "retry-after": "30" } })
        : Response.json({ ok: true })
    )
    await expect(
      binanceSigned("mainnet", CREDENTIAL, "GET", "/fapi/v3/account")
    ).rejects.toThrow(/^EXCHANGE_BUSY:/)
    const before = sent.length
    await expect(
      binanceSigned("mainnet", CREDENTIAL, "POST", "/fapi/v1/order")
    ).rejects.toThrow(/^EXCHANGE_BUSY:/)
    expect(sent.length).toBe(before)
    limited = false
    vi.setSystemTime(1_000_000 + 31_000)
    await expect(
      binanceSigned("mainnet", CREDENTIAL, "GET", "/fapi/v3/account")
    ).resolves.toEqual({ ok: true })
  })

  it("does not pause futures when the spot host says slow down", async () => {
    // The spot host is asked only for a key's permissions and has its own
    // allowance, so its 429 must not stop orders on the futures host.
    stub((url) =>
      url.hostname === "api.binance.com"
        ? new Response(null, { status: 429, headers: { "retry-after": "60" } })
        : Response.json({ ok: true })
    )
    await expect(
      binanceSigned("mainnet", CREDENTIAL, "GET", "/sapi/v1/account/apiRestrictions", {}, { host: "spot" })
    ).rejects.toThrow(/^EXCHANGE_BUSY:/)
    await expect(
      binanceSigned("mainnet", CREDENTIAL, "POST", "/fapi/v1/order")
    ).resolves.toEqual({ ok: true })
  })

  it("keeps the last of a nearly spent minute for orders", async () => {
    stub(
      () =>
        new Response(JSON.stringify({ ok: true }), {
          headers: { "x-mbx-used-weight-1m": "2100" },
        })
    )
    await binanceSigned("mainnet", CREDENTIAL, "GET", "/fapi/v3/account")
    await expect(
      binanceSigned("mainnet", CREDENTIAL, "GET", "/fapi/v3/account")
    ).rejects.toThrow(/nearly spent/)
    await expect(
      binanceSigned("mainnet", CREDENTIAL, "POST", "/fapi/v1/order")
    ).resolves.toEqual({ ok: true })
  })
})

describe("Binance credentials", () => {
  it("stores the key and secret together and reads them back", () => {
    const blob = packBinanceCredential({
      address: ` ${CREDENTIAL.key} `,
      secret: CREDENTIAL.secret,
    })
    expect(parseBinanceCredential(blob)).toEqual(CREDENTIAL)
  })

  it("treats an unreadable stored blob as a missing key", () => {
    expect(() => parseBinanceCredential("{}")).toThrow("LIVE_WALLET_KEY")
    expect(() => parseBinanceCredential(null)).toThrow("LIVE_WALLET_KEY")
  })
})
