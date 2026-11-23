// @vitest-environment jsdom

import * as React from "react"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

/**
 * The admin's "Show AI backgrounds and soundscapes" switch, on the three
 * screens it hides AI from: the plans page, Settings → Plan and My uploads.
 * Tyler, 15 Nov 2026: "Can you add a setting to hides it from pricing and
 * dashboards". See `workspace/docs/ai-generation.md`.
 */

const calls = vi.hoisted(() => ({ loadMyPlan: vi.fn() }))

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
  useNavigate: () => vi.fn(),
  useRouter: () => ({ invalidate: vi.fn() }),
}))
vi.mock("@/lib/api/billing/billing", () => ({
  getBillingErrorMessage: () => "error",
  openPlanChange: vi.fn(),
  openBillingPortal: vi.fn(),
}))
vi.mock("@/lib/api/pomodoro/plan", () => ({ loadMyPlan: calls.loadMyPlan }))
vi.mock("@/lib/api/pomodoro/purchases", () => ({
  confirmPomodoroPurchase: vi.fn(),
  getPurchaseErrorMessage: () => "error",
}))
vi.mock("@/components/shared/plan-change-confirmation", () => ({
  PlanChangeConfirmation: () => null,
}))
vi.mock("@/lib/pomodoro/room-media-store", () => ({
  useMediaCatalog: () => ({ sounds: [], themes: [] }),
  useRoomMedia: () => ({ room: null, personalBackground: null, sound: null }),
}))
vi.mock("@/lib/pomodoro/use-preview-audio", () => ({
  usePreviewAudio: () => ({ failed: false, playing: false, previewing: null, stop: vi.fn(), toggle: vi.fn() }),
}))
// The uploads grid and the generator stand in for themselves: what matters
// here is whether the page asks for them.
vi.mock("@/components/pomodoro/media-uploads-section", () => ({
  MediaUploadsSection: ({ onGenerate }: { onGenerate?: () => void }) =>
    onGenerate ? <button type="button">Generate with AI</button> : null,
}))
vi.mock("@/components/pomodoro/media-generator-section", () => ({
  MediaGeneratorSection: () => <section>Generate your own</section>,
}))
vi.mock("@/components/pomodoro/upload-bin-view", () => ({ UploadBinView: () => null }))
vi.mock("@/components/pomodoro/media-add-actions", () => ({ MediaAddMenu: () => null }))
vi.mock("@/components/pomodoro/sound-wave", () => ({ SoundWave: () => null }))

import PlanSettingsPanel from "@/components/pomodoro/plan-settings-panel"
import { PricingPage } from "@/components/pomodoro/pricing-page"
import { UploadsPage } from "@/components/pomodoro/uploads-page"
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
  plan({ slug: "pro", name: "Pro", priceMonthlyCents: 900, priceYearlyCents: 7800 }),
]

let root: Root
const scrolled = vi.fn()
beforeEach(() => {
  scrolled.mockReset()
  Element.prototype.scrollIntoView = scrolled
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  const host = document.createElement("div")
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  document.body.replaceChildren()
})

async function draw(element: React.ReactElement) {
  await act(async () => root.render(element))
}
const text = () => document.body.textContent ?? ""

describe.each([
  { aiShown: false, says: "hides" },
  { aiShown: true, says: "shows" },
])("with the AI switch $aiShown, every screen $says AI", ({ aiShown }) => {
  it("on the plans page", async () => {
    await draw(
      <PricingPage
        plans={plans}
        signedIn
        currentPlanSlug="free"
        currentInterval={null}
        billingEnabled
        trialUsed={false}
        changingPlan={false}
        welcome={false}
        isPaid={false}
        aiShown={aiShown}
      />
    )
    expect(text()).toContain("Pro adds every sound and background,")
    expect(text()).toContain("Host focus rooms")
    expect(text().includes("AI backgrounds")).toBe(aiShown)
    expect(text().includes("AI soundscapes, 20 a month")).toBe(aiShown)
  })

  it("on Settings → Plan", async () => {
    calls.loadMyPlan.mockResolvedValue({
      kind: "free",
      aiShown,
      planName: "Free",
      interval: null,
      granted: false,
      periodEnd: null,
      endsAt: null,
      trialEndsAt: null,
      cardDeclined: false,
      nextPayment: null,
      nextPaymentUnknown: false,
      canManageBilling: false,
      credits: null,
      space: null,
    })
    await draw(<PlanSettingsPanel />)
    expect(text()).toContain("Pro adds every sound and background,")
    expect(text().includes("AI backgrounds and soundscapes")).toBe(aiShown)
  })

  it.each(["background", "sound"] as const)("on My uploads, %s tab", async (kind) => {
    await draw(<UploadsPage kind={kind} seedPrompt="rain on a tin roof" aiShown={aiShown} />)
    expect(text().includes("Generate with AI")).toBe(aiShown)
    expect(text().includes("Generate your own")).toBe(aiShown)
    expect(text().includes("made with AI")).toBe(aiShown)
    // A "Make a matching …" link scrolls to the generator only when there is one.
    expect(scrolled).toHaveBeenCalledTimes(aiShown ? 1 : 0)
  })
})
