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

vi.mock("@/server/email/settings", () => emailSettings)
vi.mock("@/server/workspaces/for-request", () => ({
  visitorWorkspaceId: vi.fn().mockResolvedValue(null),
}))
vi.mock("@/server/email/system-emails", () => ({
  getSystemEmail: vi.fn().mockResolvedValue(null),
  recordSystemEmailSend: sends.recordSystemEmailSend,
}))
vi.mock("@/server/email/branding", () => ({
  emailBrandName: vi.fn(),
  protectSentEmailLogos: vi.fn(),
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
  vi.restoreAllMocks()
  emailSettings.getAppEmailApiKey.mockReset()
  sends.recordSystemEmailSend.mockReset()
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
