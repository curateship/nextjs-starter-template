// @vitest-environment jsdom
import { act } from "react"
import { createRoot } from "react-dom/client"
import { expect, it, vi } from "vitest"
import GoalHeader from "@/components/trade/goal-header"
import { loadDailyGoal } from "@/lib/api/trade/goal"
import { DEFAULT_GOAL } from "@/lib/trade/goal"
import { MADE_MONEY } from "@/lib/trade/money-tone"

vi.mock("@/lib/api/trade/goal", () => ({ loadDailyGoal: vi.fn() }))
vi.mock("@/lib/trade/hide-pnl", () => ({ useHiddenPnlClass: () => undefined }))

it("colours $8/$24 as profit and clears the colour when the next read fails", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.useFakeTimers()
  const host = document.createElement("div")
  document.body.append(host)
  const root = createRoot(host)
  vi.mocked(loadDailyGoal).mockResolvedValue({
    goal: { ...DEFAULT_GOAL, on: true },
    progress: {
      made: 8,
      target: 24,
      walletsWorth: 24000,
      openProfit: 0,
      missingVenues: [],
      unpricedFills: 0,
    },
  })
  try {
    await act(async () => root.render(<GoalHeader />))
    expect(host.querySelector("button span")?.textContent).toBe("$8/$24")
    for (const name of MADE_MONEY.split(" "))
      expect(host.querySelector("button span")?.classList.contains(name)).toBe(
        true
      )
    vi.mocked(loadDailyGoal).mockRejectedValue(new Error("Unavailable"))
    await act(async () => vi.advanceTimersByTimeAsync(15_000))
    expect(host.querySelector("button")?.getAttribute("aria-label")).toBe(
      "Today's goal could not be read"
    )
    expect(host.querySelector("button span")?.textContent).toBe("—/—")
    for (const name of MADE_MONEY.split(" "))
      expect(host.querySelector("button span")?.classList.contains(name)).toBe(
        false
      )
  } finally {
    await act(async () => root.unmount())
    host.remove()
    vi.useRealTimers()
  }
})
