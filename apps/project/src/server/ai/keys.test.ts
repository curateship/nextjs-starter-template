import { describe, expect, it } from "vitest"

import { providerReason } from "@/server/ai/keys"

const answer = (body: unknown) =>
  new Response(typeof body === "string" ? body : JSON.stringify(body))

// The three answers the key test got back on 8 Oct 2026, trimmed.
describe("providerReason", () => {
  it("reads Anthropic's and Gemini's error.message", async () => {
    expect(
      await providerReason(
        answer({
          type: "error",
          error: { message: "Your credit balance is too low." },
        }),
        "test-key-a"
      )
    ).toBe("Your credit balance is too low.")
    expect(
      await providerReason(
        answer({ error: { code: 404, message: "No longer available." } }),
        "test-key-c"
      )
    ).toBe("No longer available.")
  })

  it("reads ElevenLabs' detail.message", async () => {
    expect(
      await providerReason(
        answer({ detail: { message: "Missing the permission user_read." } }),
        "test-key-b"
      )
    ).toBe("Missing the permission user_read.")
  })

  it("never repeats the key, and gives null for a body that is not JSON", async () => {
    expect(
      await providerReason(
        answer({ error: { message: "Bad key fake-key-123 sent" } }),
        "fake-key-123"
      )
    ).toBe("Bad key •••• sent")
    expect(await providerReason(answer("<html>502</html>"), "k")).toBeNull()
  })
})
