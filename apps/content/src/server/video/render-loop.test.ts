import { spawnSync } from "node:child_process"
import { copyFile, mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

import { playbackSourceMsAt } from "@/lib/video/clip-playback"

/**
 * A real export of looped clips, measured in the finished file
 * (clip-loop.md). Only the media lookup and where each file is read from are
 * stood in for; the rest is the export's own graph run by this machine's
 * ffmpeg.
 */

const sources = vi.hoisted(() => ({ files: new Map<string, string>() }))

vi.mock("@/server/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: async () =>
          [...sources.files.keys()].map((id) => ({
            id,
            userId: "owner",
            fileType: id.endsWith("-sound") ? "audio" : "video",
            storagePath: id,
          })),
      }),
    }),
  },
}))

vi.mock("@/server/video/render-sources", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/server/video/render-sources")>()
  return {
    ...real,
    openRenderSource: async (media: { storagePath: string }) => ({
      input: sources.files.get(media.storagePath)!,
      release: async () => undefined,
    }),
  }
})

const { renderTimeline } = await import("@/server/video/render")

const hasFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0

const FPS = 30
const RATE = 8_000

function ffmpeg(args: string[]) {
  const result = spawnSync("ffmpeg", ["-v", "error", ...args], { maxBuffer: 64 * 1024 * 1024 })
  if (result.status !== 0) throw new Error(result.stderr.toString())
  return result.stdout
}

/** Every frame's mean brightness, 0 black to 255 white. */
function frames(file: string) {
  const raw = ffmpeg(["-i", file, "-vf", "scale=16:16", "-pix_fmt", "gray", "-f", "rawvideo", "-"])
  const means: number[] = []
  for (let at = 0; at + 256 <= raw.length; at += 256) {
    let total = 0
    for (let pixel = at; pixel < at + 256; pixel++) total += raw[pixel]
    means.push(total / 256)
  }
  return means
}

function samples(file: string) {
  const raw = ffmpeg(["-i", file, "-ac", "1", "-ar", String(RATE), "-f", "f32le", "-"])
  return new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4)
}

/** The quietest 20 ms stretch between two times. */
function quietest(sound: Float32Array, fromS: number, toS: number) {
  const window = Math.round(0.02 * RATE)
  let least = Infinity
  for (let at = Math.round(fromS * RATE); at + window <= Math.round(toS * RATE); at += window / 2) {
    let total = 0
    for (let one = at; one < at + window; one++) total += sound[one] ** 2
    least = Math.min(least, Math.sqrt(total / window))
  }
  return least
}

/** Whether the frame at this second of the film is the black half or the white half of the take. */
function shade(means: number[], atS: number) {
  return means[Math.round(atS * FPS)] < 128 ? "black" : "white"
}

describe("where a looped clip is in its file", () => {
  it("starts the file again from 0 when it runs out, as -stream_loop does", () => {
    const clip = { durationMs: 10_000, trimStartMs: 500, sourceDurationMs: 2_000, loop: true }
    expect(playbackSourceMsAt(clip, 0)).toBe(500)
    expect(playbackSourceMsAt(clip, 1_600)).toBe(100)
    expect(playbackSourceMsAt({ ...clip, speed: 2 }, 1_000)).toBe(500)
    expect(playbackSourceMsAt({ ...clip, loop: false }, 3_000)).toBe(3_500)
  })
})

