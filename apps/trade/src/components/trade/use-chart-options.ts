import * as React from "react"

import {
  getChartOptionsErrorMessage,
  loadRememberedChartOptions,
  saveRememberedChartOptions,
} from "@/lib/api/trade/chart-options"
import { showErrorToast } from "@/lib/toast/error-toast"
import type { TradingZoneId } from "@/lib/trade/chart-timezone"
import type { ChartOptions, ChartOptionToggle } from "@/lib/trade/chart-options"

const SETTLE_MS = 500

/**
 * How the chart is read, including its price shape, visible parts and clock,
 * changed immediately and remembered per account.
 */
export function useChartOptions(initial: ChartOptions) {
  const [options, setOptions] = React.useState(initial)
  const optionsRef = React.useRef(initial)
  const revisionRef = React.useRef(0)
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  const write = React.useCallback((next: ChartOptions) => {
    saveRememberedChartOptions(next).catch((error: unknown) => {
      showErrorToast(getChartOptionsErrorMessage(error))
    })
  }, [])

  React.useEffect(() => {
    return () => {
      if (!timerRef.current) return
      clearTimeout(timerRef.current)
      timerRef.current = null
      write(optionsRef.current)
    }
  }, [write])

  React.useEffect(() => {
    let stale = false
    const openingRevision = revisionRef.current
    // The route deliberately keeps its opening answer for one minute. Read
    // this small preference directly as well, so a reload immediately after
    // typing a buffer cannot replay the older opening snapshot. A choice made
    // while this read is in flight wins over its answer.
    loadRememberedChartOptions()
      .then(({ options: remembered }) => {
        if (stale || revisionRef.current !== openingRevision) return
        optionsRef.current = remembered
        setOptions(remembered)
      })
      .catch(() => {
        // The complete opening value is still usable; this refresh only
        // closes the route-cache window after a recent save.
      })
    return () => {
      stale = true
    }
  }, [])

  // The chart follows straight away; the write waits for the clicking to
  // settle, so a run through the checkboxes is one save rather than five.
  const change = React.useCallback(
    (next: ChartOptions) => {
      revisionRef.current += 1
      optionsRef.current = next
      setOptions(next)
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => {
        timerRef.current = null
        write(next)
      }, SETTLE_MS)
    },
    [write]
  )

  const setOption = React.useCallback(
    (key: ChartOptionToggle, visible: boolean) => {
      if (optionsRef.current[key] === visible) return
      change({ ...optionsRef.current, [key]: visible })
    },
    [change]
  )

  const setZone = React.useCallback(
    (zone: TradingZoneId) => {
      if (optionsRef.current.zone === zone) return
      change({ ...optionsRef.current, zone })
    },
    [change]
  )

  const setOrderArrowTrades = React.useCallback(
    (limit: ChartOptions["orderArrowTrades"]) => {
      if (optionsRef.current.orderArrowTrades === limit) return
      change({ ...optionsRef.current, orderArrowTrades: limit })
    },
    [change]
  )

  // Flipped from a line's own window rather than the options menu, so the
  // next trendline drawn starts the way the last one was left.
  const setExtendTrendlines = React.useCallback(
    (on: boolean) => {
      if (optionsRef.current.extendTrendlines === on) return
      change({ ...optionsRef.current, extendTrendlines: on })
    },
    [change]
  )

  // Typed in one line's own window, then used as the starting value when the
  // next line's alert is switched on.
  const setLineAlertBuffer = React.useCallback(
    (buffer: ChartOptions["lineAlertBuffer"]) => {
      if (optionsRef.current.lineAlertBuffer === buffer) return
      change({ ...optionsRef.current, lineAlertBuffer: buffer })
    },
    [change]
  )

  const replace = React.useCallback(
    (next: ChartOptions) => change(next),
    [change]
  )

  return {
    options,
    setOption,
    setZone,
    setOrderArrowTrades,
    setExtendTrendlines,
    setLineAlertBuffer,
    replace,
  }
}

export type ChartOptionsControl = ReturnType<typeof useChartOptions>
