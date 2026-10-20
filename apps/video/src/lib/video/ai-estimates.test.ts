import { describe, expect, it } from "vitest"

import {
  captionsCostCents,
  formatAiEstimate,
  hookCostCents,
  transcribeCostCents,
  translateCostCents,
  voiceCostCents,
  withEstimate,
} from "@/lib/video/ai-estimates"

const MINUTE = 60_000

describe("transcribeCostCents", () => {
  it("prices Whisper at $0.006 a minute", () => {
    expect(transcribeCostCents("openai", MINUTE)).toBeCloseTo(0.6)
    expect(transcribeCostCents("openai", 10 * MINUTE)).toBeCloseTo(6)
  })

  it("prices a 30-minute file at about 18 cents with Whisper, overlap included", () => {
    // Three pieces with two 5-second overlaps: 30 minutes and 10 seconds.
    const cents = transcribeCostCents("openai", 30 * MINUTE)
    expect(cents).toBeCloseTo((30 + 10 / 60) * 0.6)
    expect(Math.round(cents)).toBe(18)
  })

  it("prices Gemini from the sound's tokens in and the words out", () => {
    // 1,920 sound tokens plus 250 for the prompt at $0.75 a million, and
    // 1,920 tokens of words at $3.75 a million.
    const expected = ((2_170 * 0.75 + 1_920 * 3.75) / 1_000_000) * 100
    expect(transcribeCostCents("gemini", MINUTE)).toBeCloseTo(expected)
  })

  it("costs nothing for no sound", () => {
    expect(transcribeCostCents("openai", 0)).toBe(0)
  })
})

describe("captionsCostCents", () => {
  it("is the whole file's writing down the first time", () => {
    expect(
      captionsCostCents({ transcriber: "openai", fileSoundMs: 5 * MINUTE, saved: false })
    ).toBeCloseTo(3)
  })

  it("is nothing when the file's words are saved", () => {
    expect(
      captionsCostCents({ transcriber: "openai", fileSoundMs: 5 * MINUTE, saved: true })
    ).toBe(0)
  })
})

describe("hookCostCents", () => {
  it("is the writer's tokens for a line on screen", () => {
    // 800 + 60 characters is 215 tokens in, plus 900 out, with GPT-5 mini.
    const expected = ((215 * 0.25 + 900 * 2) / 1_000_000) * 100
    expect(hookCostCents({ writer: "openai", lineCharacters: 60 })).toBeCloseTo(
      expected
    )
  })

  it("adds the twelve seconds written down first when only speech opens", () => {
    const writing = hookCostCents({ writer: "gemini", lineCharacters: 80 })
    const listening = hookCostCents({
      writer: "gemini",
      lineCharacters: 80,
      listen: { transcriber: "openai", soundMs: 12_000, saved: false },
    })
    expect(listening - writing).toBeCloseTo(0.12)
    expect(
      hookCostCents({
        writer: "gemini",
        lineCharacters: 80,
        listen: { transcriber: "openai", soundMs: 12_000, saved: true },
      })
    ).toBeCloseTo(writing)
  })

  it("prices Claude above GPT-5 mini above Gemini Flash", () => {
    const line = { lineCharacters: 60 }
    const claude = hookCostCents({ writer: "anthropic", ...line })
    const gpt = hookCostCents({ writer: "openai", ...line })
    const gemini = hookCostCents({ writer: "gemini", ...line })
    expect(claude).toBeGreaterThan(gpt)
    expect(gpt).toBeGreaterThan(gemini)
  })
})

describe("voiceCostCents", () => {
  it("prices the multilingual voice by the character", () => {
    // 900 characters at $0.00015 is $0.135.
    expect(voiceCostCents("eleven_multilingual_v2", 900)).toBeCloseTo(13.5)
  })

  it("costs nothing for a model with no price", () => {
    expect(voiceCostCents("no-such-voice", 900)).toBe(0)
  })
})

describe("translateCostCents", () => {
  it("guesses the lines from how long the talking runs before they exist", () => {
    const guessed = translateCostCents({ writer: "openai", talkMs: MINUTE })
    const known = translateCostCents({
      writer: "openai",
      talkMs: 0,
      linesCharacters: 900,
    })
    expect(guessed).toBeCloseTo(known)
  })

  it("adds writing the talking down unless it is saved", () => {
    const translating = translateCostCents({ writer: "gemini", talkMs: MINUTE })
    const withListening = translateCostCents({
      writer: "gemini",
      talkMs: MINUTE,
      listen: { transcriber: "openai", fileSoundMs: MINUTE, saved: false },
    })
    expect(withListening - translating).toBeCloseTo(0.6)
    expect(
      translateCostCents({
        writer: "gemini",
        talkMs: MINUTE,
        listen: { transcriber: "openai", fileSoundMs: MINUTE, saved: true },
      })
    ).toBeCloseTo(translating)
  })

  it("lands within a factor of two of the measured GPT-5 mini runs", () => {
    // 13 seconds of talking: 224 tokens in, about 1,000 out, so about 0.21¢.
    const thirteenSeconds = translateCostCents({ writer: "openai", talkMs: 13_000 })
    expect(thirteenSeconds / 0.21).toBeGreaterThan(0.5)
    expect(thirteenSeconds / 0.21).toBeLessThan(2)
    // Eight one-word lines on 19 Oct 2026: 210 in and 615 out, about 0.13¢.
    const eightLines = translateCostCents({
      writer: "openai",
      talkMs: 0,
      linesCharacters: 24,
    })
    expect(eightLines / 0.128).toBeGreaterThan(0.5)
    expect(eightLines / 0.128).toBeLessThan(2)
  })

  it("lands within a factor of two of the measured GPT-5 mini hook", () => {
    // 19 Oct 2026: 186 tokens in and 863 out, about 0.18¢.
    const cents = hookCostCents({ writer: "openai", lineCharacters: 3 })
    expect(cents / 0.177).toBeGreaterThan(0.5)
    expect(cents / 0.177).toBeLessThan(2)
  })
})

describe("formatAiEstimate and withEstimate", () => {
  it("says no charge for nothing, cents below a dollar, dollars above", () => {
    expect(formatAiEstimate(0)).toBe("no charge")
    expect(formatAiEstimate(0.04)).toBe("under 0.1¢")
    expect(formatAiEstimate(0.6)).toBe("about 0.6¢")
    expect(formatAiEstimate(4.2)).toBe("about 4¢")
    expect(formatAiEstimate(180)).toBe("about $1.80")
  })

  it("puts the estimate after the label, or leaves the label alone", () => {
    expect(withEstimate("Write them", 4.2)).toBe("Write them · about 4¢")
    expect(withEstimate("Write them", 0)).toBe("Write them · no charge")
    expect(withEstimate("Write them", null)).toBe("Write them")
  })
})
