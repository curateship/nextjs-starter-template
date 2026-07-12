# VWAP Strategy — Build, Backtesting, and Findings

July 8, 2026. This documents everything built and learned while adding a VWAP
strategy to the trading app: the strategy itself, the backtesting campaign
(including several honest course-corrections), a dashboard bug that was
inflating results, a performance fix, and a new walk-forward validation feature.

**Headline finding:** at *realistic* slippage for our $2k order size (~0.10%),
the strategy is **roughly breakeven across a broad basket** — a real but fragile
edge that profits in choppy markets and loses in trends. It is **not deployable
with real money yet.** The full slippage analysis (§6) is the most important part
of this document; read it before trusting any earlier number.

Plain-language summaries are marked **In plain English** throughout.

---

## 1. What VWAP is and the strategy we built

**VWAP** = Volume-Weighted Average Price. It's the average price of a market
over the day, weighted by how much volume traded at each price. It resets at
midnight UTC every day. Traders treat it as a "fair value" line for the session.

The strategy trades VWAP two ways (you pick one per run via the **Mode** field):

| Mode | Idea | Entry | Exit |
|---|---|---|---|
| **Reversion** (band fade) | Price that stretches far from fair value tends to snap back | Go long when price drops `k` standard-deviations **below** VWAP; short when it stretches above | Back at the VWAP line, or the opposite band |
| **Cross** (trend) | Price reclaiming/losing fair value signals a trend | Go long when the candle closes **above** VWAP; short when it closes below | On the opposite cross, or a stop |

**In plain English:** *Reversion* bets that extreme moves reverse (buy the dip
back toward average). *Cross* bets that breaking through the average continues.
Reversion is the one that tested best on 15-minute charts.

### Parameters (the complete list — nothing hidden)

`mode · interval · bandK (σ) · exitAt · direction · orderSizeUsd · takeProfitPct · stopLossPct`

- **bandK** — how many standard deviations from VWAP counts as "stretched" (reversion only). Higher = rarer, more extreme entries.
- **exitAt** — reversion target: the `vwap` line (tight) or the opposite `band` (wide).
- **direction** — long only / short only / both.
- **orderSizeUsd** — dollars per trade. This also *is* your leverage (see §9).
- **takeProfitPct / stopLossPct** — optional hard exits.

That's the entire strategy. A "sweep" (§12) tries **combinations** of these same
few knobs — e.g. 4 band widths × 2 exit targets × 3 stop-losses = 24 configs —
which is where "dozens of configs" comes from. There are no secret parameters.

---

## 2. Where it lives in the code

| File | What it does |
|---|---|
| `src/lib/strategies/indicators.ts` | `vwap()` (line) and `vwapBands()` (line ± k·σ), both reset per UTC day |
| `src/lib/strategies/params.ts` | `vwapParamsSchema` — the parameter definitions and validation |
| `worker/src/strategies/vwap.ts` | The strategy logic (entries, exits, order sizing) |
| `worker/src/strategies/registry.ts` | Registers `vwap` so the backtest engine and live bot both use it |
| `src/lib/api/backtests.ts` | Backtest server functions, including the new walk-forward one |
| UI: `strategy-param-fields.tsx`, `new-run-dialog.tsx`, chart overlays | The modal fields and chart drawing |
| Tests: `worker/src/strategies/vwap.test.ts`, `indicators.test.ts` | Verify entries/exits and the band math |

The backtest engine (`worker/src/backtest/runner.ts`) is the **same code the live
bot runs**, so a backtest replays the exact trade logic that would execute for real.

---

## 3. The backtesting journey (and the mistakes caught along the way)

This is the honest sequence, because the wrong turns are as instructive as the result.

### 3a. First sweep on ETH only — looked amazing, was overfit
Optimizing only on ETH 15m produced `k3 exit:band` at "1.25%/day." **But that
number came from two illusions:**
- It was run at **2× leverage** (order size $20k on $10k equity), which doubles
  both return *and* risk — not a better edge.
- It was tuned to **one coin**.

### 3b. Cross-market check — confirmed the overfit
Running that exact ETH config on other markets at 1× (no leverage tricks):

| Market | Return/day | | Market | Return/day |
|---|---|---|---|---|
| ETH | +0.63% | | SOL | **−0.51%** |
| BTC | +0.48% | | ARB | **−0.61%** |
| | | | LINK, DOGE, AVAX, BNB | all negative |

