import { describe, expect, it, vi } from "vitest"

import { resolvePublicWebhookTarget } from "./net-guard"

describe("resolvePublicWebhookTarget", () => {
  it("pins a public DNS answer for the request", async () => {
    const resolve = vi.fn(async () => [
      { address: "93.184.216.34", family: 4 as const },
    ])

    await expect(
      resolvePublicWebhookTarget("https://hooks.example.com/x", resolve)
    ).resolves.toMatchObject({ address: "93.184.216.34", family: 4 })
    expect(resolve).toHaveBeenCalledWith("hooks.example.com")
  })

  it("refuses a hostname when any DNS answer is private", async () => {
    const resolve = async () => [
      { address: "93.184.216.34", family: 4 as const },
      { address: "10.0.0.5", family: 4 as const },
    ]

    await expect(
      resolvePublicWebhookTarget("https://hooks.example.com/x", resolve)
    ).rejects.toThrow("private or internal")
  })

  it("refuses an IPv4 loopback address wrapped in IPv6", async () => {
    const resolve = async () => [
      { address: "0:0:0:0:0:ffff:7f00:1", family: 6 as const },
    ]
    await expect(
      resolvePublicWebhookTarget("https://hooks.example.com/x", resolve)
    ).rejects.toThrow("private or internal")
  })

  it("refuses an IPv4 address behind an IPv6 translator", async () => {
    const resolve = async () => [
      { address: "64:ff9b::7f00:1", family: 6 as const },
    ]
    await expect(
      resolvePublicWebhookTarget("https://hooks.example.com/x", resolve)
    ).rejects.toThrow("private or internal")
  })

  it("refuses private IP literals without asking DNS", async () => {
    const resolve = vi.fn()
    await expect(
      resolvePublicWebhookTarget("https://169.254.169.254/latest", resolve)
    ).rejects.toThrow("private or internal")
    expect(resolve).not.toHaveBeenCalled()
  })

  it("fails clearly when DNS cannot find the address", async () => {
    const resolve = async () => {
      throw new Error("ENOTFOUND")
    }
    await expect(
      resolvePublicWebhookTarget("https://missing.example.test/x", resolve)
    ).rejects.toThrow("could not be found")
  })
})
