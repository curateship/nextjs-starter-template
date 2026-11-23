// @vitest-environment jsdom

import { SparklesIcon, TrendingUpIcon } from "lucide-react"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/toast/error-toast", () => ({ showErrorToast: vi.fn() }))
vi.mock("@/lib/api/admin-dashboard", () => ({
  getAdminErrorMessage: (error: unknown) => String(error),
  loadOverviewWidgets: vi.fn(() => Promise.reject(new Error("the board store must not be read"))),
  saveOverviewWidgets: vi.fn(() => Promise.reject(new Error("the board store must not be written"))),
}))

import { useWidgetLayout, type WidgetStore } from "@/components/shared/widgets/use-widget-layout"
import { WidgetGrid } from "@/components/shared/widgets/widget-grid"
import type { WidgetLayout, WidgetOffer } from "@/lib/admin-dashboard/overview-widgets"

const offer: WidgetOffer = {
  choices: [
    { id: "pnl", label: "PnL Graph", icon: TrendingUpIcon },
    { id: "bots", label: "Running bots", icon: SparklesIcon },
  ],
}

const seed: WidgetLayout = {
  top: { columns: 2, spots: ["pnl", null] },
  bottom: { columns: 0, spots: [] },
}

let host: HTMLDivElement
let root: Root

beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  host = document.createElement("div")
  document.body.append(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

function Board({ store }: { store: WidgetStore }) {
  const widgets = useWidgetLayout(store, null)
  if (!widgets.layout) return <p>{widgets.error ?? "Reading"}</p>
  return (
    <WidgetGrid
      offer={offer}
      layout={widgets.layout}
      onChange={widgets.change}
      drawWidget={(id) => <section data-widget={id}>{id}</section>}
    />
  )
}

/** A grid an app feeds with its own widgets and its own store (Trade, 8 Nov 2026). */
describe("an app's own widget grid", () => {
  it("reads its own store and draws its own widgets, with an empty spot to add one", async () => {
    const store: WidgetStore = {
      load: vi.fn(async () => seed),
      save: vi.fn(async (layout: WidgetLayout) => layout),
      message: String,
    }
    await act(async () => root.render(<Board store={store} />))

    expect(store.load).toHaveBeenCalledTimes(1)
    expect(host.querySelector('[data-widget="pnl"]')?.textContent).toBe("pnl")
    expect(host.textContent).toContain("Add a widget")
  })

  it("says what its own store's failed read was", async () => {
    const store: WidgetStore = {
      load: () => Promise.reject(new Error("no answer")),
      save: async (layout) => layout,
      message: () => "Your widgets could not be read.",
    }
    await act(async () => root.render(<Board store={store} />))

    expect(host.textContent).toContain("Your widgets could not be read.")
  })
})
