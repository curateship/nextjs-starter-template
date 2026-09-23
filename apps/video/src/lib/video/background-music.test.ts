import { describe, expect, it } from "vitest"

import {
  clipFadeOutGain,
  MUSIC_FADE_OUT_MS,
  MUSIC_NO_ROOM_MESSAGE,
  MUSIC_START_VOLUME,
  MUSIC_TOO_SHORT_TO_LOOP_MESSAGE,
  MUSIC_UNREADABLE_MESSAGE,
  musicRefusal,
  planMusicClips,
} from "./background-music"
import { MAX_TIMELINE_TRACKS, timelineSchema } from "./timeline-schema"

const source = (sourceDurationMs: number) => ({
  mediaId: "song",
  name: "Song.mp3",
  url: "https://media.example.test/song.mp3",
  sourceDurationMs,
})

const spans = (clips: ReturnType<typeof planMusicClips>) =>
  clips.map((clip) => [clip.startMs, clip.durationMs, clip.fadeOutMs ?? 0])

describe("laying music under a project", () => {
  it("cuts a longer track at the end of the project and fades it out", () => {
    expect(spans(planMusicClips(source(90_000), 30_000))).toEqual([
      [0, 30_000, MUSIC_FADE_OUT_MS],
    ])
  })

  it("plays a track that is exactly the right length once, with no fade", () => {
    expect(spans(planMusicClips(source(30_000), 30_000))).toEqual([
      [0, 30_000, 0],
    ])
  })

  it("repeats a shorter track and fades out the piece cut short at the end", () => {
    // 25s of video from a 10s track: two whole plays, then 5s faded out.
    expect(spans(planMusicClips(source(10_000), 25_000))).toEqual([
      [0, 10_000, 0],
      [10_000, 10_000, 0],
      [20_000, 5_000, MUSIC_FADE_OUT_MS],
    ])
  })

  it("drops a leftover piece too short to sound like anything", () => {
    // 21s from a 10s track leaves 1s, which is dropped: the second play ends
    // on its own last note one second before the video does.
    expect(spans(planMusicClips(source(10_000), 21_000))).toEqual([
      [0, 10_000, 0],
      [10_000, 10_000, 0],
    ])
  })

  it("lays a track at its own length when the project is still empty", () => {
    expect(spans(planMusicClips(source(12_000), 0))).toEqual([[0, 12_000, 0]])
  })

  it("fades over the whole clip when the project is shorter than the fade", () => {
    expect(spans(planMusicClips(source(60_000), 1_500))).toEqual([
      [0, 1_500, 1_500],
    ])
  })

  it("starts every piece at the top of the file, quieter, and saves cleanly", () => {
    const clips = planMusicClips(source(10_000), 25_000)
    for (const clip of clips) {
      expect(clip).toMatchObject({
        kind: "audio",
        mediaId: "song",
        trimStartMs: 0,
        sourceDurationMs: 10_000,
        volume: MUSIC_START_VOLUME,
      })
    }
    expect(new Set(clips.map((clip) => clip.id)).size).toBe(clips.length)
    expect(
      timelineSchema.safeParse({
        aspect: "9:16",
        tracks: [{ id: "music", muted: false, duck: true, clips }],
      }).success
    ).toBe(true)
  })

  it("gives nothing for a file whose length could not be read", () => {
    expect(planMusicClips(source(0), 25_000)).toEqual([])
    expect(planMusicClips(source(Number.NaN), 25_000)).toEqual([])
  })
})

describe("when music cannot be laid down", () => {
  const clips = planMusicClips(source(10_000), 25_000)

  it("says so when the timeline has no lanes left", () => {
    const tracks = Array.from({ length: MAX_TIMELINE_TRACKS }, (_, index) => ({
      id: `lane-${index}`,
      muted: false,
      clips: [],
    }))
    expect(musicRefusal(tracks, clips)).toBe(MUSIC_NO_ROOM_MESSAGE)
  })

  it("says so when the track would repeat more times than a lane holds", () => {
    // A one-second sound under ten minutes is 600 pieces; a lane holds 500.
    expect(musicRefusal([], planMusicClips(source(1_000), 600_000))).toBe(
      MUSIC_TOO_SHORT_TO_LOOP_MESSAGE
    )
  })

  it("stops making pieces once it is past what a lane holds", () => {
    const clips = planMusicClips(source(1), 600_000)
    expect(clips.length).toBeLessThan(510)
    expect(musicRefusal([], clips)).toBe(MUSIC_TOO_SHORT_TO_LOOP_MESSAGE)
  })

  it("says so when the file's length could not be read", () => {
    expect(musicRefusal([], [])).toBe(MUSIC_UNREADABLE_MESSAGE)
  })

  it("lets an ordinary track through", () => {
    expect(musicRefusal([], clips)).toBeNull()
  })
})

describe("the fade at the end of a clip", () => {
  const clip = { durationMs: 10_000, fadeOutMs: 2_000 }

  it("leaves the sound alone until the fade starts", () => {
    expect(clipFadeOutGain(clip, 0)).toBe(1)
    expect(clipFadeOutGain(clip, 8_000)).toBe(1)
  })

  it("slides evenly down to silence at the very end", () => {
    expect(clipFadeOutGain(clip, 9_000)).toBeCloseTo(0.5)
    expect(clipFadeOutGain(clip, 10_000)).toBe(0)
  })

  it("does nothing on a clip without one", () => {
    expect(clipFadeOutGain({ durationMs: 10_000 }, 9_999)).toBe(1)
  })
})
