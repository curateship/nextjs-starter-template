import { describe, expect, it } from "vitest"

import {
  landMovingShot,
  MOVING_STILL_NOT_FULL_FRAME_MESSAGE,
  MOVING_STILL_TOO_LONG_MESSAGE,
  stillRefusal,
  stillShotAspect,
  stillShotLengths,
} from "@/lib/video/moving-still"
import type { ProjectTimeline } from "@/lib/video/timeline-schema"

type Clip = ProjectTimeline["tracks"][number]["clips"][number]

function clip(overrides: Partial<Clip>): Clip {
  return {
    id: "clip",
    kind: "image",
    name: "Lighthouse",
    startMs: 0,
    durationMs: 4000,
    trimStartMs: 0,
    mediaId: "still",
    ...overrides,
  }
}

/** Scene six, the lighthouse still as scene seven, scene eight; voice and words above. */
function seededTracks(still: Partial<Clip> = {}): ProjectTimeline["tracks"] {
  return [
    {
      id: "pictures",
      muted: false,
      clips: [
        clip({ id: "six", kind: "video", mediaId: "six-file", startMs: 0, durationMs: 5000 }),
        clip({
          id: "seven",
          startMs: 5000,
          durationMs: 4000,
          fit: "cover",
          motion: "push-in",
          brightness: 0.1,
          transition: { kind: "crossfade", durationMs: 500 },
          pictureFadeOutMs: 300,
          ...still,
        }),
        clip({ id: "eight", kind: "video", mediaId: "eight-file", startMs: 9000, durationMs: 6000 }),
      ],
    },
    {
      id: "voice",
      muted: false,
      clips: [clip({ id: "voice-1", kind: "audio", mediaId: "voice-file", startMs: 0, durationMs: 15000 })],
    },
  ]
}

function starts(tracks: ProjectTimeline["tracks"]) {
  return tracks.flatMap((track) =>
    track.clips.map((item) => `${track.id}:${item.startMs}-${item.startMs + item.durationMs}`)
  )
}

let made = 0
const newId = () => `piece-${(made += 1)}`

describe("which lengths a picture can ask for", () => {
  it("offers 4, 6 or 8 seconds that cover a short picture", () => {
    expect(stillShotLengths(4000)).toEqual([4, 6, 8])
    expect(stillShotLengths(5200)).toEqual([6, 8])
    expect(stillShotLengths(8000)).toEqual([8])
  })

  it("offers only the shortest run of pieces that covers a longer picture", () => {
    expect(stillShotLengths(10_000)).toEqual([16])
    expect(stillShotLengths(16_000)).toEqual([16])
    expect(stillShotLengths(30_000)).toEqual([32])
    expect(stillShotLengths(33_000)).toEqual([])
  })

  it("refuses a picture over 32 seconds or smaller than the frame", () => {
    expect(stillRefusal(clip({ durationMs: 33_000 }))).toBe(MOVING_STILL_TOO_LONG_MESSAGE)
    expect(stillRefusal(clip({ scale: 0.3 }))).toBe(MOVING_STILL_NOT_FULL_FRAME_MESSAGE)
    expect(stillRefusal(clip({ durationMs: 32_000, scale: 1 }))).toBeNull()
  })
})

describe("the shape a picture's shot is made in", () => {
  it("follows the picture, and the project for a square one", () => {
    expect(stillShotAspect(1920, 1080, "9:16")).toBe("16:9")
    expect(stillShotAspect(1080, 1920, "16:9")).toBe("9:16")
    expect(stillShotAspect(1000, 1000, "16:9")).toBe("16:9")
    expect(stillShotAspect(1000, 1000, "1:1")).toBe("9:16")
  })
})

describe("landing a moving shot", () => {
  it("replaces the picture in the same place and moves nothing else", () => {
    const tracks = seededTracks()
    const landed = landMovingShot(tracks, {
      clipId: "seven",
      stillMediaId: "still",
      pieces: [{ mediaId: "shot", url: "https://media.test/shot.mp4", durationMs: 4000 }],
      newId,
    })

    expect(landed.outcome).toBe("replaced")
    expect(starts(landed.tracks)).toEqual(starts(tracks))
    const moving = landed.tracks[0].clips[1]
    expect(moving).toMatchObject({
      id: "seven",
      kind: "video",
      mediaId: "shot",
      url: "https://media.test/shot.mp4",
      startMs: 5000,
      durationMs: 4000,
      trimStartMs: 0,
      sourceDurationMs: 4000,
      muted: true,
      fit: "cover",
      brightness: 0.1,
      transition: { kind: "crossfade", durationMs: 500 },
      pictureFadeOutMs: 300,
    })
    expect(moving.motion).toBeUndefined()
    // Untouched clips are the very same objects.
    expect(landed.tracks[0].clips[0]).toBe(tracks[0].clips[0])
    expect(landed.tracks[1]).toBe(tracks[1])
  })

  it("trims a longer shot back to the picture's length", () => {
    const landed = landMovingShot(seededTracks({ durationMs: 3200, startMs: 5000 }), {
      clipId: "seven",
      stillMediaId: "still",
      pieces: [{ mediaId: "shot", durationMs: 4000 }],
      newId,
    })
    expect(landed.tracks[0].clips[1]).toMatchObject({ durationMs: 3200, sourceDurationMs: 4000 })
  })

  it("lays a long shot's pieces end to end in the picture's place", () => {
    // A 10 second picture, so the gap after it closes at 15s, where eight starts.
    const tracks = seededTracks({ durationMs: 10_000, startMs: 5000 })
    tracks[0].clips[2] = { ...tracks[0].clips[2], startMs: 15_000 }
    const landed = landMovingShot(tracks, {
      clipId: "seven",
      stillMediaId: "still",
      pieces: [
        { mediaId: "part-1", durationMs: 8000 },
        { mediaId: "part-2", durationMs: 8000 },
      ],
      newId,
    })

    expect(starts(landed.tracks)).toEqual([
      "pictures:0-5000",
      "pictures:5000-13000",
      "pictures:13000-15000",
      "pictures:15000-21000",
      "voice:0-15000",
    ])
    const [first, second] = landed.tracks[0].clips.slice(1, 3)
    expect(first).toMatchObject({ id: "seven", mediaId: "part-1", pictureFadeOutMs: undefined })
    expect(first.transition).toEqual({ kind: "crossfade", durationMs: 500 })
    expect(second).toMatchObject({ mediaId: "part-2", durationMs: 2000, pictureFadeOutMs: 300 })
    expect(second.id).not.toBe("seven")
    expect(second.transition).toBeUndefined()
  })

  it("says gone, and changes nothing, when the picture was deleted or replaced", () => {
    const tracks = seededTracks()
    const deleted = tracks.map((track) => ({
      ...track,
      clips: track.clips.filter((item) => item.id !== "seven"),
    }))
    const shot = {
      clipId: "seven",
      stillMediaId: "still",
      pieces: [{ mediaId: "shot", durationMs: 4000 }],
      newId,
    }
    expect(landMovingShot(deleted, shot)).toEqual({ tracks: deleted, outcome: "gone" })

    const replaced = seededTracks({ mediaId: "another-picture" })
    expect(landMovingShot(replaced, shot).outcome).toBe("gone")
    // The picture's file was deleted from Media, so the shot cannot name it.
    expect(landMovingShot(tracks, { ...shot, stillMediaId: null }).outcome).toBe("gone")
  })
})
