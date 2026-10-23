import { describe, expect, it } from "vitest"

import {
  BRIEF_BREATH_MS,
  briefLaneRefusal,
  briefStartMs,
  landBriefScenes,
  lengthIsClose,
  newScene,
  sceneLeftCents,
  storyboardCents,
  type BriefLanding,
  type StoredScene,
} from "@/lib/video/brief"
import { DEFAULT_CAPTION_SETTINGS } from "@/lib/video/caption-look"
import { MAX_TIMELINE_TRACKS, type ProjectTimeline } from "@/lib/video/timeline-schema"

const CAPTIONS = { ...DEFAULT_CAPTION_SETTINGS, aspect: "9:16" as const }

type Tracks = ProjectTimeline["tracks"]

function ids() {
  let next = 0
  return () => `new-${(next += 1)}`
}

function made(id: string, durationMs: number, state: StoredScene["state"] = "made"): StoredScene {
  return {
    id,
    words: `${id} words`,
    picture: `${id} picture`,
    seconds: 4,
    state,
    still: {
      mediaId: `${id}-still`,
      name: `${id}.png`,
      origin: { tool: "brief", model: "gemini-3.1-flash-image", prompt: `${id} picture`, aspectRatio: "9:16" },
    },
    voice: {
      mediaId: `${id}-voice`,
      name: `${id} voice`,
      durationMs,
      captions: [
        { startMs: 0, endMs: durationMs / 2, text: "First half" },
        { startMs: durationMs / 2, endMs: durationMs, text: "second half." },
      ],
      origin: {
        tool: "brief-voice",
        model: "eleven_multilingual_v2",
        prompt: `${id} words`,
        voice: { id: "rachel", name: "Rachel", speaker: "elevenlabs" },
      },
    },
  }
}

const EMPTY_LANDING: BriefLanding = { startMs: 0, lanes: {} }

/** Footage up to 9 seconds, with music under it. */
const BUSY: Tracks = [
  {
    id: "footage",
    muted: false,
    clips: [{ id: "a", kind: "video", name: "A", mediaId: "a", startMs: 0, durationMs: 9000, trimStartMs: 0 }],
  },
  {
    id: "music",
    muted: false,
    clips: [{ id: "m", kind: "audio", name: "M", mediaId: "m", startMs: 0, durationMs: 9000, trimStartMs: 0 }],
  },
]

function starts(tracks: Tracks) {
  return tracks.flatMap((track) => track.clips.map((clip) => `${clip.id}@${clip.startMs}`))
}

describe("where a brief starts", () => {
  it("starts at the playhead on an empty timeline, and after the last clip otherwise", () => {
    expect(briefStartMs([{ id: "t", muted: false, clips: [] }], 2500)).toBe(2500)
    expect(briefStartMs(BUSY, 2500)).toBe(9000)
  })

  it("needs room for three lanes, counting empty ones it can use", () => {
    const full = Array.from({ length: MAX_TIMELINE_TRACKS - 1 }, (_, index) => ({
      id: `t${index}`,
      muted: false,
      clips: BUSY[0].clips,
    }))
    expect(briefLaneRefusal(full)).not.toBeNull()
    expect(briefLaneRefusal([...full.slice(0, -2), ...[1, 2, 3].map((n) => ({ id: `e${n}`, muted: false, clips: [] }))])).toBeNull()
  })
})

