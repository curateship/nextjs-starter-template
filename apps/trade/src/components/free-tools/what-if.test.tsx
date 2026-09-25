// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, describe, expect, it, vi } from "vitest"

import { WhatIfCalculator } from "@/components/free-tools/what-if"
import { TooltipProvider } from "@/components/ui/tooltip"
import { DAY_MS, type WhatIfSeries } from "@/lib/free-tools/what-if"

vi.mock("@tanstack/react-router", async (original) => ({
  ...(await original<object>()),
  Link: ({ children }: { children: unknown }) => children,
  useNavigate: () => () => {},
}))

const DEC_20 = Date.UTC(2025, 11, 20) / DAY_MS
const JAN_1 = Date.UTC(2026, 0, 1) / DAY_MS
const JAN_5 = Date.UTC(2026, 0, 5) / DAY_MS

/**
 * A stock with closes to 31 Dec, nothing from 1 to 4 Jan, then closes to
 * 20 Feb, and a split on 10 Jan. The page opens on 1 Jan, inside the gap.
 */
function stock(): WhatIfSeries {
  const days: number[] = []
  for (let day = DEC_20; day < JAN_1; day += 1) days.push(day)
  for (let day = JAN_5; day <= JAN_5 + 46; day += 1) days.push(day)
  return {
    market: { kind: "stock", symbol: "NVDA", label: "NVDA, NVIDIA CORP" },
    source: "Dukascopy",
    days,
    closes: days.map((day) => (day < JAN_5 ? 100 : 200)),
    gaps: [
      {
        from: JAN_1 * DAY_MS,
        to: JAN_5 * DAY_MS,
        reason: "The source had no price on these trading days.",
      },
    ],
    splitDays: [JAN_5 + 5],
  }
}

let root: Root
let host: HTMLDivElement

function draw(series: WhatIfSeries) {
  host = document.createElement("div")
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => {
    root.render(
      <TooltipProvider>
        <WhatIfCalculator
          list={{ coins: [], stocks: [series.market] }}
          series={series}
          signedIn
        />
      </TooltipProvider>
    )
  })
}

afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

describe("what if I had bought, on the page", () => {
  it("names the gap a day sits in and buys at the next close", () => {
    draw(stock())
    const text = host.textContent!
    expect(text).not.toContain("so the answer starts there")
    expect(text).toContain("No close on Thu 1 Jan 2026.")
    expect(text).toContain("Dukascopy has no price from 1 Jan 2026 to 4 Jan 2026.")
    expect(text).toContain("The buy uses the next close, on Mon 5 Jan 2026.")
    // $1,000 at $200 is 5 shares, still $200 at the last close.
    expect(text).toContain("is 5 shares")
    expect(text).toContain("that is worth $1,000")
  })

  it("names a split inside the holding and counts today's shares", () => {
    draw(stock())
    expect(host.textContent).toContain(
      "NVDA split its shares on 10 Jan 2026. Every stored price before then is in today's shares, so the 5 shares are today's shares."
    )
  })

  it("adds up weekly buys on the weekly tab", () => {
    draw(stock())
    const weekly = [...host.querySelectorAll("[role=tab]")].find(
      (tab) => tab.textContent === "Bought every week"
    )!
    act(() => {
      weekly.dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true, button: 0 })
      )
    })
    // Seven Mondays, 5 Jan to 16 Feb, $100 each at $200.
    const text = host.textContent!
    expect(text).toContain("every Monday from 5 Jan 2026 is 7 buys")
    expect(text).toContain("$700 put in for 3.5 shares")
  })
})
