import { describe, expect, it } from "vitest"

import {
  fadeLevelAt,
  fadeSliderValue,
  FADE_SLIDER_OFF,
  fitFadePair,
  formatFade,
  pictureFadeFilters,
  pictureFades,
  pictureFadesOverruled,
  soundFadeFilters,
  soundFadeGain,
  soundFades,
  storedFade,
} from "./clip-fades"
import { timelineSchema } from "./timeline-schema"

const clip = (patch: Record<string, unknown> = {}) => ({
  id: "c",
  kind: "video",
  startMs: 0,
  durationMs: 10_000,
  ...patch,
})

describe("two fades on one clip", () => {
  it("play as set when they fit", () => {
    expect(fitFadePair(3_000, 1_000, 10_000)).toEqual({
      inMs: 3_000,
      outMs: 1_000,
    })
  })

  it("both shrink by the same share when together they are longer than the clip", () => {
    expect(fitFadePair(3_000, 3_000, 4_000)).toEqual({
      inMs: 2_000,
      outMs: 2_000,
    })
    const uneven = fitFadePair(4_000, 2_000, 3_000)
    expect(uneven.inMs).toBeCloseTo(2_000)
    expect(uneven.outMs).toBeCloseTo(1_000)
  })

  it("cut a single fade to the clip's own length, as the music fade always was", () => {
    expect(fitFadePair(undefined, 5_000, 1_500)).toEqual({
      inMs: 0,
      outMs: 1_500,
    })
  })

  it("read nothing, a negative or a broken number as no fade", () => {
    expect(fitFadePair(undefined, undefined, 1_000)).toEqual({
      inMs: 0,
      outMs: 0,
    })
    expect(fitFadePair(-5, Number.NaN, 1_000)).toEqual({ inMs: 0, outMs: 0 })
  })
})

describe("how loud a faded sound is", () => {
  const faded = clip({ fadeInMs: 3_000, fadeOutMs: 2_000 })

  it("rises evenly from silence over the fade in", () => {
    expect(soundFadeGain(faded, 0)).toBe(0)
    expect(soundFadeGain(faded, 1_500)).toBeCloseTo(0.5)
    expect(soundFadeGain(faded, 3_000)).toBe(1)
  })

  it("is untouched between the fades and slides to silence at the end", () => {
    expect(soundFadeGain(faded, 8_000)).toBe(1)
    expect(soundFadeGain(faded, 9_000)).toBeCloseTo(0.5)
    expect(soundFadeGain(faded, 10_000)).toBe(0)
  })

  it("keeps a project saved with the old switch at its two second fade", () => {
    const old = clip({ kind: "audio", fadeOutMs: 2_000 })
    expect(soundFades(old)).toEqual({ inMs: 0, outMs: 2_000 })
    expect(soundFadeGain(old, 9_000)).toBeCloseTo(0.5)
  })

  it("never fades a picture or text clip's sound, which has none", () => {
    expect(soundFades(clip({ kind: "image", fadeInMs: 1_000 }))).toEqual({
      inMs: 0,
      outMs: 0,
    })
  })

  it("never goes above full or below silence outside the clip", () => {
    expect(fadeLevelAt({ inMs: 1_000, outMs: 0 }, 5_000, -500)).toBe(0)
    expect(fadeLevelAt({ inMs: 0, outMs: 1_000 }, 5_000, 6_000)).toBe(0)
    expect(fadeLevelAt({ inMs: 0, outMs: 0 }, 5_000, 2_000)).toBe(1)
  })
})

