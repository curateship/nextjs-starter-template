import { execFile } from "node:child_process"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { promisify } from "node:util"

import { describe, expect, it } from "vitest"

import {
  probeDurationSeconds,
  seamlessLoopPlan,
  transcodeUpload,
} from "@/server/pomodoro/media-transcode"

const run = promisify(execFile)

const hasFfmpeg = await run("ffmpeg", ["-version"]).then(
  () => true,
  () => false
)

describe("seamlessLoopPlan", () => {
  it("joins a sound over itself once, with a 2-second crossfade", () => {
    expect(seamlessLoopPlan(45)).toEqual({ fade: 2, copies: 1 })
  })

  it("makes a 30-second soundscape exactly two minutes from five copies", () => {
    const plan = seamlessLoopPlan(30, 120)
    expect(plan?.copies).toBe(5)
    expect(plan?.fade).toBeCloseTo(6)
    expect(plan && plan.copies * (30 - plan.fade)).toBeCloseTo(120)
  })

  it("leaves a sound already long enough as one copy", () => {
    expect(seamlessLoopPlan(150, 120)).toEqual({ fade: 2, copies: 1 })
  })

  it("keeps the fade under half the sound and runs a little long instead", () => {
    const short = seamlessLoopPlan(4, 0)
    expect(short).toEqual({ fade: 1, copies: 1 })
    const plan = seamlessLoopPlan(65, 120)
    expect(plan?.copies).toBe(2)
    expect(plan!.fade).toBeLessThanOrEqual(65 / 2)
  })

  it("does not loop a sound under 2 seconds", () => {
    expect(seamlessLoopPlan(1.5)).toBeNull()
  })
})

/**
 * The real FFmpeg on this machine. A sine cut at a length that is not a whole
 * number of its waves jumps where one copy meets the next; the crossfade must
 * leave no jump anywhere in the file.
 */
describe.skipIf(!hasFfmpeg)("transcodeUpload with a seamless loop", () => {
  async function tone(seconds: number) {
    const folder = await mkdtemp(path.join(tmpdir(), "pomodoro-tone-"))
    const file = path.join(folder, "tone.wav")
    try {
      await run("ffmpeg", [
        "-y",
        "-f",
        "lavfi",
        "-i",
        `sine=frequency=440:sample_rate=44100:duration=${seconds}`,
        file,
      ])
      return new Uint8Array(await readFile(file))
    } finally {
      await rm(folder, { recursive: true, force: true })
    }
  }

  async function biggestStep(mp3: Uint8Array) {
    const folder = await mkdtemp(path.join(tmpdir(), "pomodoro-pcm-"))
    const input = path.join(folder, "in.mp3")
    const output = path.join(folder, "out.raw")
    try {
      await import("node:fs/promises").then((fs) => fs.writeFile(input, mp3))
      await run("ffmpeg", ["-y", "-i", input, "-f", "s16le", "-ac", "1", output])
      const raw = await readFile(output)
      const samples = new Int16Array(raw.buffer, raw.byteOffset, raw.byteLength / 2)
      const steps: number[] = []
      // Past the encoder's lead-in, where an MP3 starts from silence.
      for (let index = 4096; index < samples.length - 4096; index += 1) {
        steps.push(Math.abs(samples[index] - samples[index - 1]))
      }
      steps.sort((a, b) => a - b)
      // The biggest step against an ordinary big one. A smooth wave stays
      // near 1; a click where two copies meet measured 8.6 when the same
      // tone was simply repeated four times.
      return steps[steps.length - 1] / steps[Math.floor(steps.length * 0.99)]
    } finally {
      await rm(folder, { recursive: true, force: true })
    }
  }

  it("turns 30 seconds into two minutes with no jump at any join", async () => {
    const source = await tone(30.0123)
    const looped = await transcodeUpload(source, "audio", null, {
      loop: { minSeconds: 120 },
    })
    const seconds = await probeDurationSeconds(looped.bytes)
    expect(seconds).toBeGreaterThan(119.5)
    expect(seconds).toBeLessThan(121)
    expect(await biggestStep(looped.bytes)).toBeLessThan(2)
  }, 60_000)

  it("bakes a 2-second crossfade into an upload without lengthening it", async () => {
    const source = await tone(10.0123)
    const looped = await transcodeUpload(source, "audio", null, { loop: {} })
    const seconds = await probeDurationSeconds(looped.bytes)
    // One copy, 2 seconds shorter: the end now sits over the start.
    expect(seconds).toBeGreaterThan(7.8)
    expect(seconds).toBeLessThan(8.3)
  }, 60_000)
})
