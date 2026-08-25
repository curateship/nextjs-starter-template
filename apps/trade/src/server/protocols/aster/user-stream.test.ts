import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { WalletPortfolio } from "@/lib/protocols/contracts"
import { asterReconnectDelay } from "@/lib/protocols/aster/translate"
import {
  clearAsterAccountCache,
  fetchAsterAccount,
} from "@/server/protocols/aster/account"
import { fetchAsterOrderPortfolio } from "@/server/protocols/aster/orders"
import {
  applyAsterUserEvent,
  asterSnapshotRecoveryVersion,
  markAsterSnapshotConnected,
  markAsterSnapshotDisconnected,
  primeAsterAccountSnapshot,
  primeAsterPortfolioSnapshot,
  readAsterPushedAccount,
  readAsterPushedPortfolio,
  rememberAsterLeverage,
} from "@/server/protocols/aster/user-snapshot"
import {
  asterFillsFromStream,
  asterFillsRecoveryVersion,
  asterStreamFill,
  asterUserStreamState,
  closeAsterUserStreams,
  markAsterFillsRecovered,
  watchAsterFills,
} from "@/server/protocols/aster/user-stream"

const signed = vi.hoisted(() => vi.fn())

vi.mock("@/server/protocols/aster/client", () => ({
  asterSigned: signed,
  parseAsterCredential: () => ({
    signer: "0x1111111111111111111111111111111111111111",
    privateKey: `0x${"1".padStart(64, "0")}`,
  }),
}))

const ACCOUNT = "0x1111111111111111111111111111111111111111"
const CREDENTIAL = () => "credential"

type Listener = (event: { data?: unknown }) => void

class FakeSocket {
  static latest: FakeSocket | null = null
  readonly listeners = new Map<string, Listener[]>()
  readonly url: string
  closed = false

  constructor(url: string) {
    this.url = url
    FakeSocket.latest = this
  }

  addEventListener(name: string, listener: Listener): void {
    const listeners = this.listeners.get(name) ?? []
    listeners.push(listener)
    this.listeners.set(name, listeners)
  }

  close(): void {
    this.closed = true
  }

  fire(name: string, body?: unknown): void {
    const event = {
      data: body === undefined ? undefined : JSON.stringify(body),
    }
    for (const listener of this.listeners.get(name) ?? []) listener(event)
  }
}

function trade(overrides: Record<string, unknown> = {}) {
  return {
    e: "ORDER_TRADE_UPDATE",
    E: 3,
    o: {
      s: "BTCUSDT",
      S: "SELL",
      o: "LIMIT",
      q: "0.25",
      p: "101",
      sp: "0",
      x: "TRADE",
      X: "FILLED",
      i: 42,
      l: "0.25",
      L: "101",
      n: "0.01",
      T: 1234,
      t: 88,
      rp: "2.5",
      ot: "STOP_MARKET",
      ...overrides,
    },
  }
}

beforeEach(() => {
  clearAsterAccountCache()
  vi.useFakeTimers()
  vi.setSystemTime(new Date("2026-08-24T12:00:00Z"))
  FakeSocket.latest = null
  signed.mockReset()
  signed.mockImplementation(async (
    _network: unknown,
    _address: unknown,
    _credential: unknown,
    method: string
  ) => {
    if (method === "PUT") throw new Error("renewal failed")
    return { listenKey: "listen-key" }
  })
  vi.stubGlobal("WebSocket", FakeSocket)
})

