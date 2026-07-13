# QQE + Trendline Break backtest

Date: 2026-07-13

## Final rule

- QQE uses its verified settings and establishes the direction first.
- A trade opens only on the candle that closes through a confirmed trendline in
  the same direction. Nothing opens while price is inside the line.
- Each QQE signal can open at most one trade. Another line break cannot re-enter
  until QQE produces a fresh signal.
- A long stop is 0.25% below the broken resistance line. A short stop is 0.25%
  above the broken support line.
- There is no fixed take profit. The next raw opposite QQE signal closes the
  position, even if that signal occurs inside a QQE consolidation zone.

## Corrected trendline

The first version used one value for both swing importance and confirmation.
A 20-candle swing therefore needed 20 more four-hour candles to confirm, so the
line often appeared after the real break. It could also report a break on the
same candle the second anchor became known, even when price crossed earlier.

The final indicator separates the two jobs. Swing lookback controls how major an
anchor must be; confirmation bars controls how quickly it becomes usable. A
signal now requires a real crossing after both anchors are confirmed: the prior
close must be inside and the current close outside.

## Test shape

- Four-hour Binance candles
- 25 older primary markets for training and validation
- A separate 25-market alternate basket as the untouched final holdout
- One account-sized position per market, no leverage multiplier
- 0.045% taker fee, 0.015% maker fee, and 0.04% slippage
- Stress test with slippage doubled to 0.08%
- Training: 2022-07-01 to 2025-01-01
- Validation: 2025-01-01 to 2025-10-01
- Final holdout: 2025-10-01 to 2026-07-01

## Locked settings

- QQE threshold: 8
- QQE smoothing: 5
- QQE consolidation filter: on for entries
- Trendline swing lookback: 10 candles
- Trendline confirmation: 5 candles
- Break buffer: 0.1%
- QQE direction may be up to 24 candles old
- Trendline stop buffer: 0.25%
- Take profit: next opposite raw QQE signal

## Results

| Test | Total return | Monthly average | Green markets | Trades | Portfolio drawdown |
| --- | ---: | ---: | ---: | ---: | ---: |
| Training | 7.58% | 0.25% | 14/25 | 174 | 5.27% |
| Validation | 0.93% | 0.10% | 7/25 | 46 | 2.82% |
| Newer primary check | 0.14% | 0.02% | 6/24 | 44 | 2.13% |
| Untouched alternate holdout | **15.01%** | **1.67%** | 10/25 | 49 | 4.98% |
| Holdout, doubled slippage | **14.83%** | **1.65%** | 10/25 | 49 | 4.98% |
| Combined newer 49 markets | **7.73%** | **0.86%** | 16/49 | 93 | 2.22% |
| Combined, doubled slippage | **7.56%** | **0.84%** | 16/49 | 93 | 2.22% |
| QQE only, combined 49 | 15.74% | 1.76% | 26/49 | 445 | 13.17% |

EOS had no candles in the newer Binance cache, so the primary check used 24
markets and the combined view used 49.

## Decision

This is a winning setup, including on the untouched holdout and with doubled
slippage. The trendline gate reduced the combined trade count from 445 to 93,
cut portfolio drawdown from 13.17% to 2.22%, and removed all engine warnings.
QQE alone made more headline profit, but it produced three wipeout warnings and
a 164.37% worst single-market drawdown, so that result fails the credibility
rules.

The limitation is breadth: only 10 of 25 holdout markets and 16 of 49 combined
markets were green. The setup is profitable and much safer, but it does not meet
the preferred majority-green or 3–6% monthly targets. It should be paper-traded,
not treated as a proven live-money edge.

The normal and doubled-slippage alternate holdout runs are saved in the backtest
database. The campaign has position-aware raw QQE exits, one-use QQE latches,
and line-based stops that the current automation canvas cannot fully express, so
the saved configuration is research metadata until those rules are productized.
