// @vitest-environment jsdom
import { tradeDcaNode } from "@/lib/recipes/trade-dca"
import { tradeMarketsNode } from "@/lib/recipes/trade-markets"
import { tradeWalletNode } from "@/lib/recipes/trade-wallet"

import { act } from "react"
import { createRoot } from "react-dom/client"
import { describe, expect, it, vi } from "vitest"

import BacktestCanvasPanel from "@/components/recipes/backtest-canvas-panel"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

const { runRecipe } = vi.hoisted(() => ({
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
  loadBacktests: vi.fn(async () => ({ runs: [] })),
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
      undefined
    )

    await act(async () => root.unmount())
    host.remove()
  })
})
