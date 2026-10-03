// @vitest-environment jsdom
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { PlanChangeConfirmation } from "@/components/shared/plan-change-confirmation"
import {
  confirmPlanChange,
  loadBillingOverview,
  type PlanChangePreview,
} from "@/lib/api/billing/billing"
import { showErrorToast } from "@/lib/toast/error-toast"

vi.mock("@/lib/api/billing/billing", () => ({
  confirmPlanChange: vi.fn(),
  loadBillingOverview: vi.fn(),
  getBillingErrorMessage: (error: unknown) =>
    typeof error === "string" ? error : (error as Error).message,
}))
vi.mock("@/lib/toast/error-toast", () => ({ showErrorToast: vi.fn() }))

const preview: PlanChangePreview = {
  token: "signed-preview",
  planSlug: "pro",
  planName: "Pro",
  interval: "monthly",
  currency: "usd",
  recurringAmount: 4000,
  prorationAmount: 1000,
  amountDue: 5000,
  billsNow: false,
  trialEndsAt: null,
}
let root: Root
let container: HTMLDivElement
let close: ReturnType<typeof vi.fn<() => void>>

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  Element.prototype.scrollIntoView = vi.fn()
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
  close = vi.fn()
  vi.mocked(loadBillingOverview).mockResolvedValue({
    planSlug: "old",
    interval: "monthly",
  } as Awaited<ReturnType<typeof loadBillingOverview>>)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.useRealTimers()
  vi.resetAllMocks()
})

async function render(values = preview) {
  await act(async () =>
    root.render(<PlanChangeConfirmation preview={values} onClose={close} />)
  )
}

function button(label: string) {
  const found = Array.from(container.querySelectorAll("button")).find(
    (node) => node.textContent === label
  )
  if (!found) throw new Error(`Missing button: ${label}`)
  return found
}

