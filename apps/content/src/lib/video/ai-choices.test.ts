import { describe, expect, it } from "vitest"

import { pickTranscriber, pickWriter, readAiDefaults } from "./ai-choices"

const ALL = { gemini: true, openai: true, anthropic: true }
const NONE = { gemini: false, openai: false, anthropic: false }

describe("who writes speech down", () => {
  it("uses Whisper by default, because it measures rather than guesses", () => {
    expect(pickTranscriber({}, ALL)?.id).toBe("openai")
  })

  it("uses whatever was chosen", () => {
    expect(pickTranscriber({ transcriber: "gemini" }, ALL)?.id).toBe("gemini")
  })

  it("ignores a choice whose key has since gone", () => {
    expect(
      pickTranscriber({ transcriber: "openai" }, { ...NONE, gemini: true })?.id
    ).toBe("gemini")
  })

  it("has nobody to ask when there are no keys at all", () => {
    expect(pickTranscriber({}, NONE)).toBeNull()
  })
})

describe("who rewrites words", () => {
  it("uses the quick cheap one unless told otherwise", () => {
    expect(pickWriter({}, ALL)?.id).toBe("gemini")
    expect(pickWriter({ writer: "openai" }, ALL)?.id).toBe("openai")
  })

  it("falls back rather than picking one that cannot run", () => {
    expect(
      pickWriter({ writer: "gemini" }, { ...NONE, openai: true })?.id
    ).toBe("openai")
  })

  it("uses Claude when it is chosen and its key is saved", () => {
    expect(pickWriter({ writer: "anthropic" }, ALL)?.model).toBe(
      "claude-opus-5"
    )
  })

  it("quietly drops Claude once its key is removed", () => {
    expect(
      pickWriter({ writer: "anthropic" }, { ...ALL, anthropic: false })?.id
    ).toBe("gemini")
  })

  it("uses Claude when it is the only writer with a key", () => {
    expect(pickWriter({}, { ...NONE, anthropic: true })?.id).toBe("anthropic")
  })
})

describe("reading what was saved", () => {
  it("keeps a sound choice and throws away nonsense", () => {
    expect(readAiDefaults({ transcriber: "openai" })).toEqual({
      transcriber: "openai",
    })
    expect(readAiDefaults({ writer: "anthropic" })).toEqual({
      writer: "anthropic",
    })
    expect(readAiDefaults({ transcriber: "wizard" })).toEqual({})
    expect(readAiDefaults(null)).toEqual({})
    expect(readAiDefaults("nope")).toEqual({})
  })
})
