import { describe, expect, it } from "vitest"

import { workerLockKey } from "./leadership"

describe("worker leader locks", () => {
  it("gives each responsibility a stable, exclusive lock", () => {
    const keys = [
      workerLockKey("bot"),
      workerLockKey("whale-scanner"),
      workerLockKey("market-scanner"),
      workerLockKey("alert"),
      workerLockKey("backtest"),
    ]
    expect(new Set(keys).size).toBe(5)
    expect(keys[0]).toBe("trading_worker_leader")
    expect(keys[2]).toBe("market_scanner_worker_leader")
  })
})
