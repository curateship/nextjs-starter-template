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
  getBillingErrorMessage: (error: Error) => error.message,
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
let cancel: ReturnType<typeof vi.fn<() => void>>

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  Element.prototype.scrollIntoView = vi.fn()
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
  cancel = vi.fn()
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
    root.render(<PlanChangeConfirmation preview={values} onCancel={cancel} />)
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
    expect(cancel).toHaveBeenCalledOnce()
    expect(confirmPlanChange).not.toHaveBeenCalled()
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
      button("Confirm plan change").click()
      button("Confirm plan change").click()
    })
    expect(confirmPlanChange).toHaveBeenCalledOnce()
    expect(button("Cancel").disabled).toBe(true)
    await act(async () => reject(new Error("Payment failed")))
    expect(showErrorToast).toHaveBeenCalledWith("Payment failed")
    expect(button("Confirm plan change").disabled).toBe(false)
  })

  it("waits for the webhook and checks again without submitting another plan change", async () => {
    vi.useFakeTimers()
    vi.mocked(confirmPlanChange).mockResolvedValue({
      planSlug: "pro",
      interval: "monthly",
    })
    await render()
    await act(async () => button("Confirm plan change").click())
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
    await act(async () => button("Confirm plan change").click())
    expect(container.textContent).toContain("Plan change submitted")
    expect(button("Check status").disabled).toBe(false)
    expect(showErrorToast).toHaveBeenCalledWith("Connection lost")
  })
})
