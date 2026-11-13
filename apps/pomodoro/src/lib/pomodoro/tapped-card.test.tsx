// @vitest-environment jsdom

import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, describe, expect, it } from "vitest"

import {
  clearTappedCard,
  toggleTappedCard,
  useTappedCard,
} from "@/lib/pomodoro/tapped-card"

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/** Draws one card per key and reads back which ones say they are playing. */
function Cards({ keys }: { keys: string[] }) {
  return keys.map((key) => <Card key={key} cardKey={key} />)
}

function Card({ cardKey }: { cardKey: string }) {
  const { tapped } = useTappedCard(cardKey)
  return <span data-key={cardKey} data-tapped={tapped ? "yes" : "no"} />
}

let container: HTMLDivElement
let root: ReturnType<typeof createRoot>

function draw(keys: string[]) {
  container = document.createElement("div")
  root = createRoot(container)
  act(() => root.render(<Cards keys={keys} />))
}

function playing() {
  return [...container.querySelectorAll("[data-tapped='yes']")].map(
    (node) => node.getAttribute("data-key")
  )
}

afterEach(() => {
  act(() => root.unmount())
})

describe("tapped card", () => {
  it("keeps one card playing: a tap on another stops the first", () => {
    draw(["background:rain", "upload:abc"])
    act(() => toggleTappedCard("background:rain"))
    act(() => toggleTappedCard("upload:abc"))
    expect(playing()).toEqual(["upload:abc"])
  })

  it("stops a card on a second tap", () => {
    draw(["shared:xyz"])
    act(() => toggleTappedCard("shared:xyz"))
    act(() => toggleTappedCard("shared:xyz"))
    expect(playing()).toEqual([])
  })

  it("clears only the card that is playing", () => {
    draw(["background:lofi", "background:rain"])
    act(() => toggleTappedCard("background:lofi"))
    act(() => clearTappedCard("background:rain"))
    expect(playing()).toEqual(["background:lofi"])
    act(() => clearTappedCard("background:lofi"))
    expect(playing()).toEqual([])
  })
})
