import * as React from "react"
import { RefreshCwIcon } from "lucide-react"

import {
  InspectorCard,
  InspectorNote,
} from "@/components/automations/inspector-card"
import { TradeNumberField } from "@/components/automations/nodes/trade-number-field"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { ErrorBanner } from "@/components/ui/error-banner"
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import { LoadingRow } from "@/components/ui/loading-row"
import { ScrollArea } from "@/components/ui/scroll-area"
import { loadTestableMarkets } from "@/lib/api/backtests"
import { getMarketsErrorMessage } from "@/lib/api/markets"
import type { AutomationNodeFieldsProps } from "@/lib/automations/node-descriptor"
import {
  candlesPerCoin,
  MAX_BACKTEST_DAYS,
  MAX_BACKTEST_MARKETS,
  tradeMarketsNode,
  tradeMarketsSettingsSchema,
} from "@/lib/automations/nodes/trade-markets"
import type { MarketRow } from "@/lib/protocols/contracts"
import { plural } from "@/lib/format/plural"
import { formatCompactUsd } from "@/lib/trade/format"

/**
 * Which coins to test, and how far back.
 *
 * The quick-picks are the point of this panel. Choosing twenty coins by hand is
 * tedious enough that nobody does it twice, so the bands and the random sample
 * do it in one press — and both of them write **names** into the list rather
 * than a rule. A step saying "the twenty biggest" would mean something
 * different next week, and two runs of the same flow could not be compared. A
 * step saying "these twenty" means the same thing forever.
 *
 * Mainnet only, deliberately: testnet prices are made up, so a strategy tested
 * against them has been tested against nothing.
 */
const NETWORK = "mainnet"

/**
 * The volume bands, in plain dollars a day. A coin that trades a hundred
 * million dollars a day and one that trades fifty thousand behave nothing
 * alike, and testing a ladder across both at once hides that.
 */
const VOLUME_BANDS = [
  { key: "huge", label: "Over $100m a day", min: 100_000_000, max: Infinity },
  { key: "big", label: "$10m to $100m", min: 10_000_000, max: 100_000_000 },
  { key: "mid", label: "$1m to $10m", min: 1_000_000, max: 10_000_000 },
  { key: "small", label: "Under $1m", min: 0, max: 1_000_000 },
] as const

const DEFAULT_SAMPLE = 20

