// @vitest-environment jsdom
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { beforeEach, afterEach, expect, it, vi } from "vitest"
import { defaultScannerSettings } from "@/lib/trade/market-scanner"
import type { MarketCatalog, MarketRow } from "@/lib/protocols/contracts"
const mocks = vi.hoisted(() => ({
  load: vi.fn(),
  save: vi.fn(),
  error: vi.fn(),
  scan: vi.fn(),
  retry: vi.fn(),
}))
vi.mock("@/lib/api/trade/market-scanner", () => ({
  loadMarketScannerSettings: mocks.load,
  saveMarketScannerSettings: mocks.save,
}))
vi.mock("@/lib/trade/use-market-scanner", () => ({
  useMarketScanner: mocks.scan,
}))
vi.mock("@/lib/protocols/live-registry", () => ({
  getLiveAdapter: () => ({ watchFigures: vi.fn() }),
}))
vi.mock("@/lib/toast/error-toast", () => ({ showErrorToast: mocks.error }))
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }))
import { MarketScannerPanel } from "./market-scanner-panel"
import { TooltipProvider } from "@/components/ui/tooltip"
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
let root: Root, host: HTMLDivElement
const settings = { ...defaultScannerSettings(), mode: "volume" as const }
const market = { key: "hyperliquid:mainnet:BTC", symbol: "BTC" } as MarketRow
const catalog = {
  protocol: "hyperliquid",
  network: "mainnet",
  rows: [market],
} as MarketCatalog
const movement = {
  range: 3,
  atr: 1,
  multiple: 3,
  rangeFraction: 0.03,
  atrFraction: 0.01,
  bandWidth: 0.02,
  change: 0.024,
}
function button(text: string) {
  return [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (node) => node.textContent === text
  )!
}
async function input(id: string, value: string) {
  await act(async () => {
    const node = document.getElementById(id) as HTMLInputElement
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )!.set!.call(node, value)
    node.dispatchEvent(new Event("input", { bubbles: true }))
  })
}
beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  )
  mocks.load.mockResolvedValue({
    settings,
    venues: [{ protocol: "hyperliquid", label: "Hyperliquid" }],
  })
  mocks.save.mockImplementation(async (next) => next)
  mocks.scan.mockReturnValue({
    snapshot: {
      loaded: true,
      rows: [],
      total: 1,
      candles: 1,
      warming: 1,
      unavailable: 0,
      errors: [],
    },
    retry: mocks.retry,
    dismiss: vi.fn(),
  })
  host = document.createElement("div")
  document.body.append(host)
  root = createRoot(host)
})
afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
})
it("opens the real settings modal, validates, saves and restores the cog focus", async () => {
  await act(async () =>
    root.render(
      <TooltipProvider>
        <MarketScannerPanel
          accountId="test-account"
          catalogs={[catalog]}
          selectedMarketKey={null}
          onSelectMarket={vi.fn()}
        />
      </TooltipProvider>
    )
  )
  const cog = host.querySelector<HTMLButtonElement>(
    '[aria-label="Market scanner settings"]'
  )!
  await act(async () => cog.click())
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain(
    "Market scanner settings"
  )
  await input("scanner-volumeMultiple", "")
  await act(async () => button("Save changes").click())
  expect(mocks.save).not.toHaveBeenCalled()
  expect(
    document
      .getElementById("scanner-volumeMultiple")
      ?.getAttribute("aria-invalid")
  ).toBe("true")
  await input("scanner-volumeMultiple", "3")
  await act(async () => button("Save changes").click())
  expect(mocks.save).toHaveBeenCalledWith({ ...settings, volumeMultiple: 3 })
  expect(document.querySelector('[role="dialog"]')).toBeNull()
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 5))
  })
  expect(document.activeElement).toBe(cog)
  await act(async () => cog.click())
  expect(
    (document.getElementById("scanner-volumeMultiple") as HTMLInputElement)
      .value
  ).toBe("3")
})
it("keeps saved settings when edits are discarded and retains edits after save failure", async () => {
  await act(async () =>
    root.render(
      <TooltipProvider>
        <MarketScannerPanel
          accountId="test-account"
          catalogs={[catalog]}
          selectedMarketKey={null}
          onSelectMarket={vi.fn()}
        />
      </TooltipProvider>
    )
  )
  const cog = host.querySelector<HTMLButtonElement>(
    '[aria-label="Market scanner settings"]'
  )!
  await act(async () => cog.click())
  await input("scanner-volumeMultiple", "9")
  await act(async () => button("Cancel").click())
  await act(async () => button("Discard changes").click())
  expect(mocks.save).not.toHaveBeenCalled()
  await act(async () => cog.click())
  expect(
    (document.getElementById("scanner-volumeMultiple") as HTMLInputElement)
      .value
  ).toBe("5")
  await input("scanner-volumeMultiple", "8")
  mocks.save.mockRejectedValueOnce(new Error("offline"))
  await act(async () => button("Save changes").click())
  expect(document.querySelector('[role="dialog"]')).not.toBeNull()
  expect(
    (document.getElementById("scanner-volumeMultiple") as HTMLInputElement)
      .value
  ).toBe("8")
  expect(mocks.error).toHaveBeenCalled()
})
it("shows signed movement, unavailable values and exact chart navigation", async () => {
  const select = vi.fn()
  mocks.scan.mockReturnValue({
    snapshot: {
      loaded: true,
      total: 4,
      candles: 3,
      warming: 0,
      unavailable: 0,
      errors: [],
      rows: [
        {
          market,
          since: Date.now() - 120000,
          updated: Date.now(),
          change: movement.change,
          rule: "volume matched",
          pace: 5,
          traded: 50000,
        },
        {
          market: { ...market, key: "aster:mainnet:BTCUSDT", symbol: "BTC" },
          since: Date.now(),
          updated: Date.now(),
          change: -0.012,
          rule: "volume matched",
          pace: 4,
          traded: 40000,
        },
        {
          market: { ...market, key: "hyperliquid:mainnet:ETH", symbol: "ETH" },
          since: Date.now(),
          updated: Date.now(),
          change: 0,
          rule: "volume matched",
          pace: 4,
          traded: 40000,
        },
        {
          market: { ...market, key: "hyperliquid:mainnet:SOL", symbol: "SOL" },
          since: Date.now(),
          updated: Date.now(),
          change: null,
          rule: "volume matched",
          pace: 3,
          traded: 30000,
        },
      ],
    },
    retry: mocks.retry,
    dismiss: vi.fn(),
  })
  await act(async () =>
    root.render(
      <TooltipProvider>
        <MarketScannerPanel
          accountId="test-account"
          catalogs={[catalog]}
          selectedMarketKey={market.key}
          onSelectMarket={select}
        />
      </TooltipProvider>
    )
  )
  const rows = host.querySelectorAll("li a")
  expect(rows[0].textContent).toBe("BTC2m ago+2.40%")
  expect(rows[0].lastElementChild?.className).toContain("text-emerald")
  expect(rows[1].lastElementChild?.className).toContain("text-destructive")
  expect(rows[1].getAttribute("href")).toBe(
    "/protocols/aster?market=aster%3Amainnet%3ABTCUSDT"
  )
  expect(rows[2].lastElementChild?.textContent).toBe("0.00%")
  expect(rows[3].lastElementChild?.textContent).toBe("—")
  await act(async () => (rows[0] as HTMLAnchorElement).click())
  expect(select).toHaveBeenCalledWith(market.key)
  expect(
    host.querySelector('[aria-label="Delete BTC from scanner"]')
  ).toBeNull()
  const dismiss = mocks.scan.mock.results.at(-1)!.value.dismiss
  select.mockClear()
  await act(async () =>
    rows[0].dispatchEvent(
      new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        clientX: 20,
        clientY: 30,
      })
    )
  )
  const remove = document.querySelector<HTMLElement>('[role="menuitem"]')!
  expect(remove.textContent).toContain("Delete")
  await act(async () => remove.click())
  expect(dismiss).toHaveBeenCalledWith(market.key)
  expect(select).not.toHaveBeenCalled()
})
it("offers retry when settings cannot load", async () => {
  mocks.load.mockRejectedValueOnce(new Error("offline"))
  await act(async () =>
    root.render(
      <TooltipProvider>
        <MarketScannerPanel
          accountId="test-account"
          catalogs={[]}
          selectedMarketKey={null}
          onSelectMarket={vi.fn()}
        />
      </TooltipProvider>
    )
  )
  expect(host.textContent).toContain("Could not load scanner settings")
  await act(async () => button("Retry").click())
  expect(host.textContent).toContain("No markets meet your conditions yet")
})

