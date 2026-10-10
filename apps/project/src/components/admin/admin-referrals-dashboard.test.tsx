// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const referrals = vi.hoisted(() => ({ grant: vi.fn() }))
const toasts = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}))
vi.mock("sonner", () => ({ toast: { success: toasts.success } }))
vi.mock("@/lib/toast/error-toast", () => ({ showErrorToast: toasts.error }))
vi.mock("@/lib/api/billing/referrals", () => ({
  grantReferralReward: referrals.grant,
  getReferralErrorMessage: (error: unknown) => String(error),
}))

import { AdminReferralsDashboard } from "@/components/admin/admin-referrals-dashboard"
import type {
  AdminReferralItem,
  AdminReferralSummary,
} from "@/lib/api/billing/referrals"

const waiting: AdminReferralItem = {
  id: "ref-1",
  referrerUserId: "user-sam",
  referredUserId: "user-alex",
  referrerName: "Sam",
  referrerEmail: "sam@example.test",
  referredName: "Alex",
  referredEmail: "alex@example.test",
  status: "converted",
  rewardStatus: "pending",
  createdAt: "2026-09-01T10:00:00.000Z",
  joinedAt: "2026-09-01T10:00:00.000Z",
  convertedAt: "2026-09-02T10:00:00.000Z",
  grantedAt: null,
  revokedAt: null,
  rewardAmountCents: null,
  rewardCurrency: null,
  freeMonth: { amountCents: 2000, currency: "usd" },
}

function summary(item: AdminReferralItem): AdminReferralSummary {
  return {
    total: 1,
    invited: 0,
    joined: 0,
    converted: 1,
    pendingRewards: 1,
    items: [item],
  }
}

let root: Root

async function render(item = waiting) {
  const host = document.createElement("div")
  document.body.appendChild(host)
  root = createRoot(host)
  await act(async () => {
    root.render(<AdminReferralsDashboard initialData={summary(item)} />)
  })
}

function button(name: string) {
  const found = Array.from(document.querySelectorAll("button")).filter(
    (candidate) => candidate.textContent?.trim() === name
  )
  // The dialog's confirm shares the row button's words; the dialog's is last.
  const last = found.at(-1)
  if (!last) throw new Error(`${name} button was not rendered`)
  return last
}

function dialog() {
  return document.querySelector('[role="dialog"]')
}

beforeEach(() => {
  ;(
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true
  referrals.grant.mockReset()
  toasts.success.mockReset()
  toasts.error.mockReset()
})

afterEach(async () => {
  await act(async () => root.unmount())
  document.body.replaceChildren()
})

describe("Add free month", () => {
  it("asks first, naming the referrer and the amount, and Cancel adds nothing", async () => {
    await render()
    await act(async () => button("Add free month").click())
    expect(dialog()?.textContent).toContain(
      "Add a free month ($20) to Sam's next bill?"
    )
    expect(dialog()?.textContent).toContain(
      "Stripe takes $20 off Sam's next bill"
    )
    await act(async () => button("Cancel").click())
    expect(dialog()).toBeNull()
    expect(referrals.grant).not.toHaveBeenCalled()
  })

  it("adds one credit on confirm, even when confirm is clicked twice", async () => {
    let finish: (value: unknown) => void = () => {}
    referrals.grant.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve
        })
    )
    await render()
    await act(async () => button("Add free month").click())
    await act(async () => {
      button("Add free month").click()
      button("Add free month").click()
    })
    expect(referrals.grant).toHaveBeenCalledOnce()
    expect(referrals.grant).toHaveBeenCalledWith("ref-1")
    expect(button("Cancel").disabled).toBe(true)
    await act(async () =>
      finish({
        granted: true,
        amountCents: 2000,
        currency: "usd",
        grantedAt: "2026-09-24T10:00:00.000Z",
      })
    )
    expect(dialog()).toBeNull()
    expect(toasts.success).toHaveBeenCalledWith(
      "A free month ($20) was added to Sam's next Stripe bill."
    )
    expect(document.body.textContent).toContain("$20 credit added")
  })

  it("keeps the question open after a refusal so it can be tried again", async () => {
    referrals.grant.mockRejectedValue("REFERRER_NOT_BILLABLE")
    await render({ ...waiting, freeMonth: null })
    await act(async () => button("Add free month").click())
    expect(dialog()?.textContent).toContain(
      "Add a free month to Sam's next bill?"
    )
    expect(dialog()?.textContent).toContain("no paid Stripe plan")
    await act(async () => button("Add free month").click())
    expect(toasts.error).toHaveBeenCalledWith("REFERRER_NOT_BILLABLE")
    expect(dialog()).not.toBeNull()
    expect(button("Add free month").disabled).toBe(false)
  })
})
