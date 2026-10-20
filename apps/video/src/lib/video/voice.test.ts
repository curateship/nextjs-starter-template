import { describe, expect, it } from "vitest"

import {
  alignmentToWords,
  createDefaultVoiceSettings,
  readVoiceDefaults,
  rememberedVoiceSettings,
  timeScriptWords,
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

describe("timing a script's words by what was heard", () => {
  // Twenty words said unevenly: quick short words, slow long ones, and a
  // pause after "morning" and after "stairs".
  const SCRIPT =
    "Good morning. Every day at seven, the baker walks down three flights of stairs and opens the shop before sunrise."
  const SAID = [
    ["good", 120, 300],
    ["morning", 300, 820],
    ["every", 1_450, 1_700],
    ["day", 1_700, 1_900],
    ["at", 1_900, 1_980],
    ["seven", 1_980, 2_500],
    ["the", 2_700, 2_780],
    ["baker", 2_780, 3_200],
    ["walks", 3_200, 3_550],
    ["down", 3_550, 3_800],
    ["three", 3_800, 4_050],
    ["flights", 4_050, 4_500],
    ["of", 4_500, 4_580],
    ["stairs", 4_580, 5_100],
    ["and", 5_900, 6_050],
    ["opens", 6_050, 6_400],
    ["the", 6_400, 6_480],
    ["shop", 6_480, 6_800],
    ["before", 6_800, 7_150],
    ["sunrise", 7_150, 7_900],
  ].map(([text, startMs, endMs]) => ({ text: text as string, startMs: startMs as number, endMs: endMs as number }))
  const DURATION = 8_200

  it("starts every word of a 20-word line within 150 ms of when it was said", () => {
    const timed = timeScriptWords(SCRIPT, SAID, DURATION)
    expect(timed.map((word) => word.text)).toEqual(SCRIPT.split(" "))
    for (const [index, word] of timed.entries()) {
      expect(Math.abs(word.startMs - SAID[index].startMs)).toBeLessThanOrEqual(150)
    }
  })

  it("misses by far more when the time is shared out evenly instead", () => {
    const even = timeScriptWords(SCRIPT, [], DURATION)
    const worst = Math.max(
      ...even.map((word, index) => Math.abs(word.startMs - SAID[index].startMs))
    )
    expect(worst).toBeGreaterThan(500)
  })

  it("keeps the script's words and fills only the gap where the two disagree", () => {
    // Whisper heard "7" for "seven" and "3" for "three", and split "sunrise".
    const heard = SAID.flatMap((word) =>
      word.text === "seven"
        ? [{ ...word, text: "7" }]
        : word.text === "three"
          ? [{ ...word, text: "3" }]
          : word.text === "sunrise"
            ? [
                { text: "sun", startMs: 7_150, endMs: 7_500 },
                { text: "rise.", startMs: 7_500, endMs: 7_900 },
              ]
            : [word]
    )
    const timed = timeScriptWords(SCRIPT, heard, DURATION)
    expect(timed.map((word) => word.text)).toEqual(SCRIPT.split(" "))
    // "seven," sits between "at" (ends 1,980) and "the" (starts 2,700).
    expect(timed[5]).toEqual({ text: "seven,", startMs: 1_980, endMs: 2_700 })
    expect(timed[10]).toEqual({ text: "three", startMs: 3_800, endMs: 4_050 })
    // The last word fills from "before" to the end of the sound.
    expect(timed[19]).toEqual({ text: "sunrise.", startMs: 7_150, endMs: 8_200 })
    for (const [index, word] of timed.entries()) {
      expect(Math.abs(word.startMs - SAID[index].startMs)).toBeLessThanOrEqual(150)
    }
  })

  it("matches words whatever their case, accents and punctuation", () => {
    const timed = timeScriptWords("Café, OK?", [
      { text: "cafe", startMs: 0, endMs: 300 },
      { text: "-", startMs: 300, endMs: 310 },
      { text: "ok", startMs: 400, endMs: 600 },
    ], 700)
    expect(timed).toEqual([
      { text: "Café,", startMs: 0, endMs: 300 },
      { text: "OK?", startMs: 400, endMs: 600 },
    ])
  })

  it("keeps every time inside the sound and in order", () => {
    // Whisper's last word runs past the end of the sound, and "b" was heard
    // starting before "a".
    const timed = timeScriptWords("a b c", [
      { text: "a", startMs: 300, endMs: 400 },
      { text: "b", startMs: 200, endMs: 500 },
      { text: "c", startMs: 500, endMs: 900 },
    ], 600)
    expect(timed).toEqual([
      { text: "a", startMs: 300, endMs: 400 },
      { text: "b", startMs: 300, endMs: 500 },
      { text: "c", startMs: 500, endMs: 600 },
    ])
  })

  it("has nothing to time for nothing said or no sound", () => {
    expect(timeScriptWords("  ", SAID, DURATION)).toEqual([])
    expect(timeScriptWords(SCRIPT, SAID, 0)).toEqual([])
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
