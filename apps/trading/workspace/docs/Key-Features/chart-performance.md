# Chart Performance

How the trading chart loads candles fast, and the rules that keep it honest.
All of this lives in `useCandles` (src/lib/hl/hooks.ts) and the paint logic in
src/components/chart/price-chart.tsx.

## The problem this solves

Switching timeframe (or market) used to feel slow, with two symptoms:

1. **A ~1 second wait on every switch.** The chart threw away its data and
   re-downloaded the full history from Hyperliquid every time.
2. **A "giant candle" flash.** The live websocket delivers the current candle
   almost instantly after a switch — the chart painted that single candle and
   zoomed to fit it, then repainted correctly when the history arrived.

Measured fact: a history download (`candleSnapshot`) takes ~400–550 ms
**regardless of how many bars are requested** (tested 600 vs 5,000 bars).
The cost is the network round trip to the exchange, not the payload. So
"request fewer bars" does not make switching faster — avoiding the request
entirely is the only win.

## What the app does now

### 1. In-memory candle cache

Every `network:coin:interval` the user has viewed keeps its last-known candles
in a module-level cache. Switching back to a cached timeframe paints
instantly from memory.

- The cache is FIFO-capped at 36 keys (about six coins × six timeframes) so
  it cannot hoard memory.
- While a timeframe is on screen, every live websocket tick refreshes its
  cache entry — so switching back later seeds with bars as fresh as when you
  left.

### 2. Background prefetch of the other timeframes

As soon as a coin's active chart finishes its first load, the app quietly
fetches that coin's **other five timeframes** into the cache. Result: even
the first click on a never-visited timeframe is instant. Prefetch is
best-effort — if it fails, the normal on-demand fetch still covers it.

### 3. Stale-while-revalidate, with a strict freshness rule

An instant paint from cache is *last-known* data. A fresh snapshot is always
fetched behind it and replaces the display wholesale ~0.5 s later.

**Rule: a cached bar must never override its fresh snapshot version.** Only
candles streamed by the websocket *during* the in-flight snapshot are merged
over it (the exchange snapshot may lag the stream by a tick). Cached bars are
deliberately excluded from that merge — they can be minutes old.

### 4. Hold candles back until seeded (the giant-candle fix)

`useCandles` returns an empty list until the first full history (from cache
or network) has seeded. The lone websocket candle that arrives first is kept
internally and merged in later, but never painted alone. On a cold load the
chart shows its previous content plus a "Loading … candles" note instead of
one zoomed-in bar.

### 5. Reconcile the chart, never rebuild it

Every candle the chart is handed triggers a repaint of everything derived from
it. During a practice replay at 60× that happens sixty times a second, so the
repaint has to be proportional to *what changed*, not to how much history is
loaded. Four rules make that true:

- **Candles are appended, not re-sent.** When the new array is the old one
  plus bars on the right, each new bar is pushed individually instead of
  re-sending thousands. Falls back to a full repaint whenever that isn't
  strictly true — older bars changed colour, history was prepended, the
  timeframe changed.
- **Indicator lines are appended too.** EMA, Bollinger, RSI and MACD all read
  only the past, so appending bars can't change an earlier value.
- **Overlay lines and zones are matched by what they draw**, not by the id the
  indicator gave them. Indicator ids are bar-index based, so an untouched
  swing line or chop box would otherwise be handed a brand new id — and a
  brand new series — every time the window slid by a bar.
- **Base marks are keyed by their span and price.** A mark that didn't move
  keeps the series it already has.

Creating and destroying chart series is by far the most expensive thing this
component can do: each one re-lays-out the whole chart. Tearing them all down
and rebuilding them each frame is what made a long replay session get slower
the longer it ran, and made anything pinned to the chart appear to jump.

### 6. Re-offset the view when bars fall off the left

A replay eventually hits the parent's candle ceiling, and from then on every
bar added on the right drops one off the left. That shifts every bar's index
down by one, so the visible range has to be re-offset by the same amount or
the view creeps a bar per frame — which reads as the chart "skipping around"
the longer a session runs.

## What is still "slow" (and why that's OK)

The very first chart opened for a coin pays the ~0.5 s exchange round trip —
there is no local data yet, so that request cannot be skipped. That is the
same request TradingView makes; they are just physically closer to their own
data servers.

## Market list loading

The Trade workspace loads the market catalog once and shares it with the
market panel. Market names and exchange details are saved in the current
browser, rendered immediately on later visits, and refreshed in the
background. Live price, volume, funding, and open-interest fields show a dash
until the shared market stream supplies current values. Newly listed or
delisted markets are picked up by the background refresh.

## If you touch this code

- Don't paint pre-seed websocket candles. That reintroduces the giant-candle
  flash.
- Keep indicator signal arrows pinned to their exact price in Lightweight
  Charts' native marker layer. HTML overlays can read coordinates before a
  resize or timeframe reflow finishes and visibly detach from their candles.
- Don't merge cached bars over a fresh snapshot. Stale partial candles would
  permanently overwrite final ones.
- Keep the cache cap. Unbounded caching across markets adds up quickly at
  5,000 bars per entry.
- Scroll-back history (panning left) is a separate mechanism in
  price-chart.tsx (`loadOlderHlCandles`), cached per market+interval while
  mounted — it is unaffected by this cache.
- Don't go back to removing and re-adding chart series on every repaint. It
  looks harmless at one bar a minute and is ruinous at sixty bars a second.
- Don't key a chart series off an indicator's own id. Those ids count bars, so
  they change under you the moment the window slides.
- Don't ask the time scale to place a bar index that runs past the chart's
  right margin. It returns 0 rather than refusing, and 0 is a legal coordinate
  — so the caller can't tell the difference and silently pins that edge to the
  left of the pane. Drawing anchors in the empty space right of the newest
  candle are extrapolated by hand from the last two real bars instead
  (`anchorX` in price-chart.tsx). Getting this wrong makes a position box drawn
  ahead of the playhead flash out to the full width of the chart.
