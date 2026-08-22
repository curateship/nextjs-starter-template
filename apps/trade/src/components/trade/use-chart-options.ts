import * as React from "react"

import {
  getChartOptionsErrorMessage,
  saveRememberedChartOptions,
} from "@/lib/api/chart-options"
import { showErrorToast } from "@/lib/toast/error-toast"
import type { TradingZoneId } from "@/lib/trade/chart-timezone"
import type { ChartOptions, ChartOptionToggle } from "@/lib/trade/chart-options"

const SETTLE_MS = 500

/**
 * How the chart is read — its visible parts and its clock — changed
 * immediately and remembered per account.
 */
export function useChartOptions(initial: ChartOptions) {
  const [options, setOptions] = React.useState(initial)
  const optionsRef = React.useRef(initial)
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

  // The chart follows straight away; the write waits for the clicking to
  // settle, so a run through the checkboxes is one save rather than five.
  const change = React.useCallback(
    (next: ChartOptions) => {
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

  return { options, setOption, setZone, setOrderArrowTrades }
}

export type ChartOptionsControl = ReturnType<typeof useChartOptions>
