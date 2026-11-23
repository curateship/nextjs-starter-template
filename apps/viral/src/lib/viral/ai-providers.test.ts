import { describe, expect, it } from "vitest"

import { isShowableProviderProblem, writerRefusalMessage } from "./ai-providers"

describe("writerRefusalMessage", () => {
  it("says an OpenAI account with no money left has no credit, not HTTP 429", () => {
    const body = '{"error":{"message":"...","type":"insufficient_quota","code":"credit_balance_exhausted"}}'
    const message = writerRefusalMessage("openai", 429, body, "The script")
    expect(message).toBe(
      "Your OpenAI account has no credit left. Add some at platform.openai.com → Billing, or pick another writer in Settings → AI writer."
    )
    expect(isShowableProviderProblem(message)).toBe(true)
  })

  it("says the same for Claude's low credit reply, which comes back as 400", () => {
    const body = '{"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API."}}'
    expect(writerRefusalMessage("anthropic", 400, body, "The script")).toMatch(/^Your Anthropic account has no credit left\./)
  })

  it("says to wait when the provider is only busy", () => {
    const message = writerRefusalMessage("anthropic", 529, '{"error":{"type":"overloaded_error"}}', "The script")
    expect(message).toBe("Anthropic is turning requests away right now. Wait a minute and try again.")
    expect(isShowableProviderProblem(message)).toBe(true)
    expect(writerRefusalMessage("openai", 429, '{"error":{"code":"rate_limit_exceeded"}}', "The script")).toMatch(/^OpenAI is turning/)
  })

  it("keeps the piece and the number for anything else, and never the reply itself", () => {
    const message = writerRefusalMessage("openai", 401, '{"error":{"message":"Incorrect API key provided: sk-abc"}}', "The hooks")
    expect(message).toBe("The hooks failed (HTTP 401)")
    expect(message).not.toMatch(/sk-/)
  })
})
