// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

const api = vi.hoisted(() => ({
  load: vi.fn(),
}))

vi.mock("@/lib/api/trade/drawings", () => ({
  clearDrawings: vi.fn(),
  deleteDrawing: vi.fn(),
  getDrawingsErrorMessage: vi.fn(),
  getDrawingsLoadErrorMessage: vi.fn(),
  loadDrawings: api.load,
  saveDrawing: vi.fn(),
}))
vi.mock("@/lib/toast/error-toast", () => ({ showErrorToast: vi.fn() }))
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }))

import { useChartDrawings } from "@/components/trade/paint/use-drawings"

const firstMarket = "hyperliquid:mainnet:BTC"
const secondMarket = "hyperliquid:mainnet:ETH"
const initial = {
  marketKey: firstMarket,
  rows: [{ id: "opening", shape: { kind: "level" as const, price: 100 } }],
  error: null,
}

function Harness({ marketKey }: { marketKey: string }) {
  const { drawings } = useChartDrawings(marketKey, initial)
  return <div>{drawings.map((drawing) => drawing.id).join(",")}</div>
}

let host: HTMLDivElement
let root: Root

beforeEach(() => {
  ;(
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true
  host = document.createElement("div")
  root = createRoot(host)
  api.load.mockReset()
  api.load.mockImplementation(async (marketKey: string) => ({
    drawings: [
      {
        id: marketKey === firstMarket ? "fresh-first" : "second",
        shape: { kind: "level" as const, price: 200 },
      },
    ],
  }))
})

afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
})

it("loads the remembered market again after visiting another market", async () => {
  await act(async () => root.render(<Harness marketKey={firstMarket} />))
  expect(host.textContent).toBe("opening")
  expect(api.load).not.toHaveBeenCalled()

  await act(async () => root.render(<Harness marketKey={secondMarket} />))
  expect(host.textContent).toBe("second")

  await act(async () => root.render(<Harness marketKey={firstMarket} />))
  expect(host.textContent).toBe("fresh-first")
  expect(api.load.mock.calls.map(([marketKey]) => marketKey)).toEqual([
    secondMarket,
    firstMarket,
  ])
})
