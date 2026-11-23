import { createHmac } from "node:crypto"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import fixture from "./apex.fixture.json"
import {
  apexDataString,
  apexPrivate,
  apexPublic,
  apexSignature,
  clearApexClientState,
  packApexCredential,
  parseApexCredential,
  type ApexCredential,
} from "@/server/protocols/apex/client"
import { apexClockOffset } from "@/server/protocols/apex/clock"

const CREDENTIAL: ApexCredential = {
  key: "11111111-2222-3333-4444-555555555555",
  secret: "made-up-secret",
  passphrase: "made-up-passphrase",
  omniKey: `0x${"11".repeat(32)}${"22".repeat(32)}1b`,
}

type Call = { url: string; init: RequestInit }
let calls: Call[] = []
let answers: Array<(call: Call) => Response>

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status })
}

beforeEach(() => {
  calls = []
  answers = []
  clearApexClientState()
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL, init: RequestInit = {}) => {
      const call = { url: String(url), init }
      calls.push(call)
      const next = answers.shift()
      if (!next) throw new Error(`unexpected request ${call.url}`)
      return next(call)
    })
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
  clearApexClientState()
})

function header(call: Call, name: string): string | undefined {
  return (call.init.headers as Record<string, string>)[name]
}

describe("ApeX Omni's request signature", () => {
  it("is ApeX's documented HMAC: timestamp, method, path and sorted data, keyed by the base64 secret", () => {
    const signature = apexSignature({
      timestamp: 1_700_000_000_000,
      method: "POST",
      path: "/api/v3/order",
      data: "side=BUY&size=0.001&symbol=BTC-USDT",
      secret: "made-up-secret",
    })
    // Built independently here from the recipe in ApeX's docs.
    const expected = createHmac("sha256", Buffer.from("made-up-secret").toString("base64"))
      .update("1700000000000POST/api/v3/orderside=BUY&size=0.001&symbol=BTC-USDT")
      .digest("base64")
    expect(signature).toBe(expected)
  })

  it("matches ApeX's documented Python signer on its documented example key", () => {
    // Expected values computed by running the `sign` function printed in
    // ApeX's API docs, in Python, on the docs' own example secret and time.
    const secret = "sAVchdqy_n9zY7TOIDsqkyg0we3uF0_gGbvyIoob"
    expect(
      apexSignature({ timestamp: 1647502440973, method: "GET", path: "/ws/accounts", data: "", secret })
    ).toBe("5XhSvvA/XrlhlWi5xDD6KGgq67PD/VDHYwhLAUdYLrw=")
    expect(
      apexSignature({
        timestamp: 1647502440973,
        method: "POST",
        path: "/api/v3/order",
        data: apexDataString({ symbol: "BTC-USDT", side: "BUY", size: "0.001", price: "84000" }),
        secret,
      })
    ).toBe("mSBXn3KnQK9JNdCXfIfgbGDTfaqjFSRQsHNyu+mY01A=")
  })

  it("sorts by name, drops empty values and refuses anything it would have to encode", () => {
    expect(
      apexDataString({ symbol: "BTC-USDT", side: "BUY", reduceOnly: undefined, price: "84000.1" })
    ).toBe("price=84000.1&side=BUY&symbol=BTC-USDT")
    expect(() => apexDataString({ note: "a b" })).toThrow("APEX_PARAM_UNSAFE")
  })
})

describe("ApeX Omni's clock", () => {
  it("stamps ApeX's time, not this machine's", async () => {
    // The fake server answers with its own time at the moment it answers, as
    // a real one does. A time fixed when the test started drifted with a
    // busy machine and failed the test under a parallel run.
    answers.push(() => json({ data: { time: Date.now() - 239 }, timeCost: 2 }))
    let sentAt = 0
    answers.push(() => {
      sentAt = Date.now()
      return json({ data: { ok: true } })
    })
    await apexPrivate("mainnet", CREDENTIAL, "GET", "/account")
    const offset = await apexClockOffset("mainnet")
    // ApeX ran 239 ms behind this machine on 5 Sep 2026; half a test round
    // trip either side.
    expect(offset).toBeLessThanOrEqual(-200)
    expect(offset).toBeGreaterThan(-280)
    const stamp = Number(header(calls[1], "APEX-TIMESTAMP"))
    expect(Math.abs(stamp - (sentAt - 239))).toBeLessThan(100)
  })

  it("re-reads the clock once after a 20002 and sends the request once more", async () => {
    answers.push(() => json({ data: { time: Date.now() - 600_000 } }))
    answers.push(() => json(fixture.refusals.staleTimestamp))
    answers.push(() => json({ data: { time: Date.now() } }))
    answers.push(() => json({ data: { id: "1" } }))
    await expect(apexPrivate("mainnet", CREDENTIAL, "GET", "/account")).resolves.toEqual({ id: "1" })
    expect(calls.map((call) => new URL(call.url).pathname)).toEqual([
      "/api/v3/time",
      "/api/v3/account",
      "/api/v3/time",
      "/api/v3/account",
    ])
  })

  it("refuses after the second 20002 rather than trying forever", async () => {
    answers.push(() => json({ data: { time: Date.now() } }))
    answers.push(() => json(fixture.refusals.noTimestamp))
    answers.push(() => json({ data: { time: Date.now() } }))
    answers.push(() => json(fixture.refusals.noTimestamp))
    await expect(apexPrivate("mainnet", CREDENTIAL, "GET", "/account")).rejects.toThrow(
      /^LIVE_ORDER_REFUSED:ApeX Omni refused the request's time/
    )
    expect(calls).toHaveLength(4)
  })
})

