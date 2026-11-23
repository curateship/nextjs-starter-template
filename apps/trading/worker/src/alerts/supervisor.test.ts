import { beforeEach, describe, expect, it, vi } from "vitest"

const services = vi.hoisted(() => ({
  engineStart: vi.fn(),
  engineStop: vi.fn(),
  retentionStart: vi.fn(),
  retentionStop: vi.fn(),
  streamStart: vi.fn(),
  streamStop: vi.fn(),
  engineOnTrades: vi.fn(),
  streamEmit: null as null | ((trades: unknown[]) => void),
  streamLabel: null as null | string,
}))

vi.mock("@nktkas/hyperliquid", () => ({
  SubscriptionClient: vi.fn(function SubscriptionClient() {}),
}))
vi.mock("@/server/hyperliquid/info", () => ({
  getActivePerpMarkets: vi.fn(async () => [{ coin: "BTC" }]),
}))
vi.mock("@/server/hyperliquid/transport", () => ({
  createReadOnlyWebSocketTransport: vi.fn(() => ({})),
}))
vi.mock("@/server/scanner/info", () => ({
  getScannerInfoClient: vi.fn(() => ({})),
}))
vi.mock("../market-scanner/rate-limiter", () => ({
  MarketScannerRateLimiter: vi.fn(function MarketScannerRateLimiter() {}),
}))
vi.mock("../market-scanner/trade-stream", () => ({
  MarketTradeStream: vi.fn(function MarketTradeStream(
    _client: unknown,
    emit: (trades: unknown[]) => void,
    _getUniverse: () => Promise<unknown>,
    label: string
  ) {
    services.streamEmit = emit
    services.streamLabel = label
    return {
      start: services.streamStart,
      stop: services.streamStop,
      meta: () => ({ subscriptions: 288 }),
    }
  }),
}))
vi.mock("./alert-engine", () => ({
  TradingViewAlertEngine: vi.fn(function TradingViewAlertEngine() {
    return {
      start: services.engineStart,
      stop: services.engineStop,
      onTrades: services.engineOnTrades,
      meta: () => ({ alertRules: 2, alertCoins: 1 }),
    }
  }),
}))
vi.mock("./retention", () => ({
  TradingViewAlertRetention: vi.fn(function TradingViewAlertRetention() {
    return {
      start: services.retentionStart,
      stop: services.retentionStop,
    }
  }),
}))

import { AlertSupervisor } from "./supervisor"

beforeEach(() => {
  vi.clearAllMocks()
  services.engineStart.mockResolvedValue(undefined)
  services.streamStart.mockResolvedValue(undefined)
  services.streamEmit = null
  services.streamLabel = null
})

describe("alert supervisor", () => {
  it("owns its engine, subscriptions, retention, and status", async () => {
    const supervisor = new AlertSupervisor()

    await supervisor.start()

    expect(services.engineStart).toHaveBeenCalledOnce()
    expect(services.streamStart).toHaveBeenCalledOnce()
    expect(services.retentionStart).toHaveBeenCalledOnce()
    expect(services.streamLabel).toBe("alert worker")
    services.streamEmit?.([
      { tid: 1, coin: "BTC", px: 100, notional: 100, ts: 1_000 },
    ])
    expect(services.engineOnTrades).toHaveBeenCalledWith([
      { tid: 1, coin: "BTC", px: 100, notional: 100, ts: 1_000 },
    ])
    expect(supervisor.meta()).toMatchObject({
      alertRules: 2,
      alertCoins: 1,
      alertSubscriptions: 288,
      currentActivity: "Watching Trade alerts",
    })

    await supervisor.stop()

    expect(services.streamStop).toHaveBeenCalledOnce()
    expect(services.engineStop).toHaveBeenCalledOnce()
    expect(services.retentionStop).toHaveBeenCalledOnce()
  })
})
