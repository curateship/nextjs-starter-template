// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, describe, expect, it, vi } from "vitest"

import { FeeComparison } from "@/components/free-tools/fee-comparison"
import { TooltipProvider } from "@/components/ui/tooltip"
import { FEE_TABLE } from "@/lib/free-tools/fee-comparison"

vi.mock("@tanstack/react-router", async (original) => ({
  ...(await original<object>()),
  Link: ({ children }: { children: unknown }) => children,
}))

let root: Root
let host: HTMLDivElement

function draw(today: string) {
  host = document.createElement("div")
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => {
    root.render(
      <TooltipProvider>
        <FeeComparison signedIn today={today} />
      </TooltipProvider>
    )
  })
}

afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

describe("the fee table on the page", () => {
  it("gives every exchange a source link and no warning while the rates are fresh", () => {
    draw(FEE_TABLE[0].checkedOn)
    const links = [...host.querySelectorAll("a[target=_blank]")].map((link) =>
      link.getAttribute("href")
    )
    expect(links.sort()).toEqual(FEE_TABLE.map((row) => row.sourceUrl).sort())
    expect(host.textContent).not.toContain("The rate may have changed.")
  })

  it("warns on every row once its check is more than 90 days old", () => {
    draw("2099-01-01")
    const warnings = host.textContent!.split("The rate may have changed.")
    expect(warnings.length - 1).toBe(FEE_TABLE.length)
  })

  it("names both exchanges when two tie for the most expensive", () => {
    draw(FEE_TABLE[0].checkedOn)
    // At the starting numbers KuCoin and Phemex both take 0.06% on every trade.
    const answer = host.querySelector("[role=status]")!.textContent
    expect(answer).toContain("KuCoin and Phemex cost most at $240")
  })
})
