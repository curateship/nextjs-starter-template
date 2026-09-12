// @vitest-environment jsdom

import * as React from "react"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

const api = vi.hoisted(() => ({
  load: vi.fn(),
  save: vi.fn(async () => undefined),
  remove: vi.fn(async () => undefined),
  toast: vi.fn(),
  setAlert: vi.fn(),
  setBuffer: vi.fn(),
}))

vi.mock("@/lib/api/trade/drawings", () => ({
  clearDrawings: vi.fn(),
  deleteDrawing: api.remove,
  getDrawingsErrorMessage: vi.fn(),
  getDrawingAlertErrorMessage: vi.fn(),
  getDrawingsLoadErrorMessage: vi.fn(),
  loadDrawings: api.load,
  saveDrawing: api.save,
  setDrawingAlert: api.setAlert,
  setDrawingAlertBuffer: api.setBuffer,
}))
vi.mock("@/lib/toast/error-toast", () => ({ showErrorToast: vi.fn(), dismissErrorToast: vi.fn() }))
vi.mock("sonner", () => ({ toast: { success: api.toast } }))

import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"

import { TooltipProvider } from "@/components/ui/tooltip"
import { LineAlertPopover } from "@/components/trade/paint/line-alert-popover"

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

function Harness({
  marketKey,
  defaultAlertOn = true,
  onAlertPreference,
}: {
  marketKey: string
  defaultAlertOn?: boolean
  onAlertPreference?: (on: boolean) => void
}) {
  const paint = useChartDrawings(
    marketKey,
    initial,
    undefined,
    1,
    undefined,
    defaultAlertOn,
    onAlertPreference
  )
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
  api.save.mockReset().mockResolvedValue(undefined)
  api.remove.mockReset().mockResolvedValue(undefined)
  api.toast.mockReset()
  vi.mocked(showErrorToast).mockClear()
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

it("enables a new line's alert by default after saving its drawing", async () => {
  await act(async () => root.render(<Harness marketKey={firstMarket} />))
  await act(async () => latest!.create({ kind: "level", price: 200 }, 100))
  const created = latest!.drawings.at(-1)!
  expect(api.setAlert).toHaveBeenCalledWith(created.id, true, 100, 1)
  expect(created.alert?.firedAt).toBeNull()
  expect(api.save.mock.invocationCallOrder[0]).toBeLessThan(
    api.setAlert.mock.invocationCallOrder[0]!
  )
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
    .mockImplementationOnce(() => new Promise((resolve) => (answer = resolve)))
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
        {
          id: "engine-wrote",
          shape: { kind: "level", price: 400 },
          alert: null,
        },
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

it("deletes a drawing without a success toast before or after the save", async () => {
  let finish: () => void = () => undefined
  api.remove.mockImplementationOnce(
    () =>
      new Promise<undefined>((resolve) => {
        finish = () => resolve(undefined)
      })
  )
  await act(async () => root.render(<Harness marketKey={firstMarket} />))
  await act(async () => latest!.remove("opening"))
  expect(host.textContent).toBe("")
  expect(api.toast).not.toHaveBeenCalled()
  await act(async () => finish())
  expect(host.textContent).toBe("")
  expect(api.toast).not.toHaveBeenCalled()
  expect(api.save).not.toHaveBeenCalled()
})

it("restores a failed deletion without offering Undo", async () => {
  await act(async () => root.render(<Harness marketKey={firstMarket} />))
  api.remove.mockRejectedValueOnce(new Error("delete failed"))
  await act(async () => latest!.remove("opening"))
  expect(host.textContent).toBe("opening@100")
  expect(showErrorToast).toHaveBeenCalled()
  expect(api.toast).not.toHaveBeenCalled()
})

it("deletes a fib without showing a success toast or Undo action", async () => {
  await act(async () => root.render(<Harness marketKey={firstMarket} />))
  await act(async () =>
    latest!.create({
      kind: "fib",
      from: { time: 1000, price: 100 },
      to: { time: 2000, price: 200 },
    })
  )
  const fib = latest!.drawings.find((drawing) => drawing.shape.kind === "fib")!
  await act(async () => latest!.remove(fib.id))
  expect(api.remove).toHaveBeenCalledWith(fib.id)
  expect(latest!.drawings.some((drawing) => drawing.id === fib.id)).toBe(false)
  expect(api.toast).not.toHaveBeenCalled()
})

it("restores a fib and reports an error when deletion fails", async () => {
  await act(async () => root.render(<Harness marketKey={firstMarket} />))
  await act(async () =>
    latest!.create({
      kind: "fib",
      from: { time: 1000, price: 100 },
      to: { time: 2000, price: 200 },
    })
  )
  const fib = latest!.drawings.find((drawing) => drawing.shape.kind === "fib")!
  api.remove.mockRejectedValueOnce(new Error("delete failed"))
  await act(async () => latest!.remove(fib.id))
  expect(latest!.drawings).toContainEqual(fib)
  expect(showErrorToast).toHaveBeenCalled()
  expect(api.toast).not.toHaveBeenCalled()
})

it("leaves a new line's alert off when that is the remembered choice", async () => {
  await act(async () =>
    root.render(<Harness marketKey={firstMarket} defaultAlertOn={false} />)
  )
  await act(async () => latest!.create({ kind: "level", price: 200 }, 100))
  expect(latest!.drawings.at(-1)?.alert).toBeNull()
  expect(api.setAlert).not.toHaveBeenCalled()
})

it("remembers only successful manual alert choices, never automatic enabling", async () => {
  const remember = vi.fn()
  await act(async () =>
    root.render(
      <Harness marketKey={firstMarket} onAlertPreference={remember} />
    )
  )
  await act(async () => latest!.create({ kind: "level", price: 200 }, 100))
  expect(remember).not.toHaveBeenCalled()
  const id = latest!.drawings.at(-1)!.id
  await act(async () => latest!.setAlert(id, false, 100))
  expect(remember).toHaveBeenLastCalledWith(false)
  api.setAlert.mockRejectedValueOnce(new Error("save refused"))
  await act(async () => latest!.setAlert(id, true, 100))
  expect(remember).toHaveBeenCalledTimes(1)
  expect(latest!.drawings.at(-1)?.alert).toBeNull()
  await act(async () => latest!.setAlert(id, true, 100))
  expect(remember).toHaveBeenLastCalledWith(true)
})

it("keeps the drawing but shows an error if its automatic alert cannot save", async () => {
  api.setAlert.mockRejectedValueOnce(new Error("save refused"))
  await act(async () => root.render(<Harness marketKey={firstMarket} />))
  await act(async () => latest!.create({ kind: "level", price: 200 }, 100))
  expect(latest!.drawings).toHaveLength(2)
  expect(latest!.drawings.at(-1)?.alert).toBeNull()
  expect(showErrorToast).toHaveBeenCalledTimes(1)
})

it("does not enable an alert when saving the new drawing fails", async () => {
  api.save.mockRejectedValueOnce(new Error("save refused"))
  await act(async () => root.render(<Harness marketKey={firstMarket} />))
  await act(async () => latest!.create({ kind: "level", price: 200 }, 100))
  expect(latest!.drawings).toHaveLength(1)
  expect(api.setAlert).not.toHaveBeenCalled()
})

it("leaves fibs alone and explains lines without a usable alert price", async () => {
  await act(async () => root.render(<Harness marketKey={firstMarket} />))
  await act(async () =>
    latest!.create(
      {
        kind: "fib",
        from: { time: 1, price: 100 },
        to: { time: 2, price: 200 },
      },
      100
    )
  )
  expect(showErrorToast).not.toHaveBeenCalled()
  await act(async () =>
    latest!.create(
      {
        kind: "trendline",
        from: { time: 1, price: 100 },
        to: { time: 1, price: 200 },
      },
      100
    )
  )
  await act(async () => latest!.create({ kind: "level", price: 200 }, null))
  expect(api.setAlert).not.toHaveBeenCalled()
  expect(showErrorToast).toHaveBeenCalledTimes(2)
})

it("finishes saving a new line before honoring a quick manual switch off", async () => {
  let finish: () => void = () => undefined
  api.save.mockImplementationOnce(
    () =>
      new Promise<undefined>((resolve) => {
        finish = () => resolve(undefined)
      })
  )
  const remember = vi.fn()
  await act(async () =>
    root.render(
      <Harness marketKey={firstMarket} onAlertPreference={remember} />
    )
  )
  act(() => latest!.create({ kind: "level", price: 200 }, 100))
  const id = latest!.drawings.at(-1)!.id
  act(() => latest!.setAlert(id, false, 100))
  expect(api.setAlert).not.toHaveBeenCalled()
  await act(async () => finish())
  expect(api.setAlert.mock.calls.map((call) => call[1])).toEqual([true, false])
  expect(latest!.drawings.at(-1)?.alert).toBeNull()
  expect(remember).toHaveBeenCalledExactlyOnceWith(false)
})

it("renders Alert on for a new line and uses the switch choice for the next line", async () => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  )
  document.body.appendChild(host)
  function Controls() {
    const [on, remember] = React.useState(true)
    const paint = useChartDrawings(
      firstMarket,
      initial,
      undefined,
      1,
      undefined,
      on,
      remember
    )
    const svg = React.useRef<SVGSVGElement>(null)
    const selected = paint.drawings.find((row) => row.id === paint.selectedId)
    return (
      <>
        <svg ref={svg} />
        <button
          onClick={() => paint.create({ kind: "level", price: 200 }, 100)}
        >
          Draw line
        </button>
        {selected ? (
          <LineAlertPopover
            drawing={selected}
            linePrice={200}
            currentPrice={100}
            svg={svg}
            at={{ x: 0, y: 0 }}
            open
            wide
            autoFocus={false}
            paused={false}
            onOpenChange={() => undefined}
            onSetAlert={(value) => paint.setAlert(selected.id, value, 100)}
            onSetExtend={() => undefined}
            onSetName={() => undefined}
            onSetBuffer={() => undefined}
            onSetRules={() => undefined}
            onSetExpiry={async () => true}
          />
        ) : null}
      </>
    )
  }
  try {
    await act(async () => root.render(<TooltipProvider><Controls /></TooltipProvider>))
    await act(async () => host.querySelector("button")!.click())
    const toggle = () =>
      document.querySelector<HTMLButtonElement>('[role="switch"]')!
    expect(toggle().getAttribute("aria-checked")).toBe("true")
    await act(async () => toggle().click())
    expect(toggle().getAttribute("aria-checked")).toBe("false")
    await act(async () => host.querySelector("button")!.click())
    expect(toggle().getAttribute("aria-checked")).toBe("false")
    api.setAlert.mockRejectedValueOnce(new Error("save refused"))
    await act(async () => toggle().click())
    expect(toggle().getAttribute("aria-checked")).toBe("false")
    expect(showErrorToast).toHaveBeenCalled()
    await act(async () => toggle().click())
    await act(async () => host.querySelector("button")!.click())
    expect(toggle().getAttribute("aria-checked")).toBe("true")
  } finally {
    vi.unstubAllGlobals()
  }
})

it("waits for automatic alert creation before deleting a new line", async () => {
  let finish: () => void = () => undefined
  api.save.mockImplementationOnce(
    () =>
      new Promise<undefined>((resolve) => {
        finish = () => resolve(undefined)
      })
  )
  await act(async () => root.render(<Harness marketKey={firstMarket} />))
  act(() => latest!.create({ kind: "level", price: 200 }, 100))
  const id = latest!.drawings.at(-1)!.id
  await act(async () => latest!.remove(id))
  expect(api.remove).not.toHaveBeenCalled()
  await act(async () => finish())
  expect(api.remove).toHaveBeenCalledWith(id)
  expect(latest!.drawings.some((row) => row.id === id)).toBe(false)
})


it("clears an earlier expiry error when retrying days, including an unchanged valid value", async () => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  )
  document.body.appendChild(host)
  const saveExpiry = vi.fn(async () => true)
  const now = Date.now()
  function Controls() {
    const svg = React.useRef<SVGSVGElement>(null)
    return (
      <TooltipProvider>
        <svg ref={svg} />
        <LineAlertPopover
          drawing={{
            id: "expiry-retry",
            shape: { kind: "level", price: 200 },
            alert: {
              direction: "above",
              armedAt: now,
              firedAt: null,
              expiresAt: now + 2 * 86_400_000,
            },
          }}
          linePrice={200}
          currentPrice={100}
          svg={svg}
          at={{ x: 0, y: 0 }}
          open
          wide
          autoFocus={false}
          paused={false}
          onOpenChange={() => undefined}
          onSetAlert={() => undefined}
          onSetExtend={() => undefined}
          onSetName={() => undefined}
          onSetBuffer={() => undefined}
          onSetRules={() => undefined}
          onSetExpiry={saveExpiry}
        />
      </TooltipProvider>
    )
  }
  await act(async () => root.render(<Controls />))
  const input = document.querySelector<HTMLInputElement>(
    "#line-expiry-expiry-retry-days"
  )!
  const type = async (value: string) => {
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      )!.set!.call(input, value)
      input.dispatchEvent(new Event("input", { bubbles: true }))
    })
    await act(async () =>
      input.dispatchEvent(new FocusEvent("focusout", { bubbles: true }))
    )
  }
  await type("0")
  expect(input.getAttribute("aria-invalid")).toBe("true")
  expect(showErrorToast).toHaveBeenCalled()
  vi.mocked(dismissErrorToast).mockClear()
  await type("2")
  expect(dismissErrorToast).toHaveBeenCalledOnce()
  expect(saveExpiry).not.toHaveBeenCalled()
  expect(input.getAttribute("aria-invalid")).toBeNull()
  vi.mocked(dismissErrorToast).mockClear()
  await type("3")
  expect(saveExpiry).toHaveBeenCalledWith({ mode: "days", days: 3 })
  expect(dismissErrorToast).toHaveBeenCalledOnce()
  expect(vi.mocked(dismissErrorToast).mock.invocationCallOrder[0]).toBeLessThan(
    saveExpiry.mock.invocationCallOrder[0]!
  )
})
