import { afterEach, describe, expect, it, vi } from "vitest"
import { z } from "zod"

import { generateJson } from "@/server/note/gemini"

/**
 * An answer in the wrong shape is asked for once more. Google charged for
 * both, so both answers' tokens go on the meter, not only the one that was
 * used.
 */

afterEach(() => {
  vi.unstubAllGlobals()
})

function answer(text: string, inputTokens: number, outputTokens: number) {
  return new Response(
    JSON.stringify({
      candidates: [{ content: { parts: [{ text }] } }],
      usageMetadata: { promptTokenCount: inputTokens, candidatesTokenCount: outputTokens },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  )
}

describe("asking Gemini again after an unusable answer", () => {
  it("counts the tokens of both answers", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(answer('{"wrong": true}', 100, 10))
      .mockResolvedValueOnce(answer('{"words": ["hello"]}', 200, 20))
    vi.stubGlobal("fetch", fetchMock)

    const result = await generateJson({
      apiKey: "test-key",
      model: "gemini-3.8-flash",
      parts: [{ text: "Say hello" }],
      schema: z.object({ words: z.array(z.string()) }),
      label: "Saying hello",
    })

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(result).toEqual({ value: { words: ["hello"] }, inputTokens: 300, outputTokens: 30 })
  })

  it("gives up after the second unusable answer, naming the step", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async () => answer("not json at all", 50, 5))
    )
    await expect(
      generateJson({
        apiKey: "test-key",
        model: "gemini-3.8-flash",
        parts: [{ text: "Say hello" }],
        schema: z.object({ words: z.array(z.string()) }),
        label: "Saying hello",
      })
    ).rejects.toThrow("Saying hello came back as something other than an answer")
  })
})
