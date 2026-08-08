import * as React from "react"
import { GripVerticalIcon, Loader2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import type { MarketRow } from "@/lib/protocols/contracts"
import { formatPrice, formatUsd } from "@/lib/trade/format"
import { useLiveFigures } from "@/lib/trade/live-market"
import { isMarketable, type PaperSide } from "@/lib/trade/paper"
import { cn } from "@/lib/utils"

/**
 * The order window a right-click opens, floating over the chart at the level
 * that was clicked.
 *
 * It stays a window rather than a docked form for one reason: the price is
 * already decided by where you pointed, so everything left is size and
 * protection, and both belong next to the level they apply to. Its header is a
 * handle, because the window opens exactly over the price it is about to trade
 * and sometimes you want to see that price.
 */

export type QuickOrderState = { side: PaperSide; px: number; x: number; y: number }

const PANEL_WIDTH = 288
/** What the window takes at its tallest, for keeping it on screen. */
const PANEL_HEIGHT = 520
const EDGE = 8

/** How size is being said: in dollars, in coins, or as a share of the account. */
type SizeUnit = "usd" | "coin" | "pct"

const SHARE_PICKS = [10, 25, 50, 100]

export function ChartQuickOrder({
  quick,
  market,
  /** The wallet this order will go to — not always the one whose lines you are looking at. */
  wallet,
  /** Real money: the window asks first, saying the order back in dollars. */
  real,
  /** Cash free to put behind a trade, from the account panel's own figures. */
  free,
  busy,
  onPlace,
  onClose,
}: {
  quick: QuickOrderState
  market: MarketRow
  wallet: string
  real: boolean
  free: number
  busy: boolean
  onPlace: (input: {
    side: PaperSide
    px: number
    sz: number
    leverage: number
    reduceOnly: boolean
    tpPx: number | null
    slPx: number | null
  }) => Promise<boolean>
  onClose: () => void
}) {
  const maxLeverage = Math.max(1, Math.floor(market.maxLeverage ?? 1))

  // What the market costs right now. An order asking for a price already
  // through it is taken immediately at this instead, so this — not the level
  // clicked — is the price the stop and the target have to be measured from.
  const live = useLiveFigures(market.key)
  const mark = live?.price ?? market.price
  const takenNow = isMarketable(quick.side, quick.px, mark)
  const entryPx = takenNow ? mark : quick.px

  const [sizeInput, setSizeInput] = React.useState("")
  const [sizeUnit, setSizeUnit] = React.useState<SizeUnit>("usd")
  const [leverage, setLeverage] = React.useState(Math.min(5, maxLeverage))
  const [bracketOn, setBracketOn] = React.useState(false)
  const [stopPct, setStopPct] = React.useState("2")
  const [targetPct, setTargetPct] = React.useState("5")
  const [reduceOnly, setReduceOnly] = React.useState(false)
  // Real money only: the first press turns the button into the question, the
  // second press answers it. Any edit takes the question back.
  const [confirming, setConfirming] = React.useState(false)

  const buy = quick.side === "buy"

  // ----- Where the window sits, and moving it ------------------------------

  const [at, setAt] = React.useState(() => ({
    x: Math.max(EDGE, Math.min(quick.x, window.innerWidth - PANEL_WIDTH - EDGE)),
    y: Math.max(EDGE, Math.min(quick.y, window.innerHeight - PANEL_HEIGHT)),
  }))
  const dragRef = React.useRef<{ dx: number; dy: number } | null>(null)

  React.useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const grab = dragRef.current
      if (!grab) return
      setAt({
        x: Math.max(
          EDGE,
          Math.min(event.clientX - grab.dx, window.innerWidth - PANEL_WIDTH - EDGE)
        ),
        y: Math.max(EDGE, Math.min(event.clientY - grab.dy, window.innerHeight - 60)),
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

  // ----- What was typed, in coins -----------------------------------------

  const typed = Number(sizeInput)
  const amount = Number.isFinite(typed) && typed > 0 ? typed : 0
  const sizeCoin =
    sizeUnit === "coin"
      ? amount
      : sizeUnit === "usd"
        ? amount / entryPx
        : // A share of the account is a share of what it can put behind a
          // trade — so leverage is part of it, the way it is everywhere else.
          (free * Math.min(amount, 100) * leverage) / 100 / entryPx


  // Judged on the price each percentage works out to, not on the percentage
  // itself. Which side goes through zero depends on the direction of the
  // trade: a long's stop does, a short's target does — so testing "under a
  // hundred" against a fixed field refuses good numbers on one side and lets
  // impossible ones through on the other.
  const stop = Number(stopPct)
  const target = Number(targetPct)
  const priceAt = (pct: number, winning: boolean): number | null => {
    if (!Number.isFinite(pct) || pct <= 0) return null
    const up = winning === buy
    const px = entryPx * (up ? 1 + pct / 100 : 1 - pct / 100)
    return px > 0 ? px : null
  }

  const stopPx = bracketOn ? priceAt(stop, false) : null
  const targetPx = bracketOn ? priceAt(target, true) : null
  const badStop = bracketOn && stopPx === null
  const badTarget = bracketOn && targetPx === null
  const bracketBad = badStop || badTarget

  const ready = sizeCoin > 0 && !bracketBad && !busy

  const submit = async () => {
    if (!ready) return
    // Real money asks first: the same button, now carrying the order said
    // back in dollars. Nothing is sent until it is pressed again.
    if (real && !confirming) {
      setConfirming(true)
      return
    }
    const placed = await onPlace({
      side: quick.side,
      px: quick.px,
      sz: sizeCoin,
      leverage,
      reduceOnly,
      tpPx: targetPx,
      slPx: stopPx,
    })
    if (placed) onClose()
  }

  /** Any edit takes the confirm question back — it was about the old order. */
  const unconfirm = () => setConfirming(false)

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
        aria-label={`${buy ? "Buy" : "Sell"} ${market.symbol} at ${formatPrice(quick.px)}`}
        className="fixed z-50 w-72 rounded-xl border border-foreground/10 bg-card shadow-lg"
        style={{ left: at.x, top: at.y }}
        onPointerDown={(event) => event.stopPropagation()}
        onContextMenu={(event) => event.stopPropagation()}
      >
        <div
          className="flex cursor-grab items-center gap-2 border-b border-foreground/10 px-3 py-2 active:cursor-grabbing"
          onPointerDown={(event) => {
            dragRef.current = {
              dx: event.clientX - at.x,
              dy: event.clientY - at.y,
            }
          }}
        >
          <GripVerticalIcon className="size-4 shrink-0 text-muted-foreground" />
          <span
            className={cn(
              "text-sm font-semibold",
              buy
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-red-600 dark:text-red-400"
            )}
          >
            {buy ? "Buy limit" : "Sell limit"}
          </span>
          {/* Which wallet this lands in, and what it has to spend. The market
              and the price are already on screen behind this window; the
              wallet is not, and the chart may well be showing another one's
              lines — so it is named here, where the order is actually made. */}
          <span className="ml-auto flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
            <span className="min-w-0 truncate font-medium text-foreground">
              {wallet}
            </span>
            <span className="shrink-0 tabular-nums">· {formatUsd(free)}</span>
          </span>
        </div>

        {/* Typing anywhere takes a pending real-money confirm back — the
            question was about the order as it stood when it was asked. */}
        <div className="grid gap-4 p-3" onInput={unconfirm}>
          <div className="grid gap-2">
            <div className="flex items-start gap-2">
              <Label htmlFor="quick-size" className="sr-only">
                Size
              </Label>
              <Input
                id="quick-size"
                inputMode="decimal"
                autoFocus
                value={sizeInput}
                onChange={(event) => setSizeInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void submit()
                }}
                className="flex-1"
                placeholder="Size"
              />
              <Select
                value={sizeUnit}
                onValueChange={(next) => {
                  setSizeUnit(next as SizeUnit)
                  unconfirm()
                }}
              >
                <SelectTrigger className="w-fit" aria-label="How size is measured">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="usd">USD</SelectItem>
                  <SelectItem value="coin">{market.symbol}</SelectItem>
                  <SelectItem value="pct">% of free</SelectItem>
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
                    setSizeUnit("pct")
                    setSizeInput(String(share))
                    unconfirm()
                  }}
                >
                  {share}%
                </Button>
              ))}
            </div>
            {takenNow ? (
              // The level clicked is already past the market, so this is not
              // going to wait for anything. Better said here than discovered
              // after the fact.
              <p className="text-xs text-amber-600 dark:text-amber-400">
                Fills straight away at {formatPrice(mark)}.
              </p>
            ) : null}
          </div>

          {maxLeverage > 1 ? (
            <div className="grid gap-2">
              <div className="flex items-baseline justify-between gap-2">
                <Label htmlFor="quick-leverage">Leverage</Label>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {leverage}×
                </span>
              </div>
              <Slider
                id="quick-leverage"
                min={1}
                max={maxLeverage}
                step={1}
                value={[leverage]}
                onValueChange={([next]) => {
                  setLeverage(next)
                  unconfirm()
                }}
                aria-label="Leverage"
              />
            </div>
          ) : null}

          <div className="grid gap-2">
            <div className="flex items-center gap-2">
              <Checkbox
                id="quick-bracket"
                checked={bracketOn}
                onCheckedChange={(next) => {
                  setBracketOn(next === true)
                  unconfirm()
                }}
              />
              <Label htmlFor="quick-bracket">Stop loss and take profit</Label>
            </div>
            {bracketOn ? (
              <div className="flex gap-2">
                <div className="grid flex-1 gap-2">
                  <Label htmlFor="quick-stop" className="text-xs">
                    Stop %
                  </Label>
                  <Input
                    id="quick-stop"
                    inputMode="decimal"
                    value={stopPct}
                    onChange={(event) => setStopPct(event.target.value)}
                    aria-invalid={badStop}
                  />
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {stopPx && stopPx > 0 ? formatPrice(stopPx) : "—"}
                  </span>
                </div>
                <div className="grid flex-1 gap-2">
                  <Label htmlFor="quick-target" className="text-xs">
                    Target %
                  </Label>
                  <Input
                    id="quick-target"
                    inputMode="decimal"
                    value={targetPct}
                    onChange={(event) => setTargetPct(event.target.value)}
                    aria-invalid={badTarget}
                  />
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {targetPx && targetPx > 0 ? formatPrice(targetPx) : "—"}
                  </span>
                </div>
              </div>
            ) : null}
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="quick-reduce"
              checked={reduceOnly}
              onCheckedChange={(next) => {
                setReduceOnly(next === true)
                unconfirm()
              }}
            />
            <Label htmlFor="quick-reduce">Only reduce what I hold</Label>
          </div>

          {real && confirming ? (
            // The order said back in dollars — what real money asks for
            // before it moves. Pressing the button again is the answer.
            <p className="rounded-md bg-amber-500/10 px-2.5 py-2 text-xs text-amber-700 dark:text-amber-400">
              Real money in {wallet}: {buy ? "buy" : "sell"} about{" "}
              {formatUsd(sizeCoin * entryPx)} of {market.symbol}
              {takenNow
                ? `, filling straight away at about ${formatPrice(mark)}`
                : `, waiting at ${formatPrice(quick.px)}`}
              {bracketOn && stopPx && targetPx
                ? `, with a stop at ${formatPrice(stopPx)} and a target at ${formatPrice(targetPx)}`
                : ""}
              .
            </p>
          ) : null}

          <Button
            type="button"
            onClick={() => void submit()}
            disabled={!ready}
            className={cn(
              "w-full text-white",
              buy
                ? "bg-emerald-600 hover:bg-emerald-600/90"
                : "bg-red-600 hover:bg-red-600/90"
            )}
          >
            {busy ? <Loader2Icon className="size-4 animate-spin" /> : null}
            {real && confirming
              ? `Confirm — ${buy ? "buy" : "sell"} for real`
              : `${buy ? "Buy" : "Sell"} ${market.symbol}`}
          </Button>
        </div>
      </div>
    </>
  )
}
