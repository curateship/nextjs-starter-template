import { describe, expect, it } from "vitest"

import { getViralErrorMessage, QUOTA_MESSAGE } from "@/lib/api/video/viral"

describe("what a failed search tells you", () => {
  it("words a used-up quota, with when it comes back", () => {
    expect(getViralErrorMessage(new Error("YOUTUBE_QUOTA"))).toBe(QUOTA_MESSAGE)
    expect(QUOTA_MESSAGE).toBe(
      "Today's 100 free YouTube searches are used up. They reset at midnight Pacific time."
    )
  })

  it("passes YouTube's own reason on word for word", () => {
    expect(
      getViralErrorMessage(
        new Error("YouTube said: API key not valid. Please pass a valid API key.")
      )
    ).toBe("YouTube said: API key not valid. Please pass a valid API key.")
  })

  it("still gives a reason for machine noise", () => {
    expect(getViralErrorMessage(new Error("ECONNRESET"))).toBe(
      "That did not work. Try again in a moment."
    )
  })
})
