import { spawnSync } from "node:child_process"
import { copyFile, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

import type { ProjectTimeline } from "@/lib/video/timeline-schema"

/**
 * Real exports of the editor features from task editor/01, measured in the
 * finished files: a filled clip's crop spot, a video in a corner box and in
 * a split, the progress bar, an arrow drawing itself on, a cleaned-up voice
 * and a starter sound effect.
 *
 * Only the two things outside this machine are stood in for, as in
 * render-fades.test.ts: the media lookup and the download from storage.
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
const RATE = 8_000
// The low quality frame of a tall project.
const WIDTH = 480
const HEIGHT = 854

type Clip = ProjectTimeline["tracks"][number]["clips"][number]

function ffmpeg(args: string[]) {
  const result = spawnSync("ffmpeg", ["-v", "error", ...args], {
    maxBuffer: 256 * 1024 * 1024,
  })
  if (result.status !== 0) throw new Error(result.stderr.toString())
  return result.stdout
}

/** One frame as grey levels, row by row, at the export's own size. */
function frameAt(file: string, seconds: number) {
  return ffmpeg([
    "-ss",
    String(seconds),
    "-i",
    file,
    "-frames:v",
    "1",
    "-vf",
    `scale=${WIDTH}:${HEIGHT}`,
    "-pix_fmt",
    "gray",
    "-f",
    "rawvideo",
    "-",
  ])
}

/** How bright a box of the frame is on average, 0 to 255. */
function brightness(
  frame: Buffer,
  box: { left: number; top: number; right: number; bottom: number }
) {
  let total = 0
  let count = 0
  const x0 = Math.round(box.left * WIDTH)
  const x1 = Math.round(box.right * WIDTH)
  const y0 = Math.round(box.top * HEIGHT)
  const y1 = Math.round(box.bottom * HEIGHT)
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      total += frame[y * WIDTH + x]
      count += 1
    }
  }
  return total / count
}

function samples(file: string) {
  const raw = ffmpeg(["-i", file, "-ac", "1", "-ar", String(RATE), "-f", "f32le", "-"])
  return new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4)
}

function loudness(sound: Float32Array, fromS: number, toS: number) {
  let total = 0
  const from = Math.round(fromS * RATE)
  const to = Math.round(toS * RATE)
  for (let at = from; at < to; at++) total += sound[at] ** 2
  return Math.sqrt(total / (to - from))
}

function clip(extra: Partial<Clip> & Pick<Clip, "id" | "kind">): Clip {
  return { name: extra.id, startMs: 0, durationMs: 2_000, trimStartMs: 0, ...extra }
}

// Every file the tests made. The stand-in library answers with every file it
// holds, so each export is handed only the ones its own clips name.
const library = new Map<string, string>()

async function render(dir: string, name: string, timeline: ProjectTimeline) {
  const named = new Set(
    timeline.tracks.flatMap((track) => track.clips.map((one) => one.mediaId))
  )
  sources.files.clear()
  for (const [id, file] of library) if (named.has(id)) sources.files.set(id, file)
  const result = await renderTimeline({
    userId: "owner",
    aspect: timeline.aspect,
    quality: "low",
    frameRate: FPS,
    normalizeLoudness: false,
    timeline,
  })
  const out = path.join(dir, `${name}.mp4`)
  await writeFile(out, result.bytes)
  return out
}

