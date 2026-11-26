import { describe, expect, it } from "vitest"

import {
  getSystemEmailSender,
  resolveSystemEmailSender,
} from "@/server/email/app-sender"

describe("the system email sender", () => {
  it("uses Resend's restricted testing sender only when none is configured", () => {
    expect(getSystemEmailSender({})).toEqual({
      from: "Custom Shell <onboarding@resend.dev>",
      address: "onboarding@resend.dev",
      configured: false,
      source: "resend-test",
    })
  })

  it("uses the configured verified-domain sender", () => {
    expect(
      getSystemEmailSender({
        CUSTOM_SHELL_EMAIL_FROM:
          "  Custom Shell <notifications@systemeverything.com>  ",
      }),
    ).toEqual({
      from: "Custom Shell <notifications@systemeverything.com>",
      address: "notifications@systemeverything.com",
      configured: true,
      source: "environment",
    })
  })

  it("lets a saved workspace address replace the deployment address", () => {
    expect(
      resolveSystemEmailSender("accounts@example.com", {
        CUSTOM_SHELL_EMAIL_FROM:
          "Custom Shell <notifications@systemeverything.com>",
      }),
    ).toEqual({
      from: "Custom Shell <accounts@example.com>",
      address: "accounts@example.com",
      configured: true,
      source: "settings",
    })
  })
})
