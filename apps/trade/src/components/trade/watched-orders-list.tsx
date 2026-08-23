import * as React from "react"

import { TriangleAlertIcon } from "lucide-react"

import { LoadingRow } from "@/components/ui/loading-row"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useEffectBeforePaint } from "@/lib/hooks/use-effect-before-paint"
import { focusRing } from "@/lib/layout/focus-ring"
import { marketSymbol } from "@/lib/protocols/contracts"
import { formatAway, formatPrice, formatUsd } from "@/lib/trade/format"
import type { LiveRefusal } from "@/lib/trade/live"
import { useLiveMarks } from "@/lib/trade/live-market"
import type { PaperOrder } from "@/lib/trade/paper"
import { watchReached } from "@/lib/trade/watch-order"
import {
  readWatchedCache,
  toWatchedLevel,
  writeWatchedCache,
  type WatchedLevel,
} from "@/lib/trade/watched-cache"
import { cn } from "@/lib/utils"

/**
 * Every price you are waiting on, in the left panel beside Fav and All.
 *
 * A plain order does not rest on the exchange any more — the app holds the
 * level and only sends anything once the market comes to it, which is what
 * `watched-orders.md` calls a watch. Those levels are drawn on the chart of
 * the coin they belong to and listed in Open orders mixed in with everything
 * else, so the one question they never answered was "what am I waiting on
 * across all my coins". This tab is that answer, and pressing a row charts
 * the coin.
 *
 * Only prices placed by hand reach here. A flow never creates one: a watch is
 * what a hand-placed order becomes, and a flow's orders belong to its own run.
 *
 * The panel OPENS on this tab, so its empty state is the first thing on screen
 * on the days nothing is waiting. That is why the empty wording says where the
 * markets went as well as how a price gets here.
 *
 * **It opens on the levels this browser saw last time.** The trading read
 * takes about three and a half seconds, so waiting for it meant a spinner on
 * the first thing anybody looked at, every visit. `watched-cache.ts` explains
 * what is kept and why it is never trusted. The rows arrive silently and the
 * first real read replaces them a moment later, whether it agrees or not.
 * Nothing marks them while that is happening: Tyler asked for the wait to go
 * away, and a line saying "checking" is the wait wearing a different hat. A
 * read that REFUSES is the one case that still speaks up, because then
 * nothing is coming to correct them.
 */
