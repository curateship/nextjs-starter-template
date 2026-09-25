// @vitest-environment jsdom
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { beforeEach, afterEach, it, expect, vi } from "vitest"
import { FlowRunControls } from "./flow-run-controls"
import { pauseFlow } from "@/lib/api/trade/flow-trading"
import { getRecipe, runRecipe } from "@/lib/api/trade/recipes"
import { showErrorToast } from "@/lib/toast/error-toast"
import type { FlowRunReport } from "@/lib/api/trade/flow-runs"
const navigate = vi.hoisted(() => vi.fn())
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => navigate }))
vi.mock("@/lib/api/trade/flow-trading", () => ({
  pauseFlow: vi.fn(),
  stopFlow: vi.fn(),
  flowActionProblem: (error: Error) => error.message,
}))
vi.mock("@/lib/api/trade/recipes", () => ({
  getRecipe: vi.fn(),
  runRecipe: vi.fn(),
}))
vi.mock("@/lib/toast/error-toast", () => ({ showErrorToast: vi.fn() }))
const head: FlowRunReport["head"] = {
  id: "old-run",
  automationId: "recipe",
  automationName: "Recipe",
  walletId: "wallet",
  walletLabel: "Practice",
  real: false,
  venue: "Hyperliquid",
  status: "running",
  paused: false,
  holding: false,
  capUsd: 100,
  coins: 1,
  working: 0,
  startedAt: 1,
  stoppedAt: 2,
  stoppedReason: null,
}
let host: HTMLDivElement
let root: Root
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  host = document.createElement("div")
  document.body.append(host)
  root = createRoot(host)
  vi.resetAllMocks()
})
afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
})
async function click(label: string) {
  const button = [
    ...(document.querySelector('[role="dialog"]') ?? document).querySelectorAll(
      "button"
    ),
  ].find((one) => one.textContent === label)!
  expect(button).toBeTruthy()
  await act(async () => button.click())
}
it("optimistically pauses and restores state on a refusal", async () => {
  const onPaused = vi.fn()
  let reject!: (error: Error) => void
  vi.mocked(pauseFlow).mockReturnValue(
    new Promise((_resolve, no) => {
      reject = no
    })
  )
  await act(async () =>
    root.render(
      <FlowRunControls head={head} onPaused={onPaused} onRefresh={vi.fn()} />
    )
  )
  await click("Pause")
  expect(onPaused).toHaveBeenCalledWith(true)
  expect(pauseFlow).toHaveBeenCalledWith("recipe", true)
  await act(async () => reject(new Error("Refused")))
  expect(onPaused).toHaveBeenLastCalledWith(false)
  expect(showErrorToast).toHaveBeenCalledWith("Refused")
})
it("offers Resume for a paused run and refreshes after success", async () => {
  vi.mocked(pauseFlow).mockResolvedValue({
    summary: "Looking for coins again.",
  })
  const refresh = vi.fn()
  await act(async () =>
    root.render(
      <FlowRunControls
        head={{ ...head, paused: true }}
        onPaused={vi.fn()}
        onRefresh={refresh}
      />
    )
  )
  await click("Resume")
  expect(pauseFlow).toHaveBeenCalledWith("recipe", false)
  expect(refresh).toHaveBeenCalledOnce()
})
it("confirms today's recipe, surfaces a busy wallet, then opens the new run", async () => {
  vi.mocked(getRecipe).mockResolvedValue({
    updated_at: "2026-09-13T12:00:00Z",
  } as Awaited<ReturnType<typeof getRecipe>>)
  vi.mocked(runRecipe)
    .mockResolvedValueOnce({
      started: false,
      mode: "trades",
      summary: "Practice is already running another recipe.",
    })
    .mockResolvedValueOnce({
      started: true,
      mode: "trades",
      summary: "Started",
      runId: "new-run",
    })
  await act(async () =>
    root.render(
      <FlowRunControls
        head={{ ...head, status: "stopped" }}
        onPaused={vi.fn()}
        onRefresh={vi.fn()}
      />
    )
  )
  await click("Run again")
  expect(document.body.textContent).toContain(
    "Starts the recipe as it is today, not as it was when this run began"
  )
  expect(document.body.textContent).toContain("Recipe last changed")
  await click("Run again")
  expect(showErrorToast).toHaveBeenCalledWith(
    "Practice is already running another recipe."
  )
  expect(navigate).not.toHaveBeenCalled()
  await click("Run again")
  expect(runRecipe).toHaveBeenCalledWith(
    "recipe",
    expect.any(String),
    undefined,
    "old-run"
  )
  expect(navigate).toHaveBeenCalledWith({
    to: "/flow-runs/$runId",
    params: { runId: "new-run" },
  })
})
