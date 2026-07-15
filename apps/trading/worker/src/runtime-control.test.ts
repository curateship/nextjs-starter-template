import { afterEach, describe, expect, it, vi } from "vitest"

import { getWorkerControl } from "@/server/workers/control"

import { shouldWorkerRun, WorkerRuntimeController } from "./runtime-control"

vi.mock("@/server/workers/control", () => ({
  getWorkerControl: vi.fn(),
}))

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe("worker runtime control", () => {
  it("runs only when the worker is on and resumed", () => {
    expect(shouldWorkerRun({ enabled: true, paused: false })).toBe(true)
    expect(shouldWorkerRun({ enabled: false, paused: false })).toBe(false)
    expect(shouldWorkerRun({ enabled: true, paused: true })).toBe(false)
    expect(shouldWorkerRun({ enabled: false, paused: true })).toBe(false)
  })

  it("does not hide a control error behind empty service status", async () => {
    vi.useFakeTimers()
    const control = vi.mocked(getWorkerControl)
    control.mockResolvedValue({
      kind: "backtest",
      enabled: true,
      paused: false,
      updatedAt: new Date(),
    })
    const controller = new WorkerRuntimeController("backtest", () => ({
      start: vi.fn(async () => {}),
      stop: vi.fn(async () => {}),
      meta: () => ({ latestError: null }),
    }))
    vi.spyOn(console, "error").mockImplementation(() => {})

    await controller.start()
    control.mockRejectedValueOnce(new Error("Control unavailable"))
    await vi.advanceTimersByTimeAsync(2_000)

    expect(controller.meta().latestError).toBe(
      "Worker workload update failed. Check worker logs."
    )
    await controller.stop()
  })
})