describe("a picture fade beside a transition", () => {
  const before = clip({ id: "a", startMs: 0, durationMs: 4_000 })
  const crossing = clip({
    id: "b",
    startMs: 4_000,
    durationMs: 4_000,
    pictureFadeInMs: 1_000,
    pictureFadeOutMs: 1_000,
    transition: { kind: "crossfade", durationMs: 500 },
  })

  it("loses its fade in to the crossfade coming into the clip", () => {
    expect(pictureFades(crossing, before, null)).toEqual({
      inMs: 0,
      outMs: 1_000,
    })
    expect(pictureFadesOverruled(crossing, before, null)).toEqual({
      in: true,
      out: false,
    })
  })

  it("loses its fade out to the crossfade into the next clip", () => {
    const outgoing = { ...before, pictureFadeOutMs: 1_000 }
    expect(pictureFades(outgoing, null, crossing)).toEqual({
      inMs: 0,
      outMs: 0,
    })
    expect(pictureFadesOverruled(outgoing, null, crossing).out).toBe(true)
  })

  it("keeps both fades when the clips do not touch, so nothing blends", () => {
    const apart = { ...crossing, startMs: 6_000 }
    expect(pictureFades(apart, before, null)).toEqual({
      inMs: 1_000,
      outMs: 1_000,
    })
  })

  it("fades text, which never blends", () => {
    expect(
      pictureFades(
        clip({ kind: "text", pictureFadeInMs: 500 }),
        null,
        null
      )
    ).toEqual({ inMs: 500, outMs: 0 })
  })

  it("has no picture to fade on a sound clip", () => {
    expect(
      pictureFades(clip({ kind: "audio", pictureFadeInMs: 500 }), null, null)
    ).toEqual({ inMs: 0, outMs: 0 })
  })
})

describe("the ffmpeg stages", () => {
  it("fades sound in from the clip's start and out before its end", () => {
    expect(
      soundFadeFilters(clip({ fadeInMs: 3_000, fadeOutMs: 2_000 }))
    ).toEqual(["afade=t=in:st=0:d=3.000", "afade=t=out:st=8.000:d=2.000"])
  })

  it("adds nothing at all to a clip without fades", () => {
    expect(soundFadeFilters(clip())).toEqual([])
    expect(pictureFadeFilters({ inMs: 0, outMs: 0 }, 0, 1_000)).toEqual([])
  })

  it("fades a picture's see-through in timeline time", () => {
    expect(pictureFadeFilters({ inMs: 0, outMs: 1_000 }, 2_000, 3_000)).toEqual([
      "format=yuva420p",
      "fade=t=out:st=4.000:d=1.000:alpha=1",
    ])
  })
})

describe("the slider", () => {
  it("has an off stop below 0.2 seconds", () => {
    expect(fadeSliderValue(undefined)).toBe(FADE_SLIDER_OFF)
    expect(storedFade(FADE_SLIDER_OFF)).toBeUndefined()
    expect(formatFade(FADE_SLIDER_OFF)).toBe("Off")
  })

  it("saves tenths of a second from 0.2 to 5", () => {
    expect(storedFade(0.2)).toBe(200)
    expect(storedFade(1.3)).toBe(1_300)
    expect(storedFade(5)).toBe(5_000)
    expect(formatFade(2)).toBe("2.0s")
  })

  it("shows an old two second music fade at 2.0", () => {
    expect(fadeSliderValue(2_000)).toBe(2)
  })

  it("saves only what the timeline accepts", () => {
    const timeline = (patch: Record<string, unknown>) =>
      timelineSchema.safeParse({
        aspect: "9:16",
        tracks: [
          {
            id: "t",
            muted: false,
            clips: [
              {
                id: "c",
                kind: "video",
                name: "Take",
                startMs: 0,
                durationMs: 1_000,
                trimStartMs: 0,
                ...patch,
              },
            ],
          },
        ],
      }).success
    expect(timeline({ fadeInMs: storedFade(0.2) })).toBe(true)
    expect(timeline({ pictureFadeOutMs: storedFade(5) })).toBe(true)
    expect(timeline({ pictureFadeInMs: 6_000 })).toBe(false)
    expect(timeline({ fadeInMs: 50 })).toBe(false)
  })
})
