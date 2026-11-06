import { describe, expect, it } from "vitest"

import {
  encodeWav,
  RECORDING_EMPTY_MESSAGE,
  RECORDING_MAX_BYTES,
  RECORDING_MISSING_MESSAGE,
  RECORDING_SAMPLE_RATE,
  RECORDING_TOO_LONG_MESSAGE,
  RECORDING_UNREADABLE_MESSAGE,
  recordingRefusal,
  wavDurationMs,
} from "@/lib/video/recorded-voiceover"

describe("a recording's WAV file", () => {
  it("says how long it runs from its own header", () => {
    const twoSeconds = new Float32Array(RECORDING_SAMPLE_RATE * 2)
    const bytes = encodeWav(twoSeconds, RECORDING_SAMPLE_RATE)
    expect(bytes.byteLength).toBe(44 + RECORDING_SAMPLE_RATE * 2 * 2)
    expect(wavDurationMs(bytes)).toBe(2_000)
  })

  it("keeps loud samples inside 16 bits", () => {
    const bytes = encodeWav(new Float32Array([2, -2, 0.5]), RECORDING_SAMPLE_RATE)
    const view = new DataView(bytes.buffer)
    expect(view.getInt16(44, true)).toBe(32_767)
    expect(view.getInt16(46, true)).toBe(-32_768)
    expect(view.getInt16(48, true)).toBe(16_383)
  })

  it("counts only the sound the file holds, not what its header claims", () => {
    const bytes = encodeWav(new Float32Array(RECORDING_SAMPLE_RATE), RECORDING_SAMPLE_RATE)
    new DataView(bytes.buffer).setUint32(40, 0xffff_ffff, true)
    expect(wavDurationMs(bytes)).toBe(1_000)
  })

  it("is null for anything that is not plain WAV", () => {
    expect(wavDurationMs(new TextEncoder().encode("not a sound at all"))).toBeNull()
    const compressed = encodeWav(new Float32Array(10), RECORDING_SAMPLE_RATE)
    new DataView(compressed.buffer).setUint16(20, 3, true)
    expect(wavDurationMs(compressed)).toBeNull()
  })
})

describe("recordingRefusal", () => {
  it("keeps a recording up to five minutes", () => {
    expect(recordingRefusal(1_000, 5 * 60_000)).toBeNull()
  })

  it("says why one cannot be kept", () => {
    expect(recordingRefusal(0, null)).toBe(RECORDING_MISSING_MESSAGE)
    expect(recordingRefusal(1_000, null)).toBe(RECORDING_UNREADABLE_MESSAGE)
    expect(recordingRefusal(44, 0)).toBe(RECORDING_EMPTY_MESSAGE)
    expect(recordingRefusal(1_000, 5 * 60_000 + 1_001)).toBe(RECORDING_TOO_LONG_MESSAGE)
    expect(recordingRefusal(RECORDING_MAX_BYTES + 1, 1_000)).toBe(RECORDING_TOO_LONG_MESSAGE)
  })
})
