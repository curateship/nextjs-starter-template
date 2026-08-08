import { describe, expect, it } from "vitest"

import {
  loudnormApplyFilter,
  loudnormMeasureFilter,
  LOUDNESS_RANGE_LU,
  LOUDNESS_TARGET_LUFS,
  LOUDNESS_TRUE_PEAK_DBTP,
  parseLoudnormMeasurement,
} from "./audio-loudness"

const MEASUREMENT = {
  inputI: -23.4,
  inputTp: -5.2,
  inputLra: 9.1,
  inputThresh: -33.6,
  targetOffset: 0.3,
}

function stderrWith(values: Record<string, string>) {
  return `
[Parsed_loudnorm_0 @ 0x123] some noise
{
  ${Object.entries(values)
    .map(([key, value]) => `"${key}" : "${value}"`)
    .join(",\n  ")}
}
`
}

describe("the filters", () => {
  it("asks for the platform target in both passes", () => {
    const targets = `I=${LOUDNESS_TARGET_LUFS}:TP=${LOUDNESS_TRUE_PEAK_DBTP}:LRA=${LOUDNESS_RANGE_LU}`
    expect(loudnormMeasureFilter()).toContain(targets)
    expect(loudnormApplyFilter(MEASUREMENT)).toContain(targets)
  })

  it("only asks for the numbers in the first pass", () => {
    expect(loudnormMeasureFilter()).toContain("print_format=json")
    expect(loudnormApplyFilter(MEASUREMENT)).not.toContain("print_format")
  })

  it("applies what was measured as one fixed correction", () => {
    const filter = loudnormApplyFilter(MEASUREMENT)
    expect(filter).toContain("measured_I=-23.4")
    expect(filter).toContain("measured_TP=-5.2")
    expect(filter).toContain("measured_LRA=9.1")
    expect(filter).toContain("measured_thresh=-33.6")
    expect(filter).toContain("offset=0.3")
    // One fixed gain rather than riding the level, so the ducking keeps shape.
    expect(filter).toContain("linear=true")
  })

  it("puts the sample rate back where the encoder can take it", () => {
    expect(loudnormApplyFilter(MEASUREMENT)).toContain("aresample=48000")
  })
})

describe("reading the measurement back", () => {
  it("finds the numbers in what ffmpeg printed", () => {
    const parsed = parseLoudnormMeasurement(
      stderrWith({
        input_i: "-23.4",
        input_tp: "-5.2",
        input_lra: "9.1",
        input_thresh: "-33.6",
        target_offset: "0.3",
      })
    )
    expect(parsed).toEqual(MEASUREMENT)
  })

  it("takes the last block when ffmpeg printed more than one", () => {
    const first = stderrWith({
      input_i: "-30.0",
      input_tp: "-9.0",
      input_lra: "5.0",
      input_thresh: "-40.0",
      target_offset: "1.0",
    })
    const second = stderrWith({
      input_i: "-23.4",
      input_tp: "-5.2",
      input_lra: "9.1",
      input_thresh: "-33.6",
      target_offset: "0.3",
    })
    expect(parseLoudnormMeasurement(first + second)?.inputI).toBe(-23.4)
  })

  it("gives nothing back for a silent mix", () => {
    // A silent file reports "-inf", and there is no loudness there to correct.
    expect(
      parseLoudnormMeasurement(
        stderrWith({
          input_i: "-inf",
          input_tp: "-inf",
          input_lra: "0.0",
          input_thresh: "-inf",
          target_offset: "0.0",
        })
      )
    ).toBeNull()
  })

  it("gives nothing back when the block is missing or broken", () => {
    expect(parseLoudnormMeasurement("no json here at all")).toBeNull()
    expect(parseLoudnormMeasurement("{ not json }")).toBeNull()
    expect(
      parseLoudnormMeasurement('{ "input_i" : "-23.4" }')
    ).toBeNull()
  })
})