describe("ApeX Omni's answers", () => {
  it("reads the code inside an HTTP 200 and keeps ApeX's message out", async () => {
    answers.push(() => json({ data: { time: Date.now() } }))
    answers.push(() => json(fixture.refusals.badKey))
    const refusal = await apexPrivate("mainnet", CREDENTIAL, "GET", "/account").catch(
      (error: Error) => error.message
    )
    expect(refusal).toMatch(/^LIVE_ORDER_REFUSED:ApeX Omni did not accept these API values/)
    expect(refusal).not.toContain("11111111-2222")
    expect(refusal).not.toContain("rpc error")
  })

  it("holds the public lane after a rationing answer and doubles the next hold", async () => {
    answers.push(() => json({ code: 10003, msg: "Too Many Requests" }))
    await expect(apexPublic("mainnet", "/symbols")).rejects.toThrow(
      "EXCHANGE_BUSY:ApeX Omni — asked Trade to slow down, asking again in 5 seconds"
    )
    // Held: refused at once, without a request.
    await expect(apexPublic("mainnet", "/symbols")).rejects.toThrow(/EXCHANGE_BUSY/)
    expect(calls).toHaveLength(1)
  })

  it("sends a POST as a sorted form body signed exactly as sent", async () => {
    answers.push(() => json({ data: { time: Date.now() } }))
    answers.push(() => json({ data: { id: "9" } }))
    await apexPrivate("mainnet", CREDENTIAL, "POST", "/delete-order", { id: "123" })
    const post = calls[1]
    expect(post.init.body).toBe("id=123")
    const stamp = Number(header(post, "APEX-TIMESTAMP"))
    expect(header(post, "APEX-SIGNATURE")).toBe(
      apexSignature({
        timestamp: stamp,
        method: "POST",
        path: "/api/v3/delete-order",
        data: "id=123",
        secret: CREDENTIAL.secret,
      })
    )
    expect(header(post, "APEX-PASSPHRASE")).toBe(CREDENTIAL.passphrase)
  })

  it("signs a GET's query as part of the path", async () => {
    answers.push(() => json({ data: { time: Date.now() } }))
    answers.push(() => json({ data: {} }))
    await apexPrivate("mainnet", CREDENTIAL, "GET", "/order-by-client-order-id", { id: "abc" })
    const get = calls[1]
    expect(get.url).toBe("https://omni.apex.exchange/api/v3/order-by-client-order-id?id=abc")
    const stamp = Number(header(get, "APEX-TIMESTAMP"))
    expect(header(get, "APEX-SIGNATURE")).toBe(
      apexSignature({
        timestamp: stamp,
        method: "GET",
        path: "/api/v3/order-by-client-order-id?id=abc",
        data: "",
        secret: CREDENTIAL.secret,
      })
    )
  })
})

describe("the ApeX Omni credential blob", () => {
  const omni = CREDENTIAL.omniKey

  it("packs the three pasted values and the passphrase box", () => {
    const blob = packApexCredential({
      secret: `${CREDENTIAL.key} ${CREDENTIAL.secret} ${omni}`,
      passphrase: CREDENTIAL.passphrase,
    })
    expect(parseApexCredential(blob)).toEqual(CREDENTIAL)
  })

  it("finds the omni key by its shape wherever it was pasted, with or without 0x", () => {
    const blob = packApexCredential({
      secret: `${omni.slice(2).toUpperCase()}, API Key: ${CREDENTIAL.key}, Secret: ${CREDENTIAL.secret}`,
      passphrase: CREDENTIAL.passphrase,
    })
    expect(parseApexCredential(blob)).toEqual(CREDENTIAL)
  })

  it("refuses a missing passphrase and a paste with no omni key", () => {
    expect(() => packApexCredential({ secret: `${CREDENTIAL.key} ${CREDENTIAL.secret} ${omni}` })).toThrow(
      "KEY_PASSPHRASE_REQUIRED"
    )
    expect(() =>
      packApexCredential({ secret: `${CREDENTIAL.key} ${CREDENTIAL.secret}`, passphrase: "p" })
    ).toThrow(/^KEY_NOT_APPROVED:Paste three values/)
  })

  it("never repeats a stored value when the blob does not read", () => {
    expect(() => parseApexCredential("{\"key\":\"only-this\"}")).toThrow(/^LIVE_WALLET_KEY$/)
    expect(() => parseApexCredential(null)).toThrow(/^LIVE_WALLET_KEY$/)
  })
})
