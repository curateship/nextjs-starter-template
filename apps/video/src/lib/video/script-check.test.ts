import { describe, expect, it } from "vitest"

import {
  countWords,
  formatCheckCost,
  formatRunLength,
  openingClause,
  parseBannedWords,
  readBannedWords,
  scriptCheckAnswerSchema,
  scriptCheckCostCents,
  scriptFigures,
  speechStretches,
} from "./script-check"

/**
 * Nineteen words, counted by hand:
 * Most(1) people(2) waste(3) the(4) very(5) first(6) second(7) of(8) a(9)
 * Short,(10) so(11) here(12) is(13) how(14) to(15) stop(16) doing(17)
 * that(18) today.(19)
 */
const NINETEEN =
  "Most people waste the very first second of a Short, so here is how to stop doing that today."

/** Ten of them, one to a line: 190 words. */
const SCRIPT_190 = Array.from({ length: 10 }, () => NINETEEN).join("\n")

describe("the sums", () => {
  it("counts words however they are spaced", () => {
    expect(countWords(NINETEEN)).toBe(19)
    expect(countWords(SCRIPT_190)).toBe(190)
    expect(countWords("  one\n\ntwo   three ")).toBe(3)
    expect(countWords("   ")).toBe(0)
  })

  it("puts 190 words at about 67 seconds at 170 a minute", () => {
    expect(scriptFigures(SCRIPT_190, 1)).toEqual({
      words: 190,
      wordsPerMinute: 170,
      seconds: 67,
      atPaces: [
        { wordsPerMinute: 160, seconds: 71 },
        { wordsPerMinute: 170, seconds: 67 },
        { wordsPerMinute: 180, seconds: 63 },
      ],
    })
  })

  it("reads faster when the voice is sped up", () => {
    const figures = scriptFigures(SCRIPT_190, 1.2)
    expect(figures.wordsPerMinute).toBe(204)
    expect(figures.seconds).toBe(56)
  })

  it("says nothing runs when there is nothing to say", () => {
    expect(scriptFigures("", 1).seconds).toBe(0)
    expect(scriptFigures("", 1).atPaces.map((one) => one.seconds)).toEqual([
      0, 0, 0,
    ])
  })

  it("writes a run length the way it is said", () => {
    expect(formatRunLength(1)).toBe("1 second")
    expect(formatRunLength(67)).toBe("67 seconds")
    expect(formatRunLength(120)).toBe("2 minutes")
    expect(formatRunLength(125)).toBe("2 minutes 5 seconds")
  })
})

describe("cutting a script into 30-second stretches", () => {
  it("folds a short last stretch into the one before it", () => {
    // 85 words to a stretch at 170 a minute: 85, 85, then 20 left over.
    const stretches = speechStretches(SCRIPT_190, 170)
    expect(stretches.map((one) => one.label)).toEqual([
      "0:00 to 0:30",
      "0:30 to 1:07",
    ])
    expect(countWords(stretches[0].text)).toBe(85)
    expect(countWords(stretches[1].text)).toBe(105)
  })

  it("keeps a last stretch of half a stretch or more", () => {
    const script = SCRIPT_190.split(/\s+/).slice(0, 130).join(" ")
    expect(speechStretches(script, 170).map((one) => one.label)).toEqual([
      "0:00 to 0:30",
      "0:30 to 0:46",
    ])
  })

  it("leaves a short script as one stretch", () => {
    expect(speechStretches("Stop scrolling.", 170)).toEqual([
      { label: "0:00 to 0:01", text: "Stop scrolling." },
    ])
    expect(speechStretches("", 170)).toEqual([])
  })
})

describe("the opening words", () => {
  it("stops at the first comma or full stop", () => {
    expect(openingClause(NINETEEN)).toEqual({
      text: "Most people waste the very first second of a Short",
      words: 10,
    })
    expect(openingClause("Stop. Then go")).toEqual({ text: "Stop", words: 1 })
  })
})

describe("the checker's answer", () => {
  const passed = { passed: true, words: [] }

  it("is refused when any rule is missing", () => {
    expect(
      scriptCheckAnswerSchema.safeParse({
        hook: passed,
        opener: passed,
        keepWatching: passed,
        bannedWords: passed,
      }).success
    ).toBe(false)
  })

  it("is taken when every rule is there by name", () => {
    expect(
      scriptCheckAnswerSchema.safeParse({
        hook: passed,
        opener: { passed: false, words: ["In this video"] },
        keepWatching: passed,
        bannedWords: passed,
        figures: passed,
      }).success
    ).toBe(true)
  })
})

describe("what a check costs", () => {
  it("prices a 5,000-character script in cents for each writer", () => {
    // gemini-3.8-flash: 1,850 tokens in at $0.75 a million and 300 out at
    // $3.75 a million is $0.0025.
    expect(formatCheckCost(scriptCheckCostCents(5_000, "gemini"))).toBe(
      "about 0.3¢"
    )
    expect(formatCheckCost(scriptCheckCostCents(5_000, "openai"))).toBe(
      "about 0.6¢"
    )
    expect(formatCheckCost(scriptCheckCostCents(5_000, "anthropic"))).toBe(
      "about 4¢"
    )
  })

  it("says under a tenth of a cent rather than nothing", () => {
    expect(formatCheckCost(0.04)).toBe("under 0.1¢")
  })
})

describe("the banned-word list typed on Settings", () => {
  it("takes a word or phrase per line or between commas, each once", () => {
    expect(
      parseBannedWords("delve\n  Let's   dive in , DELVE,\n\ngame-changer")
    ).toEqual({ words: ["delve", "Let's dive in", "game-changer"], problem: null })
  })

  it("is an empty list when the box is empty", () => {
    expect(parseBannedWords("  \n , ")).toEqual({ words: [], problem: null })
  })

  it("says so when a word is too long or there are too many", () => {
    expect(parseBannedWords("x".repeat(61)).problem).toContain(
      "longer than 60 characters"
    )
    const many = Array.from({ length: 201 }, (_, index) => `word${index}`)
    expect(parseBannedWords(many.join("\n")).problem).toBe(
      "That is 201 words. The list holds up to 200."
    )
  })

  it("reads nothing saved, or something broken, as no list", () => {
    expect(readBannedWords(null)).toBeNull()
    expect(readBannedWords("delve")).toBeNull()
    expect(readBannedWords([])).toEqual([])
    expect(readBannedWords(["delve"])).toEqual(["delve"])
  })
})
