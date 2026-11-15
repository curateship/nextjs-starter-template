import * as React from "react"
import type {
  GroupImperativeHandle,
  Layout,
  LayoutChangedMeta,
} from "react-resizable-panels"

import { useEffectBeforePaint } from "@/lib/hooks/use-effect-before-paint"
import {
  KNOWN_PROTOCOLS,
  type NetworkId,
  type ProtocolId,
} from "@/lib/protocols/contracts"
import { readChartView, type ChartView } from "@/lib/trade/chart-view"
import { ALL_ROW } from "@/lib/trade/market-folders"
import { TRADE_MAKERS, type TradeMaker } from "@/lib/trade/trade-maker"
import {
  readHiddenTradeColumns,
  type HiddenTradeColumns,
} from "@/lib/trade/trades-popover-columns"

export type MarketPanelScope = { protocol: ProtocolId; network: NetworkId }

/** One stable key for the folder row left open on each exchange and network. */
export function marketPanelScopeKey(scope: MarketPanelScope) {
  return `${scope.protocol}:${scope.network}`
}

export type OpenMarketRows = Record<string, string | null>

/** The drawing rail's place inside the candle area, as shares of its travel. */
export type ChartToolbarPosition = { x: number; y: number }

/**
 * The panel choices kept in the account's one preference column. It held the
 * backtest's and bot's chart-over-trades split too, until those pages lost
 * their bottom trades panel (10 Nov 2026); a stored row may still carry that
 * old `current` and `legacyImported`, which nothing reads.
 */
export type TradePanelLayouts = {
  /** The folder row currently open on each exchange, including closed rows. */
  openMarketRows: OpenMarketRows
  /** Whether the sticky header shows profit beside the active-trade value. */
  headerProfitVisible: boolean
  /** Null is the home position, equally inset from the top and right. */
  chartToolbarPosition: ChartToolbarPosition | null
  /** The columns hidden in the Bots dashboard's trades popover, per table. */
  hiddenTradeColumns: HiddenTradeColumns
  /** The Trade dashboard Journal's filter and its hide-practice switch. */
  journalView: JournalView
  /**
   * The chart's zoom and scroll under 1280px, kept apart from the wide
   * screen's `chartView` so neither ever opens at the other's zoom (Tyler,
   * 13 Nov 2026: candles fill the width when the chart opens on a phone).
   * Null until a narrow chart has been moved.
   */
  narrowChartView: ChartView | null
}

/**
 * Which Journal rows show: only real money when `hidePractice`, and only the
 * makers listed, every maker when the list is empty (Tyler, 10 Nov 2026,
 * picks "Filter the Journal by who placed it" and "Hide practice trades").
 */
export type JournalView = { hidePractice: boolean; makers: TradeMaker[] }

export const EMPTY_JOURNAL_VIEW: JournalView = { hidePractice: false, makers: [] }

/** A stored view, with anything unknown dropped. */
export function readJournalView(value: unknown): JournalView {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return EMPTY_JOURNAL_VIEW
  const record = value as Record<string, unknown>
  const makers = Array.isArray(record.makers)
    ? TRADE_MAKERS.filter((maker) => (record.makers as unknown[]).includes(maker))
    : []
  return { hidePractice: record.hidePractice === true, makers }
}

export function emptyTradePanelLayouts(): TradePanelLayouts {
  return {
    openMarketRows: {},
    headerProfitVisible: true,
    chartToolbarPosition: null,
    hiddenTradeColumns: {},
    journalView: EMPTY_JOURNAL_VIEW,
    narrowChartView: null,
  }
}

/**
 * Applies a remembered layout to the panel group already on screen.
 *
 * The first layout callback fires when the group registers its panels. The
 * saved answer is handed to that group through `setLayout`; no React key is
 * changed, so a chart inside the group is not built a second time. Direct
 * divider changes are saved, while collapse controls call `rememberLayout`.
 */
