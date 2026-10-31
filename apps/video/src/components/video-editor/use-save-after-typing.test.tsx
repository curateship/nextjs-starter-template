// @vitest-environment jsdom

import { act, useEffect } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useSaveAfterTyping } from "./use-save-after-typing"

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let typing: ReturnType<typeof useSaveAfterTyping>
let root: Root
let host: HTMLDivElement

// Hands out what the hook returned on its last render.
function Probe({
  onValue,
}: {
  onValue: (value: ReturnType<typeof useSaveAfterTyping>) => void
}) {
  const value = useSaveAfterTyping(700)
  useEffect(() => {
    onValue(value)
  })
  return null
}

beforeEach(() => {
  vi.useFakeTimers()
  host = document.createElement("div")
  root = createRoot(host)
  act(() => root.render(<Probe onValue={(value) => { typing = value }} />))
})

afterEach(() => {
  vi.useRealTimers()
})

describe("useSaveAfterTyping", () => {
  it("saves once, after the pause, with the newest value", () => {
    const save = vi.fn()
    act(() => {
      typing.later(() => save("a"))
      typing.later(() => save("ab"))
    })
    vi.advanceTimersByTime(699)
    expect(save).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(save).toHaveBeenCalledExactlyOnceWith("ab")
  })

  it("sends a waiting save when the tab closes", () => {
    const save = vi.fn()
    act(() => typing.later(() => save("last word")))
    act(() => root.unmount())
    expect(save).toHaveBeenCalledExactlyOnceWith("last word")
    vi.advanceTimersByTime(1000)
    expect(save).toHaveBeenCalledOnce()
  })

  it("sends nothing on close once the save has run or was cancelled", () => {
    const save = vi.fn()
    act(() => typing.later(() => save("ran")))
    vi.advanceTimersByTime(700)
    act(() => typing.later(() => save("cancelled")))
    act(() => typing.cancel())
    act(() => root.unmount())
    expect(save).toHaveBeenCalledExactlyOnceWith("ran")
  })
})
