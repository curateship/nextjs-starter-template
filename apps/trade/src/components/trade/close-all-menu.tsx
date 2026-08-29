import * as React from "react"
import { ChevronDownIcon, XIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import type { MarketRow } from "@/lib/protocols/contracts"
import { showErrorToast } from "@/lib/toast/error-toast"
import { formatUsd } from "@/lib/trade/format"
import { useLiveMarks } from "@/lib/trade/live-market"
import { positionValue, type TradeOrder, type TradePosition } from "@/lib/trade/paper"
import type { SmartGrid, SmartLadder } from "@/lib/trade/smart-plan"

/** What one press can take off the screen. All three are ticked to begin with. */
export type CloseAllPick = {
  positions: boolean
  watched: boolean
  smart: boolean
}

const ALL_TICKED: CloseAllPick = { positions: true, watched: true, smart: true }

/** "3 ladders and 2 grids", "1 ladder" — however many of each there are. */
function countedWords(ladders: number, grids: number): string {
  const said: string[] = []
  if (ladders > 0) said.push(`${ladders} ladder${ladders === 1 ? "" : "s"}`)
  if (grids > 0) said.push(`${grids} grid${grids === 1 ? "" : "s"}`)
  return said.join(" and ")
}

/**
 * The emergency button, and the three things it can take off at once.
 *
 * **One press opens it, a second press does it.** Positions, watched prices
 * and smart orders all start ticked, because the reason somebody reaches for
 * this button is that they want to be out of everything. Untick what should
 * stay: a fast market is exactly when somebody wants their ladders stopped
 * without selling what those ladders already bought.
 *
 * **The words under the ticks follow the ticks.** Three different things can
 * happen here and each one is reasonable to assume the other way round —
 * stopping a ladder sells nothing, closing a position leaves waiting orders
 * that can buy straight back in, and calling a ladder off throws its plan
 * away. Only the sentences that apply to what is ticked are shown, so the
 * question stays short enough to actually read.
 *
 * The list is drawn only while the menu is open, so the live prices behind the
 * real-money figure are subscribed to only then. Watched from the panel, a
 * tick a second would redraw every row of every table behind a menu nobody has
 * opened.
 */
export function CloseAllMenu({
  positions,
  managed,
  watched,
  smart,
  restingOrders,
  markets,
  realWallets,
  busy,
  onConfirm,
}: {
  positions: readonly TradePosition[]
  /**
   * How many of those positions a listed ladder or grid is running. Closed
   * with the rest, but the Positions tab does not list them — the Smart
   * orders panel does — so the count on the row would otherwise look wrong.
   */
  managed: number
  /** Watched prices wearing an order's clothes — see `watchOrders`. */
  watched: readonly TradeOrder[]
  /** Ladders and grids you placed — see `laddersAndGridsYouPlaced`. */
  smart: readonly (SmartLadder | SmartGrid)[]
  /**
   * Plain orders still waiting, on an exchange or inside this app. Never
   * closed by this button, only counted, because one of them filling is how a
   * position comes straight back after everything was sold.
   */
  restingOrders: number
  markets: ReadonlyMap<string, MarketRow>
  /**
   * The wallets that spend real money. Read off the wallet rather than off a
   * position, because a ladder that has bought nothing yet still has real
   * rungs resting on an exchange.
   */
  realWallets: ReadonlySet<string>
  busy: boolean
  onConfirm: (picked: CloseAllPick) => void
}) {
  const [open, setOpen] = React.useState(false)
  const [picked, setPicked] = React.useState<CloseAllPick>(ALL_TICKED)

  // Every opening starts with all three ticked. Last time's answer was about
  // last time's market, and this button is pressed in a hurry.
  function openMenu(next: boolean) {
    if (next) setPicked(ALL_TICKED)
    setOpen(next)
  }

  return (
    <Popover open={open} onOpenChange={openMenu}>
      <PopoverTrigger asChild>
        {/* It wears the grey the chart's own toolbar buttons wear, and an X
            rather than the bin the Journal's Remove uses — the two sit side by
            side on the Journal tab, and one icon meaning "throw these records
            away" and "sell everything I own" at once is how a fast press goes
            to the wrong one. */}
        <Button
          type="button"
          variant="outline"
          className="bg-muted"
          disabled={busy}
        >
          <XIcon className="size-4" />
          Close all
          <ChevronDownIcon className="size-3.5 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 gap-0 p-2">
        <CloseAllChoices
          positions={positions}
          managed={managed}
          watched={watched}
          smart={smart}
          restingOrders={restingOrders}
          markets={markets}
          realWallets={realWallets}
          picked={picked}
          onPick={setPicked}
          onConfirm={() => {
            onConfirm(picked)
            setOpen(false)
          }}
        />
      </PopoverContent>
    </Popover>
  )
}

/**
 * The ticks, the sentences and the button, split out so the live prices are
 * only subscribed to while the menu is on screen.
 */
export function CloseAllChoices({
  positions,
  managed,
  watched,
  smart,
  restingOrders,
  markets,
  realWallets,
  picked,
  onPick,
  onConfirm,
}: {
  positions: readonly TradePosition[]
  managed: number
  watched: readonly TradeOrder[]
  smart: readonly (SmartLadder | SmartGrid)[]
  restingOrders: number
  markets: ReadonlyMap<string, MarketRow>
  realWallets: ReadonlySet<string>
  picked: CloseAllPick
  onPick: (picked: CloseAllPick) => void
  onConfirm: (doing: CloseAllPick) => void
}) {
  const marks = useLiveMarks(positions.map((one) => one.marketKey))

  const ladders = smart.filter((one) => one.kind === "dca").length
  const grids = smart.length - ladders

  // What the real positions are worth at today's price, and how many other
  // real things one press would take off. Both are named before the press,
  // because "2 real" and "$40,000 of real money" are not the same warning.
  let realPositions = 0
  let realHolding = 0
  for (const position of positions) {
    if (!position.live) continue
    realPositions += 1
    const mark =
      marks.get(position.marketKey) ??
      markets.get(position.marketKey)?.price ??
      position.entryPx
    realHolding += positionValue(position, mark)
  }
  const realWatched = watched.filter((one) =>
    realWallets.has(one.walletId)
  ).length
  const realSmart = smart.filter((one) => realWallets.has(one.walletId)).length

  const rows = [
    {
      key: "positions" as const,
      label: "Positions",
      count: positions.length,
      real: realPositions,
    },
    {
      key: "watched" as const,
      label: "Watched",
      count: watched.length,
      real: realWatched,
    },
    { key: "smart" as const, label: "Smart", count: smart.length, real: realSmart },
  ]

  // Only what is both ticked and actually there. A sentence about ladders on a
  // screen with no ladders is one more line to read in a hurry for nothing.
  const doing = {
    positions: picked.positions && positions.length > 0,
    watched: picked.watched && watched.length > 0,
    smart: picked.smart && smart.length > 0,
  }
  const nothing = !doing.positions && !doing.watched && !doing.smart

  const said: string[] = []
  if (doing.positions) {
    said.push(
      positions.length === 1
        ? "The position is closed at whatever its market costs right now, and whatever it made or lost is banked."
        : `All ${positions.length} positions are closed at whatever their markets cost right now, and whatever they made or lost is banked.`
    )
  }
  if (doing.watched) {
    said.push(
      watched.length === 1
        ? "The watched price is called off, so nothing is bought at it and its line leaves the chart."
        : `All ${watched.length} watched prices are called off, so nothing is bought at them and their lines leave the chart.`
    )
  }
  if (doing.smart) {
    said.push(
      `${countedWords(ladders, grids)} ${smart.length === 1 ? "stops" : "stop"}, and every rung and level still waiting is called off. What they already bought stays open with its stop still under it.`
    )
    if (ladders > 0) {
      said.push(
        "A ladder's waiting rungs were its plan, and calling them off ends that ladder for good — another one means setting it up from scratch."
      )
    }
  }
  // Why the row can say 5 while the Positions tab says 4. The tab leaves out
  // a coin a ladder or grid is running, and this closes it anyway.
  if (doing.positions && managed > 0) {
    said.push(
      managed === 1
        ? "1 of them is a coin a ladder or grid is running. It is listed in the Smart orders panel rather than the Positions tab, and it closes with the rest."
        : `${managed} of them are coins a ladder or grid is running. They are listed in the Smart orders panel rather than the Positions tab, and they close with the rest.`
    )
  }
  // The gap that makes a sold-out account hold coins again a minute later.
  // "Waiting", not "resting on the exchange": a practice wallet's orders wait
  // inside this app and no exchange has ever heard of them.
  if (doing.positions && restingOrders > 0) {
    said.push(
      restingOrders === 1
        ? "1 waiting order is left alone, and it can buy back in if it fills."
        : `${restingOrders} waiting orders are left alone, and any of them can buy back in if they fill.`
    )
  }

  // Counted across only what is ticked: naming money that this press is not
  // going to touch is the same lie as not naming money that it is.
  const realCount =
    (doing.positions ? realPositions : 0) +
    (doing.watched ? realWatched : 0) +
    (doing.smart ? realSmart : 0)
  const realSaid =
    realCount === 0
      ? null
      : `${realCount === 1 ? "One of them is" : `${realCount} of them are`} on real money.${
          doing.positions && realHolding > 0
            ? ` The real ${realPositions === 1 ? "position is" : "positions are"} holding ${formatUsd(realHolding)} right now.`
            : ""
        }`

  return (
    <>
      <div className="grid">
        {rows.map((row) => (
          <div
            key={row.key}
            className="flex h-7 items-center gap-2 rounded-md px-1.5 hover:bg-muted/60"
          >
            <Checkbox
              id={`close-all-${row.key}`}
              checked={picked[row.key]}
              onCheckedChange={(checked) =>
                onPick({ ...picked, [row.key]: checked === true })
              }
            />
            <label
              htmlFor={`close-all-${row.key}`}
              className="min-w-0 flex-1 truncate text-xs font-medium"
            >
              {row.label}
            </label>
            {/* "5 real" when every one of them is, never "5, 5 real". The
                second number only earns its place when it differs. */}
            <span className="text-xs text-muted-foreground tabular-nums">
              {row.count === 0
                ? "None"
                : row.real === row.count
                  ? `${row.count} real`
                  : row.real > 0
                    ? `${row.count}, ${row.real} real`
                    : row.count}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-2 -mx-2 border-t px-3 pt-2 text-xs text-muted-foreground">
        {nothing ? (
          <p>Nothing is ticked, so this press would do nothing.</p>
        ) : (
          <>
            {said.map((line) => (
              <p key={line} className="mb-1 last:mb-0">
                {line}
              </p>
            ))}
            {realSaid ? (
              <p className="mb-1 font-medium text-foreground">{realSaid}</p>
            ) : null}
            <p>This cannot be undone.</p>
          </>
        )}
      </div>

      {/* Never greyed out when nothing is ticked. A faded button cannot say
          why it is off, and a toast can. */}
      <Button
        type="button"
        variant="destructive"
        className="mt-2 w-full"
        onClick={() => {
          if (nothing) {
            showErrorToast(
              "Nothing is ticked. Tick Positions, Watched or Smart first."
            )
            return
          }
          onConfirm(doing)
        }}
      >
        Confirm close all
      </Button>
    </>
  )
}
