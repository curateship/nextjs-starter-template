import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  formatClock,
  loadMediaDurationMs,
  MEDIA_DURATION_TIMEOUT_MS,
  MediaDurationError,
  MIN_PX_PER_SECOND,
  msToPx,
  rulerLabel,
  rulerLabelStep,
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

describe("a whole hour on the timeline", () => {
  it("fits an hour, and even sixteen, in 1,200 pixels fully zoomed out", () => {
    expect(msToPx(60 * 60_000, MIN_PX_PER_SECOND)).toBe(72)
    expect(msToPx(16 * 60 * 60_000, MIN_PX_PER_SECOND)).toBeLessThanOrEqual(1200)
  })

  it("spaces the ruler's labels at least 54 pixels apart at every zoom", () => {
    for (const pps of [MIN_PX_PER_SECOND, 0.33, 1, 5, 18, 30, 60, 90]) {
      const step = rulerLabelStep(pps)
      expect(step * pps).toBeGreaterThanOrEqual(54)
    }
    // Where the ruler was already readable it keeps the labels it had.
    expect(rulerLabelStep(60)).toBe(1)
    expect(rulerLabelStep(40)).toBe(2)
    expect(rulerLabelStep(18)).toBe(3)
    // An hour on 1,200 pixels is labelled every five minutes.
    expect(rulerLabelStep(1200 / 3600)).toBe(300)
  })

  it("writes long times as a clock", () => {
    expect(rulerLabel(45)).toBe("45s")
    expect(rulerLabel(600)).toBe("10:00")
    expect(rulerLabel(3900)).toBe("1:05:00")
  })
})

describe("formatClock", () => {
  it("rounds to the nearest second, so one length reads the same everywhere", () => {
    expect(formatClock(33_700)).toBe("0:34")
    expect(formatClock(33_400)).toBe("0:33")
  })

  it("never prints 60 seconds", () => {
    expect(formatClock(59_996)).toBe("1:00")
  })

  it("adds hours once there are any", () => {
    expect(formatClock(3_599_600)).toBe("1:00:00")
    expect(formatClock(3_599_400)).toBe("59:59")
  })
})
