import * as React from "react"

import {
  getPanelLayoutErrorMessage,
  saveHiddenTradeColumns,
  saveJournalView,
  saveChartToolbarPosition,
  saveOpenMarketRow,
} from "@/lib/api/trade/panel-layouts"
import {
  marketPanelScopeKey,
  type MarketPanelScope,
  type ChartToolbarPosition,
  type JournalView,
  type TradePanelLayouts,
} from "@/lib/trade/panel-layout"
import type { TradesPopoverKind } from "@/lib/trade/trades-popover-columns"
import { showErrorToast } from "@/lib/toast/error-toast"

/** The account's panel choices, shared by every part of one page that keeps one. */
export function useTradePanelLayouts(initial: TradePanelLayouts) {
  const [loaded, setLoaded] = React.useState({
    source: initial,
    value: initial,
  })
  const writeQueue = React.useRef(Promise.resolve())
  if (loaded.source !== initial) {
    setLoaded({ source: initial, value: initial })
  }
  const layouts = loaded.source === initial ? loaded.value : initial

  // One account row owns every choice. Keep its writes in interaction order so
  // a slower earlier request cannot land after a newer one.
  const enqueue = React.useCallback(<T>(write: () => Promise<T>) => {
    const pending = writeQueue.current.then(write)
    writeQueue.current = pending.then(
      () => undefined,
      () => undefined
    )
    return pending
  }, [])

  const rememberOpenMarketRow = React.useCallback(
    (scope: MarketPanelScope, rowId: string | null) => {
      const key = marketPanelScopeKey(scope)
      setLoaded((state) => ({
        ...state,
        value: {
          ...state.value,
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
      setLoaded((state) => ({
        ...state,
        value: { ...state.value, chartToolbarPosition: position },
      }))
      void enqueue(() => saveChartToolbarPosition(position)).catch(
        (error: unknown) => showErrorToast(getPanelLayoutErrorMessage(error))
      )
    },
    [enqueue]
  )

  const rememberHiddenTradeColumns = React.useCallback(
    (kind: TradesPopoverKind, columns: string[]) => {
      setLoaded((state) => ({
        ...state,
        value: {
          ...state.value,
          hiddenTradeColumns: { ...state.value.hiddenTradeColumns, [kind]: columns },
        },
      }))
      void enqueue(() => saveHiddenTradeColumns(kind, columns)).catch(
        (error: unknown) => showErrorToast(getPanelLayoutErrorMessage(error))
      )
    },
    [enqueue]
  )

  const rememberJournalView = React.useCallback(
    (view: JournalView) => {
      setLoaded((state) => ({ ...state, value: { ...state.value, journalView: view } }))
      void enqueue(() => saveJournalView(view)).catch(
        (error: unknown) => showErrorToast(getPanelLayoutErrorMessage(error))
      )
    },
    [enqueue]
  )

  return {
    layouts,
    rememberOpenMarketRow,
    rememberHiddenTradeColumns,
    rememberChartToolbarPosition,
    rememberJournalView,
  }
}
