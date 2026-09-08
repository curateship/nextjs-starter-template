// @vitest-environment jsdom
import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/api/directory/featured", () => ({
  loadFeaturedPurchase: vi.fn(),
  getFeaturedErrorMessage: String,
  confirmFeatured: vi.fn(),
  startFeaturedCheckout: vi.fn(),
}))
vi.mock("@/lib/toast/error-toast", () => ({ showErrorToast: vi.fn() }))
import { loadFeaturedPurchase } from "@/lib/api/directory/featured"
import { FeaturedPurchase } from "@/components/directory/my-listings"

const host = document.createElement("div")
document.body.append(host)
let root = createRoot(host)
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
afterEach(async () => {
  await act(async () => root.unmount())
  root = createRoot(host)
  vi.resetAllMocks()
})

describe("owner featured status", () => {
  it.each([true, false])("shows loader status before opening, active=%s", async (active) => {
    await act(async () => root.render(<FeaturedPurchase listingId="listing" featured={{ active, endsAt: null }} />))
    expect(host.textContent).toContain(active ? "Featured now" : "Feature this listing")
    expect(loadFeaturedPurchase).not.toHaveBeenCalled()
  })

  it.each([true, false])("updates the label and popover together, active=%s", async (active) => {
    vi.mocked(loadFeaturedPurchase).mockResolvedValue({ active, plans: [] })
    await act(async () => root.render(<FeaturedPurchase listingId="listing" featured={{ active: !active, endsAt: null }} />))
    await act(async () => host.querySelector("button")!.click())
    expect(host.textContent).toContain(active ? "Featured now" : "Feature this listing")
    expect(document.body.textContent).toContain(active ? "This listing is already featured." : "This site is not offering featured placement yet.")
  })

  it("keeps known status on a load failure and allows retry", async () => {
    vi.mocked(loadFeaturedPurchase).mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce({ active: false, plans: [] })
    await act(async () => root.render(<FeaturedPurchase listingId="listing" featured={{ active: true, endsAt: null }} />))
    await act(async () => host.querySelector("button")!.click())
    expect(host.textContent).toContain("Featured now")
    const retry = Array.from(document.querySelectorAll("button")).find(button => button.textContent === "Try again")!
    expect(retry).toBeDefined()
    await act(async () => retry.click())
    expect(host.textContent).toContain("Feature this listing")
  })
})
