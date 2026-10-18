import { describe, expect, it } from "vitest"

import { getViralErrorMessage } from "@/lib/api/video/viral"
import { YOUTUBE_QUOTA_MESSAGE } from "@/lib/video/viral"

describe("what a failed search tells you", () => {
  it("words a used-up quota, with when it comes back", () => {
    expect(getViralErrorMessage(new Error("YOUTUBE_QUOTA"))).toBe(
      "Today's free YouTube allowance is used up. It resets at midnight Pacific time."
    )
    expect(YOUTUBE_QUOTA_MESSAGE).toBe(
      "Today's free YouTube allowance is used up. It resets at midnight Pacific time."
    )
  })

  it("passes YouTube's own reason on word for word", () => {
    expect(
      getViralErrorMessage(
        new Error("YouTube said: API key not valid. Please pass a valid API key.")
      )
    ).toBe("YouTube said: API key not valid. Please pass a valid API key.")
  })

  it("shows a sentence the server already wrote, without its marker", () => {
    expect(
      getViralErrorMessage(new Error("VIRAL_SAYS: Add a keyword first."))
    ).toBe("Add a keyword first.")
  })

  it("still gives a reason for machine noise", () => {
    expect(getViralErrorMessage(new Error("ECONNRESET"))).toBe(
      "That did not work. Try again in a moment."
    )
  })
})
