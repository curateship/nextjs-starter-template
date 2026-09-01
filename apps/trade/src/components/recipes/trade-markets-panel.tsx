import * as React from "react"

import {
  InspectorCard,
  InspectorNote,
} from "@/components/automations/inspector-card"
import { TradeNumberField } from "@/components/recipes/trade-number-field"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { DatePicker } from "@/components/ui/date-picker"
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  loadMarketProtocols,
  loadTestableMarkets,
} from "@/lib/api/trade/backtests"
import { getMarketsErrorMessage } from "@/lib/api/trade/markets"
import {
  getMarketFoldersLoadErrorMessage,
  loadFolders,
} from "@/lib/api/trade/market-folders"
import type { AutomationNode } from "@/lib/automations/graph"
import type { AutomationNodeFieldsProps } from "@/lib/automations/node-descriptor"
import {
  candlesPerCoin,
  coinsAllowedFor,
  dateFromDay,
  dayFromDate,
  MAX_BACKTEST_DAYS,
  MAX_BACKTEST_MARKETS,
  tradeMarketsNode,
  tradeMarketsSettingsSchema,
  trimMarketsToFit,
  windowDays,
  windowProblem,
} from "@/lib/recipes/trade-markets"
import {
  DEFAULT_BACKTEST_INTERVAL,
  tradeDcaNode,
} from "@/lib/recipes/trade-dca"
import { CANDLE_INTERVALS } from "@/lib/protocols/contracts"
import { chosenWallet, tradeWalletNode } from "@/lib/recipes/trade-wallet"
import type { MarketRow } from "@/lib/protocols/contracts"
import { plural } from "@/lib/format/plural"
import type { MarketFolder } from "@/lib/trade/market-folders"
import { formatCompactUsd } from "@/lib/trade/format"
import {
  changeVisibleMarketSelection,
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
 * **The step has two shapes, and the Wallet step decides which.** With pretend
 * money this is a backtest: a window of history to walk, mainnet only, and a
 * count of candles to read. With a wallet named there is no history to walk and
 * no candles to load — the coins have to be ones that wallet could really
 * trade, so the exchange and the network follow the wallet rather than being
 * chosen here.
 *
 * A backtest is mainnet only, deliberately: testnet prices are made up, so a
 * strategy tested against them has been tested against nothing.
 */
const BACKTEST_NETWORK = "mainnet"

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

/**
 * The same stretch a day count describes, written as its two ends.
 *
 * What switching to dates starts you on, so the run does not change shape the
 * moment you switch. Ends today because "the last 30 days" does, and both ends
 * are counted in — thirty days back from today, and today itself, is thirty
 * days.
 *
 * The clock is read here rather than while drawing: this only ever runs from a
 * click.
 */
function recentDaysAsDates(days: number): { from: string; to: string } {
  const today = new Date()
  const start = new Date(today)
  start.setDate(start.getDate() - (days - 1))
  return { from: dayFromDate(start), to: dayFromDate(today) }
}

export default function TradeMarketsFields({
  node,
  graph,
  onChange,
}: AutomationNodeFieldsProps) {
  // The Wallet step decides what this step is for, so this step has to read it.
  // The panel is handed the whole draft for exactly this.
  const walletStep = graph?.nodes.find(
    (one) => one.kind === tradeWalletNode.kind
  )
  const wallet = walletStep ? chosenWallet(walletStep.settings) : null

  /**
   * The candle size the run will read, which lives on the DCA ladder step.
   *
   * Read here because how many coins fit is arithmetic on the candle size and
   * the window together, and this step owns only half of it. It used to assume
   * 4h for the count it printed, which was right for most flows and quietly
   * wrong for the rest.
   */
  const dcaStep = graph?.nodes.find((one) => one.kind === tradeDcaNode.kind)
  const intervalSetting = dcaStep?.settings.interval
  const interval =
    typeof intervalSetting === "string" &&
    (CANDLE_INTERVALS as readonly string[]).includes(intervalSetting)
      ? intervalSetting
      : DEFAULT_BACKTEST_INTERVAL

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
  const folderId =
    typeof node.settings.folderId === "string" ? node.settings.folderId : null
  const [folderModeRequested, setFolderModeRequested] = React.useState(false)
  const folderMode = folderId !== null || folderModeRequested
  // Both read straight off the step, not through the whole-step parse.
  //
  // The parse is all-or-nothing, and `marketKeys` must hold at least one coin
  // to satisfy it — so the instant the list is emptied, every other field on
  // this panel snapped back to its default. Choosing a different exchange
  // clears the list by design, which meant choosing one appeared to do
  // nothing: it was saved, the list emptied, and the box redrew reading
  // "Hyperliquid" off the default. Ticking any coin made the choice appear.
  const days =
    typeof node.settings.days === "number" &&
    Number.isFinite(node.settings.days) &&
    node.settings.days >= 1
      ? node.settings.days
      : fallback.days
  const savedProtocol =
    typeof node.settings.protocol === "string" && node.settings.protocol !== ""
      ? node.settings.protocol
      : fallback.protocol
  /**
   * The exchange this list comes from — always the one saved on the step.
   *
   * **The wallet never overrides it.** It did for one build, and the control
   * went dead in the hand: choosing a different exchange saved the choice,
   * cleared the coins, and left the box still reading the wallet's exchange, so
   * nothing appeared to happen. A dropdown that swallows a choice is worse than
   * one that lets you make a choice the step then refuses out loud, which is
   * what it does below.
   */
  const protocol = savedProtocol
  /** Coins saved from an exchange this wallet cannot reach. */
  const wrongProtocol =
    wallet?.protocol != null && savedProtocol !== wallet.protocol
  /**
   * The network to list from.
   *
   * The wallet's, but only while the exchange is the wallet's too — asking
   * Binance for the network a Hyperliquid wallet sits on is a question with no
   * answer. While they disagree this shows the real network, and the sentence
   * under the dropdown is what says the flow cannot run.
   */
  const network =
    wallet && !wrongProtocol
      ? (wallet.network ?? BACKTEST_NETWORK)
      : BACKTEST_NETWORK
  /**
   * A wallet named before this step learned to follow one. Nothing is wrong and
   * nothing is lost — opening the Wallet step fills it in — but until then this
   * step has nothing to narrow itself by, so it says so rather than pretending.
   */
  const walletNotReadYet = wallet !== null && wallet.protocol === null
  // Read straight off the step rather than through the schema, so a date that
  // does not parse still shows in the box with the reason underneath it. Going
  // through the parse would blank the field and leave nothing to correct.
  const from =
    typeof node.settings.from === "string" ? node.settings.from : null
  const to = typeof node.settings.to === "string" ? node.settings.to : null
  /** Which of the two ways of naming a window this step is using. */
  const betweenDates = from !== null || to !== null
  const dateProblem = windowProblem({ from, to })
  const windowLength = windowDays({ days, from, to })
  const minimumVolume =
    typeof node.settings.minimumVolume === "string"
      ? node.settings.minimumVolume
      : ""
  const maximumVolume =
    typeof node.settings.maximumVolume === "string"
      ? node.settings.maximumVolume
      : ""

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
    key: string
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
  // Keyed by exchange AND network: the same exchange lists a different set of
  // coins on its practice network, and one list standing in for the other would
  // offer coins the wallet cannot reach.
  // The wallet is part of the key, because the list it produces depends on it:
  // a live wallet is only offered coins on markets its money can actually pay
  // for, and two wallets can be funded on different ones.
  const listKey = `${network}:${protocol}:${wallet?.id ?? ""}`
  const answer = fetched?.key === listKey ? fetched : null
  const held = listCache.get(listKey)
  const markets = answer ? answer.rows : (held?.rows ?? null)
  /** Whether coins from this exchange can be traded, or only charted and tested. */
  const tradeable = answer ? answer.tradeable : (held?.tradeable ?? true)
  const error = answer?.error ?? null

  const [protocols, setProtocols] = React.useState<
    ReadonlyArray<{ id: string; label: string; tradeable: boolean }>
  >([])
  const [search, setSearch] = React.useState("")
  const [folderAttempt, setFolderAttempt] = React.useState(0)
  const folderKey = `${protocol}:${network}`
  const [folderAnswer, setFolderAnswer] = React.useState<{
    key: string
    rows: MarketFolder[] | null
    error: string | null
  } | null>(null)
  const folders = folderAnswer?.key === folderKey ? folderAnswer.rows : null
  const foldersError =
    folderAnswer?.key === folderKey ? folderAnswer.error : null

  React.useEffect(() => {
    let alive = true
    void loadFolders(protocol as Parameters<typeof loadFolders>[0], network)
      .then((next) => {
        if (alive) setFolderAnswer({ key: folderKey, rows: next, error: null })
      })
      .catch((loadError) => {
        if (alive)
          setFolderAnswer({
            key: folderKey,
            rows: null,
            error: getMarketFoldersLoadErrorMessage(loadError),
          })
      })
    return () => {
      alive = false
    }
  }, [folderAttempt, folderKey, network, protocol])

  /**
   * An exchange's proper name, falling back to its id.
   *
   * The registry is what knows the name, and it arrives a moment after the
   * panel draws. A sentence naming "hyperliquid" beside a dropdown reading
   * "Hyperliquid" reads as two different things.
   */
  const nameOfProtocol = (id: string) =>
    protocols.find((one) => one.id === id)?.label ??
    // The registry arrives a moment after the panel draws, so until it does
    // this is all there is. Capitalised the way the registry would, rather than
    // showing the raw "binance" for a beat and then swapping it.
    (id ? id.charAt(0).toUpperCase() + id.slice(1) : id)

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
      const known = listCache.get(listKey)
      if (known && Date.now() - known.at < LIST_CACHE_MS && attemptKey === 0) {
        return
      }
      for (let attempt = 0; ; attempt += 1) {
        try {
          const loaded = await loadTestableMarkets(network, protocol)
          listCache.set(listKey, {
            at: Date.now(),
            rows: loaded.rows,
            tradeable: loaded.tradeable,
          })
          if (!alive) return
          setFetched({
            key: listKey,
            rows: loaded.rows,
            tradeable: loaded.tradeable,
            error: null,
          })
          return
        } catch (loadError) {
          if (attempt >= RETRIES) {
            if (!alive) return
            setFetched({
              key: listKey,
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
  }, [listKey, network, protocol, wallet?.id, attemptKey])

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

  /**
   * How many coins this step may hold, worked out rather than typed in.
   *
   * **This is the step's job, not the run's.** A run costs its window of
   * candles for every coin, so the window and the candle size decide between
   * them how many coins fit in memory — and the step that picks the coins is
   * the one place that can hand out the answer while somebody is still
   * choosing. It did not, and picking 406 coins was allowed right up until the
   * moment Run was pressed, at which point the backtest refused in 30
   * milliseconds and the canvas showed the result of an hour before.
   *
   * With a wallet named there is no history to walk and nothing to hold, so the
   * only limit left is the one on the length of the list.
   */
  const allowed = wallet
    ? MAX_BACKTEST_MARKETS
    : coinsAllowedFor(interval, windowLength)

  /**
   * Saves any change on this step, with the coins cut to what still fits.
   *
   * Every write goes through here, not only the ones that touch the coin list.
   * Lengthening the window buys fewer coins — that is the trade this step is
   * built around — so stretching 1000 days to 2000 has to take the tail off the
   * list as it goes. It did not, and the run refused instead.
   */
  // A plain function, not a `useCallback`: it is only ever called from a
  // handler written inline in the JSX below, so there is nothing for a stable
  // identity to save — and React Compiler refuses to optimise the whole
  // component when it finds a hand-written memo it can see no use for.
  function commit(settings: Record<string, unknown>) {
    onChange({
      ...node,
      settings: trimMarketsToFit(
        settings,
        interval,
        wallet !== null
      ) as AutomationNode["settings"],
    })
  }

  /** Saves a coin list, through the same one rule as everything else. */
  function setKeys(keys: readonly string[]) {
    commit({ ...node.settings, marketKeys: [...keys] })
  }

  /**
   * Turning one coin on or off, without every other row redrawing.
   *
   * Left to React Compiler to hold steady rather than wrapped by hand. It gives
   * `CoinRow` below the same stable identity a `useCallback` did — but a
   * hand-written memo here now reaches an imported function it cannot see
   * through, and rather than keep it the compiler gives up on the whole
   * component, which costs far more than this one callback was buying. Three
   * hundred checkboxes redrawing on every click is what this is avoiding.
   */
  function toggle(key: string, on: boolean) {
    setKeys(on ? [...marketKeys, key] : marketKeys.filter((one) => one !== key))
  }

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
    ? filterMarketsByVolume(markets ?? [], parsedMinimum, parsedMaximum, search)
    : []

  const visibleKeys = visible.map((row) => row.key)
  const visibleChosen = visibleKeys.filter((key) => chosen.has(key)).length
  /** The most of the shown coins that can be held at once. */
  const takeable = Math.min(visible.length, allowed)
  /** Ticked once there is no room for another, not only once every row is on. */
  const allVisibleChosen = takeable > 0 && visibleChosen >= takeable
  /** More coins are shown than will fit, so the busiest are what get taken. */
  const moreShownThanFit = visible.length > allowed
  /** No room for another coin. */
  const full = marketKeys.length >= allowed
  /**
   * More coins are already saved than now fit.
   *
   * Only reachable from outside this panel — the candle size is on the DCA
   * step, and making it smaller shrinks what fits here without this panel ever
   * being opened. Flows saved before the step handed out the limit at all land
   * here too, which is what a 406-coin flow that refused every run turned out
   * to be.
   *
   * Not trimmed on sight. Rewriting somebody's coin list because they opened a
   * panel is a change they never asked for, and they would have no way of
   * knowing it happened. It is said out loud with one button instead.
   */
  const over = !wallet && marketKeys.length > allowed

  function toggleVisible(on: boolean) {
    setKeys(changeVisibleMarketSelection(marketKeys, visibleKeys, on))
  }

  return (
    <>
      {wallet ? (
        // No window at all once a wallet is named. There is no history to walk
        // — the flow starts from today and goes forwards — and a greyed-out
        // date range would still read as a setting that matters, so the card
        // goes rather than being disabled.
        //
        // What replaces it is not decoration. Hiding the window would otherwise
        // read as "it starts buying the moment it is switched on", and it does
        // not: the ladder is measured from a confirmed base, and confirming one
        // takes past candles.
        <InspectorCard title="When it trades">
          <p className="text-xs text-muted-foreground">
            From the moment it is switched on, forwards — there is no stretch of
            history to choose. It still reads enough past candles to find each
            coin&apos;s base before it may buy, so a coin without one waits
            rather than guessing.
          </p>
        </InspectorCard>
      ) : (
        <InspectorCard title="How far back">
          <div className="grid gap-1.5">
            <FieldLabel
              htmlFor={`markets-${node.id}-window`}
              className="text-xs"
              hint="Either the run ends today and you say how long it is, or you name the two days it runs between. Naming the days is how you go back to one particular stretch — a crash, a quiet summer — and get the same run every time."
            >
              Window
            </FieldLabel>
            <Select
              value={betweenDates ? "between" : "recent"}
              onValueChange={(next) =>
                commit(
                  next === "between"
                    ? // Filled in rather than left blank, so the panel never
                      // sits in a half-chosen state: the dates start as the
                      // same stretch the day count was already describing, and
                      // moving either end from there is one click.
                      { ...node.settings, ...recentDaysAsDates(days) }
                    : { ...node.settings, from: null, to: null }
                )
              }
            >
              <SelectTrigger
                id={`markets-${node.id}-window`}
                className="w-full sm:w-fit"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="recent">The last few days</SelectItem>
                <SelectItem value="between">Between two dates</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {betweenDates ? (
            <>
              {/* One above the other, not side by side. The inspector is a
                narrow column, and a written-out date — "August 13th, 2026" —
                is wider than half of it, so two abreast cut the year off both
                of them. */}
              <div className="grid gap-2">
                <div className="grid gap-1.5">
                  <label
                    htmlFor={`markets-${node.id}-from`}
                    className="text-xs text-muted-foreground"
                  >
                    From
                  </label>
                  <DatePicker
                    id={`markets-${node.id}-from`}
                    value={dateFromDay(from)}
                    onChange={(picked) =>
                      commit({
                        ...node.settings,
                        from: picked ? dayFromDate(picked) : null,
                      })
                    }
                  />
                </div>
                <div className="grid gap-1.5">
                  <label
                    htmlFor={`markets-${node.id}-to`}
                    className="text-xs text-muted-foreground"
                  >
                    To
                  </label>
                  <DatePicker
                    id={`markets-${node.id}-to`}
                    value={dateFromDay(to)}
                    onChange={(picked) =>
                      commit({
                        ...node.settings,
                        to: picked ? dayFromDate(picked) : null,
                      })
                    }
                  />
                </div>
              </div>
              <p
                className={
                  dateProblem
                    ? "text-xs text-destructive"
                    : "text-xs text-muted-foreground"
                }
              >
                {dateProblem ??
                  `Both days included — ${windowLength.toLocaleString()} ${plural(windowLength, "day", "days")} in all. A day past today is cut back to now.`}
              </p>
            </>
          ) : (
            <TradeNumberField
              id={`markets-${node.id}-days`}
              label="Days to test"
              hint="How much history the run walks, counting back from today. A younger coin is tested from the day its selected exchange first has prices for it, and the result says when that was."
              value={days}
              min={1}
              max={MAX_BACKTEST_DAYS}
              suffix="days"
              onChange={(next) => commit({ ...node.settings, days: next })}
            />
          )}
        </InspectorCard>
      )}

      <InspectorCard title="Protocol">
        <div className="grid gap-1.5">
          <FieldLabel
            htmlFor={`markets-${node.id}-protocol`}
            className="text-xs"
            hint={
              wallet?.protocol
                ? "A wallet can only trade its own exchange, so this follows the Wallet step rather than being chosen here. Change it by naming a different wallet."
                : "Where these coins come from. Switching exchange clears the old list so one run can never mix two exchanges' rules."
            }
          >
            Markets from
          </FieldLabel>
          <Select
            value={protocol}
            onValueChange={(next) => {
              setFolderModeRequested(false)
              onChange({
                ...node,
                settings: {
                  ...node.settings,
                  protocol: next,
                  folderId: null,
                  folderName: null,
                  folderCount: null,
                  marketKeys: [],
                },
              })
            }}
          >
            <SelectTrigger
              id={`markets-${node.id}-protocol`}
              className="w-full sm:w-fit"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {/* Every exchange stays choosable, including the ones this
                  wallet cannot trade. Hiding them made the list shorter and
                  the step a trap: once you moved to the wallet's exchange
                  there was no way back to the one you came from without going
                  and changing the wallet first. They are marked instead, and
                  choosing one is answered by the sentence underneath. */}
              {(protocols.length > 0
                ? protocols
                : [
                    {
                      id: protocol,
                      label: nameOfProtocol(protocol),
                      tradeable: true,
                    },
                  ]
              ).map((one) => (
                <SelectItem key={one.id} value={one.id}>
                  {one.label}
                  {wallet?.protocol != null && one.id !== wallet.protocol
                    ? " — not on this wallet"
                    : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {wallet ? (
          <p
            className={
              wrongProtocol || walletNotReadYet
                ? "text-xs text-destructive"
                : "text-xs text-muted-foreground"
            }
          >
            {wrongProtocol
              ? `${wallet.label} cannot trade ${nameOfProtocol(savedProtocol)} coins, so this flow will not run as it stands. Choose ${nameOfProtocol(wallet.protocol ?? "")} above — it clears the list, so pick the coins again after.`
              : walletNotReadYet
                ? `Open the Wallet step once so this can follow ${wallet.label}'s exchange. Nothing is lost — it just has not been read yet.`
                : `Follows ${wallet.label}${network === "testnet" ? " — the practice network, where the money is pretend" : ""}.`}
          </p>
        ) : null}
      </InspectorCard>

      <InspectorCard title="Coins">
        <div className="grid gap-1.5">
          <span
            id={`markets-${node.id}-source-label`}
            className="text-xs font-medium"
          >
            Market source
          </span>
          <Tabs
            value={folderMode ? "folder" : "picked"}
            aria-labelledby={`markets-${node.id}-source-label`}
            onValueChange={(next) => {
              if (next === "picked") {
                setFolderModeRequested(false)
                commit({
                  ...node.settings,
                  folderId: null,
                  folderName: null,
                  folderCount: null,
                })
                return
              }
              setFolderModeRequested(true)
              const first = folders?.[0]
              commit({
                ...node.settings,
                folderId: first?.id ?? null,
                folderName: first?.name ?? null,
                folderCount: first?.marketKeys.length ?? null,
                marketKeys: [],
              })
            }}
          >
            <TabsList>
              <TabsTrigger value="picked">Pick coins</TabsTrigger>
              <TabsTrigger value="folder">Use a folder</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {folderMode ? (
          foldersError ? (
            <ErrorBanner
              message={foldersError}
              onRetry={() => setFolderAttempt((value) => value + 1)}
            />
          ) : folders === null ? (
            <LoadingRow label="Loading folders…" />
          ) : (
            <div className="grid gap-1.5">
              <FieldLabel
                htmlFor={`markets-${node.id}-folder`}
                className="text-xs"
              >
                Folder
              </FieldLabel>
              <Select
                value={folderId ?? undefined}
                onValueChange={(next) => {
                  const folder = folders.find((one) => one.id === next)
                  if (!folder) return
                  commit({
                    ...node.settings,
                    folderId: folder.id,
                    folderName: folder.name,
                    folderCount: folder.marketKeys.length,
                    marketKeys: [],
                  })
                }}
              >
                <SelectTrigger
                  id={`markets-${node.id}-folder`}
                  className="w-full"
                >
                  <SelectValue placeholder="Choose a folder" />
                </SelectTrigger>
                <SelectContent>
                  {folders.map((folder) => (
                    <SelectItem key={folder.id} value={folder.id}>
                      {folder.name} ({folder.marketKeys.length})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                The flow reads this folder again each time it starts.
              </p>
            </div>
          )
        ) : null}

        {!folderMode && error ? (
          <ErrorBanner
            message={error}
            onRetry={() => setAttemptKey((n) => n + 1)}
          />
        ) : null}

        {!folderMode && markets === null && !error ? (
          <LoadingRow label="Loading the market list…" />
        ) : null}

        {!folderMode && markets !== null ? (
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
                    maxLength={30}
                    aria-invalid={
                      minimumVolume.trim().length > 0 && parsedMinimum === null
                    }
                    onChange={(event) =>
                      onChange({
                        ...node,
                        settings: {
                          ...node.settings,
                          minimumVolume: event.target.value,
                        },
                      })
                    }
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
                    maxLength={30}
                    aria-invalid={
                      maximumVolume.trim().length > 0 &&
                      (parsedMaximum === null || !rangeIsValid)
                    }
                    onChange={(event) =>
                      onChange({
                        ...node,
                        settings: {
                          ...node.settings,
                          maximumVolume: event.target.value,
                        },
                      })
                    }
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
                  {/* Says what it will actually do. Ticking this used to read
                      "Select all 406 shown" and then save 406, which the run
                      refused; now it takes as many as fit and says so before
                      it is pressed. */}
                  {moreShownThanFit
                    ? `Select the busiest ${allowed.toLocaleString()} of ${visible.length.toLocaleString()} shown`
                    : `Select all ${visible.length.toLocaleString()} shown`}
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
                      full={full}
                      onToggle={toggle}
                    />
                  ))
                )}
              </div>
            </ScrollArea>

            {/* What the list comes to, counted in whatever the step is for.
                A backtest is bounded by reading, and the candle size lives on
                the DCA step — so this reads that step rather than assuming 4h,
                which is what it did before and what made the printed sum wrong
                on any flow using a different candle. A flow trading forward
                reads no history in bulk at all; what bounds it is the money, so
                that is what it counts. */}
            <p className="text-xs text-muted-foreground">
              {marketKeys.length === 0
                ? "No coins chosen yet."
                : wallet
                  ? `${marketKeys.length} ${plural(marketKeys.length, "coin", "coins")} chosen, all sharing the same wallet.`
                  : `${marketKeys.length} ${plural(marketKeys.length, "coin", "coins")} chosen, ${(marketKeys.length * candlesPerCoin(interval, windowLength)).toLocaleString()} candles to read at ${interval}.`}
              {/* Said whenever the ceiling is in play, so nobody hunts for the
                  coins that would not go in. */}
              {!wallet && full && !over
                ? ` That is as many as fit at ${interval} over ${windowLength.toLocaleString()} ${plural(windowLength, "day", "days")} — shorten the window to hold more.`
                : ""}
              {tradeable
                ? ""
                : wallet
                  ? " These cannot be traded — this exchange gives prices, not orders."
                  : " These can be tested but not traded yet — this one gives prices, not orders."}
            </p>

            {over ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs leading-4 text-destructive">
                <p>
                  This list is longer than one run can hold:{" "}
                  {marketKeys.length.toLocaleString()} coins of {interval}{" "}
                  candles over {windowLength.toLocaleString()}{" "}
                  {plural(windowLength, "day", "days")}, when{" "}
                  {allowed.toLocaleString()} is the most that fits. Nothing will
                  be tested until it comes down.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={() => setKeys(marketKeys)}
                >
                  Keep the busiest {allowed.toLocaleString()}
                </Button>
              </div>
            ) : null}
          </>
        ) : null}
      </InspectorCard>

      <InspectorNote>
        {folderMode
          ? "A flow reads the folder when it starts. A backtest saves the exact coins it read so the result can be repeated."
          : wallet
            ? `Every chosen coin shares the wallet above. Its watched buys compete for the same money, and any buy the wallet cannot afford when its price arrives is refused.`
            : "Every chosen coin shares the one pretend pot from the wallet step above, so twenty coins are competing for the same money — which is what running this for real would be like."}
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
  full,
  onToggle,
}: {
  marketKey: string
  symbol: string
  volume24hUsd: number
  checked: boolean
  /**
   * The list is already as long as this window and candle size allow.
   *
   * Only ever stops an unticked row being ticked — unticking is how somebody
   * makes room, so a chosen row stays live. Refusing the click is the honest
   * end of it: the alternative was accepting the tick and silently dropping it
   * on save, which is a checkbox that does not stay ticked.
   */
  full: boolean
  onToggle: (key: string, on: boolean) => void
}) {
  const blocked = full && !checked
  return (
    <label
      className={
        blocked
          ? "flex items-center gap-2 rounded-md px-2 py-1.5 opacity-50"
          : "flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/60"
      }
    >
      <Checkbox
        checked={checked}
        disabled={blocked}
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
