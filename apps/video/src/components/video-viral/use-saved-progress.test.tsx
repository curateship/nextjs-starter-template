// @vitest-environment jsdom

import { act, useEffect } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useSavedProgress } from "@/components/video-viral/use-saved-progress"

vi.mock("@/lib/api/video/viral-videos", () => ({
  loadSavedVideoStatuses: async () => [],
}))

let container: HTMLDivElement
let root: Root
type Progress = ReturnType<typeof useSavedProgress>
let progress: Progress

/** Hands the hook's answer out through a callback, as a screen would use it. */
function Probe({
  onSettled,
  onReady,
}: {
  onSettled: () => void
  onReady: (progress: Progress) => void
}) {
  const answer = useSavedProgress([], onSettled)
  useEffect(() => onReady(answer), [answer, onReady])
  return null
}

const keep = (answer: Progress) => {
  progress = answer
}

beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe("a breakdown the player saw finish", () => {
  it("asks the screen to read itself again, so the new score shows", () => {
    const onSettled = vi.fn()
    act(() => root.render(<Probe onSettled={onSettled} onReady={keep} />))
    act(() => progress.report("youtube:a", { id: "s1", status: "analysing" }, "downloading"))
    expect(onSettled).not.toHaveBeenCalled()
    act(() => progress.report("youtube:a", { id: "s1", status: "ready" }, "analysing"))
    expect(onSettled).toHaveBeenCalledTimes(1)
  })

  it("does not when a video simply opens already finished", () => {
    const onSettled = vi.fn()
    act(() => root.render(<Probe onSettled={onSettled} onReady={keep} />))
    act(() => progress.report("youtube:a", { id: "s1", status: "ready" }, "ready"))
    expect(onSettled).not.toHaveBeenCalled()
  })
})

describe("a video saved with Download alone", () => {
  it("counts as finished at downloaded, so the screen reads itself again and the card moves tabs", () => {
    const onSettled = vi.fn()
    act(() => root.render(<Probe onSettled={onSettled} onReady={keep} />))
    act(() => progress.report("youtube:a", { id: "s1", status: "downloaded" }, "downloading"))
    expect(onSettled).toHaveBeenCalledTimes(1)
  })
})

describe("a deleted saved copy", () => {
  it("drops the card's saved state at once, before the screen reads itself again", () => {
    act(() => root.render(<Probe onSettled={vi.fn()} onReady={keep} />))
    const card = {
      key: "youtube:a",
      savedVideoId: "s1",
      savedStatus: "ready",
    } as Parameters<Progress["apply"]>[0]
    act(() => progress.forget(["youtube:a"]))
    expect(progress.apply(card)).toMatchObject({ savedVideoId: null, savedStatus: null })

    // Saving it again afterwards shows the new copy.
    act(() => progress.report("youtube:a", { id: "s2", status: "waiting" }))
    expect(progress.apply(card)).toMatchObject({ savedVideoId: "s2", savedStatus: "waiting" })
  })
})
