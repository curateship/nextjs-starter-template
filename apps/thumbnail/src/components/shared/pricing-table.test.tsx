// @vitest-environment jsdom
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { PricingTable } from "@/components/shared/pricing-table"
import type { PlanOption } from "@/lib/api/billing/billing"

function plan(overrides: Partial<PlanOption> = {}): PlanOption {
  return {
    id: "plan-pro",
    slug: "pro",
    name: "Pro",
    description: "For people who use this every day.",
    priceMonthlyCents: 1900,
    priceYearlyCents: 0,
    currency: "usd",
    usageMeter: null,
    trialDays: 0,
    features: { list: ["Priority support"] },
    isDefault: false,
    highlightBadgeText: null,
    checkoutButtonText: null,
    canCheckoutMonthly: true,
    canCheckoutYearly: false,
    ...overrides,
  } as PlanOption
}

let host: HTMLDivElement
let root: Root

async function render(plans: PlanOption[]) {
  await act(async () => {
    root.render(
      <PricingTable
        plans={plans}
        interval="monthly"
        onIntervalChange={vi.fn()}
        onSelect={vi.fn()}
        actionLabel="Get started"
      />
    )
  })
}

beforeEach(() => {
  host = document.createElement("div")
  document.body.appendChild(host)
  root = createRoot(host)
})

afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
})

/** The coloured block behind the card, whose bottom strip is the action bar. */
function shells() {
  return [...host.querySelectorAll("[data-slot='card']")].map(
    (card) => card.parentElement as HTMLElement
  )
}

describe("pricing table", () => {
  it("draws a buyable plan's action as a bar across the foot of the card", async () => {
    await render([plan()])

    const [shell] = shells()
    const bar = shell.lastElementChild as HTMLElement

    expect(bar.tagName).toBe("BUTTON")
    expect(bar.textContent).toContain("Get started")
    expect(bar.className).toContain("w-full")
    expect(bar.className).toContain("h-16")
    expect(bar.hasAttribute("disabled")).toBe(false)
    // The arrow steps forward under the pointer. A disabled bar takes no
    // pointer events at all, so only a live one ever moves.
    expect(bar.querySelector("svg")?.getAttribute("class")).toContain(
      "group-hover/action:translate-x-1"
    )
  })

  it("fills the block behind the highlighted plan and leaves the others quiet", async () => {
    await render([
      plan({
        id: "a",
        slug: "free",
        name: "Free",
        highlightBadgeText: "Most popular",
      }),
      plan({ id: "b", slug: "team", name: "Team" }),
    ])

    const [highlighted, quiet] = shells()

    expect(highlighted.className).toContain("bg-primary")
    expect(quiet.className).toContain("bg-muted")
  })

  it("labels a free plan instead of offering a button", async () => {
    await render([
      plan({
        id: "free",
        slug: "free",
        name: "Free",
        priceMonthlyCents: 0,
        isDefault: true,
      }),
    ])

    const [shell] = shells()
    const bar = shell.lastElementChild as HTMLElement

    expect(bar.tagName).toBe("SPAN")
    expect(bar.textContent).toContain("Included")
    expect(bar.querySelector("svg")).not.toBeNull()
    expect(shell.querySelector("button")).toBeNull()
  })

  it("says which period a plan is sold on rather than offering a dead button", async () => {
    await render([plan({ canCheckoutMonthly: false, canCheckoutYearly: true })])

    const [shell] = shells()
    const bar = shell.lastElementChild as HTMLElement

    expect(bar.textContent).toContain("Sold yearly only")
    expect(bar.hasAttribute("disabled")).toBe(true)
  })
})
