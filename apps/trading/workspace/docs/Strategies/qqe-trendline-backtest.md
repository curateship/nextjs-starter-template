# QQE + Trendline Break backtest

Date: 2026-07-13

## Entry rule

The strategy never opens a trade while price is inside the trendlines. A trade
can start only when a completed four-hour candle closes above a falling
resistance line or below a rising support line. QQE only confirms that direction
and cannot open a trade on its own.

## Test shape

- 25 fixed Binance markets covering large, medium, and smaller coins
- Four-hour candles and a normal 1x account-sized position
- 0.045% taker fee, 0.015% maker fee, and 0.04% slippage
- A second final test with slippage doubled to 0.08%
- Training: 2022-07-01 to 2025-01-01
- Validation: 2025-01-01 to 2025-10-01
- Untouched final test: 2025-10-01 to 2026-07-01

## Locked settings

- QQE threshold: 6
- QQE smoothing: 5
- Trendline swing lookback: 30
- Break buffer: 0.1%
- QQE confirmation may be up to 48 candles old
- Stop loss: 5%

These settings were locked after validation and before the final period was
opened.

## Results

| Test                    | Total return | Monthly average | Green markets | Trades | Portfolio drawdown |
| ----------------------- | -----------: | --------------: | ------------: | -----: | -----------------: |
| Training                |       61.62% |           2.05% |         13/25 |    749 |             22.87% |
| Validation              |       19.55% |           2.18% |         13/25 |    230 |             13.49% |
| Final, normal costs     |       -0.46% |          -0.05% |         10/24 |    180 |              8.80% |
| Final, doubled slippage |       -0.82% |          -0.09% |          9/24 |    180 |              8.85% |
| QQE only, final         |      -31.53% |          -3.52% |          5/24 |    681 |             44.26% |

EOS had no candles in the final Binance cache, so that period used 24 markets.

## Decision

The trendline gate worked as a sideways-market filter: it cut final trades from
681 to 180 and reduced the loss and drawdown dramatically. It did not produce a
winning untouched final result, so this setup is not ready for live money and
must not be called a proven winner. Re-tuning against the final period would be
hindsight. The next honest step is forward paper trading or a genuinely new
future test period.

The normal and doubled-slippage final runs were saved to the backtests database.
