import { describe, expect, it } from "vitest"

import { pickTranscriber, pickWriter, readAiDefaults } from "./ai-choices"

const BOTH = { words: true, openai: true }

describe("who writes speech down", () => {
  it("uses Whisper by default, because it measures rather than guesses", () => {
    expect(pickTranscriber({}, BOTH)?.id).toBe("openai")
  })

  it("uses whatever was chosen", () => {
    expect(pickTranscriber({ transcriber: "gemini" }, BOTH)?.id).toBe("gemini")
  })

  it("ignores a choice whose key has since gone", () => {
    expect(
      pickTranscriber({ transcriber: "openai" }, { words: true, openai: false })
        ?.id
    ).toBe("gemini")
  })

  it("has nobody to ask when there are no keys at all", () => {
    expect(pickTranscriber({}, { words: false, openai: false })).toBeNull()
  })
})

describe("who rewrites words", () => {
  it("uses the quick cheap one unless told otherwise", () => {
    expect(pickWriter({}, BOTH)?.id).toBe("gemini")
    expect(pickWriter({ writer: "openai" }, BOTH)?.id).toBe("openai")
  })

  it("falls back rather than picking one that cannot run", () => {
    expect(
      pickWriter({ writer: "gemini" }, { words: false, openai: true })?.id
    ).toBe("openai")
  })
})

describe("reading what was saved", () => {
  it("keeps a sound choice and throws away nonsense", () => {
    expect(readAiDefaults({ transcriber: "openai" })).toEqual({
      transcriber: "openai",
    })
    expect(readAiDefaults({ transcriber: "wizard" })).toEqual({})
    expect(readAiDefaults(null)).toEqual({})
    expect(readAiDefaults("nope")).toEqual({})
  })
})