describe("laying scenes on the timeline", () => {
  it("lays scenes end to end with a breath between, on three new lanes, moving nothing", () => {
    const landed = landBriefScenes(
      BUSY,
      { scenes: [made("one", 3000), made("two", 2000)], landing: { startMs: 9000, lanes: {} } },
      ids(),
      CAPTIONS
    )!
    expect(landed.placed).toEqual(["one", "two"])
    // What was there is exactly where it was.
    expect(starts(landed.tracks).filter((at) => at.startsWith("a@") || at.startsWith("m@"))).toEqual(starts(BUSY))

    const words = landed.tracks.find((track) => track.id === landed.landing.lanes.words)!
    const pictures = landed.tracks.find((track) => track.id === landed.landing.lanes.pictures)!
    const voice = landed.tracks.find((track) => track.id === landed.landing.lanes.voice)!
    // Words on top, pictures under them, the voice at the bottom.
    expect(landed.tracks.map((track) => track.id)).toEqual([words.id, pictures.id, "footage", "music", voice.id])

    const twoStart = 9000 + 3000 + BRIEF_BREATH_MS
    expect(pictures.clips.map((clip) => [clip.startMs, clip.durationMs, clip.motion])).toEqual([
      [9000, 3000 + BRIEF_BREATH_MS, "push-in"],
      [twoStart, 2000 + BRIEF_BREATH_MS, "drift-right"],
    ])
    expect(voice.clips.map((clip) => [clip.startMs, clip.durationMs, clip.origin?.tool])).toEqual([
      [9000, 3000, "brief-voice"],
      [twoStart, 2000, "brief-voice"],
    ])
    expect(words.clips.map((clip) => clip.startMs)).toEqual([9000, 10500, twoStart, twoStart + 1000])
    // Each caption names the voice line that says it.
    expect(words.clips[0].spokenBy).toBe(voice.clips[0].id)
    expect(pictures.clips[0].origin).toMatchObject({ tool: "brief", prompt: "one picture" })
  })

  it("uses empty lanes first, so a new project's three lanes are filled", () => {
    const empty: Tracks = ["x", "y", "z"].map((id) => ({ id, muted: false, clips: [] }))
    const landed = landBriefScenes(empty, { scenes: [made("one", 3000)], landing: EMPTY_LANDING }, ids(), CAPTIONS)!
    expect(landed.tracks.map((track) => track.id)).toEqual(["x", "y", "z"])
    expect(landed.landing.lanes).toEqual({ words: "x", pictures: "y", voice: "z" })
  })

  it("holds back every scene after one that is not made yet", () => {
    const landed = landBriefScenes(
      [],
      { scenes: [made("one", 3000), made("two", 2000, "failed"), made("three", 2000)], landing: EMPTY_LANDING },
      ids(),
      CAPTIONS
    )!
    expect(landed.placed).toEqual(["one"])
  })

  it("starts a later scene after the scenes already placed", () => {
    const first = landBriefScenes([], { scenes: [made("one", 3000)], landing: EMPTY_LANDING }, ids(), CAPTIONS)!
    const second = landBriefScenes(
      first.tracks,
      { scenes: [made("one", 3000, "placed"), made("two", 2000)], landing: first.landing },
      ids(),
      CAPTIONS
    )!
    expect(second.placed).toEqual(["two"])
    const pictures = second.tracks.find((track) => track.id === first.landing.lanes.pictures)!
    expect(pictures.clips.map((clip) => clip.startMs)).toEqual([0, 3000 + BRIEF_BREATH_MS])
    expect(second.tracks).toHaveLength(3)
  })

  it("goes on a lane of its own when something is in the way, and remakes a deleted lane with its name", () => {
    const first = landBriefScenes([], { scenes: [made("one", 3000)], landing: EMPTY_LANDING }, ids(), CAPTIONS)!
    const { words, pictures } = first.landing.lanes
    const blocked = first.tracks
      // The words lane was deleted.
      .filter((track) => track.id !== words)
      // Somebody dropped a clip where scene two's picture goes.
      .map((track) =>
        track.id === pictures
          ? {
              ...track,
              clips: [
                ...track.clips,
                { id: "dropped", kind: "image" as const, name: "D", startMs: 3500, durationMs: 1000, trimStartMs: 0 },
              ],
            }
          : track
      )
    const second = landBriefScenes(
      blocked,
      { scenes: [made("one", 3000, "placed"), made("two", 2000)], landing: first.landing },
      ids(),
      CAPTIONS
    )!
    expect(second.landing.lanes.words).toBe(words)
    expect(second.landing.lanes.pictures).not.toBe(pictures)
    const old = second.tracks.find((track) => track.id === pictures)!
    expect(old.clips.map((clip) => clip.id)).toContain("dropped")
    expect(old.clips).toHaveLength(2)
  })

  it("refuses when a lane would pass the most a project holds", () => {
    const full = Array.from({ length: MAX_TIMELINE_TRACKS }, (_, index) => ({
      id: `t${index}`,
      muted: false,
      clips: BUSY[0].clips,
    }))
    expect(landBriefScenes(full, { scenes: [made("one", 3000)], landing: { startMs: 9000, lanes: {} } }, ids(), CAPTIONS)).toBeNull()
  })
})

describe("prices and lengths", () => {
  const voice = { speaker: "elevenlabs" as const, modelId: "eleven_multilingual_v2" as const }

  it("prices a picture and a reading per scene, and only what a scene still lacks", () => {
    const scenes = [{ words: "a".repeat(100) }, { words: "b".repeat(50) }]
    const total = storyboardCents(scenes, voice, "gemini-3.1-flash-image")
    expect(total).toBeGreaterThan(0)
    const half = made("one", 3000)
    expect(sceneLeftCents(half, voice, "gemini-3.1-flash-image")).toBe(0)
    expect(sceneLeftCents({ ...half, voice: undefined }, voice, "gemini-3.1-flash-image")).toBeGreaterThan(0)
  })

  it("is close enough within a tenth of the asked length", () => {
    expect(lengthIsClose(49, 45)).toBe(true)
    expect(lengthIsClose(50, 45)).toBe(false)
    expect(lengthIsClose(40, 45)).toBe(false)
  })

  it("keeps a scene's seconds whole, between 1 and 60", () => {
    expect(newScene({ words: " Hi ", picture: " Bread ", seconds: 4.6 }, "s").seconds).toBe(5)
    expect(newScene({ words: "Hi", picture: "Bread", seconds: 0.2 }, "s")).toMatchObject({ seconds: 1, words: "Hi", picture: "Bread", state: "draft" })
  })
})