Only the two majors worked. **A −50% result on an alt was real** — the config
was curve-fit to ETH, and running it at 2× on a losing market doubled the loss.

### 3c. Portfolio sweep across 20 markets — the right way to optimize
Scoring by the **diversified basket** (not one lucky coin) picked a *different*
band width — `k1.5`, not `k3` — proving `k3` was ETH-specific noise. At 1× it
made ~0.67%/day at ~10% portfolio drawdown with 19/20 markets green.

### 3d. The 2%/day trap — leverage hiding a blow-up
Cranking that to 3× leverage "hit" 2%/day. But one market (WLD) showed a **120%
drawdown** — meaning that sub-account would have been **liquidated** in reality.
The backtest doesn't model liquidation, so it kept trading a dead account, and
diversification hid it behind winners like NEAR (+241%). **That 2%/day was fake.**

Fix: the sweep now **rejects any config where a single market draws down past
70%** (near-liquidation). With that guard, **1%/day was not reachable** honestly
within a 30% drawdown cap — the best was ~0.56%/day.

### 3e. Adding real slippage — killed a "winner"
Adding 5 bps slippage per fill (realistic execution cost) exposed that the
low-drawdown config `k2.5 exit:vwap` was actually a **net loser** — its tight
"revert to the VWAP line" exit banks many small wins that the round-trip cost
eats. The config that *survived* slippage exits at the wider opposite band.

**In plain English:** every time we made the test more realistic (more markets,
no leverage tricks, no fictional liquidations, real trading costs), the flashy
numbers shrank toward the truth. That's the process working.

---

## 4. Current best config (honest, slippage-included)

**`VWAP · reversion · k1.5 · exit:band · 1×`**, 15m, 15 liquid markets, 5 bps slippage + 4.5 bps fees:

| Window | Return/day | Portfolio drawdown | Win rate |
|---|---|---|---|
| **In-sample** (fit on it) | ~0.49% | ~11% | 73% |
| **Out-of-sample** (unseen) | **~0.33%** (~10%/mo) | ~7% | 73% |

Saved in the backtest dashboard as group **"VWAP walk-forward · k1.5 exit:band 1x · 15 markets · 5bps slip"**.

**Caveats (important):**
- Only **15 of 20 markets** have a full ~52 days of 15m history (Hyperliquid caps
  15m data at ~5,000 candles ≈ 52 days; newer listings lack it).
- Out-of-sample was **15 days, one market regime.** It passed, but that's not
  proof it survives a strong trend or a crash, where mean-reversion gets hurt.
- With the app's **default risk limits** (see §8) the out-of-sample number drops
  to ~0.10%/day — thinner than the permissive-risk scripts suggested.
- Reversion favors choppy alts over trending majors (BTC/ETH were slight losers
  in this window).
- These figures used **5 bps** slippage. **§6 shows that realistic slippage
  (~10 bps) makes a broad basket roughly breakeven** — read §6 before trusting
  any of these numbers.

**Bottom line:** a real but modest diversified edge (~0.3–0.5%/day at 1×,
single-digit portfolio drawdown), *not* a 1%/day machine. 1%/day only ever
appeared via leverage or un-modeled liquidations. See **§6** for the honest
realistic-slippage picture, which is the most important part of this doc.

---

## 5. Why some coins win and others lose (cost vs. volatility)

To understand which markets suit the strategy, each coin was run **twice** — with
real costs and with zero costs — to separate the fee+slippage drag from the raw
edge, alongside a volatility measure (average absolute 15m price move). Config:
`reversion · k1.5 · exit:band`, 1×, 15m, ~50 days. Script: `worker/src/vwap-diagnose.ts`.

