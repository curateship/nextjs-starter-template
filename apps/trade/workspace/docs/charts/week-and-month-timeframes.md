# Week and month timeframes

The chart's timeframe picker offers 1w (one week per candle) and 1M (one month
per candle) after 1d. Tyler asked for both on 10 Oct 2026.

**"1M" is the month and "1m" is the minute.** Trade already used "1m" for one
minute, and the saved choice in each browser is that exact string, so the month
could not take it. TradingView writes them the same way.

## Where the bars come from

No exchange is asked for week or month candles. The chart loads the same day
candles a 1d chart loads and adds them up:

- Each week runs Monday 00:00 to Sunday 23:59, in UTC, as on Binance and
  TradingView. Each month starts on the 1st, in UTC.
- A week's candle opens at Monday's open and closes at the last day's close.
  Its high is the highest day's high, its low the lowest day's low, and its
  volume is all the days' volume added together.
- The newest week or month is still going, so its candle holds only the days so
  far. That is what an exchange's own weekly candle shows too.
- The forming candle moves live. Today's day candle streams in as it always
  does, and the chart folds it into the week with the earlier days of that week.

Doing it this way means every exchange gets weeks and months the same day,
including the ones whose own API has no weekly or monthly candles, and nothing
new is stored. The day history already loads in full (see `candle-store.md`),
so a week chart reaches back as far as the day chart does. Switching between
1d, 1w and 1M on one market asks for nothing new, because all three share the
same day candles.

## What stays on day candles

Week and month are for reading the chart only. Everything that places orders
or judges rules bar by bar keeps the six exchange timeframes (1m to 1d):

- A DCA, grid or ladder window opened from a week or month chart starts on 1d.
- Backtests, the market scanner, line alerts and the strategy pickers do not
  offer 1w or 1M.
- The chart refreshes once a day, when the day candle closes, because that is
  when the week or month candle gains a finished day.
