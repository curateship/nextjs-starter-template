# QQE + Consolidation — Parameter Optimization Results

July 7, 2026. Sweep of the QQE + Consolidation strategy across the top-10 volume Hyperliquid markets, run headlessly through the real backtest engine (`worker/src/backtest/runner.ts` — identical trade loop to the live bot runner).

## Setup

- **Markets** (top 10 by 24h notional volume with ≥500d history): BTC, ETH, SOL, kBONK, XRP, NEAR, AAVE, SUI, WLD, ADA
- **Timeframe / window**: 4h candles, 500 days (~16.4 months), 1500-bar indicator warmup
- **Sizing**: order size $10,000 on $10,000 starting equity (1× — PnL % reads as raw return, no compounding)
- **Costs**: taker 4.5 bps, maker 1.5 bps, slippage 2 bps
- **Risk limits**: disabled (research mode) — drawdown kill and daily-loss pause off so the strategy itself is measured. Live risk settings would have stopped out the worst drawdowns.
- **Score**: average monthly PnL % across the 10 markets (`netPnlPct / months`, averaged). Target was ≥5%/mo.
- 63 configs in phases A–D (consolidation grid → threshold/smoothing → TP/SL → report), then phases E–F for the swing-base stop. ~750 engine runs total.

## Recommended configuration

| Parameter | Value | Default was |
|---|---|---|
| RSI length / smoothing | 14 / 5 | same |
| Fast QQE factor | 4.238 | same |
| **Threshold** | **8** | 10 |
| MA type / RSI source | EMA / close | same |
| Consolidation filter | **ON** | same |
| Loopback period | 50 | same |
| Min consolidation length | 5 | same |
| **Take profit** | **10%** | off |
| **Stop loss** | **Swing base break, 24 scan / 4 confirm** | off |

**Result: +7.19%/mo average · 25.5% avg max drawdown · 36.4% worst-market drawdown · 63% win rate · profitable on all 10 markets.**

Saved in the app as run groups (backtest dashboard): **"QQE optimized — thr8 sf5 TP10 (agent sweep)"** (v1, no SL) and **"QQE optimized v2 — swing-base SL 24/4 + TP10"** (final).

## Per-market results (final config)

| Market | PnL/mo | Total | Max DD |
|---|---|---|---|
| kBONK | 12.3% | +202% | 25.8% |
| AAVE | 10.8% | +177% | 36.4% |
| NEAR | 9.9% | +163% | 21.2% |
| ADA | 9.1% | +149% | 24.4% |
| SUI | 8.2% | +135% | 23.4% |
| SOL | 7.4% | +122% | 29.5% |
| ETH | 4.7% | +76% | 22.7% |
| WLD | 3.7% | +61% | 30.6% |
| XRP | 3.5% | +57% | 21.6% |
| BTC | 2.3% | +38% | 19.7% |

## What the sweeps established

1. **The consolidation filter is the strategy's core edge.** Filter off: 0.60%/mo. Filter on at defaults: 3.73%/mo. The default zone geometry (loopback 50 / minLen 5) was already near-optimal; longer loopbacks (80–120) over-filter and miss trends, shorter (20–35) under-filter.
2. **Threshold 8 beats 10; 12–15 lose money.** Higher thresholds enter trends late — the win rate collapses (43% → 25%) faster than losers shrink.
3. **RSI smoothing 5 beats 8** across the board (8 delays every cross).
4. **Take profit 10% is the single biggest improvement**: 4.69 → 7.08%/mo and average drawdown 61% → 29%. On 4h crypto, stop-and-reverse rides trends past their peak and gives profits back; banking +10% and waiting for the next signal wins.
5. **Fixed-percentage stop losses are actively harmful** (every fixed-SL variant landed at 1–4%/mo). They realize whipsaw losses that the reversal exit would have recovered.
6. **The contextual swing-base stop is free insurance.** Exit longs when price breaks a swing low that held ≥4 bars (scan 24), shorts on the mirrored swing high. It slightly *improved* returns (7.08 → 7.19%/mo) while cutting the worst-market drawdown 51% → 36% (NEAR: 51% → 21%). Unlike a % stop, it only fires when market structure actually breaks. TP 8% variant: 7.32%/mo at slightly higher DD. Base stop *without* TP: 3.9%/mo — the TP stays essential.
7. **Losing-trade anatomy** (v1 winner, 89 losers): 82 were trend reversals, only 7 pure chop — but **69 of 89 entered within 15 bars of a consolidation zone forming**. The filter can't see zones that haven't confirmed yet. An early-zone detector or entry-confirmation delay is the most promising future lever (needs code, not parameters).

## Drawdown-cap campaign (phases G/H/S/P — July 7, 2026)

