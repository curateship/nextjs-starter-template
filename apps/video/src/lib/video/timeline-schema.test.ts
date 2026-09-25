import { describe, expect, it } from "vitest"

import {
  createEmptyTimeline,
  createTimelineSnapshot,
  parseTimelineForReset,
  requireCanonicalTimeline,
  SAVED_TIMELINE_INVALID_MESSAGE,
} from "./timeline-schema"

function timeline(clips: unknown[]) {
  return {
    aspect: "9:16",
    tracks: [{ id: "track-1", muted: false, clips }],
  }
}

const VIDEO_CLIP = {
  id: "clip-1",
  kind: "video",
  name: "Hook.mp4",
  startMs: 0,
  durationMs: 4000,
  trimStartMs: 0,
  mediaId: "11111111-1111-4111-8111-111111111111",
  url: "https://example.test/hook.mp4",
}

const IMAGE_CLIP = {
  id: "clip-2",
  kind: "image",
  name: "Beach.jpg",
  startMs: 0,
  durationMs: 4000,
  trimStartMs: 0,
  mediaId: "22222222-2222-4222-8222-222222222222",
  url: "https://example.test/beach.jpg",
}

describe("requireCanonicalTimeline", () => {
  it("accepts a plain video timeline", () => {
    const parsed = requireCanonicalTimeline(timeline([VIDEO_CLIP]))
    expect(parsed.tracks[0].clips[0].name).toBe("Hook.mp4")
    expect(parsed.aspect).toBe("9:16")
  })

  it("still accepts a timeline saved before volume and speed existed", () => {
    const parsed = requireCanonicalTimeline(timeline([VIDEO_CLIP]))
    expect(parsed.tracks[0].clips[0].volume).toBeUndefined()
    expect(parsed.tracks[0].clips[0].speed).toBeUndefined()
  })

  it("still accepts a timeline saved before the frame choice existed", () => {
    const parsed = requireCanonicalTimeline(timeline([VIDEO_CLIP]))
    expect(parsed.tracks[0].clips[0].fit).toBeUndefined()
  })

  it("accepts a clip set to fill the frame", () => {
    const parsed = requireCanonicalTimeline(
      timeline([{ ...VIDEO_CLIP, fit: "cover" }])
    )
    expect(parsed.tracks[0].clips[0].fit).toBe("cover")
  })

  it("rejects a frame choice it does not know", () => {
    expect(() =>
      requireCanonicalTimeline(timeline([{ ...VIDEO_CLIP, fit: "stretch" }]))
    ).toThrow(SAVED_TIMELINE_INVALID_MESSAGE)
  })

  it("still accepts a picture saved before it could move", () => {
    const parsed = requireCanonicalTimeline(timeline([IMAGE_CLIP]))
    expect(parsed.tracks[0].clips[0]).toEqual(IMAGE_CLIP)
    expect(parsed.tracks[0].clips[0].motion).toBeUndefined()
  })

  it("accepts a picture set to push in", () => {
    const parsed = requireCanonicalTimeline(
      timeline([{ ...IMAGE_CLIP, motion: "push-in" }])
    )
    expect(parsed.tracks[0].clips[0].motion).toBe("push-in")
  })

  it("rejects a move it does not know", () => {
    expect(() =>
      requireCanonicalTimeline(timeline([{ ...IMAGE_CLIP, motion: "spin" }]))
    ).toThrow(SAVED_TIMELINE_INVALID_MESSAGE)
  })

  it("still accepts a clip saved before colour existed", () => {
    const parsed = requireCanonicalTimeline(timeline([VIDEO_CLIP]))
    expect(parsed.tracks[0].clips[0]).toEqual(VIDEO_CLIP)
  })

  it("accepts a clip lifted and made stronger", () => {
    const parsed = requireCanonicalTimeline(
      timeline([
        { ...VIDEO_CLIP, brightness: 0.2, contrast: 1.1, saturation: 1.4 },
      ])
    )
    expect(parsed.tracks[0].clips[0]).toMatchObject({
      brightness: 0.2,
      contrast: 1.1,
      saturation: 1.4,
    })
  })

  it("rejects colour past the sliders' ends", () => {
    for (const colour of [
      { brightness: 0.8 },
      { contrast: 0.1 },
      { saturation: 3 },
    ]) {
      expect(() =>
        requireCanonicalTimeline(timeline([{ ...VIDEO_CLIP, ...colour }]))
      ).toThrow(SAVED_TIMELINE_INVALID_MESSAGE)
    }
  })

  it("accepts a clip turned down and sped up", () => {
    const parsed = requireCanonicalTimeline(
      timeline([{ ...VIDEO_CLIP, volume: 0.2, speed: 2 }])
    )
    expect(parsed.tracks[0].clips[0].volume).toBe(0.2)
    expect(parsed.tracks[0].clips[0].speed).toBe(2)
  })

  it("refuses a volume louder than the file, which nothing can play", () => {
    expect(() =>
      requireCanonicalTimeline(timeline([{ ...VIDEO_CLIP, volume: 2 }]))
    ).toThrowError(SAVED_TIMELINE_INVALID_MESSAGE)
  })

  it("refuses a speed beyond what the players allow", () => {
    expect(() =>
      requireCanonicalTimeline(timeline([{ ...VIDEO_CLIP, speed: 8 }]))
    ).toThrowError(SAVED_TIMELINE_INVALID_MESSAGE)
    expect(() =>
      requireCanonicalTimeline(timeline([{ ...VIDEO_CLIP, speed: 0.1 }]))
    ).toThrowError(SAVED_TIMELINE_INVALID_MESSAGE)
  })

  it("refuses a clip kind the editor cannot draw", () => {
    expect(() =>
      requireCanonicalTimeline(timeline([{ ...VIDEO_CLIP, kind: "sticker" }]))
    ).toThrowError(SAVED_TIMELINE_INVALID_MESSAGE)
  })

  it("refuses a text clip with no font, because nothing could render it", () => {
    expect(() =>
      requireCanonicalTimeline(
        timeline([
          {
            id: "clip-2",
            kind: "text",
            name: "Title",
            startMs: 0,
            durationMs: 3000,
            trimStartMs: 0,
            text: "Hello",
          },
        ])
      )
    ).toThrowError(SAVED_TIMELINE_INVALID_MESSAGE)
  })

  it("accepts a text clip once it names the app's font", () => {
    const parsed = requireCanonicalTimeline(
      timeline([
        {
          id: "clip-2",
          kind: "text",
          name: "Title",
          startMs: 0,
          durationMs: 3000,
          trimStartMs: 0,
          text: "Hello",
          fontId: "inter",
        },
      ])
    )
    expect(parsed.tracks[0].clips[0].fontId).toBe("inter")
  })

  it("refuses a font this app does not have", () => {
    expect(() =>
      requireCanonicalTimeline(
        timeline([
          {
            id: "clip-2",
            kind: "text",
            name: "Title",
            startMs: 0,
            durationMs: 3000,
            trimStartMs: 0,
            text: "Hello",
            fontId: "anton",
          },
        ])
      )
    ).toThrowError(SAVED_TIMELINE_INVALID_MESSAGE)
  })

  it("drops nothing silently — an unknown field is a refusal", () => {
    expect(() =>
      requireCanonicalTimeline(timeline([{ ...VIDEO_CLIP, hue: 0.5 }]))
    ).toThrowError(SAVED_TIMELINE_INVALID_MESSAGE)
  })

  it("refuses negative or infinite timings", () => {
    expect(() =>
      requireCanonicalTimeline(timeline([{ ...VIDEO_CLIP, startMs: -1 }]))
    ).toThrowError(SAVED_TIMELINE_INVALID_MESSAGE)
    expect(() =>
      requireCanonicalTimeline(
        timeline([{ ...VIDEO_CLIP, durationMs: Number.POSITIVE_INFINITY }])
      )
    ).toThrowError(SAVED_TIMELINE_INVALID_MESSAGE)
  })

  it("refuses an aspect ratio the stage has no size for", () => {
    expect(() =>
      requireCanonicalTimeline({ aspect: "21:9", tracks: [] })
    ).toThrowError(SAVED_TIMELINE_INVALID_MESSAGE)
  })

  it("keeps a transition descriptor as written", () => {
    const parsed = requireCanonicalTimeline(
      timeline([
        VIDEO_CLIP,
        {
          ...VIDEO_CLIP,
          id: "clip-3",
          startMs: 4000,
          transition: { kind: "crossfade", durationMs: 500 },
        },
      ])
    )
    expect(parsed.tracks[0].clips[1].transition).toEqual({
      kind: "crossfade",
      durationMs: 500,
    })
  })
})

describe("createTimelineSnapshot", () => {
  it("carries only the two fields that are saved", () => {
    const snapshot = createTimelineSnapshot({
      ...timeline([VIDEO_CLIP]),
      aspect: "16:9",
    } as never)
    expect(Object.keys(snapshot).sort()).toEqual(["aspect", "tracks"])
  })
})

describe("parseTimelineForReset", () => {
  it("opens a broken project empty, with the reason attached", () => {
    const result = parseTimelineForReset({ tracks: "nope", aspect: "9:16" })
    expect(result.timeline).toEqual(createEmptyTimeline())
    expect(result.error).toBe(SAVED_TIMELINE_INVALID_MESSAGE)
  })

  it("reports no error for a timeline that is fine", () => {
    const result = parseTimelineForReset(timeline([VIDEO_CLIP]))
    expect(result.error).toBeNull()
    expect(result.timeline.tracks[0].clips).toHaveLength(1)
  })
})
