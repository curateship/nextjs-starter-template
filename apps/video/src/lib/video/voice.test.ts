import { describe, expect, it } from "vitest"

import {
  alignmentToWords,
  createDefaultVoiceSettings,
  readVoiceDefaults,
  rememberedVoiceSettings,
  voiceoverRequestBody,
  wordsToCaptions,
} from "./voice"
import { scriptForReader } from "./voice-direction"

/** Every character of `text` said one after another, a tenth of a second each. */
function evenly(text: string) {
  const characters = [...text]
  return {
    characters,
    character_start_times_seconds: characters.map((_, index) => index / 10),
    character_end_times_seconds: characters.map((_, index) => (index + 1) / 10),
  }
}

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

describe("directions never reach the captions", () => {
  const script =
    "[whispering] I found it. [pause 2s] It changes everything. [excited] Watch."

  it("leaves the tags and the pause out of a v4 read", () => {
    const words = alignmentToWords(evenly(scriptForReader(script, "directed")))
    const captions = wordsToCaptions(words).map((line) => line.text).join(" ")
    expect(captions).toBe("I found it. It changes everything. Watch.")
    expect(captions).not.toMatch(/\[|\]|\.\.\./)
  })

  it("leaves the break out of a v2 read", () => {
    const words = alignmentToWords(evenly(scriptForReader(script, "timed")))
    expect(words.map((word) => word.text).join(" ")).toBe(
      "I found it. It changes everything. Watch."
    )
  })

  it("keeps writing that only looks like a direction", () => {
    const words = alignmentToWords(evenly("3 < 5 and [this one is open"))
    expect(words.map((word) => word.text).join(" ")).toBe(
      "3 < 5 and [this one is open"
    )
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
    expect(lines[0]).toEqual({
      startMs: 0,
      endMs: 800,
      text: "one two three four",
      words: [
        { startMs: 0, endMs: 200 },
        { startMs: 200, endMs: 400 },
        { startMs: 400, endMs: 600 },
        { startMs: 600, endMs: 800 },
      ],
    })
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
    const [line] = wordsToCaptions([
      { text: "well", startMs: 0, endMs: 200 },
      { text: ",", startMs: 200, endMs: 210 },
      { text: "yes", startMs: 210, endMs: 400 },
    ])
    expect(line.text).toBe("well, yes")
    // Two words on screen, so two times: the comma rides on "well,".
    expect(line.words).toEqual([
      { startMs: 0, endMs: 210 },
      { startMs: 210, endMs: 400 },
    ])
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

describe("a remembered voice's steadiness and expressiveness", () => {
  it("are read back with the rest of the choice", () => {
    const remembered = readVoiceDefaults({
      voiceId: "abc",
      voiceName: "Me",
      modelId: "eleven_v4",
      speed: 1.1,
      stability: 0.8,
      styleExaggeration: 0.3,
    })
    expect(rememberedVoiceSettings(remembered)).toEqual({
      ...createDefaultVoiceSettings(),
      speed: 1.1,
      stability: 0.8,
      styleExaggeration: 0.3,
    })
  })

  it("start where they always did for a choice saved before they existed", () => {
    const remembered = readVoiceDefaults({
      voiceId: "abc",
      voiceName: "Me",
      modelId: "eleven_multilingual_v2",
      speed: 0.9,
    })
    expect(rememberedVoiceSettings(remembered)).toEqual({
      ...createDefaultVoiceSettings(),
      speed: 0.9,
    })
  })

  it("leave the account's own settings alone when nothing is remembered", () => {
    expect(rememberedVoiceSettings(null)).toBeUndefined()
  })

  it("are rounded to the three steadiness settings v4 takes", () => {
    const body = voiceoverRequestBody("hi", "eleven_v4", {
      ...createDefaultVoiceSettings(),
      stability: 0.8,
      styleExaggeration: 0.3,
    })
    expect(body.voice_settings).toMatchObject({ stability: 1, style: 0.3 })
  })
})
