import { pct, price as fmtPrice, toneClass } from "@/components/backtest/backtest-format"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { BotMarketState } from "@/lib/api/bots"
import type { MarketRow } from "@/lib/hl/hooks"
import { cn } from "@/lib/utils"

type MarketView = {
  coin: string
  state: BotMarketState | null
  markPrice: number
  dayChangePct: number | null
  position: { szi: number; entryPx: number } | null
  uPnl: number | null
}

/**
 * Left rail of the bot workspace: the bot's markets in two tabs. "Active" lists
 * only the markets currently holding a position; "Markets" lists every market
 * the bot runs. Clicking a row makes it the active market that the chart, order
 * controls, and activity follow.
 */
export function BotMarketsPanel({
  markets,
  states,
  marketRows,
  selectedMarket,
  onSelect,
}: {
  markets: string[]
  states: BotMarketState[]
  marketRows: MarketRow[]
  selectedMarket: string
  onSelect: (market: string) => void
}) {
  const views: MarketView[] = markets.map((coin) => {
    const state = states.find((row) => row.market === coin) ?? null
    const row = marketRows.find((market) => market.coin === coin)
    const markPrice = Number(row?.markPx ?? 0)
    const dayChangePct =
      row && Number(row.prevDayPx) > 0
        ? (Number(row.markPx) / Number(row.prevDayPx) - 1) * 100
        : null
    const rawPosition = state?.paper_position ?? null
    const position =
      rawPosition && Number(rawPosition.szi) !== 0 ? rawPosition : null
    const uPnl =
      position && markPrice > 0
        ? (markPrice - Number(position.entryPx)) * Number(position.szi)
        : null
    return { coin, state, markPrice, dayChangePct, position, uPnl }
  })

  const active = views.filter((view) => view.position)

  return (
    <Tabs
      defaultValue="active"
      className="flex h-full min-h-0 flex-col gap-0"
    >
      <div className="p-2">
        <TabsList>
          <TabsTrigger value="active" className="text-xs font-medium">
            Active{active.length ? ` (${active.length})` : ""}
          </TabsTrigger>
          <TabsTrigger value="all" className="text-xs font-medium">
            Markets ({views.length})
          </TabsTrigger>
        </TabsList>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <TabsContent value="active" className="m-0">
          {active.length === 0 ? (
            <Empty text="No open positions." />
          ) : (
            <div className="flex flex-col">
              {active.map((view) => (
                <MarketRowButton
                  key={view.coin}
                  view={view}
                  selected={view.coin === selectedMarket}
                  onSelect={onSelect}
                  showPosition
                />
              ))}
            </div>
          )}
        </TabsContent>
        <TabsContent value="all" className="m-0">
          <div className="flex flex-col">
            {views.map((view) => (
              <MarketRowButton
                key={view.coin}
                view={view}
                selected={view.coin === selectedMarket}
                onSelect={onSelect}
              />
            ))}
          </div>
        </TabsContent>
      </ScrollArea>
    </Tabs>
  )
}

const STATUS_DOT: Record<string, string> = {
  running: "bg-emerald-500",
  starting: "bg-amber-500",
  paused: "bg-amber-500",
  error: "bg-red-500",
  killed: "bg-red-500",
  stopped: "bg-muted-foreground/40",
}

function MarketRowButton({
  view,
  selected,
  onSelect,
  showPosition = false,
}: {
  view: MarketView
  selected: boolean
  onSelect: (market: string) => void
  showPosition?: boolean
}) {
  const long = view.position ? view.position.szi > 0 : false
  return (
    <button
      type="button"
      onClick={() => onSelect(view.coin)}
      className={cn(
        "flex items-center justify-between gap-2 border-b px-3 py-2 text-left hover:bg-muted/50",
        selected && "bg-muted"
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <span
          className={cn(
            "size-1.5 shrink-0 rounded-full",
            STATUS_DOT[view.state?.status ?? "stopped"] ??
              "bg-muted-foreground/40"
          )}
          title={view.state?.status ?? "stopped"}
        />
        <div className="min-w-0">
          <div className="font-mono text-sm font-semibold">{view.coin}</div>
          {showPosition && view.position ? (
            <div className="text-[11px] text-muted-foreground">
              <span className={long ? "text-emerald-600" : "text-red-500"}>
                {long ? "Long" : "Short"}
              </span>{" "}
              {Math.abs(view.position.szi)} @ {fmtPrice(view.position.entryPx)}
            </div>
          ) : (
            <div className="text-[11px] text-muted-foreground">
              {view.markPrice > 0 ? `$${fmtPrice(view.markPrice)}` : "—"}
            </div>
          )}
        </div>
      </div>
      <div className="shrink-0 text-right font-mono text-[11px]">
        {showPosition && view.uPnl !== null ? (
          <span className={toneClass(view.uPnl)}>
            {view.uPnl >= 0 ? "+" : ""}
            {view.uPnl.toFixed(2)}
          </span>
        ) : view.dayChangePct !== null ? (
          <span className={toneClass(view.dayChangePct)}>
            {pct(view.dayChangePct)}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </div>
    </button>
  )
}

function Empty({ text }: { text: string }) {
  return (
    <div className="flex h-24 items-center justify-center text-xs text-muted-foreground">
      {text}
    </div>
  )
}
