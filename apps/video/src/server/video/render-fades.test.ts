import { spawnSync } from "node:child_process"
import { copyFile, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

/**
 * A real export of faded clips, measured in the finished file.
 *
 * Only the two things outside this machine are stood in for: the media
 * lookup in the database and the download from storage. Everything else is
 * the export's own graph, run by the ffmpeg installed here, so the fades are
 * measured where people hear and see them rather than read off a filter
 * string.
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
            fileType: "video",
            storagePath: id,
          })),
      }),
    }),
  },
}))

vi.mock("@/server/video/storage-files", () => ({
  downloadToFile: async (storagePath: string, file: string) => {
    await copyFile(sources.files.get(storagePath)!, file)
  },
}))

const { renderTimeline } = await import("@/server/video/render")

const hasFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0

const FPS = 30
const WIDTH = 54
const HEIGHT = 96
const RATE = 8_000

function ffmpeg(args: string[]) {
  const result = spawnSync("ffmpeg", ["-v", "error", ...args], {
    maxBuffer: 64 * 1024 * 1024,
  })
  if (result.status !== 0) throw new Error(result.stderr.toString())
  return result.stdout
}

/** Every frame of the file, shrunk to a small grey picture. */
function frames(file: string, crop?: string) {
  const raw = ffmpeg([
    "-i",
    file,
    "-vf",
    `${crop ? `${crop},` : ""}scale=${WIDTH}:${HEIGHT}`,
    "-pix_fmt",
    "gray",
    "-f",
    "rawvideo",
    "-",
  ])
  const size = WIDTH * HEIGHT
  const means: number[] = []
  for (let at = 0; at + size <= raw.length; at += size) {
    let total = 0
    for (let pixel = at; pixel < at + size; pixel++) total += raw[pixel]
    means.push(total / size)
  }
  return means
}

/** The sound as one channel of samples. */
function samples(file: string) {
  const raw = ffmpeg([
    "-i",
    file,
    "-ac",
    "1",
    "-ar",
    String(RATE),
    "-f",
    "f32le",
    "-",
  ])
  return new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4)
}

function loudness(sound: Float32Array, fromS: number, toS: number) {
  let total = 0
  const from = Math.round(fromS * RATE)
  const to = Math.round(toS * RATE)
  for (let at = from; at < to; at++) total += sound[at] ** 2
  return Math.sqrt(total / (to - from))
}

