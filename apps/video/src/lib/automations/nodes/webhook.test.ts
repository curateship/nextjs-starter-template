import { describe, expect, it } from "vitest"

import {
  isPrivateWebhookHostname,
  webhookSettingsSchema,
  webhookUrlError,
} from "./webhook"

describe("webhook settings", () => {
  it("accepts a public HTTPS address and a one-line secret", () => {
    expect(
      webhookSettingsSchema.safeParse({
        url: "https://hooks.example.com/automation",
        secret: "shared-secret",
      }).success
    ).toBe(true)
  })

  it("requires HTTPS and refuses credentials in the address", () => {
    expect(webhookUrlError("http://hooks.example.com/x")).toContain("https")
    expect(webhookUrlError("https://name:secret@example.com/x")).toContain(
      "secret header"
    )
    expect(webhookUrlError("https://example.com/hook#secret")).toContain(
      "# fragment"
    )
  })

  it("refuses obvious private targets before a flow can compile", () => {
    for (const url of [
      "https://localhost/hook",
      "https://service.internal/hook",
      "https://127.0.0.1/hook",
      "https://10.1.2.3/hook",
      "https://192.168.1.4/hook",
      "https://[::1]/hook",
      "https://[fd00::1]/hook",
      "https://[fec0::1]/hook",
      "https://[::ffff:7f00:1]/hook",
      "https://[64:ff9b::7f00:1]/hook",
      "https://[64:ff9b:1::7f00:1]/hook",
      "https://[100::1]/hook",
      "https://[2001:db8::1]/hook",
    ]) {
      expect(
        webhookSettingsSchema.safeParse({ url, secret: "" }).success,
        url
      ).toBe(false)
    }
  })

  it("recognises public IP addresses", () => {
    expect(isPrivateWebhookHostname("1.1.1.1")).toBe(false)
    expect(isPrivateWebhookHostname("2606:4700:4700::1111")).toBe(false)
  })

  it("blocks private IPv4 addresses wrapped in IPv6", () => {
    expect(isPrivateWebhookHostname("::ffff:127.0.0.1")).toBe(true)
    expect(isPrivateWebhookHostname("0:0:0:0:0:ffff:7f00:1")).toBe(true)
    expect(isPrivateWebhookHostname("64:ff9b::127.0.0.1")).toBe(true)
  })

  it("refuses header values that could add another header", () => {
    expect(
      webhookSettingsSchema.safeParse({
        url: "https://hooks.example.com/x",
        secret: "secret\r\nx-added: value",
      }).success
    ).toBe(false)
  })
})
