import { describe, expect, it } from "vitest"

import { plainAutomationFailure } from "./failure-message"

describe("plainAutomationFailure", () => {
  it("turns common service errors into plain words", () => {
    expect(
      plainAutomationFailure("Webhook returned HTTP 500 after 5 ms.")
    ).toBe("The service had a problem and refused the request.")
    expect(plainAutomationFailure("connect ECONNREFUSED 127.0.0.1")).toBe(
      "The service could not be reached."
    )
    expect(plainAutomationFailure("Request timed out after 10 seconds")).toBe(
      "The service took too long to respond."
    )
  })

  it("keeps only a short first line for an unfamiliar error", () => {
    expect(plainAutomationFailure("Address rejected\n    at sendEmail")).toBe(
      "Address rejected"
    )
    expect(plainAutomationFailure(null)).toBe(
      "The step stopped without explaining why."
    )
  })
})
