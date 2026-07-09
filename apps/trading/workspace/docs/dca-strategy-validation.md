# DCA Ladder — Honest Validation (fixed fill engine)

July 9, 2026. After the take-profit fill bug was found and fixed (see
`back-testing-rule.md`, "Sanity-check fill prices"), every strategy was
re-judged on the fixed engine. The DCA ladder is the one that survived.

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

## Next steps (per back-testing-rule.md, never skip)

1. Measure real slippage/queue behavior at our order size on Hyperliquid.
2. Paper-trade the DCA ladder live (fake money, real prices) — the only test
   of real fill quality for a 1%-cycle strategy.
3. Only then consider live sizing.
