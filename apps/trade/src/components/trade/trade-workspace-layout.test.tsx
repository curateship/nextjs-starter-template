// @vitest-environment jsdom

import * as React from "react"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { TooltipProvider } from "@/components/ui/tooltip"
import { DEFAULT_TRADING_RULES } from "@/lib/trade/trading-rules"

const {
  chartMounts,
  rememberedLayouts,
  rememberedToolbarPosition,
  layoutSetEvents,
  showErrorToast,
} = vi.hoisted(() => ({
  chartMounts: { count: 0 },
  rememberedLayouts: vi.fn(),
  rememberedToolbarPosition: vi.fn(),
  layoutSetEvents: [] as Array<{
    orientation: "horizontal" | "vertical"
    fullscreen: boolean
    layout: Record<string, number>
  }>,
  showErrorToast: vi.fn(),
}))

vi.mock("@/lib/toast/error-toast", () => ({ showErrorToast }))

vi.mock("@tanstack/react-router", () => ({
  getRouteApi: () => ({
    useLoaderData: () => ({ user: { id: "user-1" } }),
  }),
}))

vi.mock("@/components/trade/account-panel", () => ({
  WalletDetailsDialog: () => null,
  WalletManagement: () => null,
}))
vi.mock("@/components/trade/flatten-wallet-dialog", () => ({
  FlattenWalletDialog: () => null,
}))
vi.mock("@/components/trade/use-protocol-abilities", () => ({
  allowed: () => false,
  refusalOf: () => null,
  useProtocolAbilities: () => null,
}))
vi.mock("@/components/trade/activity-panel", () => ({
  ActivityPanel: ({
    onAddToPosition,
    chart,
  }: {
    onAddToPosition: (position: unknown) => void
    chart?: { label: string; content: React.ReactNode }
  }) => (
    <div data-testid="activity-panel" data-chart-tab={chart?.label}>
      {chart?.content}
      <button
        type="button"
        aria-label="Add BTC test position"
        onClick={() =>
          onAddToPosition({
            id: "position-btc",
            walletId: "wallet-1",
            marketKey: "hyperliquid:mainnet:BTC",
            szi: 1,
          })
        }
      />
      <button
        type="button"
        aria-label="Add ETH test position"
        onClick={() =>
          onAddToPosition({
            id: "position-eth",
            walletId: "wallet-1",
            marketKey: "hyperliquid:mainnet:ETH",
            szi: 1,
          })
        }
      />
    </div>
  ),
}))
vi.mock("@/components/trade/smart-orders-panel", () => ({
  SmartOrdersPanel: ({ kind }: { kind: string }) => (
    <div data-testid="smart-orders-panel" data-kind={kind} />
  ),
}))
vi.mock("@/components/trade/manual-orders-panel", () => ({
  ManualOrdersPanel: () => <div data-testid="manual-orders-panel" />,
}))
vi.mock("@/components/trade/use-trading", () => ({
  useTrading: () => ({
    busy: false,
    watchOrders: [],
    settled: true,
    failed: false,
    refusals: [],
    retry: vi.fn(),
    smartOrders: [],
    positions: [],
    fills: [],
    trades: [],
    walletNames: new Map(),
    resumeSmartOrder: vi.fn(),
    flattenWallet: vi.fn(),
  }),
}))
vi.mock("@/components/trade/use-trade-account", () => ({
  useTradeAccount: () => ({
    activeWallet: { id: "wallet-1" },
    wallets: [
      {
        id: "wallet-1",
        label: "Main wallet",
        kind: "paper",
        status: "active",
      },
    ],
    summaryOf: () => null,
    switchWallet: vi.fn(),
    refresh: vi.fn(),
  }),
}))
vi.mock("@/components/trade/wallet-dialogs", () => ({
  AddWalletDialog: () => null,
  WalletSettingsDialog: () => null,
}))
vi.mock("@/components/trade/chart-options-menu", () => ({
  ChartOptionsMenu: () => null,
}))
vi.mock("@/components/trade/chart-panel", () => ({
  ChartPanel: ({
    onChartToolbarPositionChange,
    cornerControl,
    addTo,
    onAddOpened,
  }: {
    onChartToolbarPositionChange?: (position: { x: number; y: number }) => void
    cornerControl?: React.ReactNode
    addTo?: unknown
    onAddOpened?: () => void
  }) => {
    React.useEffect(() => {
      chartMounts.count += 1
    }, [])
    return (
      <div data-testid="chart">
        {cornerControl}
        {addTo ? (
          <button
            type="button"
            aria-label="Open add order window"
            onClick={onAddOpened}
          />
        ) : null}
        <button
          type="button"
          aria-label="Move test toolbar"
          onClick={() => onChartToolbarPositionChange?.({ x: 0.2, y: 0.4 })}
        />
      </div>
    )
  },
  IntervalPicker: () => null,
}))
vi.mock("@/components/trade/indicators-menu", () => ({
  IndicatorsMenu: () => null,
}))
vi.mock("@/components/trade/use-chart-options", () => ({
  useChartOptions: () => ({
    options: {
      chartType: "candles",
      grid: true,
      volume: true,
      crosshair: true,
      orderArrows: true,
      orderArrowTrades: null,
      drawings: true,
      zone: "UTC",
    },
  }),
}))
vi.mock("@/components/trade/market-header", () => ({
  MarketHeader: ({ toolbar }: { toolbar: React.ReactNode }) => (
    <div data-testid="market-header">{toolbar}</div>
  ),
  MarketInfoFacts: () => null,
}))
vi.mock("@/components/trade/notes/trade-page-panel", () => ({
  useTradePage: () => ({
    lock: { locked: false, busy: false, setLocked: vi.fn() },
    cover: { url: null, busy: false, set: vi.fn() },
  }),
  TradePageBody: ({ marketKey }: { marketKey: string }) => (
    <div data-testid="page" data-market={marketKey} />
  ),
}))
vi.mock("@/components/trade/notes/page-menus", () => ({
  ExchangePageMenu: () => <button type="button" aria-label="My settings" />,
  MarketPageMenu: () => <button type="button" aria-label="Market menu" />,
}))
vi.mock("@/components/trade/market-scanner-panel", () => ({
  MarketScannerMenu: () => null,
}))
vi.mock("@/components/trade/card-folds", () => ({
  CardFolds: ({ children }: { children: React.ReactNode }) => children,
}))
vi.mock("@/components/trade/use-indicators", () => ({
  useChartIndicators: () => ({ settings: {} }),
}))
vi.mock("@/components/trade/market-folders-manager", () => ({
  MarketFoldersManager: () => null,
}))
vi.mock("@/components/trade/market-folders-menu", () => ({
  MarketFoldersMenu: () => <button type="button" aria-label="Open folders" />,
}))
vi.mock("@/components/trade/price-alerts-menu", () => ({
  PriceAlertsMenu: () => <button type="button" aria-label="Open alerts" />,
}))
vi.mock("@/components/trade/use-panel-layouts", () => ({
  useTradePanelLayouts: (initial: unknown) => ({
    layouts: initial,
    remember: rememberedLayouts,
    rememberOpenMarketRow: vi.fn(),
    rememberChartToolbarPosition: rememberedToolbarPosition,
  }),
}))

