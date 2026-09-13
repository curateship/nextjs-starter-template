import { createHmac } from "node:crypto"
import { afterEach, expect, it, vi } from "vitest"
import { kucoinSigned } from "./client"

afterEach(() => vi.restoreAllMocks())

it("signs the permission read on KuCoin's account host and keeps balances on Futures", async () => {
  const fetch = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(
      new Response(
        JSON.stringify({
          code: "200000",
          data: { permission: "General,Futures" },
        })
      )
    )
  const credential = {
    keyId: "fixture-id",
    secret: "fixture-secret",
    passphrase: "fixture-passphrase",
  }
  await kucoinSigned("mainnet", credential, "GET", "/api/v1/user/api-key")
  const [url, request] = fetch.mock.calls[0]
  expect(url).toBe("https://api.kucoin.com/api/v1/user/api-key")
  const headers = new Headers(request?.headers)
  expect(headers.get("KC-API-SIGN")).toBe(
    createHmac("sha256", credential.secret)
      .update(`${headers.get("KC-API-TIMESTAMP")}GET/api/v1/user/api-key`)
      .digest("base64")
  )
  expect(headers.get("KC-API-PASSPHRASE")).not.toBe(credential.passphrase)
  fetch.mockResolvedValue(
    new Response(JSON.stringify({ code: "200000", data: {} }))
  )
  await kucoinSigned("mainnet", credential, "GET", "/api/v1/account-overview")
  expect(fetch.mock.calls[1][0]).toBe(
    "https://api-futures.kucoin.com/api/v1/account-overview"
  )
  await expect(
    kucoinSigned("testnet", credential, "GET", "/api/v1/user/api-key")
  ).rejects.toThrow("KUCOIN_NETWORK_UNSUPPORTED")
  expect(fetch).toHaveBeenCalledTimes(2)
})