Goal: worst-market max DD under a 20% hard cap. Findings:

1. **Higher take profit makes drawdowns dramatically worse**, not better: TP15 → 54% worst DD, TP20 → 83%, TP25 → 101–112%. The equity dips come from trend give-back, which is exactly what a wider TP re-exposes. TP10 stays optimal (TP8 close second).
2. **Tighter swing stops churn**: confirm=2 variants lose 1.5–2%/mo and *raise* DD. `base 12/4` edges out 24/4 (7.23%/mo, same 36.4% worst DD) — the new best single-market config.
3. **Stricter entry filters backfire**: minLen 8–12 / threshold 10 raise worst DD to 56–87% (fewer trades → single bad streaks dominate). Parameter space for the cap: exhausted.
4. **Sizing scales DD linearly** (verified empirically): at 50% order size every market passes the cap (worst 19.1%) but returns drop to 3.61%/mo.
5. **The real answer is the portfolio**: running all 10 markets simultaneously at full per-market size, the combined equity curve does **+118.6% total, 7.22%/mo, with only 8.2% max drawdown** — per-market drawdowns don't align, so they cancel. A 20% cap is beaten 2.4× over with no return sacrificed.

**Recommendation:** deploy as a basket (equal size across the 10 markets, config `lb50/len5 thr8 sf5 TP10 base-stop 12/4`) rather than tightening any single market. Per-market DD then only matters for margin sizing, not account risk.

## Saved run groups (backtest dashboard / `backtests` table)

| Group name | Config | Note |
|---|---|---|
| QQE optimized — thr8 sf5 TP10 (agent sweep) | v1, no SL | first target hit (7.08%/mo) |
| QQE optimized v2 — swing-base SL 24/4 + TP10 | v2 | swing stop added |
| QQE optimized v3 — base 12/4 TP10 (portfolio pick) | **v3 — recommended** | 10 tuned markets, full size |
| QQE v3 half-size — 20% DD cap compliant | v3 at $5k size | every market DD < 20% |
| QQE v3 — 25-market validation (base 12/4 TP10) | v3 | breadth validation, see below |

## 25-market validation (v3 config, July 7, 2026)

Same v3 config run on the top-25 volume markets — 15 of which were **never used in tuning** (nearest thing to out-of-sample this window offers). Newer listings run on their available history (min 600-bar warmup + 1000-bar window).

**Result: 24/25 profitable, average 7.18%/mo — the untuned markets performed as well as the tuned ones.** Standouts: FARTCOIN 16.3%/mo (but 71% DD), ZRO 13.9%, TAO 13.4%/mo at only 10.9% DD, MORPHO 13.1%/mo at 15.2% DD, DOGE 10.9%/mo at 10.3% DD. Sole loser: **BCH −6.4%/mo with a 103% drawdown** — a low-volatility chop market where the always-in reversal bled continuously; single-market tail risk is real.

**Portfolio across all 25 (equal size): +108.6% total, 6.61%/mo, max drawdown 4.8%.** Broader diversification nearly halves the 10-market portfolio's DD again (8.2% → 4.8%) — the BCH blow-up barely dents the basket. This is the strongest risk-adjusted result of the whole campaign.

## 1h timeframe campaign (July 7, 2026) — hypothesis rejected

Tested whether 1h lowers DD/risk vs 4h. Fresh tuning on the 10 core markets (1h, 4500-bar ≈ 187-day window, phases T1–T3, 55 configs), then 25-market validation (saved as run group **"QQE 1h optimized — 25-market validation"**).