vi.mock("@/components/ui/resizable", () => ({
  // Rendered rather than dropped, so a test can check which edges offer a
  // way back and what each one is called.
  PanelReopenTab: ({
    side,
    label,
    onClick,
  }: {
    side: "left" | "right"
    label: string
    onClick: () => void
  }) => (
    <button
      type="button"
      data-testid={`reopen-${side}`}
      aria-label={label}
      onClick={onClick}
    />
  ),
  ResizableHandle: ({ className }: { className?: string }) => (
    <div data-testid="handle" className={className} />
  ),
  ResizablePanel: ({
    id,
    className,
    children,
    onResize,
  }: {
    id: string
    className?: string
    children: React.ReactNode
    onResize?: (size: { asPercentage: number }) => void
  }) => (
    <div data-panel={id} className={className}>
      <button
        type="button"
        aria-label={`Collapse ${id} panel`}
        onClick={() => onResize?.({ asPercentage: 0 })}
      />
      {children}
    </div>
  ),
  ResizablePanelGroup: MockPanelGroup,
  WorkspacePanel: ({
    className,
    children,
  }: {
    className?: string
    children: React.ReactNode
  }) => <div className={className}>{children}</div>,
}))

vi.mock("@/lib/api/trade/market-folders", () => ({
  createFolder: vi.fn(),
  getMarketFolderErrorMessage: () => "Could not save folder.",
  loadFolders: vi.fn(),
  setFolderMarket: vi.fn(),
}))
vi.mock("@/lib/trade/live-market", () => ({
  startLiveMarketData: () => vi.fn(),
}))
vi.mock("@/lib/layout/panel-collapse", () => ({
  useBlankSpaceDoubleClick: () => vi.fn(),
  usePanelCollapsed: () => ({ collapsed: false, onResize: vi.fn() }),
  usePanelToggle: () => vi.fn(),
}))
vi.mock("@/lib/remembered-choice", () => ({
  useRememberedChoice: (_key: string, initial: unknown) =>
    React.useState(initial),
}))
vi.mock("@/lib/trade/market-folders", () => ({
  favFolder: () => null,
}))
vi.mock("@/lib/trade/market-volume", () => ({
  allCatalogMarketRows: (catalog: { rows: unknown[] }) => catalog.rows,
  catalogMarketRow: (catalog: { rows: { key: string }[] }, key: string) =>
    catalog.rows.find((row) => row.key === key) ?? null,
}))
vi.mock("@/lib/layout/wide-screen", () => ({ useWideScreen: () => true }))
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }))

