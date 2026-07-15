import { EventEmitter } from "node:events"

import { describe, expect, it, vi } from "vitest"

import { superviseWorker } from "./supervise-market-scanner.mjs"

class FakeChild extends EventEmitter {
  kill = vi.fn()
}

describe("market scanner process supervisor", () => {
  it("restarts the worker after an unexpected exit", () => {
    const children: FakeChild[] = []
    const scheduled: Array<() => void> = []
    const spawnWorker = vi.fn(() => {
      const child = new FakeChild()
      children.push(child)
      return child
    })

    superviseWorker({
      spawnWorker,
      schedule: (callback) => {
        scheduled.push(callback)
        return 1
      },
      cancelSchedule: vi.fn(),
      logError: vi.fn(),
    })

    expect(spawnWorker).toHaveBeenCalledOnce()
    children[0].emit("exit", 1, null)
    expect(scheduled).toHaveLength(1)
    scheduled[0]()
    expect(spawnWorker).toHaveBeenCalledTimes(2)
  })

  it("does not restart after an intentional stop", () => {
    const child = new FakeChild()
    const schedule = vi.fn()
    const supervisor = superviseWorker({
      spawnWorker: () => child,
      schedule,
      cancelSchedule: vi.fn(),
      logError: vi.fn(),
    })

    supervisor.stop("SIGTERM")
    child.emit("exit", 0, "SIGTERM")

    expect(child.kill).toHaveBeenCalledWith("SIGTERM")
    expect(schedule).not.toHaveBeenCalled()
  })
})
