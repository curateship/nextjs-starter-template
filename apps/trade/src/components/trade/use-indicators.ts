import * as React from "react"

import {
  getIndicatorsErrorMessage,
  saveIndicatorSettings,
} from "@/lib/api/indicators"
import { showErrorToast } from "@/lib/toast/error-toast"
import {
  defaultParamsOf,
  type IndicatorSettings,
} from "@/lib/trade/indicators/registry"

/** How long the settings must sit still before they are written down. */
const SETTLE_MS = 800

/**
 * Which indicators are on and what each is set to.
 *
 * It starts as whatever the page loaded with — read in the route's loader, so
 * the first chart drawn already has them on rather than painting bare candles
 * and popping dashes onto them a beat later.
 *
 * Saving waits for the settings to sit still, because typing "150" into a
 * field is three changes and this database is a long way off. Nothing on
 * screen waits for the write either: the chart is already drawing the new
 * setting, so a write that fails costs the memory and nothing else. That is
 * also why a failure does not put the setting back — undoing what somebody
 * just typed, a second after they typed it, is worse than losing it on the
 * next reload, and the toast says exactly which of the two happened.
 */
export function useChartIndicators(initial: IndicatorSettings) {
  const [settings, setSettings] = React.useState(initial)
  // The same value, readable from the timer and the unmount, neither of which
  // can see the render that set it.
  const settingsRef = React.useRef(initial)
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  const write = React.useCallback((next: IndicatorSettings) => {
    saveIndicatorSettings(next).catch((error: unknown) => {
      showErrorToast(getIndicatorsErrorMessage(error))
    })
  }, [])

  // Leaving the page with a change still waiting out its pause would throw
  // that change away — and the last thing somebody did is exactly the thing
  // they expect to come back to. So it goes now instead.
  React.useEffect(() => {
    return () => {
      if (!timerRef.current) return
      clearTimeout(timerRef.current)
      timerRef.current = null
      write(settingsRef.current)
    }
  }, [write])

  const revise = React.useCallback(
    (change: (current: IndicatorSettings) => IndicatorSettings) => {
      const next = change(settingsRef.current)
      settingsRef.current = next
      setSettings(next)
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => {
        timerRef.current = null
        write(next)
      }, SETTLE_MS)
    },
    [write]
  )

  /** Switch one on or off. Its settings are kept either way. */
  const toggle = React.useCallback(
    (kind: string, on: boolean) => {
      revise((current) => ({ ...current, [kind]: { ...current[kind], on } }))
    },
    [revise]
  )

  /** Change one of an indicator's settings. */
  const setParam = React.useCallback(
    (kind: string, key: string, value: number | boolean | string) => {
      revise((current) => ({
        ...current,
        [kind]: {
          ...current[kind],
          params: { ...current[kind].params, [key]: value },
        },
      }))
    },
    [revise]
  )

  /**
   * Put one indicator's settings back the way it came. Its folds are left
   * alone — they are how the menu is arranged, not one of its settings.
   */
  const reset = React.useCallback(
    (kind: string) => {
      revise((current) => ({
        ...current,
        [kind]: { ...current[kind], params: defaultParamsOf(kind) },
      }))
    },
    [revise]
  )

  /**
   * Unfold one indicator's settings, which folds every other one away. One at
   * a time: every indicator unfolded at once would be a menu longer than the
   * screen, and nobody sets up two at the same moment.
   */
  const setOpen = React.useCallback(
    (kind: string, open: boolean) => {
      revise((current) =>
        Object.fromEntries(
          Object.entries(current).map(([one, state]) => [
            one,
            { ...state, open: open && one === kind },
          ])
        )
      )
    },
    [revise]
  )

  /** Fold one of an indicator's settings cards away, or open it again. */
  const setCardOpen = React.useCallback(
    (kind: string, title: string, open: boolean) => {
      revise((current) => {
        const shut = current[kind].shutCards.filter((one) => one !== title)
        return {
          ...current,
          [kind]: {
            ...current[kind],
            shutCards: open ? shut : [...shut, title],
          },
        }
      })
    },
    [revise]
  )

  return { settings, toggle, setParam, reset, setOpen, setCardOpen }
}

export type ChartIndicators = ReturnType<typeof useChartIndicators>
