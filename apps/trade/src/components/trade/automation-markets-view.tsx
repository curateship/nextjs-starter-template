import * as React from "react"
import { WorkflowIcon } from "lucide-react"

import type { NetworkId } from "@/lib/protocols/contracts"

import { WorkspacePanelHeader } from "@/components/shared/workspace-panel-header"
import { ScrollArea } from "@/components/ui/scroll-area"

import { Button } from "@/components/ui/button"
import { LoadingRow } from "@/components/ui/loading-row"
import {
  loadAutomationMarkets,
  type AutomationMarket,
} from "@/lib/api/flow-trading"
import { focusRing } from "@/lib/layout/focus-ring"
import { cn } from "@/lib/utils"

/**
 * Every coin an automation is trading, beside the wallets.
 *
 * **Why here and not in the market list on the left.** That panel lists one
 * network at a time — whichever the chart is showing — so a flow running on
 * the practice network is invisible from a mainnet page and the tab reads as
 * empty and broken. This list is built from the flows themselves, so it shows
 * what is actually being traded whatever the chart happens to be on.
 *
 * Each row says the coin, its wallet, and what it is doing: a ladder working,
 * a reason it has none yet, or a reason somebody has to clear. A coin waiting
 * for the right price and a coin that cannot trade at all both show nothing
 * happening anywhere else — this is where the difference is visible.
 */

/** How often it re-asks. Slow: nothing here changes in a hurry. */
const EVERY_MS = 6_000

export function AutomationMarketsView({
  network,
  onSelect,
  onCount,
}: {
  /** The network the page is showing. Coins on any other one are not listed. */
  network: NetworkId
  /** Charts the coin, the same as clicking it in the market list. */
  onSelect: (marketKey: string) => void
  /** How many rows there are, so the header can say so. */
  onCount?: (count: number) => void
}) {
  const [rows, setRows] = React.useState<AutomationMarket[] | null>(null)
  // Held in a ref so a new callback each render never restarts the timer.
  const onCountRef = React.useRef(onCount)
  React.useEffect(() => {
    onCountRef.current = onCount
  }, [onCount])

  React.useEffect(() => {
    let stopped = false
    let timer = 0

    const tick = async () => {
      try {
        const answer = await loadAutomationMarkets()
        if (!stopped) {
          setRows(answer)
          onCountRef.current?.(
            answer.filter((one) => one.marketKey.includes(`:${network}:`)).length
          )
        }
      } catch {
        // A read that failed is not "nothing is trading". Whatever is on
        // screen stays, and the next pass is seconds away.
      }
      if (stopped) return
      timer = window.setTimeout(() => void tick(), EVERY_MS)
    }

    void tick()
    return () => {
      stopped = true
      window.clearTimeout(timer)
    }
  }, [network])

  // Only this network's coins.
  //
  // **Because clicking one moves the whole screen.** A coin carries its own
  // network in this app, so charting a practice-network coin from a mainnet
  // page silently took the market list, the chart and the search box with it.
  // A list beside the mainnet markets that quietly swaps them for practice
  // ones is worse than a shorter list.
  const mine = (rows ?? []).filter((row) => row.marketKey.includes(`:${network}:`))
  const others = (rows ?? []).filter(
    (row) => !row.marketKey.includes(`:${network}:`)
  )
  const elsewhere = others.length
  const otherNetworkLabel = network === "mainnet" ? "Testnet" : "Mainnet"

  if (rows === null) return <LoadingRow label="Reading the automations" />

  if (rows.length === 0) {
    return (
      <p className="px-3 py-6 text-center text-xs text-muted-foreground">
        No automation is switched on, so nothing is being traded.
      </p>
    )
  }

  if (mine.length === 0) {
    return (
      <div className="grid gap-2 px-3 py-6 text-center">
        <p className="text-xs text-muted-foreground">
          {elsewhere} {elsewhere === 1 ? "coin is" : "coins are"} being traded
          on {otherNetworkLabel}.
        </p>
        <ShowTheOthers
          label={otherNetworkLabel}
          marketKey={others[0]?.marketKey}
          onSelect={onSelect}
        />
      </div>
    )
  }

  return (
    <div className="grid">
      {mine.map((row) => (
        <button
          key={`${row.automationId}:${row.marketKey}`}
          type="button"
          onClick={() => onSelect(row.marketKey)}
          className={cn(
            "grid gap-0.5 border-b px-3 py-2 text-left last:border-b-0 hover:bg-accent/50",
            focusRing
          )}
        >
          <div className="flex items-baseline justify-between gap-2">
            <span className="flex min-w-0 items-center gap-1.5">
              {/* Colour AND words, as everywhere else: the dot adds to the
                  sentence under it and is never the signal on its own. */}
              <span
                className={cn(
                  "size-1.5 shrink-0 rounded-full",
                  row.paused
                    ? "bg-muted-foreground"
                    : row.working
                      ? "bg-emerald-500"
                      : row.problem
                        ? "bg-amber-500"
                        : "bg-muted-foreground/40"
                )}
                aria-hidden
              />
              <span className="truncate text-xs font-medium">{row.coin}</span>
            </span>
            <span
              className={cn(
                "shrink-0 text-[11px]",
                row.real
                  ? "text-amber-700 dark:text-amber-400"
                  : "text-muted-foreground"
              )}
            >
              {row.walletLabel}
            </span>
          </div>
          <p className="truncate text-[11px] leading-4 text-muted-foreground">
            {row.paused
              ? "Paused"
              : row.working
                ? "Ladder working"
                : (row.waiting ?? "Waiting to be looked at")}
          </p>
        </button>
      ))}
      {/* Said rather than silently dropped. A panel that hides coins because
          the chart is on another network, and never mentions it, reads as a
          flow that has stopped trading them. */}
      {elsewhere === 0 ? null : (
        <div className="flex items-center justify-between gap-2 px-3 py-2">
          <p className="text-[11px] text-muted-foreground">
            {elsewhere} more on {otherNetworkLabel}.
          </p>
          <ShowTheOthers
            label={otherNetworkLabel}
            marketKey={others[0]?.marketKey}
            onSelect={onSelect}
          />
        </div>
      )}
    </div>
  )
}