| Coin | Volatility (avg 15m move) | Trades | **Gross** (no costs) | Cost drag | **Net** |
|---|---|---|---|---|---|
| DYDX | 0.54% | 133 | +89.2% | −25.4% | **+63.9%** |
| INJ | 0.50% | 140 | +84.1% | −26.7% | **+57.4%** |
| OP | 0.38% | 125 | +66.0% | −23.8% | **+42.2%** |
| ARB | 0.33% | 131 | +66.0% | −24.9% | **+41.2%** |
| LINK | 0.25% | 136 | +57.2% | −25.9% | **+31.3%** |
| DOGE | 0.23% | 136 | +45.5% | −25.9% | **+19.6%** |
| LTC | 0.21% | 146 | +47.2% | −27.8% | **+19.4%** |
| AVAX | 0.28% | 130 | +34.1% | −24.8% | **+9.3%** |
| SOL | 0.26% | 135 | +26.6% | −25.7% | **+0.9%** |
| BNB | 0.18% | 139 | +24.3% | −26.5% | **−2.2%** |
| ETH | 0.21% | 132 | +20.8% | −25.2% | **−4.4%** |
| SEI | 0.35% | 116 | +12.5% | −22.1% | **−9.6%** |
| BTC | **0.17%** | 133 | +14.7% | −25.4% | **−10.6%** |

**Findings:**

1. **Cost drag is a flat ~25% on every coin**, large or small. It's simply
   `trades × round-trip cost` ≈ 130 × 0.19% ≈ 25% of equity. Every coin takes
   ~130 trades (they touch the bands at similar frequency), so fees+slippage are
   a **flat tax** — they don't single out large caps.

2. **The winner/loser split is entirely the GROSS edge, and gross tracks how far
   the coin swings.** Every coin is gross-profitable, but each must clear that
   flat ~25% tax. BTC moves only ~0.17%/candle → +14.7% gross → the tax sinks it
   to **−10.6%**. DYDX moves ~0.54%/candle → +89.2% gross → clears it easily →
   **+63.9%**. `net ≈ gross − 25%`.

3. **The real driver is *choppy* (mean-reverting) movement, not raw volatility.**
   - **SEI** — high volatility (0.35%) but only +12.5% gross: it **trended**, and
     reversion gets run over in a trend.
   - **LTC / DOGE** — low volatility (~0.2%) but strong winners: they **chop
     cleanly** around VWAP.

4. **Large caps (BTC/ETH/BNB) are the worst of both worlds** — small intraday
   range *and* they grind directionally.

**In plain English:** fees and slippage are a fixed ~25% toll no matter the coin.
Coins that swing far and keep snapping back (whippy alts) clear the toll with
room to spare; large caps barely move intraday, so the toll wipes out their thin
profit. Your intuition was right.

**Takeaway for market selection:**
- Drop **BTC/ETH/BNB** — structurally cost-negative for this strategy.
- Favor **high-volatility, range-bound alts** (DYDX, INJ, OP, ARB, LINK).
- A **volatility + chop filter** (recent 15m range above ~0.25% and not trending)
  would automate the curation.

---

## 6. Slippage — the make-or-break variable

This is the single most important part of the whole analysis. Because k1.5 takes
**~130 trades in 50 days**, the strategy pays trading costs 130 times — tiny
per-trade costs compound into a huge drag, so the slippage assumption decides
whether the strategy is real or fiction.

### You cannot just pick a low slippage number
Slippage isn't a free parameter you set — **it's set by the order book, not by
you.** The candle backtest has no order-book data (only open/high/low/close/
volume), so any slippage figure in it is an *assumption*. Dialing it low to get
more winners just makes the backtest lie. The real question is always: *at your
order size, would the order actually fill at that price?*

### Order size is everything
Hyperliquid's published slippage figures are for a **$100,000** market order:

| Tier | Slippage on a $100k order |
|---|---|
| Large cap (BTC/ETH) | 0.01–0.06% |
| Mid cap | 0.05–0.3% |
| Small/micro cap | 0.5–3%+ |

But we trade **$2,000** — 1/50th the size — which barely dents the book. A first
pass that wrongly applied the $100k small-cap figure (2.5%) to $2k orders showed
a total wipeout (1/51 coins green, −97% avg). That was simply the wrong order size.

### Measured reality: live order books
Walking the **actual live L2 depth** for a $2k market buy (script `vwap-slippage.ts`)
gives the real number, not an assumption: **42 of 55 coins fill at ≤0.05%.**
Examples: SOL 0.001%, BTC 0.002%, ETH 0.003%, INJ 0.023%, ARB 0.030%,
kPEPE 0.038%. Only genuinely thin coins bite: HMSTR 0.25%, ETHFI 0.18%, VINE 0.17%.

**Caveat:** this is a **calm-market snapshot.** Reversion trades fire during
*dislocations* — exactly when books are thinnest — so real fills at trade-time
are a few × worse. Only paper/live trading measures the true number.