Best 1h config differs from 4h in instructive ways: **TP 3%** (1h swings are smaller), **threshold 10 + smoothing 8** (1h RSI is noisier and needs more confirmation — the opposite of 4h's thr8/sf5), same zones (lb50/len5), swing-base 48/4 ≈ no-SL (contextual stops add little at 1h; structure breaks are too noisy).

Results vs the 4h v3 champion:

| Metric | 4h v3 | 1h best |
|---|---|---|
| Profitable markets | 24/25 | 22/25 |
| Avg monthly PnL | 7.18% | 5.83% |
| Portfolio moPnl / maxDD | 6.61% / **4.8%** | 5.82% / 9.0% |
| Avg per-market maxDD | ~26% | 29.5% |
| Trades (BTC, per month) | ~1.5 | ~25 |

**1h is worse on every axis** — lower returns, higher drawdowns (portfolio DD doubles), ~16× the trade count (fee/slippage drag and live execution risk), and BTC actually loses money on 1h. Windows differ (6.2 vs 16.4 months) so the comparison isn't perfectly apples-to-apples, but the direction is unambiguous. **4h remains the deployment timeframe.**

## 8h timeframe campaign (July 7, 2026) — close second, 4h still wins

Added first-class `8h` interval support to the app (candle lists, MS maps, param enums, UI selects — Hyperliquid serves it natively), then ran the same campaign shape: tuning phases U1/U2 on the 10 core markets (500-day window like 4h), 25-market validation saved as run group **"QQE 8h optimized — 25-market validation"**.

Best 8h config: **lb15/len3, threshold 6, sf5, TP10, no SL**. Coarser bars need *faster* zone params (lb15 ≈ 5 days, close to 4h's lb50 in wall time) and a *lower* threshold (6) — each 8h bar carries a bigger RSI move, so waiting for 58 is already late. Swing stops add nothing at 8h (too few bars to define swings; base 6/2 hurts).

| Metric | 1h | **4h v3** | 8h |
|---|---|---|---|
| Profitable markets | 22/25 | 24/25 | 23/25 |
| Avg monthly PnL | 5.83% | **7.18%** | 6.63% |
| Portfolio moPnl / maxDD | 5.82% / 9.0% | **6.61% / 4.8%** | 6.21% / 8.1% |
| Avg per-market maxDD | 29.5% | **~26%** | 38.4% |
| Worst market | −6.3%/mo (AVX) | −6.4%/mo (BCH) | −4.2%/mo, 89% DD (ZEC) |

8h earns close to 4h but with much rougher single-market drawdowns (avg 38%, ZEC hit 89%) and a portfolio DD ~1.7× higher. The timeframe scan now brackets the optimum cleanly: **1h < 8h < 4h** — 4h sits at the sweet spot between hourly noise and 8h coarseness (too few bars for zones and stops to shape risk). Interesting 8h standouts if ever assembling a mixed-timeframe basket: WLD 18.7%/mo (its best timeframe by far), HYPE 12.1%, BLUR 11.6%.

## v4 — trend re-entry: the 10% breakthrough (July 7, 2026)

Goal: 10%+ avg monthly. Free-reign experiment campaign on top of v3 (phases X1–X6, ~40 configs on the 10 tuning markets).

**What DIDN'T work — entry filters.** Volume expansion, candlestick confirmation, higher-timeframe EMA alignment, ADX trend strength, ATR volatility expansion, RSI thrust, loss cooldowns — alone and in combos. Best single gates were noise (±0.05%/mo); every combo was worse than its parts; strict filters (ADX≥25: 2.05%/mo) delete profitable trades. Lesson: v3's entries are already efficient — filters can only remove trades, and the removed trades were net winners.

**What DID work — trend re-entry.** After a TP exit the smoothed RSI is usually still through the threshold, but the counter==1 edge only fires on a *fresh* cross — so the bot banks +10% and then sits out the rest of the trend. New `trendReentry` param: while flat, if RsiMa is still beyond 50±threshold (and not in a consolidation zone), re-enter on a continuation candle (close beyond prior close — the confirm requirement improved both return and DD). `maxReentries` optionally caps re-entries per leg. Productized in the real strategy (schema + engine + UI checkbox), parity-verified against the experiment harness to the exact trade count.

25-market validation (both saved as DB run groups):

| | v3 (no re-entry) | **v4 re-entry** | v4 cap3 |
|---|---|---|---|
| Avg monthly PnL | 7.18% | **10.21%** | 9.57% |
| Profitable markets | 24/25 | 22/25 | 22/25 |
| Portfolio moPnl / maxDD | 6.61% / 4.8% | **9.74% / 14.7%** | 9.21% / 13.1% |

Run groups: **"QQE v4 trend-reentry — 25-market validation"**, **"QQE v4 reentry cap3 — 25-market validation"**.

Trade-off to understand: re-entry ~doubles time-in-market, so single-market drawdowns get violent (SOL hit 102% at full size in its chop phase — it churned re-entries; losers now HYPE/BCH/MON). The portfolio DD rises from 4.8% → 14.7%. **v4 is a portfolio-only strategy**: 10.2%/mo avg at 14.7% basket DD, vs v3's 7.2%/mo at 4.8%. Pick per risk appetite; cap3 sits between. Chart note: re-entry trades don't get Buy/Sell labels (labels mark fresh crosses only, Pine-parity); they're visible in the trades table.

## Caveats

- **In-sample.** All tuning happened on one 500-day window; a walk-forward validation (tune on ~350d, test on the held-out ~150d) is the right next step before trusting these numbers live.
- **Research risk limits.** With production risk params, the 20% max-drawdown kill would have halted several markets mid-run.
- kBONK/AAVE carry the average; BTC/XRP/WLD are the weak markets. A market allowlist is a legitimate lever but increases overfit risk.
- Raw sweep JSONs (all 63+ configs, per-market breakdowns) were kept in the July 7 session scratchpad; the winning configs are reproducible from the parameters above on any window.
