import { describe, expect, it } from "vitest"

import {
  countPauses,
  hasTags,
  pauseMark,
  pauseSecondsTotal,
  readerFor,
  scriptForReader,
  spokenScript,
  steadinessForModel,
  voicePausesRefusal,
} from "./voice-direction"

const SCRIPT =
  "[whispering] I found something. [pause 2s] It changes everything. [excited] Watch."

describe("a script with directions, sent to each kind of voice", () => {
  it("keeps the tags for v3 and v4 and turns a pause into an ellipsis on its own line", () => {
    expect(scriptForReader(SCRIPT, "directed")).toBe(
      "[whispering] I found something. ...\nIt changes everything. [excited] Watch."
    )
  })

  it("drops the tags for v2 and Flash, which would read them out, and sends an exact break", () => {
    expect(scriptForReader(SCRIPT, "timed")).toBe(
      'I found something. <break time="2s" /> It changes everything. Watch.'
    )
  })

  it("gives OpenAI the plain words with an ellipsis for the pause", () => {
    expect(scriptForReader(SCRIPT, "plain")).toBe(
      "I found something. ...\nIt changes everything. Watch."
    )
  })

  it("holds a pause between half a second and three seconds", () => {
    expect(scriptForReader("a [pause 9s] b [pause 0.1s] c", "timed")).toBe(
      'a <break time="3s" /> b <break time="0.5s" /> c'
    )
  })

  it("leaves long writing in brackets alone, because it is not a direction", () => {
    const aside =
      "[this is a long aside that runs well past forty characters] ok"
    expect(scriptForReader(aside, "timed")).toBe(aside)
  })

  it("picks the reader from who speaks and which model", () => {
    expect(readerFor("elevenlabs", "eleven_v4")).toBe("directed")
    expect(readerFor("elevenlabs", "eleven_v4_turbo")).toBe("directed")
    expect(readerFor("elevenlabs", "eleven_v3")).toBe("directed")
    expect(readerFor("elevenlabs", "eleven_multilingual_v2")).toBe("timed")
    expect(readerFor("elevenlabs", "eleven_flash_v2_5")).toBe("timed")
    expect(readerFor("openai", "eleven_v4")).toBe("plain")
  })
})

describe("the words that are actually said", () => {
  it("are the script with every tag and pause taken out", () => {
    expect(spokenScript(SCRIPT)).toBe(
      "I found something. It changes everything. Watch."
    )
  })

  it("adds the pauses up in seconds, for the run length", () => {
    expect(pauseSecondsTotal("a [pause 1.5s] b [pause 2s] c")).toBe(3.5)
  })

  it("notices tags but not pauses", () => {
    expect(hasTags("a [pause 1s] b")).toBe(false)
    expect(hasTags("[sighs] a")).toBe(true)
    // Asking twice gives the same answer (a global pattern would not).
    expect(hasTags("[sighs] a")).toBe(true)
  })
})

describe("too many pauses", () => {
  it("lets ten through", () => {
    const ten = Array.from({ length: 10 }, () => `word ${pauseMark(1)}`).join(" ")
    expect(countPauses(ten)).toBe(10)
    expect(voicePausesRefusal(ten)).toBeNull()
  })

  it("refuses eleven and says how many to take out", () => {
    const eleven = Array.from({ length: 11 }, () => `word ${pauseMark(1)}`).join(" ")
    expect(voicePausesRefusal(eleven)).toBe(
      "This script has 11 pauses. 10 is the most, because more make the voice speed up or crackle. Take 1 out."
    )
  })
})

describe("steadiness on the models that only take three settings", () => {
  it("rounds to 0, 0.5 or 1 on v3 and v4", () => {
    expect(steadinessForModel(0.2, "eleven_v4")).toBe(0)
    expect(steadinessForModel(0.3, "eleven_v3")).toBe(0.5)
    expect(steadinessForModel(0.8, "eleven_v4_turbo")).toBe(1)
  })

  it("sends any value to the older models", () => {
    expect(steadinessForModel(0.3, "eleven_multilingual_v2")).toBe(0.3)
  })
})
