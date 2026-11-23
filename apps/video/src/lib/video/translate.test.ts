import { describe, expect, it } from "vitest"

import {
  TRANSLATE_LANGUAGES,
  translationScript,
} from "@/lib/video/translate"

describe("reading a translation aloud", () => {
  it("reads every line in order as one script", () => {
    expect(
      translationScript([{ text: " Hola " }, { text: "a todos" }])
    ).toBe("Hola a todos")
  })

  it("skips lines that were emptied, so there are no double spaces", () => {
    expect(
      translationScript([{ text: "Hola" }, { text: "  " }, { text: "amigos" }])
    ).toBe("Hola amigos")
  })

  it("has nothing to say when every line is empty", () => {
    expect(translationScript([{ text: "" }, { text: " " }])).toBe("")
  })
})

describe("the languages on offer", () => {
  it("are the 29 the multilingual voice speaks, each once", () => {
    expect(TRANSLATE_LANGUAGES).toHaveLength(29)
    expect(new Set(TRANSLATE_LANGUAGES).size).toBe(29)
  })
})
