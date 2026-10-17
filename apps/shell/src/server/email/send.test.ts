import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  listDevEmails,
  resetDevOutboxForTests,
} from "@/server/email/dev-outbox"

const emailSettings = vi.hoisted(() => ({
  getAppEmailApiKey: vi.fn<() => Promise<string | null>>(),
}))
const sends = vi.hoisted(() => ({
  recordSystemEmailSend: vi.fn(),
}))
const retries = vi.hoisted(() => ({
  enqueuePendingEmailSend: vi.fn(),
}))

vi.mock("@/server/email/settings", () => emailSettings)
vi.mock("@/server/workspaces/for-request", () => ({
  visitorWorkspaceId: vi.fn().mockResolvedValue(null),
}))
vi.mock("@/server/email/system-emails", () => ({
  getSystemEmail: vi.fn().mockResolvedValue(null),
  recordSystemEmailSend: sends.recordSystemEmailSend,
}))
vi.mock("@/server/email/retry", () => retries)
vi.mock("@/server/email/branding", () => ({
  emailBrandName: vi.fn(),
  protectSentEmailLogos: vi.fn(),
}))
vi.mock("@/server/email/app-sender", () => ({
  getWorkspaceSystemEmailSender: vi.fn().mockResolvedValue({
    from: "Custom Shell <onboarding@resend.dev>",
  }),
}))

import { sendAuthEmail } from "@/server/email/send"

const request = {
  kind: "password-reset" as const,
  to: "ada@example.com",
  recipientName: "Ada Lovelace",
  actionUrl: "https://app.example/reset?token=secret",
}

beforeEach(() => {
  vi.stubEnv("CUSTOM_SHELL_RESEND_API_KEY", "")
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  emailSettings.getAppEmailApiKey.mockReset()
  sends.recordSystemEmailSend.mockReset()
  retries.enqueuePendingEmailSend.mockReset()
  resetDevOutboxForTests()
})

describe("an unconfigured system-email sender", () => {
  it("keeps the complete email for development and reports no delivery", async () => {
    emailSettings.getAppEmailApiKey.mockResolvedValue(null)
    const log = vi.spyOn(console, "info").mockImplementation(() => undefined)

    await expect(sendAuthEmail(request)).resolves.toEqual({ delivered: false })

    expect(log).toHaveBeenCalledWith(expect.stringContaining(request.actionUrl))
    expect(listDevEmails("any-workspace")).toMatchObject([
      {
        workspaceId: null,
        toEmail: request.to,
        subject: "Reset your password",
      },
    ])
    expect(sends.recordSystemEmailSend).toHaveBeenCalledWith(
      expect.objectContaining({ status: "failed" }),
    )
  })

  it("refuses on a live server instead of logging a secret link", async () => {
    vi.stubEnv("CUSTOM_SHELL_API_ENV", "production")
    emailSettings.getAppEmailApiKey.mockResolvedValue(null)
    const log = vi.spyOn(console, "info").mockImplementation(() => undefined)

    await expect(sendAuthEmail(request)).rejects.toThrow("EMAIL_NOT_CONFIGURED")

    expect(log).not.toHaveBeenCalled()
    expect(sends.recordSystemEmailSend).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "failed",
        error: "No Resend key is saved under Settings → Email.",
      }),
    )
  })
})

describe("a configured system-email sender", () => {
  beforeEach(() => {
    emailSettings.getAppEmailApiKey.mockResolvedValue("re_test")
  })

  it("returns and records Resend's message id", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(Response.json({ id: "email-123" }, { status: 200 }))
    )

    await expect(sendAuthEmail(request)).resolves.toEqual({
      delivered: true,
      messageId: "email-123",
    })
    expect(sends.recordSystemEmailSend).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "sent",
        providerMessageId: "email-123",
      })
    )
  })

  it("tells an admin when the key needs attention", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json(
            { name: "invalid_api_key", message: "API key is invalid." },
            { status: 403 }
          )
        )
    )

    await expect(
      sendAuthEmail({ ...request, showFailureReasonToAdmin: true })
    ).rejects.toThrow("EMAIL_DELIVERY_NEEDS_ATTENTION: API key is invalid.")
    expect(sends.recordSystemEmailSend).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "failed",
        error: "API key is invalid.",
      })
    )
  })

  it("tells an admin when the failure is temporary", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json(
          {
            name: "rate_limit_exceeded",
            message: "Too many requests.",
          },
          { status: 429 }
        )
      )
    )

    await expect(
      sendAuthEmail({ ...request, showFailureReasonToAdmin: true })
    ).rejects.toThrow("EMAIL_DELIVERY_RETRYABLE: Too many requests.")
    expect(retries.enqueuePendingEmailSend).toHaveBeenCalledWith(
      expect.objectContaining(request),
      expect.objectContaining({
        reason: "Too many requests.",
      })
    )
  })

  it("does not expose Resend's reason to a signed-out flow", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json(
          {
            name: "invalid_api_key",
            message: "Secret account configuration detail.",
          },
          { status: 403 }
        )
      )
    )

    await expect(sendAuthEmail(request)).rejects.toThrow(
      /^EMAIL_DELIVERY_NEEDS_ATTENTION$/
    )
  })

  it("treats a network failure as temporary without logging its details", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("socket secret"))
    )

    await expect(
      sendAuthEmail({ ...request, showFailureReasonToAdmin: true })
    ).rejects.toThrow(
      "EMAIL_DELIVERY_RETRYABLE: The email service could not be reached."
    )
    expect(sends.recordSystemEmailSend).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "failed",
        error: "The email service could not be reached.",
      })
    )
    expect(retries.enqueuePendingEmailSend).toHaveBeenCalledWith(
      expect.objectContaining(request),
      expect.objectContaining({
        reason: "The email service could not be reached.",
      })
    )
  })
})
