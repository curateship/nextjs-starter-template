import { afterEach, describe, expect, it, vi } from "vitest"
import { z } from "zod"

import { AI_TOO_BUSY_MESSAGE } from "@/lib/video/ai-providers"
import { generateJson } from "@/server/video/gemini"

const HIGH_DEMAND = {
  error: { code: 503, message: "This model is currently experiencing high demand. Spikes in demand are usually temporary." },
}
const ANSWER = { candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }] }

function answers(...replies: { status: number; body: unknown }[]) {
  const fetchFn = vi.fn(async () => {
    const reply = replies.shift()!
    return new Response(JSON.stringify(reply.body), { status: reply.status })
  })
  vi.stubGlobal("fetch", fetchFn)
  return fetchFn
}

function ask() {
  return generateJson({
    apiKey: "key",
    model: "gemini-3.8-flash",
    parts: [{ text: "hi" }],
    schema: z.object({ ok: z.boolean() }),
    label: "The breakdown",
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe("Google being busy", () => {
  it("waits out a high-demand answer and takes the next one", async () => {
    vi.useFakeTimers()
    const fetchFn = answers({ status: 503, body: HIGH_DEMAND }, { status: 200, body: ANSWER })
    const asked = ask()
    await vi.advanceTimersByTimeAsync(5_000)
    await expect(asked).resolves.toMatchObject({ value: { ok: true } })
    expect(fetchFn).toHaveBeenCalledTimes(2)
  })

  it("says Google is busy, in words, when the high demand outlasts every wait", async () => {
    vi.useFakeTimers()
    answers(
      { status: 503, body: HIGH_DEMAND },
      { status: 503, body: HIGH_DEMAND },
      { status: 503, body: HIGH_DEMAND }
    )
    const asked = ask()
    const settled = expect(asked).rejects.toThrow(AI_TOO_BUSY_MESSAGE)
    await vi.advanceTimersByTimeAsync(30_000)
    await settled
  })

  it("does not wait on a model that no longer exists", async () => {
    const fetchFn = answers({
      status: 404,
      body: { error: { code: 404, message: "This model models/gemini-2.5-flash is no longer available to new users." } },
    })
    await expect(ask()).rejects.toThrow("The breakdown failed (HTTP 404)")
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })
})
