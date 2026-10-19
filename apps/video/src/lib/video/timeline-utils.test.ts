import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  loadMediaDurationMs,
  MEDIA_DURATION_TIMEOUT_MS,
  MediaDurationError,
} from "./timeline-utils"

/**
 * A stand-in for the browser's <video>: it records what the loader asks of it
 * and fires its events only when a test says so, the way a slow network does.
 */
function fakePlayer() {
  return {
    preload: "",
    src: "",
    duration: Number.NaN,
    onloadedmetadata: null as null | (() => void),
    onerror: null as null | (() => void),
    removeAttribute: vi.fn(function (this: { src: string }, name: string) {
      if (name === "src") this.src = ""
    }),
    load: vi.fn(),
  }
}

let player: ReturnType<typeof fakePlayer>

beforeEach(() => {
  vi.useFakeTimers()
  player = fakePlayer()
  vi.stubGlobal("document", { createElement: () => player })
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe("reading how long a dropped file runs", () => {
  it("answers with the file's length and lets go of it", async () => {
    const length = loadMediaDurationMs("https://media.test/take.mp4", "video")
    expect(player.preload).toBe("metadata")
    expect(player.src).toBe("https://media.test/take.mp4")
    player.duration = 12.345
    player.onloadedmetadata?.()
    await expect(length).resolves.toBe(12_345)
    expect(player.removeAttribute).toHaveBeenCalledWith("src")
    expect(player.load).toHaveBeenCalled()
  })

  it("gives up with a message when the browser never answers", async () => {
    const length = loadMediaDurationMs("https://media.test/take.mp4", "video")
    const settled = length.catch((error: unknown) => error)
    await vi.advanceTimersByTimeAsync(MEDIA_DURATION_TIMEOUT_MS - 1)
    let done = false
    void settled.then(() => (done = true))
    await Promise.resolve()
    expect(done).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    const error = await settled
    expect(error).toBeInstanceOf(MediaDurationError)
    expect((error as Error).message).toBe(
      "This video took more than 30 seconds to open, so it was not added. Try again."
    )
    expect(player.removeAttribute).toHaveBeenCalledWith("src")
  })

  it("says so plainly when the file cannot be opened", async () => {
    const length = loadMediaDurationMs("https://media.test/song.mp3", "audio")
    player.onerror?.()
    await expect(length).rejects.toThrow(
      "This sound file could not be opened, so it was not added."
    )
    // The timer is gone, so nothing fires later.
    expect(vi.getTimerCount()).toBe(0)
  })
})
