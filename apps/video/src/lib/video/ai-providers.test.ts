import { describe, expect, it } from "vitest"

import {
  AI_TOO_BUSY_MESSAGE,
  isShowableProviderProblem,
} from "./ai-providers"

describe("which provider trouble is worth showing", () => {
  it("shows the ones that say what went wrong and which feature it was", () => {
    expect(isShowableProviderProblem("Captions came back empty")).toBe(true)
    expect(
      isShowableProviderProblem("Filler words came back in an unexpected shape")
    ).toBe(true)
    expect(isShowableProviderProblem("Captions failed (HTTP 503)")).toBe(true)
    expect(isShowableProviderProblem("Captions took too long")).toBe(true)
    expect(isShowableProviderProblem(AI_TOO_BUSY_MESSAGE)).toBe(true)
  })

  it("keeps anything that would mean nothing to a person out of the way", () => {
    expect(isShowableProviderProblem("ECONNRESET")).toBe(false)
    expect(
      isShowableProviderProblem("connect ETIMEDOUT 142.250.0.1:443")
    ).toBe(false)
    expect(isShowableProviderProblem("")).toBe(false)
  })
})
