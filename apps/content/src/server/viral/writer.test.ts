import { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { z } from "zod"

import { ANTHROPIC_KEY_MISSING_MESSAGE, GEMINI_KEY_MISSING_MESSAGE } from "@/lib/viral/ai-providers"
import { type CustomShellDb } from "@/server/db"
import { customShellAiUsageEvents, type CustomShellUser } from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"
import { askWriter } from "@/server/viral/writer"
import { chosenWriter, getSavedWriter, saveWriter } from "@/server/viral/writer-choice"

/**
 * Pick the writer (more-features task part 9): every words call goes to the
 * writer picked on Settings → AI writer and lands on the meter under its
 * provider and model, with the feature's own name. The three providers are
 * stubbed; nothing leaves the machine. Keys come from the shell's env
 * fallback (`getAiKey`), so no key is saved.
 */

const KEY_ENV = {
  gemini: "CUSTOM_SHELL_GEMINI_API_KEY",
  openai: "CUSTOM_SHELL_OPENAI_API_KEY",
  anthropic: "CUSTOM_SHELL_ANTHROPIC_API_KEY",
} as const

let client: PGlite
let database: CustomShellDb
let user: CustomShellUser
let asked: string[]

/** One stand-in for all three providers, each answering in its own shape. */
function stubProviders(answer: unknown) {
  asked = []
  const text = JSON.stringify(answer)
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request) => {
      const url = String(input instanceof Request ? input.url : input)
      asked.push(url)
      if (url.startsWith("https://api.anthropic.com/")) {
        return Response.json({ content: [{ type: "text", text }], stop_reason: "end_turn", usage: { input_tokens: 300, output_tokens: 100 } })
      }
      if (url.startsWith("https://api.openai.com/")) {
        return Response.json({ choices: [{ message: { content: text } }], usage: { prompt_tokens: 300, completion_tokens: 100 } })
      }
      if (url.startsWith("https://generativelanguage.googleapis.com/")) {
        return Response.json({ candidates: [{ content: { parts: [{ text }] } }], usageMetadata: { promptTokenCount: 300, candidatesTokenCount: 100 } })
      }
      throw new Error(`Nothing should ask ${url}`)
    })
  )
}

function ask(writer?: "gemini") {
  return askWriter({
    userId: user.id,
    feature: "viral_script",
    metadata: { savedVideoId: "v1" },
    prompt: 'Answer with JSON only: { "line": "..." }',
    schema: z.object({ line: z.string() }),
    label: "The script",
    writer,
  })
}

async function meterRows() {
  return database
    .select({ provider: customShellAiUsageEvents.provider, model: customShellAiUsageEvents.model, feature: customShellAiUsageEvents.feature, status: customShellAiUsageEvents.status })
    .from(customShellAiUsageEvents)
}

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  user = await insertUser(database)
  for (const name of Object.values(KEY_ENV)) vi.stubEnv(name, "test-key")
  stubProviders({ line: "Stop cooking every night." })
})

afterEach(async () => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  await client.close()
})

describe("the writer picked in Settings", () => {
  it("is Gemini Flash with nothing picked", async () => {
    expect(await getSavedWriter()).toBeNull()
    expect(await ask()).toEqual({ line: "Stop cooking every night." })
    expect(asked[0]).toContain("generativelanguage.googleapis.com")
    expect(await meterRows()).toEqual([{ provider: "gemini", model: "gemini-3.8-flash", feature: "viral_script", status: "success" }])
  })

  it("writes with GPT-5 mini once it is picked", async () => {
    await saveWriter("openai")
    expect(await ask()).toEqual({ line: "Stop cooking every night." })
    expect(asked).toEqual(["https://api.openai.com/v1/chat/completions"])
    expect(await meterRows()).toEqual([{ provider: "openai", model: "gpt-5-mini", feature: "viral_script", status: "success" }])
  })

  it("writes with Claude Opus 5 once it is picked, on the meter under Claude", async () => {
    await saveWriter("anthropic")
    expect(await ask()).toEqual({ line: "Stop cooking every night." })
    expect(asked).toEqual(["https://api.anthropic.com/v1/messages"])
    expect(await meterRows()).toEqual([{ provider: "anthropic", model: "claude-opus-5", feature: "viral_script", status: "success" }])
  })

  it("keeps the topic match on Gemini Flash whoever is picked", async () => {
    await saveWriter("anthropic")
    await ask("gemini")
    expect((await meterRows())[0]).toMatchObject({ provider: "gemini", model: "gemini-3.8-flash" })
  })
})

describe("a missing key", () => {
  it("passes a picked writer whose key is gone for the first with a key, and keeps the pick", async () => {
    await saveWriter("anthropic")
    vi.stubEnv(KEY_ENV.anthropic, "")
    expect((await chosenWriter())?.id).toBe("gemini")
    await ask()
    expect((await meterRows())[0]).toMatchObject({ provider: "gemini" })
    expect(await getSavedWriter()).toBe("anthropic")
  })

  it("asks for the Gemini key when no writer has one", async () => {
    for (const name of Object.values(KEY_ENV)) vi.stubEnv(name, "")
    expect(await chosenWriter()).toBeNull()
    await expect(ask()).rejects.toThrow(GEMINI_KEY_MISSING_MESSAGE)
    expect(asked).toEqual([])
  })

  it("names Anthropic when a call must go to Claude and its key is gone between the pick and the call", async () => {
    // The pick is read with the key there; the key is gone by the time the call asks for it.
    await saveWriter("anthropic")
    const keys = await import("@/server/ai/keys")
    const real = keys.getAiKey
    const spy = vi.spyOn(keys, "getAiKey")
    let reads = 0
    spy.mockImplementation(async (provider) => (provider === "anthropic" && ++reads > 1 ? null : real(provider)))
    await expect(ask()).rejects.toThrow(ANTHROPIC_KEY_MISSING_MESSAGE)
    spy.mockRestore()
  })

  it.each(["gemini", "openai", "anthropic"] as const)(
    "says the piece took too long when %s never answers, instead of spinning",
    async (writer) => {
      // Measured 6 Nov 2026: Google held a busy Write a script for about 3 minutes.
      vi.stubGlobal(
        "fetch",
        vi.fn(
          (_input: unknown, init?: RequestInit) =>
            new Promise<Response>((_resolve, reject) => {
              init?.signal?.addEventListener("abort", () => reject(init.signal?.reason))
            })
        )
      )
      await saveWriter(writer)
      await expect(
        askWriter({
          userId: user.id,
          feature: "viral_script",
          metadata: {},
          prompt: 'Answer with JSON only: { "line": "..." }',
          schema: z.object({ line: z.string() }),
          label: "The script",
          timeoutMs: 50,
        })
      ).rejects.toThrow("The script took too long")
      expect((await meterRows())[0]).toMatchObject({ provider: writer, status: "failed" })
    }
  )
})
