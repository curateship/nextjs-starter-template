import { describe, expect, it } from "vitest"

import { getAiToolErrorMessage } from "@/lib/api/video/ai-tools"
import { AI_TOO_BUSY_MESSAGE } from "@/lib/video/ai-providers"
import { CAPTIONS_NONE_HEARD_MESSAGE } from "@/lib/video/captions"
import { JUMP_CUT_BUSY_MESSAGE } from "@/lib/video/jump-cuts"

/**
 * A toast that will not say why is worse than no toast: it leaves somebody
 * pressing a button with no idea whether pressing it again is worth anything.
 */
describe("what a failed tool tells you", () => {
  it("says the app's own reasons word for word", () => {
    for (const reason of [
      CAPTIONS_NONE_HEARD_MESSAGE,
      JUMP_CUT_BUSY_MESSAGE,
      AI_TOO_BUSY_MESSAGE,
    ]) {
      expect(getAiToolErrorMessage(new Error(reason))).toBe(reason)
    }
  })

  it("passes on a provider's own complaint, with the feature named", () => {
    expect(getAiToolErrorMessage(new Error("Captions failed (HTTP 503)"))).toBe(
      "Captions failed (HTTP 503)"
    )
  })

  it("still gives a reason for something it has never seen", () => {
    expect(getAiToolErrorMessage(new Error("Stored file has no content"))).toBe(
      "That did not work — stored file has no content"
    )
  })

  it("keeps machine noise out of it, but still says something", () => {
    const quiet = "That did not work. Try again in a moment."
    expect(getAiToolErrorMessage(new Error("ECONNRESET"))).toBe(quiet)
    expect(
      getAiToolErrorMessage(new Error("fetch failed https://example.com/a/b"))
    ).toBe(quiet)
    expect(getAiToolErrorMessage(new Error(""))).toBe(quiet)
    expect(getAiToolErrorMessage("not even an error")).toBe(quiet)
  })
})
