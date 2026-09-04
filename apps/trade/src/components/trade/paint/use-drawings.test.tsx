// @vitest-environment jsdom

import * as React from "react"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

const api = vi.hoisted(() => ({
  load: vi.fn(),
  setAlert: vi.fn(),
  setBuffer: vi.fn(),
}))

vi.mock("@/lib/api/trade/drawings", () => ({
  clearDrawings: vi.fn(),
  deleteDrawing: vi.fn(async () => undefined),
  getDrawingsErrorMessage: vi.fn(),
  getDrawingAlertErrorMessage: vi.fn(),
  getDrawingsLoadErrorMessage: vi.fn(),
  loadDrawings: api.load,
  saveDrawing: vi.fn(async () => undefined),
  setDrawingAlert: api.setAlert,
  setDrawingAlertBuffer: api.setBuffer,
}))
vi.mock("@/lib/toast/error-toast", () => ({ showErrorToast: vi.fn() }))
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }))

import { useChartDrawings } from "@/components/trade/paint/use-drawings"

const firstMarket = "hyperliquid:mainnet:BTC"
const secondMarket = "hyperliquid:mainnet:ETH"
const initial = {
  marketKey: firstMarket,
  rows: [
    {
      id: "opening",
      shape: { kind: "level" as const, price: 100 },
      alert: null,
    },
  ],
  error: null,
}

type Paint = ReturnType<typeof useChartDrawings>
let latest: Paint | null = null

function Harness({ marketKey }: { marketKey: string }) {
  const paint = useChartDrawings(marketKey, initial)
  // Handed out after render, so the test can call the hook's functions.
  React.useEffect(() => {
    latest = paint
  })
  return (
    <div>
      {paint.drawings
        .map((drawing) =>
          drawing.shape.kind === "level"
            ? `${drawing.id}@${drawing.shape.price}`
            : drawing.id
        )
        .join(",")}
    </div>
  )
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
        alert: null,
      },
    ],
  }))
  api.setAlert.mockReset()
  api.setAlert.mockImplementation(
    async (
      id: string,
      on: boolean,
      _currentPrice: number,
      buffer: number | null
    ) => ({
      id,
      shape: { kind: "level" as const, price: 200 },
      alert: on
        ? {
            direction: "above" as const,
            armedAt: 2,
            firedAt: null,
            ...(buffer === null ? {} : { buffer }),
          }
        : null,
    })
  )
  api.setBuffer.mockReset()
  api.setBuffer.mockImplementation(
    async (id: string, buffer: number | null) => ({
      id,
      shape: { kind: "level" as const, price: 100 },
      alert: {
        direction: "above" as const,
        armedAt: 1,
        firedAt: null,
        ...(buffer === null ? {} : { buffer }),
      },
    })
  )
})

afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
})

it("loads the remembered market again after visiting another market", async () => {
  await act(async () => root.render(<Harness marketKey={firstMarket} />))
  expect(host.textContent).toBe("opening@100")
  expect(api.load).not.toHaveBeenCalled()

  await act(async () => root.render(<Harness marketKey={secondMarket} />))
  expect(host.textContent).toBe("second@200")

  await act(async () => root.render(<Harness marketKey={firstMarket} />))
  expect(host.textContent).toBe("fresh-first@200")
  expect(api.load.mock.calls.map(([marketKey]) => marketKey)).toEqual([
    secondMarket,
    firstMarket,
  ])
})