export default function TradeMarketsFields({
  node,
  onChange,
}: AutomationNodeFieldsProps) {
  const parsedSettings = tradeMarketsSettingsSchema
    .partial()
    .safeParse(node.settings)
  const fallback = tradeMarketsSettingsSchema.parse({
    ...tradeMarketsNode.createSettings(),
    marketKeys: ["placeholder"],
  })
  // Held steady between renders. A fresh array every time would make every
  // memo below rebuild on every render, which is the opposite of the point.
  const parsedKeys = parsedSettings.success
    ? (parsedSettings.data.marketKeys ?? null)
    : null
  const marketKeys = React.useMemo(() => parsedKeys ?? [], [parsedKeys])
  const days = parsedSettings.success
    ? (parsedSettings.data.days ?? fallback.days)
    : fallback.days

  const [markets, setMarkets] = React.useState<MarketRow[] | null>(null)
  /** How many of the exchange's coins Binance has no history for. */
  const [hidden, setHidden] = React.useState(0)
  const [error, setError] = React.useState<string | null>(null)
  const [search, setSearch] = React.useState("")
  const [sampleSize, setSampleSize] = React.useState(DEFAULT_SAMPLE)

  const load = React.useCallback(async () => {
    setError(null)
    try {
      // Only coins Binance has history for. Picking from the full catalogue
      // is what made a hundred coins come back as fifty-three tested.
      const { rows, hidden: without } = await loadTestableMarkets(NETWORK)
      setMarkets(rows)
      setHidden(without)
    } catch (loadError) {
      setMarkets(null)
      setError(getMarketsErrorMessage(loadError))
    }
  }, [])

  React.useEffect(() => {
    void load()
  }, [load])

  const chosen = React.useMemo(() => new Set(marketKeys), [marketKeys])

  const setKeys = React.useCallback(
    (keys: readonly string[]) =>
      onChange({
        ...node,
        settings: {
          ...node.settings,
          marketKeys: [...new Set(keys)].slice(0, MAX_BACKTEST_MARKETS),
        },
      }),
    [node, onChange]
  )

  /**
   * Turning one coin on or off, without every other row redrawing.
   *
   * Held steady between renders so `CoinRow` below can skip the rows that did
   * not change. Three hundred checkboxes all redrawing on every click is what
   * made choosing a long list feel like the machine had stopped.
   */
  const toggle = React.useCallback(
    (key: string, on: boolean) =>
      setKeys(on ? [...marketKeys, key] : marketKeys.filter((one) => one !== key)),
    [marketKeys, setKeys]
  )

  const visible = React.useMemo(() => {
    const needle = search.trim().toLowerCase()
    const rows = markets ?? []
    return needle ? rows.filter((row) => row.symbol.toLowerCase().includes(needle)) : rows
  }, [markets, search])

  /**
   * Drawn here, in the browser, while somebody is editing — never at run time.
   * Pressing Run twice on the same flow has to test the same coins, or two
   * results cannot be told apart from two strategies.
   */
  function draw(pool: readonly MarketRow[], count: number) {
    const shuffled = [...pool]
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const swap = Math.floor(Math.random() * (index + 1))
      ;[shuffled[index], shuffled[swap]] = [shuffled[swap], shuffled[index]]
    }
    setKeys(shuffled.slice(0, count).map((row) => row.key))
  }

  return (
    <>
      <InspectorCard title="How far back">
        <TradeNumberField
          id={`markets-${node.id}-days`}
          label="Days to test"
          hint="How much history the run walks, up to two years. Prices come from Binance, so a coin younger than the window is reported as skipped rather than guessed at."
          value={days}
          min={1}
          max={MAX_BACKTEST_DAYS}
          suffix="days"
          onChange={(next) =>
            onChange({ ...node, settings: { ...node.settings, days: next } })
          }
        />
      </InspectorCard>

      <InspectorCard title="Coins">
        {error ? (
          <ErrorBanner message={error} onRetry={() => void load()} />
        ) : null}

        {markets === null && !error ? (
          <LoadingRow label="Loading the market list…" />
        ) : null}

        {markets !== null ? (
          <>
            <div className="flex flex-wrap gap-1.5">
              {VOLUME_BANDS.map((band) => (
                <Button
                  key={band.key}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setKeys(
                      markets
                        .filter(
                          (row) =>
                            row.volume24hUsd >= band.min &&
                            row.volume24hUsd < band.max
                        )
                        .map((row) => row.key)
                    )
                  }
                >
                  {band.label}
                </Button>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setKeys(markets.map((row) => row.key))}
              >
                Every coin
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={marketKeys.length === 0}
                onClick={() => setKeys([])}
              >
                Clear
              </Button>
            </div>

            <div className="grid gap-1.5">
              <FieldLabel
                htmlFor={`markets-${node.id}-sample`}
                className="text-xs"
                hint="Picks this many coins at random, right now, and writes their names into the list. Pressing Run never randomises — a run tests exactly the coins you can see."
              >
                Random sample
              </FieldLabel>
              <div className="flex items-center gap-2">
                <Input
                  id={`markets-${node.id}-sample`}
                  inputMode="numeric"
                  className="w-20"
                  value={String(sampleSize)}
                  onChange={(event) => {
                    const next = Number(event.target.value.trim())
                    if (Number.isFinite(next)) setSampleSize(next)
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!(sampleSize > 0)}
                  onClick={() => draw(markets, sampleSize)}
                >
                  <RefreshCwIcon className="size-3.5" />
                  Draw again
                </Button>
              </div>
            </div>

            <Input
              value={search}
              placeholder="Search coins"
              aria-label="Search coins"
              onChange={(event) => setSearch(event.target.value)}
            />

            <ScrollArea className="h-56 rounded-lg border bg-background">
              <div className="grid gap-0.5 p-1.5">
                {visible.length === 0 ? (
                  <p className="p-3 text-center text-xs text-muted-foreground">
                    No coin matches “{search}”.
                  </p>
                ) : (
                  visible.map((row) => (
                    <CoinRow
                      key={row.key}
                      marketKey={row.key}
                      symbol={row.symbol}
                      volume24hUsd={row.volume24hUsd}
                      checked={chosen.has(row.key)}
                      onToggle={toggle}
                    />
                  ))
                )}
              </div>
            </ScrollArea>

            {/* How much reading this comes to. The candle size lives on the
                DCA step, so the sum is only exact once both are set — this
                says it at 4h, which is what nearly every run uses. The run
                itself refuses a choice that would not fit in memory, and says
                by how much. */}
            <p className="text-xs text-muted-foreground">
              {marketKeys.length === 0
                ? "No coins chosen yet."
                : `${marketKeys.length} ${plural(marketKeys.length, "coin", "coins")} chosen, ${(marketKeys.length * candlesPerCoin("4h", days)).toLocaleString()} candles to read at 4h.`}
              {hidden > 0
                ? ` ${hidden} more ${plural(hidden, "coin is", "coins are")} not shown — Binance has no history for ${plural(hidden, "it", "them")}, and that is where the prices come from.`
                : ""}
            </p>
          </>
        ) : null}
      </InspectorCard>

      <InspectorNote>
        Every chosen coin shares the one pretend pot from the wallet step above,
        so twenty coins are competing for the same money — which is what running
        this for real would be like.
      </InspectorNote>
    </>
  )
}

/**
 * One coin in the list.
 *
 * Its own component, and memoised, so ticking one box redraws one row instead
 * of every row on the list. A checkbox is a heavier thing to draw than it
 * looks, and three hundred of them redrawing on every click is what made
 * choosing a long list crawl.
 */
const CoinRow = React.memo(function CoinRow({
  marketKey,
  symbol,
  volume24hUsd,
  checked,
  onToggle,
}: {
  marketKey: string
  symbol: string
  volume24hUsd: number
  checked: boolean
  onToggle: (key: string, on: boolean) => void
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/60">
      <Checkbox
        checked={checked}
        onCheckedChange={(next) => onToggle(marketKey, next === true)}
      />
      <span className="min-w-0 flex-1 truncate text-xs font-medium">
        {symbol}
      </span>
      <span className="shrink-0 text-[10px] text-muted-foreground tabular-nums">
        {formatCompactUsd(volume24hUsd)} a day
      </span>
    </label>
  )
})
