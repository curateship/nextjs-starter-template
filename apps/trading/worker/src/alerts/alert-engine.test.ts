import type { InfoClient } from "@nktkas/hyperliquid"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { AlertRuleItem } from "@/lib/alerts"
import { mergeTradeIntoBars, TradingViewAlertEngine } from "./alert-engine"

const alertServer = vi.hoisted(() => ({
  listActiveAlertRules: vi.fn(),
  listAlertRuleTriggerTimes: vi.fn(),
  markAlertRulesEvaluated: vi.fn(),
  recordAlertEvent: vi.fn(),
}))

vi.mock("@/server/alerts", () => alertServer)

beforeEach(() => {
  vi.clearAllMocks()
  alertServer.listActiveAlertRules.mockResolvedValue([])
  alertServer.listAlertRuleTriggerTimes.mockResolvedValue([])
  alertServer.markAlertRulesEvaluated.mockResolvedValue(undefined)
  alertServer.recordAlertEvent.mockResolvedValue({ id: "event-1" })
})

describe("price alert live bars", () => {
  it("combines trades in one interval and rolls into the next", () => {
    const bars = new Map()

    mergeTradeIntoBars(
      bars,
      { tid: 1, coin: "BTC", px: 100, notional: 20, ts: 1_000 },
      60_000
    )
    mergeTradeIntoBars(
      bars,
      { tid: 2, coin: "BTC", px: 102, notional: 30, ts: 20_000 },
      60_000
    )
    mergeTradeIntoBars(
      bars,
      { tid: 3, coin: "BTC", px: 105, notional: 40, ts: 61_000 },
      60_000
    )

    expect([...bars.values()]).toEqual([
      { ts: 20_000, close: 102, quoteVolume: 50 },
      { ts: 61_000, close: 105, quoteVolume: 40 },
    ])
  })

  it("replays a crossing that happens before a new rule is refreshed", async () => {
    const createdAt = new Date("2026-07-16T12:00:00.000Z")
    const rule: AlertRuleItem = {
      id: "rule-1",
      userId: "user-1",
      name: "BTC alert",
      coin: "BTC",
      kind: "price_level",
      operator: "crossing_up",
      level: 100,
      triggerMode: "once",
      status: "active",
      lastEvaluatedAt: null,
      lastTriggeredAt: null,
      createdAt: createdAt.toISOString(),
      updatedAt: createdAt.toISOString(),
    }
    const engine = new TradingViewAlertEngine({} as InfoClient, {
      take: vi.fn().mockResolvedValue(undefined),
    })
    await engine.start()
    try {
      engine.onTrades([
        {
          tid: 1,
          coin: "BTC",
          px: 99,
          notional: 99,
          ts: createdAt.getTime() - 100,
        },
        {
          tid: 2,
          coin: "BTC",
          px: 101,
          notional: 101,
          ts: createdAt.getTime() + 100,
        },
      ])
      alertServer.listActiveAlertRules.mockResolvedValue([rule])
      await (engine as unknown as { refresh: () => Promise<void> }).refresh()

      await vi.waitFor(() =>
        expect(alertServer.recordAlertEvent).toHaveBeenCalledWith(
          expect.objectContaining({
            rule,
            observed: 101,
            eventKey: "rule-1:BTC:2",
          })
        )
      )
    } finally {
      engine.stop()
    }
  })

  it("recovers a crossing that happened while the worker was offline", async () => {
    const activatedAt = new Date("2026-07-16T12:00:30.000Z")
    const minute = Date.parse("2026-07-16T12:00:00.000Z")
    const rule: AlertRuleItem = {
      id: "rule-offline",
      userId: "user-1",
      name: "BTC offline alert",
      coin: "BTC",
      kind: "price_level",
      operator: "crossing_down",
      level: 100,
      triggerMode: "once",
      status: "active",
      lastEvaluatedAt: null,
      lastTriggeredAt: null,
      createdAt: activatedAt.toISOString(),
      updatedAt: activatedAt.toISOString(),
    }
    alertServer.listActiveAlertRules.mockResolvedValue([rule])
    const info = {
      candleSnapshot: vi.fn().mockResolvedValue([
        {
          t: minute - 60_000,
          T: minute - 1,
          o: "99",
          h: "99.5",
          l: "98.5",
          c: "99",
          v: "10",
        },
        {
          t: minute,
          T: minute + 59_999,
          o: "99",
          h: "101",
          l: "99",
          c: "101",
          v: "10",
        },
        {
          t: minute + 60_000,
          T: minute + 119_999,
          o: "101",
          h: "101",
          l: "99",
          c: "99",
          v: "10",
        },
      ]),
    }
    const engine = new TradingViewAlertEngine(info as unknown as InfoClient, {
      take: vi.fn().mockResolvedValue(undefined),
    })

    await engine.start()
    try {
      await vi.waitFor(() =>
        expect(alertServer.recordAlertEvent).toHaveBeenCalledWith(
          expect.objectContaining({
            rule,
            observed: 99,
            eventKey: expect.stringContaining("recovery"),
          })
        )
      )
    } finally {
      engine.stop()
    }
  })

  it("does not recover or trigger after the worker stops", async () => {
    const activatedAt = new Date("2026-07-16T12:00:30.000Z")
    const minute = Date.parse("2026-07-16T12:00:00.000Z")
    const rule: AlertRuleItem = {
      id: "rule-stopped",
      userId: "user-1",
      name: "Stopped alert",
      coin: "BTC",
      kind: "price_level",
      operator: "crossing_up",
      level: 100,
      triggerMode: "once",
      status: "active",
      lastEvaluatedAt: null,
      lastTriggeredAt: null,
      createdAt: activatedAt.toISOString(),
      updatedAt: activatedAt.toISOString(),
    }
    let releaseHistory: (candles: unknown[]) => void = () => {}
    const candleSnapshot = vi.fn(
      () =>
        new Promise<unknown[]>((resolve) => {
          releaseHistory = resolve
        })
    )
    alertServer.listActiveAlertRules.mockResolvedValue([rule])
    const engine = new TradingViewAlertEngine(
      { candleSnapshot } as unknown as InfoClient,
      { take: vi.fn().mockResolvedValue(undefined) }
    )

    const starting = engine.start()
    await vi.waitFor(() => expect(candleSnapshot).toHaveBeenCalledOnce())
    engine.stop()
    releaseHistory([
      {
        t: minute - 60_000,
        T: minute - 1,
        h: "99",
        l: "99",
        c: "99",
      },
      {
        t: minute + 60_000,
        T: minute + 119_999,
        h: "101",
        l: "99",
        c: "101",
      },
    ])
    await starting

    expect(alertServer.recordAlertEvent).not.toHaveBeenCalled()
  })
})