function MockPanelGroup(props: {
  orientation: "horizontal" | "vertical"
  groupRef: (handle: unknown) => void
  onLayoutChanged: (
    layout: Record<string, number>,
    meta: { isUserInteraction: boolean }
  ) => void
  children: React.ReactNode
  "data-panel-group"?: string
}) {
  const { orientation, groupRef, onLayoutChanged, children } = props
  const groupName = props["data-panel-group"] ?? orientation
  const opening = React.useMemo<Record<string, number>>(
    (): Record<string, number> => ({ blocks: 20, chart: 58, market: 22 }),
    []
  )
  const [layout, setLayout] = React.useState<Record<string, number>>(opening)
  const layoutRef = React.useRef<Record<string, number>>(opening)
  const [changed] = React.useState(() => onLayoutChanged)

  React.useLayoutEffect(() => {
    const handle = {
      getLayout: () => layoutRef.current,
      setLayout: (next: Record<string, number>) => {
        layoutSetEvents.push({
          orientation,
          fullscreen:
            document.querySelector('[data-chart-fullscreen="true"]') !== null,
          layout: next,
        })
        layoutRef.current = next
        setLayout(next)
        changed(next, { isUserInteraction: false })
        return next
      },
    }
    groupRef(handle)
    changed(opening, { isUserInteraction: false })
    return () => groupRef(null)
  }, [changed, groupRef, opening, orientation])

  return (
    <div
      data-testid={`${orientation}-group`}
      data-panel-group={groupName}
      data-layout={JSON.stringify(layout)}
    >
      <button
        type="button"
        aria-label={`Resize ${groupName} group`}
        onClick={() => {
          const next = { blocks: 25, chart: 50, market: 25 }
          layoutRef.current = next
          setLayout(next)
          changed(next, { isUserInteraction: true })
        }}
      />
      {children}
    </div>
  )
}

const { TradeWorkspace } = await import("@/components/trade/trade-workspace")

let host: HTMLDivElement
let root: Root

beforeEach(() => {
  ;(
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0)
    return 1
  })
  vi.stubGlobal("cancelAnimationFrame", vi.fn())
  host = document.createElement("div")
  document.body.appendChild(host)
  root = createRoot(host)
  chartMounts.count = 0
  rememberedLayouts.mockClear()
  rememberedToolbarPosition.mockClear()
  layoutSetEvents.length = 0
})

afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
})

