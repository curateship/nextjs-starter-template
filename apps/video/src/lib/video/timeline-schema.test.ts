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

describe("requireCanonicalTimeline", () => {
  it("accepts a plain video timeline", () => {
    const parsed = requireCanonicalTimeline(timeline([VIDEO_CLIP]))
    expect(parsed.tracks[0].clips[0].name).toBe("Hook.mp4")
    expect(parsed.aspect).toBe("9:16")
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
      requireCanonicalTimeline(
        timeline([{ ...VIDEO_CLIP, volume: 0.5 }])
      )
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
