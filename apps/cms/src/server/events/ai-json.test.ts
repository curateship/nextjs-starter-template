import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const meter = vi.hoisted(() => ({
  recorded: [] as { inputTokens: number; outputTokens: number }[],
  limitReached: false,
}))

vi.mock("@/server/ai/keys", () => ({
  getAiKey: vi.fn(async () => "test-key"),
}))

vi.mock("@/server/ai/usage", () => ({
  isAiLimitError: (error: unknown) =>
    error instanceof Error && error.message.includes("AI_LIMIT_REACHED"),
  // The real meter's shape: a thrown call records nothing it was told about,
  // a returned one records the usage it came back with.
  runAiCall: vi.fn(
    async (
      _context: unknown,
      call: () => Promise<{
        result: unknown
        usage: { inputTokens: number; outputTokens: number }
      }>
    ) => {
      if (meter.limitReached) throw new Error("AI_LIMIT_REACHED")
      const { result, usage } = await call()
      meter.recorded.push(usage)
      return result
    }
  ),
}))

import { getAiKey } from "@/server/ai/keys"
import { askAiForJson } from "@/server/events/ai-json"

/** The AI call behind the Draft events step, with the provider faked. */

const question = {
  provider: "anthropic" as const,
  model: "claude-opus-5",
  system: "system",
  prompt: "prompt",
  userId: "user-1",
  feature: "draft-events",
}

function claudeAnswers(body: Record<string, unknown>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(body), { status: 200 }))
  )
}

beforeEach(() => {
  meter.recorded = []
  meter.limitReached = false
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("askAiForJson", () => {
  it("returns the JSON the AI wrote and records its tokens", async () => {
    claudeAnswers({
      content: [{ type: "text", text: '```json\n{"events": []}\n```' }],
      stop_reason: "end_turn",
      usage: { input_tokens: 900, output_tokens: 12 },
    })

    expect(await askAiForJson(question)).toEqual({ events: [] })
    expect(meter.recorded).toEqual([{ inputTokens: 900, outputTokens: 12 }])
  })

  it("records the tokens of an answer that was cut off, then says why it stopped", async () => {
    claudeAnswers({
      content: [{ type: "text", text: '{"events": [{"title": "Hal' }],
      stop_reason: "max_tokens",
      usage: { input_tokens: 900, output_tokens: 16000 },
    })

    await expect(askAiForJson(question)).rejects.toThrow(
      "Anthropic's answer was cut off because the page lists too many events."
    )
    expect(meter.recorded).toEqual([{ inputTokens: 900, outputTokens: 16000 }])
  })

  it("says in words when the flow's author has no AI allowance left", async () => {
    meter.limitReached = true
    await expect(askAiForJson(question)).rejects.toThrow(
      "The person who made this flow has used this month's AI allowance, so the page was not read."
    )
  })

  it("names the provider when no key is saved", async () => {
    vi.mocked(getAiKey).mockResolvedValueOnce(null)
    await expect(askAiForJson(question)).rejects.toThrow(
      "No Anthropic key is saved, so the AI could not read the page. Add one in Settings → AI."
    )
  })

  it("says a turned-down key is the problem", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 401 }))
    )
    await expect(askAiForJson(question)).rejects.toThrow(
      "Anthropic turned down the saved key. Check it in Settings → AI."
    )
  })
})
