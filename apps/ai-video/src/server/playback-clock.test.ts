import assert from "node:assert/strict"
import { afterEach, beforeEach, describe, it } from "node:test"

import { PlaybackClock } from "../pages/video-editor/playback-clock.ts"

describe("PlaybackClock scrubbing", () => {
  let callbacks: Map<number, FrameRequestCallback>
  let nextId: number
  let originalRequestAnimationFrame: typeof requestAnimationFrame
  let originalCancelAnimationFrame: typeof cancelAnimationFrame

  beforeEach(() => {
    callbacks = new Map()
    nextId = 0
    originalRequestAnimationFrame = globalThis.requestAnimationFrame
    originalCancelAnimationFrame = globalThis.cancelAnimationFrame
    globalThis.requestAnimationFrame = (callback) => {
      const id = ++nextId
      callbacks.set(id, callback)
      return id
    }
    globalThis.cancelAnimationFrame = (id) => {
      callbacks.delete(id)
    }
  })

  afterEach(() => {
    globalThis.requestAnimationFrame = originalRequestAnimationFrame
    globalThis.cancelAnimationFrame = originalCancelAnimationFrame
  })

  function flushFrame(now = performance.now()) {
    const frameCallbacks = [...callbacks.values()]
    callbacks.clear()
    for (const callback of frameCallbacks) callback(now)
  }

  it("coalesces pointer updates and restores playback with a precise release", () => {
    const clock = new PlaybackClock()
    clock.setDuration(10_000)
    clock.play()
    const updates: Array<{
      timeMs: number
      playing: boolean
      seekMode: string | null
    }> = []
    clock.subscribe(() => {
      updates.push({
        timeMs: clock.getTime(),
        playing: clock.playing,
        seekMode: clock.seekMode,
      })
    })

    clock.beginScrub(1_000)
    clock.updateScrub(2_000)
    clock.updateScrub(3_000)

    assert.equal(updates.length, 0)
    flushFrame()
    assert.deepEqual(updates, [
      { timeMs: 3_000, playing: false, seekMode: "fast" },
    ])

    clock.updateScrub(4_000)
    clock.endScrub(4_250)
    assert.deepEqual(updates.at(-1), {
      timeMs: 4_250,
      playing: true,
      seekMode: "precise",
    })
    assert.equal(updates.length, 2)
  })

  it("stays paused and clamps pending input when the duration shrinks", () => {
    const clock = new PlaybackClock()
    clock.setDuration(5_000)
    let updateCount = 0
    clock.subscribe(() => updateCount++)

    clock.beginScrub(2_000)
    clock.updateScrub(4_000)
    clock.setDuration(3_000)
    flushFrame()

    assert.equal(clock.getTime(), 3_000)
    clock.endScrub()

    assert.equal(clock.getTime(), 3_000)
    assert.equal(clock.playing, false)
    assert.equal(clock.scrubbing, false)
    assert.equal(clock.seekMode, "precise")
    assert.equal(updateCount, 2)
  })
})
