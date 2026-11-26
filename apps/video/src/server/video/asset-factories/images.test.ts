import { afterEach, describe, expect, it, vi } from "vitest"

import { generateImage } from "./images"

// What each call would have been billed, and the key.
const usage = vi.hoisted(() => ({ units: [] as (number | undefined)[] }))
vi.mock("@/server/ai/keys", () => ({ getAiKey: async () => "test-key" }))
vi.mock("@/server/ai/usage", () => ({
  runAiCall: async (_context: unknown, call: () => Promise<{ result: unknown; usage: { units?: number } }>) => {
    const done = await call()
    usage.units.push(done.usage.units)
    return done.result
  },
}))

/** What Google's request body asked for, and an answer holding one tiny JPEG. */
function fakeGoogle() {
  const bodies: { generationConfig: { imageConfig: Record<string, string> } }[] = []
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: { body: string }) => {
      bodies.push(JSON.parse(init.body))
      return Response.json({ candidates: [{ content: { parts: [{ inlineData: { data: "AQID", mimeType: "image/jpeg" } }] } }] })
    })
  )
  return bodies
}

afterEach(() => {
  vi.unstubAllGlobals()
  usage.units = []
})

describe("picture size", () => {
  it("asks Nano Banana 2 for 2K and counts it as one and a half 1K pictures", async () => {
    const bodies = fakeGoogle()
    await generateImage({ userId: "u", model: "gemini-3.1-flash-image", prompt: "a café", aspectRatio: "16:9", references: [], size: "2K" })
    expect(bodies[0].generationConfig.imageConfig).toEqual({ aspectRatio: "16:9", imageSize: "2K" })
    expect(usage.units).toEqual([1.5])
  })

  it("leaves the size out when none is asked for, and for Nano Banana, which makes 1K only", async () => {
    const bodies = fakeGoogle()
    await generateImage({ userId: "u", model: "gemini-3.1-flash-image", prompt: "a café", aspectRatio: "16:9", references: [] })
    await generateImage({ userId: "u", model: "gemini-2.5-flash-image", prompt: "a café", aspectRatio: "16:9", references: [], size: "2K" })
    expect(bodies.map((body) => body.generationConfig.imageConfig)).toEqual([{ aspectRatio: "16:9" }, { aspectRatio: "16:9" }])
    expect(usage.units).toEqual([1, 1])
  })
})
