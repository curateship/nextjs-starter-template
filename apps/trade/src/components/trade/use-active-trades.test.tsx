// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { loadActiveTradesHeader, loadLastHeaderFigures, loadHiddenTradeColumns } =
  vi.hoisted(() => ({
    loadActiveTradesHeader: vi.fn(),
    loadLastHeaderFigures: vi.fn(),
    loadHiddenTradeColumns: vi.fn(),
  }))

vi.mock("@/lib/api/trade/active-trades-header", () => ({
  loadActiveTradesHeader,
  loadLastHeaderFigures,
}))
vi.mock("@/lib/api/trade/panel-layouts", () => ({
  loadHiddenTradeColumns,
  saveHiddenTradeColumns: vi.fn(),
  getPanelLayoutErrorMessage: () => "",
}))

const { useActiveTrades, useHiddenTradeColumns } = await import(
  "@/components/trade/use-active-trades"
)

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

function Reader({ name }: { name: string }) {
  const { snapshot } = useActiveTrades()
  useHiddenTradeColumns()
  return <span data-testid={name}>{snapshot ? snapshot.activeTrades.length : "reading"}</span>
}

let host: HTMLDivElement
let root: Root

beforeEach(() => {
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" })
  host = document.createElement("div")
  document.body.append(host)
  root = createRoot(host)
  loadLastHeaderFigures.mockResolvedValue(null)
  loadHiddenTradeColumns.mockResolvedValue({})
  loadActiveTradesHeader.mockResolvedValue({
    snapshot: { readAt: 1, activeTrades: [{}, {}], activeTradesUnavailable: [], watchingOrders: [] },
  })
})

afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  vi.clearAllMocks()
})

describe("the shared active trades read", () => {
  it("asks once for the header button and the Positions panel together", async () => {
    await act(async () =>
      root.render(
        <>
          <Reader name="header" />
          <Reader name="positions" />
        </>
      )
    )
    expect(loadActiveTradesHeader).toHaveBeenCalledTimes(1)
    expect(loadHiddenTradeColumns).toHaveBeenCalledTimes(1)
    expect(host.querySelector('[data-testid="header"]')?.textContent).toBe("2")
    expect(host.querySelector('[data-testid="positions"]')?.textContent).toBe("2")
  })

  it("forgets the list once nothing shows it, so the next reader starts afresh", async () => {
    await act(async () => root.render(<Reader name="first" />))
    await act(async () => root.render(<></>))
    loadActiveTradesHeader.mockReturnValue(new Promise(() => {}))
    await act(async () => root.render(<Reader name="second" />))
    expect(host.querySelector('[data-testid="second"]')?.textContent).toBe("reading")
    expect(loadActiveTradesHeader).toHaveBeenCalledTimes(2)
  })
})