describe.skipIf(!hasFfmpeg)("an export with fades", () => {
  let dir = ""
  let out = ""

  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "render-fades-"))
    // Four seconds of plain white with a steady tone.
    const take = path.join(dir, "take.mp4")
    ffmpeg([
      "-f",
      "lavfi",
      "-i",
      `color=c=white:s=270x480:r=${FPS}:d=4`,
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440:sample_rate=48000:duration=4",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-shortest",
      take,
    ])
    sources.files.set("take", take)
    // A white still, which the export loops as a picture rather than plays.
    const still = path.join(dir, "still.png")
    ffmpeg([
      "-f",
      "lavfi",
      "-i",
      "color=c=white:s=270x480:d=1",
      "-frames:v",
      "1",
      still,
    ])
    sources.files.set("still", still)

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
            id: "words",
            muted: false,
            clips: [
              {
                id: "title",
                kind: "text",
                name: "Title",
                text: "MMMM",
                fontId: "inter",
                fontSize: 140,
                color: "#ffffff",
                startMs: 4_000,
                durationMs: 2_000,
                trimStartMs: 0,
                pictureFadeInMs: 1_000,
                pictureFadeOutMs: 500,
              },
            ],
          },
          {
            id: "stills",
            muted: false,
            clips: [
              {
                id: "still",
                kind: "image",
                name: "Still",
                mediaId: "still",
                startMs: 6_000,
                durationMs: 2_000,
                trimStartMs: 0,
                pictureFadeInMs: 1_000,
                pictureFadeOutMs: 1_000,
              },
            ],
          },
          {
            id: "footage",
            muted: false,
            clips: [
              {
                id: "take",
                kind: "video",
                name: "Take",
                mediaId: "take",
                startMs: 0,
                durationMs: 4_000,
                trimStartMs: 0,
                sourceDurationMs: 4_000,
                fadeInMs: 3_000,
                pictureFadeInMs: 1_000,
                pictureFadeOutMs: 1_000,
              },
            ],
          },
        ],
      },
    })
    out = path.join(dir, "out.mp4")
    await writeFile(out, result.bytes)
  }, 60_000)

  afterAll(async () => {
    // The stand-in library answers with every file it holds, so the next
    // export must not inherit this one's.
    sources.files.clear()
    if (dir) await rm(dir, { recursive: true, force: true })
  })

  it("brings the picture up from black over its first second and back down over its last", () => {
    const light = frames(out)
    const black = light[Math.round(4.5 * FPS)] // only text there, mostly black
    const full = light[2 * FPS]
    const level = (s: number) =>
      (light[Math.round(s * FPS)] - Math.min(black, light[0])) /
      (full - Math.min(black, light[0]))
    expect(full).toBeGreaterThan(200)
    expect(light[0]).toBeLessThan(25)
    expect(level(0.5)).toBeCloseTo(0.5, 1)
    expect(level(2)).toBeCloseTo(1, 1)
    expect(level(3.5)).toBeCloseTo(0.5, 1)
    expect(level(3.95)).toBeLessThan(0.1)
  })

  it("brings the sound up evenly over three seconds", () => {
    const sound = samples(out)
    const full = loudness(sound, 3.2, 3.8)
    // ffmpeg's test tone peaks at an eighth of full scale.
    expect(full).toBeGreaterThan(0.05)
    expect(loudness(sound, 0, 0.1) / full).toBeLessThan(0.05)
    expect(loudness(sound, 1.45, 1.55) / full).toBeCloseTo(0.5, 1)
    expect(loudness(sound, 2.95, 3.05) / full).toBeGreaterThan(0.9)
  })

  it("fades words in over the second they are given", () => {
    // The middle of the frame, where the words are.
    const words = frames(out, "crop=iw/2:ih/8")
    const start = words[4 * FPS]
    const half = words[Math.round(4.5 * FPS)]
    const full = words[Math.round(5.5 * FPS)]
    expect(full - start).toBeGreaterThan(30)
    expect((half - start) / (full - start)).toBeCloseTo(0.5, 1)
  })

  it("fades words out before they go, though they are one held picture", () => {
    const words = frames(out, "crop=iw/2:ih/8")
    const start = words[4 * FPS]
    const full = words[Math.round(5.5 * FPS)]
    const level = (s: number) =>
      (words[Math.round(s * FPS)] - start) / (full - start)
    expect(level(5.75)).toBeGreaterThan(0.25)
    expect(level(5.75)).toBeLessThan(0.75)
    expect(level(5.95)).toBeLessThan(0.2)
  })

  it("fades a still picture in and out like footage", () => {
    const light = frames(out)
    const full = light[2 * FPS]
    expect(light[6 * FPS] / full).toBeLessThan(0.05)
    expect(light[Math.round(6.5 * FPS)] / full).toBeCloseTo(0.5, 1)
    expect(light[7 * FPS] / full).toBeGreaterThan(0.95)
    expect(light[Math.round(7.5 * FPS)] / full).toBeCloseTo(0.5, 1)
  })
})

describe.skipIf(!hasFfmpeg)("a picture fade beside a crossfade", () => {
  let dir = ""
  let out = ""

  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "render-fades-seam-"))
    const take = path.join(dir, "take.mp4")
    ffmpeg([
      "-f",
      "lavfi",
      "-i",
      `color=c=white:s=270x480:r=${FPS}:d=4`,
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      take,
    ])
    sources.files.set("take", take)
    const clip = (id: string, startMs: number, patch = {}) => ({
      id,
      kind: "video",
      name: id,
      mediaId: "take",
      startMs,
      durationMs: 4_000,
      trimStartMs: 0,
      sourceDurationMs: 4_000,
      pictureFadeInMs: 1_000,
      pictureFadeOutMs: 1_000,
      ...patch,
    })
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
              clip("first", 0),
              clip("second", 4_000, {
                transition: { kind: "crossfade", durationMs: 1_000 },
              }),
            ],
          },
        ],
      },
    })
    out = path.join(dir, "out.mp4")
    await writeFile(out, result.bytes)
  }, 60_000)

  afterAll(async () => {
    if (dir) await rm(dir, { recursive: true, force: true })
  })

  it("lets the crossfade have the seam, so the picture never dips there", () => {
    const light = frames(out)
    const full = light[2 * FPS]
    // The far ends still fade.
    expect(light[0]).toBeLessThan(25)
    expect(light[Math.round(7.5 * FPS)] / full).toBeCloseTo(0.5, 1)
    // Across the blend, white over white stays white.
    for (const s of [3.2, 3.5, 3.8, 4.0, 4.3]) {
      expect(light[Math.round(s * FPS)] / full).toBeGreaterThan(0.95)
    }
  })
})