export function WatchedOrdersList({
  orders,
  cacheScope,
  refusals,
  walletName,
  settled,
  failed,
  onRetry,
  onSelectMarket,
}: {
  /** Watched prices wearing an order's clothes, from the trading hook. */
  orders: readonly PaperOrder[]
  /** Which account and exchange these belong to; see `watched-cache.ts`. */
  cacheScope: string
  /**
   * The last refusal on each market. A level whose order the exchange keeps
   * refusing looks exactly like one quietly waiting, and that is the whole
   * reason this list could not answer "why has nothing happened".
   */
  refusals: ReadonlyMap<string, LiveRefusal>
  walletName: (walletId: string) => string
  /**
   * Both halves of the read have landed. See `settled` on `Trading`.
   *
   * Not `loading`, which turns false the moment EITHER half lands. This list
   * spans practice wallets and real ones together, so half an answer is not
   * an answer: with every waiting level on a real wallet, the practice half
   * landing on its own says "none" and means "not yet".
   */
  settled: boolean
  /** The first read failed and there is nothing to fall back on. */
  failed: boolean
  onRetry: () => void
  onSelectMarket: (marketKey: string) => void
}) {
  // Read a beat after the first render, never during it: this page renders on
  // the server too, and the server has no localStorage. Reading it up front
  // would make the two renders disagree.
  const [cached, setCached] = React.useState<readonly WatchedLevel[] | null>(
    null
  )
  useEffectBeforePaint(() => {
    setCached(readWatchedCache(cacheScope)?.rows ?? null)
  }, [cacheScope])

  // Handed over on every read that lands. Writing the same thing twice is
  // `writeWatchedCache`'s problem, not this component's — it compares before
  // it writes, so a poll that changed nothing costs one string comparison.
  React.useEffect(() => {
    if (!settled || failed) return
    writeWatchedCache(cacheScope, orders)
  }, [orders, settled, failed, cacheScope])

  // Newest first, and it stays that way while prices move. Sorting by how
  // close each level is would reshuffle the list under the pointer every
  // second, and the row you came here to press would not be where you left it.
  const fresh = React.useMemo(
    () =>
      [...orders]
        .sort((left, right) => right.createdAt - left.createdAt)
        .map(toWatchedLevel),
    [orders]
  )

  // **The cache stands in until this session has a WHOLE answer of its own,
  // and never again after that.** A read that refuses halfway through the
  // afternoon must not quietly put this morning's levels back over the ones
  // on screen, and a read that came back with nothing must not have old rows
  // resurrected over it. Tracked here rather than off `settled`, which turns
  // true on a failure as well as on an answer.
  //
  // Adjusted during render, the way `MarketIcon` does it: React re-runs the
  // render immediately without painting in between, so the swap from the
  // cached rows to the real ones happens in one frame.
  const [answered, setAnswered] = React.useState(false)
  if (!answered && settled && !failed) setAnswered(true)
  //
  // **A cache that says "you had none waiting" stands in too.** It is the same
  // answer at the same age as a cache of three levels, and leaving it out was
  // why an exchange with nothing waiting still sat on the spinner for four
  // seconds — the whole complaint, on the empty case. `null` is the only
  // thing that means no cache: an empty list is a picture, not a blank.
  const standingIn = !answered && cached !== null
  const rows = standingIn ? cached : fresh

  const marks = useLiveMarks(rows.map((row) => row.marketKey))

  // The wallet is named on a row only when the list spans more than one.
  // The panel is a couple of hundred pixels wide, and with every level in the
  // same wallet its name is the same word on every row — it pushes the level
  // and the distance into an ellipsis to say nothing.
  const severalWallets = new Set(rows.map((row) => row.walletId)).size > 1

  return (
    // Same viewport override the market list uses: Radix wraps its content in
    // a `display: table` box that sizes to its widest row instead of to the
    // panel, which would push the dollar figure out of sight.
    <ScrollArea className="h-full" viewportClassName="[&>div]:block!">
      {failed && !standingIn ? (
        // "Nothing is waiting" and "I could not find out" are different
        // answers, and only one of them is safe to act on.
        <p className="px-3 py-8 text-center text-xs text-muted-foreground">
          The watched prices could not be read, so it is not known what is
          waiting.{" "}
          <button type="button" className="underline" onClick={onRetry}>
            Try again
          </button>
        </p>
      ) : !answered && !standingIn && rows.length === 0 ? (
        // Only when there is genuinely nothing to draw. A half-landed read
        // that DID bring levels draws them at once — the spinner is what
        // stands between somebody and their own levels, and this tab was
        // built to get rid of it.
        <LoadingRow
          label="Reading your watched prices"
          className="py-8 text-xs"
        />
      ) : (
        <div className="flex flex-col">
          {/* Above whatever follows, rows or the empty wording alike: a read
              that refused must never let "nothing is waiting" pass as this
              session's own answer. */}
          {standingIn && failed ? (
            <StaleAfterFailureNote onRetry={onRetry} />
          ) : null}
          {rows.length === 0 ? (
            // The panel opens on this tab, so an empty one is the first thing
            // on screen most days. It has to point at the markets, which are
            // now the click behind it, rather than leave the panel looking
            // broken.
            <p className="px-3 py-8 text-center text-xs text-muted-foreground">
              Nothing is waiting at a price. Right-click the chart where you
              want to buy or sell — the order you place there waits here until
              the market reaches it. The markets themselves are under Fav and
              All.
            </p>
          ) : (
            <div className="flex flex-col p-1">
              {rows.map((row) => (
                <WatchedRow
                  key={row.id}
                  level={row}
                  wallet={severalWallets ? walletName(row.walletId) : null}
                  mark={marks.get(row.marketKey) ?? null}
                  refusal={refusals.get(row.marketKey) ?? null}
                  onSelect={() => onSelectMarket(row.marketKey)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </ScrollArea>
  )
}

/**
 * The line shown when the read REFUSED and these rows are all there is.
 *
 * **Only on failure.** A "checking these are still waiting" line used to sit
 * here for the second or two of a normal load and Tyler asked for it gone on
 * 21 Aug 2026: the read lands almost at once, the levels almost never differ,
 * and a spinner on the first thing he looks at every visit was the whole
 * problem he asked to be rid of.
 *
 * A failed read is not that. Nothing is coming to correct these rows, so old
 * levels have to say they are old and offer the way to try again — otherwise
 * a level that filled overnight sits here looking live with nothing on screen
 * admitting the app never checked.
 */
function StaleAfterFailureNote({ onRetry }: { onRetry: () => void }) {
  return (
    <p className="flex items-center gap-1.5 border-b px-3 py-1.5 text-xs text-muted-foreground">
      {/* Says nothing about how many, because it sits above the "nothing is
          waiting" wording just as often as above rows — an exchange with no
          levels last time still has to admit the read failed. */}
      <span className="min-w-0 flex-1">
        The read failed. This is what was here last time.
      </span>
      <button type="button" className="shrink-0 underline" onClick={onRetry}>
        Try again
      </button>
    </p>
  )
}

/**
 * One waiting price: the coin, the level, how far the market is from it, and
 * what it will spend when it fires.
 *
 * **Two lines of two columns, both right-hand columns fixed.** The panel is a
 * couple of hundred pixels wide, so anything laid out as one long sentence
 * ends in an ellipsis before it reaches the number that matters. The coin and
 * the level give way first; the stake and the distance never do.
 *
 * The whole row is the one button and it charts the coin, the same press the
 * market rows above it answer to. Cancelling stays where it already is — the
 * × in Open orders and the line on the chart — rather than becoming a second
 * place to call the same order off.
 */
function WatchedRow({
  level,
  wallet,
  mark,
  refusal,
  onSelect,
}: {
  level: WatchedLevel
  /** Named only when the list spans several wallets; null when it does not. */
  wallet: string | null
  /** Today's price, or null when the feed has not said one yet. */
  mark: number | null
  /** The last thing the exchange said no to on this market, if anything. */
  refusal: LiveRefusal | null
  onSelect: () => void
}) {
  const symbol = marketSymbol(level.marketKey)
  const line = watchedLevelLine(level, mark)
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex min-w-0 items-start gap-2 rounded-lg px-3 py-1.5 text-left hover:bg-muted/50",
        focusRing
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span
            title={symbol}
            className="min-w-0 flex-1 truncate text-sm font-medium"
          >
            {symbol}
          </span>
          <span className="shrink-0 text-xs tabular-nums">
            {formatUsd(level.px * level.sz)}
          </span>
        </span>
        <span className="flex items-baseline gap-2 text-xs leading-4 text-muted-foreground">
          <span className="min-w-0 flex-1 truncate">
            {/* The colour is decoration; the word is the answer, so a row
                still reads right to anyone who cannot tell the greens from
                the reds. */}
            <span
              className={
                level.side === "buy"
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-red-600 dark:text-red-400"
              }
            >
              {level.side === "buy" ? "Buy" : "Sell"}
            </span>{" "}
            {line.at}
            {wallet ? ` · ${wallet}` : ""}
          </span>
          <span className="shrink-0 tabular-nums">{line.away}</span>
        </span>
        {refusal ? <RefusalNote refusal={refusal} /> : null}
      </span>
    </button>
  )
}

/**
 * Why this level has not fired, under the level it belongs to.
 *
 * **A refused level is indistinguishable from a patient one without it.** The
 * engine works in the background with nobody watching, so a refusal has no
 * press to throw back to and never became a toast; it went into a table
 * nothing read. On 21 Aug 2026 a Phemex level was refused twenty times over
 * eighteen minutes — the market was at the exchange's open-interest cap and
 * would not accept anything that opened a position — and this row said
 * "waiting" the whole time.
 *
 * **The triangle carries it as much as the colour does.** The panel is a
 * couple of hundred pixels wide so the sentence is clamped to two lines, with
 * the whole of it on the row's own tooltip; the standard's rule against
 * saying anything in colour alone is why the icon is not decoration.
 *
 * Nothing here offers a way to retry. The engine is already retrying — that
 * is what made twenty rows — and a button promising to do again what is
 * happening anyway would be a lie about who is stuck.
 */
function RefusalNote({ refusal }: { refusal: LiveRefusal }) {
  return (
    <span
      title={refusal.note}
      className="mt-0.5 flex items-start gap-1 text-xs leading-4 text-destructive"
    >
      <TriangleAlertIcon aria-hidden className="mt-0.5 size-3 shrink-0" />
      {/* `anywhere` rather than plain wrapping: an exchange's own code comes
          through as one unbroken token — `PHEMEX_11150:TE_OI_LIMIT_REDUCE_ONLY`
          — and a word longer than the panel runs off the edge instead of
          wrapping. Seen on the real panel at 296px on 21 Aug 2026. Ordinary
          sentences are unaffected, because it only breaks where it must. */}
      <span className="line-clamp-2 min-w-0 flex-1 [overflow-wrap:anywhere]">
        {refusal.note}
      </span>
    </span>
  )
}

/**
 * The level a watch is waiting at, and how far today's price is from it, as
 * the row's two columns.
 *
 * "Reached" uses the same rule the engine does, so the list and the engine can
 * never disagree about whether a price has arrived. Without a live price the
 * distance column is empty — a distance from a price nobody has quoted would
 * be made up, and a dash there would read as zero.
 */
export function watchedLevelLine(
  level: Pick<WatchedLevel, "side" | "px">,
  mark: number | null
): { at: string; away: string } {
  const at = `at ${formatPrice(level.px)}`
  if (mark === null || level.px <= 0) return { at, away: "" }
  if (watchReached({ side: level.side, triggerPx: level.px }, mark)) {
    return { at, away: "reached" }
  }
  return {
    at,
    away: `${formatAway(Math.abs(mark - level.px) / level.px)} away`,
  }
}
