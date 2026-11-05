// @vitest-environment jsdom

import * as React from "react"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { reportSaveStatus, showErrorToast } = vi.hoisted(() => ({
  reportSaveStatus: vi.fn(),
  showErrorToast: vi.fn(),
}))

vi.mock("@/components/shell/shell-layout", () => ({
  useShellRuntime: () => ({ reportSaveStatus }),
}))
vi.mock("@/lib/toast/error-toast", () => ({
  showErrorToast,
  dismissErrorToast: vi.fn(),
}))

const { useAutoSave } = await import("@/lib/hooks/use-auto-save")

type Draft = { name: string; body: string }

let seen: ReturnType<typeof useAutoSave<Draft>>

function Probe({
  save,
  blockedReason,
}: {
  save: (value: Draft) => Promise<unknown>
  blockedReason?: (value: Draft) => string | null
}) {
  const result = useAutoSave<Draft>(
    { name: "Welcome", body: "" },
    { save, describeError: () => "Could not save.", blockedReason }
  )
  React.useEffect(() => {
    seen = result
  })
  return null
}

describe("useAutoSave", () => {
  let root: Root

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    vi.useFakeTimers()
    reportSaveStatus.mockClear()
    showErrorToast.mockClear()
    root = createRoot(document.createElement("div"))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  const type = (body: string) =>
    act(() => seen.change((current) => ({ ...current, body })))

  it("saves the newest draft once, 700ms after the last change", async () => {
    const save = vi.fn().mockResolvedValue(undefined)
    act(() => root.render(<Probe save={save} />))

    type("H")
    await act(() => vi.advanceTimersByTimeAsync(500))
    type("Hi")
    await act(() => vi.advanceTimersByTimeAsync(699))
    expect(save).not.toHaveBeenCalled()

    await act(() => vi.advanceTimersByTimeAsync(1))
    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith({ name: "Welcome", body: "Hi" })
    expect(seen.isSaved()).toBe(true)
    expect(reportSaveStatus).toHaveBeenLastCalledWith("saved")

    // "Saved" clears itself, and the header is told "idle", as before.
    await act(() => vi.advanceTimersByTimeAsync(2000))
    expect(reportSaveStatus).toHaveBeenLastCalledWith("idle")
    act(() => root.unmount())
  })

  it("runs saves one at a time, in order", async () => {
    const order: string[] = []
    let finishFirst = () => {}
    const save = vi.fn((value: Draft) => {
      order.push(`start ${value.body}`)
      if (value.body === "one") {
        return new Promise<void>((resolve) => {
          finishFirst = () => {
            order.push("end one")
            resolve()
          }
        })
      }
      order.push(`end ${value.body}`)
      return Promise.resolve()
    })
    act(() => root.render(<Probe save={save} />))

    type("one")
    await act(() => vi.advanceTimersByTimeAsync(700))
    type("two")
    await act(() => vi.advanceTimersByTimeAsync(700))
    expect(order).toEqual(["start one"])

    await act(async () => finishFirst())
    expect(order).toEqual(["start one", "end one", "start two", "end two"])
    act(() => root.unmount())
  })

  it("keeps a refused save unsaved and says nothing", async () => {
    const save = vi.fn().mockResolvedValue(false)
    act(() => root.render(<Probe save={save} />))

    type("x")
    let saved: boolean | undefined
    await act(async () => {
      saved = await seen.saveNow()
    })
    expect(saved).toBe(false)
    expect(seen.isSaved()).toBe(false)
    expect(reportSaveStatus).toHaveBeenLastCalledWith("idle")
    expect(showErrorToast).not.toHaveBeenCalled()
    act(() => root.unmount())
  })

  it("does not save a blocked draft, and says why", async () => {
    const save = vi.fn().mockResolvedValue(undefined)
    act(() =>
      root.render(
        <Probe save={save} blockedReason={() => "name this automation"} />
      )
    )

    type("x")
    await act(() => vi.advanceTimersByTimeAsync(700))
    expect(save).not.toHaveBeenCalled()
    expect(reportSaveStatus).toHaveBeenLastCalledWith({
      blocked: "name this automation",
    })
    act(() => root.unmount())
  })

  it("sends the last change when it goes away mid-wait", async () => {
    const save = vi.fn().mockResolvedValue(undefined)
    act(() => root.render(<Probe save={save} />))

    type("last words")
    act(() => root.unmount())
    await act(() => vi.advanceTimersByTimeAsync(0))
    expect(save).toHaveBeenCalledWith({ name: "Welcome", body: "last words" })
    expect(reportSaveStatus).toHaveBeenLastCalledWith(null)
  })

  it("sends the last change only after a slower save still on its way", async () => {
    let finishFirst = () => {}
    const save = vi
      .fn()
      .mockImplementationOnce(
        () => new Promise<void>((resolve) => (finishFirst = resolve))
      )
      .mockResolvedValue(undefined)
    act(() => root.render(<Probe save={save} />))

    type("first")
    await act(() => vi.advanceTimersByTimeAsync(700))
    expect(save).toHaveBeenCalledTimes(1)

    type("second")
    act(() => root.unmount())
    await act(() => vi.advanceTimersByTimeAsync(0))
    expect(save).toHaveBeenCalledTimes(1)

    await act(async () => finishFirst())
    expect(save).toHaveBeenCalledTimes(2)
    expect(save).toHaveBeenLastCalledWith({ name: "Welcome", body: "second" })
  })

  it("shows a failure and stays unsaved", async () => {
    const save = vi.fn().mockRejectedValue(new Error("down"))
    act(() => root.render(<Probe save={save} />))

    type("x")
    await act(() => vi.advanceTimersByTimeAsync(700))
    expect(showErrorToast).toHaveBeenCalledWith("Could not save.")
    expect(seen.isSaved()).toBe(false)
    act(() => root.unmount())
  })
})
