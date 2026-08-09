import * as React from "react"

import {
  getChartOptionsErrorMessage,
  saveRememberedChartOptions,
} from "@/lib/api/chart-options"
import { showErrorToast } from "@/lib/toast/error-toast"
import type { ChartOptions } from "@/lib/trade/chart-options"

const SETTLE_MS = 500

/** The chart's visible parts, changed immediately and remembered per account. */
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

  const setOption = React.useCallback(
    (key: keyof ChartOptions, visible: boolean) => {
      if (optionsRef.current[key] === visible) return
      const next = { ...optionsRef.current, [key]: visible }
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

  return { options, setOption }
}

export type ChartOptionsControl = ReturnType<typeof useChartOptions>