describe("the trade workspace", () => {
  it("is three panels whose full screen restores without remounting the chart", async () => {
    await act(async () => {
      root.render(
        <TooltipProvider>
          <TradeWorkspace
            protocol="hyperliquid"
            network="mainnet"
            catalogs={[
              {
                rows: [
                  {
                    key: "hyperliquid:mainnet:BTC",
                    symbol: "BTC",
                    price: 100,
                  },
                  {
                    key: "hyperliquid:mainnet:ETH",
                    symbol: "ETH",
                    price: 100,
                  },
                ],
                protocolLabel: "Hyperliquid",
                networkLabel: "Mainnet",
                picker: {},
              } as never,
            ]}
            marketsError={null}
            marketsPending={false}
            initialFolders={[]}
            initialPanelRows={{
              all: { position: Number.MAX_SAFE_INTEGER, hidden: false },
              hiddenMarketKeys: [],
            }}
            initialChartView={null}
            initialChart={null}
            initialDrawings={{ marketKey: null, rows: [], error: null }}
            initialChartOptions={{} as never}
            initialIndicators={{} as never}
            initialCardFolds={{}}
            initialQuickOrder={{} as never}
            initialTradingRules={DEFAULT_TRADING_RULES}
            initialPanelLayouts={{
              legacyImported: true,
              current: {
                "trade-workspace-horizontal-2": {
                  blocks: 20,
                  chart: 58,
                  market: 22,
                },
              },
              openMarketRows: {},
              headerProfitVisible: true,
              chartToolbarPosition: null,
            }}
            initialPages={{
              exchange: { body: null, locked: false, coverUrl: null },
              market: null,
            }}
            initialWallets={{
              rows: [],
              summaries: [],
              lastWalletIds: {},
              error: null,
              pending: false,
            }}
            selectedKey="hyperliquid:mainnet:BTC"
            onSelectMarket={vi.fn()}
            onRetryMarkets={vi.fn()}
          />
        </TooltipProvider>
      )
    })

    expect(chartMounts.count).toBe(1)
    expect(layoutOf("horizontal")).toEqual({ blocks: 20, chart: 58, market: 22 })
    // No bottom row: the tables are tabs in the middle, beside the chart.
    expect(host.querySelector('[data-panel-group="vertical"]')).toBeNull()
    expect(
      host
        .querySelector('[data-testid="activity-panel"]')
        ?.getAttribute("data-chart-tab")
    ).toBe("BTC chart")
    expect(
      host.querySelector('[data-testid="activity-panel"] [data-testid="chart"]')
    ).not.toBeNull()
    // The exchange's page on the left, the market's page on the right.
    expect(
      Array.from(host.querySelectorAll('[data-testid="page"]')).map((page) =>
        page.getAttribute("data-market")
      )
    ).toEqual(["", "hyperliquid:mainnet:BTC"])
    // The chart header has no folder, alert or scanner buttons any more.
    expect(
      host.querySelector(
        '[data-testid="market-header"] button[aria-label="Open folders"], [data-testid="market-header"] button[aria-label="Open alerts"]'
      )
    ).toBeNull()
    expect(host.querySelector('[data-testid="reopen-right"]')).toBeNull()

    await act(async () => clickButton("Collapse market panel"))
    expect(host.querySelector('[data-testid="reopen-right"]')?.ariaLabel).toBe(
      "Show market"
    )

    await act(async () => clickButton("Show chart full screen"))
    expect(
      host.querySelector('[data-chart-fullscreen="true"]')?.className
    ).toContain("bg-background")
    expect(layoutOf("horizontal")).toEqual({ blocks: 0, chart: 100, market: 0 })
    expect(chartMounts.count).toBe(1)

    layoutSetEvents.length = 0
    await act(async () => clickButton("Exit full screen"))
    expect(layoutOf("horizontal")).toEqual({ blocks: 20, chart: 58, market: 22 })
    expect(layoutSetEvents).toEqual([
      {
        orientation: "horizontal",
        fullscreen: false,
        layout: { blocks: 20, chart: 58, market: 22 },
      },
    ])
    expect(chartMounts.count).toBe(1)

    await act(async () =>
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "f" }))
    )
    expect(host.querySelector('[data-chart-fullscreen="true"]')).not.toBeNull()
    await act(async () =>
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }))
    )
    expect(host.querySelector('[data-chart-fullscreen="true"]')).toBeNull()
    expect(chartMounts.count).toBe(1)

    await act(async () => clickButton("Move test toolbar"))
    expect(rememberedToolbarPosition).toHaveBeenCalledWith({ x: 0.2, y: 0.4 })

    await act(async () => clickButton("Resize horizontal group"))
    expect(rememberedLayouts).toHaveBeenCalledWith(
      "trade-workspace-horizontal-2",
      { blocks: 25, chart: 50, market: 25 }
    )

    vi.useFakeTimers()
    showErrorToast.mockClear()
    await act(async () => clickButton("Add BTC test position"))
    await act(async () => clickButton("Open add order window"))
    expect(showErrorToast).not.toHaveBeenCalled()

    await act(async () => clickButton("Add ETH test position"))
    await act(async () => vi.advanceTimersByTime(5_000))
    expect(showErrorToast).toHaveBeenCalledOnce()
    expect(showErrorToast).toHaveBeenCalledWith(
      "Could not open the order window for ETH. Pick the market and try again."
    )
  })
})

function layoutOf(group: "horizontal") {
  const value = host
    .querySelector(`[data-panel-group="${group}"]`)
    ?.getAttribute("data-layout")
  return value ? JSON.parse(value) : null
}

function clickButton(label: string) {
  const button = host.querySelector<HTMLButtonElement>(
    `button[aria-label="${label}"]`
  )
  if (!button) throw new Error(`Missing ${label}`)
  button.click()
}
