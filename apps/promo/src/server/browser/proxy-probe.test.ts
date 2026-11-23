import { afterEach, describe, expect, it, vi } from "vitest"

import { isPublicCallbackUrl } from "./proxy-probe"

describe("an address another app gave Promo to call back", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("is refused on the live server when it points inside the network", async () => {
    vi.stubEnv("NODE_ENV", "production")
    expect(await isPublicCallbackUrl("https://127.0.0.1/api")).toBe(false)
    expect(await isPublicCallbackUrl("https://10.0.0.5")).toBe(false)
    expect(await isPublicCallbackUrl("https://169.254.169.254/latest/meta-data")).toBe(false)
    expect(await isPublicCallbackUrl("https://[::1]:3016")).toBe(false)
    expect(await isPublicCallbackUrl("not an address")).toBe(false)
    expect(await isPublicCallbackUrl("https://8.8.8.8/api/connect/promo/events")).toBe(true)
  })

  it("is let through away from the live server, where two apps on one computer talk over localhost", async () => {
    vi.stubEnv("NODE_ENV", "development")
    expect(await isPublicCallbackUrl("http://localhost:3016")).toBe(true)
  })
})
