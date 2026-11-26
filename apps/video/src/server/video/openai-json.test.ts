import { afterEach, describe, expect, it, vi } from "vitest"
import { z } from "zod"

import { getAiToolErrorMessage } from "@/lib/api/video/ai-tools"
import { OPENAI_NO_CREDIT_MESSAGE } from "@/lib/video/ai-providers"

import { askOpenAiJson } from "./openai-json"

const ask = () =>
  askOpenAiJson({ apiKey: "test-key", model: "gpt-5-mini", prompt: "Hi", schema: z.object({ ok: z.boolean() }), label: "Prompt idea" })

afterEach(() => vi.unstubAllGlobals())

describe("OpenAI turning a call away", () => {
  it("says the key is out of credit, in words the page shows", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          { error: { message: "You have no credits remaining.", type: "insufficient_quota", code: "credit_balance_exhausted" } },
          { status: 429 }
        )
      )
    )
    const error = await ask().catch((caught: unknown) => caught)
    expect(error).toEqual(new Error(OPENAI_NO_CREDIT_MESSAGE))
    expect(getAiToolErrorMessage(error)).toBe(OPENAI_NO_CREDIT_MESSAGE)
  })

  it("keeps the number for any other refusal", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: { type: "rate_limit_exceeded" } }, { status: 429 })))
    await expect(ask()).rejects.toThrow("Prompt idea failed (HTTP 429)")
  })
})
