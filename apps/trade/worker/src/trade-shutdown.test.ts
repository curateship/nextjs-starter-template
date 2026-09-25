import { afterEach, describe, expect, it, vi } from "vitest"

import { waitForTradePasses } from "./trade-shutdown"

afterEach(() => {
  vi.useRealTimers()
})

describe("the trading engine stopping", () => {
  it("waits for every pass that is still writing its work down", async () => {
    let finishFirst!: () => void
    let finishLast!: () => void
    const first = new Promise<void>((resolve) => {
      finishFirst = resolve
    })
    const last = new Promise<void>((resolve) => {
      finishLast = resolve
    })
    const report = vi.fn()
    let stopped = false

    const waiting = waitForTradePasses([first, last], 2, 5_000, report).then(
      (answer) => {
        stopped = true
        return answer
      }
    )
    await Promise.resolve()
    expect(stopped).toBe(false)

    finishFirst()
    await Promise.resolve()
    expect(stopped).toBe(false)
    finishLast()

    await expect(waiting).resolves.toBe("finished")
    expect(report).not.toHaveBeenCalled()
  })

  it("gives up at the ceiling and names the wallet count", async () => {
    vi.useFakeTimers()
    const report = vi.fn()
    const never = new Promise<void>(() => {})

    const waiting = waitForTradePasses([never], 3, 250, report)
    await vi.advanceTimersByTimeAsync(250)

    await expect(waiting).resolves.toBe("timed-out")
    expect(report).toHaveBeenCalledOnce()
    expect(report.mock.calls[0][0]).toContain("250ms")
    expect(report.mock.calls[0][0]).toContain("3 wallets")
  })

  it("does not wait when shutdown lands between passes", async () => {
    const report = vi.fn()

    await expect(
      waitForTradePasses([], 0, 5_000, report)
    ).resolves.toBe("finished")
    expect(report).not.toHaveBeenCalled()
  })
})
