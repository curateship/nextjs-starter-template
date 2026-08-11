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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  loadMarketProtocols,
  loadTestableMarkets,
} from "@/lib/api/backtests"
import { getMarketsErrorMessage } from "@/lib/api/markets"
import type { AutomationNodeFieldsProps } from "@/lib/automations/node-descriptor"
import {
  candlesPerCoin,
  coinsAllowedFor,
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

/** Extra goes at the coin list before the failure is worth telling anybody about. */
const RETRIES = 2
/** Grows with each go: 400ms, then 800ms. Long enough for a hiccup to pass. */
const RETRY_PAUSE_MS = 400

/**
 * The coin list, kept for the tab rather than fetched every time the panel is
 * drawn.
 *
 * Selecting the step, clicking away and selecting it again asked two exchanges
 * for the same list all over again, and the panel sat empty each time. The list
 * changes when an exchange lists a new perp — a fortnightly event — so ten
 * minutes is instant to use and never meaningfully stale. The same span the
 * server keeps its own copy for, and for the same reason.
 *
 * Module scope, not a hook: it has to outlive the panel being unmounted, which
 * is the whole case it exists for. Lost on reload, which is the right time to
 * ask again.
 */
const LIST_CACHE_MS = 10 * 60 * 1000
const listCache = new Map<
  string,
  { at: number; rows: MarketRow[]; tradeable: boolean }
>()

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
  const protocol = parsedSettings.success
    ? (parsedSettings.data.protocol ?? fallback.protocol)
    : fallback.protocol

  /**
   * What the last fetch came back with, and which exchange it was for.
   *
   * One piece of state rather than three, and it remembers whose answer it is.
   * That is what lets the list below be WORKED OUT rather than stored: the
   * cache already holds every exchange seen this session, so switching to one
   * you have looked at draws it on the first paint with nothing to set.
   *
   * It used to copy the cache into state from inside the effect, which meant
   * every switch rendered twice — once empty, once filled — and React says so
   * out loud.
   */
  const [fetched, setFetched] = React.useState<{
    protocol: string
    rows: MarketRow[] | null
    tradeable: boolean
    error: string | null
  } | null>(null)

  // The fetch's answer when it is about the exchange on screen, and whatever is
  // already known about that exchange otherwise.
  //
  // Whether the cached copy is STALE is deliberately not asked here: the clock
  // is not something a render may read, and there is nothing to gain by asking.
  // A list ten minutes old is still the right list to show while the effect
  // below checks and replaces it.
  const answer = fetched?.protocol === protocol ? fetched : null
  const held = listCache.get(protocol)
  const markets = answer ? answer.rows : (held?.rows ?? null)
  /** Whether coins from this exchange can be traded, or only charted and tested. */
  const tradeable = answer ? answer.tradeable : (held?.tradeable ?? true)
  const error = answer?.error ?? null

  const [protocols, setProtocols] = React.useState<
    ReadonlyArray<{ id: string; label: string; tradeable: boolean }>
  >([])
  const [search, setSearch] = React.useState("")
  /**
   * How many coins "Draw again" takes — null until somebody types a number,
   * and null means "as many as will fit".
   *
   * It used to start at a flat twenty, so the one button whose whole job is
   * "fill this list for me" handed back twenty coins out of five hundred and
   * left you to do the rest by hand. What fits is already worked out from the
   * window, so that is what it offers.
   */
  const [sampleSize, setSampleSize] = React.useState<number | null>(null)

  /** Bumped by "Try again", which asks again past the cache. */
  const [attemptKey, setAttemptKey] = React.useState(0)

  // One effect, keyed on the exchange, rather than a memoised function.
  //
  // The list is fetched per exchange and kept per exchange, so switching is
  // instant the second time. Two goes before complaining, and that is not
  // belt-and-braces: this asks an exchange for its whole catalogue, and one
  // hiccup used to throw the lot. The failure was common and pressing Try
  // again always fixed it — which means the banner was reporting a problem
  // that had already solved itself. A real outage still fails all three goes
  // and still says so.
  React.useEffect(() => {
    let alive = true

    void (async () => {
      // Nothing is set on the way in. What is already known about this exchange
      // is read while drawing, so a switch back to one you have seen is already
      // on screen by the time this runs. Whether that copy is stale is asked
      // here rather than up there, because a render may not read a clock.
      const known = listCache.get(protocol)
      if (known && Date.now() - known.at < LIST_CACHE_MS && attemptKey === 0) {
        return
      }
      for (let attempt = 0; ; attempt += 1) {
        try {
          const loaded = await loadTestableMarkets(NETWORK, protocol)
          listCache.set(protocol, {
            at: Date.now(),
            rows: loaded.rows,
            tradeable: loaded.tradeable,
          })
          if (!alive) return
          setFetched({
            protocol,
            rows: loaded.rows,
            tradeable: loaded.tradeable,
            error: null,
          })
          return
        } catch (loadError) {
          if (attempt >= RETRIES) {
            if (!alive) return
            setFetched({
              protocol,
              rows: null,
              tradeable: true,
              error: getMarketsErrorMessage(loadError),
            })
            return
          }
          await new Promise((resolve) =>
            setTimeout(resolve, RETRY_PAUSE_MS * (attempt + 1))
          )
        }
      }
    })()

    return () => {
      alive = false
    }
  }, [protocol, attemptKey])

  // The exchanges on offer, asked once. Read from the registry rather than
  // written down here, so adding an exchange never touches this panel.
  React.useEffect(() => {
    let alive = true
    void loadMarketProtocols()
      .then((rows) => {
        if (alive) setProtocols(rows)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])

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

  // Filtered on the spot. There are a few hundred coins at most and this is one
  // pass over their names, which is nothing next to drawing the list itself —
  // and remembering it needs the list to be provably unchanged, which it is not:
  // it comes from a cache the fetch below writes to.
  const needle = search.trim().toLowerCase()
  const visible = needle
    ? (markets ?? []).filter((row) =>
        row.symbol.toLowerCase().includes(needle)
      )
    : (markets ?? [])

  /**
   * Drawn here, in the browser, while somebody is editing — never at run time.
   * Pressing Run twice on the same flow has to test the same coins, or two
   * results cannot be told apart from two strategies.
   */
  /**
   * The most coins this window leaves room for, and no more than exist.
   *
   * The candle size is the ladder step's, not this one's, so it cannot be read
   * from here — 4h is what the summary below has always assumed. A window that
   * turns out too greedy for the real candle size is refused when the flow is
   * read, by name and with the number, rather than silently trimmed.
   */
  const roomFor = Math.min(
    markets?.length ?? 0,
    coinsAllowedFor("4h", days)
  )
  const sample = sampleSize ?? roomFor

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
          hint="How much history the run walks. A younger coin is tested from the day its selected exchange first has prices for it, and the result says when that was."
          value={days}
          min={1}
          max={MAX_BACKTEST_DAYS}
          suffix="days"
          onChange={(next) =>
            onChange({ ...node, settings: { ...node.settings, days: next } })
          }
        />
      </InspectorCard>

      <InspectorCard title="Protocol">
        <div className="grid gap-1.5">
          <FieldLabel
            htmlFor={`markets-${node.id}-protocol`}
            className="text-xs"
            hint="Where these coins come from. Switching exchange clears the old list so one run can never mix two exchanges' rules."
          >
            Markets from
          </FieldLabel>
          <Select
            value={protocol}
            onValueChange={(next) =>
              onChange({
                ...node,
                settings: {
                  ...node.settings,
                  protocol: next,
                  marketKeys: [],
                },
              })
            }
          >
            <SelectTrigger
              id={`markets-${node.id}-protocol`}
              className="w-full sm:w-fit"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(protocols.length > 0
                ? protocols
                : [{ id: protocol, label: protocol, tradeable: true }]
              ).map((one) => (
                <SelectItem key={one.id} value={one.id}>
                  {one.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </InspectorCard>

      <InspectorCard title="Coins">
        {error ? (
          <ErrorBanner message={error} onRetry={() => setAttemptKey((n) => n + 1)} />
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
                  value={String(sample)}
                  onChange={(event) => {
                    const next = Number(event.target.value.trim())
                    if (Number.isFinite(next)) setSampleSize(next)
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!(sample > 0)}
                  onClick={() => draw(markets, sample)}
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
              {tradeable
                ? ""
                : " These can be tested but not traded yet — this one gives prices, not orders."}
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
