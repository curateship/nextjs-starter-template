import { describe, expect, it } from "vitest"

import { withIntroOutro } from "@/lib/video/intro-outro"
import { chapterLines } from "@/lib/video/youtube-chapters"

const timeline = {
  aspect: "9:16" as const,
  tracks: [
    {
      id: "a",
      muted: false,
      clips: [{ id: "c", kind: "video" as const, name: "Talk", mediaId: "m", startMs: 0, durationMs: 10_000, trimStartMs: 0 }],
    },
  ],
  markers: [{ id: "p", atMs: 4_000, name: "The trick" }],
}

describe("a project's intro and outro", () => {
  it("puts the intro first, moves everything after it, and the outro last", () => {
    const wrapped = withIntroOutro(timeline, {
      intro: { mediaId: "intro-file", durationMs: 3_000 },
      outro: { mediaId: "outro-file", durationMs: 2_000 },
    })
    expect(wrapped.tracks[0].clips[0].startMs).toBe(3_000)
    const added = wrapped.tracks.at(-1)!.clips
    expect(added.map((clip) => [clip.mediaId, clip.startMs, clip.durationMs])).toEqual([
      ["intro-file", 0, 3_000],
      ["outro-file", 13_000, 2_000],
    ])
  })

  it("makes the intro the first chapter and moves the others along", () => {
    const wrapped = withIntroOutro(timeline, { intro: { mediaId: "i", durationMs: 3_000 } })
    expect(chapterLines(wrapped.markers!)).toEqual([
      { atMs: 0, name: "Intro" },
      { atMs: 7_000, name: "The trick" },
    ])
  })

  it("leaves the timeline alone when there is neither", () => {
    expect(withIntroOutro(timeline, { intro: null, outro: null })).toBe(timeline)
  })
})
