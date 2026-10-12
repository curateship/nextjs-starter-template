// @vitest-environment jsdom

import * as React from "react"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const calls = vi.hoisted(() => ({
  invalidate: vi.fn(),
  openPlanChange: vi.fn(),
  error: vi.fn(),
}))

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
  useNavigate: () => vi.fn(),
  useRouter: () => ({ invalidate: calls.invalidate }),
}))
vi.mock("@/lib/api/billing/billing", () => ({
  getBillingErrorMessage: () => "error",
  openPlanChange: calls.openPlanChange,
}))
vi.mock("@/lib/toast/error-toast", () => ({ showErrorToast: calls.error }))
vi.mock("@/components/shared/plan-change-confirmation", () => ({
  PlanChangeConfirmation: () => null,
}))
vi.mock("@/lib/pomodoro/room-media-store", () => ({
  useMediaCatalog: () => ({ sounds: [], backgrounds: [] }),
}))
vi.mock("@/lib/pomodoro/plan-card-features", () => ({
  planCardFeatures: () => [],
}))

import { PricingPage } from "@/components/pomodoro/pricing-page"
import type { PlanOption } from "@/lib/api/billing/billing"

const plan = (changes: Partial<PlanOption>) =>
  ({
    slug: "free",
    name: "Free",
    isDefault: false,
    priceMonthlyCents: 0,
    priceYearlyCents: 0,
    currency: "usd",
    features: {},
    highlightBadgeText: null,
    canCheckoutMonthly: true,
    canCheckoutYearly: true,
    trialDays: 0,
    checkoutButtonText: null,
    ...changes,
  }) as unknown as PlanOption

const plans = [
  plan({ slug: "free", name: "Free", isDefault: true }),
  plan({ slug: "pro", name: "Pro", priceMonthlyCents: 900 }),
]

let root: Root
async function show() {
  await act(async () => {
    root.render(
      <PricingPage
        plans={plans}
        signedIn
        currentPlanSlug="free"
        currentInterval={null}
        billingEnabled
        trialUsed={false}
        changingPlan={false}
        welcome
        isPaid={false}
      />
    )
  })
}
const proButton = () =>
  [...document.querySelectorAll("article")]
    .find((card) => card.getAttribute("aria-label") === "Pro monthly")
    ?.querySelector("button")
const button = (text: string) =>
  [...document.querySelectorAll("button")].find(
    (element) => element.textContent === text
  )

describe("coming back from paying before Stripe confirms", () => {
  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    vi.useFakeTimers()
    calls.invalidate.mockReset().mockResolvedValue(undefined)
    calls.openPlanChange.mockReset()
    calls.error.mockReset()
    const host = document.createElement("div")
    document.body.appendChild(host)
    root = createRoot(host)
  })
  afterEach(() => {
    act(() => root.unmount())
    document.body.replaceChildren()
    vi.useRealTimers()
  })

  it("holds the Pro button while it checks", async () => {
    await show()
    expect(document.body.textContent).toContain("Stripe is confirming your payment")
    expect(proButton()?.disabled).toBe(true)
    expect(proButton()?.textContent).toContain("Confirming payment…")
  })

  it("says the payment is late after the last check, and Check again runs another round", async () => {
    await show()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(8 * 1_500)
    })
    expect(calls.invalidate).toHaveBeenCalledTimes(8)
    expect(document.body.textContent).toContain(
      "Your payment is still being confirmed."
    )

    // A press now explains instead of opening a second checkout.
    const pro = proButton()
    if (!pro) throw new Error("No Pro button")
    expect(pro.disabled).toBe(false)
    await act(async () => pro.click())
    expect(calls.openPlanChange).not.toHaveBeenCalled()
    expect(calls.error).toHaveBeenCalledWith(
      expect.stringContaining("still being confirmed")
    )

    const again = button("Check again")
    if (!again) throw new Error("No Check again button")
    await act(async () => again.click())
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_500)
    })
    expect(calls.invalidate).toHaveBeenCalledTimes(9)
    expect(document.body.textContent).toContain("Stripe is confirming your payment")
  })
})
