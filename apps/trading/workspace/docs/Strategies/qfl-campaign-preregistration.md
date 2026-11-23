# QFL campaign — pre-registration (26 July 2026)

Written and committed BEFORE the search runs. Nothing in here may change while
the campaign is running. If any of it changes, this campaign is void and a new
pre-registration is written. This exists because the previous attempt moved the
scoring rule, the basket and the split mid-run, which made every number it
produced meaningless.

## The sealed window

**2023-10-01 → 2025-01-01** (the 2024 bull run), 57 markets.

This window has **never been loaded** by any process. The searches that were
killed earlier only ever read their train and validate windows, so it is
genuinely untouched.

It will be read **once**, by **one** candidate, at the end. Whatever it prints is
the result — good, bad or flat.

## The windows the search may use

| Window | Dates | Purpose |
| --- | --- | --- |
| Train | 2020-11-01 → 2023-01-01 | Screen candidates. Covers the 2021 bull AND the 2022 bear, so a candidate that scores here has already faced both regimes. |
| Validate | 2023-01-01 → 2023-10-01 | Rank the shortlist. |

Ranking is by the **worse** of the two, so a candidate that only works in one is
rejected.

## Fixed before the run

- **Basket:** the 42 Binance perps with daily history to Oct 2020, split 2:1 by
  alphabetical position — 28 tuned on, 14 never tuned on — plus the 15 later
  listings. Train uses the 28; validate and the sealed window use all 57.
- **Costs:** 0.045% taker, 0.015% maker, 0.04% slippage. The sealed run is also
  reported at 0.08% slippage (stress).
- **Bet size:** 1×, no leverage, one shared wallet across the basket.
- **Scoring rule:** return capped at 8%/month, plus green-coin ratio, minus
  drawdown past 20%, minus a penalty below 60% of coins green. Hard reject on:
  any market down 90%+, fewer than 40 cycles, or portfolio drawdown past 60%.
- **Timeframes:** 1d and 4h, searched separately.

## What counts as a winner

From `../backtesting-guide.md`: **3–6%/month net of real costs, drawdown under
~20–30%, majority of the basket green** — measured on the sealed window, not on
anything the search could see.

Anything less than that is reported as what it is. A result of "this does not
clear the bar" is a complete answer and will be given plainly rather than
worked around.

## Amendment, 26 July 2026 — bar floor lowered to 200

The first launch of this campaign was **void**. `loadPhase` skipped any market
with fewer than 300 bars, and this split's validate window (Jan–Oct 2023) is only
273 daily candles — so it loaded ZERO markets, returned an empty result, and
"the worse of train and validate" collapsed to `min(train, 0) = 0` for every
candidate. All ~9,500 of them tied, and the ranking was effectively random.

Fixed by lowering the floor to 200 bars, and by making a window that loads zero
markets a hard error instead of an empty result. The 1d search was relaunched
from scratch. The 4h search was unaffected (a 9-month 4h window is ~1,600 bars)
and continued.

**The sealed window was not touched by any of this** — the void run never reached
the sealed stage — so it remains a clean single-shot test.

## Degrees of freedom, to be declared with the result

- Number of combinations tried
- Number of search restarts (target: zero)
- Number of candidates that touched the sealed window (target: one per timeframe)

## Known contamination, disclosed up front

The window 2025-09-01 → 2026-07-01 (the crash) was tested six times during the
previous undisciplined campaign. It is **burned** and cannot serve as a clean
test. If it is reported at all it will be labelled as already-seen.