### Realistic slippage for a $2k order

| Coin tier | Measured (calm) | Working number (with stress buffer) |
|---|---|---|
| Mega-liquid (BTC/ETH/SOL) | 0.001–0.003% | ~0.02% |
| Liquid alts ($30M+/day) | 0.005–0.03% | ~0.05% |
| Mid/small ($2–30M/day) | 0.02–0.05% | ~0.08–0.10% |
| Thin/micro | 0.13–0.25% | 0.30%+ — avoid |

**Honest working assumption for a mixed liquid+mid basket: 0.10% (10 bps).**
Never model below ~2 bps even for BTC.

### The result at 0.10% slippage (46 coins, script `vwap-broad.ts`)

**Avg gross +34% → avg net −2.7%, with 23/46 coins green — roughly breakeven.**

At realistic costs this is **not broadly profitable** — it's about flat across
the universe, dragged negative by trend-driven losers (ZEC −85%, XMR −70%,
BCH −38%).

**With flat slippage, liquidity no longer explains winners — chop vs. trend
does.** Every big loser *trended* (reversion gets run over in a trend); every
winner *chopped*. Mean-reversion prints when the market ranges and bleeds when it
trends.

20 coins netted ≥ +5% (avg +20%, ~0.43%/day: INJ, kPEPE, MET, ARB, OP, AERO,
ICP, APE, STRK, MON, …) — **but selecting those after the fact is overfitting.**
You can't know in advance which coins will chop, so the only honest broad number
is the ~breakeven −2.7%.

### Bottom line
At realistic slippage, VWAP reversion (k1.5) is a **real but fragile,
regime-dependent edge**: ~breakeven across a broad basket, profitable in chop,
losing in trends. Two things then improved the verdict — mid-cap focus and the
break-even test below.

### Update: mid-caps + the break-even test — it clears the bar

**Focusing on mid-cap alts (dropping the big low-vol coins like BTC/ETH) helped.**
On a 20-coin mid-cap basket at 10 bps: **+3.9%/month (in-sample), 14/20 coins
green (70%), ~15% drawdown.** A walk-forward check (fit on the first 35 days,
test on the unseen last 15) **held up** — it actually did a bit *better* on the
data it had never seen, which is the strongest sign it isn't just curve-fit.
(Scripts `vwap-sweep-final.ts`, `vwap-wf-midcap.ts`.)

**Then the key question: how much trading cost can it survive, and is the real
market below that?** Script `vwap-breakeven.ts` answered it two ways:

- **Break-even cost ≈ 0.13%.** The strategy makes money as long as buying/selling
  costs stay under ~0.13%. Above that it loses. (At 0.10% it makes ~4%/mo; at
  0.05%, ~11%/mo; at 0.25% it dies, −19%/mo.)
- **Real cost right now ≈ 0.04%.** Walking the live order books, a $2k order on
  these mid-caps actually costs ~0.04% on average (most 0.01–0.06%, worst ~0.12%).

**In plain English:** the strategy can handle a cost up to about 0.13%, and the
real market charges about 0.04% for our small order size — roughly a *third* of
the limit. So it fits, with room to spare.

**The catch:** that 0.04% is a calm-market reading. This strategy buys during
fast drops, when costs run 2–3× higher (~0.08–0.12%) — still under the 0.13%
limit, but the cushion gets thin exactly when it matters, and the thinnest coins
(e.g. ATOM ~0.12%) sit near the edge even in calm times.

**Verdict:** a **real, modest edge** — a few percent a month at 1× on liquid
mid-caps — that **does survive realistic costs**, with a real but not huge safety
margin. The only thing a candle backtest still can't prove is the live fill
quality during fast moves; a forward **paper-trade** on the live market is the
final confirmation before real money.

---

## 7. Dashboard bug that was inflating results (fixed)

A multi-market run group's headline **Net P&L** was reading from the **main
market only** (usually ETH, the first one) while the drawdown column averaged
across the whole basket. So a group full of losers could show **+36%** because
that was just ETH's return normalized to a month.

**Fix** (`strategies-dashboard.tsx`): the group headline now blends the whole
basket — total dollar P&L over total capital. Verified on a real group: the
misleading **+36%** became the true **−11.4%**.

**In plain English:** the scoreboard was showing your best player's stats as the
team score. Now it shows the actual team score.

