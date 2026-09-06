import {
  playDiscoverySound,
  primeDiscoverySound,
} from "@/lib/trade/discovery-sound"
import * as React from "react"
import { marketChartHref } from "@/lib/protocols/contracts"
import {
  ExplorerArrivals,
  type ExplorerArrival,
} from "@/lib/trade/explorer-arrivals"
import { marketPace } from "@/lib/trade/market-discovery"
import type { ExplorerView } from "@/lib/trade/market-explorer"
import {
  explorerValue,
  sortExplorerRows,
  type ExplorerRow,
} from "./explorer-rows"

export function ExplorerArrivalStrip({
  rows,
  view,
  sound,
}: {
  sound: boolean
  rows: ExplorerRow[]
  view: ExplorerView
}) {
  const [arrivals, setArrivals] = React.useState<ExplorerArrival[]>([])
  const detector = React.useRef(new ExplorerArrivals())
  const interacted = React.useRef(false)
  const soundEnabled = React.useRef(sound)
  const latest = React.useRef({ rows, view })
  React.useEffect(() => {
    latest.current = { rows, view }
  })
  React.useEffect(() => {
    soundEnabled.current = sound
  }, [sound])
  React.useEffect(() => {
    const click = () => {
      interacted.current = true
      void primeDiscoverySound()
    }
    const setting = (event: Event) => {
      soundEnabled.current = (event as CustomEvent<boolean>).detail
    }
    const channel =
      typeof BroadcastChannel !== "undefined"
        ? new BroadcastChannel("trade-discovery-sound")
        : null
    if (channel)
      channel.onmessage = (event: MessageEvent<unknown>) => {
        if (typeof event.data === "boolean") soundEnabled.current = event.data
      }
    document.addEventListener("click", click)
    window.addEventListener("trade-discovery-sound", setting)
    return () => {
      document.removeEventListener("click", click)
      window.removeEventListener("trade-discovery-sound", setting)
      channel?.close()
    }
  }, [])
  React.useEffect(() => {
    const timer = setInterval(() => {
      if (document.hidden) return
      const { rows: current, view: settings } = latest.current
      const now = Date.now()
      const ranked = sortExplorerRows(current, {
        ...settings,
        pins: [],
      }).filter((row) => explorerValue(row, settings.sort) !== null)
      const next = detector.current.update(
        ranked.map((row) => ({
          key: row.key,
          symbol: row.symbol,
          pace: marketPace(row.volume24hUsd, row.windows[60]),
        })),
        JSON.stringify(settings),
        settings.alertPace,
        now
      )
      if (
        settings.arrivals &&
        next.length &&
        detector.current.allowSound(
          now,
          interacted.current,
          soundEnabled.current
        )
      )
        playDiscoverySound()
      setArrivals((previous) =>
        settings.arrivals
          ? [...next, ...previous]
              .filter((arrival) => now - arrival.at < 60_000)
              .slice(0, 5)
          : []
      )
    }, 1000)
    return () => clearInterval(timer)
  }, [])
  if (!view.arrivals || !arrivals.length) return null
  return (
    <div className="flex flex-wrap items-center gap-2 border-t px-3 py-2">
      <div aria-live="polite" className="flex flex-wrap gap-2">
        {arrivals.map((arrival) => (
          <a
            key={`${arrival.key}:${arrival.at}`}
            href={marketChartHref(arrival.key) ?? undefined}
            className="text-sm hover:underline"
          >
            {new Date(arrival.at).toLocaleTimeString()} · {arrival.symbol} ·{" "}
            {arrival.reason}
          </a>
        ))}
      </div>
    </div>
  )
}
