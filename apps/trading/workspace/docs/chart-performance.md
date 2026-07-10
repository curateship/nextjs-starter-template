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

## What is still "slow" (and why that's OK)

The very first chart opened for a coin pays the ~0.5 s exchange round trip —
there is no local data yet, so that request cannot be skipped. That is the
same request TradingView makes; they are just physically closer to their own
data servers.

## If you touch this code

- Don't paint pre-seed websocket candles. That reintroduces the giant-candle
  flash.
- Don't merge cached bars over a fresh snapshot. Stale partial candles would
  permanently overwrite final ones.
- Keep the cache cap. Unbounded caching across markets adds up quickly at
  5,000 bars per entry.
- Scroll-back history (panning left) is a separate mechanism in
  price-chart.tsx (`loadOlderHlCandles`), cached per market+interval while
  mounted — it is unaffected by this cache.
