import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import saved from "./edgex.fixture.json"
import {
  assertEdgexNotHeld,
  edgexCeiling,
  holdEdgexLane,
  reserveEdgexRequest,
} from "@/server/protocols/edgex/budget"
import { edgexClockOffset, edgexTimestamp } from "@/server/protocols/edgex/clock"
import {
  clearEdgexClientState,
  edgexPrivate,
  edgexPublic,
  packEdgexCredential,
  parseEdgexCredential,
} from "@/server/protocols/edgex/client"

const SIGNER = `0x${"ab".repeat(32)}`
const credential = parseEdgexCredential(
  packEdgexCredential({
    address: "543429922991899150",
    secret: `made-up-key made-up-secret ${SIGNER}`,
    passphrase: "made-up-passphrase",
  })
)

function answer(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  })
}

const fetchMock = vi.fn<typeof fetch>()

beforeEach(() => {
  clearEdgexClientState()
  fetchMock.mockReset()
  vi.stubGlobal("fetch", fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("edgeX's request budget", () => {
  it("keeps the website to two thirds of sixty a minute, idle reads to less", () => {
    expect(edgexCeiling("order", false)).toBe(40)
    expect(edgexCeiling("watched", false)).toBe(34)
    expect(edgexCeiling("background", false)).toBe(24)
    expect(edgexCeiling("order", true)).toBe(20)
  })

  it("refuses at the cap with the count and when there is room again", () => {
    const now = 1_790_280_000_000
    for (let at = 0; at < 24; at += 1) reserveEdgexRequest("mainnet", "background", now + at)
    expect(() => reserveEdgexRequest("mainnet", "background", now + 30_000)).toThrow(
      "EXCHANGE_BUSY:edgeX — spent 24 of 24 requests this minute, room again in 30 seconds"
    )
    // Order work still has the room idle reads leave.
    expect(() => reserveEdgexRequest("mainnet", "order", now + 30_000)).not.toThrow()
  })

  it("doubles the wait on every 429 in a row, up to a minute", () => {
    const now = 1_790_280_000_000
    const waits = [1, 2, 3, 4, 5, 6].map(() => holdEdgexLane("mainnet", "public", now).lastMs)
    expect(waits).toEqual([5_000, 10_000, 20_000, 40_000, 60_000, 60_000])
    expect(() => assertEdgexNotHeld("mainnet", "public", now + 1_000)).toThrow(
      "EXCHANGE_BUSY:edgeX — asked Trade to slow down 6 times in a row, asking again in 59 seconds"
    )
  })

  it("holds the public lane after a 429 and never asks during the hold", async () => {
    fetchMock.mockResolvedValueOnce(answer(429, {}))
    await expect(edgexPublic("mainnet", "/api/v2/public/meta/getMetaData")).rejects.toThrow(
      "EXCHANGE_BUSY:edgeX — asked Trade to slow down once, asking again in 5 seconds"
    )
    await expect(edgexPublic("mainnet", "/api/v2/public/meta/getMetaData")).rejects.toThrow(
      /^EXCHANGE_BUSY:/
    )
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe("edgeX's clock", () => {
  it("stamps edgeX's time, read once, not this machine's", async () => {
    const readTime = vi.fn(async () => Date.now() + 120_000)
    const stamp = await edgexTimestamp({ network: "mainnet", readTime })
    expect(stamp - Date.now()).toBeGreaterThan(119_000)
    await edgexTimestamp({ network: "mainnet", readTime })
    expect(readTime).toHaveBeenCalledTimes(1)
    expect(await edgexClockOffset("mainnet")).toBeGreaterThan(119_000)
  })

  it("re-reads the clock once after a timestamp refusal and sends again", async () => {
    let clockReads = 0
    const headersSeen: string[] = []
    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input)
      if (url.includes("getServerTime")) {
        clockReads += 1
        // The first read is two minutes out; the second is right.
        const skew = clockReads === 1 ? 120_000 : 0
        return answer(200, { code: "SUCCESS", data: { timeMillis: String(Date.now() + skew) } })
      }
      const stamp = (init?.headers as Record<string, string>)["X-edgeX-Timestamp"]
      headersSeen.push(stamp)
      if (Math.abs(Number(stamp) - Date.now()) > 60_000) {
        return answer(400, { code: "INVALID_TIMESTAMP", msg: "timestamp out of window" })
      }
      return answer(200, { code: "SUCCESS", data: { ok: true } })
    })
    await expect(
      edgexPrivate("mainnet", credential, "GET", "/api/v2/private/account/getAccountAsset")
    ).resolves.toEqual({ ok: true })
    expect(clockReads).toBe(2)
    expect(headersSeen).toHaveLength(2)
  })

  it("refuses after the second timestamp refusal and sends nothing more", async () => {
    fetchMock.mockImplementation(async (input) => {
      if (String(input).includes("getServerTime")) {
        return answer(200, { code: "SUCCESS", data: { timeMillis: String(Date.now()) } })
      }
      return answer(400, { code: "INVALID_TIMESTAMP" })
    })
    await expect(
      edgexPrivate("mainnet", credential, "GET", "/api/v2/private/account/getAccountAsset")
    ).rejects.toThrow(/^LIVE_ORDER_REFUSED:edgeX refused the request's time/)
    const sent = fetchMock.mock.calls.filter(([input]) => !String(input).includes("getServerTime"))
    expect(sent).toHaveLength(2)
  })
})

describe("edgeX's signed requests", () => {
  it("signs the account id into every request and sends the four headers", async () => {
    fetchMock.mockImplementation(async (input) =>
      String(input).includes("getServerTime")
        ? answer(200, { code: "SUCCESS", data: { timeMillis: String(Date.now()) } })
        : answer(200, { code: "SUCCESS", data: null })
    )
    await edgexPrivate("mainnet", credential, "POST", "/api/v2/private/order/cancelOrderById", {
      orderIdList: ["564827797948727434"],
    })
    const [url, init] = fetchMock.mock.calls.at(-1)!
    expect(String(url)).toBe("https://edgex-prod-v2.edgex.exchange/api/v2/private/order/cancelOrderById")
    expect(JSON.parse(String(init?.body))).toEqual({
      orderIdList: ["564827797948727434"],
      accountId: "543429922991899150",
    })
    const headers = init?.headers as Record<string, string>
    expect(Object.keys(headers)).toEqual(
      expect.arrayContaining(["X-edgeX-Api-Key", "X-edgeX-Passphrase", "X-edgeX-Timestamp", "X-edgeX-Signature"])
    )
    expect(headers["X-edgeX-Signature"]).toMatch(/^[0-9a-f]{64}$/)
  })

  it("turns the real bogus-key answer into a sentence that quotes nothing back", async () => {
    fetchMock.mockImplementation(async (input) =>
      String(input).includes("getServerTime")
        ? answer(200, { code: "SUCCESS", data: { timeMillis: String(Date.now()) } })
        : answer(401, saved.badKey)
    )
    const error = await edgexPrivate(
      "mainnet",
      credential,
      "GET",
      "/api/v2/private/account/getAccountAsset"
    ).catch((caught: Error) => caught)
    expect((error as Error).message).toMatch(/^LIVE_ORDER_REFUSED:edgeX did not accept this API key/)
    expect((error as Error).message).not.toContain("nope")
  })
})

describe("the credential edgeX's SDK Signer dialog gives", () => {
  it("finds the signer key by its shape wherever it is pasted, and ignores labels", () => {
    const packed = parseEdgexCredential(
      packEdgexCredential({
        address: " 543429922991899150 ",
        secret: `Signer key: ${SIGNER.slice(2).toUpperCase()} API Key: my-key Secret: my-secret`,
        passphrase: "pass",
      })
    )
    expect(packed).toEqual({
      accountId: "543429922991899150",
      key: "my-key",
      secret: "my-secret",
      passphrase: "pass",
      signerKey: SIGNER,
    })
  })

  it("takes the dialog's order when the API key and secret are 64 hex characters too", () => {
    const [signer, key, secret] = ["11", "22", "33"].map((pair) => pair.repeat(32))
    const packed = parseEdgexCredential(
      packEdgexCredential({ address: "1", secret: `${signer} ${key} ${secret}`, passphrase: "p" })
    )
    expect(packed).toMatchObject({ signerKey: `0x${signer}`, key, secret })
  })

  it("lets the one value written with 0x be the signer key, wherever it sits", () => {
    const [key, secret] = ["22", "33"].map((pair) => pair.repeat(32))
    const packed = parseEdgexCredential(
      packEdgexCredential({ address: "1", secret: `${key} ${secret} ${SIGNER}`, passphrase: "p" })
    )
    expect(packed).toMatchObject({ signerKey: SIGNER, key, secret })
  })

  it("refuses a paste whose shapes and order cannot say which is the signer key", () => {
    const [key, secret] = ["22", "33"].map((pair) => pair.repeat(32))
    expect(() =>
      packEdgexCredential({ address: "1", secret: `my-key ${key} ${secret}`, passphrase: "p" })
    ).toThrow(/in the order the dialog shows them: the Private Key, the API Key and the secret/)
  })

  it("refuses a paste without a signer key, and never repeats what was pasted", () => {
    try {
      packEdgexCredential({ address: "1", secret: "only-a-key only-a-secret", passphrase: "p" })
      throw new Error("should have refused")
    } catch (error) {
      const message = (error as Error).message
      expect(message.startsWith("KEY_NOT_APPROVED:")).toBe(true)
      expect(message).not.toContain("only-a")
    }
  })

  it("refuses an account id that is not digits, and a missing passphrase", () => {
    expect(() =>
      packEdgexCredential({ address: "0xabc", secret: `a b ${SIGNER}`, passphrase: "p" })
    ).toThrow(/^KEY_NOT_APPROVED:The account id/)
    expect(() => packEdgexCredential({ address: "1", secret: `a b ${SIGNER}` })).toThrow(
      "KEY_PASSPHRASE_REQUIRED"
    )
  })

  it("refuses a stored blob that no longer reads", () => {
    expect(() => parseEdgexCredential(null)).toThrow("LIVE_WALLET_KEY")
    expect(() => parseEdgexCredential("{}")).toThrow("LIVE_WALLET_KEY")
  })
})
