import * as React from "react"

import {
  InspectorCard,
  InspectorNote,
} from "@/components/automations/inspector-card"
import { TradeNumberField } from "@/components/automations/nodes/trade-number-field"
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
  MAX_BACKTEST_DAYS,
  MAX_BACKTEST_MARKETS,
  tradeMarketsNode,
  tradeMarketsSettingsSchema,
} from "@/lib/automations/nodes/trade-markets"
import type { MarketRow } from "@/lib/protocols/contracts"
import { plural } from "@/lib/format/plural"
import { formatCompactUsd } from "@/lib/trade/format"
import {
  filterMarketsByVolume,
  parseMarketVolume,
} from "@/lib/trade/market-volume-filter"

/**
 * Which coins to test, and how far back.
 *
 * The volume range narrows today's market catalogue while editing. The chosen
 * market names are still what gets saved, so running the same flow later does
 * not silently change its coins as volume moves.
 *
 * Mainnet only, deliberately: testnet prices are made up, so a strategy tested
 * against them has been tested against nothing.
 */
const NETWORK = "mainnet"

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
  const [minimumVolume, setMinimumVolume] = React.useState("")
  const [maximumVolume, setMaximumVolume] = React.useState("")

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

  // Filtered and ordered on the spot. There are only a few hundred coins, and
  // market volume can change whenever the cached catalogue is refreshed.
  const parsedMinimum = minimumVolume.trim()
    ? parseMarketVolume(minimumVolume)
    : 0
  const parsedMaximum = maximumVolume.trim()
    ? parseMarketVolume(maximumVolume)
    : Infinity
  const rangeIsValid =
    parsedMinimum !== null &&
    parsedMaximum !== null &&
    parsedMinimum <= parsedMaximum
  const visible = rangeIsValid
    ? filterMarketsByVolume(
        markets ?? [],
        parsedMinimum,
        parsedMaximum,
        search
      )
    : []

  const visibleKeys = visible.map((row) => row.key)
  const visibleChosen = visibleKeys.filter((key) => chosen.has(key)).length
  const allVisibleChosen = visible.length > 0 && visibleChosen === visible.length

  function toggleVisible(on: boolean) {
    const visibleSet = new Set(visibleKeys)
    setKeys(
      on
        ? [...marketKeys, ...visibleKeys]
        : marketKeys.filter((key) => !visibleSet.has(key))
    )
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
            <div className="grid gap-2">
              <FieldLabel
                className="text-xs"
                hint="Only show coins whose 24-hour trading volume falls inside this range. Plain numbers are millions, so .5 and 500k both mean $500,000."
              >
                Daily volume
              </FieldLabel>
              <div className="grid grid-cols-2 gap-2">
                <div className="grid gap-1.5">
                  <label
                    htmlFor={`markets-${node.id}-minimum-volume`}
                    className="text-xs text-muted-foreground"
                  >
                    Minimum (millions)
                  </label>
                  <Input
                    id={`markets-${node.id}-minimum-volume`}
                    inputMode="decimal"
                    placeholder="10"
                    value={minimumVolume}
                    aria-invalid={
                      minimumVolume.trim().length > 0 && parsedMinimum === null
                    }
                    onChange={(event) => setMinimumVolume(event.target.value)}
                  />
                </div>
                <div className="grid gap-1.5">
                  <label
                    htmlFor={`markets-${node.id}-maximum-volume`}
                    className="text-xs text-muted-foreground"
                  >
                    Maximum (millions)
                  </label>
                  <Input
                    id={`markets-${node.id}-maximum-volume`}
                    inputMode="decimal"
                    placeholder="100"
                    value={maximumVolume}
                    aria-invalid={
                      maximumVolume.trim().length > 0 &&
                      (parsedMaximum === null || !rangeIsValid)
                    }
                    onChange={(event) => setMaximumVolume(event.target.value)}
                  />
                </div>
              </div>
            </div>

            <Input
              value={search}
              placeholder="Search coins"
              aria-label="Search coins"
              onChange={(event) => setSearch(event.target.value)}
            />

            <ScrollArea className="h-56 rounded-lg border bg-background">
              <div className="sticky top-0 z-10 flex items-center gap-2 border-b bg-muted px-3 py-2">
                <Checkbox
                  checked={
                    allVisibleChosen
                      ? true
                      : visibleChosen > 0
                        ? "indeterminate"
                        : false
                  }
                  disabled={visible.length === 0}
                  aria-label="Select all visible coins"
                  onCheckedChange={(next) => toggleVisible(next === true)}
                />
                <span className="min-w-0 flex-1 text-xs font-medium">
                  Select all {visible.length.toLocaleString()} shown
                </span>
                <span className="text-[10px] text-muted-foreground">
                  24h volume
                </span>
              </div>
              <div className="grid gap-0.5 p-1.5">
                {!rangeIsValid ? (
                  <p className="p-3 text-center text-xs text-muted-foreground">
                    Enter a volume range like 10 to 100 million.
                  </p>
                ) : visible.length === 0 ? (
                  <p className="p-3 text-center text-xs text-muted-foreground">
                    No coin matches these filters.
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
