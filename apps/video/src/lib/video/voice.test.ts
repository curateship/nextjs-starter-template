import { describe, expect, it } from "vitest"

import {
  alignmentToWords,
  createDefaultVoiceSettings,
  voiceoverRequestBody,
  wordsToCaptions,
} from "./voice"

/** "Hi there" said over one second, letter by letter. */
const ALIGNMENT = {
  characters: ["H", "i", " ", "t", "h", "e", "r", "e"],
  character_start_times_seconds: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7],
  character_end_times_seconds: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.9],
}

describe("turning letters with times into words with times", () => {
  it("starts a word at its first letter and ends it at its last", () => {
    expect(alignmentToWords(ALIGNMENT)).toEqual([
      { text: "Hi", startMs: 0, endMs: 200 },
      { text: "there", startMs: 300, endMs: 900 },
    ])
  })

  it("treats any run of spaces as the end of a word, not a word", () => {
    expect(
      alignmentToWords({
        characters: ["a", " ", " ", "b"],
        character_start_times_seconds: [0, 0.1, 0.2, 0.3],
        character_end_times_seconds: [0.1, 0.2, 0.3, 0.4],
      }).map((word) => word.text)
    ).toEqual(["a", "b"])
  })

  it("has nothing to say about silence", () => {
    expect(
      alignmentToWords({
        characters: [],
        character_start_times_seconds: [],
        character_end_times_seconds: [],
      })
    ).toEqual([])
  })
})

describe("words becoming captions", () => {
  const words = [
    { text: "one", startMs: 0, endMs: 200 },
    { text: "two", startMs: 200, endMs: 400 },
    { text: "three", startMs: 400, endMs: 600 },
    { text: "four", startMs: 600, endMs: 800 },
    { text: "five", startMs: 800, endMs: 1_000 },
  ]

  it("breaks at four words", () => {
    const lines = wordsToCaptions(words)
    expect(lines).toHaveLength(2)
    expect(lines[0]).toEqual({ startMs: 0, endMs: 800, text: "one two three four" })
    expect(lines[1].text).toBe("five")
  })

  it("breaks early when a line would sit too long on screen", () => {
    const lines = wordsToCaptions([
      { text: "aaa", startMs: 0, endMs: 900 },
      { text: "bbb", startMs: 900, endMs: 1_800 },
    ])
    expect(lines).toHaveLength(2)
  })

  it("tucks punctuation against the word before it", () => {
    expect(
      wordsToCaptions([
        { text: "well", startMs: 0, endMs: 200 },
        { text: ",", startMs: 200, endMs: 210 },
        { text: "yes", startMs: 210, endMs: 400 },
      ])[0].text
    ).toBe("well, yes")
  })

  it("has nothing to show for nothing said", () => {
    expect(wordsToCaptions([])).toEqual([])
  })
})

describe("what gets asked for", () => {
  it("leaves the account's own voice settings alone when none are given", () => {
    expect(voiceoverRequestBody("hello", "eleven_turbo_v2_5")).toEqual({
      text: "hello",
      model_id: "eleven_turbo_v2_5",
    })
  })

  it("sends the style when there is one, in the words the provider uses", () => {
    const body = voiceoverRequestBody("hello", "eleven_turbo_v2_5", {
      ...createDefaultVoiceSettings(),
      speed: 1.1,
    })
    expect(body).toMatchObject({
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
        style: 0,
        speed: 1.1,
        use_speaker_boost: true,
      },
    })
  })
})
