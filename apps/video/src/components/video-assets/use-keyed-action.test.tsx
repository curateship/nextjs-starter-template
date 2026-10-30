// @vitest-environment jsdom

import { act, useEffect } from "react"
import { createRoot } from "react-dom/client"
import { describe, expect, it, vi } from "vitest"

import { useKeyedAction } from "./use-keyed-action"

vi.mock("sonner", () => ({ toast: { success: vi.fn() } }))
vi.mock("@/lib/toast/error-toast", () => ({
  dismissErrorToast: vi.fn(),
  showErrorToast: vi.fn(),
}))

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let action: ReturnType<typeof useKeyedAction>

// Hands out what the hook returned on its last render.
function Probe({
  onValue,
}: {
  onValue: (value: ReturnType<typeof useKeyedAction>) => void
}) {
  const value = useKeyedAction(() => "It failed.")
  useEffect(() => {
    onValue(value)
  })
  return null
}

function mount() {
  act(() => createRoot(document.createElement("div")).render(<Probe onValue={(value) => { action = value }} />))
}

describe("useKeyedAction", () => {
  it("marks only the running key busy", async () => {
    mount()
    let finish!: () => void
    let running!: Promise<unknown>
    act(() => {
      running = action.run(
        "keyword:a",
        () => new Promise<void>((resolve) => (finish = resolve))
      )
    })
    expect(action.isBusy("keyword:a")).toBe(true)
    expect(action.isBusy("keyword:b")).toBe(false)
    expect(action.isBusy("search-all")).toBe(false)
    await act(async () => {
      finish()
      await running
    })
    expect(action.isBusy("keyword:a")).toBe(false)
  })

  it("clears the key when the work fails", async () => {
    mount()
    let ok: unknown
    await act(async () => {
      ok = await action.run("hide", () => Promise.reject(new Error("no")))
    })
    expect(ok).toBe(false)
    expect(action.isBusy("hide")).toBe(false)
  })
})