describe.skipIf(!hasFfmpeg)("exports of the editor features", () => {
  let dir = ""

  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "render-editor-"))
    // A wide clip, white on its left half and black on its right.
    const wide = path.join(dir, "wide.mp4")
    ffmpeg([
      "-f", "lavfi", "-i", `color=c=black:s=640x360:r=${FPS}:d=2`,
      "-vf", "drawbox=x=0:y=0:w=320:h=360:color=white:t=fill",
      "-c:v", "libx264", "-pix_fmt", "yuv420p", wide,
    ])
    library.set("wide", wide)
    const white = path.join(dir, "white.mp4")
    ffmpeg([
      "-f", "lavfi", "-i", `color=c=white:s=270x480:r=${FPS}:d=2`,
      "-c:v", "libx264", "-pix_fmt", "yuv420p", white,
    ])
    library.set("white", white)
    const grey = path.join(dir, "grey.mp4")
    ffmpeg([
      "-f", "lavfi", "-i", `color=c=0x404040:s=270x480:r=${FPS}:d=2`,
      "-c:v", "libx264", "-pix_fmt", "yuv420p", grey,
    ])
    library.set("grey", grey)
    // A steady hiss with a one-second tone in the middle of it.
    const noisy = path.join(dir, "noisy.wav")
    ffmpeg([
      "-f", "lavfi", "-i", "sine=f=220:d=1,volume=0.3",
      "-f", "lavfi", "-i", "anoisesrc=c=pink:a=0.05:d=3",
      "-filter_complex", "[0]adelay=1500:all=1,apad=whole_dur=3[v];[v][1]amix=inputs=2:normalize=0",
      "-ar", "48000", noisy,
    ])
    library.set("noisy", noisy)
  }, 60_000)

  afterAll(async () => {
    sources.files.clear()
    library.clear()
    if (dir) await rm(dir, { recursive: true, force: true })
  })

  it("keeps the side of a filled wide clip its crop spot names", async () => {
    const left = await render(dir, "fill-left", {
      aspect: "9:16",
      tracks: [{ id: "a", muted: false, clips: [clip({ id: "w", kind: "video", mediaId: "wide", fit: "cover", fillFocus: 0 })] }],
    })
    const right = await render(dir, "fill-right", {
      aspect: "9:16",
      tracks: [{ id: "a", muted: false, clips: [clip({ id: "w", kind: "video", mediaId: "wide", fit: "cover", fillFocus: 1 })] }],
    })
    const whole = { left: 0, top: 0, right: 1, bottom: 1 }
    expect(brightness(frameAt(left, 1), whole)).toBeGreaterThan(230)
    expect(brightness(frameAt(right, 1), whole)).toBeLessThan(25)
  }, 60_000)

  it("puts a video in the bottom-right corner box over another", async () => {
    const out = await render(dir, "corner", {
      aspect: "9:16",
      tracks: [
        { id: "top", muted: false, clips: [clip({ id: "face", kind: "video", mediaId: "white", scale: 0.3, x: 0.82, y: 0.82, fit: "cover" })] },
        { id: "under", muted: false, clips: [clip({ id: "screen", kind: "video", mediaId: "grey" })] },
      ],
    })
    const frame = frameAt(out, 1)
    // The box runs from 0.67 to 0.97 each way.
    expect(brightness(frame, { left: 0.7, top: 0.7, right: 0.94, bottom: 0.94 })).toBeGreaterThan(230)
    expect(brightness(frame, { left: 0.05, top: 0.05, right: 0.6, bottom: 0.6 })).toBeLessThan(80)
  }, 60_000)

  it("fills the top half with one clip and the bottom with the other", async () => {
    const out = await render(dir, "split", {
      aspect: "9:16",
      tracks: [
        { id: "top", muted: false, clips: [clip({ id: "me", kind: "video", mediaId: "white", boxHeight: 0.5, x: 0.5, y: 0.25, fit: "cover" })] },
        { id: "under", muted: false, clips: [clip({ id: "screen", kind: "video", mediaId: "grey", boxHeight: 0.5, x: 0.5, y: 0.75, fit: "cover" })] },
      ],
    })
    const frame = frameAt(out, 1)
    expect(brightness(frame, { left: 0, top: 0.02, right: 1, bottom: 0.48 })).toBeGreaterThan(230)
    const bottom = brightness(frame, { left: 0, top: 0.52, right: 1, bottom: 0.98 })
    expect(bottom).toBeGreaterThan(40)
    expect(bottom).toBeLessThan(90)
  }, 60_000)

  it("fills the progress bar halfway at the halfway point", async () => {
    const out = await render(dir, "bar", {
      aspect: "9:16",
      progressBar: { edge: "bottom", color: "#ffffff", thickness: 40, inset: 0 },
      tracks: [{ id: "a", muted: false, clips: [clip({ id: "g", kind: "video", mediaId: "grey" })] }],
    })
    const frame = frameAt(out, 1)
    // 40 of 1080 is 3.7% of the width tall, so the bottom 2% is all bar.
    const row = { top: 0.985, bottom: 1 }
    expect(brightness(frame, { ...row, left: 0.02, right: 0.45 })).toBeGreaterThan(230)
    expect(brightness(frame, { ...row, left: 0.55, right: 0.98 })).toBeLessThan(90)
  }, 60_000)

  it("draws an arrow on over its first half second", async () => {
    const out = await render(dir, "arrow", {
      aspect: "9:16",
      tracks: [
        {
          id: "shapes",
          muted: false,
          clips: [clip({ id: "arrow", kind: "shape", shape: "arrow", x: 0.1, y: 0.5, toX: 0.9, toY: 0.5, color: "#ffffff", lineWidth: 30, drawOn: true })],
        },
        { id: "under", muted: false, clips: [clip({ id: "g", kind: "video", mediaId: "grey" })] },
      ],
    })
    const band = { top: 0.49, bottom: 0.51 }
    const early = frameAt(out, 0.1)
    const late = frameAt(out, 1)
    // A tenth of a second in, the shaft has not reached the right side.
    expect(brightness(early, { ...band, left: 0.15, right: 0.2 })).toBeGreaterThan(200)
    expect(brightness(early, { ...band, left: 0.7, right: 0.8 })).toBeLessThan(90)
    expect(brightness(late, { ...band, left: 0.7, right: 0.8 })).toBeGreaterThan(200)
  }, 60_000)

  it("takes the hiss down when the voice is cleaned, and keeps the tone", async () => {
    const make = (voiceClean?: Clip["voiceClean"]) =>
      render(dir, `voice-${voiceClean ?? "off"}`, {
        aspect: "9:16",
        tracks: [{ id: "a", muted: false, clips: [clip({ id: "v", kind: "audio", mediaId: "noisy", durationMs: 3_000, voiceClean })] }],
      })
    const plain = samples(await make())
    const cleaned = samples(await make("strong"))
    const hiss = (sound: Float32Array) => loudness(sound, 0.4, 1.3)
    const tone = (sound: Float32Array) => loudness(sound, 1.7, 2.3)
    // Strong takes the hiss down by about 14dB, a fifth of its level.
    expect(hiss(cleaned) / hiss(plain)).toBeLessThan(0.35)
    expect(tone(cleaned) / tone(plain)).toBeGreaterThan(0.85)
  }, 60_000)

  it("plays a starter sound effect where it was dropped", async () => {
    const out = await render(dir, "beep", {
      aspect: "9:16",
      tracks: [
        { id: "sfx", muted: false, clips: [clip({ id: "b", kind: "audio", stockSound: "beep", url: "/sounds/beep.mp3", startMs: 1_000, durationMs: 200, sourceDurationMs: 200 })] },
        { id: "under", muted: false, clips: [clip({ id: "g", kind: "video", mediaId: "grey" })] },
      ],
    })
    const sound = samples(out)
    expect(loudness(sound, 0.2, 0.8)).toBeLessThan(0.01)
    expect(loudness(sound, 1.05, 1.15)).toBeGreaterThan(0.2)
  }, 60_000)
})
