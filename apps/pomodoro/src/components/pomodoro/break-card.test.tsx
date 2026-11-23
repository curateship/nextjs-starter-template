// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/pomodoro/break-look", () => ({
  useBreakMessage: () => "",
  useMarkBreakShown: () => undefined,
}))

import { BreakCard } from "@/components/pomodoro/break-card"

let root: Root
async function show(finished: number) {
  await act(async () => {
    root.render(
      <BreakCard kind="long" minutes={15} sessions={4} finished={finished} />
    )
  })
}
const line = () => document.querySelector("header p")?.textContent

describe("the long break's line", () => {
  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    const host = document.createElement("div")
    document.body.appendChild(host)
    root = createRoot(host)
  })
  afterEach(() => {
    act(() => root.unmount())
    document.body.replaceChildren()
  })

  it("says the round is done after a full round", async () => {
    await show(4)
    expect(line()).toBe(
      "You finished all 4 sessions. Get up and move around properly."
    )
  })

  it("does not claim a full round after one focus", async () => {
    await show(1)
    expect(line()).toBe("Long break. Get up and move around properly.")
  })
})