/**
 * The automations' coins as a panel of its own, under the wallets.
 *
 * **A panel is the card on this screen.** Its own rounded edges, its own
 * header, a gap between it and the wallets above — the same anatomy as the
 * market list and the activity panel. It was nested inside the wallets' card
 * for a build, which put a card inside a card and let the list grow to eight
 * thousand pixels tall instead of scrolling inside its own space.
 */
export function AutomationMarketsPanel({
  network,
  onSelectMarket,
}: {
  /** The network the whole page is showing. */
  network: NetworkId
  onSelectMarket: (marketKey: string) => void
}) {
  const [count, setCount] = React.useState<number | null>(null)
  return (
    // A column that fills its panel, so the header keeps its height and the
    // list takes what is left. Without this the list had no ceiling to scroll
    // against and simply grew — measured at eight thousand pixels.
    <div className="flex h-full min-h-0 flex-col">
      <WorkspacePanelHeader
        icon={<WorkflowIcon className="size-4" />}
        title="Automation"
        meta={
          count === null
            ? undefined
            : `${count} ${count === 1 ? "coin" : "coins"}`
        }
      />
      <ScrollArea className="min-h-0 flex-1" viewportClassName="[&>div]:block!">
        <AutomationMarketsView
          network={network}
          onSelect={onSelectMarket}
          onCount={setCount}
        />
      </ScrollArea>
    </div>
  )
}

/**
 * The way over to the other network's coins.
 *
 * **Deliberate, and the only door left.** Charting any coin moves the whole
 * screen to that coin's network, which used to happen by accident from this
 * list — a click on a practice coin quietly took the mainnet market list with
 * it. Filtering the list stopped that and closed the only way across, so this
 * puts one back as a button somebody means to press.
 */
function ShowTheOthers({
  label,
  marketKey,
  onSelect,
}: {
  label: string
  marketKey: string | undefined
  onSelect: (marketKey: string) => void
}) {
  if (!marketKey) return null
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      onClick={() => onSelect(marketKey)}
    >
      Show {label}
    </Button>
  )
}