export function useRememberedPanelLayoutInPlace(
  panelIds: readonly string[],
  savedLayout?: Layout,
  onSave?: (layout: Layout) => void
) {
  const handleRef = React.useRef<GroupImperativeHandle | null>(null)
  const currentRef = React.useRef<Layout | null>(null)
  const ignoredRef = React.useRef<Layout | null>(null)
  const settingRef = React.useRef(false)
  const appliedSavedRef = React.useRef<string | null>(null)
  /** Whether the group on screen right now has been given the saved layout. */
  const appliedRef = React.useRef(false)

  const groupRef = React.useCallback((handle: GroupImperativeHandle | null) => {
    handleRef.current = handle
    // The group went away; the next one to attach starts over.
    if (!handle) appliedRef.current = false
  }, [])

  const onLayoutChanged = React.useCallback(
    (layout: Layout, meta?: LayoutChangedMeta) => {
      currentRef.current = layout
      if (!appliedRef.current) {
        appliedRef.current = true
        const saved = matchingPanelLayout(savedLayout, panelIds)
        appliedSavedRef.current = panelLayoutSignature(saved)
        // A refused layout leaves the defaults. Panel names matter as much as
        // the count: the library accepts an old record with one renamed panel,
        // then crashes when it asks for that missing panel's size.
        if (saved && handleRef.current) {
          try {
            settingRef.current = true
            ignoredRef.current = saved
            const applied = handleRef.current.setLayout(saved)
            if (ignoredRef.current) ignoredRef.current = applied
          } catch {
            ignoredRef.current = null
            // Defaults stay.
          } finally {
            settingRef.current = false
          }
        }
        return
      }

      if (settingRef.current) {
        ignoredRef.current = null
        return
      }
      if (ignoredRef.current) {
        const ignored = samePanelLayout(ignoredRef.current, layout)
        ignoredRef.current = null
        if (ignored) return
      }

      // Registration, constraints, setLayout, collapse and expand are all
      // programmatic. Divider drags and divider keys are the only changes the
      // library can identify as direct; collapse controls save explicitly
      // through `rememberLayout` after their imperative move has finished.
      if (meta?.isUserInteraction) onSave?.(layout)
    },
    [onSave, panelIds, savedLayout]
  )

  const setLayout = React.useCallback(
    (value: Layout) => {
      const layout = matchingPanelLayout(value, panelIds)
      const handle = handleRef.current
      if (!layout || !handle) return null
      try {
        settingRef.current = true
        ignoredRef.current = layout
        const applied = handle.setLayout(layout)
        if (ignoredRef.current) ignoredRef.current = applied
        currentRef.current = applied
        return applied
      } catch {
        ignoredRef.current = null
        return null
      } finally {
        settingRef.current = false
      }
    },
    [panelIds]
  )

  // A first-browser import can land after the group
  // has registered. Hand the answer to that same group; never key-remount it.
  useEffectBeforePaint(() => {
    const next = matchingPanelLayout(savedLayout, panelIds)
    if (!appliedRef.current) return
    const signature = panelLayoutSignature(next)
    if (signature === appliedSavedRef.current) return
    appliedSavedRef.current = signature
    if (!next || samePanelLayout(next, currentRef.current)) return
    setLayout(next)
  }, [savedLayout, panelIds, setLayout])

  const getLayout = React.useCallback(
    () => handleRef.current?.getLayout() ?? currentRef.current,
    []
  )

  const rememberLayout = React.useCallback(
    (value?: Layout) => {
      const layout = value
        ? matchingPanelLayout(value, panelIds)
        : (handleRef.current?.getLayout() ?? currentRef.current)
      if (layout) onSave?.(layout)
    },
    [onSave, panelIds]
  )

  return {
    groupRef,
    onLayoutChanged,
    getLayout,
    setLayout,
    rememberLayout,
  }
}

/**
 * A panel layout kept in this browser under `key`, for
 * `useRememberedPanelLayoutInPlace`. It is read before the first paint, never
 * on the server, and read again whenever `key` changes; a key with nothing
 * kept under it hands back null, so the panels' own default sizes stand.
 */
