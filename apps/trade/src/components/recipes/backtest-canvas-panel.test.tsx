// @vitest-environment jsdom
import { tradeDcaNode } from "@/lib/recipes/trade-dca"
import { tradeMarketsNode } from "@/lib/recipes/trade-markets"
import { tradeWalletNode } from "@/lib/recipes/trade-wallet"

import { act, type ComponentProps } from "react"
import { createRoot } from "react-dom/client"
import { describe, expect, it, vi } from "vitest"

import { loadFlowTrading, type FlowTrading } from "@/lib/api/trade/flow-trading"
import { TooltipProvider } from "@/components/ui/tooltip"
import BacktestPanel from "@/components/recipes/backtest-canvas-panel"

function BacktestCanvasPanel(props: ComponentProps<typeof BacktestPanel>) {
  return <TooltipProvider><BacktestPanel {...props} /></TooltipProvider>
}

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

const { loadBacktests, runRecipe } = vi.hoisted(() => ({
  loadBacktests: vi.fn(async () => ({ runs: [] })),
  runRecipe: vi.fn(async () => ({
    started: true,
    mode: "backtest",
    summary: "Backtest started.",
  })),
}))

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => children,
  useNavigate: () => vi.fn(),
}))

vi.mock("@/lib/api/trade/backtests", () => ({
  getBacktestErrorMessage: (error: unknown) => String(error),
  loadBacktests,
  stopBacktest: vi.fn(),
}))

vi.mock("@/lib/api/trade/flow-trading", () => ({
  loadFlowTrading: vi.fn(async () => ({ mode: "backtest" })),
}))

vi.mock("@/lib/api/trade/recipes", () => ({
  getRecipeErrorMessage: (error: unknown) => String(error),
  runRecipe,
}))

