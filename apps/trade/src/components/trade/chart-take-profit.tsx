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
    targets: Array<{ px: number; sz: number | null }>
    slPx: number | null
  }) => void
  onClose: () => void
}) {
  const held = Math.abs(position.szi)
  const [amount, setAmount] = React.useState("100")
  const [unit, setUnit] = React.useState<"pct" | "usd">("pct")
  const [touched, setTouched] = React.useState(false)
  const [attempted, setAttempted] = React.useState(false)
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

  const wholePositionTarget =
    position.targets.length === 1 && position.targets[0]?.sz === null
      ? position.targets[0]
      : null
  const covered = position.targets.reduce(
    (sum, target) => sum + (target.sz ?? held),
    0
  )
  // A lone whole-position target can be split. Fixed targets can only use the
  // coins the existing rows have not already claimed.
  const available = wholePositionTarget
    ? held
    : Math.max(0, held - covered)
  const typed = Number(amount.trim())
  const coins =
    unit === "pct" ? available * (typed / 100) : typed / state.px
  const validAmount = Number.isFinite(coins) && coins > 0
  const valid =
    position.targets.length < 3 &&
    validAmount &&
    coins <= available * (1 + 1e-9)
  const showInvalid = !valid && (touched || attempted)

  const submit = () => {
    if (!valid) {
      setAttempted(true)
      return
    }
    const existing = position.targets.map((target) => ({
      px: target.px,
      sz: target.sz,
    }))
    const targets = wholePositionTarget
      ? held - coins > held * 1e-9
        ? [
            { px: wholePositionTarget.px, sz: held - coins },
            { px: state.px, sz: coins },
          ]
        : [{ px: state.px, sz: null }]
      : [
          ...existing,
          {
            px: state.px,
            sz:
              existing.length === 0 && coins >= held * (1 - 1e-9)
                ? null
                : coins,
          },
        ]
    onSave({
      targets: targets.sort((left, right) => left.px - right.px),
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
                    {
                      szi: Math.sign(position.szi) * coins,
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
                onBlur={() => setTouched(true)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") submit()
                }}
                aria-invalid={showInvalid}
                aria-describedby="chart-target-help"
              />
              <Select
                value={unit}
                onValueChange={(next) => {
                  const nextUnit = next as "pct" | "usd"
                  if (
                    validAmount &&
                    (nextUnit === "usd" || available > 0)
                  ) {
                    setAmount(
                      nextUnit === "usd"
                        ? String(Number((coins * state.px).toFixed(2)))
                        : String(
                            Number(((coins / available) * 100).toFixed(2))
                          )
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
                  <SelectItem value="pct">
                    {position.targets.length === 0
                      ? "% of position"
                      : "% of remaining"}
                  </SelectItem>
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
            <p
              id="chart-target-help"
              className="text-xs text-muted-foreground tabular-nums"
            >
              {position.targets.length >= 3
                ? "Three targets is the maximum."
                : !validAmount
                  ? "Enter an amount greater than zero."
                  : coins > available * (1 + 1e-9)
                    ? `${formatSize(available)} is available for another target.`
                    : wholePositionTarget && coins < held * (1 - 1e-9)
                      ? `${formatSize(coins)} comes off here. The existing target keeps ${formatSize(held - coins)}.`
                      : position.targets.length === 0 &&
                          coins >= held * (1 - 1e-9)
                        ? `The whole ${formatSize(held)} position closes.`
                        : `${formatSize(coins)} comes off, worth ${formatUsd(coins * state.px)} at the target.`}
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
              onClick={submit}
            >
              {position.targets.length === 0 ? "Set target" : "Add target"}
            </Button>
          </div>
        </div>
      </div>
    </>
  )
}
