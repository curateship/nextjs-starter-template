// @vitest-environment jsdom

import { act } from "react"
import type { ReactNode } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { FlowTrading } from "@/lib/api/trade/flow-trading"

const { dismissErrorToast, loadFlowTrading, showErrorToast, stopFlow } =
  vi.hoisted(() => ({
    dismissErrorToast: vi.fn(),
    loadFlowTrading: vi.fn(),
    showErrorToast: vi.fn(() => "flow-read-error"),
    stopFlow: vi.fn(),
  }))

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    to,
    params,
    ...props
  }: {
    children: ReactNode
    to: string
    params?: { runId?: string }
    "aria-label"?: string
    className?: string
  }) => (
    <a data-to={to} data-run-id={params?.runId} {...props}>
      {children}
    </a>
  ),
}))

vi.mock("sonner", () => ({ toast: { success: vi.fn() } }))

vi.mock("@/lib/api/trade/flow-trading", () => ({
  flowActionProblem: () => "That did not work.",
  getFlowTradingErrorMessage: () =>
    "Could not read this flow's trading status.",
  loadFlowTrading,
  pauseFlow: vi.fn(),
  retryFlowNow: vi.fn(),
  stopFlow,
}))

vi.mock("@/lib/api/trade/recipes", () => ({
  getRecipeErrorMessage: (error: unknown) => String(error),
  runRecipe: vi.fn(),
}))

vi.mock("@/lib/toast/error-toast", () => ({
  dismissErrorToast,
  showErrorToast,
}))

vi.mock("@/components/ui/confirm-dialog", () => ({
  ConfirmDialog: ({
    open,
    title,
    confirmLabel,
    onConfirm,
  }: {
    open: boolean
    title: string
    confirmLabel: string
    onConfirm: () => void
  }) =>
    open ? (
      <section aria-label={title}>
        <button type="button" onClick={onConfirm}>
          {confirmLabel}
        </button>
      </section>
    ) : null,
}))

vi.mock("@/components/ui/popover", () => ({
  Popover: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  PopoverContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  PopoverHeader: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  PopoverTitle: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  PopoverTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

const { default: FlowStatusHeader } =
  await import("@/components/recipes/flow-status-header")

function flow(stopping: boolean): FlowTrading {
  return {
    mode: "trades",
    walletLabel: "Live",
    real: true,
    venue: "Hyperliquid",
    coins: 12,
    problem: null,
    running: !stopping,
    stopping,
    runId: "run-1",
    startedAt: 1_700_000_000_000,
    working: 12,
    drawingChanged: false,
    drawnIsBacktest: false,
    waiting: [],
    headline: stopping ? "12 ladders left to call off." : null,
    needsAttention: false,
    holding: false,
    paused: false,
  }
}

let host: HTMLDivElement
let root: Root

beforeEach(() => {
  ;(
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true
  host = document.createElement("div")
  document.body.appendChild(host)
  root = createRoot(host)
  loadFlowTrading.mockResolvedValue(flow(false))
  stopFlow.mockResolvedValue({ summary: "Stopping: 12 ladders left." })
})

afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe("stopping a flow", () => {
  it("closes the confirmation before Stop answers", async () => {
    let answerStop: ((answer: { summary: string }) => void) | undefined
    stopFlow.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          answerStop = resolve
        })
    )
    await act(async () => {
      root.render(<FlowStatusHeader automationId="flow-1" />)
    })

    const stop = [...host.querySelectorAll("button")].find(
      (button) => button.textContent === "Stop"
    )
    await act(async () => stop?.click())
    expect(host.querySelector('[aria-label="Stop this flow?"]')).not.toBeNull()

    loadFlowTrading.mockResolvedValue(flow(true))
    const confirm = [...host.querySelectorAll("button")].find(
      (button) => button.textContent === "Stop it"
    )
    await act(async () => confirm?.click())

    expect(stopFlow).toHaveBeenCalledWith("flow-1")
    expect(host.querySelector('[aria-label="Stop this flow?"]')).toBeNull()
    expect(host.textContent).toContain("Stopping")
    expect(host.textContent).toContain("12 left")

    await act(async () => {
      answerStop?.({ summary: "Stopping: 12 ladders left." })
    })
  })
})

describe("reading a flow", () => {
  it("links the run name and figures to the run dashboard", async () => {
    await act(async () => {
      root.render(<FlowStatusHeader automationId="flow-1" />)
    })

    const summary = host.querySelector(
      'a[aria-label="Open Live run dashboard"]'
    )
    expect(summary?.getAttribute("data-to")).toBe("/flow-runs/$runId")
    expect(summary?.getAttribute("data-run-id")).toBe("run-1")
    expect(summary?.textContent).toContain("Live")
    expect(summary?.textContent).not.toContain("Spending cap")
  })

  it("keeps the summary plain when the flow has no run", async () => {
    loadFlowTrading.mockResolvedValueOnce({ ...flow(false), runId: null })

    await act(async () => {
      root.render(<FlowStatusHeader automationId="flow-1" />)
    })

    expect(host.querySelector('a[data-to="/flow-runs/$runId"]')).toBeNull()
    expect(host.textContent).toContain("Live")
    expect(host.textContent).not.toContain("Spending cap")
  })

  it("keeps a status button in the header before the first answer lands", async () => {
    loadFlowTrading.mockImplementationOnce(() => new Promise(() => {}))

    await act(async () => {
      root.render(<FlowStatusHeader automationId="flow-1" />)
    })

    const reading = host.querySelector(
      'button[aria-label="Reading trading status"]'
    )
    expect(reading).not.toBeNull()
    expect(reading?.textContent).toContain("Reading trading status")
  })

  it("reports a failed status read instead of hiding it", async () => {
    loadFlowTrading.mockRejectedValueOnce(new Error("database unavailable"))

    await act(async () => {
      root.render(<FlowStatusHeader automationId="flow-1" />)
    })

    expect(showErrorToast).toHaveBeenCalledWith(
      "Could not read this flow's trading status."
    )
    expect(
      host.querySelector('button[aria-label="Reading trading status"]')
    ).not.toBeNull()
  })

  it("dismisses the shared error after a later read succeeds", async () => {
    vi.useFakeTimers()
    loadFlowTrading
      .mockRejectedValueOnce(new Error("database unavailable"))
      .mockResolvedValueOnce(flow(false))

    await act(async () => {
      root.render(<FlowStatusHeader automationId="flow-1" />)
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000)
    })

    expect(dismissErrorToast).toHaveBeenCalledWith()
  })
})
