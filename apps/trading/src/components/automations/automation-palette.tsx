import * as React from "react"
import {
  ActivityIcon,
  OctagonXIcon,
  PlusIcon,
  RadarIcon,
  RepeatIcon,
  SearchIcon,
  ShieldXIcon,
  TargetIcon,
  TimerIcon,
  TrendingDownIcon,
  TrendingUpIcon,
} from "lucide-react"

import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  INDICATORS,
  INDICATOR_IDS,
  type IndicatorId,
} from "@/lib/indicators/registry"
import { cn } from "@/lib/utils"

export type AutomationPaletteChoice =
  | { kind: "indicator"; indicatorType: IndicatorId }
  | { kind: "whaleWall" }
  | { kind: "lookback" }
  | { kind: "action"; action: "buy" | "short" | "close" | "reverse" }
  | { kind: "takeProfit" }
  | { kind: "stopLoss" }

type PaletteItem = {
  key: string
  name: string
  description: string
  icon: React.ComponentType<{ className?: string }>
  choice: AutomationPaletteChoice
}

const filterItems: PaletteItem[] = [
  {
    key: "filter-lookback",
    name: "Look Back",
    description: "Incoming signal only counts for a set number of candles",
    icon: TimerIcon,
    choice: { kind: "lookback" },
  },
]

const scannerItems: PaletteItem[] = [
  {
    key: "scanner-whale-wall",
    name: "Whale Wall",
    description: "Watch large nearby bid and ask levels in the live order book",
    icon: RadarIcon,
    choice: { kind: "whaleWall" },
  },
]

const actionItems: PaletteItem[] = [
  {
    key: "action-buy",
    name: "Long",
    description: "Target a long portfolio percentage",
    icon: TrendingUpIcon,
    choice: { kind: "action", action: "buy" },
  },
  {
    key: "action-short",
    name: "Short",
    description: "Target a short portfolio percentage",
    icon: TrendingDownIcon,
    choice: { kind: "action", action: "short" },
  },
  {
    key: "action-reverse",
    name: "Reverse Position",
    description: "Flip to the opposite side in one step (close + open)",
    icon: RepeatIcon,
    choice: { kind: "action", action: "reverse" },
  },
  {
    key: "action-close",
    name: "Close Position",
    description: "Close the current position completely",
    icon: ShieldXIcon,
    choice: { kind: "action", action: "close" },
  },
]

const exitItems: PaletteItem[] = [
  {
    key: "exit-take-profit",
    name: "Take Profit",
    description:
      "Bank profit at a set % from entry — hang it on a Long or Short",
    icon: TargetIcon,
    choice: { kind: "takeProfit" },
  },
  {
    key: "exit-stop-loss",
    name: "Stop Loss",
    description:
      "Cap the loss at a set % from entry — hang it on a Long or Short",
    icon: OctagonXIcon,
    choice: { kind: "stopLoss" },
  },
]

export function AutomationPalette({
  className,
  pinnedIndicators,
  onSelect,
  onAdd,
  onDragStart,
  onDragEnd,
}: {
  className?: string
  /** Indicator ids the user pinned on the Strategies page — the only ones offered. */
  pinnedIndicators: IndicatorId[]
  onSelect: (choice: AutomationPaletteChoice) => void
  onAdd: (choice: AutomationPaletteChoice) => void
  onDragStart: (choice: AutomationPaletteChoice) => void
  onDragEnd: () => void
}) {
  const [search, setSearch] = React.useState("")
  const query = search.trim().toLowerCase()
  const indicatorItems: PaletteItem[] = INDICATOR_IDS.filter((id) =>
    pinnedIndicators.includes(id)
  ).map((id) => ({
    key: `indicator-${id}`,
    name: INDICATORS[id].label,
    description: INDICATORS[id].description,
    icon: ActivityIcon,
    choice: { kind: "indicator", indicatorType: id },
  }))
  const groups = [
    { label: "Indicators", items: indicatorItems },
    { label: "Scanners", items: scannerItems },
    { label: "Filters", items: filterItems },
    { label: "Actions", items: actionItems },
    { label: "Exits", items: exitItems },
  ]
    .map((group) => ({
      ...group,
      items: group.items.filter(
        (item) =>
          !query ||
          `${item.name} ${item.description}`.toLowerCase().includes(query)
      ),
    }))
    .filter((group) => group.items.length > 0)

  return (
    <div
      className={cn(
        "flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-background",
        className
      )}
    >
      <div className="border-b p-3">
        <div className="relative">
          <SearchIcon
            aria-hidden="true"
            className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search nodes…"
            aria-label="Search automation nodes"
            className="h-8 pr-2 pl-8 text-xs"
          />
        </div>
      </div>
      <ScrollArea
        className="min-h-0 flex-1"
        scrollBarClassName="right-1 data-vertical:w-2"
      >
        <div className="flex flex-col gap-4 p-3">
          {pinnedIndicators.length === 0 ? (
            <section aria-labelledby="palette-Indicators">
              <h2
                id="palette-Indicators"
                className="mb-2 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase"
              >
                Indicators
              </h2>
              <p className="text-xs text-muted-foreground">
                No pinned indicators — pin strategies on the Strategies page to
                use them here.
              </p>
            </section>
          ) : null}
          {groups.map((group) => (
            <section
              key={group.label}
              aria-labelledby={`palette-${group.label}`}
            >
              <h2
                id={`palette-${group.label}`}
                className="mb-2 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase"
              >
                {group.label}
              </h2>
              <div className="grid gap-2">
                {group.items.map((item) => {
                  const Icon = item.icon
                  return (
                    <div key={item.key} className="group relative">
                      <button
                        type="button"
                        draggable
                        onClick={() => onSelect(item.choice)}
                        onDragStart={(event) => {
                          event.dataTransfer.effectAllowed = "copy"
                          event.dataTransfer.setData("text/plain", item.name)
                          onDragStart(item.choice)
                        }}
                        onDragEnd={onDragEnd}
                        className="flex w-full cursor-grab items-start gap-2 overflow-hidden rounded-lg border border-foreground/5 bg-card p-2 pr-10 text-left transition-colors active:cursor-grabbing active:[clip-path:inset(0_round_var(--radius-lg))] hover:border-primary/40 hover:bg-muted/30 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                      >
                        <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                          <Icon className="size-3.5" />
                        </span>
                        <span className="min-w-0 flex-1 overflow-hidden">
                          <span className="block truncate text-xs font-medium">
                            {item.name}
                          </span>
                          <span
                            className="line-clamp-2 text-[10px] leading-4 text-muted-foreground"
                            title={item.description}
                          >
                            {item.description}
                          </span>
                        </span>
                      </button>
                      <button
                        type="button"
                        aria-label={`Add ${item.name} node`}
                        onClick={() => onAdd(item.choice)}
                        className="absolute top-1/2 right-2 flex size-6 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md text-muted-foreground opacity-0 transition-[color,background-color,opacity] group-hover:opacity-100 hover:bg-muted hover:text-foreground focus-visible:opacity-100 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none group-focus-within:opacity-100"
                      >
                        <PlusIcon className="size-4" />
                      </button>
                    </div>
                  )
                })}
              </div>
            </section>
          ))}
          {groups.length === 0 ? (
            <p className="py-8 text-center text-xs text-muted-foreground">
              No nodes match that search.
            </p>
          ) : null}
        </div>
      </ScrollArea>
      <p className="border-t px-3 py-2 text-[10px] text-muted-foreground">
        Select to preview · Drag or use + to add.
      </p>
    </div>
  )
}
