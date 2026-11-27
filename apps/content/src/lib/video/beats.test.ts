import { describe, expect, it } from "vitest"

import { BEAT_SAMPLE_RATE, beatTimelineTimes, findBeats } from "./beats"

/** A click every beat from `firstMs`, over a little hiss, like a drum loop. */
function clickTrack(bpm: number, seconds: number, firstMs = 250, hiss = 0.02) {
  const samples = new Float32Array(Math.round(seconds * BEAT_SAMPLE_RATE))
  let seed = 7
  for (let at = 0; at < samples.length; at++) {
    seed = (seed * 16807) % 2147483647
    samples[at] = hiss * ((seed / 2147483647) * 2 - 1)
  }
  const period = (60 / bpm) * BEAT_SAMPLE_RATE
  for (let beat = (firstMs / 1000) * BEAT_SAMPLE_RATE; beat < samples.length; beat += period) {
    for (let at = 0; at < 400 && beat + at < samples.length; at++) {
      samples[Math.round(beat) + at] += 0.8 * Math.sin((2 * Math.PI * 1000 * at) / BEAT_SAMPLE_RATE) * Math.exp(-at / 60)
    }
  }
  return samples
}

describe("finding the beats", () => {
  it.each([90, 120, 128, 140])("finds every beat of a %i a minute click track", (bpm) => {
    const found = findBeats(clickTrack(bpm, 30))
    expect(found.tempo).toBeCloseTo(bpm, 0)
    const periodMs = 60_000 / bpm
    expect(found.beats.length).toBeGreaterThanOrEqual(Math.floor((30_000 - 250) / periodMs))
    found.beats.forEach((beat, index) => {
      expect(Math.abs(beat - (250 + index * periodMs))).toBeLessThan(15)
    })
  })

  it("puts the ticks half a second apart at 120 a minute", () => {
    const { beats } = findBeats(clickTrack(120, 10))
    expect(beats[1] - beats[0]).toBeCloseTo(500, -1)
  })

  it("finds no beat in a held tone or in silence", () => {
    const tone = Float32Array.from({ length: BEAT_SAMPLE_RATE * 10 }, (_, at) =>
      0.3 * Math.sin((2 * Math.PI * 220 * at) / BEAT_SAMPLE_RATE)
    )
    expect(findBeats(tone)).toEqual({ beats: [], tempo: null })
    expect(findBeats(new Float32Array(BEAT_SAMPLE_RATE * 10))).toEqual({ beats: [], tempo: null })
  })

  it("finds nothing in a file too short to repeat", () => {
    expect(findBeats(clickTrack(120, 2)).beats).toEqual([])
  })
})

describe("where a music clip's beats land on the timeline", () => {
  const beats = [0, 500, 1000, 1500, 2000, 2500]

  it("moves them with the clip and drops the ones trimmed off", () => {
    const clip = { startMs: 10_000, durationMs: 1_200, trimStartMs: 900 }
    expect(beatTimelineTimes(clip, beats)).toEqual([10_100, 10_600, 11_100])
  })

  it("spreads them out on a clip played slower", () => {
    const clip = { startMs: 0, durationMs: 4_000, trimStartMs: 0, speed: 0.5 }
    expect(beatTimelineTimes(clip, beats).slice(0, 3)).toEqual([0, 1_000, 2_000])
  })
})