export function useBrowserPanelLayout(key: string, panelIds: readonly string[]) {
  const [stored, setStored] = React.useState<{ key: string; layout: Layout | null } | null>(null)
  useEffectBeforePaint(() => {
    let layout: Layout | null = null
    try {
      const text = localStorage.getItem(key)
      layout = text ? matchingPanelLayout(JSON.parse(text), panelIds) : null
    } catch {
      // Storage that cannot be read, or holds something else, keeps the defaults.
    }
    setStored({ key, layout })
  }, [key, panelIds])
  const save = React.useCallback(
    (layout: Layout) => {
      setStored({ key, layout })
      try {
        localStorage.setItem(key, JSON.stringify(layout))
      } catch {
        // Storage may be blocked; the drag still holds for this visit.
      }
    },
    [key]
  )
  return { layout: stored?.key === key ? (stored.layout ?? undefined) : undefined, save }
}

/** A saved layout only when it names every panel on the current screen. */
export function matchingPanelLayout(
  value: unknown,
  panelIds: readonly string[]
): Layout | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null
  }

  const record = value as Record<string, unknown>
  if (Object.keys(record).length !== panelIds.length) return null

  const layout: Layout = {}
  let total = 0
  for (const panelId of panelIds) {
    const size = record[panelId]
    if (
      typeof size !== "number" ||
      !Number.isFinite(size) ||
      size < 0 ||
      size > 100
    ) {
      return null
    }
    layout[panelId] = size
    total += size
  }
  return total > 0 ? layout : null
}

function samePanelLayout(one: Layout | null, two: Layout | null) {
  if (!one || !two) return false
  const keys = Object.keys(one)
  return (
    keys.length === Object.keys(two).length &&
    keys.every((key) => one[key] === two[key])
  )
}

function panelLayoutSignature(layout: Layout | null) {
  return layout ? JSON.stringify(layout) : "none"
}

/** Invalid or stale stored pieces are ignored independently. */
export function readTradePanelLayouts(value: unknown): TradePanelLayouts {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return emptyTradePanelLayouts()
  }
  const record = value as Record<string, unknown>
  return {
    openMarketRows: readOpenMarketRows(record.openMarketRows),
    headerProfitVisible:
      typeof record.headerProfitVisible === "boolean"
        ? record.headerProfitVisible
        : true,
    chartToolbarPosition:
      readChartToolbarPosition(record.chartToolbarPosition) ?? null,
    hiddenTradeColumns: readHiddenTradeColumns(record.hiddenTradeColumns),
    journalView: readJournalView(record.journalView),
    narrowChartView: readChartView(record.narrowChartView ?? null),
  }
}

/** Invalid stored coordinates are ignored; null is the deliberate home spot. */
export function readChartToolbarPosition(
  value: unknown
): ChartToolbarPosition | null | undefined {
  if (value === null) return null
  if (typeof value !== "object" || Array.isArray(value)) {
    return undefined
  }
  const position = value as Record<string, unknown>
  return typeof position.x === "number" &&
    Number.isFinite(position.x) &&
    position.x >= 0 &&
    position.x <= 1 &&
    typeof position.y === "number" &&
    Number.isFinite(position.y) &&
    position.y >= 0 &&
    position.y <= 1
    ? { x: position.x, y: position.y }
    : undefined
}

const MARKET_PANEL_SCOPE_KEYS = new Set(
  KNOWN_PROTOCOLS.flatMap((protocol) => [
    marketPanelScopeKey({ protocol, network: "mainnet" }),
    marketPanelScopeKey({ protocol, network: "testnet" }),
  ])
)
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/** Invalid scope or row entries are dropped without hiding valid neighbours. */
export function readOpenMarketRows(value: unknown): OpenMarketRows {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return {}
  }
  const rows: OpenMarketRows = {}
  for (const [scope, rowId] of Object.entries(value)) {
    if (!MARKET_PANEL_SCOPE_KEYS.has(scope)) continue
    if (
      rowId === null ||
      rowId === ALL_ROW ||
      (typeof rowId === "string" && UUID_PATTERN.test(rowId))
    ) {
      rows[scope] = rowId
    }
  }
  return rows
}