---

## 8. Risk limits, slippage, and why numbers differ between tools

- **Slippage** is now supported and applied to every market order (entry *and*
  exit). Set it in the New Run modal ("Slippage (bps)"). We used **5 bps**.
- **Default risk limits** on a normal run: max position $5,000, 20% max-drawdown
  kill, $250 daily-loss halt. These *stop* trading when hit, which lowers returns.
  - Consequence: if your **order size is over $5,000, you'll see 0 trades** — the
    risk filter rejects every order. Keep order size at or under the max position.
  - The research **scripts** used *permissive* risk (limits off) to measure the
    strategy in isolation, so their numbers run higher than the UI's. The UI is
    the more realistic figure.

---

## 9. Leverage — why there's no "leverage" field

There is no separate leverage mechanism in the backtest. **Leverage = order size ÷ equity.**

- Equity $10,000, order size $10,000 → **1×**
- Equity $10,000, order size $20,000 → **2×**

A dedicated field would just divide two numbers you already type, so we didn't
add one (it was briefly added, then removed as redundant). Return *and* drawdown
scale linearly with it. Because the backtest has **no liquidation modeling**,
pushing leverage high is what produced the fake >100% drawdowns in §3d — so
treat high leverage in a backtest with suspicion.

---

## 10. Walk-forward validation (new feature)

**What it is:** the test that separates a real edge from a curve-fit. It splits
your history into two parts, "fits" the config on the first part (**train**),
then runs it untouched on the second part it never saw (**test / out-of-sample**).
If out-of-sample holds up, the edge is likely real.

**How to use it:** New Run modal → configure a strategy → **Walk-forward
validation** section → set the **Train split %** (default 70) → **Run
walk-forward**. It shows Train vs Test side by side with a verdict badge:

- **Holds up** — out-of-sample positive and close to training.
- **Weak** — positive but much lower than training (partial overfit).
- **Fails** — out-of-sample negative (curve-fit; don't trade it).

**Verified** end-to-end against real data: the server logic correctly splits the
window, runs both phases, blends the basket, computes portfolio drawdown, and
returns the verdict. (The UI was wired and typechecks; visual click-through was
pending a browser-extension reconnect at time of writing.)

Implementation: `runWalkForward` / `evaluateWalkForward` in
`src/lib/api/backtests.ts`; UI in `new-run-dialog.tsx`.

---

## 11. Performance fix

The strategy originally recomputed VWAP and its bands **3× per candle over a
400-bar window**. Since VWAP resets each UTC day, only the current day's candles
matter — so it now computes the bands **once per day-length window**. Identical
results, ~10× faster backtests (and faster in the live bot too). This is what
made the 20-market sweeps finish in seconds instead of minutes.

---

## 12. Research scripts (removed)

The analysis above was produced by a set of one-off headless scripts
(`worker/src/vwap-*.ts`) that ran the real engine against live data — parameter
sweeps, the cross-market overfit check, per-coin cost/volatility breakdown, live
order-book slippage measurement, break-even analysis, and walk-forward. They
hard-coded a database user id, so they were **deleted after the campaign** rather
than committed. The methodology is fully described in the sections above and can
be re-created if needed (fetch candles → run the shared engine → aggregate the
portfolio → persist via `createUserBacktest`).

The **sweep** (auto-trying ~100 configs × ~15 markets ≈ 1,500 backtests) is the
only genuinely heavy job; it isn't in the UI yet because it needs a background
worker to avoid timing out a browser request. Walk-forward *is* in the UI (§10).

---

## 13. Quick-start: reproduce the best config in the UI

New Run modal:

| Field | Value |
|---|---|
| Strategy | VWAP |
| Mode | Mean reversion (bands) |
| Interval | 15m |
| Band width (σ) | 1.5 |
| Exit target | Opposite band |
| Direction | Long & short |
| Order size (USD) | = your equity (for 1×), and ≤ $5,000 or raise the risk cap |
| Take profit / Stop loss | empty |
| Equity | e.g. 2,000 |
| Slippage | 5 bps |
| Additional markets | BTC, SOL, OP, ARB, LINK, DOGE, LTC, INJ, DYDX (+ ETH) |
| Window | ~50 days |

Then use **Walk-forward validation** to confirm it holds out-of-sample before
trusting it.
