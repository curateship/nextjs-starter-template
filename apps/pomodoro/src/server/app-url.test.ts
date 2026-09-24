import { describe, expect, it } from "vitest"

import { appUrl, getAppLinkStatus } from "@/server/app-url"

describe("the address used in emailed links", () => {
  it("keeps the localhost fallback in development", () => {
    const status = getAppLinkStatus({})

    expect(status.address).toBe("http://localhost:3002")
    expect(status.configured).toBe(false)
    expect(status.production).toBe(false)
    expect(status.usableForLinks).toBe(false)
    expect(appUrl({})).toBe("http://localhost:3002")
  })

  it.each([
    { CUSTOM_SHELL_API_ENV: "production" },
    { NODE_ENV: "production" },
  ])("refuses a missing address with either production signal", (environment) => {
    expect(() => appUrl(environment)).toThrow(
      "CUSTOM_SHELL_APP_URL is required in production"
    )
  })

  it("uses a configured public address in production", () => {
    const environment = {
      CUSTOM_SHELL_API_ENV: "production",
      CUSTOM_SHELL_APP_URL: "https://app.example.com/",
    }

    expect(appUrl(environment)).toBe("https://app.example.com")
    expect(getAppLinkStatus(environment)).toMatchObject({
      address: "https://app.example.com",
      configured: true,
      production: true,
      usableForLinks: true,
    })
  })

  it.each([
    "http://localhost:3002",
    "http://admin.localhost:3002",
    "http://127.0.0.1:3002",
    "https://user:password@app.example.com",
    "https://app.example.com/base",
    "https://app.example.com?from=email",
    "not an address",
  ])("refuses a non-public production address: %s", (address) => {
    expect(() =>
      appUrl({
        NODE_ENV: "production",
        CUSTOM_SHELL_APP_URL: address,
      })
    ).toThrow("must be a public HTTP or HTTPS address in production")
  })

  it("still reports a bad production value so the Email tab can diagnose it", () => {
    expect(
      getAppLinkStatus({ CUSTOM_SHELL_API_ENV: "production" })
    ).toMatchObject({
      address: "http://localhost:3002",
      production: true,
      usableForLinks: false,
    })
  })
})
