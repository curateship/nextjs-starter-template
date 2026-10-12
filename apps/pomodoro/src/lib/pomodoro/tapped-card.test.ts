import { describe, expect, it } from "vitest"

import {
  clearTappedCard,
  isTappedCard,
  toggleTappedCard,
} from "@/lib/pomodoro/tapped-card"

describe("tapped card", () => {
  it("keeps one card playing: a tap on another stops the first", () => {
    toggleTappedCard("background:rain")
    toggleTappedCard("upload:abc")
    expect(isTappedCard("background:rain")).toBe(false)
    expect(isTappedCard("upload:abc")).toBe(true)
  })

  it("stops a card on a second tap", () => {
    toggleTappedCard("shared:xyz")
    toggleTappedCard("shared:xyz")
    expect(isTappedCard("shared:xyz")).toBe(false)
  })

  it("clears only the card that is playing", () => {
    toggleTappedCard("background:lofi")
    clearTappedCard("background:rain")
    expect(isTappedCard("background:lofi")).toBe(true)
    clearTappedCard("background:lofi")
    expect(isTappedCard("background:lofi")).toBe(false)
  })
})
