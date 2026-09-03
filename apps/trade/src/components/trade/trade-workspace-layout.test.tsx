// @vitest-environment jsdom

import * as React from "react"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { TooltipProvider } from "@/components/ui/tooltip"

const {
  chartMounts,
  createNamedLayout,
  rememberedLayouts,
  rememberedToolbarPosition,
  layoutSetEvents,
} = vi.hoisted(() => ({
  chartMounts: { count: 0 },
  createNamedLayout: vi.fn().mockResolvedValue(undefined),
  rememberedLayouts: vi.fn(),
  rememberedToolbarPosition: vi.fn(),
  layoutSetEvents: [] as Array<{
    orientation: "horizontal" | "vertical"
    fullscreen: boolean
    layout: Record<string, number>
  }>,
}))

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
  ActivityPanel: () => null,
}))
vi.mock("@/components/trade/smart-orders-panel", () => ({
  SmartOrdersPanel: () => <div data-testid="smart-orders-panel" />,
}))
vi.mock("@/components/trade/smart-orders-menu", () => ({
  SmartOrdersMenu: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="smart-orders-menu">
      <button type="button" aria-label="Open smart orders and bots" />
      {children}
    </div>
  ),
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
    activeWallet: null,
    wallets: [],
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
vi.mock("@/components/trade/chart-tools-menu", () => ({
  ChartToolsMenu: ({
    layouts,
  }: {
    layouts?: { onCreate: (name: string) => void }
  }) =>
    layouts ? (
      <button
        type="button"
        aria-label="Save test layout"
        onClick={() => layouts.onCreate("Eye layout")}
      />
    ) : null,
}))
vi.mock("@/components/trade/chart-panel", () => ({
  ChartPanel: ({
    onChartToolbarPositionChange,
    cornerControl,
  }: {
    onChartToolbarPositionChange?: (position: { x: number; y: number }) => void
    cornerControl?: React.ReactNode
  }) => {
    React.useEffect(() => {
      chartMounts.count += 1
    }, [])
    return (
      <div data-testid="chart">
        {cornerControl}
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
  MarketHeader: ({
    toolbar,
    marketAction,
  }: {
    toolbar: React.ReactNode
    marketAction?: React.ReactNode
  }) => (
    <div data-testid="market-header">
      {marketAction}
      {toolbar}
    </div>
  ),
}))
vi.mock("@/components/trade/card-folds", () => ({
  CardFolds: ({ children }: { children: React.ReactNode }) => children,
}))
vi.mock("@/components/trade/use-indicators", () => ({
  useChartIndicators: () => ({ settings: {} }),
}))
vi.mock("@/components/trade/market-folders-panel", () => ({
  MarketFoldersPanel: () => null,
}))
vi.mock("@/components/trade/market-folders-menu", () => ({
  MarketFoldersMenu: () => <button type="button" aria-label="Open folders" />,
}))
vi.mock("@/components/trade/price-alerts-menu", () => ({
  PriceAlertsMenu: () => <button type="button" aria-label="Open alerts" />,
}))
vi.mock("@/components/trade/panel-layouts-menu", () => ({
  PanelLayoutsMenu: ({ onCreate }: { onCreate: (name: string) => void }) => (
    <button
      type="button"
      aria-label="Save test layout"
      onClick={() => onCreate("Eye layout")}
    />
  ),
}))
vi.mock("@/components/trade/use-panel-layouts", () => ({
  useTradePanelLayouts: (initial: unknown) => ({
    layouts: initial,
    remember: rememberedLayouts,
    rememberOpenMarketRow: vi.fn(),
    rememberChartToolbarPosition: rememberedToolbarPosition,
    createNamed: createNamedLayout,
    applyNamed: vi.fn(),
    deleteNamed: vi.fn(),
  }),
}))

vi.mock("@/components/ui/resizable", () => ({
  BOTTOM_COLLAPSED_HEIGHT: "58px",
  PanelReopenTab: () => null,
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
vi.mock("@/components/ui/sheet", () => ({
  Sheet: ({ children }: { children: React.ReactNode }) => children,
  SheetContent: ({ children }: { children: React.ReactNode }) => children,
  SheetHeader: ({ children }: { children: React.ReactNode }) => children,
  SheetTitle: ({ children }: { children: React.ReactNode }) => children,
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
  WATCHED_ROW: "watched",
  favFolder: () => null,
}))
vi.mock("@/lib/trade/market-volume", () => ({
  allCatalogMarketRows: (catalog: { rows: unknown[] }) => catalog.rows,
  catalogMarketRow: (catalog: { rows: { key: string }[] }, key: string) =>
    catalog.rows.find((row) => row.key === key) ?? null,
}))
vi.mock("@/lib/layout/wide-screen", () => ({ useWideScreen: () => true }))

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
    (): Record<string, number> =>
      orientation === "horizontal"
        ? { markets: 20, chart: 58, "smart-orders": 22 }
        : { workspace: 72, activity: 28 },
    [groupName, orientation]
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
          let next: Record<string, number>
          if (orientation === "horizontal") {
            next = { markets: 25, chart: 50, "smart-orders": 25 }
          } else {
            next = { workspace: 60, activity: 40 }
          }
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
  createNamedLayout.mockClear()
  layoutSetEvents.length = 0
})

afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
})

describe("the trade workspace chart full screen", () => {
  it("restores both groups without remounting the chart", async () => {
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
              watched: { position: -1, hidden: false },
              all: { position: Number.MAX_SAFE_INTEGER, hidden: false },
            }}
            initialChartView={null}
            initialChart={null}
            initialDrawings={{ marketKey: null, rows: [], error: null }}
            initialChartOptions={{} as never}
            initialIndicators={{} as never}
            initialCardFolds={{}}
            initialQuickOrder={{} as never}
            initialPanelLayouts={{
              legacyImported: true,
              current: {
                "trade-workspace-horizontal": {
                  markets: 20,
                  chart: 58,
                  "smart-orders": 22,
                },
                "trade-workspace-vertical": { workspace: 72, activity: 28 },
              },
              openMarketRows: {},
              headerProfitVisible: true,
              chartToolbarPosition: null,
              activeNamedId: null,
              named: [],
            }}
            initialRunningBots={{ rows: [], error: null }}
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
    expect(layoutOf("horizontal")).toEqual({
      markets: 20,
      chart: 58,
      "smart-orders": 22,
    })
    expect(layoutOf("vertical")).toEqual({ workspace: 72, activity: 28 })
    expect(
      host.querySelector(
        '[data-testid="market-header"] button[aria-label="Open alerts"]'
      )
    ).not.toBeNull()
    const marketActions = Array.from(
      host.querySelectorAll<HTMLButtonElement>(
        '[data-testid="market-header"] button[aria-label="Open folders"], [data-testid="market-header"] button[aria-label="Open alerts"]'
      )
    )
    expect(marketActions.map((button) => button.ariaLabel)).toEqual([
      "Open folders",
      "Open alerts",
    ])
    expect(host.querySelector('[data-testid="smart-orders-menu"]')).toBeNull()

    await act(async () => clickButton("Collapse smart-orders panel"))
    expect(
      host.querySelector(
        '[data-testid="market-header"] button[aria-label="Open smart orders and bots"]'
      )
    ).not.toBeNull()
    expect(
      host.querySelector(
        '[data-testid="smart-orders-menu"] [data-testid="smart-orders-panel"]'
      )
    ).not.toBeNull()
    expect(
      Array.from(
        host.querySelectorAll<HTMLButtonElement>(
          '[data-testid="market-header"] button'
        )
      ).at(-1)?.ariaLabel
    ).toBe("Open smart orders and bots")
    expect(
      host.querySelector(
        '[data-testid="market-header"] button[aria-label="Show chart full screen"]'
      )
    ).toBeNull()

    await act(async () => clickButton("Show chart full screen"))
    expect(
      host.querySelector('[data-chart-fullscreen="true"]')?.className
    ).toContain("bg-background")
    expect(layoutOf("horizontal")).toEqual({
      markets: 0,
      chart: 100,
      "smart-orders": 0,
    })
    expect(layoutOf("vertical")).toEqual({ workspace: 100, activity: 0 })
    expect(
      host
        .querySelector('[data-panel="activity"]')
        ?.classList.contains("hidden")
    ).toBe(true)
    expect(chartMounts.count).toBe(1)

    layoutSetEvents.length = 0
    await act(async () => clickButton("Exit full screen"))
    expect(layoutOf("horizontal")).toEqual({
      markets: 20,
      chart: 58,
      "smart-orders": 22,
    })
    expect(layoutOf("vertical")).toEqual({ workspace: 72, activity: 28 })
    expect(layoutSetEvents).toEqual([
      {
        orientation: "horizontal",
        fullscreen: false,
        layout: { markets: 20, chart: 58, "smart-orders": 22 },
      },
      {
        orientation: "vertical",
        fullscreen: false,
        layout: { workspace: 72, activity: 28 },
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

    await act(async () => {
      window.dispatchEvent(
        new CustomEvent("trade-header-profit-visibility", { detail: false })
      )
      clickButton("Save test layout")
      await Promise.resolve()
    })
    expect(createNamedLayout).toHaveBeenCalledWith(
      "Eye layout",
      { markets: 20, chart: 58, "smart-orders": 22 },
      { workspace: 72, activity: 28 },
      { protocol: "hyperliquid", network: "mainnet" },
      "watched",
      false,
      null
    )

    await act(async () => clickButton("Move test toolbar"))
    expect(rememberedToolbarPosition).toHaveBeenCalledWith({ x: 0.2, y: 0.4 })

    await act(async () => clickButton("Resize vertical group"))
    expect(rememberedLayouts).toHaveBeenCalledWith("trade-workspace-vertical", {
      workspace: 60,
      activity: 40,
    })
  })
})

function layoutOf(group: "horizontal" | "vertical") {
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
