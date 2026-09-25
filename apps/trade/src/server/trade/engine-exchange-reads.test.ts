import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { TradeWallet } from "@/lib/trade/wallets"
import {
  dropEngineExchangeReads,
  heldEngineAccount,
  heldEnginePortfolio,
} from "@/server/trade/engine-exchange-reads"

const protocolMocks = vi.hoisted(() => ({
  account: vi.fn(),
  portfolio: vi.fn(),
}))

vi.mock("@/server/protocols/registry", () => ({
  getProtocol: () => ({}),
  accountOf: () => ({ fetch: protocolMocks.account }),
  ordersOf: () => ({ portfolio: protocolMocks.portfolio }),
}))

const wallet: TradeWallet = {
  id: "wallet-1",
  label: "Main",
  kind: "live",
  status: "active",
  protocol: "lighter",
  network: "mainnet",
  startingBalance: 0,
  address: "0x1111111111111111111111111111111111111111",
  hasKey: true,
  keyValidUntil: null,
}

const firstAnswer = { equity: 100, free: 50, inTrades: 50, openProfit: 0 }
const secondAnswer = { equity: 120, free: 70, inTrades: 50, openProfit: 20 }

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date("2026-08-28T12:00:00Z"))
  protocolMocks.account.mockReset()
  protocolMocks.portfolio.mockReset()
  dropEngineExchangeReads(wallet)
})

afterEach(() => {
  dropEngineExchangeReads(wallet)
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe("held engine exchange reads", () => {
  it("releases accounts and portfolios for 100 one-time addresses while idle", async () => {
    protocolMocks.account.mockResolvedValue(firstAnswer)
    protocolMocks.portfolio.mockResolvedValue({ positions: [], orders: [] })
    // Observe the real maps without exporting their private contents from production.
    const writes = vi.spyOn(Map.prototype, "set")
    for (let index = 0; index < 100; index++) {
      const once = { ...wallet, address: `once-${index}` }
      await Promise.all([
        heldEngineAccount(once, () => null),
        heldEnginePortfolio(once, () => null),
      ])
    }
    const caches = new Set<Map<unknown, unknown>>()
    writes.mock.calls.forEach(([key], index) => {
      const cache = writes.mock.contexts[index]
      if (
        typeof key === "string" &&
        key.startsWith("lighter:mainnet:once-") &&
        cache instanceof Map
      )
        caches.add(cache)
    })
    writes.mockRestore()
    expect(caches.size).toBe(2)
    expect([...caches].map((cache) => cache.size)).toEqual([100, 100])
    await vi.advanceTimersByTimeAsync(4_999)
    expect([...caches].map((cache) => cache.size)).toEqual([100, 100])
    await vi.advanceTimersByTimeAsync(1)
    expect([...caches].map((cache) => cache.size)).toEqual([0, 0])
    await vi.advanceTimersByTimeAsync(3_600_000)
    await heldEngineAccount({ ...wallet, address: "once-0" }, () => null)
    expect(protocolMocks.account).toHaveBeenCalledTimes(101)
    await vi.advanceTimersByTimeAsync(5_000)
  })

  it("does not let an older rejection or expiry evict its replacement", async () => {
    let rejectFirst!: (error: Error) => void
    protocolMocks.account
      .mockReturnValueOnce(
        new Promise((_, reject) => {
          rejectFirst = reject
        })
      )
      .mockResolvedValue(secondAnswer)
    const old = heldEngineAccount(wallet, () => null)
    const rejected = expect(old).rejects.toThrow("read failed")
    await vi.advanceTimersByTimeAsync(1_000)
    dropEngineExchangeReads(wallet)
    const replacement = heldEngineAccount(wallet, () => null)
    await replacement
    rejectFirst(new Error("read failed"))
    await rejected
    expect(heldEngineAccount(wallet, () => null)).toBe(replacement)
    await vi.advanceTimersByTimeAsync(4_000)
    expect(heldEngineAccount(wallet, () => null)).toBe(replacement)
    expect(protocolMocks.account).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(1_000)
    expect(heldEngineAccount(wallet, () => null)).not.toBe(replacement)
    await vi.advanceTimersByTimeAsync(5_000)
  })
  it("ages a slow answer from when the request started", async () => {
    let finishFirst: ((answer: typeof firstAnswer) => void) | undefined
    protocolMocks.account
      .mockReturnValueOnce(
        new Promise<typeof firstAnswer>((resolve) => {
          finishFirst = resolve
        })
      )
      .mockResolvedValueOnce(secondAnswer)

    const first = heldEngineAccount(wallet, () => "key")
    await vi.advanceTimersByTimeAsync(5_001)
    const second = heldEngineAccount(wallet, () => "key")
    await Promise.resolve()

    expect(protocolMocks.account).toHaveBeenCalledTimes(2)
    finishFirst?.(firstAnswer)
    await expect(first).resolves.toEqual(firstAnswer)
    await expect(second).resolves.toEqual(secondAnswer)
  })
})