describe("plan change confirmation", () => {
  it("shows Stripe's whole-unit and hundredth-unit currencies at the right amount", async () => {
    await render({ ...preview, currency: "jpy" })
    expect(container.textContent).toContain("¥4,000")
    await render({ ...preview, currency: "ugx" })
    expect(container.textContent?.replace(/\u00a0/g, " ")).toContain("UGX 40")
  })
  it("shows the invoice separately from proration and lets Cancel leave without a payment request", async () => {
    await render()
    expect(container.textContent).toContain("Proration before tax$10")
    expect(container.textContent).toContain("Next invoice estimate$50")
    expect(document.activeElement?.textContent).toBe("Change to Pro?")
    await act(async () => button("Cancel").click())
    expect(close).toHaveBeenCalledOnce()
    expect(confirmPlanChange).not.toHaveBeenCalled()
  })

  it("names what the button charges and matches the plan cards' wording", async () => {
    await render()
    expect(container.textContent).toContain("$40 per month")
    expect(button("Switch to Pro")).toBeTruthy()
    await render({
      ...preview,
      interval: "yearly",
      billsNow: true,
      amountDue: 1250,
    })
    expect(container.textContent).toContain("$40 per year")
    expect(button("Pay $12.50 and switch")).toBeTruthy()
    // A credit that covers the whole payment leaves nothing to pay today.
    await render({ ...preview, billsNow: true, amountDue: 0 })
    expect(button("Switch to Pro")).toBeTruthy()
  })

  it("hides an adjustment of nothing", async () => {
    await render({ ...preview, prorationAmount: 0 })
    expect(container.textContent).not.toContain("Proration")
    expect(container.textContent).not.toContain("Unused-time credit")
  })

  it("closes and explains when the server says the preview is out of date", async () => {
    vi.mocked(confirmPlanChange).mockRejectedValue(
      new Error("PLAN_PREVIEW_EXPIRED")
    )
    await render()
    await act(async () => button("Switch to Pro").click())
    expect(showErrorToast).toHaveBeenCalledWith("PLAN_PREVIEW_EXPIRED")
    expect(close).toHaveBeenCalledOnce()
  })

  it("closes itself once the preview is too old to confirm", async () => {
    vi.useFakeTimers()
    await render()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(299_000)
    })
    expect(close).not.toHaveBeenCalled()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000)
    })
    expect(showErrorToast).toHaveBeenCalledWith("PLAN_PREVIEW_EXPIRED")
    expect(close).toHaveBeenCalledOnce()
  })

  it("closes after a failure that lands once the preview has run out", async () => {
    vi.useFakeTimers()
    let reject: (error: Error) => void = () => {}
    vi.mocked(confirmPlanChange).mockImplementation(
      () =>
        new Promise((_, rejectPromise) => {
          reject = rejectPromise
        })
    )
    await render()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(299_000)
    })
    await act(async () => button("Switch to Pro").click())
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000)
    })
    expect(close).not.toHaveBeenCalled()
    await act(async () => reject(new Error("Payment failed")))
    expect(showErrorToast).toHaveBeenCalledWith("Payment failed")
    expect(close).toHaveBeenCalledOnce()
  })

  it("describes credits, immediate billing, and a preserved trial", async () => {
    await render({ ...preview, prorationAmount: -500, billsNow: true })
    expect(container.textContent).toContain("Unused-time credit before tax$5")
    expect(container.textContent).toContain("Estimated payment today")
    expect(container.textContent).toContain("not cash refunds")
    await render({ ...preview, trialEndsAt: "2026-10-01T00:00:00Z" })
    expect(container.textContent).toContain("does not start another trial")
  })

  it("prevents a double submit, shows a payment failure, and allows another attempt", async () => {
    let reject: (error: Error) => void = () => {}
    vi.mocked(confirmPlanChange).mockImplementation(
      () =>
        new Promise((_, rejectPromise) => {
          reject = rejectPromise
        })
    )
    await render()
    await act(async () => {
      button("Switch to Pro").click()
      button("Switch to Pro").click()
    })
    expect(confirmPlanChange).toHaveBeenCalledOnce()
    expect(button("Cancel").disabled).toBe(true)
    await act(async () => reject(new Error("Payment failed")))
    expect(showErrorToast).toHaveBeenCalledWith("Payment failed")
    expect(button("Switch to Pro").disabled).toBe(false)
    expect(close).not.toHaveBeenCalled()
  })

  it("waits for the webhook and checks again without submitting another plan change", async () => {
    vi.useFakeTimers()
    vi.mocked(confirmPlanChange).mockResolvedValue({
      planSlug: "pro",
      interval: "monthly",
    })
    await render()
    await act(async () => button("Switch to Pro").click())
    expect(container.textContent).toContain("Plan change submitted")
    expect(button("Check status").disabled).toBe(true)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000)
    })
    expect(container.textContent).toContain(
      "Confirmation is taking longer than usual"
    )
    expect(loadBillingOverview).toHaveBeenCalledTimes(15)
    await act(async () => button("Check status").click())
    expect(loadBillingOverview).toHaveBeenCalledTimes(16)
    expect(confirmPlanChange).toHaveBeenCalledOnce()
    // Past the preview's age, a submitted change is not closed for being old.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300_000)
    })
    expect(close).not.toHaveBeenCalled()
    await act(async () => button("Close").click())
    expect(close).toHaveBeenCalledOnce()
  })

  it("keeps an accepted change visible when the status request fails", async () => {
    vi.mocked(confirmPlanChange).mockResolvedValue({
      planSlug: "pro",
      interval: "monthly",
    })
    vi.mocked(loadBillingOverview).mockRejectedValue(
      new Error("Connection lost")
    )
    await render()
    await act(async () => button("Switch to Pro").click())
    expect(container.textContent).toContain("Plan change submitted")
    expect(button("Check status").disabled).toBe(false)
    expect(showErrorToast).toHaveBeenCalledWith("Connection lost")
  })
})
