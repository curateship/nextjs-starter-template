// @vitest-environment jsdom
import * as React from "react"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { TooltipProvider } from "@/components/ui/tooltip"
import { loadDrawings } from "@/lib/api/trade/drawings"
import { showErrorToast } from "@/lib/toast/error-toast"
import type { Drawing } from "@/lib/trade/drawings"
import {
  GridLineStopField,
  type GridLineStopChoice,
} from "./grid-line-stop-field"

vi.mock("@/lib/api/trade/drawings", () => ({ loadDrawings: vi.fn() }))
vi.mock("@/lib/toast/error-toast", () => ({ showErrorToast: vi.fn() }))

const line: Drawing = {
  id: "b55a07b5-596b-4428-9377-205b402a7567",
  shape: { kind: "level", price: 100, name: "My floor" },
  alert: { armedAt: 1_000, firedAt: null, direction: "below", buffer: 2 },
}
let host: HTMLDivElement
let root: Root
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.clearAllMocks()
  host = document.createElement("div")
  document.body.append(host)
  root = createRoot(host)
})
afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
})

async function render(
  lines: Drawing[],
  initial: GridLineStopChoice = { enabled: false, stop: null }
) {
  function Form() {
    const [value, onChange] = React.useState(initial)
    return (
      <TooltipProvider>
        <GridLineStopField
          marketKey="hyperliquid:mainnet:BTC"
          drawings={lines}
          value={value}
          onChange={onChange}
        />
      </TooltipProvider>
    )
  }
  await act(async () => root.render(<Form />))
}
async function check() {
  await act(async () =>
    (host.querySelector('[role="checkbox"]') as HTMLElement).click()
  )
}

describe("choosing a drawing alert for a grid stop", () => {
  it("leaves the checkbox off and explains a missing line", async () => {
    vi.mocked(loadDrawings).mockResolvedValue({ drawings: [] })
    await render([])
    await check()
    expect(showErrorToast).toHaveBeenCalledWith(
      "Draw a line with an alert first."
    )
    expect(
      host.querySelector('[role="checkbox"]')?.getAttribute("aria-checked")
    ).toBe("false")
  })
  it("selects the sole eligible line and shows its description and buffer", async () => {
    vi.mocked(loadDrawings).mockResolvedValue({ drawings: [line] })
    await render([line])
    await check()
    expect(
      host.querySelector('[role="checkbox"]')?.getAttribute("aria-checked")
    ).toBe("true")
    expect(host.textContent).toContain("My floor")
    expect(host.textContent).toContain("2% below")
  })
  it("requires a choice when several lines qualify", async () => {
    const lines = [
      line,
      { ...line, id: "a55a07b5-596b-4428-9377-205b402a7567" },
    ]
    vi.mocked(loadDrawings).mockResolvedValue({ drawings: lines })
    await render(lines)
    await check()
    expect(host.textContent).toContain("Choose a drawing alert")
    expect(
      host.querySelector('[role="combobox"]')?.getAttribute("aria-invalid")
    ).toBe("true")
  })
  it("shows a retryable load failure instead of saying there are no lines", async () => {
    vi.mocked(loadDrawings).mockRejectedValue(new Error("offline"))
    await render([])
    await check()
    expect(host.textContent).toContain("Could not load drawing alerts.")
    expect(host.textContent).toContain("Try again")
    expect(showErrorToast).not.toHaveBeenCalledWith(
      "Draw a line with an alert first."
    )
    vi.mocked(loadDrawings).mockResolvedValue({ drawings: [line] })
    await act(async () =>
      (
        Array.from(host.querySelectorAll("button")).find(
          (button) => button.textContent === "Try again"
        ) as HTMLElement
      ).click()
    )
    await check()
    expect(
      host.querySelector('[role="checkbox"]')?.getAttribute("aria-checked")
    ).toBe("true")
  })
  it("keeps an unavailable selection instead of substituting another alert", async () => {
    vi.mocked(loadDrawings).mockResolvedValue({
      drawings: [{ ...line, alert: { ...line.alert!, armedAt: 2_000 } }],
    })
    await render([line], {
      enabled: true,
      stop: { drawingId: line.id, armedAt: 1_000 },
    })
    expect(host.textContent).toContain("The selected alert is unavailable")
    expect(
      host.querySelector('[role="checkbox"]')?.getAttribute("aria-checked")
    ).toBe("true")
  })
  it("keeps a fired line visible when the chart changes before its refresh returns", async () => {
    vi.mocked(loadDrawings).mockResolvedValue({ drawings: [line] })
    const value = {
      enabled: true,
      stop: { drawingId: line.id, armedAt: 1_000 },
    }
    const onChange = vi.fn()
    await act(async () =>
      root.render(
        <TooltipProvider>
          <GridLineStopField
            marketKey="hyperliquid:mainnet:BTC"
            drawings={[line]}
            value={value}
            linkedStop={value.stop}
            onChange={onChange}
          />
        </TooltipProvider>
      )
    )
    vi.mocked(loadDrawings).mockReturnValue(new Promise(() => {}))
    const fired = { ...line, alert: { ...line.alert!, firedAt: 2_000 } }
    await act(async () =>
      root.render(
        <TooltipProvider>
          <GridLineStopField
            marketKey="hyperliquid:mainnet:BTC"
            drawings={[fired]}
            value={value}
            linkedStop={value.stop}
            onChange={onChange}
          />
        </TooltipProvider>
      )
    )
    expect(host.textContent).toContain("My floor")
    expect(host.textContent).toContain("The alert fired. The grid is closing.")
    expect(onChange).not.toHaveBeenCalled()
  })
})
