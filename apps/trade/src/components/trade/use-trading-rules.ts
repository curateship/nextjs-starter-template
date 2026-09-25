import * as React from "react"

import {
  getTradingRulesSaveErrorMessage,
  saveTradingRulesSettings,
} from "@/lib/api/trade/trading-rules"
import { showErrorToast } from "@/lib/toast/error-toast"
import type { TradingRuleKind, TradingRules } from "@/lib/trade/trading-rules"

const SETTLE_MS = 500

/**
 * The rules checked before a real-money entry, changed immediately and
 * remembered per account. The same shape as `useChartOptions`: the screen
 * follows straight away, and the write waits for the typing to settle so a
 * number typed digit by digit is one save rather than three.
 */
export function useTradingRules(initial: TradingRules) {
  const [rules, setRules] = React.useState(initial)
  const rulesRef = React.useRef(initial)
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  const write = React.useCallback((next: TradingRules) => {
    saveTradingRulesSettings(next).catch((error: unknown) => {
      showErrorToast(getTradingRulesSaveErrorMessage(error))
    })
  }, [])

  React.useEffect(() => {
    return () => {
      if (!timerRef.current) return
      clearTimeout(timerRef.current)
      timerRef.current = null
      write(rulesRef.current)
    }
  }, [write])

  const change = React.useCallback(
    (next: TradingRules) => {
      rulesRef.current = next
      setRules(next)
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => {
        timerRef.current = null
        write(next)
      }, SETTLE_MS)
    },
    [write]
  )

  const setRule = React.useCallback(
    <K extends TradingRuleKind>(kind: K, patch: Partial<TradingRules[K]>) => {
      const current = rulesRef.current[kind]
      const next = { ...current, ...patch }
      if (
        (Object.keys(next) as (keyof typeof next)[]).every(
          (key) => next[key] === current[key]
        )
      ) {
        return
      }
      change({ ...rulesRef.current, [kind]: next })
    },
    [change]
  )

  return { rules, setRule }
}

/**
 * When the last order was placed by hand on each coin, in this browser.
 *
 * A module-level memory rather than component state, so it outlives a chart
 * panel that unmounts when the layout changes and follows a coin across
 * every screen in the tab. A reload empties it; the chart seeds it again from
 * the newest fill and open order it can see for the coin.
 */
const lastOrders = new Map<string, number>()

export function rememberLastOrder(marketKey: string, at = Date.now()): void {
  const known = lastOrders.get(marketKey)
  if (known === undefined || at > known) lastOrders.set(marketKey, at)
}

/** The newest of what the browser remembers and what the caller can see. */
export function lastOrderAt(
  marketKey: string,
  seen: number | null
): number | null {
  const known = lastOrders.get(marketKey) ?? null
  if (known === null) return seen
  if (seen === null) return known
  return Math.max(known, seen)
}
