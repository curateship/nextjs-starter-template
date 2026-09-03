import * as React from "react"

import {
  getDrawingAlertErrorMessage,
  getLineAlertsLoadErrorMessage,
  loadLineAlerts,
  setDrawingAlert,
} from "@/lib/api/trade/drawings"
import { showErrorToast } from "@/lib/toast/error-toast"
import type { LineAlert, LineAlertList } from "@/lib/trade/line-alerts"

const REFRESH_MS = 2_000

const NONE: LineAlertList = { armed: [], fired: [] }

/**
 * The line alerts the Alerts panel lists beside the price alerts.
 *
 * Its own small list rather than a second kind inside `usePriceAlerts`: that
 * hook is built around the chart placing, dragging and deleting its rows, and
 * a line alert is none of those. A line is armed from its own popover on the
 * chart, which tells this list to read again; while any line is armed the
 * list reads every two seconds so a fired one moves to Fired on its own.
 */
export function useLineAlerts() {
  const [list, setList] = React.useState<LineAlertList>(NONE)
  const [error, setError] = React.useState<string | null>(null)
  const reading = React.useRef(false)
  const revision = React.useRef(0)
  const pendingOff = React.useRef(new Set<string>())

  const refresh = React.useCallback(async () => {
    if (reading.current) return
    reading.current = true
    const startedAt = revision.current
    try {
      const answer = await loadLineAlerts()
      // A press that landed after this read left already shows the newer
      // answer; the next read reconciles it rather than this one undoing it.
      if (revision.current !== startedAt) return
      setList({
        armed: answer.armed.filter((one) => !pendingOff.current.has(one.id)),
        fired: answer.fired.filter((one) => !pendingOff.current.has(one.id)),
      })
      setError(null)
    } catch (caught) {
      setError(getLineAlertsLoadErrorMessage(caught))
    } finally {
      reading.current = false
    }
  }, [])

  React.useEffect(() => {
    void refresh()
  }, [refresh])

  React.useEffect(() => {
    if (list.armed.length === 0 && !error) return
    const timer = window.setInterval(() => void refresh(), REFRESH_MS)
    return () => window.clearInterval(timer)
  }, [list.armed.length, error, refresh])

  /**
   * Switch an armed alert off, or clear a fired one from the list. Both are
   * the same write: the line loses its alert record and stays on the chart.
   */
  const switchOff = React.useCallback(
    (id: string) => {
      const was: LineAlert | undefined =
        list.armed.find((one) => one.id === id) ??
        list.fired.find((one) => one.id === id)
      if (!was) return
      pendingOff.current.add(id)
      revision.current += 1
      setList((current) => ({
        armed: current.armed.filter((one) => one.id !== id),
        fired: current.fired.filter((one) => one.id !== id),
      }))
      setDrawingAlert(id, false, null)
        .catch((caught: unknown) => {
          revision.current += 1
          setList((current) =>
            was.firedAt === null
              ? { ...current, armed: [...current.armed, was] }
              : { ...current, fired: [was, ...current.fired] }
          )
          showErrorToast(getDrawingAlertErrorMessage(caught))
        })
        .finally(() => {
          pendingOff.current.delete(id)
        })
    },
    [list]
  )

  return { ...list, error, refresh, switchOff }
}
