import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  LOUDNESS_RANGE_LU,
  LOUDNESS_TARGET_LUFS,
  LOUDNESS_TRUE_PEAK_DBTP,
  loudnormApplyFilter,
  loudnormMeasureFilter,
  parseLoudnormMeasurement,
} from "../lib/audio-loudness.ts"

// A real ffmpeg measurement-pass tail: the JSON block, then the muxing summary.
function stderrTail(values: Record<string, string>) {
  const body = Object.entries(values)
    .map(([key, value]) => `\t"${key}" : "${value}"`)
    .join(",\n")
  return [
    "[Parsed_loudnorm_0 @ 0xb91038a80] ",
    `{\n${body}\n}`,
    "[out#0/null @ 0xb91038300] video:0KiB audio:2255KiB subtitle:0KiB",
    "size=N/A time=00:00:06.10 bitrate=N/A speed=62.7x",
  ].join("\n")
}

const MEASURED = {
  input_i: "-27.61",
  input_tp: "-4.47",
  input_lra: "9.20",
  input_thresh: "-38.14",
  output_i: "-14.02",
  output_tp: "-1.50",
  output_lra: "7.10",
  output_thresh: "-24.53",
  normalization_type: "dynamic",
  target_offset: "-0.83",
}

describe("loudnorm filters", () => {
  it("measures with the export targets and asks for JSON", () => {
    assert.equal(
      loudnormMeasureFilter(),
      `loudnorm=I=${LOUDNESS_TARGET_LUFS}:TP=${LOUDNESS_TRUE_PEAK_DBTP}:LRA=${LOUDNESS_RANGE_LU}:print_format=json`
    )
  })

  it("applies the measurement as a linear correction, resampled for AAC", () => {
    const measurement = parseLoudnormMeasurement(stderrTail(MEASURED))
    assert.ok(measurement)
    assert.equal(
      loudnormApplyFilter(measurement),
      "loudnorm=I=-14:TP=-1.5:LRA=20:measured_I=-27.61:measured_TP=-4.47:" +
        "measured_LRA=9.2:measured_thresh=-38.14:offset=-0.83:linear=true," +
        "aresample=48000"
    )
  })
})

describe("parseLoudnormMeasurement", () => {
  it("reads the input measurements out of an ffmpeg stderr tail", () => {
    assert.deepEqual(parseLoudnormMeasurement(stderrTail(MEASURED)), {
      inputI: -27.61,
      inputTp: -4.47,
      inputLra: 9.2,
      inputThresh: -38.14,
      targetOffset: -0.83,
    })
  })

  it("takes the last block when a tail carries more than one", () => {
    const tail = `${stderrTail(MEASURED)}\n${stderrTail({
      ...MEASURED,
      input_i: "-9.50",
    })}`
    assert.equal(parseLoudnormMeasurement(tail)?.inputI, -9.5)
  })

  it("returns null for a silent mix (loudnorm reports -inf)", () => {
    const silent = stderrTail({
      ...MEASURED,
      input_i: "-inf",
      input_tp: "-inf",
      input_thresh: "-inf",
    })
    assert.equal(parseLoudnormMeasurement(silent), null)
  })

  it("returns null when the tail has no measurement or is truncated", () => {
    assert.equal(parseLoudnormMeasurement(""), null)
    assert.equal(
      parseLoudnormMeasurement("[out#0/null] video:0KiB audio:12KiB"),
      null
    )
    assert.equal(
      parseLoudnormMeasurement('{\n\t"input_i" : "-27.61",\n\t"input_tp"'),
      null
    )
  })
})