afterEach(() => {
  closeAsterUserStreams()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe("the Aster account stream", () => {
  it("turns a trade push into the same fill shape recovery stores", () => {
    expect(asterStreamFill(trade())).toMatchObject({
      fillId: "88",
      orderId: "42",
      marketId: "BTCUSDT",
      side: "sell",
      px: 101,
      sz: 0.25,
      closedPnl: 2.5,
    })
  })

  it("keeps account, position, and open-order changes in one snapshot", async () => {
    const portfolio: WalletPortfolio = { positions: [], orders: [] }
    markAsterSnapshotConnected("mainnet", ACCOUNT)
    rememberAsterLeverage("mainnet", ACCOUNT, "BTCUSDT", 2)

    applyAsterUserEvent("mainnet", ACCOUNT, {
      e: "ACCOUNT_UPDATE",
      E: 1,
      a: {
        B: [{ a: "USDT", wb: "100", bc: "0" }],
        P: [
          {
            s: "BTCUSDT",
            pa: "1",
            ep: "100",
            up: "5",
            mt: "cross",
            iw: "0",
            ps: "BOTH",
          },
        ],
      },
    })
    applyAsterUserEvent("mainnet", ACCOUNT, {
      e: "ORDER_TRADE_UPDATE",
      E: 2,
      o: {
        s: "BTCUSDT",
        S: "BUY",
        o: "LIMIT",
        q: "1",
        p: "90",
        x: "NEW",
        X: "NEW",
        i: 9,
      },
    })

    primeAsterAccountSnapshot("mainnet", ACCOUNT, {
      figures: { equity: 100, free: 100, inTrades: 0, openProfit: 0 },
      balanceByAsset: new Map([["USDT", 100]]),
      profitByMarket: new Map(),
    })
    primeAsterPortfolioSnapshot("mainnet", ACCOUNT, portfolio)

    expect(readAsterPushedAccount("mainnet", ACCOUNT)).toEqual({
      equity: 105,
      free: 10,
      inTrades: 95,
      openProfit: 5,
    })
    expect(readAsterPushedPortfolio("mainnet", ACCOUNT)).toMatchObject({
      positions: [
        {
          marketId: "BTCUSDT",
          szi: 1,
          entryPx: 100,
          leverage: 2,
          marginUsed: 50,
        },
      ],
      orders: [{ orderId: "9", marketId: "BTCUSDT", px: 90, sz: 1 }],
    })
    expect(await fetchAsterAccount("mainnet", ACCOUNT, CREDENTIAL)).toEqual(
      readAsterPushedAccount("mainnet", ACCOUNT)
    )
    expect(
      await fetchAsterOrderPortfolio("mainnet", ACCOUNT, CREDENTIAL)
    ).toEqual(readAsterPushedPortfolio("mainnet", ACCOUNT))
    expect(signed).not.toHaveBeenCalled()
    await expect(
      fetchAsterAccount("mainnet", ACCOUNT, () => null)
    ).rejects.toThrow("LIVE_WALLET_KEY")
    await expect(
      fetchAsterOrderPortfolio("mainnet", ACCOUNT, () => null)
    ).rejects.toThrow("LIVE_WALLET_KEY")

    applyAsterUserEvent("mainnet", ACCOUNT, {
      e: "ORDER_TRADE_UPDATE",
      E: 3,
      o: {
        s: "BTCUSDT",
        S: "BUY",
        x: "CANCELED",
        X: "CANCELED",
        i: 9,
      },
    })
    expect(readAsterPushedPortfolio("mainnet", ACCOUNT)?.orders).toEqual([])
  })

  it("keeps Aster's converted account total when one asset balance changes", () => {
    markAsterSnapshotConnected("mainnet", ACCOUNT)
    primeAsterAccountSnapshot("mainnet", ACCOUNT, {
      figures: { equity: 104.98, free: 104.98, inTrades: 0, openProfit: 0 },
      balanceByAsset: new Map([["USDC", 105]]),
      profitByMarket: new Map(),
    })
    primeAsterPortfolioSnapshot("mainnet", ACCOUNT, {
      positions: [],
      orders: [],
    })

    applyAsterUserEvent("mainnet", ACCOUNT, {
      e: "ACCOUNT_UPDATE",
      E: 1,
      a: {
        B: [{ a: "USDC", wb: "106", bc: "1" }],
        P: [],
      },
    })

    expect(readAsterPushedAccount("mainnet", ACCOUNT)?.equity).toBeCloseTo(
      105.98
    )
  })

  it("keeps recovery pending when a queued asset was absent from REST", () => {
    markAsterSnapshotConnected("mainnet", ACCOUNT)
    applyAsterUserEvent("mainnet", ACCOUNT, {
      e: "ACCOUNT_UPDATE",
      E: 1,
      a: {
        B: [{ a: "USDC", wb: "1", bc: "1" }],
        P: [],
      },
    })

    primeAsterAccountSnapshot("mainnet", ACCOUNT, {
      figures: { equity: 100, free: 100, inTrades: 0, openProfit: 0 },
      balanceByAsset: new Map([["USDT", 100]]),
      profitByMarket: new Map(),
    })

    expect(readAsterPushedAccount("mainnet", ACCOUNT)).toBeNull()
  })

  it("does not let an old recovery close a newer reconnect gap", () => {
    markAsterSnapshotConnected("mainnet", ACCOUNT)
    const oldRecovery = asterSnapshotRecoveryVersion("mainnet", ACCOUNT)
    markAsterSnapshotDisconnected("mainnet", ACCOUNT)
    markAsterSnapshotConnected("mainnet", ACCOUNT)

    primeAsterAccountSnapshot(
      "mainnet",
      ACCOUNT,
      {
        figures: { equity: 100, free: 100, inTrades: 0, openProfit: 0 },
        balanceByAsset: new Map([["USDT", 100]]),
        profitByMarket: new Map(),
      },
      oldRecovery
    )

    expect(readAsterPushedAccount("mainnet", ACCOUNT)).toBeNull()
  })

  it("does not keep an old liquidation price after a position changes", () => {
    markAsterSnapshotConnected("mainnet", ACCOUNT)
    rememberAsterLeverage("mainnet", ACCOUNT, "BTCUSDT", 2)
    primeAsterAccountSnapshot("mainnet", ACCOUNT, {
      figures: { equity: 100, free: 50, inTrades: 50, openProfit: 0 },
      balanceByAsset: new Map([["USDT", 100]]),
      profitByMarket: new Map([["BTCUSDT", 0]]),
    })
    primeAsterPortfolioSnapshot("mainnet", ACCOUNT, {
      positions: [
        {
          marketId: "BTCUSDT",
          szi: 1,
          entryPx: 100,
          leverage: 2,
          marginUsed: 50,
          liquidationPx: 50,
          targets: [],
          tpPx: null,
          tpSz: null,
          slPx: null,
          tpOrderId: null,
          slOrderId: null,
          protectionOrderIds: [],
        },
      ],
      orders: [],
    })

    applyAsterUserEvent("mainnet", ACCOUNT, {
      e: "ACCOUNT_UPDATE",
      E: 1,
      a: {
        B: [],
        P: [
          {
            s: "BTCUSDT",
            pa: "2",
            ep: "100",
            up: "0",
            mt: "cross",
            iw: "0",
            ps: "BOTH",
          },
        ],
      },
    })

    expect(
      readAsterPushedPortfolio("mainnet", ACCOUNT)?.positions[0]
        ?.liquidationPx
    ).toBeNull()
  })

  it("shares one recovery read between callers arriving together", async () => {
    markAsterSnapshotConnected("mainnet", ACCOUNT)
    signed.mockImplementation(async (
      _network: unknown,
      _address: unknown,
      _credential: unknown,
      _method: string,
      path: string
    ) => {
      if (path.endsWith("/accountWithJoinMargin")) {
        return {
          totalMarginBalance: "100",
          totalUnrealizedProfit: "0",
          availableBalance: "100",
          positions: [],
          assets: [{ asset: "USDT", walletBalance: "100" }],
        }
      }
      if (path.endsWith("/positionRisk")) return []
      throw new Error(`unexpected Aster path: ${path}`)
    })

    const first = fetchAsterAccount("mainnet", ACCOUNT, CREDENTIAL)
    const second = fetchAsterAccount("mainnet", ACCOUNT, CREDENTIAL)

    await expect(Promise.all([first, second])).resolves.toEqual([
      { equity: 100, free: 100, inTrades: 0, openProfit: 0 },
      { equity: 100, free: 100, inTrades: 0, openProfit: 0 },
    ])
    expect(signed).toHaveBeenCalledTimes(2)
  })

  it("serves pushed fills after one recovery instead of asking again", async () => {
    expect(
      asterFillsFromStream("mainnet", ACCOUNT, 0, CREDENTIAL)
    ).toBeNull()
    await vi.advanceTimersByTimeAsync(0)
    const socket = FakeSocket.latest
    if (!socket) throw new Error("expected a socket")
    socket.fire("open")

    markAsterFillsRecovered(
      "mainnet",
      ACCOUNT,
      0,
      [],
      asterFillsRecoveryVersion("mainnet", ACCOUNT)
    )
    socket.fire("message", trade())

    expect(
      asterFillsFromStream("mainnet", ACCOUNT, 0, CREDENTIAL)
    ).toEqual([expect.objectContaining({ fillId: "88" })])
    expect(signed.mock.calls.filter((call) => call[3] === "POST")).toHaveLength(
      1
    )
  })

  it("marks the feed down when listen-key renewal fails", async () => {
    watchAsterFills(
      "mainnet",
      ACCOUNT,
      "test-listener",
      CREDENTIAL,
      () => {}
    )
    await vi.advanceTimersByTimeAsync(0)
    const socket = FakeSocket.latest
    if (!socket) throw new Error("expected a socket")
    socket.fire("open")
    expect(asterUserStreamState("mainnet", ACCOUNT).healthy).toBe(true)

    await vi.advanceTimersByTimeAsync(30 * 60_000)

    expect(asterUserStreamState("mainnet", ACCOUNT).healthy).toBe(false)
    expect(socket.closed).toBe(true)
  })

  it("caps reconnect backoff at thirty seconds", () => {
    expect(asterReconnectDelay(0)).toBe(1_000)
    expect(asterReconnectDelay(99)).toBe(30_000)
  })
})
