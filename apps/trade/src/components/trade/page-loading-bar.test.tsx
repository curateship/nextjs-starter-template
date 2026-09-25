// @vitest-environment jsdom
import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import {
  PAGE_LOADING_BAR_DELAY_MS,
  PageLoadingBar,
} from "@/components/trade/page-loading-bar"

type State = {
  status: "pending" | "idle"
  location: { href: string }
  resolvedLocation?: { href: string }
}

let routerState: State
vi.mock("@tanstack/react-router", () => ({
  useRouterState: ({ select }: { select: (state: State) => unknown }) =>
    select(routerState),
}))

const cancel = vi.fn()
const animate = vi.fn(() => ({ cancel }))
let root: ReturnType<typeof createRoot>

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.useFakeTimers()
  Object.assign(HTMLElement.prototype, { animate })
  window.matchMedia = vi.fn(() => ({ matches: false })) as never
  routerState = idleAt("/pnl")
  const host = document.createElement("div")
  document.body.append(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.unmount())
  vi.useRealTimers()
  vi.clearAllMocks()
})

function idleAt(href: string): State {
  return {
    status: "idle",
    location: { href },
    resolvedLocation: { href },
  }
}

function draw(state: State) {
  routerState = state
  act(() => root.render(<PageLoadingBar />))
}

const goingToBacktests: State = {
  status: "pending",
  location: { href: "/backtests" },
  resolvedLocation: { href: "/pnl" },
}

it("shows nothing when the next page arrives inside the delay", () => {
  draw(idleAt("/pnl"))
  draw(goingToBacktests)
  act(() => vi.advanceTimersByTime(PAGE_LOADING_BAR_DELAY_MS - 1))
  draw(idleAt("/backtests"))
  act(() => vi.advanceTimersByTime(1000))
  expect(animate).not.toHaveBeenCalled()
})

it("grows after the delay and runs to the edge when the page is ready", () => {
  draw(idleAt("/pnl"))
  draw(goingToBacktests)
  act(() => vi.advanceTimersByTime(PAGE_LOADING_BAR_DELAY_MS))
  expect(animate).toHaveBeenCalledTimes(1)
  draw(idleAt("/backtests"))
  expect(cancel).toHaveBeenCalledTimes(1)
  expect(animate).toHaveBeenCalledTimes(2)
})

it("stays hidden while the same page refreshes its data", () => {
  draw(idleAt("/pnl"))
  draw({ ...idleAt("/pnl"), status: "pending" })
  act(() => vi.advanceTimersByTime(5000))
  expect(animate).not.toHaveBeenCalled()
})

it("with reduced motion, appears still and vanishes without a finishing run", () => {
  window.matchMedia = vi.fn(() => ({ matches: true })) as never
  draw(idleAt("/pnl"))
  draw(goingToBacktests)
  act(() => vi.advanceTimersByTime(PAGE_LOADING_BAR_DELAY_MS))
  expect(animate).toHaveBeenCalledWith(
    [{ opacity: 1, transform: "scaleX(1)" }],
    expect.objectContaining({ duration: 0 })
  )
  draw(idleAt("/backtests"))
  expect(cancel).toHaveBeenCalledTimes(1)
  expect(animate).toHaveBeenCalledTimes(1)
})
