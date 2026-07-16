import { afterEach, describe, expect, it } from "vitest"

import {
  assertPublicHttpUrl,
  isPrivateAddress,
  setDnsLookupForTests,
} from "@/server/automations/net-guard"

afterEach(() => {
  setDnsLookupForTests(null)
})

describe("isPrivateAddress", () => {
  it("flags private and special IPv4 ranges", () => {
    for (const address of [
      "127.0.0.1",
      "10.1.2.3",
      "172.16.0.1",
      "172.31.255.255",
      "192.168.1.1",
      "169.254.169.254",
      "100.64.0.1",
      "0.0.0.0",
      "not-an-ip",
    ]) {
      expect(isPrivateAddress(address), address).toBe(true)
    }
  })

  it("allows public IPv4", () => {
    for (const address of ["8.8.8.8", "1.1.1.1", "93.184.216.34"]) {
      expect(isPrivateAddress(address), address).toBe(false)
    }
  })

  it("handles IPv6 forms", () => {
    expect(isPrivateAddress("::1")).toBe(true)
    expect(isPrivateAddress("::")).toBe(true)
    expect(isPrivateAddress("fe80::1")).toBe(true)
    expect(isPrivateAddress("fd00::1")).toBe(true)
    expect(isPrivateAddress("::ffff:127.0.0.1")).toBe(true)
    expect(isPrivateAddress("::ffff:7f00:1")).toBe(true)
    expect(isPrivateAddress("2606:4700::1111")).toBe(false)
  })
})

describe("assertPublicHttpUrl", () => {
  it("rejects localhost-style hostnames without DNS", async () => {
    for (const url of [
      "http://localhost/x",
      "http://foo.localhost/x",
      "http://service.local/x",
      "http://api.internal/x",
      "http://127.0.0.1:9999/x",
      "http://[::1]/x",
    ]) {
      await expect(assertPublicHttpUrl(new URL(url)), url).rejects.toThrow(
        "URL points to a private address"
      )
    }
  })

  it("rejects hostnames resolving to private addresses", async () => {
    setDnsLookupForTests(async () => ["10.0.0.5"])
    await expect(
      assertPublicHttpUrl(new URL("https://evil.example.com/hook"))
    ).rejects.toThrow("URL points to a private address")
  })

  it("allows hostnames resolving to public addresses", async () => {
    setDnsLookupForTests(async () => ["93.184.216.34"])
    await expect(
      assertPublicHttpUrl(new URL("https://example.com/hook"))
    ).resolves.toBeUndefined()
  })

  it("lets unresolvable hostnames through for fetch to report", async () => {
    setDnsLookupForTests(async () => {
      throw new Error("ENOTFOUND")
    })
    await expect(
      assertPublicHttpUrl(new URL("https://nope.example.com/hook"))
    ).resolves.toBeUndefined()
  })
})
