import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { GEMINI_KEY_MISSING_MESSAGE } from "@/lib/video/ai-providers"

const keys = vi.hoisted(() => ({
  gemini: "gemini-key" as string | null,
  openai: null as string | null,
}))
const defaults = vi.hoisted(() => ({ writer: undefined as string | undefined }))
const metered = vi.hoisted(() => [] as { provider: string; feature: string }[])

vi.mock("@/server/ai/keys", () => ({
  getAiKey: async (provider: "gemini" | "openai") => keys[provider],
}))
vi.mock("@/server/video/settings", () => ({
  getAiDefaults: async () => ({ writer: defaults.writer }),
}))
vi.mock("@/server/ai/usage", () => ({
  runAiCall: async (
    context: { provider: string; feature: string },
    call: () => Promise<{ result: unknown }>
  ) => {
    metered.push({ provider: context.provider, feature: context.feature })
    return (await call()).result
  },
}))

import { translateLines } from "@/server/video/translate"

function geminiAnswer(lines: string[]) {
  return new Response(
    JSON.stringify({
      candidates: [
        { content: { parts: [{ text: JSON.stringify({ lines }) }] } },
      ],
      usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 20 },
    }),
    { status: 200 }
  )
}

function openAiAnswer(lines: string[]) {
  return new Response(
    JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ lines }) } }],
      usage: { prompt_tokens: 10, completion_tokens: 20 },
    }),
    { status: 200 }
  )
}

const fetchMock = vi.fn<typeof fetch>()

beforeEach(() => {
  keys.gemini = "gemini-key"
  keys.openai = null
  defaults.writer = undefined
  metered.length = 0
  fetchMock.mockReset()
  vi.stubGlobal("fetch", fetchMock)
  vi.spyOn(console, "error").mockImplementation(() => undefined)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("translating caption lines", () => {
  it("hands back one tidied line for each line sent, on its own meter", async () => {
    fetchMock.mockResolvedValueOnce(geminiAnswer(['"Hola"', "  a   todos "]))

    const lines = await translateLines({
      userId: "user-1",
      language: "Spanish",
      lines: ["Hello", "everyone"],
    })

    expect(lines).toEqual(["Hola", "a todos"])
    expect(metered).toEqual([{ provider: "gemini", feature: "translation" }])
    const body = String(fetchMock.mock.calls[0][1]?.body)
    expect(body).toContain("into Spanish")
    expect(body).toContain("exactly 2 lines")
  })

  it("asks again when the count is wrong, then gives up with a reason", async () => {
    fetchMock.mockImplementation(async () => geminiAnswer(["Hola a todos"]))

    await expect(
      translateLines({
        userId: "user-1",
        language: "Spanish",
        lines: ["Hello", "everyone"],
      })
    ).rejects.toThrow("Translation came back in an unexpected shape")
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("uses OpenAI when that is the chosen writer", async () => {
    keys.openai = "openai-key"
    defaults.writer = "openai"
    fetchMock.mockResolvedValueOnce(openAiAnswer(["Bonjour"]))

    const lines = await translateLines({
      userId: "user-1",
      language: "French",
      lines: ["Hello"],
    })

    expect(lines).toEqual(["Bonjour"])
    expect(metered).toEqual([{ provider: "openai", feature: "translation" }])
    expect(String(fetchMock.mock.calls[0][0])).toContain("api.openai.com")
  })

  it("names the missing key when there is nobody to translate", async () => {
    keys.gemini = null

    await expect(
      translateLines({ userId: "user-1", language: "German", lines: ["Hi"] })
    ).rejects.toThrow(GEMINI_KEY_MISSING_MESSAGE)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
