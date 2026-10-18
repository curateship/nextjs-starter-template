import { afterEach, describe, expect, it, vi } from "vitest"

import { getEmailProvider } from "@/server/email/provider"

const message = {
  from: "App <hello@example.com>",
  to: "ada@example.com",
  subject: "Hello",
  html: "<p>Hello</p>",
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("the Resend email provider", () => {
  it("carries a permanent provider reason for later retry decisions", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json(
          { name: "invalid_api_key", message: "API key is invalid." },
          { status: 403 }
        )
      )
    )

    await expect(getEmailProvider("re_test").send(message)).resolves.toEqual({
      success: false,
      error: "API key is invalid.",
      failureKind: "needs_attention",
    })
  })

  it("keeps a successful provider message id", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(Response.json({ id: "email-123" }, { status: 200 }))
    )

    await expect(getEmailProvider("re_test").send(message)).resolves.toEqual({
      success: true,
      messageId: "email-123",
    })
  })

  it("marks a network failure as safe to try again", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("socket detail")))

    await expect(getEmailProvider("re_test").send(message)).resolves.toEqual({
      success: false,
      error: "The email service could not be reached.",
      failureKind: "retryable",
    })
  })
})
