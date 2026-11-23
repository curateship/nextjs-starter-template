// @vitest-environment jsdom
import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/toast/error-toast", () => ({ showErrorToast: vi.fn() }))
import { FeaturedPlansPopover } from "@/components/directory/featured-plans-popover"
import type { FeaturedPlanOffer } from "@/lib/api/directory/featured"
import { TooltipProvider } from "@/components/ui/tooltip"

const host = document.createElement("div")
document.body.append(host)
let root = createRoot(host)
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
afterEach(async () => {
  await act(async () => root.unmount())
  root = createRoot(host)
  vi.resetAllMocks()
})

function offer(changes: Partial<FeaturedPlanOffer> = {}): FeaturedPlanOffer {
  return {
    id: "plan",
    kind: "listing",
    name: "Top of Bakeries",
    description: "",
    priceCents: 2900,
    currency: "usd",
    durationDays: 30,
    categoryId: "bakeries",
    categoryName: "Bakeries",
    categorySpots: 3,
    priority: 5,
    active: true,
    spotsLeft: 2,
    ...changes,
  }
}

/** Opens the Feature button and returns the plan buttons inside the popover. */
async function openWith(plans: FeaturedPlanOffer[]) {
  const start = vi.fn()
  await act(async () =>
    root.render(
      <TooltipProvider>
        <FeaturedPlansPopover
          featuredNow={false}
          noun="listing"
          load={async () => ({ plans, active: false })}
          start={start}
        />
      </TooltipProvider>
    )
  )
  await act(async () => host.querySelector("button")!.click())
  const plan = Array.from(document.querySelectorAll("button")).find((button) =>
    button.textContent?.includes(plans[0].name)
  )!
  return { plan, start }
}

describe("the owner's featured plans", () => {
  it("names the category and how many spots are left", async () => {
    const { plan } = await openWith([offer()])
    expect(plan.textContent).toContain("30 days · Bakeries · 2 spots left")
    expect(plan.disabled).toBe(false)
  })

  it("counts one spot in the singular", async () => {
    const { plan } = await openWith([offer({ spotsLeft: 1 })])
    expect(plan.textContent).toContain("1 spot left")
  })

  it("greys a sold-out plan and says so instead of pretending it is open", async () => {
    const { plan, start } = await openWith([offer({ spotsLeft: 0 })])
    expect(plan.textContent).toContain("Sold out in Bakeries")
    expect(plan.textContent).not.toContain("30 days")
    expect(plan.disabled).toBe(true)
    plan.click()
    expect(start).not.toHaveBeenCalled()
  })

  it("shows a whole-directory plan with no category and no count", async () => {
    const { plan } = await openWith([
      offer({
        name: "Featured everywhere",
        categoryId: null,
        categoryName: null,
        categorySpots: null,
        spotsLeft: null,
      }),
    ])
    expect(plan.textContent).toContain("30 days")
    expect(plan.textContent).not.toContain("left")
    expect(plan.disabled).toBe(false)
  })
})
