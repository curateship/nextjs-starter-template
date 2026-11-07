import * as React from "react"
import type { Layout } from "react-resizable-panels"

import {
  getPanelLayoutErrorMessage,
  importLegacyPanelLayouts,
  saveChartToolbarPosition,
  saveOpenMarketRow,
  savePanelLayout,
} from "@/lib/api/trade/panel-layouts"
import { useEffectBeforePaint } from "@/lib/hooks/use-effect-before-paint"
import {
  TRADE_PANEL_LAYOUT_KEYS,
  type TradePanelLayoutKey,
} from "@/lib/trade/panel-keys"
import {
  clearLegacyTradePanelLayouts,
  marketPanelScopeKey,
  readLegacyTradePanelLayouts,
  type MarketPanelScope,
  type ChartToolbarPosition,
  type TradePanelLayouts,
} from "@/lib/trade/panel-layout"
import { showErrorToast } from "@/lib/toast/error-toast"

const LEGACY_IMPORT_MARKER = "trade-panel-layouts-account-import-v1"

/** Account-owned panel layout state shared by every group on one page. */
export function useTradePanelLayouts(initial: TradePanelLayouts) {
  const [loaded, setLoaded] = React.useState({
    source: initial,
    value: initial,
  })
  const migrationStarted = React.useRef(false)
  const writeQueue = React.useRef(Promise.resolve())
  const currentVersions = React.useRef<
    Partial<Record<TradePanelLayoutKey, number>>
  >({})
  const openMarketRowVersions = React.useRef<Record<string, number>>({})
  const chartToolbarPositionVersion = React.useRef(0)
  if (loaded.source !== initial) {
    setLoaded({ source: initial, value: initial })
  }
  const layouts = loaded.source === initial ? loaded.value : initial

  // One account row owns all layouts. Keep its writes in interaction order so
  // a slower earlier request cannot land after a newer drag or named choice.
  const enqueue = React.useCallback(<T>(write: () => Promise<T>) => {
    const pending = writeQueue.current.then(write)
    writeQueue.current = pending.then(
      () => undefined,
      () => undefined
    )
    return pending
  }, [])

  // Before the first paint, use this browser's old answer if the account has
  // never taken ownership. The server settles which browser won the handoff.
  useEffectBeforePaint(() => {
    if (migrationStarted.current) return
    migrationStarted.current = true
    let alreadyRead = false
    try {
      alreadyRead = localStorage.getItem(LEGACY_IMPORT_MARKER) === "done"
    } catch {
      // A blocked store has no old layout to import.
    }

    if (initial.legacyImported) {
      clearLegacyTradePanelLayouts(localStorage)
      markLegacyRead()
      return
    }
    if (alreadyRead) return

    const current = readLegacyTradePanelLayouts(localStorage)
    if (Object.keys(current).length === 0) {
      markLegacyRead()
      return
    }

    setLoaded((state) => ({
      ...state,
      value: {
        ...state.value,
        current: { ...state.value.current, ...current },
      },
    }))
    const versions = { ...currentVersions.current }
    void enqueue(() => importLegacyPanelLayouts(current)).then(
      (saved) => {
        setLoaded((state) => ({
          ...state,
          value: {
            ...saved,
            current: keepNewerCurrent(
              saved.current,
              state.value.current,
              versions,
              currentVersions.current,
              TRADE_PANEL_LAYOUT_KEYS
            ),
          },
        }))
        clearLegacyTradePanelLayouts(localStorage)
        markLegacyRead()
      },
      (error: unknown) => showErrorToast(getPanelLayoutErrorMessage(error))
    )
  }, [enqueue, initial])

  const remember = React.useCallback(
    (key: TradePanelLayoutKey, layout: Layout) => {
      currentVersions.current[key] = (currentVersions.current[key] ?? 0) + 1
      setLoaded((state) => ({
        ...state,
        value: {
          ...state.value,
          legacyImported: true,
          current: { ...state.value.current, [key]: layout },
        },
      }))
      void enqueue(() => savePanelLayout(key, layout)).catch((error: unknown) =>
        showErrorToast(getPanelLayoutErrorMessage(error))
      )
    },
    [enqueue]
  )

  const rememberOpenMarketRow = React.useCallback(
    (scope: MarketPanelScope, rowId: string | null) => {
      const key = marketPanelScopeKey(scope)
      openMarketRowVersions.current[key] =
        (openMarketRowVersions.current[key] ?? 0) + 1
      setLoaded((state) => ({
        ...state,
        value: {
          ...state.value,
          legacyImported: true,
          openMarketRows: { ...state.value.openMarketRows, [key]: rowId },
        },
      }))
      void enqueue(() => saveOpenMarketRow(scope, rowId)).catch(
        (error: unknown) => showErrorToast(getPanelLayoutErrorMessage(error))
      )
    },
    [enqueue]
  )

  const rememberChartToolbarPosition = React.useCallback(
    (position: ChartToolbarPosition | null) => {
      chartToolbarPositionVersion.current += 1
      setLoaded((state) => ({
        ...state,
        value: {
          ...state.value,
          legacyImported: true,
          chartToolbarPosition: position,
        },
      }))
      void enqueue(() => saveChartToolbarPosition(position)).catch(
        (error: unknown) => showErrorToast(getPanelLayoutErrorMessage(error))
      )
    },
    [enqueue]
  )

  return {
    layouts,
    remember,
    rememberOpenMarketRow,
    rememberChartToolbarPosition,
  }
}

function markLegacyRead() {
  try {
    localStorage.setItem(LEGACY_IMPORT_MARKER, "done")
  } catch {
    // The old keys were not readable either, so there is nothing to revisit.
  }
}

function keepNewerCurrent(
  saved: TradePanelLayouts["current"],
  local: TradePanelLayouts["current"],
  before: Partial<Record<TradePanelLayoutKey, number>>,
  after: Partial<Record<TradePanelLayoutKey, number>>,
  keys: readonly TradePanelLayoutKey[]
) {
  const current = { ...saved }
  for (const key of keys) {
    if (after[key] === before[key]) continue
    const newer = local[key]
    if (newer) current[key] = newer
  }
  return current
}
