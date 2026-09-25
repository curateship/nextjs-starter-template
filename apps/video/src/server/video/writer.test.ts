import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { z } from "zod"

const keys = vi.hoisted(() => ({
  gemini: "gemini-key" as string | null,
  openai: null as string | null,
  anthropic: "anthropic-key" as string | null,
}))
const defaults = vi.hoisted(() => ({ writer: undefined as string | undefined }))
const metered = vi.hoisted(
  () =>
    [] as {
      provider: string
      model: string
      feature: string
      usage: unknown
    }[]
)

vi.mock("@/server/ai/keys", () => ({
  getAiKey: async (provider: keyof typeof keys) => keys[provider] ?? null,
}))
vi.mock("@/server/video/settings", () => ({
  getAiDefaults: async () => ({ writer: defaults.writer }),
}))
vi.mock("@/server/ai/usage", () => ({
  runAiCall: async (
    context: { provider: string; model: string; feature: string },
    call: () => Promise<{ result: unknown; usage: unknown }>
  ) => {
    const { result, usage } = await call()
    metered.push({
      provider: context.provider,
      model: context.model,
      feature: context.feature,
      usage,
    })
    return result
  },
}))

import { askWriter } from "@/server/video/writer"

const schema = z.object({ text: z.string() })

function ask() {
  return askWriter({
    userId: "user-1",
    feature: "hook_variants",
    metadata: {},
    prompt: "Rewrite this",
    schema,
    label: "Hook",
  })
}

function claudeAnswer(text: string, stopReason = "end_turn") {
  return new Response(
    JSON.stringify({
      content: [
        { type: "thinking", thinking: "" },
        { type: "text", text },
      ],
      stop_reason: stopReason,
      usage: { input_tokens: 120, output_tokens: 40 },
    }),
    { status: 200 }
  )
}

function geminiAnswer(text: string) {
  return new Response(
    JSON.stringify({
      candidates: [
        { content: { parts: [{ text: JSON.stringify({ text }) }] } },
      ],
      usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 20 },
    }),
    { status: 200 }
  )
}

const fetchMock = vi.fn<typeof fetch>()

beforeEach(() => {
  keys.gemini = "gemini-key"
  keys.openai = null
  keys.anthropic = "anthropic-key"
  defaults.writer = "anthropic"
  metered.length = 0
  fetchMock.mockReset()
  vi.stubGlobal("fetch", fetchMock)
  vi.spyOn(console, "error").mockImplementation(() => undefined)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("Claude as the writer", () => {
  it("asks Claude with the saved key and meters the tokens it used", async () => {
    fetchMock.mockResolvedValueOnce(claudeAnswer('{"text":"Stop scrolling."}'))

    await expect(ask()).resolves.toEqual({ text: "Stop scrolling." })

    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toBe("https://api.anthropic.com/v1/messages")
    const headers = init?.headers as Record<string, string>
    expect(headers["x-api-key"]).toBe("anthropic-key")
    expect(headers["anthropic-version"]).toBe("2023-06-01")
    expect(JSON.parse(String(init?.body)).model).toBe("claude-opus-5")
    expect(metered).toEqual([
      {
        provider: "anthropic",
        model: "claude-opus-5",
        feature: "hook_variants",
        usage: { inputTokens: 120, outputTokens: 40 },
      },
    ])
  })

  it("reads an answer wrapped in a code block", async () => {
    fetchMock.mockResolvedValueOnce(
      claudeAnswer('```json\n{"text":"Wait for it."}\n```')
    )
    await expect(ask()).resolves.toEqual({ text: "Wait for it." })
  })

  it("says so plainly when Claude declines", async () => {
    fetchMock.mockResolvedValueOnce(claudeAnswer("", "refusal"))
    await expect(ask()).rejects.toThrow("Hook came back empty")
  })

  it("names the feature and the status when the request fails", async () => {
    fetchMock.mockResolvedValueOnce(new Response("nope", { status: 529 }))
    await expect(ask()).rejects.toThrow("Hook failed (HTTP 529)")
  })

  it("falls back to Gemini once the Anthropic key is removed", async () => {
    keys.anthropic = null
    fetchMock.mockResolvedValueOnce(geminiAnswer("Here is why."))

    await expect(ask()).resolves.toEqual({ text: "Here is why." })
    expect(String(fetchMock.mock.calls[0][0])).toContain(
      "generativelanguage.googleapis.com"
    )
    expect(metered[0]).toMatchObject({
      provider: "gemini",
      feature: "hook_variants",
    })
  })
})
