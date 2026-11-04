import { execFileSync } from "node:child_process"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

import { describe, expect, it } from "vitest"

import { runFfmpeg } from "@/server/video/ffmpeg"

import { slideshowArgs } from "./promo-slideshow"

const hasFfmpeg = (() => {
  try {
    execFileSync("ffprobe", ["-version"], { stdio: "ignore" })
    return true
  } catch {
    return false
  }
})()

describe("a carousel's slideshow", () => {
  it("holds each slide for 3 seconds and fades a picked sound out", () => {
    const args = slideshowArgs({
      slides: [
        { file: "a.png", video: false },
        { file: "b.mp4", video: true },
      ],
      sound: "music",
      out: "out.mp4",
    })
    expect(args.slice(0, 9)).toEqual(["-loop", "1", "-t", "3", "-i", "a.png", "-t", "3", "-i"])
    expect(args[args.indexOf("-filter_complex") + 1]).toContain("[v0][v1]concat=n=2:v=1:a=0[v]")
    expect(args[args.indexOf("-af") + 1]).toBe("afade=t=out:st=5:d=1")
    expect(args[args.indexOf("-t", 9) + 1]).toBe("6")
    expect(args.at(-1)).toBe("out.mp4")
  })

  it("has no sound at all when none is picked", () => {
    const args = slideshowArgs({ slides: [{ file: "a.png", video: false }], sound: null, out: "o.mp4" })
    expect(args).toContain("-an")
    expect(args).not.toContain("-stream_loop")
  })

  it.skipIf(!hasFfmpeg)("makes a tall video 3 seconds a slide long", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "slideshow-test-"))
    try {
      const slides = []
      for (const [index, color] of ["red", "blue"].entries()) {
        const file = path.join(dir, `s${index}.png`)
        await runFfmpeg(["-f", "lavfi", "-i", `color=c=${color}:s=1080x1350`, "-frames:v", "1", file], "no picture")
        slides.push({ file, video: false })
      }
      const out = path.join(dir, "out.mp4")
      await runFfmpeg(slideshowArgs({ slides, sound: null, out }), "no slideshow")
      const probe = execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=width,height:format=duration", "-of", "json", out]).toString()
      const info = JSON.parse(probe) as { streams: { width: number; height: number }[]; format: { duration: string } }
      expect(info.streams[0]).toMatchObject({ width: 1080, height: 1920 })
      expect(Number(info.format.duration)).toBeCloseTo(6, 0)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  }, 60_000)
})
