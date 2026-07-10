# DCA Ladder — Honest Validation (fixed fill engine)

July 9, 2026. After the take-profit fill bug was found and fixed (see
`back-testing-rule.md`, "Sanity-check fill prices"), every strategy was
re-judged on the fixed engine. The DCA ladder is the one that survived.

> **July 10, 2026 — 1h-candle inflation re-confirmed on the product engine.**
> A BTC-only 5.5-year run of the default 1% ladder at 1h (group `de95fe01`)
> showed +147% (2.2%/mo). Cycle reconstruction from its fills: 30% of cycles
> closed a dip-buy AND the TP inside the same 1h bar — 57% of all closed
> profit rode on the engine's dip-first bar walk (open→low→high for longs).
> Re-runs: 15m covered the full window → **+51.5% over 5.5y ≈ 0.78%/mo
> honest** (group `e8e582e7`). The 5m run (`b6fd2932`) was silently
> TRUNCATED to Jan–Aug 2021 by the candle fetcher's 60k-bars-per-fetch cap
> (see bug note below). Matched-window check (Jan 17–Aug 14, 2021):
> 1h +78.7% / 15m +47.6% / 5m +49.5% — 15m and 5m agree, 1h ~1.6× inflated.
> Verdict: judge 1% ladders at 15m or finer; the 1h number was ~3× high.
> Sobering detail: on 15m, +47.6 of the +51.5 points came from Jan–Aug 2021
> (the hyper-volatile bull/crash) — the following ~5 years added ≈ nothing
> on BTC.
>
> **Candle-cache bug found and FIXED the same day:** one fetch topped out
> at 60,000 bars (`MAX_BARS_PER_FETCH`), and gap-filling always extends
> forward from the cached tail. A 5m request whose window sat years past
> the cached tail downloaded 60k bars, never reached the window, and the
> run errored "No candle history" (or worse, was silently truncated —
> that's what clipped the 5m re-check above to Aug 2021). Fix in
> `binance-history.ts`: a fetch now pages until the requested range is
> covered; the cap survives only as a 4M-bar runaway backstop that THROWS
> instead of truncating. Verified by re-running the failed BTC 5m Feb–Jul
> 2026 run (group `c5ad55f1`): downloaded the 3-year gap (~336k candles,
> ~3 min) and completed — 43 trades, −6.5%. BTC 5m cache now spans
> Jan 2021 → Jul 2026.

## The strategy

Long-only buy-the-dip ladder: buy a small base order, add a bigger buy every
1% the price falls (8 add-ons, each 1.75× the last), sell everything at 1%
above the average entry, repeat. No stop-loss. Fixed order sizes on $10,000
per market. All orders are resting limit orders — which is why the fill bug
never touched this strategy's numbers.

Params: `priceStep 1% · stepMultiplier 1 · sizeMultiplier 1.75 · 8 safeties ·
TP 1% · base/safety $85.51 · direction long`.

## Headline results — by the back-testing rules (saved + pinned in the dashboard)

Per `back-testing-rule.md`: 20+ markets across volatility tiers, 4 bps
slippage, and the bet capped at a **normal 1× bet** — the ladder scaled so its
maximum deployment equals the account (base order $49.04 → $10k max on $10k).

| Test | Window | Markets | Return | Combined DD | Green |
|---|---|---|---|---|---|
| **Walk-forward (unseen data)** | Jun 2024 – Dec 2025 (570d) | 26 | **3.8%/mo** | −7.8% | 21/26 |
| **2022 bear stress** | Nov 2021 – Jan 2023 (419d) | 20 | **+2.9%/mo** | −5.4% | 13/20 |

That is the honest, rule-compliant number: **~3–4%/month out-of-sample,
positive even through the 2022 bear** — inside the rules' 3–6% realistic
target band. Groups: `ca8bcc3e` (walk-forward), `73bf8c13` (bear).

Earlier same-day exploratory groups used the original 1.74×-max ladder
(base $85.51) and smaller baskets — those showed ~10.3%/mo OOS and +5.3%/mo
through the bear, roughly the same edge amplified by the bigger bet. They are
archived in the dashboard (violates the "normal bet" and 20-market rules; kept
for reference). Returns scale ~linearly with ladder size, so sizing between 1×
and 1.75× trades return for drawdown — decide with eyes open, judge at 1×.

In the bear, high-volatility coins (SOL, DOGE, ADA, LTC, DOT) cycled thousands
of profitable 1% bounces on the way down, while low-bounce grinders (BTC, ETH,
LINK) ate deep bags. All numbers are marked-to-market including open bags at
the window end.

## Known risks and open caveats — read before going live

1. **A dead coin wipes its account.** The ladder has no stop; a coin that goes
   to ~zero (LUNA-style) loses that market's full $10k. The 2022 test could
   only include coins that still exist — survivorship. Mitigation: many
   markets, majors + liquid mid-caps only, never junk.
2. **Full ladder ≈ 1.75× leverage.** At max depth the position is ~$17.5k on
   $10k equity. Fine for majors on cross margin; deadly on something that
   halves overnight.
3. **Funding is not simulated.** The ladder holds longs through drawdowns;
   in bull regimes longs pay funding (helps in bears, when shorts pay).
4. **Limit fills are assumed on touch.** The engine fills a limit the moment
   price touches it; real orders sit in a queue. With 1% profit cycles this
   optimism matters — only paper trading measures it (next step per the
   back-testing rules).
5. Per-market drawdowns run 30–55% even when the portfolio DD is single-digit.
   Judge by the portfolio, but expect ugly individual accounts.

## What's dead

- **QQE (all configs):** the 1h "17%/month" and 4H v4 "10.18%/mo" results were
  the fill bug. Honest re-checks: 1h config loses on 30/40 markets; 4H v4 does
  ~2%/mo with blown accounts along the way (saved as group `87833873`,
  "QQE-4H v4 HONEST re-check"). Groups preserved in the dashboard.
- **Momentum ensemble (10.6%/mo):** its ADX/vol-target/ATR-stop/MACD/re-entry
  code was never committed (lost in the earlier code reset). The kit was
  **rebuilt on July 9, 2026** (ADX gate, ATR chandelier stop, MACD filter,
  trend re-entry, vol-target sizing — all with honest trigger-level fills) and
  re-campaigned by the rules: tuned on Jun 2023–Jun 2025, walk-forwarded on
  Jun 2025–Jul 2026. Honest result at 1×: in-sample ~5.4%/mo tunes down to
  **1.6%/mo out-of-sample with a −33% drawdown** (2022 bear: ~1%/mo). The ATR
  stop *hurt* everywhere (whipsaw) — best form was plain EMA 16/140 cross +
  MACD filter, no stop. The old 10.6% number was 1.8× sizing on a friendlier
  window. Saved as groups `3bfd4269` (walk-forward) and `fa572da8` (bear).

## Vol-basket tight ladder — the July 9 evening campaign (current best)

Search discipline: 12 ladder variants tuned ONLY on Jun 2024–Dec 2025, on a
basket picked by a rule (top-14 coins by realized volatility over the 60 days
*before* each window — no hindsight). Finalists judged on three untouched
windows. A 1-hour-candle artifact was caught and corrected: ladders whose full
cycle fits inside one bar harvest the bar's extremes artificially, so all
final numbers are from **15-minute replays** (the honest resolution — 1h
numbers for tight ladders were inflated ~30% in bulls and ~4× in the bear).

Winner: **0.5% step / ×1.75 / TP 0.5% / 8 safeties, 1× (base $49.04), long,
vol-rule basket** — saved as three pinned groups (`4b958565` OOS-A, `f3f41308`
OOS-B, `4194b87d` bear):

| Window (all 15m, 1×, 4bps) | Return | Combined DD | Green |
|---|---|---|---|
| Tuning window (for reference) | 3.0%/mo | −14.1% | 9/14 |
| OOS-A 2023-01→2024-06 | **7.6%/mo** | −11.3% | 14/14 |
| OOS-B 2025-12→2026-07 | **13.2%/mo** | −3.5% | 12/14 |
| 2022 bear | **+2.5%/mo** | −11.1% | 6/14 |

Pre-registered acceptance bar (set before the final run): worst window ≥ 0 ✓,
DD ≤ 15% ✓, three-window average ≥ 8%/mo — **scored 7.75, narrowly failed**.
Duration-weighted across all 4.7 years: **~5.5%/mo at 1×**. A 7d/14d trend
filter was built and tested; it improved the tuning window but degraded both
honest windows and the bear → **rejected** (feature exists, off by default —
`trendFilterDays`, validated-against July 9 2026).

Unpriced residual risks (why paper trading is the gate): funding costs on the
always-long inventory, limit fills assumed on touch (still optimistic at 15m
for 0.5% cycles), and universe survivorship (delisted coins absent).

## What "10%/month" costs

The honest blended edge at 1× is ~5.5%/mo (2.5 in a deep bear, 8–13 in
normal/bull regimes). Reaching a steady 10%/mo therefore requires ~1.8×
ladder sizing — DD scales to roughly −20/−25% and a dead coin costs ~1.8× its
slot. That is a leverage decision on top of a real edge, not a better
strategy, and it must survive paper trading first.

## Next steps (per back-testing-rule.md, never skip)

1. Measure real slippage/queue behavior at our order size on Hyperliquid.
2. Paper-trade the DCA ladder live (fake money, real prices) — the only test
   of real fill quality for a 1%-cycle strategy.
3. Only then consider live sizing.


## The wider hunt (July 9, late evening) — literature-sourced families

Per the "search the web" directive, families with published evidence were
tested with the same tune-once/judge-on-three-windows discipline (weekly
rebalance, real rotation costs, 1×):

- **Cross-sectional momentum rotation** (long strongest / short weakest by
  trailing return; the best-documented crypto anomaly): best tuned variant
  2.75%/mo in-sample; judged windows 0–4.5%/mo with −10 to −29% DD,
  inconsistent. Long-only variants: −50/−70% DDs. The anomaly has decayed
  post-2022. Rejected.
- **Short-term reversal** (literature: prior-day losers outperform): −3 to
  −4.6%/mo after costs. Rejected.
- **Funding carry** (literature): real but ~1–1.5%/mo, near-zero DD — a
  stabilizer, not an engine. Not simulated (needs funding history); on the
  shelf.
- **Wick-catching / liquidation-cascade liquidity provision**: NOT testable
  honestly with an OHLC-candle fill model — resting-limit fills at wick
  extremes are exactly the optimism our fill discipline forbids. Only paper
  trading can evaluate it.

## The honest ceiling (statement of record)

After QQE, VWAP, time-series momentum (rebuilt kit), grid-family ladders,
cross-sectional momentum, and reversal — all judged at 1× with honest fills
on multi-regime windows — the best honest edge found is ~5.5%/mo blended
(the vol-basket ladder; family rejected by Tyler for bag risk, and its
selection rule carries design-leakage caveats). Everything else sits at
0–4%/mo or fails. **A steady 10%/mo at 1× was not found and, per the
back-testing rules' own ceiling clause, may not exist with these tools.**
Reaching 10 requires disclosed leverage (~1.8× on the ladder edge) or
accepting regime dependence (the current regime pays ~13%/mo honestly; full
cycles average far less). Note: every additional family tested against the
same three windows erodes their out-of-sample status (multiple testing) —
continuing to mine them would manufacture a false winner eventually, which
is the statistical form of faking results. The next honest test for any
candidate is FORWARD: paper trading.
