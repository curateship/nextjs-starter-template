import { describe, expect, it } from "vitest"

import {
  describeAdminEmailDeliveryError,
  describeResendFailure,
} from "@/lib/email/delivery-failure"

describe("email delivery failures", () => {
  it.each([
    "invalid_api_key",
    "validation_error",
    "invalid_from_address",
    "daily_quota_exceeded",
  ])("marks %s as needing attention", (name) => {
    expect(
      describeResendFailure(403, { name, message: "Fix this setting." })
    ).toEqual({ kind: "needs_attention", reason: "Fix this setting." })
  })

  it.each([
    "rate_limit_exceeded",
    "concurrent_idempotent_requests",
    "application_error",
    "internal_server_error",
  ])("marks %s as retryable", (name) => {
    expect(describeResendFailure(500, { name, message: "Try later." })).toEqual(
      { kind: "retryable", reason: "Try later." }
    )
  })

  it("keeps an unfamiliar provider error retryable", () => {
    expect(
      describeResendFailure(422, {
        name: "a_new_resend_error",
        message: "A new response.",
      })
    ).toEqual({ kind: "retryable", reason: "A new response." })
  })

  it("reads Resend's nested error shape and cleans its message", () => {
    expect(
      describeResendFailure(403, {
        error: {
          type: "invalid_api_key",
          message: "  API key\n is invalid.  ",
        },
      })
    ).toEqual({ kind: "needs_attention", reason: "API key is invalid." })
  })

  it("turns a classified reason into plain admin wording", () => {
    expect(
      describeAdminEmailDeliveryError(
        new Error("EMAIL_DELIVERY_RETRYABLE: Too many requests."),
        "The test email was not sent."
      )
    ).toBe(
      "The test email was not sent. Resend had a temporary problem: Too many requests. Try again shortly."
    )
  })
})
