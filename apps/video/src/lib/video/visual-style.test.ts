import { describe, expect, it } from "vitest"

import { styledPrompt, withLook } from "./visual-style"

describe("styledPrompt", () => {
  it("puts the style line first", () => {
    const prompt = styledPrompt(
      { style: "Flat illustration, warm palette" },
      "A lighthouse at dusk"
    )
    expect(prompt.startsWith("Style: Flat illustration, warm palette")).toBe(
      true
    )
    expect(prompt.endsWith("A lighthouse at dusk")).toBe(true)
  })

  it("leaves the prompt exactly as it was with no look", () => {
    expect(styledPrompt({}, "A lighthouse at dusk")).toBe("A lighthouse at dusk")
    expect(styledPrompt({ style: "   " }, "A lighthouse")).toBe("A lighthouse")
    expect(styledPrompt({ style: null }, "A lighthouse")).toBe("A lighthouse")
  })

  it("trims the style line", () => {
    expect(styledPrompt({ style: "  Clay  " }, "A cat")).toBe(
      "Style: Clay\n\nA cat"
    )
  })

  it("names the look picture only when one is sent", () => {
    const withPicture = styledPrompt(
      { style: "Clay", hasPicture: true },
      "A cat"
    )
    expect(withPicture.split("\n\n")).toEqual([
      "Style: Clay",
      expect.stringContaining("last picture supplied"),
      "A cat",
    ])
  })
})

describe("withLook", () => {
  it("sends the look picture after every other reference", () => {
    const request = withLook(
      { style: "Clay", picture: "look.png" },
      "A cat",
      ["actor.png"]
    )
    expect(request.references).toEqual(["actor.png", "look.png"])
    expect(request.prompt.startsWith("Style: Clay")).toBe(true)
  })

  it("is the request as it was with no look", () => {
    expect(withLook({ style: null, picture: null }, "A cat", ["actor.png"])).toEqual({
      prompt: "A cat",
      references: ["actor.png"],
    })
  })
})