it("keeps a line changed while a re-read was on its way, and drops one deleted meanwhile", async () => {
  // The line's window opens and asks for the lines again. Before the answer
  // lands, the switch in that window is flipped. The answer was read before
  // the flip was saved, so it must not flip the line back.
  let answer: (value: { drawings: unknown[] }) => void = () => undefined
  api.load
    .mockImplementationOnce(async () => ({
      drawings: [
        { id: "second", shape: { kind: "level", price: 200 }, alert: null },
        { id: "gone", shape: { kind: "level", price: 300 }, alert: null },
      ],
    }))
    .mockImplementationOnce(
      () => new Promise((resolve) => (answer = resolve))
    )
  await act(async () => root.render(<Harness marketKey={secondMarket} />))
  expect(host.textContent).toBe("second@200,gone@300")
  await act(async () => latest!.refresh())
  act(() => latest!.move("second", { kind: "level", price: 250 }))
  act(() => latest!.remove("gone"))
  await act(async () => {
    answer({
      drawings: [
        { id: "second", shape: { kind: "level", price: 200 }, alert: null },
        { id: "gone", shape: { kind: "level", price: 300 }, alert: null },
        { id: "engine-wrote", shape: { kind: "level", price: 400 }, alert: null },
      ],
    })
  })
  expect(host.textContent).toBe("second@250,engine-wrote@400")
})

it("uses 1% first, then starts the next line with the last saved buffer", async () => {
  const remembered = {
    marketKey: firstMarket,
    rows: [
      {
        id: "first",
        shape: { kind: "level" as const, price: 100 },
        alert: {
          direction: "above" as const,
          armedAt: 1,
          firedAt: null,
          buffer: 1,
        },
      },
      {
        id: "second",
        shape: { kind: "level" as const, price: 200 },
        alert: null,
      },
    ],
    error: null,
  }

  function RememberingHarness() {
    const [buffer, setBuffer] = React.useState<number | null>(1)
    const paint = useChartDrawings(
      firstMarket,
      remembered,
      undefined,
      buffer,
      setBuffer
    )
    React.useEffect(() => {
      latest = paint
    })
    return <div data-buffer={buffer ?? "none"} />
  }

  await act(async () => root.render(<RememberingHarness />))
  expect(host.firstElementChild?.getAttribute("data-buffer")).toBe("1")

  await act(async () => {
    latest!.setBuffer("first", 2.5)
    await Promise.resolve()
  })
  expect(api.setBuffer).toHaveBeenCalledWith("first", 2.5)
  expect(host.firstElementChild?.getAttribute("data-buffer")).toBe("2.5")

  await act(async () => {
    latest!.setAlert("second", true, 100)
    await Promise.resolve()
  })
  expect(api.setAlert).toHaveBeenCalledWith("second", true, 100, 2.5)
  expect(
    latest!.drawings.find((drawing) => drawing.id === "second")?.alert?.buffer
  ).toBe(2.5)
})

it("waits for a new alert to exist before saving an immediately typed buffer", async () => {
  let finishAlert: (value: {
    id: string
    shape: { kind: "level"; price: number }
    alert: {
      direction: "above"
      armedAt: number
      firedAt: null
      buffer: number
    }
  }) => void = () => undefined
  api.setAlert.mockImplementationOnce(
    () => new Promise((resolve) => (finishAlert = resolve))
  )
  const rows = {
    marketKey: firstMarket,
    rows: [
      {
        id: "quick-buffer",
        shape: { kind: "level" as const, price: 100 },
        alert: null,
      },
    ],
    error: null,
  }

  function QuickBufferHarness() {
    const paint = useChartDrawings(firstMarket, rows)
    React.useEffect(() => {
      latest = paint
    })
    return null
  }

  await act(async () => root.render(<QuickBufferHarness />))
  act(() => latest!.setAlert("quick-buffer", true, 90))
  await act(async () => Promise.resolve())
  act(() => latest!.setBuffer("quick-buffer", 2.5))
  expect(api.setBuffer).not.toHaveBeenCalled()

  await act(async () => {
    finishAlert({
      id: "quick-buffer",
      shape: { kind: "level", price: 100 },
      alert: {
        direction: "above",
        armedAt: 2,
        firedAt: null,
        buffer: 1,
      },
    })
    await Promise.resolve()
    await Promise.resolve()
  })

  expect(api.setBuffer).toHaveBeenCalledWith("quick-buffer", 2.5)
})