it("offers the plain 5% one-minute preset and shows only its controls while preserving saved advanced values", async () => {
  await act(async () =>
    root.render(
      <TooltipProvider>
        <MarketScannerPanel
          accountId="test-account"
          catalogs={[catalog]}
          selectedMarketKey={null}
          onSelectMarket={vi.fn()}
        />
      </TooltipProvider>
    )
  )
  await act(async () =>
    host
      .querySelector<HTMLButtonElement>(
        '[aria-label="Market scanner settings"]'
      )!
      .click()
  )
  await act(async () => button("Use 5% rise in 1 minute").click())
  expect(
    (document.getElementById("scanner-priceIncreasePct") as HTMLInputElement)
      .value
  ).toBe("5")
  expect(document.getElementById("scanner-atrPeriod")).toBeNull()
  expect(document.getElementById("scanner-volumeMultiple")).toBeNull()
  expect(document.body.textContent).toContain("1 minute ago")
  await act(async () => button("Save changes").click())
  expect(mocks.save).toHaveBeenCalledWith(
    expect.objectContaining({
      mode: "price",
      priceIncreasePct: 5,
      priceWindowSeconds: 60,
      volumeMultiple: settings.volumeMultiple,
      atrPeriod: settings.atrPeriod,
      enabled: true,
    })
  )
})

it("closes untouched older saved settings without asking to discard", async () => {
  const {
    priceIncreasePct: _increase,
    priceWindowSeconds: _window,
    ...olderSettings
  } = settings
  mocks.load.mockResolvedValue({
    settings: olderSettings,
    venues: [{ protocol: "hyperliquid", label: "Hyperliquid" }],
  })
  await act(async () =>
    root.render(
      <TooltipProvider>
        <MarketScannerPanel
          accountId="test-account"
          catalogs={[catalog]}
          selectedMarketKey={null}
          onSelectMarket={vi.fn()}
        />
      </TooltipProvider>
    )
  )
  await act(async () =>
    host
      .querySelector<HTMLButtonElement>(
        '[aria-label="Market scanner settings"]'
      )!
      .click()
  )
  await act(async () => button("Cancel").click())
  expect(document.body.textContent).not.toContain("Discard changes?")
  expect(document.querySelector('[role="dialog"]')).toBeNull()
  expect(mocks.save).not.toHaveBeenCalled()
})
