import * as React from "react"
import { GripVerticalIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { DisabledReason } from "@/components/ui/disabled-reason"
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
import { type MarketRow } from "@/lib/protocols/contracts"
import { bracketPrice } from "@/lib/trade/brackets"
import { affordableCoins, coinsForRisk } from "@/lib/trade/risk-size"
import { formatPrice, formatUsd, formatUsdRounded } from "@/lib/trade/format"
import { useLiveFigures } from "@/lib/trade/live-market"
import { isMarketable, type PaperSide } from "@/lib/trade/paper"
import type { QuickOrderPrefs } from "@/lib/trade/quick-order"
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

export type QuickOrderState = {
  side: PaperSide
  px: number
  x: number
  y: number
}

const PANEL_WIDTH = 288
/** What the window takes at its tallest, for keeping it on screen. */
const PANEL_HEIGHT = 520
const EDGE = 8

/**
 * How size is being said: in dollars, as a share of free cash, or as the share
 * of the whole wallet the trade is allowed to lose.
 *
 * Deliberately no "in coins". Everything else on these screens is in dollars,
 * and a size in coins is one more thing to convert in your head before you can
 * tell whether the order is the size you meant.
 */
type SizeUnit = "usd" | "pct" | "risk"

const SHARE_PICKS = [10, 25, 50, 100]

export function ChartQuickOrder({
  quick,
  market,
  /** The wallet this order will go to — not always the one whose lines you are looking at. */
  wallet,
  /** Cash free to put behind a trade, from the account panel's own figures. */
  free,
  /** Everything the wallet is worth — cash and open positions together. */
  equity,
  prefs,
  onPlace,
  onRemember,
  onClose,
}: {
  quick: QuickOrderState
  market: MarketRow
  wallet: string
  free: number
  equity: number
  /** How the window was set up the last time it placed an order. */
  prefs: QuickOrderPrefs
  /**
   * Sends the order and returns. Nothing here waits on the exchange: the
   * window shuts on the press, and the chart draws the order while the answer
   * is still on its way.
   */
  onPlace: (input: {
    side: PaperSide
    px: number
    sz: number
    leverage: number
    marginMode: "cross" | "isolated" | null
    reduceOnly: boolean
    tpPx: number | null
    slPx: number | null
  }) => void
  /**
   * Keeps how this order was sized, once it has gone. Called with the window's
   * own settings rather than the order, so the next right-click opens the way
   * this one was left.
   */
  onRemember: (prefs: QuickOrderPrefs) => void
  onClose: () => void
}) {
  const maxLeverage = Math.max(
    1,
    Math.floor(market.maxLeverage ?? (market.marginModes.length > 0 ? 100 : 1))
  )

  // What the market costs right now. An order asking for a price already
  // through it is taken immediately at this instead, so this — not the level
  // clicked — is the price the stop and the target have to be measured from.
  const live = useLiveFigures(market.key)
  const mark = live?.price ?? market.price
  const takenNow = isMarketable(quick.side, quick.px, mark)
  const entryPx = takenNow ? mark : quick.px

  // How this window was left the last time it placed something. Every field
  // below opens on that answer, so a way of sizing trades is chosen once
  // rather than retyped on every right-click.
  const [sizeInput, setSizeInput] = React.useState(prefs.size)
  const [sizeUnit, setSizeUnit] = React.useState<SizeUnit>(prefs.sizeUnit)
  // Opens at 1× until somebody chooses otherwise: borrowed money is something
  // to reach for on purpose, not the setting a window hands you before you have
  // read it. At 1× a coin has to go to nothing to lose the trade; at 5× a fifth
  // of the way there does it. A remembered leverage is still capped by what
  // this market allows, which is not the same on every coin.
  const [leverage, setLeverage] = React.useState(
    Math.max(1, Math.min(prefs.leverage, maxLeverage))
  )
  const [marginMode, setMarginMode] = React.useState(prefs.marginMode)
  const [bracketOn, setBracketOn] = React.useState(prefs.bracketOn)
  const [stopPct, setStopPct] = React.useState(prefs.stopPct)
  const [targetPct, setTargetPct] = React.useState(prefs.targetPct)
  const [reduceOnly, setReduceOnly] = React.useState(false)
  // Real money only: the first press turns the button into the question, the
  // second press answers it. Any edit takes the question back.

  const buy = quick.side === "buy"

  // ----- Where the window sits, and moving it ------------------------------

  const [at, setAt] = React.useState(() => ({
    x: Math.max(
      EDGE,
      Math.min(quick.x, window.innerWidth - PANEL_WIDTH - EDGE)
    ),
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

  // ----- What was typed, in coins -----------------------------------------

  const typed = Number(sizeInput)
  const amount = Number.isFinite(typed) && typed > 0 ? typed : 0

  // What that actually comes to, in dollars. "25% of free" is not an amount of
  // anything on its own, so the box says the amount back at the price this
  // order would get. Only when the box is not already in dollars, where it
  // would be the same number twice.

  // **Risking a share of the wallet cannot be done without a stop.** The stop
  // is what turns "1% of the wallet" into an amount of coin: it is the
  // distance the trade is allowed to move against you, and without one there
  // is nothing to divide the money by. So choosing it switches the stop on and
  // holds it on.
  const byRisk = sizeUnit === "risk"
  const wantsBracket = bracketOn || byRisk

  const stopPx = wantsBracket
    ? bracketPrice({ entryPx, percent: stopPct, long: buy, winning: false })
    : null
  const targetPx = wantsBracket
    ? bracketPrice({ entryPx, percent: targetPct, long: buy, winning: true })
    : null
  const badStop = wantsBracket && stopPx === null
  const badTarget = wantsBracket && targetPx === null
  const bracketBad = badStop || badTarget

  // How much coin the money at risk pays for. The dollars themselves are not
  // said back: the box already shows what the order comes to, and a second
  // figure beside it was one more number to read on a window that is mostly
  // numbers already.
  const wantedCoin = byRisk
    ? stopPx === null
      ? 0
      : coinsForRisk({ equity, riskPct: amount, entryPx, stopPx })
    : sizeUnit === "usd"
      ? amount / entryPx
      : // A share of the account is a share of what it can put behind a
        // trade — so leverage is part of it, the way it is everywhere else.
        (free * Math.min(amount, 100) * leverage) / 100 / entryPx

  // A stop half a percent away turns a 1% risk into a position twenty times
  // the wallet, which the exchange refuses. Capped to what the cash reaches
  // instead — the box shows the figure it settled on, which is the answer to
  // "how big will this be" without a sentence about it.
  const canAfford = affordableCoins({ free, leverage, entryPx })
  const sizeCoin =
    byRisk && wantedCoin > canAfford && canAfford > 0 ? canAfford : wantedCoin

  // What that actually comes to, in dollars. "25% of free" is not an amount of
  // anything on its own, so the box says the amount back at the price this
  // order would get. Only when the box is not already in dollars, where it
  // would be the same number twice.
  const orderUsd = sizeCoin * entryPx
  const shownUsd =
    sizeUnit !== "usd" && orderUsd > 0 ? formatUsdRounded(orderUsd) : null

  const ready = sizeCoin > 0 && !bracketBad

  const submit = () => {
    if (!ready) return
    // Sent and let go of. The window shuts on the press rather than sitting
    // there spinning through a round trip to the exchange — the order is
    // already on the chart, and a refusal arrives as a toast if one comes.
    onPlace({
      side: quick.side,
      px: quick.px,
      sz: sizeCoin,
      leverage,
      marginMode: market.marginModes.length > 0 ? marginMode : null,
      reduceOnly,
      tpPx: targetPx,
      slPx: stopPx,
    })
    // Kept only once an order has really gone, the way the DCA window keeps
    // its settings — so a number half-typed and thought better of is not what
    // the next right-click opens on.
    onRemember({
      sizeUnit,
      size: sizeInput,
      leverage,
      marginMode,
      bracketOn,
      stopPct,
      targetPct,
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
        aria-label={`${buy ? "Buy" : "Sell"} ${market.symbol} at ${formatPrice(quick.px)}`}
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

        <div className="grid gap-4 p-3">
          <div className="grid gap-2">
            <div className="flex items-start gap-2">
              <Label htmlFor="quick-size" className="sr-only">
                Size
              </Label>
              {/* The dollars sit inside the box, faint, at its right edge.
                  "32% of free" is not an amount of anything on its own, and
                  the answer belongs where the question is being typed rather
                  than on a line under it. Only when the box is not already in
                  dollars, and never through the typing. */}
              <div className="relative flex-1">
                <Input
                  id="quick-size"
                  inputMode="decimal"
                  autoFocus
                  value={sizeInput}
                  onChange={(event) => setSizeInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") submit()
                  }}
                  // Room kept for however long the figure is, so a big
                  // account's "$1,204,500" cannot be typed underneath.
                  style={
                    shownUsd
                      ? { paddingRight: `${shownUsd.length + 2}ch` }
                      : undefined
                  }
                  className="w-full"
                  placeholder="Size"
                  aria-describedby={shownUsd ? "quick-size-usd" : undefined}
                />
                {shownUsd ? (
                  <span
                    id="quick-size-usd"
                    className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground tabular-nums"
                  >
                    {shownUsd}
                  </span>
                ) : null}
              </div>
              <Select
                value={sizeUnit}
                onValueChange={(next) => {
                  setSizeUnit(next as SizeUnit)
                }}
              >
                <SelectTrigger
                  className="w-fit"
                  aria-label="How size is measured"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="usd">USD</SelectItem>
                  <SelectItem value="pct">% of free</SelectItem>
                  <SelectItem value="risk">Risk %</SelectItem>
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
                <span className="text-xs text-muted-foreground tabular-nums">
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
                }}
                aria-label="Leverage"
              />
            </div>
          ) : null}

          {market.marginModes.length > 0 ? (
            <div className="grid gap-2">
              <Label htmlFor="quick-margin-mode">Margin</Label>
              <Select
                value={marginMode}
                onValueChange={(next) =>
                  setMarginMode(next as "cross" | "isolated")
                }
              >
                <SelectTrigger id="quick-margin-mode">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="isolated">Isolated margin</SelectItem>
                  <SelectItem value="cross">Shared (cross) margin</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ) : null}

          <div className="grid gap-2">
            <div className="flex items-center gap-2">
              <DisabledReason
                disabled={byRisk}
                reason="Risk % works out the amount from the stop, so an order sized that way always has one."
              >
                <Checkbox
                  id="quick-bracket"
                  checked={wantsBracket}
                  disabled={byRisk}
                  onCheckedChange={(next) => {
                    setBracketOn(next === true)
                  }}
                />
              </DisabledReason>
              <Label htmlFor="quick-bracket">Stop loss and take profit</Label>
            </div>
            {wantsBracket ? (
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
                  <span className="text-xs text-muted-foreground tabular-nums">
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
                  <span className="text-xs text-muted-foreground tabular-nums">
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
              }}
            />
            <Label htmlFor="quick-reduce">Only reduce what I hold</Label>
          </div>

          <Button
            type="button"
            onClick={submit}
            disabled={!ready}
            className={cn(
              "w-full text-white",
              buy
                ? "bg-emerald-600 hover:bg-emerald-600/90"
                : "bg-red-600 hover:bg-red-600/90"
            )}
          >
            {`${buy ? "Buy" : "Sell"} ${market.symbol}`}
          </Button>
        </div>
      </div>
    </>
  )
}
