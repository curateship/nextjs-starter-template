import { afterEach, describe, expect, it, vi } from "vitest"

import {
  generateBackgroundVideo,
  generateSoundscapeAudio,
  ProviderKeyMissingError,
} from "@/server/pomodoro/generation-providers"

/**
 * The only code in this app that talks to an outside service, checked against
 * a stubbed `fetch`. No key is needed and no request leaves the machine, which
 * is what makes these runnable anywhere — including on the two paths that only
 * happen when a provider misbehaves and would otherwise never be exercised.
 */

const key = vi.hoisted(() => ({ value: "test-key" as string | null }))
vi.mock("@/server/ai/keys", () => ({
  getAiKey: () => Promise.resolve(key.value),
}))

const VIDEO_URI =
  "https://generativelanguage.googleapis.com/v1beta/files/abc:download"

function reply(body: unknown, ok = true) {
  return {
    ok,
    json: () => Promise.resolve(body),
    arrayBuffer: () => Promise.resolve(new Uint8Array([1, 2, 3]).buffer),
  } as unknown as Response
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
  key.value = "test-key"
})

describe("generateSoundscapeAudio", () => {
  it("asks ElevenLabs for a looping mp3 and hands back the bytes", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(reply(null))

    const result = await generateSoundscapeAudio("rain on a tin roof")

    expect(result.kind).toBe("audio")
    expect(result.bytes.byteLength).toBe(3)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe("https://api.elevenlabs.io/v1/sound-generation")
    const body = JSON.parse(String((init as RequestInit).body))
    expect(body.text).toBe("rain on a tin roof")
    expect(body.loop).toBe(true)
  })

  it("refuses before calling anything when no key is set", async () => {
    key.value = null
    const fetchMock = vi.spyOn(globalThis, "fetch")

    await expect(generateSoundscapeAudio("anything")).rejects.toBeInstanceOf(
      ProviderKeyMissingError
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("does not pass the provider's own error text on", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      reply({ detail: "quota exceeded for model eleven_v2" }, false)
    )
    await expect(generateSoundscapeAudio("anything")).rejects.toThrow(
      "PROVIDER_REQUEST_FAILED"
    )
  })
})

describe("generateBackgroundVideo", () => {
  it("starts a render, polls until done, then downloads the file", async () => {
    vi.useFakeTimers()
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(reply({ name: "operations/123" }))
      .mockResolvedValueOnce(reply({ done: false }))
      .mockResolvedValueOnce(
        reply({ done: true, response: { videos: [{ uri: VIDEO_URI }] } })
      )
      .mockResolvedValueOnce(reply(null))

    const promise = generateBackgroundVideo("a quiet forest")
    await vi.advanceTimersByTimeAsync(30_000)
    const result = await promise

    expect(result.kind).toBe("video")
    expect(fetchMock).toHaveBeenCalledTimes(4)
    // The member's words reach the provider inside the framing that keeps the
    // result usable as scenery.
    const body = JSON.parse(
      String((fetchMock.mock.calls[0][1] as RequestInit).body)
    )
    expect(body.instances[0].prompt).toContain("a quiet forest")
    expect(body.instances[0].prompt).toContain("locked camera")
    expect(body.parameters.resolution).toBe("720p")
    // The download must not follow the reply somewhere else.
    expect((fetchMock.mock.calls[3][1] as RequestInit).redirect).toBe("error")
  })

  it("refuses a download address that is not the provider's own", async () => {
    vi.useFakeTimers()
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(reply({ name: "operations/123" }))
      .mockResolvedValueOnce(
        reply({
          done: true,
          response: { videos: [{ uri: "https://example.com/evil.mp4" }] },
        })
      )

    const promise = generateBackgroundVideo("a quiet forest")
    const settled = expect(promise).rejects.toThrow("PROVIDER_INVALID_RESPONSE")
    await vi.advanceTimersByTimeAsync(20_000)
    await settled
  })

  it("reports a render the provider gave up on", async () => {
    vi.useFakeTimers()
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(reply({ name: "operations/123" }))
      .mockResolvedValueOnce(reply({ error: { code: 400 } }))

    const promise = generateBackgroundVideo("a quiet forest")
    const settled = expect(promise).rejects.toThrow(
      "PROVIDER_GENERATION_FAILED"
    )
    await vi.advanceTimersByTimeAsync(20_000)
    await settled
  })

  it("refuses before calling anything when no key is set", async () => {
    key.value = null
    const fetchMock = vi.spyOn(globalThis, "fetch")
    await expect(generateBackgroundVideo("anything")).rejects.toBeInstanceOf(
      ProviderKeyMissingError
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
