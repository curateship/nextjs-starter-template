import * as React from "react"
import { PlusIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import type { ChartSurface } from "@/components/trade/price-chart"

/** A price-scale shortcut to the chart's existing right-click menu. */
export function ChartPriceAction({
  surface,
  onOpen,
}: {
  surface: ChartSurface
  onOpen: (point: { clientX: number; clientY: number }) => void
}) {
  const hostRef = React.useRef<HTMLDivElement>(null)
  const [y, setY] = React.useState<number | null>(null)

  React.useEffect(() => {
    const plot = hostRef.current?.closest('[data-slot="chart-ready"]')
    if (!plot) return
    let frame = 0
    const move = (event: Event) => {
      const pointer = event as PointerEvent
      if (pointer.pointerType === "touch" || pointer.buttons) return
      const box = plot.getBoundingClientRect()
      const nextY = pointer.clientY - box.top
      const x = pointer.clientX - box.left
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const price = surface.priceAt(nextY)
        setY(
          x >= 0 &&
            x <= surface.width &&
            nextY >= 12 &&
            nextY <= surface.height - 12 &&
            price !== null &&
            price > 0
            ? nextY
            : null
        )
      })
    }
    const leave = () => {
      cancelAnimationFrame(frame)
      setY(null)
    }
    plot.addEventListener("pointermove", move)
    plot.addEventListener("pointerleave", leave)
    return () => {
      cancelAnimationFrame(frame)
      plot.removeEventListener("pointermove", move)
      plot.removeEventListener("pointerleave", leave)
    }
  }, [surface])

  return (
    <div ref={hostRef}>
      {y !== null ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="secondary"
              size="icon-xs"
              className="pointer-events-auto absolute z-20 -translate-y-1/2 transition-none"
              style={{ top: y, left: surface.width - 24 }}
              aria-label="Actions at cursor price"
              aria-haspopup="menu"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation()
                const box = event.currentTarget.getBoundingClientRect()
                onOpen({ clientX: box.left, clientY: box.top + box.height / 2 })
              }}
            >
              <PlusIcon />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Actions at this price</TooltipContent>
        </Tooltip>
      ) : null}
    </div>
  )
}
