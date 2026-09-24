import { describe, expect, it } from "vitest"

import { DEFAULT_CAPTION_LOOK } from "@/lib/video/caption-look"
import {
  readSavedCaptions,
  VOICEOVER_NO_ROOM_MESSAGE,
  voiceoverClips,
  voiceoverName,
  voiceoverRefusal,
} from "@/lib/video/saved-voiceovers"

const voiceover = {
  mediaId: "media-1",
  url: "https://video-media.example.test/voice.mp3",
  name: "Thanks for watching",
  durationMs: 2400,
  captions: [
    {
      startMs: 0,
      endMs: 1200,
      text: "Thanks for watching,",
      words: [
        { startMs: 0, endMs: 500 },
        { startMs: 500, endMs: 1200 },
      ],
    },
    { startMs: 1200, endMs: 2400, text: "see you soon." },
  ],
}

describe("voiceoverClips", () => {
  it("starts the sound at the playhead and moves every caption with it", () => {
    const { audio, captions } = voiceoverClips(voiceover, 5000, DEFAULT_CAPTION_LOOK)

    expect(audio).toMatchObject({
      kind: "audio",
      mediaId: "media-1",
      startMs: 5000,
      durationMs: 2400,
      trimStartMs: 0,
      sourceDurationMs: 2400,
    })
    expect(captions.map((clip) => [clip.startMs, clip.durationMs])).toEqual([
      [5000, 1200],
      [6200, 1200],
    ])
  })

  it("keeps each word's time measured from its own caption", () => {
    const { captions } = voiceoverClips(voiceover, 5000, DEFAULT_CAPTION_LOOK)
    expect(captions[0]).toMatchObject({
      wordTimes: [
        { startMs: 0, endMs: 500 },
        { startMs: 500, endMs: 1200 },
      ],
    })
    expect(captions[1]).toMatchObject({ wordTimes: undefined })
  })

  it("lands at a whole millisecond, never before the start", () => {
    expect(voiceoverClips(voiceover, 1234.6, DEFAULT_CAPTION_LOOK).audio.startMs).toBe(1235)
    expect(voiceoverClips(voiceover, -40, DEFAULT_CAPTION_LOOK).audio.startMs).toBe(0)
  })

  it("brings no captions when none were kept", () => {
    const { captions } = voiceoverClips(
      { ...voiceover, captions: [] },
      0,
      DEFAULT_CAPTION_LOOK
    )
    expect(captions).toEqual([])
  })
})

describe("voiceoverName", () => {
  it("shortens a long script and names an empty one", () => {
    expect(voiceoverName("  Thanks   for watching ")).toBe("Thanks for watching")
    expect(voiceoverName("a".repeat(60))).toBe(`${"a".repeat(39)}…`)
    expect(voiceoverName("  ")).toBe("Voiceover")
  })
})

describe("readSavedCaptions", () => {
  it("reads what was written and refuses anything else", () => {
    expect(readSavedCaptions(voiceover.captions)).toEqual(voiceover.captions)
    expect(() => readSavedCaptions([{ text: "no times" }])).toThrow()
  })
})

describe("voiceoverRefusal", () => {
  const lanes = (count: number) =>
    Array.from({ length: count }, (_, index) => ({
      id: `lane-${index}`,
      muted: false,
      clips: [],
    }))

  it("needs a lane for the sound and one for the words", () => {
    expect(voiceoverRefusal(lanes(48), voiceover.captions)).toBeNull()
    expect(voiceoverRefusal(lanes(49), voiceover.captions)).toBe(
      VOICEOVER_NO_ROOM_MESSAGE
    )
  })

  it("needs only the sound's lane when nothing is said", () => {
    expect(voiceoverRefusal(lanes(49), [])).toBeNull()
    expect(voiceoverRefusal(lanes(50), [])).toBe(VOICEOVER_NO_ROOM_MESSAGE)
  })
})

