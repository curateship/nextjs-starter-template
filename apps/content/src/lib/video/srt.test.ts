import { describe, expect, it } from "vitest"

import { srtTime, subtitleLines, toSrt } from "./srt"

const caption = (startMs: number, durationMs: number, text: string) => ({
  kind: "text",
  startMs,
  durationMs,
  text,
  wordTimes: [{ startMs: 0, endMs: 100 }],
})

describe("subtitles for Promo", () => {
  it("writes times the way an .srt file does", () => {
    expect(srtTime(1250)).toBe("00:00:01,250")
    expect(srtTime(3_723_004)).toBe("01:02:03,004")
    expect(srtTime(-5)).toBe("00:00:00,000")
  })

  it("keeps only words written from speech, in time order", () => {
    const timeline = {
      tracks: [
        { clips: [caption(2000, 1000, "second"), { kind: "text", startMs: 0, durationMs: 5000, text: "A title" }] },
        { clips: [caption(0, 1500, " first \n  line "), { kind: "text", startMs: 4000, durationMs: 500, text: "voice", spokenBy: "v1" }] },
      ],
    }
    expect(toSrt(subtitleLines(timeline))).toBe(
      "1\n00:00:00,000 --> 00:00:01,500\nfirst\nline\n\n2\n00:00:02,000 --> 00:00:03,000\nsecond\n\n3\n00:00:04,000 --> 00:00:04,500\nvoice\n"
    )
  })

  it("cuts to an export's range and counts from its start", () => {
    const timeline = { tracks: [{ clips: [caption(0, 1000, "before"), caption(1500, 1000, "across"), caption(5000, 500, "after")] }] }
    expect(subtitleLines(timeline, { startMs: 2000, endMs: 4000 })).toEqual([{ startMs: 0, endMs: 500, text: "across" }])
  })

  it("is empty with no captions", () => {
    expect(toSrt(subtitleLines({ tracks: [] }))).toBe("")
  })
})