describe("the backtest canvas panel", () => {
  it("reports that a new recipe has no result for the header tab", async () => {
    const latest = vi.fn()
    const host = document.createElement("div")
    document.body.append(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(
        <BacktestCanvasPanel
          automationId="new-recipe"
          runId={null}
          onClose={() => {}}
          onLatestRunIdChange={latest}
        />
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(latest).toHaveBeenCalledWith(null)
    await act(async () => root.unmount())
    host.remove()
  })

  it("ticks the sizes the newest press ran, so they match the title", async () => {
    // Tyler, 16 Sep 2026: the card read "Large cap DCA, 1d" with 4h ticked.
    const row = (id: string, interval: string, createdAt: number) => ({
      id,
      name: `Large cap DCA, ${interval}`,
      createdAt,
      finishedAt: createdAt + 1,
      stopRequested: false,
      spec: { interval, from: 0, to: 86_400_000 },
      summary: null,
    })
    loadBacktests.mockResolvedValueOnce({
      runs: [row("a", "1d", 2), row("b", "1h", 2), row("c", "4h", 1)],
    } as never)
    const host = document.createElement("div")
    document.body.append(host)
    const root = createRoot(host)
    await act(async () => {
      root.render(
        <BacktestCanvasPanel
          automationId="ran"
          runId={null}
          onClose={() => {}}
          compiledConfig={{
            v: 1,
            kind: "automation",
            edges: [],
            nodes: {
              strategy: {
                kind: tradeDcaNode.kind,
                settings: tradeDcaNode.createSettings(),
              },
            },
          }}
        />
      )
      await Promise.resolve()
      await Promise.resolve()
    })
    const ticked = (size: string) =>
      host.querySelector(`#backtest-ran-${size}`)?.getAttribute("aria-checked")
    expect(ticked("1d")).toBe("true")
    expect(ticked("1h")).toBe("true")
    expect(ticked("4h")).toBe("false")
    await act(async () => root.unmount())
    host.remove()
  })

  it("defaults to the recipe size and submits three checked sizes", async () => {
    runRecipe.mockClear()
    const host = document.createElement("div")
    document.body.append(host)
    const root = createRoot(host)
    await act(async () =>
      root.render(
        <BacktestCanvasPanel
          automationId="batch"
          runId={null}
          onClose={() => {}}
          compiledConfig={{
            v: 1,
            kind: "automation",
            edges: [],
            nodes: {
              wallet: {
                kind: tradeWalletNode.kind,
                settings: tradeWalletNode.createSettings(),
              },
              markets: {
                kind: tradeMarketsNode.kind,
                settings: {
                  ...tradeMarketsNode.createSettings(),
                  marketKeys: ["binance:mainnet:BTC"],
                },
              },
              strategy: {
                kind: tradeDcaNode.kind,
                settings: tradeDcaNode.createSettings(),
              },
            },
          }}
        />
      )
    )
    expect(
      host.querySelector("#backtest-batch-4h")?.getAttribute("aria-checked")
    ).toBe("true")
    expect(
      host.querySelector("#backtest-batch-1h")?.getAttribute("aria-checked")
    ).toBe("false")
    await act(async () => {
      ;(host.querySelector("#backtest-batch-1h") as HTMLElement).click()
    })
    await act(async () => {
      ;(host.querySelector("#backtest-batch-1d") as HTMLElement).click()
    })
    expect(host.textContent).toContain("3 backtests, one per size")
    expect(host.textContent).toContain("candles")
    const button = [...host.querySelectorAll("button")].find(
      (one) => one.textContent?.trim() === "Backtest"
    )!
    await act(async () => {
      button.click()
      button.click()
    })
    expect(runRecipe).toHaveBeenCalledTimes(1)
    expect(runRecipe).toHaveBeenCalledWith("batch", expect.any(String), [
      "1h",
      "4h",
      "1d",
    ])
    await act(async () => root.unmount())
    host.remove()
  })

  it("shows the Backtest button for a pretend-money flow", async () => {
    const host = document.createElement("div")
    document.body.append(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(
        <BacktestCanvasPanel
          automationId="grid-flow"
          runId={null}
          onClose={() => {}}
        />
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(
      [...host.querySelectorAll("button")].some(
        (button) => button.textContent?.trim() === "Backtest"
      )
    ).toBe(true)

    await act(async () => root.unmount())
    host.remove()
  })

  it("saves before it starts a backtest", async () => {
    const order: string[] = []
    const beforeRun = vi.fn(async () => {
      order.push("save")
      return true
    })
    runRecipe.mockImplementationOnce(async () => {
      order.push("run")
      return {
        started: true,
        mode: "backtest",
        summary: "Backtest started.",
      }
    })
    const host = document.createElement("div")
    document.body.append(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(
        <BacktestCanvasPanel
          automationId="grid-flow"
          runId={null}
          onClose={() => {}}
          beforeRun={beforeRun}
        />
      )
      await Promise.resolve()
      await Promise.resolve()
    })
    const backtest = [...host.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Backtest"
    )
    await act(async () => backtest?.click())

    expect(order).toEqual(["save", "run"])
    expect(runRecipe).toHaveBeenCalledWith(
      "grid-flow",
      expect.stringMatching(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
      ),
      ["4h"]
    )

    await act(async () => root.unmount())
    host.remove()
  })
})

it("keeps the Backtest window visible while loading and for a saved wallet", async () => {
  let resolve!: (value: FlowTrading) => void
  vi.mocked(loadFlowTrading).mockReturnValueOnce(
    new Promise((done) => {
      resolve = done
    })
  )
  const host = document.createElement("div")
  document.body.append(host)
  const root = createRoot(host)
  try {
    await act(async () =>
      root.render(
        <BacktestCanvasPanel
          automationId="saved-wallet"
          runId={null}
          onClose={() => {}}
        />
      )
    )
    expect(host.textContent).toContain("Backtest")
    expect(host.textContent).toContain("Reading trading status")
    await act(async () =>
      resolve({ mode: "trades", drawnIsBacktest: false } as FlowTrading)
    )
    expect(host.textContent).toContain("Backtest")
    expect(host.textContent).toContain(
      "Choose pretend money in the Wallet step"
    )
    const button = [...host.querySelectorAll("button")].find(
      (one) => one.textContent?.trim() === "Backtest"
    )!
    expect(button.disabled).toBe(true)
  } finally {
    await act(async () => root.unmount())
    host.remove()
  }
})
