import * as React from "react"

import {
  loadMarketExplorer,
  saveMarketExplorer,
  type ExplorerOpening,
  type ExplorerVenue,
} from "@/lib/api/trade/market-explorer"
import type { ProtocolId } from "@/lib/protocols/contracts"
import {
  clearLiveCatalog,
  retainMarketHistory,
  startLiveMarketData,
} from "@/lib/trade/live-market"
import type { ExplorerPrefs } from "@/lib/trade/market-explorer"
import { showErrorToast } from "@/lib/toast/error-toast"

export function useExplorerVenues(
  opening: ExplorerOpening,
  selected: readonly ProtocolId[] = opening.prefs.current.exchanges
) {
  const selection = selected.join("|")
  const enabled = React.useRef(new Set(selected))
  const previousSelection = React.useRef(new Set(selected))
  React.useEffect(() => {
    enabled.current = new Set(selected)
  }, [selection, selected])
  const [answers, setAnswers] = React.useState<
    Partial<Record<ProtocolId, ExplorerVenue>>
  >({})
  const pending = React.useRef(new Set<ProtocolId>())
  const [retrying, setRetrying] = React.useState(new Set<ProtocolId>())
  const accept = React.useCallback((answer: ExplorerVenue) => {
    if (!enabled.current.has(answer.protocol)) return
    setAnswers((current) =>
      current[answer.protocol]
        ? current
        : { ...current, [answer.protocol]: answer }
    )
  }, [])
  const retry = React.useCallback(
    async (protocol: ProtocolId) => {
      if (
        !enabled.current.has(protocol) ||
        pending.current.has(protocol) ||
        document.hidden
      )
        return
      pending.current.add(protocol)
      setRetrying(new Set(pending.current))
      try {
        const fresh = await loadMarketExplorer(protocol)
        for (const venue of fresh.venues) {
          const answer = await venue.answer
          if (enabled.current.has(answer.protocol))
            setAnswers((current) => ({ ...current, [answer.protocol]: answer }))
        }
      } catch {
        setAnswers((current) => {
          if (!enabled.current.has(protocol)) return current
          const previous =
            current[protocol] ??
            opening.availableVenues.find((venue) => venue.protocol === protocol)
          return previous
            ? {
                ...current,
                [protocol]: {
                  hidden: 0,
                  orders: false,
                  ...previous,
                  catalog: null,
                  message: "The market list could not be refreshed.",
                },
              }
            : current
        })
      } finally {
        pending.current.delete(protocol)
        setRetrying(new Set(pending.current))
      }
    },
    [opening.availableVenues]
  )
  React.useEffect(() => {
    for (const protocol of enabled.current) {
      if (!previousSelection.current.has(protocol)) void retry(protocol)
    }
    previousSelection.current = new Set(enabled.current)
  }, [selection, retry])
  React.useEffect(() => {
    const timer = setInterval(() => {
      if (!document.hidden)
        for (const protocol of enabled.current) void retry(protocol)
    }, 60_000)
    return () => clearInterval(timer)
  }, [retry])
  const selectedVenues = opening.availableVenues.filter((venue) =>
    selected.includes(venue.protocol)
  )
  const venues = selectedVenues
    .map((venue) => answers[venue.protocol])
    .filter((venue): venue is ExplorerVenue => !!venue)
  return {
    venues,
    accept,
    retry,
    retrying,
    pending: selectedVenues.length - venues.length,
  }
}

export function useExplorerLive(
  venues: readonly ExplorerVenue[],
  retry: (protocol: ProtocolId) => void
) {
  const catalogs = venues.flatMap((venue) =>
    venue.catalog ? [venue.catalog] : []
  )
  const signature = catalogs
    .map((catalog) => `${catalog.protocol}:${catalog.network}`)
    .sort()
    .join("|")
  const latest = React.useRef(catalogs)
  React.useEffect(() => {
    for (const previous of latest.current) {
      if (
        !catalogs.some(
          (catalog) =>
            catalog.protocol === previous.protocol &&
            catalog.network === previous.network
        )
      )
        clearLiveCatalog(previous)
    }
    latest.current = catalogs
  })
  React.useEffect(() => retainMarketHistory(), [])
  React.useEffect(() => {
    let stop: (() => void) | undefined
    const change = () => {
      stop?.()
      if (document.hidden) {
        latest.current.forEach(clearLiveCatalog)
        stop = undefined
      } else {
        stop = startLiveMarketData(latest.current, () => {
          for (const catalog of latest.current) retry(catalog.protocol)
        })
      }
    }
    change()
    document.addEventListener("visibilitychange", change)
    return () => {
      stop?.()
      document.removeEventListener("visibilitychange", change)
    }
  }, [signature, retry])
  return catalogs
}

export function useExplorerPrefs(initial: ExplorerPrefs) {
  const [prefs, setPrefs] = React.useState(initial)
  const saved = React.useRef(initial)
  const queue = React.useRef(Promise.resolve())
  const revision = React.useRef(0)
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  function change(next: ExplorerPrefs) {
    setPrefs(next)
    const currentRevision = ++revision.current
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      queue.current = queue.current.then(async () => {
        try {
          await saveMarketExplorer(next)
          saved.current = next
        } catch {
          if (revision.current === currentRevision) {
            setPrefs(saved.current)
            showErrorToast(
              "Your Markets view could not be saved. The last saved view has been restored."
            )
          } else {
            showErrorToast(
              "An earlier Markets change could not be saved. Your newer changes are still waiting to save."
            )
          }
        }
      })
    }, 400)
  }
  // A pending save is allowed to finish when the chart opens from a row.
  return { prefs, change }
}

export function useExplorerClock() {
  const [now, setNow] = React.useState(() => Date.now())
  React.useEffect(() => {
    const timer = setInterval(() => {
      if (!document.hidden) setNow(Date.now())
    }, 1000)
    return () => clearInterval(timer)
  }, [])
  return now
}