describe.skipIf(!hasFfmpeg)("an export with looped clips", () => {
  let dir = ""
  let out = ""

  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "render-loop-"))
    // Two seconds: one black, one white, so where the file is shows.
    const take = path.join(dir, "take.mp4")
    ffmpeg([
      "-f", "lavfi", "-i", `color=c=black:s=270x480:r=${FPS}:d=1`,
      "-f", "lavfi", "-i", `color=c=white:s=270x480:r=${FPS}:d=1`,
      "-filter_complex", "[0:v][1:v]concat=n=2:v=1[v]",
      "-map", "[v]", "-c:v", "libx264", "-pix_fmt", "yuv420p", take,
    ])
    sources.files.set("take", take)
    // Two seconds of a steady tone as an mp3, which pads both ends.
    const tone = path.join(dir, "tone.mp3")
    ffmpeg(["-f", "lavfi", "-i", "sine=frequency=440:sample_rate=44100:duration=2", "-c:a", "libmp3lame", "-b:a", "128k", tone])
    sources.files.set("tone-sound", tone)

    const loopClip = { kind: "video" as const, mediaId: "take", trimStartMs: 0, sourceDurationMs: 2_000, loop: true, muted: true }
    const result = await renderTimeline({
      userId: "owner",
      aspect: "9:16",
      quality: "low",
      frameRate: FPS,
      normalizeLoudness: false,
      timeline: {
        aspect: "9:16",
        tracks: [
          {
            id: "footage",
            muted: false,
            clips: [
              { ...loopClip, id: "from-start", name: "From the start", startMs: 0, durationMs: 6_000 },
              { ...loopClip, id: "half-in", name: "Half a second in", startMs: 6_000, durationMs: 4_000, trimStartMs: 500 },
            ],
          },
          {
            id: "sound",
            muted: false,
            clips: [
              {
                id: "tone",
                kind: "audio",
                name: "Tone",
                mediaId: "tone-sound",
                startMs: 0,
                durationMs: 10_000,
                trimStartMs: 0,
                sourceDurationMs: 2_000,
                loop: true,
              },
            ],
          },
        ],
      },
    })
    out = path.join(dir, "out.mp4")
    await copyFile(result.filePath, out)
    await result.dispose()
  }, 120_000)

  afterAll(async () => {
    sources.files.clear()
    if (dir) await rm(dir, { recursive: true, force: true })
  })

  it("runs the whole stretch, frame for frame", () => {
    expect(frames(out).length).toBe(10 * FPS)
  })

  it("plays the file round again from its start, never a held or black last frame", () => {
    const means = frames(out)
    // From the start: black, white, black, white, black, white.
    expect([0.5, 1.5, 2.5, 3.5, 4.5, 5.5].map((atS) => shade(means, atS))).toEqual([
      "black", "white", "black", "white", "black", "white",
    ])
    // Half a second in: white until 1.5 s into the clip, then black from the
    // file's start again, then white, then black.
    expect([6.25, 6.75, 7.75, 8.75, 9.75].map((atS) => shade(means, atS))).toEqual([
      "black", "white", "black", "white", "black",
    ])
  })

  it("loops the sound with no gap at the wraps", () => {
    const sound = samples(out)
    // ffmpeg's test tone plays at an eighth of full, about 0.088 all through;
    // a gap of even 20 ms at a wrap would read near 0.
    expect(quietest(sound, 0.2, 9.8)).toBeGreaterThan(0.06)
  })
})

describe.skipIf(!hasFfmpeg)("an export with a timer", () => {
  let dir = ""
  let out = ""

  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "render-timer-"))
    const result = await renderTimeline({
      userId: "owner",
      aspect: "16:9",
      quality: "low",
      frameRate: FPS,
      normalizeLoudness: false,
      timeline: {
        aspect: "16:9",
        tracks: [
          {
            id: "timer",
            muted: false,
            clips: [
              {
                id: "focus",
                kind: "shape",
                shape: "timer",
                name: "Timer",
                startMs: 0,
                durationMs: 3_000,
                trimStartMs: 0,
                x: 0.3,
                y: 0.1,
                toX: 0.7,
                toY: 0.9,
                color: "#ffffff",
                lineWidth: 40,
                timerAbove: "FOCUS",
              },
            ],
          },
        ],
      },
    })
    out = path.join(dir, "out.mp4")
    await copyFile(result.filePath, out)
    await result.dispose()
  }, 120_000)

  afterAll(async () => {
    if (dir) await rm(dir, { recursive: true, force: true })
  })

  it("holds one picture through each second and moves on at the next", () => {
    const means = frames(out)
    expect(means.length).toBe(3 * FPS)
    const second = (atS: number) => means[Math.round(atS * FPS)]
    // The same picture all through a second.
    expect(Math.abs(second(0.2) - second(0.8))).toBeLessThan(0.5)
    expect(Math.abs(second(1.2) - second(1.8))).toBeLessThan(0.5)
    // The ring empties, so each second has less white than the one before.
    expect(second(0.5)).toBeGreaterThan(second(1.5))
    expect(second(1.5)).toBeGreaterThan(second(2.5))
    // Something is drawn: white on the black frame.
    expect(second(0.5)).toBeGreaterThan(5)
  })
})

