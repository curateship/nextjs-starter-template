import * as React from "react"

import {
  PriceChartView,
} from "@/components/chart/price-chart"
import { Button } from "@/components/ui/button"
import type { CandleInterval } from "@/lib/hl/ws"
import type { IndicatorConfig } from "@/lib/trading/indicators-config"
import { usePersistedState } from "@/lib/use-persisted-state"
import type { HistoryCandle } from "@/server/backtest/history"
import { GripVerticalIcon, XIcon } from "lucide-react"

const PANEL_WIDTH = 460
const PANEL_HEIGHT = 316

type PanelPos = { x: number; y: number }

function parsePos(raw: string): PanelPos {
  const parsed: unknown = JSON.parse(raw)
  if (
    typeof parsed === "object" &&
    parsed !== null &&
    typeof (parsed as PanelPos).x === "number" &&
    typeof (parsed as PanelPos).y === "number"
  ) {
    return parsed as PanelPos
  }
  return { x: 16, y: 16 }
}

/**
 * A draggable floating mini chart over the practice chart: the same market at
 * a second timeframe, clipped to the same playhead. View-only — pan and zoom
 * inside it, but no drawings and no orders. Coarser timeframes are aggregated
 * client-side from revealed candles, so the newest bucket forms live instead
 * of leaking its future from a natively fetched coarse candle.
 */
export function PracticeMiniChart({
  market,
  interval,
  intervals,
  candles,
  indicators,
  onIntervalChange,
  onClose,
}: {
  market: string
  interval: CandleInterval
  /** Every pickable timeframe, coarse and fine. */
  intervals: readonly CandleInterval[]
  /** Already clipped to the playhead (and aggregated when coarser). */
  candles: HistoryCandle[]
  indicators: IndicatorConfig[]
  onIntervalChange: (interval: CandleInterval) => void
  onClose: () => void
}) {
  const boxRef = React.useRef<HTMLDivElement | null>(null)
  const [savedPos, setSavedPos] = usePersistedState<PanelPos>(
    "practice-mini-pos",
    { x: 16, y: 16 },
    parsePos
  )
  const [pos, setPos] = React.useState<PanelPos>(savedPos)
  // The saved position may be from a larger window — clamp it back inside
  // the chart once the container is measurable, or the panel (and its
  // controls) can sit unreachable beyond the clipped edge.
  React.useLayoutEffect(() => {
    // Measuring the parent requires a mounted DOM — a render-time clamp
    // can't. One guarded write before first paint, not a render cascade.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPos((current) => clamp(current))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const dragRef = React.useRef<{
    pointerId: number
    startX: number
    startY: number
    originX: number
    originY: number
  } | null>(null)

  const clamp = React.useCallback((next: PanelPos): PanelPos => {
    const parent = boxRef.current?.parentElement
    if (!parent) return next
    const maxX = Math.max(0, parent.clientWidth - PANEL_WIDTH)
    const maxY = Math.max(0, parent.clientHeight - PANEL_HEIGHT)
    return {
      x: Math.min(Math.max(next.x, 0), maxX),
      y: Math.min(Math.max(next.y, 0), maxY),
    }
  }, [])

  const startDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    // Buttons in the header keep their own clicks; only bare header space drags.
    if ((event.target as HTMLElement).closest("button")) return
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: pos.x,
      originY: pos.y,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const moveDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    setPos(
      clamp({
        x: drag.originX + event.clientX - drag.startX,
        y: drag.originY + event.clientY - drag.startY,
      })
    )
  }
  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    dragRef.current = null
    // `pos` is fresh: every drag move re-rendered with the latest position.
    setSavedPos(pos)
  }

  return (
    <div
      ref={boxRef}
      className="absolute z-20 overflow-hidden rounded-xl border bg-card shadow-lg"
      style={{ left: pos.x, top: pos.y, width: PANEL_WIDTH }}
    >
      <div
        className="flex cursor-grab items-center gap-1.5 border-b bg-muted/40 py-1 pr-1 pl-2 select-none active:cursor-grabbing"
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <GripVerticalIcon className="size-3.5 text-muted-foreground" />
        <span className="text-xs font-medium">{market}</span>
        <div className="flex items-center gap-0.5" aria-label="Mini chart timeframe">
          {intervals.map((option) => (
            <Button
              key={option}
              type="button"
              variant="ghost"
              size="xs"
              aria-pressed={option === interval}
              className={
                option === interval
                  ? "h-5 bg-muted px-1.5 font-mono text-[10px] text-foreground"
                  : "h-5 px-1.5 font-mono text-[10px] text-muted-foreground"
              }
              onClick={() => onIntervalChange(option)}
            >
              {option}
            </Button>
          ))}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="ml-auto"
          aria-label="Close mini chart"
          onClick={onClose}
        >
          <XIcon className="size-3.5" />
        </Button>
      </div>
      <div style={{ height: PANEL_HEIGHT - 30 }} className="relative">
        <PriceChartView
          candles={candles}
          loading={candles.length === 0}
          dataKey={`mini:${market}:${interval}`}
          indicators={indicators}
        />
      </div>
    </div>
  )
}

// Dev-only: practice sessions hold live engine and playback state that does
// not survive hot swapping coherently — stale module generations show up as
// drawings "skipping". Any edit reaching this module reloads the page.
if (import.meta.hot) {
  import.meta.hot.accept(() => {
    import.meta.hot?.invalidate()
  })
}
