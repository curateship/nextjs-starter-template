import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { TradeWallet } from "@/lib/trade/wallets"
import {
  dropEngineExchangeReads,
  heldEngineAccount,
} from "@/server/trade/engine-exchange-reads"

const protocolMocks = vi.hoisted(() => ({ account: vi.fn() }))

vi.mock("@/server/protocols/registry", () => ({
  getProtocol: () => ({}),
  accountOf: () => ({ fetch: protocolMocks.account }),
  ordersOf: () => ({ portfolio: vi.fn() }),
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
  dropEngineExchangeReads(wallet)
})

afterEach(() => {
  dropEngineExchangeReads(wallet)
  vi.useRealTimers()
})

describe("held engine exchange reads", () => {
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
