import { describe, expect, it } from "vitest"

import {
  NOTHING_ON_SCREEN,
  sceneAt,
  scenesOfTimeline,
} from "@/lib/video/export-scenes"
import type { ProjectTimeline } from "@/lib/video/timeline-schema"

type Clip = ProjectTimeline["tracks"][number]["clips"][number]

function clip(id: string, startMs: number, durationMs: number, extra: Partial<Clip> = {}): Clip {
  return {
    id,
    kind: "video",
    name: id,
    startMs,
    durationMs,
    trimStartMs: 0,
    mediaId: `media-${id}`,
    ...extra,
  }
}

function timeline(...lanes: Clip[][]): ProjectTimeline {
  return {
    aspect: "9:16",
    tracks: lanes.map((clips, index) => ({ id: `lane-${index}`, muted: false, clips })),
  }
}

describe("scenesOfTimeline", () => {
  it("starts a scene wherever the picture changes", () => {
    const scenes = scenesOfTimeline(
      timeline([clip("Hook", 0, 4000), clip("Kitchen", 4000, 8000, { kind: "image" })]),
      12_000
    )
    expect(scenes).toEqual([
      { startMs: 0, endMs: 4000, name: "Hook" },
      { startMs: 4000, endMs: 12_000, name: "Kitchen" },
    ])
  })

  it("names a scene after the clip on the top lane, and comes back to the one beneath", () => {
    const scenes = scenesOfTimeline(
      timeline([clip("B-roll", 3000, 2000)], [clip("Talking", 0, 10_000)]),
      10_000
    )
    expect(scenes.map((scene) => [scene.startMs, scene.name])).toEqual([
      [0, "Talking"],
      [3000, "B-roll"],
      [5000, "Talking"],
    ])
  })

  it("keeps one scene while the top clip carries on over a cut underneath", () => {
    const scenes = scenesOfTimeline(
      timeline([clip("Logo card", 0, 6000)], [clip("A", 0, 3000), clip("B", 3000, 3000)]),
      6000
    )
    expect(scenes).toEqual([{ startMs: 0, endMs: 6000, name: "Logo card" }])
  })

  it("leaves text, sound and clips with no file out, and names a gap", () => {
    const scenes = scenesOfTimeline(
      timeline([
        clip("Caption", 0, 2000, { kind: "text", fontId: "inter" as Clip["fontId"], mediaId: undefined }),
        clip("Voice", 0, 5000, { kind: "audio" }),
        clip("No file", 0, 1000, { mediaId: undefined }),
        clip("Shot", 2000, 3000),
      ]),
      5000
    )
    expect(scenes).toEqual([
      { startMs: 0, endMs: 2000, name: NOTHING_ON_SCREEN },
      { startMs: 2000, endMs: 5000, name: "Shot" },
    ])
  })

  it("folds a blend's overlap into one cut and stops at the file's end", () => {
    const scenes = scenesOfTimeline(
      timeline([clip("A", 0, 4100)], [clip("B", 4000, 10_000)]),
      8000
    )
    expect(scenes).toEqual([
      { startMs: 0, endMs: 4000, name: "A" },
      { startMs: 4000, endMs: 8000, name: "B" },
    ])
  })

  it("has no scenes for a file of no length", () => {
    expect(scenesOfTimeline(timeline([clip("A", 0, 1000)]), 0)).toEqual([])
  })
})

describe("sceneAt", () => {
  const scenes = [
    { startMs: 0, endMs: 4000, name: "Hook" },
    { startMs: 4000, endMs: 12_000, name: "Kitchen" },
  ]
  it("counts scenes from 1, and the last moment is the last scene's", () => {
    expect(sceneAt(scenes, 0)?.number).toBe(1)
    expect(sceneAt(scenes, 4000)?.number).toBe(2)
    expect(sceneAt(scenes, 12_000)?.number).toBe(2)
    expect(sceneAt(scenes, 12_001)).toBeNull()
  })
})
