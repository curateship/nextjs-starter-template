import * as React from "react"
import { GripVerticalIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { marketSymbol } from "@/lib/protocols/contracts"
import {
  formatPrice,
  formatSignedUsd,
  formatSize,
  formatUsd,
} from "@/lib/trade/format"
import { projectedProfit, type TradePosition } from "@/lib/trade/paper"

export type ChartTakeProfitState = {
  positionId: string
  px: number
  x: number
  y: number
}

const PANEL_WIDTH = 288
const PANEL_HEIGHT = 220
const EDGE = 8
const SHARE_PICKS = [10, 25, 50, 100]

/** The small chart window for setting a target at the right-clicked price. */
export function ChartTakeProfit({
  state,
  position,
  wallet,
  onSave,
  onClose,
}: {
  state: ChartTakeProfitState
  position: TradePosition
  wallet: string
  onSave: (brackets: {
    tpPx: number
    tpSz: number | null
    slPx: number | null
  }) => void
  onClose: () => void
}) {
  const held = Math.abs(position.szi)
  const [amount, setAmount] = React.useState("100")
  const [unit, setUnit] = React.useState<"pct" | "usd">("pct")
  const [at, setAt] = React.useState(() => ({
    x: Math.max(
      EDGE,
      Math.min(state.x, window.innerWidth - PANEL_WIDTH - EDGE)
    ),
    y: Math.max(EDGE, Math.min(state.y, window.innerHeight - PANEL_HEIGHT)),
  }))
  const dragRef = React.useRef<{ dx: number; dy: number } | null>(null)

  React.useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const grab = dragRef.current
      if (!grab) return
      setAt({
        x: Math.max(
          EDGE,
          Math.min(
            event.clientX - grab.dx,
            window.innerWidth - PANEL_WIDTH - EDGE
          )
        ),
        y: Math.max(
          EDGE,
          Math.min(event.clientY - grab.dy, window.innerHeight - 60)
        ),
      })
    }
    const onUp = () => {
      dragRef.current = null
    }
    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup", onUp)
    return () => {
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", onUp)
    }
  }, [])

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [onClose])

  const typed = Number(amount.trim())
  const coins = unit === "pct" ? held * (typed / 100) : typed / state.px
  const valid = Number.isFinite(coins) && coins > 0
  const sellsAll = valid && coins >= held * (1 - 1e-9)
  const tpSz = sellsAll ? null : coins

  const submit = () => {
    if (!valid) return
    onSave({
      tpPx: state.px,
      tpSz,
      slPx: position.slPx,
    })
    onClose()
  }

  return (
    <>
      <div
        className="fixed inset-0 z-40"
        onPointerDown={onClose}
        onContextMenu={(event) => {
          event.preventDefault()
          onClose()
        }}
      />
      <div
        role="dialog"
        aria-label={`Take profit on ${marketSymbol(position.marketKey)} at ${formatPrice(state.px)}`}
        className="fixed z-50 w-72 rounded-xl border bg-card shadow-lg"
        style={{ left: at.x, top: at.y }}
        onPointerDown={(event) => event.stopPropagation()}
        onContextMenu={(event) => event.stopPropagation()}
      >
        <div
          className="flex cursor-grab items-center gap-2 border-b px-3 py-2 active:cursor-grabbing"
          onPointerDown={(event) => {
            dragRef.current = {
              dx: event.clientX - at.x,
              dy: event.clientY - at.y,
            }
          }}
        >
          <GripVerticalIcon className="size-4 shrink-0 text-muted-foreground" />
          <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
            Take profit
          </span>
          <span className="ml-auto min-w-0 truncate text-xs font-medium text-muted-foreground">
            {wallet}
          </span>
        </div>

        <div className="grid gap-4 p-3">
          {valid ? (
            <p className="text-sm font-medium tabular-nums">
              Projected:{" "}
              <span className="text-emerald-600 dark:text-emerald-400">
                {formatSignedUsd(
                  projectedProfit(
                    tpSz === null
                      ? position
                      : {
                          szi: Math.sign(position.szi) * tpSz,
                          entryPx: position.entryPx,
                        },
                    state.px
                  )
                )}
              </span>
            </p>
          ) : null}
          <div className="grid gap-2">
            <div className="flex gap-2">
              <Label htmlFor="chart-target-size" className="sr-only">
                How much comes off
              </Label>
              <Input
                id="chart-target-size"
                inputMode="decimal"
                autoFocus
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") submit()
                }}
                aria-invalid={!valid}
              />
              <Select
                value={unit}
                onValueChange={(next) => {
                  const nextUnit = next as "pct" | "usd"
                  if (valid) {
                    setAmount(
                      nextUnit === "usd"
                        ? String(Number((coins * state.px).toFixed(2)))
                        : String(Number(((coins / held) * 100).toFixed(2)))
                    )
                  }
                  setUnit(nextUnit)
                }}
              >
                <SelectTrigger
                  className="w-fit"
                  aria-label="How size is measured"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pct">% of position</SelectItem>
                  <SelectItem value="usd">USD</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-1">
              {SHARE_PICKS.map((share) => (
                <Button
                  key={share}
                  type="button"
                  size="sm"
                  variant="outline"
                  className="flex-1 px-0"
                  onClick={() => {
                    setUnit("pct")
                    setAmount(String(share))
                  }}
                >
                  {share}%
                </Button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground tabular-nums">
              {valid
                ? tpSz === null
                  ? `The whole ${formatSize(held)} position closes.`
                  : `${formatSize(tpSz)} comes off, worth ${formatUsd(tpSz * state.px)} at the target.`
                : "Enter an amount greater than zero."}
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="flex-1"
              disabled={!valid}
              onClick={submit}
            >
              Set target
            </Button>
          </div>
        </div>
      </div>
    </>
  )
}
